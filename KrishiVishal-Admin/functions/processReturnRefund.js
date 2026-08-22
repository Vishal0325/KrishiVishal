/**
 * Firebase Cloud Function for Automated Refund Processing
 * Triggered on returns/{returnId} onUpdate
 * Handles payment gateway API calls (Razorpay/Stripe)
 * 
 * Deploy with: firebase deploy --only functions:processReturnRefund
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();
const db = admin.firestore();

// Environment variables (set in Firebase Cloud Functions configuration)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Razorpay API base URL
const RAZORPAY_API = 'https://api.razorpay.com/v1';

/**
 * MAIN CLOUD FUNCTION
 * Triggers on returns collection document update
 * Processes refunds when status changes to "COMPLETED"
 */
exports.processReturnRefund = functions
  .firestore
  .document('returns/{returnId}')
  .onUpdate(async (change, context) => {
    const returnId = context.params.returnId;
    const newData = change.after.data();
    const oldData = change.before.data();

    console.log(`[${returnId}] Return document updated`);
    console.log(`Status: ${oldData.status} → ${newData.status}`);

    // Only process if status changed to COMPLETED
    if (newData.status !== 'COMPLETED' || oldData.status === 'COMPLETED') {
      console.log(`[${returnId}] Skipping: Status not COMPLETED or already processed`);
      return null;
    }

    // Check if refund already processed
    if (newData.financials?.gatewayRefundId) {
      console.log(`[${returnId}] Refund already processed: ${newData.financials.gatewayRefundId}`);
      return null;
    }

    try {
      // Get order details
      const orderDoc = await db.collection('orders').doc(newData.orderId).get();
      if (!orderDoc.exists) {
        throw new Error(`Order not found: ${newData.orderId}`);
      }

      const orderData = orderDoc.data();
      const refundAmount = newData.financials.refundAmountInitiated || newData.financials.totalAmount;
      const gateway = orderData.paymentDetails.gateway;
      const transactionId = orderData.paymentDetails.transactionId;

      console.log(`[${returnId}] Processing refund:`, {
        orderId: newData.orderId,
        amount: refundAmount,
        gateway: gateway,
        transactionId: transactionId,
      });

      let refundResult;

      // Route to appropriate payment gateway
      switch (gateway.toUpperCase()) {
        case 'RAZORPAY':
          refundResult = await processRazorpayRefund(transactionId, refundAmount, returnId);
          break;

        case 'STRIPE':
          refundResult = await processStripeRefund(transactionId, refundAmount, returnId);
          break;

        case 'COD':
          // No payment gateway refund needed for COD
          refundResult = {
            success: true,
            gatewayRefundId: `cod_${returnId}`,
            message: 'COD order - no gateway refund needed',
          };
          break;

        default:
          throw new Error(`Unsupported gateway: ${gateway}`);
      }

      // Update return document with refund result
      if (refundResult.success) {
        await db.collection('returns').doc(returnId).update({
          'financials.gatewayRefundId': refundResult.gatewayRefundId,
          'financials.processedAt': admin.firestore.Timestamp.now(),
          'financials.refundAttempts': (newData.financials.refundAttempts || 0) + 1,
          'financials.lastRefundAttempt': admin.firestore.Timestamp.now(),
          adminNotes: `${newData.adminNotes}\n[SYSTEM] Refund processed successfully. Gateway ID: ${refundResult.gatewayRefundId}`,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        console.log(`[${returnId}] ✅ Refund successful:`, refundResult.gatewayRefundId);

        // Send notification to customer
        await sendRefundNotification(newData.userId, newData.orderId, refundAmount);
      } else {
        throw new Error(refundResult.error || 'Refund processing failed');
      }
    } catch (error) {
      console.error(`[${returnId}] ❌ Refund processing error:`, error.message);

      // Update return document with failure status
      try {
        await db.collection('returns').doc(returnId).update({
          status: 'REFUND_FAILED',
          'financials.refundAttempts': (newData.financials.refundAttempts || 0) + 1,
          'financials.lastRefundAttempt': admin.firestore.Timestamp.now(),
          'financials.failureReason': error.message,
          adminNotes: `${newData.adminNotes}\n[SYSTEM] Refund failed: ${error.message}. Will retry.`,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Log error for manual intervention
        await logRefundError(returnId, newData.orderId, error);

        console.log(`[${returnId}] Updated to REFUND_FAILED status`);
      } catch (updateError) {
        console.error(`[${returnId}] Failed to update return document:`, updateError);
      }
    }

    return null;
  });

/**
 * Process Razorpay refund
 * API: https://razorpay.com/docs/api/payments/refunds/
 */
async function processRazorpayRefund(paymentId, amount, returnId) {
  try {
    console.log(`[${returnId}] Processing Razorpay refund for payment: ${paymentId}`);

    const razorpayAuth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

    // Fetch payment details first
    const paymentResponse = await axios.get(
      `${RAZORPAY_API}/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Basic ${razorpayAuth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const payment = paymentResponse.data;
    console.log(`[${returnId}] Payment status: ${payment.status}, Amount: ${payment.amount}`);

    // Only process if payment was successful
    if (payment.status !== 'captured') {
      throw new Error(`Payment status is ${payment.status}, not captured`);
    }

    // Create refund
    const refundResponse = await axios.post(
      `${RAZORPAY_API}/payments/${paymentId}/refund`,
      {
        amount: Math.round(amount * 100), // Razorpay expects amount in paise
        notes: {
          returnId: returnId,
          reason: 'Customer return/cancellation',
        },
      },
      {
        headers: {
          Authorization: `Basic ${razorpayAuth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const refund = refundResponse.data;
    console.log(`[${returnId}] Razorpay refund created:`, refund.id);

    return {
      success: true,
      gatewayRefundId: refund.id,
      message: `Razorpay refund processed`,
    };
  } catch (error) {
    console.error(`[${returnId}] Razorpay refund error:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process Stripe refund
 * API: https://stripe.com/docs/api/refunds/create
 */
async function processStripeRefund(chargeId, amount, returnId) {
  try {
    console.log(`[${returnId}] Processing Stripe refund for charge: ${chargeId}`);

    // Create refund via Stripe API
    const refundResponse = await axios.post(
      'https://api.stripe.com/v1/refunds',
      new URLSearchParams({
        charge: chargeId,
        amount: Math.round(amount * 100), // Stripe expects amount in cents
        reason: 'requested_by_customer',
        metadata: {
          returnId: returnId,
        },
      }),
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const refund = refundResponse.data;
    console.log(`[${returnId}] Stripe refund created:`, refund.id);

    return {
      success: true,
      gatewayRefundId: refund.id,
      message: `Stripe refund processed`,
    };
  } catch (error) {
    console.error(`[${returnId}] Stripe refund error:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send refund notification to customer
 */
async function sendRefundNotification(userId, orderId, amount) {
  try {
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.warn(`User document not found: ${userId}`);
      return;
    }

    const userData = userDoc.data();
    const email = userData.email;

    console.log(`Sending refund notification to ${email} for order ${orderId}`);

    // Create notification document for in-app notification
    await db.collection('notifications').add({
      userId: userId,
      type: 'REFUND_PROCESSED',
      title: 'Refund Processed',
      message: `Your refund of ₹${amount} has been processed. It will reflect in your account within 5-7 business days.`,
      orderId: orderId,
      amount: amount,
      read: false,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // TODO: Send email notification
    // await sendEmailNotification(email, orderId, amount);

    // TODO: Send SMS notification
    // await sendSMSNotification(userData.phone, orderId, amount);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

/**
 * Log refund errors for manual intervention
 */
async function logRefundError(returnId, orderId, error) {
  try {
    await db.collection('refundErrors').add({
      returnId: returnId,
      orderId: orderId,
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.Timestamp.now(),
      status: 'PENDING_REVIEW',
    });

    console.log(`Error logged for manual review: ${returnId}`);
  } catch (e) {
    console.error('Failed to log error:', e);
  }
}

/**
 * UTILITY FUNCTION: Manual refund retry
 * Can be called via HTTP trigger or scheduled function
 */
exports.retryFailedRefunds = functions
  .pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      console.log('🔄 Starting failed refund retry job');

      // Find all REFUND_FAILED documents
      const failedReturns = await db
        .collection('returns')
        .where('status', '==', 'REFUND_FAILED')
        .where('financials.refundAttempts', '<', 3) // Max 3 attempts
        .get();

      console.log(`Found ${failedReturns.size} failed refunds to retry`);

      for (const doc of failedReturns.docs) {
        const returnData = doc.data();

        // Retry refund processing
        console.log(`Retrying refund for return: ${doc.id}`);

        // Manually trigger refund processing
        try {
          const orderDoc = await db.collection('orders').doc(returnData.orderId).get();
          const orderData = orderDoc.data();

          const gateway = orderData.paymentDetails.gateway;
          const transactionId = orderData.paymentDetails.transactionId;
          const refundAmount = returnData.financials.refundAmountInitiated;

          let refundResult;

          switch (gateway.toUpperCase()) {
            case 'RAZORPAY':
              refundResult = await processRazorpayRefund(transactionId, refundAmount, doc.id);
              break;
            case 'STRIPE':
              refundResult = await processStripeRefund(transactionId, refundAmount, doc.id);
              break;
            default:
              continue;
          }

          if (refundResult.success) {
            await db.collection('returns').doc(doc.id).update({
              status: 'COMPLETED',
              'financials.gatewayRefundId': refundResult.gatewayRefundId,
              'financials.processedAt': admin.firestore.Timestamp.now(),
              'financials.refundAttempts': returnData.financials.refundAttempts + 1,
              updatedAt: admin.firestore.Timestamp.now(),
            });

            console.log(`✅ Retry successful for ${doc.id}`);
          }
        } catch (e) {
          console.error(`Retry failed for ${doc.id}:`, e.message);
        }
      }

      console.log('✅ Refund retry job completed');
    } catch (error) {
      console.error('Refund retry job failed:', error);
    }
  });

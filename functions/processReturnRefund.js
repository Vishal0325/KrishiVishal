/**
 * Firebase Cloud Function for Automated Refund Processing
 * Triggered on returns/{returnId} onUpdate
 * Handles payment gateway API calls (Razorpay/Stripe)
 * 
 * Deploy with: firebase deploy --only functions:processReturnRefund
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const axios = require('axios');

if (!admin.apps.length) {
  admin.initializeApp();
}
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

    console.log('LOG:', `[${returnId}] Return document updated`);
    console.log('LOG:', `Status: ${oldData.status} → ${newData.status}`);

    // Only process if status changed to COMPLETED
    if (newData.status !== 'COMPLETED' || oldData.status === 'COMPLETED') {
      console.log('LOG:', `[${returnId}] Skipping: Status not COMPLETED or already processed`);
      return null;
    }

    // Check if refund already processed
    if (newData.financials?.gatewayRefundId) {
      console.log('LOG:', `[${returnId}] Refund already processed: ${newData.financials.gatewayRefundId}`);
      return null;
    }

    try {
      // Get order details
      const orderDoc = await db.collection('orders').doc(newData.orderId).get();
      if (!orderDoc.exists) {
        throw new Error(`Order not found: ${newData.orderId}`);
      }

      const orderData = orderDoc.data();
      const refundAmount = newData.financials?.refundAmountInitiated || newData.financials?.totalAmount || 0;
      const gateway = orderData.paymentDetails?.gateway || orderData.paymentMethod || 'COD';
      const transactionId = orderData.paymentDetails?.transactionId || orderData.transactionId || '';

      console.log('LOG:', `[${returnId}] Processing refund:`, {
        orderId: newData.orderId,
        amount: refundAmount,
        gateway: gateway,
        transactionId: transactionId,
      });

      let refundResult;

      // Route to appropriate payment gateway
      switch ((gateway || '').toUpperCase()) {
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

        console.log('LOG:', `[${returnId}] ✅ Refund successful:`, refundResult.gatewayRefundId);

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

        console.log('LOG:', `[${returnId}] Updated to REFUND_FAILED status`);
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
    console.log('LOG:', `[${returnId}] Processing Razorpay refund for payment: ${paymentId}`);

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
    console.log('LOG:', `[${returnId}] Payment status: ${payment.status}, Amount: ${payment.amount}`);

    // Only process if payment was successful
    if (payment.status !== 'captured') {
      throw new Error(`Payment status is ${payment.status}, not captured`);
    }

    // Create refund
    const refundResponse = await axios.post(
      `${RAZORPAY_API}/payments/${paymentId}/refund`,
      {
        amount: Math.round(amount * 100), // Razorpay expects amount in paise
        receipt: returnId, // Idempotency key for Razorpay
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
    console.log('LOG:', `[${returnId}] Razorpay refund created:`, refund.id);

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
    console.log('LOG:', `[${returnId}] Processing Stripe refund for charge: ${chargeId}`);

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
          'Idempotency-Key': returnId,
        },
      }
    );

    const refund = refundResponse.data;
    console.log('LOG:', `[${returnId}] Stripe refund created:`, refund.id);

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

    console.log('LOG:', `Sending refund notification to ${email} for order ${orderId}`);

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

    console.log('LOG:', `Error logged for manual review: ${returnId}`);
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

      console.log('LOG:', `Found ${failedReturns.size} failed refunds to retry`);

      for (const doc of failedReturns.docs) {
        const returnData = doc.data();

        // Retry refund processing
        console.log('LOG:', `Retrying refund for return: ${doc.id}`);

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

            console.log('LOG:', `✅ Retry successful for ${doc.id}`);
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

/**
 * CALLABLE FUNCTION: initiateRefund
 * Triggered from Admin Portal (Returns.jsx)
 * Supports both WALLET credit and GATEWAY processing with RBAC
 */
exports.initiateRefund = functions.https.onCall(async (data, context) => {
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true);
  const callerRole = context.auth?.token?.role;
  if (!context.auth || (!callerIsAdmin && !['SuperAdmin', 'FinanceAdmin', 'Admin'].includes(callerRole))) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Only Finance Admin or SuperAdmin can initiate refunds.');
  }

  const { returnId, refundAmount, refundDestination } = data;
  if (!returnId || !refundAmount || Number(refundAmount) <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid refund parameters.');
  }

  const parsedAmount = Number(refundAmount);
  const destination = refundDestination || 'WALLET';

  try {
    const returnRef = db.collection('returns').doc(returnId);
    const returnSnap = await returnRef.get();
    if (!returnSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Return request ${returnId} not found.`);
    }

    const returnData = returnSnap.data();
    const orderRef = db.collection('orders').doc(returnData.orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Order ${returnData.orderId} not found.`);
    }

    const orderData = orderSnap.data();
    const userId = returnData.userId || orderData.userId;

    if (destination === 'WALLET') {
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new functions.https.HttpsError('not-found', `User ${userId} not found.`);
        }

        // 1. Credit wallet
        transaction.update(userRef, {
          walletBalance: admin.firestore.FieldValue.increment(parsedAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Ledger entry in wallet_transactions
        const txRef = db.collection('wallet_transactions').doc();
        transaction.set(txRef, {
          transactionId: txRef.id,
          userId,
          amount: parsedAmount,
          type: 'CREDIT',
          category: 'REFUND',
          description: `Refund credited for return ${returnId}`,
          referenceId: returnId,
          orderId: returnData.orderId,
          actorId: context.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 3. Update return doc
        transaction.update(returnRef, {
          status: 'REFUNDED',
          'financials.refundAmountInitiated': parsedAmount,
          'financials.gatewayRefundId': `WALLET_${returnId}`,
          'financials.refundDestination': 'WALLET',
          'financials.processedAt': admin.firestore.FieldValue.serverTimestamp(),
          adminNotes: `${returnData.adminNotes || ''}\n[SYSTEM] Refund of ₹${parsedAmount} credited to customer wallet by ${context.auth.uid}.`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Update order doc
        transaction.update(orderRef, {
          refundStatus: 'REFUNDED',
          refundAmount: parsedAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 5. Audit log
        const auditRef = db.collection('audit_logs').doc();
        transaction.set(auditRef, {
          action: 'INITIATE_REFUND',
          resource: 'Return',
          resourceId: returnId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: {
            orderId: returnData.orderId,
            userId,
            amount: parsedAmount,
            destination: 'WALLET',
            actor: context.auth.uid
          }
        });
      });

      // Send notification
      await sendRefundNotification(userId, returnData.orderId, parsedAmount);

      return {
        success: true,
        refundId: `WALLET_${returnId}`,
        destination: 'WALLET',
        amount: parsedAmount
      };
    } else {
      // Gateway Refund
      const gateway = (orderData.paymentDetails?.gateway || 'COD').toUpperCase();
      const transactionId = orderData.paymentDetails?.transactionId || '';
      let gatewayResult = { success: true, gatewayRefundId: `GTW_${returnId}` };

      if (gateway === 'RAZORPAY' && transactionId && RAZORPAY_KEY_ID) {
        gatewayResult = await processRazorpayRefund(transactionId, parsedAmount, returnId);
      } else if (gateway === 'STRIPE' && transactionId && STRIPE_SECRET_KEY) {
        gatewayResult = await processStripeRefund(transactionId, parsedAmount, returnId);
      }

      if (gatewayResult.success) {
        await returnRef.update({
          status: 'REFUNDED',
          'financials.refundAmountInitiated': parsedAmount,
          'financials.gatewayRefundId': gatewayResult.gatewayRefundId,
          'financials.refundDestination': 'GATEWAY',
          'financials.processedAt': admin.firestore.FieldValue.serverTimestamp(),
          adminNotes: `${returnData.adminNotes || ''}\n[SYSTEM] Gateway refund processed: ${gatewayResult.gatewayRefundId}.`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await orderRef.update({
          refundStatus: 'REFUNDED',
          refundAmount: parsedAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('audit_logs').add({
          action: 'INITIATE_REFUND',
          resource: 'Return',
          resourceId: returnId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: {
            orderId: returnData.orderId,
            userId,
            amount: parsedAmount,
            destination: 'GATEWAY',
            gatewayRefundId: gatewayResult.gatewayRefundId,
            actor: context.auth.uid
          }
        });

        await sendRefundNotification(userId, returnData.orderId, parsedAmount);

        return {
          success: true,
          refundId: gatewayResult.gatewayRefundId,
          destination: 'GATEWAY',
          amount: parsedAmount
        };
      } else {
        throw new functions.https.HttpsError('internal', gatewayResult.error || 'Gateway refund failed');
      }
    }
  } catch (error) {
    console.error(`[${returnId}] initiateRefund Error:`, error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});


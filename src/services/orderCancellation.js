// services/orderCancellation.js
import { db } from '../firebase/config';
import { runTransaction, doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Production-grade order cancellation service for web admin
 * Uses Firestore transactions for data consistency
 */

export async function cancelOrderTransaction(orderId, userId, cancellationReason) {
  try {
    // [FIXED] Point #140 & #141: Moved order cancellation to a secure Cloud Function.
    // This ensures Role-based access control (RBAC) and atomic server-side processing.
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase/config');
    const cancelOrder = httpsCallable(functions, 'adminCancelOrder');

    const result = await cancelOrder({ orderId, reason: cancellationReason });
    return result.data;
  } catch (error) {
    return handleCancellationError(error);
  }
}

/**
 * Create post-delivery return request
 * This requires admin approval before refund
 */
export async function createPostDeliveryReturnTransaction(
  orderId,
  userId,
  productName,
  reason,
  proofImageUrls
) {
  try {
    const returnId = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await runTransaction(db, async (transaction) => {
      // Verify order exists and is DELIVERED
      const orderRef = doc(db, 'orders', orderId);
      const orderSnapshot = await transaction.get(orderRef);

      if (!orderSnapshot.exists()) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const orderData = orderSnapshot.data();
      if (orderData.status !== 'DELIVERED') {
        throw new Error(`CANNOT_RETURN_${orderData.status}`);
      }

      if (orderData.userId !== userId) {
        throw new Error('UNAUTHORIZED_RETURN');
      }

      const totalAmount = orderData.totalAmount;

      // Create return document
      // (returnId generated outside transaction to prevent duplicates on retry)
      const returnRef = doc(db, 'returns', returnId);

      const returnData = {
        id: returnId,
        orderId: orderId,
        userId: userId,
        productName: productName,
        reason: reason,
        proofUrls: proofImageUrls,
        status: 'PENDING',
        adminNotes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        financials: {
          totalAmount: totalAmount,
          refundAmountInitiated: 0,
          gatewayRefundId: '',
          processedAt: null,
        },
      };

      transaction.set(returnRef, returnData);

      // Update order
      transaction.update(orderRef, {
        returnPending: true,
        returnId: returnId,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        returnId: returnId,
        message: 'Return request submitted. Admin will review within 24-48 hours.',
      };
    });

    return result;
  } catch (error) {
    return handleCancellationError(error);
  }
}

/**
 * Admin approval of return with partial/full refund
 */
export async function approveReturnTransaction(
  returnId,
  approvalAmount,
  adminNotes
) {
  try {
    const result = await runTransaction(db, async (transaction) => {
      const returnRef = doc(db, 'returns', returnId);
      const returnSnapshot = await transaction.get(returnRef);

      if (!returnSnapshot.exists()) {
        throw new Error('RETURN_NOT_FOUND');
      }

      const returnData = returnSnapshot.data();

      // Update return status
      transaction.update(returnRef, {
        status: 'APPROVED',
        adminNotes: adminNotes,
        updatedAt: serverTimestamp(),
        'financials.refundAmountInitiated': approvalAmount,
      });

      // Update order
      const orderRef = doc(db, 'orders', returnData.orderId);
      transaction.update(orderRef, {
        returnApproved: true,
        approvalAmount: approvalAmount,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        message: `Return approved. Refund of ₹${approvalAmount} will be processed.`,
      };
    });

    return result;
  } catch (error) {
    return handleCancellationError(error);
  }
}

/**
 * Admin rejection of return
 */
export async function rejectReturnTransaction(returnId, rejectionReason) {
  try {
    const result = await runTransaction(db, async (transaction) => {
      const returnRef = doc(db, 'returns', returnId);
      const returnSnapshot = await transaction.get(returnRef);

      if (!returnSnapshot.exists()) {
        throw new Error('RETURN_NOT_FOUND');
      }

      const returnData = returnSnapshot.data();

      // Update return status
      transaction.update(returnRef, {
        status: 'REJECTED',
        adminNotes: rejectionReason,
        updatedAt: serverTimestamp(),
      });

      // Update order
      const orderRef = doc(db, 'orders', returnData.orderId);
      transaction.update(orderRef, {
        returnRejected: true,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        message: 'Return rejected. Customer has been notified.',
      };
    });

    return result;
  } catch (error) {
    return handleCancellationError(error);
  }
}

/**
 * Error handler with specific error codes
 */
function handleCancellationError(error) {
  console.error('Cancellation Error:', error.message);

  if (error.message.includes('ORDER_NOT_FOUND')) {
    return {
      success: false,
      code: '404',
      message: 'Order not found',
    };
  }

  if (error.message.includes('UNAUTHORIZED')) {
    return {
      success: false,
      code: '403',
      message: 'Unauthorized operation',
    };
  }

  if (error.message.includes('CANNOT_CANCEL')) {
    return {
      success: false,
      code: '422',
      message: `Order cannot be cancelled in its current status. ${error.message}`,
    };
  }

  if (error.message.includes('CANNOT_RETURN')) {
    return {
      success: false,
      code: '422',
      message: `Cannot return order in ${error.message.split('_')[2]} status. Only delivered orders can be returned.`,
    };
  }

  return {
    success: false,
    code: '500',
    message: error.message || 'Operation failed',
  };
}

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #141: Secure order cancellation via Cloud Function with RBAC.
 * Only SuperAdmin, OrderManager, or the Order Owner can cancel.
 */
exports.cancelOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }

  const { orderId, reason } = data;
  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId is required.');
  }

  const db = admin.firestore();
  const orderRef = db.collection('orders').doc(orderId);

  try {
    return await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Order not found.');
      }

      const orderData = orderDoc.data();
      const callerUid = context.auth.uid;
      const callerRole = context.auth.token.role || 'Viewer';
      const isCallerAdmin = context.auth.token.admin === true ||
                            context.auth.token.isAdmin === true ||
                            ['SuperAdmin', 'OrderManager', 'Admin', 'Operations'].includes(callerRole);
      const isOwner = orderData.userId === callerUid || orderData.customerId === callerUid;

      // RBAC Check
      if (!isOwner && !isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized to cancel this order.');
      }

      // Status Check
      const cancellableStatuses = ['PLACED', 'PENDING', 'CONFIRMED', 'PAYMENT_CONFIRMED'];
      if (!cancellableStatuses.includes(orderData.status)) {
        throw new functions.https.HttpsError('failed-precondition', `Cannot cancel order in ${orderData.status} status.`);
      }

      // 1. Update Order Status
      transaction.update(orderRef, {
        status: 'CANCELLED',
        cancellationReason: reason || 'Cancelled via Admin/App',
        cancellationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelled: true,
      });

      // 2. Audit Log
      const auditRef = db.collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'CANCEL_ORDER',
        resource: 'Order',
        resourceId: orderId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          reason,
          cancelledBy: callerUid,
          role: callerRole
        }
      });

      return { success: true, orderId };
    });
  } catch (error) {
    console.error('Cancel Order Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

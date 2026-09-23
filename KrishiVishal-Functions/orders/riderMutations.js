const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, admin } = require('../core/admin');
const { isAdminRequest } = require('../core/utils');

const REGION = 'asia-south1';

/**
 * Handles offline POD sync and other rider mutations securely.
 */
exports.riderMutations = onCall({ region: REGION, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    
    const role = (context.auth.token?.role || '').toLowerCase();
    const isRider = role === 'rider';
    if (!isRider) throw new HttpsError('permission-denied', 'Only riders can perform this action.');

    const { action, payload } = data;

    if (action === 'SYNC_POD') {
        const { orderId, updates } = payload;
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await orderRef.get();
        if (!snap.exists) throw new HttpsError('not-found', 'Order not found');
        if (snap.data().riderId !== context.auth.uid) throw new HttpsError('permission-denied', 'Not your order');

        // Only allow updating specific POD fields
        const safeUpdates = {};
        if (updates.status === 'DELIVERED') {
            safeUpdates.status = 'DELIVERED';
            safeUpdates.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
            if (updates.podPhotoUrl) safeUpdates.podPhotoUrl = updates.podPhotoUrl;
            if (updates.podSignatureUrl) safeUpdates.podSignatureUrl = updates.podSignatureUrl;
            if (updates.collectedCash !== undefined) safeUpdates.collectedCash = updates.collectedCash;
            if (updates.paymentStatus) safeUpdates.paymentStatus = updates.paymentStatus;
        } else if (updates.status === 'DELIVERY_FAILED' || updates.status === 'RTO_INITIATED' || updates.status === 'REATTEMPT_SCHEDULED') {
            safeUpdates.status = updates.status;
            safeUpdates.failureReason = updates.failureReason;
            safeUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
            if (updates.failurePhotoUrl) safeUpdates.failurePhotoUrl = updates.failurePhotoUrl;
            if (updates.ndrReason) safeUpdates.ndrReason = updates.ndrReason;
            if (updates.ndrNotes) safeUpdates.ndrNotes = updates.ndrNotes;
            
            const attemptLog = {
                riderId: context.auth.uid,
                reason: updates.ndrReason || updates.failureReason || "",
                notes: updates.ndrNotes || "",
                status: updates.status,
                timestamp: Date.now()
            };
            safeUpdates.attemptHistory = admin.firestore.FieldValue.arrayUnion(attemptLog);
            safeUpdates.lastAttemptAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        await orderRef.update(safeUpdates);
        return { success: true };

    } else if (action === 'REJECT_ORDER') {
        const { orderId, reason } = payload;
        const orderRef = db.collection('orders').doc(orderId);
        
        await db.runTransaction(async (t) => {
            const snap = await t.get(orderRef);
            if (!snap.exists) throw new HttpsError('not-found', 'Order not found');
            if (snap.data().riderId !== context.auth.uid) throw new HttpsError('permission-denied', 'Not your order');

            t.update(orderRef, {
                status: 'CONFIRMED',
                riderId: '',
                rejectionHistory: admin.firestore.FieldValue.arrayUnion({
                    riderId: context.auth.uid,
                    reason,
                    timestamp: Date.now()
                })
            });
        });
        return { success: true };

    } else if (action === 'DEPOSIT_CASH') {
        const { amount, ordersCount } = payload;
        const depositRef = db.collection('cash_deposits').doc();
        await depositRef.set({
            riderId: context.auth.uid,
            amount,
            ordersCount,
            status: 'PENDING_VERIFICATION',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, depositId: depositRef.id };
    } else if (action === 'UPDATE_RIDER_LOCATION') {
        const { orderId, lat, lng } = payload;
        if (orderId) {
            // we should ideally not update the order doc every 5 seconds, but to keep parity:
            await db.collection('orders').doc(orderId).update({
                riderLocation: new admin.firestore.GeoPoint(lat, lng),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        await db.collection('riders').doc(context.auth.uid).update({
            currentLat: lat,
            currentLng: lng,
            lastLocationUpdate: Date.now()
        });
        return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Unknown action');
});

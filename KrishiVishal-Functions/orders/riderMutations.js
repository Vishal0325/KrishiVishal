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
    } else if (action === 'DEPOSIT_RETURN_TO_HUB') {
        const { returnId, warehouseId } = payload;
        if (!returnId) throw new HttpsError('invalid-argument', 'returnId is required');

        const returnRef = db.collection('returns').doc(returnId);
        const returnSnap = await returnRef.get();
        if (!returnSnap.exists) throw new HttpsError('not-found', 'Return not found');

        const returnData = returnSnap.data();
        if (returnData.riderId !== context.auth.uid) throw new HttpsError('permission-denied', 'Not your return pickup');
        if (returnData.status !== 'PICKED_UP') {
            throw new HttpsError('failed-precondition', `Return is in '${returnData.status}' state, cannot deposit.`);
        }

        // Get commissionPerReturn from app_config/main
        let commission = 25.0;
        try {
            const configSnap = await db.collection('app_config').doc('main').get();
            if (configSnap.exists && configSnap.data().commissionPerReturn > 0) {
                commission = Number(configSnap.data().commissionPerReturn);
            }
        } catch (e) {
            console.warn('[DEPOSIT_RETURN_TO_HUB] Could not read app_config/main:', e.message);
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const effectiveWarehouse = warehouseId || returnData.warehouseId || 'HUB-SAM-001';

        await db.runTransaction(async (t) => {
            // 1. Update Return status to HUB_RECEIVED
            t.update(returnRef, {
                status: 'HUB_RECEIVED',
                hubDepositedAt: timestamp,
                hubDepositedWarehouseId: effectiveWarehouse,
                riderCommissionEarned: commission,
                adminNotes: admin.firestore.FieldValue.arrayUnion(`[SYSTEM] Return deposited at Hub (${effectiveWarehouse}) by Rider ${context.auth.uid} at ${new Date().toISOString()}. Earned ₹${commission} reverse commission.`),
                updatedAt: timestamp
            });

            // 2. Add payout record in rider_payouts for transparency
            const payoutRef = db.collection('rider_payouts').doc();
            t.set(payoutRef, {
                payoutId: payoutRef.id,
                riderId: context.auth.uid,
                type: 'RETURN_COMMISSION',
                amount: commission,
                returnId: returnId,
                orderId: returnData.orderId || '',
                description: `Commission for return pickup ${returnId}`,
                warehouseId: effectiveWarehouse,
                createdAt: timestamp
            });

            // 3. Log inventory inward in inventory_movements
            const movementRef = db.collection('inventory_movements').doc();
            t.set(movementRef, {
                movementId: movementRef.id,
                skuCode: returnData.skuCode || returnData.productId || 'UNKNOWN',
                productName: returnData.productName || 'Returned Product',
                quantity: returnData.quantity || 1,
                type: 'RETURN_INWARD_HOLD',
                fromLocation: `RIDER_${context.auth.uid}`,
                toLocation: `WAREHOUSE_${effectiveWarehouse}_HOLD`,
                referenceId: returnId,
                actorId: context.auth.uid,
                timestamp: timestamp
            });
        });

        console.log(`[DEPOSIT_RETURN_TO_HUB] Return ${returnId} deposited at ${effectiveWarehouse} by Rider ${context.auth.uid}. Commission: ₹${commission}`);
        return { success: true, commissionEarned: commission, status: 'HUB_RECEIVED' };
    } else if (action === 'REQUEST_PAYOUT') {
        const { amount, paymentMethod, upiId, bankDetails, notes } = payload;
        const riderId = context.auth.uid;

        if (!amount || typeof amount !== 'number' || amount < 100) {
            throw new HttpsError('invalid-argument', 'Minimum withdrawal amount is ₹100.');
        }

        const riderDoc = await db.collection('riders').doc(riderId).get();
        const riderData = riderDoc.exists ? riderDoc.data() : {};
        const riderName = riderData.name || 'Rider';
        const riderPhone = riderData.phone || '';

        // Check if there is already a PENDING payout request
        const pendingRequests = await db.collection('payout_requests')
            .where('riderId', '==', riderId)
            .where('status', '==', 'PENDING')
            .limit(1)
            .get();

        if (!pendingRequests.empty) {
            throw new HttpsError('already-exists', 'You already have a pending payout request. Please wait until it is processed.');
        }

        // Calculate available wallet balance for rider
        const deliveredOrdersSnap = await db.collection('orders')
            .where('riderId', '==', riderId)
            .where('status', '==', 'DELIVERED')
            .get();
        const deliveredCount = deliveredOrdersSnap.size;

        const returnsSnap = await db.collection('returns')
            .where('riderId', '==', riderId)
            .get();
        const completedReturnsCount = returnsSnap.docs.filter(d => {
            const st = d.data().status;
            return st === 'PICKED_UP' || st === 'HUB_RECEIVED' || st === 'COMPLETED' || st === 'REFUNDED';
        }).length;

        let commPerOrder = 20.0;
        let commPerReturn = 25.0;
        try {
            const configSnap = await db.collection('app_config').doc('main').get();
            if (configSnap.exists) {
                if (configSnap.data().commissionPerOrder > 0) commPerOrder = Number(configSnap.data().commissionPerOrder);
                if (configSnap.data().commissionPerReturn > 0) commPerReturn = Number(configSnap.data().commissionPerReturn);
            }
        } catch (e) {}

        const lifetimeEarnings = (deliveredCount * commPerOrder) + (completedReturnsCount * commPerReturn);

        // Sum transferred and pending payout requests
        const payoutsSnap = await db.collection('payout_requests')
            .where('riderId', '==', riderId)
            .get();
        
        let totalSettledAndPending = 0;
        payoutsSnap.forEach(d => {
            const st = d.data().status;
            if (st === 'TRANSFERRED' || st === 'PENDING') {
                totalSettledAndPending += Number(d.data().amount || 0);
            }
        });

        const availableBalance = Math.max(0, lifetimeEarnings - totalSettledAndPending);
        if (amount > availableBalance) {
            throw new HttpsError('failed-precondition', `Insufficient wallet balance. You have ₹${availableBalance.toFixed(0)} available to withdraw.`);
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const requestRef = db.collection('payout_requests').doc();
        
        const requestData = {
            id: requestRef.id,
            riderId,
            riderName,
            riderPhone,
            amount: Number(amount),
            paymentMethod: paymentMethod || 'UPI',
            upiId: upiId || riderData.upiId || '',
            bankDetails: bankDetails || {
                bankAccount: riderData.bankAccount || '',
                bankName: riderData.bankName || '',
                ifscCode: riderData.ifscCode || ''
            },
            notes: notes || '',
            status: 'PENDING', // PENDING, TRANSFERRED, REJECTED
            transactionRef: '',
            rejectionReason: '',
            requestedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await requestRef.set(requestData);

        // Update rider profile with last used UPI if provided
        if (upiId && upiId !== riderData.upiId) {
            await db.collection('riders').doc(riderId).update({
                upiId,
                updatedAt: timestamp
            }).catch(() => {});
        }

        console.log(`[REQUEST_PAYOUT] Rider ${riderId} (${riderName}) requested payout of ₹${amount} via ${paymentMethod}`);
        return { success: true, requestId: requestRef.id, message: 'Withdrawal request submitted successfully.' };
    } else if (action === 'REJECT_RETURN_AT_DOORSTEP') {
        const { returnId, reason, notes, photos } = payload;
        if (!returnId) throw new HttpsError('invalid-argument', 'returnId is required.');
        if (!reason) throw new HttpsError('invalid-argument', 'QC Rejection reason is required.');
        if (!photos || !Array.isArray(photos) || photos.length === 0) {
            throw new HttpsError('invalid-argument', 'At least 1 photo proof is mandatory for doorstep rejection.');
        }

        const returnRef = db.collection('returns').doc(returnId);
        const returnSnap = await returnRef.get();
        if (!returnSnap.exists) throw new HttpsError('not-found', 'Return request not found.');

        const returnData = returnSnap.data();
        if (returnData.riderId !== context.auth.uid) {
            throw new HttpsError('permission-denied', 'You are not assigned to this return pickup.');
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const safePhotos = photos.filter(p => typeof p === 'string' && p.startsWith('http'));

        await returnRef.update({
            status: 'REJECTED_AT_DOORSTEP',
            qcStatus: 'FAILED',
            isQcPassed: false,
            doorstepRejectionReason: reason,
            doorstepRejectionNotes: notes || '',
            qcPhotos: safePhotos,
            qcCompletedAt: timestamp,
            doorstepRejectedAt: timestamp,
            doorstepRejectedBy: context.auth.uid,
            adminNotes: admin.firestore.FieldValue.arrayUnion(
                `[SYSTEM] Return QC Rejected at Doorstep by Rider ${context.auth.uid} at ${new Date().toISOString()}. Reason: ${reason}. Notes: ${notes || 'N/A'}`
            ),
            updatedAt: timestamp
        });

        console.log(`[REJECT_RETURN_AT_DOORSTEP] Return ${returnId} QC Rejected at doorstep by Rider ${context.auth.uid}. Reason: ${reason}`);
        return { success: true, status: 'REJECTED_AT_DOORSTEP', message: 'Return QC rejected at doorstep.' };
    }

    throw new HttpsError('invalid-argument', 'Unknown action');
});

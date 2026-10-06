const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { postLedgerEntry } = require("./ledger");

const REGION = 'asia-south1';
const ALLOWED_ROLES = ['hubmanager', 'admin', 'superadmin'];

/**
 * Validates if the authenticated caller has one of the allowed roles:
 * ['HubManager', 'Admin', 'SuperAdmin']
 * Checks both token custom claims and users/{uid}.role
 */
async function isAuthorizedSettler(auth) {
    if (!auth || !auth.uid) return false;

    // 1. Check custom claims
    const claimRole = auth.token && auth.token.role ? String(auth.token.role).toLowerCase() : null;
    if (claimRole && ALLOWED_ROLES.includes(claimRole)) {
        return true;
    }
    if (auth.token && (auth.token.admin === true || auth.token.isAdmin === true)) {
        return true;
    }

    // 2. Check users/{uid} document in Firestore
    try {
        const userDoc = await db.collection("users").doc(auth.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data() || {};
            const userRole = userData.role ? String(userData.role).toLowerCase() : null;
            if (userRole && ALLOWED_ROLES.includes(userRole)) {
                return true;
            }
            if (userData.isAdmin === true || userData.admin === true) {
                return true;
            }
        }
    } catch (e) {
        console.error("Error reading user role for settlement authorization:", e);
    }

    return false;
}

/**
 * confirmCashSettlement
 * Callable function to confirm two-way cash settlement at the physical hub.
 * Role required: HubManager, Admin, SuperAdmin.
 */
exports.confirmCashSettlement = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const auth = request.auth;

    if (!auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const authorized = await isAuthorizedSettler(auth);
    if (!authorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Caller must have role: HubManager, Admin, or SuperAdmin.');
    }

    const settlementId = data.settlementId;
    if (!settlementId || typeof settlementId !== 'string' || settlementId.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Valid settlementId is required.');
    }

    const cleanSettlementId = settlementId.trim();
    const settlementRef = db.collection("cash_settlements").doc(cleanSettlementId);

    const settlementSnap = await settlementRef.get();
    if (!settlementSnap.exists) {
        throw new HttpsError('not-found', `Settlement ${cleanSettlementId} not found.`);
    }

    const settlementData = settlementSnap.data() || {};
    if (settlementData.status !== 'PENDING_VERIFICATION') {
        throw new HttpsError(
            'failed-precondition',
            `Settlement is not in PENDING_VERIFICATION state. Current status: ${settlementData.status}`
        );
    }

    const { riderId, totalAmount, pendingOrderIds = [] } = settlementData;
    const amount = Number(totalAmount || 0);

    try {
        await db.runTransaction(async (transaction) => {
            // PHASE 1: ALL READS FIRST (Strict Firestore transaction rule)
            const currentSettlementSnap = await transaction.get(settlementRef);
            if (!currentSettlementSnap.exists) {
                throw new Error("Settlement document does not exist.");
            }
            const currentSettlement = currentSettlementSnap.data();
            if (currentSettlement.status !== 'PENDING_VERIFICATION') {
                throw new Error(`Settlement already processed. Current status: ${currentSettlement.status}`);
            }

            let riderSnap = null;
            let riderRef = null;
            if (riderId) {
                riderRef = db.collection("riders").doc(riderId);
                riderSnap = await transaction.get(riderRef);
            }

            // PHASE 2: ALL WRITES
            // a. Update settlement doc: status: 'CONFIRMED', confirmedBy, confirmedAt
            transaction.update(settlementRef, {
                status: 'CONFIRMED',
                confirmedBy: auth.uid,
                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // b. Update all orders in pendingOrderIds: isCashDeposited: true, cashDepositedAt, settlementId
            for (const orderId of pendingOrderIds) {
                const orderRef = db.collection("orders").doc(orderId);
                transaction.update(orderRef, {
                    isCashDeposited: true,
                    cashDepositedAt: admin.firestore.FieldValue.serverTimestamp(),
                    settlementId: cleanSettlementId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // c. Update rider document (riders/{riderId}): cashInHand: 0, lastSettlementAt
            if (riderRef) {
                if (riderSnap && riderSnap.exists) {
                    transaction.update(riderRef, {
                        cashInHand: 0,
                        lastSettlementAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastSettlementId: cleanSettlementId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    transaction.set(riderRef, {
                        id: riderId,
                        cashInHand: 0,
                        lastSettlementAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastSettlementId: cleanSettlementId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            }

            // d. Post double-entry ledger entries using existing ledger.js
            if (amount > 0) {
                postLedgerEntry(transaction, {
                    account: 'CASH_IN_HAND',
                    type: 'CREDIT',
                    amount: amount,
                    description: `Hub Cash Settlement for Rider ${riderId}`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId }
                });

                postLedgerEntry(transaction, {
                    account: 'BANK_ACCOUNT',
                    type: 'DEBIT',
                    amount: amount,
                    description: `Hub Cash Settlement for Rider ${riderId} banked`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId }
                });
            }
        });

        console.log(`[confirmCashSettlement] Settlement ${cleanSettlementId} confirmed by ${auth.uid} for Rider ${riderId}`);
        return {
            success: true,
            settlementId: cleanSettlementId,
            status: 'CONFIRMED',
            amount
        };
    } catch (error) {
        console.error(`[confirmCashSettlement] Transaction failed for settlement ${cleanSettlementId}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

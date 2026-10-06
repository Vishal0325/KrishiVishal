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

    const { riderId, pendingOrderIds = [] } = settlementData;
    const totalCollected = Number(settlementData.totalCollected ?? settlementData.totalAmount ?? 0);
    
    // Partial deposit handling
    let depositedAmount = totalCollected;
    if (data.depositedAmount !== undefined && data.depositedAmount !== null) {
        depositedAmount = Number(data.depositedAmount);
        if (isNaN(depositedAmount) || depositedAmount < 0) {
            throw new HttpsError('invalid-argument', 'depositedAmount must be a non-negative number.');
        }
    }

    const shortage = Math.max(0, totalCollected - depositedAmount);
    const finalStatus = shortage > 0 ? 'SETTLED_WITH_SHORTAGE' : 'CONFIRMED';
    const hubId = data.hubId || settlementData.hubId || 'HUB_CENTRAL';
    const verifiedBy = data.verifiedBy || auth.uid;

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
            // a. Update settlement doc: status, depositedAmount, shortage, totalCollected
            transaction.update(settlementRef, {
                status: finalStatus,
                totalCollected: totalCollected,
                depositedAmount: depositedAmount,
                shortage: shortage,
                hubId: hubId,
                confirmedBy: auth.uid,
                verifiedBy: verifiedBy,
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

            // c. Update rider document (riders/{riderId}): cashInHand: 0, pendingShortageAmount, lastSettlementAt
            if (riderRef) {
                const riderUpdates = {
                    cashInHand: 0,
                    lastSettlementAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastSettlementId: cleanSettlementId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                if (shortage > 0) {
                    riderUpdates.pendingShortageAmount = admin.firestore.FieldValue.increment(shortage);
                }

                if (riderSnap && riderSnap.exists) {
                    transaction.update(riderRef, riderUpdates);
                } else {
                    transaction.set(riderRef, {
                        id: riderId,
                        ...riderUpdates,
                        pendingShortageAmount: shortage
                    }, { merge: true });
                }
            }

            // d. Post Double-Entry Ledger Entries
            if (shortage > 0) {
                // 3-Leg Double-Entry Transaction
                // Leg 1 (Debit): HUB_CASH_VAULT -> depositedAmount
                if (depositedAmount > 0) {
                    postLedgerEntry(transaction, {
                        account: 'HUB_CASH_VAULT',
                        type: 'DEBIT',
                        amount: depositedAmount,
                        description: `Hub Cash Vault Receipt for Settlement ${cleanSettlementId} (Rider: ${riderId})`,
                        referenceId: cleanSettlementId,
                        referenceType: 'CASH_SETTLEMENT',
                        metadata: { settlementId: cleanSettlementId, riderId, hubId, shortage, totalCollected }
                    });
                }

                // Leg 2 (Debit): RIDER_SHORTAGE_RECEIVABLE -> shortage
                postLedgerEntry(transaction, {
                    account: 'RIDER_SHORTAGE_RECEIVABLE',
                    type: 'DEBIT',
                    amount: shortage,
                    description: `Cash Shortage Receivable from Rider ${riderId} on Settlement ${cleanSettlementId}`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId, hubId, shortage, totalCollected }
                });

                // Leg 3 (Credit): RIDER_CASH_IN_HAND -> totalCollected
                postLedgerEntry(transaction, {
                    account: 'RIDER_CASH_IN_HAND',
                    type: 'CREDIT',
                    amount: totalCollected,
                    description: `Rider ${riderId} Cash-in-Hand Cleared for Settlement ${cleanSettlementId}`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId, hubId, shortage, totalCollected }
                });
            } else if (totalCollected > 0) {
                // Standard 2-Leg Full Settlement
                postLedgerEntry(transaction, {
                    account: 'HUB_CASH_VAULT',
                    type: 'DEBIT',
                    amount: totalCollected,
                    description: `Hub Cash Settlement for Rider ${riderId}`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId, hubId }
                });

                postLedgerEntry(transaction, {
                    account: 'RIDER_CASH_IN_HAND',
                    type: 'CREDIT',
                    amount: totalCollected,
                    description: `Hub Cash Settlement for Rider ${riderId} cleared`,
                    referenceId: cleanSettlementId,
                    referenceType: 'CASH_SETTLEMENT',
                    metadata: { settlementId: cleanSettlementId, riderId, hubId }
                });
            }
        });

        console.log(`[confirmCashSettlement] Settlement ${cleanSettlementId} confirmed as ${finalStatus} by ${auth.uid} for Rider ${riderId} (Deposited: ₹${depositedAmount}, Shortage: ₹${shortage})`);
        return {
            success: true,
            settlementId: cleanSettlementId,
            status: finalStatus,
            totalCollected,
            depositedAmount,
            shortage
        };
    } catch (error) {
        console.error(`[confirmCashSettlement] Transaction failed for settlement ${cleanSettlementId}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

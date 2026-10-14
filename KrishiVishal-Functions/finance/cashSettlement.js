const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");

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
 * Migrated to System 2 Double-Entry Accounting (Rules 1-5 compliant).
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

    let settlementSnap = await settlementRef.get();
    if (!settlementSnap.exists) {
        if (data.riderId) {
            const deposited = Number(data.depositedAmount ?? 0);
            const shortageVal = Number(data.shortageAmount ?? data.shortage ?? 0);
            const totalColl = Number(data.totalCollected ?? (deposited + shortageVal));
            await settlementRef.set({
                id: cleanSettlementId,
                riderId: data.riderId,
                hubId: data.hubId || 'HUB_CENTRAL',
                totalCollected: totalColl,
                totalAmount: totalColl,
                status: 'PENDING_VERIFICATION',
                pendingOrderIds: data.pendingOrderIds || [],
                notes: data.notes || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            settlementSnap = await settlementRef.get();
        } else {
            throw new HttpsError('not-found', `Settlement ${cleanSettlementId} not found.`);
        }
    }

    const settlementData = settlementSnap.data() || {};
    if (settlementData.status !== 'PENDING_VERIFICATION' && settlementData.status !== 'PENDING') {
        throw new HttpsError(
            'failed-precondition',
            `Settlement is not in pending state. Current status: ${settlementData.status}`
        );
    }

    const { riderId = data.riderId, pendingOrderIds = data.pendingOrderIds || [] } = settlementData;
    const totalCollected = Number(settlementData.totalCollected ?? settlementData.totalAmount ?? (Number(data.depositedAmount || 0) + Number(data.shortageAmount || data.shortage || 0)));
    
    // Partial deposit handling
    let depositedAmount = totalCollected;
    if (data.depositedAmount !== undefined && data.depositedAmount !== null) {
        depositedAmount = Number(data.depositedAmount);
        if (isNaN(depositedAmount) || depositedAmount < 0) {
            throw new HttpsError('invalid-argument', 'depositedAmount must be a non-negative number.');
        }
    }

    const shortage = (data.shortageAmount !== undefined && data.shortageAmount !== null)
        ? Math.max(0, Number(data.shortageAmount))
        : Math.max(0, totalCollected - depositedAmount);
    const finalStatus = shortage > 0 ? 'SETTLED_WITH_SHORTAGE' : 'CONFIRMED';
    const hubId = data.hubId || settlementData.hubId || 'HUB_CENTRAL';
    const verifiedBy = data.verifiedBy || auth.uid;

    try {
        let executionResult = null;
        await db.runTransaction(async (transaction) => {
            // PHASE 1: ALL READS FIRST (Strict Firestore transaction rule 1)
            const currentSettlementSnap = await transaction.get(settlementRef);
            if (!currentSettlementSnap.exists) {
                throw new Error("Settlement document does not exist.");
            }
            const currentSettlement = currentSettlementSnap.data();
            if (currentSettlement.status !== 'PENDING_VERIFICATION' && currentSettlement.status !== 'PENDING') {
                throw new Error(`Settlement already processed. Current status: ${currentSettlement.status}`);
            }

            let riderSnap = null;
            let riderRef = null;
            if (riderId) {
                riderRef = db.collection("riders").doc(riderId);
                riderSnap = await transaction.get(riderRef);
            }

            // PHASE 2: SYSTEM 2 JOURNAL ENTRY (Zero caller writes before postJournalEntry - Rule 2)
            let jeResult = null;
            const now = new Date();
            const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (totalCollected > 0) {
                const entryId = shortage > 0
                    ? `JE_HUB_SETTLEMENT_SHORTAGE_${cleanSettlementId}`
                    : `JE_HUB_SETTLEMENT_${cleanSettlementId}`;

                const lines = [];
                if (shortage > 0) {
                    if (depositedAmount > 0) {
                        lines.push({ accountCode: '1020_HUB_CASH_VAULT', debit: depositedAmount, credit: 0 });
                    }
                    lines.push({ accountCode: '1015_RIDER_RECEIVABLE_SHORTAGES', debit: shortage, credit: 0 });
                    lines.push({ accountCode: '1010_CASH_IN_HAND_RIDERS', debit: 0, credit: totalCollected });
                } else {
                    lines.push({ accountCode: '1020_HUB_CASH_VAULT', debit: totalCollected, credit: 0 });
                    lines.push({ accountCode: '1010_CASH_IN_HAND_RIDERS', debit: 0, credit: totalCollected });
                }

                jeResult = await postJournalEntry({
                    entryId,
                    refType: 'COD_SETTLEMENT',
                    refId: cleanSettlementId,
                    periodId,
                    date: new Date(),
                    memo: shortage > 0
                        ? `Hub cash settlement with shortage for rider ${riderId} (Settlement: ${cleanSettlementId})`
                        : `Hub cash settlement confirmed for rider ${riderId} (Settlement: ${cleanSettlementId})`,
                    lines,
                    createdBy: auth.uid
                }, transaction);

                // RULE 3: Replay idempotency guard
                if (jeResult && (jeResult.alreadyProcessed || jeResult.alreadyExists)) {
                    executionResult = {
                        success: true,
                        settlementId: cleanSettlementId,
                        status: finalStatus,
                        totalCollected,
                        depositedAmount,
                        shortage,
                        alreadyProcessed: true
                    };
                    return;
                }
            }

            // PHASE 3: ALL CALLER WRITES STAGED STRICTLY AFTER postJournalEntry (Rule 5)
            // a. Update settlement doc: status, depositedAmount, shortage, totalCollected
            transaction.update(settlementRef, {
                status: finalStatus,
                totalCollected: totalCollected,
                depositedAmount: depositedAmount,
                shortage: shortage,
                hubId: hubId,
                confirmedBy: auth.uid,
                verifiedBy: verifiedBy,
                journalEntryId: jeResult ? jeResult.entryId : null,
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

            // c. Update rider document (riders/{riderId}): cash_in_hand: 0, pendingShortageAmount, lastSettlementAt
            if (riderRef) {
                const riderUpdates = {
                    cash_in_hand: 0,
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

            // d. Write audit entry to root collection rider_transactions
            if (riderId) {
                const rtId = `RT_${riderId}_SETTLE_${cleanSettlementId}`;
                const rtRef = db.collection("rider_transactions").doc(rtId);
                transaction.set(rtRef, {
                    id: rtId,
                    riderId: riderId,
                    amount: depositedAmount,
                    depositedAmount: depositedAmount,
                    shortageAmount: shortage,
                    category: "CASH_DEPOSITED",
                    effectOnCashInHand: -totalCollected,
                    effectOnNetPayable: 0,
                    cashInHandAfter: 0,
                    netPayableAfter: Number(riderSnap?.data()?.netPayable || 0),
                    referenceId: cleanSettlementId,
                    journalEntryId: jeResult ? jeResult.entryId : null,
                    idempotencyKey: `RT_SETTLE_${cleanSettlementId}`,
                    narrative: shortage > 0
                        ? `Cash settlement deposited ₹${depositedAmount} at hub, shortage recorded ₹${shortage}`
                        : `Cash settlement deposited ₹${depositedAmount} in full at hub`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            executionResult = {
                success: true,
                settlementId: cleanSettlementId,
                status: finalStatus,
                totalCollected,
                depositedAmount,
                shortage,
                journalEntryId: jeResult ? jeResult.entryId : null
            };
        });

        console.log(`[confirmCashSettlement] Settlement ${cleanSettlementId} confirmed as ${finalStatus} by ${auth.uid} for Rider ${riderId} (Deposited: ₹${depositedAmount}, Shortage: ₹${shortage})`);
        return executionResult;
    } catch (error) {
        console.error(`[confirmCashSettlement] Transaction failed for settlement ${cleanSettlementId}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * KrishiVishal Rider Payout & Commission Engine
 * Automated calculation, validation, cash settlement lock, and double-entry ledger posting.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("../finance/generalLedger");

const REGION = 'asia-south1';
const ALLOWED_PAYOUT_ROLES = ['hubmanager', 'admin', 'superadmin', 'ordermanager', 'financeadmin'];

/**
 * Validates caller role for payout generation.
 */
function requirePayoutRole(auth) {
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const token = auth.token || {};
    const role = (token.role || '').toLowerCase();
    const isAuthorized = token.admin === true ||
        token.isAdmin === true ||
        token.isSuperAdmin === true ||
        ALLOWED_PAYOUT_ROLES.includes(role);

    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only HubManager, Admin, or SuperAdmin can manage rider payouts.');
    }
}

/**
 * Calculates earnings and penalties for a single order.
 * Pure function for deterministic testing and reuse.
 *
 * Rules:
 * 1. Base Delivery Earning: ₹30 per successfully delivered order (status == "DELIVERED").
 * 2. Heavy Item Allowance: If total weight > 10 kg, +₹15 per order.
 * 3. Rural Distance Surcharge: If distance from hub > 12 km, +₹5 per km.
 * 4. Fake Attempt Penalty: If fake attempt (e.g. marked CUSTOMER_UNAVAILABLE > 75m away), -₹20 penalty.
 */
function calculateOrderEarnings(order) {
    const isDelivered = (order.status || '').toUpperCase() === 'DELIVERED';
    
    // 1. Base Delivery
    const baseEarning = isDelivered ? 30 : 0;

    // 2. Heavy Item Allowance (> 10 kg)
    let totalWeight = Number(order.totalWeightKg || order.weightKg || 0);
    if (!totalWeight && Array.isArray(order.items)) {
        totalWeight = order.items.reduce((sum, item) => {
            const itemWeight = Number(item.weightKg || item.weight || 0);
            const qty = Number(item.quantity || item.qty || 1);
            return sum + (itemWeight * qty);
        }, 0);
    }
    const isHeavy = isDelivered && totalWeight > 10;
    const heavyAllowance = isHeavy ? 15 : 0;

    // 3. Rural Distance Surcharge (> 12 km)
    const distanceKm = Number(order.distanceKm || order.deliveryDistanceKm || order.distance || 0);
    let distanceSurcharge = 0;
    if (isDelivered && distanceKm > 12) {
        const extraKm = distanceKm - 12;
        distanceSurcharge = Math.round(extraKm * 5 * 100) / 100;
    }

    // 4. Fake Attempt Penalty (-₹20)
    // Rider marked "CUSTOMER_UNAVAILABLE" without being in 75m range of customer coordinates
    const attemptDistance = Number(order.distanceToCustomerAtAttempt ?? order.attemptDistance ?? order.distanceFromCustomer ?? 0);
    const isCustomerUnavailable = (order.status || '').toUpperCase() === 'CUSTOMER_UNAVAILABLE';
    const isFakeAttempt = order.fakeAttempt === true ||
        order.isFakeAttempt === true ||
        order.fakeAttemptPenalty === true ||
        (isCustomerUnavailable && attemptDistance > 75) ||
        order.outOfRangeAttempt === true;

    const penalty = isFakeAttempt ? 20 : 0;

    return {
        orderId: order.id || order.orderId,
        isDelivered,
        totalWeight,
        distanceKm,
        baseEarning,
        heavyAllowance,
        distanceSurcharge,
        penalty,
        grossEarning: baseEarning + heavyAllowance + distanceSurcharge,
        netEarning: Math.max(0, (baseEarning + heavyAllowance + distanceSurcharge) - penalty),
        isFakeAttempt
    };
}

/**
 * Calculates aggregate rider payout and evaluates cash settlement lock.
 * Pure function for testing and core business logic.
 *
 * Cash Settlement Lock:
 * - Check if all cash/COD orders in the date range have settlementStatus == "SETTLED" or isCashSettled == true.
 * - Check if any cash settlement record is pending/unverified or has mismatch.
 * - If pending/mismatch: status = "ON_HOLD_CASH_MISMATCH", settlementVerified = false.
 * - Else: status = "PENDING_APPROVAL", settlementVerified = true.
 */
function calculateRiderPayout({
    riderId,
    riderName,
    hubId,
    startDate,
    endDate,
    orders = [],
    deliveredOrderIds = [],
    cashSettlements = [],
    rider = {},
    pendingShortageAmount = 0,
    baseRate = 0,
    grossPayoutAmount: directGross = 0,
    grossAmount = 0
}) {
    let baseEarnings = 0;
    let heavyAllowances = 0;
    let distanceSurcharges = 0;
    let penalties = 0;
    let deliveredCount = 0;
    let fakeAttemptsCount = 0;

    const evaluatedOrders = orders.map(order => {
        const evalResult = calculateOrderEarnings(order);
        baseEarnings += evalResult.baseEarning;
        heavyAllowances += evalResult.heavyAllowance;
        distanceSurcharges += evalResult.distanceSurcharge;
        penalties += evalResult.penalty;
        if (evalResult.isDelivered) deliveredCount++;
        if (evalResult.isFakeAttempt) fakeAttemptsCount++;
        return {
            ...order,
            ...evalResult
        };
    });

    // Check Cash Settlements Lock
    let hasCashMismatch = false;

    // A. Check cash settlements collection for this rider
    for (const settlement of cashSettlements) {
        const status = (settlement.status || '').toUpperCase();
        if (status === 'PENDING_VERIFICATION' || status === 'MISMATCH' || status === 'PENDING' || status !== 'CONFIRMED') {
            hasCashMismatch = true;
            break;
        }
    }

    // B. Check individual COD / Cash orders
    for (const order of orders) {
        const paymentMethod = (order.paymentMethod || (order.isCod ? 'COD' : '')).toUpperCase();
        const isDelivered = (order.status || '').toUpperCase() === 'DELIVERED';
        if (isDelivered && (paymentMethod === 'COD' || paymentMethod === 'CASH')) {
            const isSettled = order.isCashSettled === true || (order.settlementStatus || '').toUpperCase() === 'SETTLED';
            if (!isSettled) {
                hasCashMismatch = true;
                break;
            }
        }
    }

    let grossEarnings = Math.round((baseEarnings + heavyAllowances + distanceSurcharges) * 100) / 100;
    if (grossEarnings === 0 && (baseRate > 0 || directGross > 0 || grossAmount > 0)) {
        grossEarnings = Number(baseRate || directGross || grossAmount || 0);
    }
    const grossPayoutAmount = Math.max(0, Math.round((grossEarnings - penalties) * 100) / 100);

    // Shortage Clawback / Deduction Logic
    const pendingShortage = Number(rider?.pendingShortageAmount ?? pendingShortageAmount ?? 0);
    const shortageToDeduct = Math.min(grossPayoutAmount, pendingShortage);
    const netPayable = Math.max(0, Math.round((grossPayoutAmount - shortageToDeduct) * 100) / 100);
    const netPayoutAmount = netPayable;

    const settlementVerified = !hasCashMismatch;
    const status = settlementVerified ? 'PENDING_APPROVAL' : 'ON_HOLD_CASH_MISMATCH';

    return {
        riderId,
        riderName: riderName || `Rider ${riderId}`,
        hubId,
        startDate,
        endDate,
        totalOrders: orders.length,
        deliveredOrdersCount: deliveredCount,
        fakeAttemptsCount,
        baseEarnings,
        heavyAllowances,
        distanceSurcharges,
        penalties,
        grossEarnings,
        grossPayoutAmount,
        pendingShortageAmount: pendingShortage,
        shortageDeducted: shortageToDeduct,
        netPayable,
        netPayoutAmount,
        status,
        settlementVerified,
        orders: evaluatedOrders
    };
}

/**
 * Core business logic for generating weekly payouts for a specific hub.
 */
async function generateHubWeeklyRiderPayouts(hubId, startDate, endDate, generatedBy = 'SYSTEM') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid startDate or endDate format.');
    }

    // 1. Fetch Orders for the Hub in Date Range
    const ordersSnap = await db.collection("orders")
        .where("destinationHubId", "==", hubId)
        .get();

    let orderDocs = ordersSnap.docs;
    if (orderDocs.length === 0) {
        const altSnap = await db.collection("orders").where("hubId", "==", hubId).get();
        orderDocs = altSnap.docs;
    }

    // 2. Fetch Cash Settlements for Hub in Date Range
    const settlementsSnap = await db.collection("cash_settlements")
        .where("hubId", "==", hubId)
        .get();

    const settlementsByRider = {};
    settlementsSnap.docs.forEach(doc => {
        const data = doc.data();
        const rId = data.riderId;
        if (rId) {
            if (!settlementsByRider[rId]) settlementsByRider[rId] = [];
            settlementsByRider[rId].push({ id: doc.id, ...data });
        }
    });

    // 3. Filter and Group Orders by Rider
    const ordersByRider = {};
    const riderNames = {};

    orderDocs.forEach(doc => {
        const data = doc.data();
        const rId = data.assignedRiderId || data.riderId;
        if (!rId) return;

        const orderDate = data.deliveredAt?.toDate ? data.deliveredAt.toDate() :
            (data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || data.date || Date.now()));

        if (orderDate >= start && orderDate <= end) {
            if (!ordersByRider[rId]) ordersByRider[rId] = [];
            ordersByRider[rId].push({ id: doc.id, ...data });
            if (data.riderName) riderNames[rId] = data.riderName;
        }
    });

    const generatedPayouts = [];
    const batch = db.batch();

    for (const [riderId, riderOrders] of Object.entries(ordersByRider)) {
        let name = riderNames[riderId];
        let riderData = {};

        try {
            const riderDoc = await db.collection("riders").doc(riderId).get();
            if (riderDoc.exists) {
                riderData = riderDoc.data() || {};
                if (!name) name = riderData.name || riderData.displayName;
            }
        } catch (rErr) {
            console.warn(`Could not fetch rider doc for ${riderId}`);
        }

        if (!name) {
            try {
                const userDoc = await db.collection("users").doc(riderId).get();
                if (userDoc.exists) {
                    name = userDoc.data().name || userDoc.data().displayName;
                }
            } catch (err) {
                console.warn(`Could not fetch rider name from users for ${riderId}`);
            }
        }

        const riderSettlements = settlementsByRider[riderId] || [];
        const payoutCalc = calculateRiderPayout({
            riderId,
            riderName: name || `Rider ${riderId}`,
            hubId,
            startDate,
            endDate,
            orders: riderOrders,
            cashSettlements: riderSettlements,
            rider: riderData,
            pendingShortageAmount: Number(riderData.pendingShortageAmount || 0)
        });

        const safeStart = startDate.replace(/[^a-zA-Z0-9]/g, '');
        const safeEnd = endDate.replace(/[^a-zA-Z0-9]/g, '');
        const payoutId = `PAYOUT_${hubId}_${riderId}_${safeStart}_${safeEnd}`;

        const payoutDocRef = db.collection("rider_payouts").doc(payoutId);
        const payoutPayload = {
            payoutId,
            ...payoutCalc,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            generatedBy: generatedBy
        };

        batch.set(payoutDocRef, payoutPayload);
        generatedPayouts.push(payoutPayload);
    }

    if (generatedPayouts.length > 0) {
        await batch.commit();
    }

    return {
        success: true,
        hubId,
        startDate,
        endDate,
        totalRidersProcessed: generatedPayouts.length,
        payouts: generatedPayouts
    };
}

/**
 * Callable Function: generateWeeklyRiderPayouts
 * Parameters: { hubId: string, startDate: string, endDate: string }
 * Generates payout documents in collection rider_payouts/{payoutId}
 */
const generateWeeklyRiderPayouts = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requirePayoutRole(request.auth);

    const { hubId, startDate, endDate } = request.data || {};
    if (!hubId || !startDate || !endDate) {
        throw new HttpsError('invalid-argument', 'Missing required fields: hubId, startDate, and endDate.');
    }

    try {
        const result = await generateHubWeeklyRiderPayouts(hubId, startDate, endDate, request.auth.uid);
        return result;
    } catch (err) {
        throw new HttpsError('invalid-argument', err.message);
    }
});

/**
 * Scheduled Function: generateWeeklyRiderPayoutsSchedule
 * Runs automatically every Monday at 09:00 AM IST.
 * Scans preceding week (Monday 00:00 to Sunday 23:59:59) and creates draft payout batches.
 */
const generateWeeklyRiderPayoutsSchedule = onSchedule({
    schedule: "0 9 * * 1",
    timeZone: "Asia/Kolkata",
    region: REGION,
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    console.log("[generateWeeklyRiderPayoutsSchedule] Starting automated Monday 09:00 IST rider payout batch generation...");
    const now = new Date();
    const end = new Date(now);
    end.setHours(0, 0, 0, 0); // Today 00:00
    const start = new Date(end);
    start.setDate(start.getDate() - 7); // Preceding Monday 00:00

    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const hubsSnap = await db.collection("warehouses").get();
    const hubs = hubsSnap.empty ? ['wh_samastipur'] : hubsSnap.docs.map(d => d.id);

    const results = [];
    for (const hubId of hubs) {
        try {
            const res = await generateHubWeeklyRiderPayouts(hubId, startDateStr, endDateStr, 'SYSTEM_SCHEDULER');
            results.push({ hubId, ...res });
        } catch (hubErr) {
            console.error(`[generateWeeklyRiderPayoutsSchedule] Failed for hub ${hubId}:`, hubErr);
        }
    }

    console.log(`[generateWeeklyRiderPayoutsSchedule] Completed payout batch run across ${hubs.length} hubs.`);
    return { success: true, processedHubs: results.length, details: results };
});

/**
 * Callable Function: approveRiderPayout
 * Parameters: { payoutId: string, paymentMode?: string, referenceNo?: string }
 * Role required: Admin, SuperAdmin, FinanceAdmin
 * Transitions status to "PAID" and posts double-entry ledger entries.
 */
const approveRiderPayout = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requirePayoutRole(request.auth);

    const { payoutId, paymentMode = 'NEFT', referenceNo } = request.data || {};
    if (!payoutId) {
        throw new HttpsError('invalid-argument', 'Missing required field: payoutId.');
    }

    const payoutRef = db.collection("rider_payouts").doc(payoutId);

    try {
        let executionResult = null;
        await db.runTransaction(async (transaction) => {
            // PHASE 1: ALL READS FIRST (Strict Firestore transaction Rule 1)
            const payoutSnap = await transaction.get(payoutRef);
            if (!payoutSnap.exists) {
                throw new HttpsError('not-found', `Payout record ${payoutId} not found.`);
            }

            const payoutData = payoutSnap.data() || {};

            if (payoutData.status === 'ON_HOLD_CASH_MISMATCH') {
                throw new HttpsError(
                    'failed-precondition',
                    `Cannot approve payout ${payoutId}: Cash settlement mismatch or pending settlement exists for this rider.`
                );
            }

            if (payoutData.status === 'PAID') {
                throw new HttpsError('already-exists', `Payout ${payoutId} is already paid.`);
            }

            const riderId = payoutData.riderId;
            let riderSnap = null;
            let riderRef = null;
            if (riderId) {
                riderRef = db.collection("riders").doc(riderId);
                riderSnap = await transaction.get(riderRef);
            }

            const riderData = (riderSnap && riderSnap.exists) ? (riderSnap.data() || {}) : {};
            const grossEarnings = Number(payoutData.grossPayoutAmount ?? payoutData.grossEarnings ?? payoutData.netPayable ?? 0);
            const riderPendingShortage = Number(riderData.pendingShortageAmount ?? payoutData.pendingShortageAmount ?? 0);

            // Single point of shortage deduction:
            // If grossEarnings >= pendingShortageAmount: deduct full shortage, remaining = 0
            // If grossEarnings < pendingShortageAmount: deduct up to gross earnings, remaining shortage carried forward in 1015 (zero negative bank payout)
            const shortageToDeduct = Math.min(grossEarnings, Math.max(0, riderPendingShortage));
            const tdsAmount = Number(payoutData.tdsAmount || 0);
            const netPayout = Math.max(0, Math.round((grossEarnings - shortageToDeduct - tdsAmount) * 100) / 100);

            // PHASE 2: SYSTEM 2 JOURNAL ENTRY (Zero caller writes before postJournalEntry - Rule 2)
            let jeResult = null;
            const now = new Date();
            const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const entryId = `JE_RIDER_WEEKLY_PAYOUT_${payoutId}`;

            if (grossEarnings > 0) {
                const lines = [
                    { accountCode: '2015_RIDER_PAYOUTS_PAYABLE', debit: grossEarnings, credit: 0 }
                ];
                if (shortageToDeduct > 0) {
                    lines.push({ accountCode: '1015_RIDER_RECEIVABLE_SHORTAGES', debit: 0, credit: shortageToDeduct });
                }
                if (tdsAmount > 0) {
                    lines.push({ accountCode: '2050_TDS_PAYABLE_194C', debit: 0, credit: tdsAmount });
                }
                if (netPayout > 0) {
                    lines.push({ accountCode: '1030_BANK_CURRENT_HDFC', debit: 0, credit: netPayout });
                }

                jeResult = await postJournalEntry({
                    entryId,
                    refType: 'RIDER_PAYOUT',
                    refId: payoutId,
                    periodId,
                    date: new Date(),
                    memo: `Weekly payout disbursed for rider ${riderId} (${payoutData.riderName || ''}) - Net ₹${netPayout}`,
                    lines,
                    createdBy: request.auth.uid
                }, transaction);

                // RULE 3: Replay idempotency guard
                if (jeResult && (jeResult.alreadyProcessed || jeResult.alreadyExists)) {
                    executionResult = {
                        success: true,
                        payoutId,
                        status: 'PAID',
                        grossEarnings,
                        shortageDeducted: shortageToDeduct,
                        netPayable: netPayout,
                        netPayoutAmount: netPayout,
                        paymentMode,
                        alreadyProcessed: true
                    };
                    return;
                }
            }

            // PHASE 3: ALL CALLER WRITES STAGED STRICTLY AFTER postJournalEntry (Rule 5)
            // a. If shortage was deducted, reduce rider's pendingShortageAmount
            if (shortageToDeduct > 0 && riderRef) {
                transaction.update(riderRef, {
                    pendingShortageAmount: admin.firestore.FieldValue.increment(-shortageToDeduct),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // b. Mark Payout as PAID
            transaction.update(payoutRef, {
                status: 'PAID',
                paymentMode,
                paymentReferenceNo: referenceNo || `REF_${Date.now()}`,
                grossEarnings: grossEarnings,
                grossPayoutAmount: grossEarnings,
                shortageDeducted: shortageToDeduct,
                netPayable: netPayout,
                netPayoutAmount: netPayout,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                approvedBy: request.auth.uid,
                journalEntryId: jeResult ? jeResult.entryId : null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // c. Write audit entry to root collection rider_transactions
            if (riderId) {
                const rtId = `RT_${riderId}_PAYOUT_${payoutId}`;
                const rtRef = db.collection("rider_transactions").doc(rtId);
                transaction.set(rtRef, {
                    id: rtId,
                    riderId: riderId,
                    amount: netPayout,
                    netPayoutAmount: netPayout,
                    grossAmount: grossEarnings,
                    shortageDeducted: shortageToDeduct,
                    category: "WEEKLY_PAYOUT_DISBURSED",
                    effectOnCashInHand: 0,
                    effectOnNetPayable: -grossEarnings,
                    cashInHandAfter: Number(riderData.cash_in_hand ?? riderData.cashInHand ?? 0),
                    netPayableAfter: 0,
                    referenceId: payoutId,
                    journalEntryId: jeResult ? jeResult.entryId : null,
                    idempotencyKey: `RT_PAYOUT_${payoutId}`,
                    narrative: `Weekly payout disbursed ₹${netPayout} via ${paymentMode}` + (shortageToDeduct > 0 ? ` (shortage deducted ₹${shortageToDeduct})` : ''),
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            executionResult = {
                success: true,
                payoutId,
                status: 'PAID',
                grossEarnings,
                shortageDeducted: shortageToDeduct,
                netPayable: netPayout,
                netPayoutAmount: netPayout,
                paymentMode,
                journalEntryId: jeResult ? jeResult.entryId : null
            };
        });

        return executionResult;
    } catch (error) {
        if (error instanceof HttpsError) {
            throw error;
        }
        console.error(`[approveRiderPayout] Transaction failed for payout ${payoutId}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

module.exports = {
    calculateOrderEarnings,
    calculateRiderPayout,
    generateWeeklyRiderPayouts,
    generateWeeklyRiderPayoutsSchedule,
    generateHubWeeklyRiderPayouts,
    approveRiderPayout
};

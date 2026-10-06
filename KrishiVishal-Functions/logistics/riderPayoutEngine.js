/**
 * KrishiVishal Rider Payout & Commission Engine
 * Automated calculation, validation, cash settlement lock, and double-entry ledger posting.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { postLedgerEntry } = require("../finance/ledger");

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
function calculateRiderPayout({ riderId, riderName, hubId, startDate, endDate, orders = [], cashSettlements = [] }) {
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

    const grossEarnings = Math.round((baseEarnings + heavyAllowances + distanceSurcharges) * 100) / 100;
    const netPayable = Math.max(0, Math.round((grossEarnings - penalties) * 100) / 100);

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
        netPayable,
        status,
        settlementVerified,
        orders: evaluatedOrders
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

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new HttpsError('invalid-argument', 'Invalid startDate or endDate format.');
    }

    // 1. Fetch Orders for the Hub in Date Range
    // Orders may have hubId or destinationHubId or warehouseId
    const ordersSnap = await db.collection("orders")
        .where("destinationHubId", "==", hubId)
        .get();

    // Also support fallback query if destinationHubId has 0 results
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

        // Check date
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
        // Look up rider name if not found in orders
        let name = riderNames[riderId];
        if (!name) {
            try {
                const userDoc = await db.collection("users").doc(riderId).get();
                if (userDoc.exists) {
                    name = userDoc.data().name || userDoc.data().displayName;
                }
            } catch (err) {
                console.warn(`Could not fetch rider name for ${riderId}`);
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
            cashSettlements: riderSettlements
        });

        const safeStart = startDate.replace(/[^a-zA-Z0-9]/g, '');
        const safeEnd = endDate.replace(/[^a-zA-Z0-9]/g, '');
        const payoutId = `PAYOUT_${hubId}_${riderId}_${safeStart}_${safeEnd}`;

        const payoutDocRef = db.collection("rider_payouts").doc(payoutId);
        const payoutPayload = {
            payoutId,
            ...payoutCalc,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            generatedBy: request.auth.uid
        };

        batch.set(payoutDocRef, payoutPayload);
        generatedPayouts.push(payoutPayload);
    }

    await batch.commit();

    return {
        success: true,
        hubId,
        startDate,
        endDate,
        totalRidersProcessed: generatedPayouts.length,
        payouts: generatedPayouts
    };
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
    const payoutSnap = await payoutRef.get();

    if (!payoutSnap.exists) {
        throw new HttpsError('not-found', `Payout record ${payoutId} not found.`);
    }

    const payoutData = payoutSnap.data();

    if (payoutData.status === 'ON_HOLD_CASH_MISMATCH') {
        throw new HttpsError(
            'failed-precondition',
            `Cannot approve payout ${payoutId}: Cash settlement mismatch or pending settlement exists for this rider.`
        );
    }

    if (payoutData.status === 'PAID') {
        throw new HttpsError('already-exists', `Payout ${payoutId} is already paid.`);
    }

    const netPayable = Number(payoutData.netPayable || 0);

    // 1. Post Double-Entry Ledger Entries
    if (netPayable > 0) {
        try {
            await postLedgerEntry({
                account: 'DELIVERY_EXPENSE',
                type: 'DEBIT',
                amount: netPayable,
                referenceId: payoutId,
                referenceType: 'RIDER_PAYOUT',
                idempotencyKey: `PAYOUT_DR_${payoutId}`,
                description: `Rider payout: ${payoutData.riderName} (${payoutData.riderId}) for ${payoutData.startDate} to ${payoutData.endDate}`
            });

            await postLedgerEntry({
                account: 'BANK_ACCOUNT',
                type: 'CREDIT',
                amount: netPayable,
                referenceId: payoutId,
                referenceType: 'RIDER_PAYOUT',
                idempotencyKey: `PAYOUT_CR_${payoutId}`,
                description: `Bank disbursement (${paymentMode}) for Rider payout: ${payoutId}`
            });
        } catch (ledgerErr) {
            console.error(`Ledger posting error for payout ${payoutId}:`, ledgerErr);
            throw new HttpsError('internal', `Failed to post ledger entries: ${ledgerErr.message}`);
        }
    }

    // 2. Mark Payout as PAID
    await payoutRef.update({
        status: 'PAID',
        paymentMode,
        paymentReferenceNo: referenceNo || `REF_${Date.now()}`,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: request.auth.uid
    });

    return {
        success: true,
        payoutId,
        status: 'PAID',
        netPayable,
        paymentMode
    };
});

module.exports = {
    calculateOrderEarnings,
    calculateRiderPayout,
    generateWeeklyRiderPayouts,
    approveRiderPayout
};

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { razorpayKeySecret, razorpayKeyId, getSecretVal } = require("../core/secrets");
const walletService = require("./walletService");

const REGION = 'asia-south1';
const isWalletTopUpEnabled = () => process.env.ENABLE_WALLET_TOPUP === "true"; // Default false
const MAX_ADMIN_ADJUSTMENT = 5000;

/**
 * Role gating helper for Admin adjustments: strictly SuperAdmin or FinanceAdmin.
 * Blanket admin (role: 'admin', admin: true) is explicitly denied.
 */
function isAuthorizedAdmin(context) {
    if (!context || !context.auth) return false;
    const token = context.auth.token || {};
    const role = String(token.role || '').trim();
    const normalizedRole = role.toLowerCase().replace(/[-_]/g, '');

    const isPermittedRole = normalizedRole === 'superadmin' || normalizedRole === 'financeadmin';
    const hasPermittedFlag = token.superadmin === true || token.finance_admin === true || token.super_admin === true;

    return isPermittedRole || hasPermittedFlag;
}

/**
 * 60-second time-window deterministic fallback hash for unkeyed admin adjustments.
 * Includes adminUid, targetUid, type, amount, cleanReason, and 60-second time slot.
 */
function deriveTimeWindowKey(adminUid, targetUid, amount, type, reason) {
    const windowSlot = Math.floor(Date.now() / 60000);
    const raw = `${adminUid || 'UNKNOWN'}_${targetUid}_${type}_${amount}_${reason.trim()}_${windowSlot}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return `KEY_ADMIN_ADJ_${targetUid}_${windowSlot}_${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// createWalletTopUpOrder
//   Step 1: Customer requests a top-up. We create a Razorpay Order
//   and return the orderId to the app so the SDK can open the payment sheet.
// ─────────────────────────────────────────────────────────────────────────────
exports.createWalletTopUpOrder = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    if (!isWalletTopUpEnabled()) {
        throw new HttpsError('failed-precondition', 'WALLET_TOPUP_DISABLED: Customer wallet top-up is temporarily disabled.');
    }

    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { amount } = data; // Amount in INR (e.g. 500)
    if (typeof amount !== 'number' || amount < 10 || amount > 100000) {
        throw new HttpsError('invalid-argument', 'Amount must be between ₹10 and ₹1,00,000.');
    }

    const keyId = getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID');
    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new HttpsError('internal', 'Payment gateway not configured.');

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    // Create a pending top-up record for idempotency tracking
    const topUpRef = db.collection('wallet_topups').doc();
    const topUpId = topUpRef.id;

    const rzpOrder = await rzp.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        receipt: `wt_${topUpId}`,
        notes: {
            userId: context.auth.uid,
            topUpId: topUpId,
            type: 'WALLET_TOP_UP'
        }
    });

    // Persist pending top-up
    await topUpRef.set({
        id: topUpId,
        userId: context.auth.uid,
        amount: amount,
        razorpayOrderId: rzpOrder.id,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        razorpayOrderId: rzpOrder.id,
        topUpId: topUpId,
        amount: amount,
        keyId: keyId,
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyWalletTopUp
//   Step 2: After Razorpay payment, verify signature + atomically credit wallet.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyWalletTopUp = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    if (!isWalletTopUpEnabled()) {
        throw new HttpsError('failed-precondition', 'WALLET_TOPUP_DISABLED: Customer wallet top-up is temporarily disabled.');
    }

    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { topUpId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    if (!topUpId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new HttpsError('invalid-argument', 'Missing payment verification details.');
    }

    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');
    if (!keySecret) throw new HttpsError('internal', 'Payment gateway not configured.');

    // 1. Verify HMAC Signature
    const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(razorpaySignature))) {
        throw new HttpsError('invalid-argument', 'Payment signature verification failed.');
    }

    // 2. Fetch top-up doc
    const topUpRef = db.collection('wallet_topups').doc(topUpId);
    const topUpSnap = await topUpRef.get();

    if (!topUpSnap.exists) throw new HttpsError('not-found', 'Top-up record not found.');
    const topUpData = topUpSnap.data();

    // 3. Ownership check
    if (topUpData.userId !== context.auth.uid) {
        throw new HttpsError('permission-denied', 'Unauthorized top-up verification.');
    }

    // 4. Idempotency check
    if (topUpData.status === 'COMPLETED') {
        return { success: true, alreadyProcessed: true };
    }

    // 5. Verify Razorpay Order ID matches
    if (topUpData.razorpayOrderId !== razorpayOrderId) {
        throw new HttpsError('invalid-argument', 'Razorpay Order ID mismatch.');
    }

    const amount = topUpData.amount;

    // 6. Credit wallet via Unified Wallet Service
    const creditResult = await walletService.creditWallet({
        uid: context.auth.uid,
        amount: amount,
        eventType: 'TOPUP',
        entityId: topUpId,
        description: `Wallet recharge via Razorpay (${razorpayPaymentId})`,
        metadata: {
            topUpId,
            razorpayPaymentId,
            razorpayOrderId
        },
        idempotencyKey: `JE_WALLET_TOPUP_${topUpId}`
    });

    // Mark top-up as completed
    await topUpRef.update({
        status: 'COMPLETED',
        razorpayPaymentId: razorpayPaymentId,
        walletTxId: creditResult.txId,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[verifyWalletTopUp] ₹${amount} credited to user: ${context.auth.uid}`);
    return { success: true, creditedAmount: amount, txId: creditResult.txId };
});

// ─────────────────────────────────────────────────────────────────────────────
// adminAdjustWallet  (SuperAdmin / FinanceAdmin only)
//   Allows authorized finance admin to manually credit/debit customer wallet
//   with strict reason, ₹5,000 limit, idempotency, and System 2 GL logging.
// ─────────────────────────────────────────────────────────────────────────────
exports.adminAdjustWallet = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    if (!isAuthorizedAdmin(context)) {
        throw new HttpsError('permission-denied', 'UNAUTHORIZED: Only SuperAdmin and FinanceAdmin are permitted to perform manual wallet adjustments.');
    }

    const { userId, amount, type, reason, idempotencyKey } = data;
    // type: 'CREDIT' | 'DEBIT'
    if (!userId || typeof userId !== 'string') {
        throw new HttpsError('invalid-argument', 'userId is required.');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        throw new HttpsError('invalid-argument', 'INVALID_REASON: Reason must be at least 10 characters describing the justification.');
    }

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0 || amount > MAX_ADMIN_ADJUSTMENT) {
        throw new HttpsError('invalid-argument', `INVALID_AMOUNT: Amount must be a positive number up to ₹${MAX_ADMIN_ADJUSTMENT}.`);
    }

    if (!['CREDIT', 'DEBIT'].includes(type)) {
        throw new HttpsError('invalid-argument', 'type must be CREDIT or DEBIT.');
    }

    const cleanReason = reason.trim();
    const effectiveKey = idempotencyKey || deriveTimeWindowKey(context.auth.uid, userId, amount, type, cleanReason);

    let result;
    try {
        if (type === 'CREDIT') {
            result = await walletService.creditWallet({
                uid: userId,
                amount,
                eventType: 'ADMIN_CREDIT',
                entityId: effectiveKey,
                description: `Admin credit: ${cleanReason}`,
                metadata: {
                    adjustedBy: context.auth.uid,
                    reason: cleanReason
                },
                idempotencyKey: `JE_WALLET_ADMIN_CREDIT_${effectiveKey}`
            }, {
                auth: { uid: context.auth.uid, token: context.auth.token }
            });
        } else {
            result = await walletService.debitWallet({
                uid: userId,
                amount,
                eventType: 'ADMIN_DEBIT',
                entityId: effectiveKey,
                description: `Admin debit: ${cleanReason}`,
                metadata: {
                    adjustedBy: context.auth.uid,
                    reason: cleanReason
                },
                idempotencyKey: `JE_WALLET_ADMIN_DEBIT_${effectiveKey}`
            }, {
                auth: { uid: context.auth.uid, token: context.auth.token }
            });
        }
    } catch (err) {
        if (err.code === 'INSUFFICIENT_WALLET_BALANCE') {
            throw new HttpsError('failed-precondition', err.message);
        }
        if (err.code === 'USER_NOT_FOUND') {
            throw new HttpsError('not-found', err.message);
        }
        throw new HttpsError('internal', err.message || 'Failed to process admin wallet adjustment.');
    }

    return {
        success: true,
        alreadyProcessed: result.alreadyProcessed,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        amount: result.amount,
        txId: result.txId,
        journalEntryId: result.journalEntryId,
        message: result.alreadyProcessed
            ? 'Wallet adjustment was previously processed (Idempotent replay).'
            : `Wallet ${type} of ₹${amount} completed successfully.`
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// getWalletHistory  (User-callable)
//   Paginated wallet transaction history for the customer app Wallet screen.
// ─────────────────────────────────────────────────────────────────────────────
exports.getWalletHistory = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = context.auth.uid;

    const parseDate = (val) => {
        if (!val) return { ms: 0, iso: null };
        if (typeof val.toDate === 'function') {
            const d = val.toDate();
            return { ms: d.getTime(), iso: d.toISOString() };
        }
        if (val instanceof Date) {
            return { ms: val.getTime(), iso: val.toISOString() };
        }
        if (typeof val === 'number') {
            const d = new Date(val);
            return { ms: d.getTime(), iso: d.toISOString() };
        }
        if (typeof val === 'string') {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
                return { ms: d.getTime(), iso: d.toISOString() };
            }
        }
        return { ms: 0, iso: null };
    };

    let historyDocs = [];
    let txnByUidDocs = [];
    let txnByUserIdDocs = [];
    let walletOrderDocs = [];
    let walletReturnDocs = [];

    // Query 1: users/{uid}/wallet_history (Standard wallet subcollection)
    try {
        const snap = await db.collection('users').doc(uid).collection('wallet_history').limit(50).get();
        historyDocs = snap.docs;
    } catch (err) {
        console.warn('[getWalletHistory] wallet_history query error:', err.message);
    }

    // Query 2: wallet_transactions where uid == uid
    try {
        const snap = await db.collection('wallet_transactions').where('uid', '==', uid).limit(50).get();
        txnByUidDocs = snap.docs;
    } catch (err) {
        console.warn('[getWalletHistory] wallet_transactions by uid query error:', err.message);
    }

    // Query 3: wallet_transactions where userId == uid (Admin portal refund records)
    try {
        const snap = await db.collection('wallet_transactions').where('userId', '==', uid).limit(50).get();
        txnByUserIdDocs = snap.docs;
    } catch (err) {
        console.warn('[getWalletHistory] wallet_transactions by userId query error:', err.message);
    }

    // Query 4: orders where userId == uid and paymentMethod == 'WALLET' (captures any order paid by wallet)
    try {
        const snap = await db.collection('orders').where('userId', '==', uid).where('paymentMethod', '==', 'WALLET').limit(50).get();
        walletOrderDocs = snap.docs;
    } catch (err) {
        console.warn('[getWalletHistory] orders query error:', err.message);
    }

    // Query 5: returns where userId == uid (captures any return refunded to wallet)
    try {
        const snap = await db.collection('returns').where('userId', '==', uid).limit(50).get();
        walletReturnDocs = snap.docs;
    } catch (err) {
        console.warn('[getWalletHistory] returns query error:', err.message);
    }

    let transactions = [];
    const seenIds = new Set();
    const seenOrderPayments = new Set();
    const seenReturnIds = new Set();

    historyDocs.forEach(doc => {
        const d = doc.data();
        if (seenIds.has(doc.id)) return;
        seenIds.add(doc.id);
        if (d.orderId && (d.type === 'ORDER_PAYMENT' || d.type === 'REDEEMED_AT_CHECKOUT')) {
            seenOrderPayments.add(d.orderId);
        }
        if (d.returnId) {
            seenReturnIds.add(d.returnId);
        }

        const parsed = parseDate(d.timestamp || d.createdAt || d.updatedAt);
        transactions.push({
            id: doc.id,
            type: d.type || 'REFUND_CREDIT',
            amount: Number(d.amount) || 0,
            description: d.description || (d.type === 'ORDER_PAYMENT' ? 'Order Payment' : 'Refund Credit'),
            orderId: d.orderId || null,
            returnId: d.returnId || null,
            timestampMs: parsed.ms,
            isoString: parsed.iso
        });
    });

    const mapTxnDoc = (doc) => {
        const d = doc.data();
        if (seenIds.has(doc.id)) return;
        seenIds.add(doc.id);

        const orderId = d.orderId || d.referenceOrderId || null;
        const returnId = d.referenceId || d.returnId || null;

        let description = d.description || "";
        let type = d.type || "";

        if (d.category === "REFUND" && (d.type === "CREDIT" || !d.type)) {
            type = "REFUND_CREDIT";
            description = description || "Refund credited to wallet";
        } else if (d.type === "REFERRAL_CREDIT" || d.type === "REFERRAL_SIGNUP_CREDIT") {
            description = description || "Referral Reward";
        } else if (d.type === "REFERRAL_REVERSAL") {
            description = description || "Referral Reversal";
        } else if (d.type === "REDEEMED_AT_CHECKOUT" || d.type === "ORDER_PAYMENT") {
            type = "ORDER_PAYMENT";
            description = description || "Order Payment";
        } else if (!type) {
            type = "REFUND_CREDIT";
        }

        if (orderId && type === 'ORDER_PAYMENT') {
            seenOrderPayments.add(orderId);
        }
        if (returnId) {
            seenReturnIds.add(returnId);
        }

        const parsed = parseDate(d.createdAt || d.timestamp || d.updatedAt);
        transactions.push({
            id: doc.id,
            type: type,
            amount: Number(d.amount) || 0,
            description: description,
            orderId: orderId,
            returnId: returnId,
            timestampMs: parsed.ms,
            isoString: parsed.iso
        });
    };

    txnByUidDocs.forEach(mapTxnDoc);
    txnByUserIdDocs.forEach(mapTxnDoc);

    // Process fallback: Wallet Orders not yet recorded in history subcollection
    walletOrderDocs.forEach(doc => {
        const d = doc.data();
        if (seenIds.has(doc.id) || seenOrderPayments.has(doc.id)) return;
        seenIds.add(doc.id);
        seenOrderPayments.add(doc.id);

        const parsed = parseDate(d.createdAt || d.updatedAt);
        transactions.push({
            id: `ord_${doc.id}`,
            type: "ORDER_PAYMENT",
            amount: Number(d.totalAmount) || 0,
            description: `Order #${doc.id.slice(-6).toUpperCase()}`,
            orderId: doc.id,
            returnId: null,
            timestampMs: parsed.ms,
            isoString: parsed.iso
        });
    });

    // Process fallback: Returns with refundMethod == 'WALLET' not yet recorded
    walletReturnDocs.forEach(doc => {
        const d = doc.data();
        if (seenIds.has(doc.id) || seenReturnIds.has(doc.id)) return;
        if (d.refundMethod === 'WALLET' || d.status === 'REFUNDED' || d.refundStatus === 'COMPLETED') {
            seenIds.add(doc.id);
            seenReturnIds.add(doc.id);

            const parsed = parseDate(d.refundedAt || d.updatedAt || d.createdAt);
            transactions.push({
                id: `ret_${doc.id}`,
                type: "REFUND_CREDIT",
                amount: Number(d.refundAmount || d.amount) || 0,
                description: `Refund for Return #${doc.id.slice(-6).toUpperCase()}`,
                orderId: d.orderId || null,
                returnId: doc.id,
                timestampMs: parsed.ms,
                isoString: parsed.iso
            });
        }
    });

    // Sort in memory (newest first)
    transactions.sort((a, b) => b.timestampMs - a.timestampMs);

    const formattedTxns = transactions.slice(0, 50).map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        orderId: t.orderId,
        returnId: t.returnId,
        timestamp: t.isoString
    }));

    return { success: true, transactions: formattedTxns };
});

exports.isAuthorizedAdmin = isAuthorizedAdmin;
exports.deriveTimeWindowKey = deriveTimeWindowKey;
exports.MAX_ADMIN_ADJUSTMENT = MAX_ADMIN_ADJUSTMENT;
exports.isWalletTopUpEnabled = isWalletTopUpEnabled;
Object.defineProperty(exports, "ENABLE_WALLET_TOPUP", {
    get: () => isWalletTopUpEnabled(),
    enumerable: true
});
Object.defineProperty(exports, "WALLET_TOPUP_ENABLED", {
    get: () => isWalletTopUpEnabled(),
    enumerable: true
});

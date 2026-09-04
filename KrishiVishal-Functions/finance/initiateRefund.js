const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");
const Razorpay = require("razorpay");

const REGION = 'asia-south1';

/**
 * initiateRefund — Admin-callable Cloud Function
 *
 * Called by Admin Panel (Returns.jsx) when admin clicks "Initiate Refund"
 * on an approved return request.
 *
 * Flow:
 *  1. Validate inputs + admin auth
 *  2. Read return and order documents
 *  3. Route to correct refund method:
 *     - RAZORPAY_ONLINE  -> Razorpay Refund API
 *     - COD / WALLET     -> Wallet Credit (store credit)
 *  4. Atomically update return doc with refund status + create audit log
 *
 * @param {string} data.returnId     - Firestore doc ID in 'returns' collection
 * @param {number} data.refundAmount - Amount to refund in INR (e.g. 250.00)
 */
exports.initiateRefund = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    // ── 1. Auth Guard: Admin only ──────────────────────────────────────────
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }
    const isAdmin = await isAdminRequest(context);
    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Admin access required to initiate refunds.');
    }

    // ── 2. Input Validation ────────────────────────────────────────────────
    const { returnId, refundAmount } = data;

    if (!returnId || typeof returnId !== 'string' || returnId.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'returnId is required.');
    }
    if (typeof refundAmount !== 'number' || refundAmount <= 0) {
        throw new HttpsError('invalid-argument', 'refundAmount must be a positive number.');
    }
    if (refundAmount > 100000) {
        throw new HttpsError('invalid-argument', 'Refund amount exceeds maximum limit (Rs.1,00,000).');
    }

    // ── 3. Fetch Return Document ───────────────────────────────────────────
    const returnRef = db.collection('returns').doc(returnId);
    const returnSnap = await returnRef.get();

    if (!returnSnap.exists) {
        throw new HttpsError('not-found', `Return request not found: ${returnId}`);
    }

    const returnData = returnSnap.data();

    // Validate return is in a refundable state
    const refundableStatuses = ['APPROVED', 'PICKUP_COMPLETED', 'COMPLETED'];
    if (!refundableStatuses.includes(returnData.status)) {
        throw new HttpsError(
            'failed-precondition',
            `Cannot refund return in '${returnData.status}' status. Must be APPROVED or COMPLETED.`
        );
    }

    // Idempotency: Prevent double refund
    if (returnData.refundStatus === 'REFUNDED' || returnData.financials?.gatewayRefundId) {
        const refId = returnData.financials?.gatewayRefundId || 'WALLET';
        throw new HttpsError('already-exists', `Refund already processed. Ref: ${refId}`);
    }

    // Validate refund amount does not exceed original order amount
    const maxRefundable = returnData.financials?.totalAmount || returnData.refundAmount || 0;
    if (maxRefundable > 0 && refundAmount > maxRefundable + 1) {
        throw new HttpsError(
            'invalid-argument',
            `Refund Rs.${refundAmount} exceeds original item value Rs.${maxRefundable}.`
        );
    }

    // ── 4. Fetch Order for Payment Details ────────────────────────────────
    const orderId = returnData.orderId;
    if (!orderId) {
        throw new HttpsError('failed-precondition', 'Return is not linked to any order.');
    }

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
        throw new HttpsError('not-found', `Order not found: ${orderId}`);
    }

    const orderData = orderSnap.data();
    const paymentMethod = orderData.paymentMethod || 'COD';
    const razorpayPaymentId = orderData.razorpayPaymentId || null;

    console.log(
        `[initiateRefund] Return:${returnId} Order:${orderId} Method:${paymentMethod} Amount:Rs.${refundAmount}`
    );

    // ── 5. Route to Correct Refund Handler ────────────────────────────────
    let refundResult;

    try {
        if (paymentMethod === 'RAZORPAY_ONLINE' && razorpayPaymentId) {
            // Online payment -> refund via Razorpay API
            refundResult = await _processRazorpayRefund(razorpayPaymentId, refundAmount, returnId);
        } else {
            // COD or Wallet -> credit to customer's wallet as store credit
            refundResult = await _processWalletCredit(orderData.userId, refundAmount, returnId, orderId);
        }
    } catch (error) {
        console.error(`[initiateRefund] Failed for ${returnId}:`, error.message);

        // Mark as failed so admin knows to retry
        await returnRef.update({
            refundStatus: 'FAILED',
            'financials.failureReason': error.message,
            'financials.lastRefundAttempt': admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        throw new HttpsError('internal', `Refund failed: ${error.message}`);
    }

    // ── 6. Atomically Update Return Document + Audit Log ──────────────────
    await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(returnRef);

        // Final idempotency check inside transaction
        if (freshSnap.data() && freshSnap.data().refundStatus === 'REFUNDED') {
            console.warn(`[initiateRefund] Already refunded inside tx. Skipping.`);
            return;
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const noteText = `[REFUND] Rs.${refundAmount} via ${refundResult.method} at ${new Date().toISOString()}. Ref: ${refundResult.refundId || 'WALLET_CREDIT'}`;

        transaction.update(returnRef, {
            status: 'COMPLETED',
            refundStatus: 'REFUNDED',
            refundMethod: paymentMethod === 'RAZORPAY_ONLINE' ? 'GATEWAY' : 'WALLET_CREDIT',
            'financials.refundAmountInitiated': refundAmount,
            'financials.gatewayRefundId': refundResult.refundId || null,
            'financials.processedAt': timestamp,
            adminNotes: admin.firestore.FieldValue.arrayUnion(noteText),
            updatedAt: timestamp,
        });

        // Audit log
        const auditRef = db.collection('audit_logs').doc();
        transaction.set(auditRef, {
            action: 'INITIATE_REFUND',
            resource: 'Return',
            resourceId: returnId,
            actorId: context.auth.uid,
            timestamp: timestamp,
            details: {
                orderId,
                refundAmount,
                method: refundResult.method,
                refundId: refundResult.refundId || null,
            },
        });
    });

    console.log(`[initiateRefund] Done for ${returnId}. Method:${refundResult.method}`);

    return {
        success: true,
        method: refundResult.method,
        refundId: refundResult.refundId || null,
        message: refundResult.method === 'RAZORPAY'
            ? `Refund of Rs.${refundAmount} initiated via Razorpay. Ref: ${refundResult.refundId}`
            : `Rs.${refundAmount} credited to customer wallet as store credit.`,
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// Private Helper: Razorpay Refund API
// ─────────────────────────────────────────────────────────────────────────────
async function _processRazorpayRefund(razorpayPaymentId, amount, returnId) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured in environment variables.');
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    console.log(`[initiateRefund] Calling Razorpay API. PaymentId: ${razorpayPaymentId}`);

    const refund = await rzp.payments.refund(razorpayPaymentId, {
        amount: Math.round(amount * 100), // Razorpay expects paise
        notes: {
            returnId: returnId,
            reason: 'Admin approved return refund',
        },
        speed: 'optimum', // Instant if possible, else normal
    });

    if (!refund || !refund.id) {
        throw new Error('Razorpay API returned invalid response (missing refund ID).');
    }

    console.log(`[initiateRefund] Razorpay refund OK. RefundId: ${refund.id} Status: ${refund.status}`);

    return { method: 'RAZORPAY', refundId: refund.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private Helper: Wallet / Store Credit (for COD or Wallet orders)
// ─────────────────────────────────────────────────────────────────────────────
async function _processWalletCredit(userId, amount, returnId, orderId) {
    if (!userId) {
        throw new Error('Cannot credit wallet: userId missing on order document.');
    }

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        throw new Error(`User not found: ${userId}`);
    }

    await db.runTransaction(async (transaction) => {
        transaction.update(userRef, {
            walletBalance: admin.firestore.FieldValue.increment(amount),
            lastWalletTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Wallet history entry visible to customer
        const historyRef = db.collection('users').doc(userId).collection('wallet_history').doc();
        transaction.set(historyRef, {
            id: historyRef.id,
            type: 'REFUND_CREDIT',
            amount: amount,
            orderId: orderId,
            returnId: returnId,
            description: 'Store credit for approved return',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    console.log(`[initiateRefund] Wallet credited Rs.${amount} to user: ${userId}`);

    return { method: 'WALLET_CREDIT', refundId: null };
}

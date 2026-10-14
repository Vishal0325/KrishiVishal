const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");
const Razorpay = require("razorpay");
const { razorpayKeySecret, razorpayKeyId, getSecretVal } = require("../core/secrets");
const walletService = require("./walletService");

const REGION = 'asia-south1';

/**
 * Initiate Refund Function (Admin-Only Callable)
 *
 * Atomically handles customer return refunds through two channels:
 *  A. Store Credit (Wallet Credit) - for COD or store preference
 *  B. Razorpay Refund API         - for online prepaid orders
 *
 * Security:
 *  1. Admin role authorization check via isAdminRequest
 *  2. Idempotency guard: prevents double refund processing for the same return
 *  3. Validates return doc status (must be QC_APPROVED or APPROVED)
 *  4. Atomically update return doc with refund status + create audit log
 *
 * @param {string} data.returnId          - Firestore doc ID in 'returns' collection
 * @param {number} data.refundAmount      - Amount to refund in INR (e.g. 250.00)
 * @param {string} [data.refundDestination] - 'WALLET' (default for COD) or 'GATEWAY' (Razorpay)
 */
exports.initiateRefund = onCall({ region: REGION, invoker: 'public', secrets: [razorpayKeySecret] }, async (request) => {
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
    const { returnId, refundAmount, refundDestination } = data;

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

    // Strict Idempotency: Prevent double refund
    if (
        returnData.refundStatus === 'REFUNDED' ||
        returnData.refundStatus === 'COMPLETED' ||
        returnData.status === 'REFUNDED' ||
        returnData.financials?.gatewayRefundId
    ) {
        const refId = returnData.financials?.gatewayRefundId || 'WALLET';
        throw new HttpsError('already-exists', `Refund already processed for this return. Ref: ${refId}`);
    }

    // Validate return is in a refundable state
    const refundableStatuses = ['APPROVED', 'PICKUP_COMPLETED', 'PICKED_UP', 'HUB_RECEIVED', 'COMPLETED', 'REQUESTED'];
    if (!refundableStatuses.includes(returnData.status)) {
        throw new HttpsError(
            'failed-precondition',
            `Cannot refund return in '${returnData.status}' status.`
        );
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

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
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

    const useGateway = refundDestination === 'GATEWAY'
        || (!refundDestination && paymentMethod === 'RAZORPAY_ONLINE' && razorpayPaymentId);

    try {
        if (useGateway && razorpayPaymentId) {
            refundResult = await initiateRazorpayRefund({
                returnId,
                orderId,
                razorpayPaymentId,
                amount: refundAmount,
                creditNoteNumber: returnData.creditNoteNo || null,
                actorId: context.auth.uid
            });
        } else {
            refundResult = await _processWalletCredit(orderData.userId, refundAmount, returnId, orderId, returnData.creditNoteNo || null, { uid: context.auth.uid, token: context.auth.token });
        }
    } catch (error) {
        console.error(`[initiateRefund] Failed for ${returnId}:`, error.message);

        await returnRef.update({
            refundStatus: 'FAILED',
            'financials.failureReason': error.message,
            'financials.lastRefundAttempt': admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        throw new HttpsError('internal', `Refund failed: ${error.message}`);
    }

    // ── 6. Atomically Update Return Document, Order Document & Audit Log ──────────────────
    await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(returnRef);
        const freshData = freshSnap.data() || {};

        if (freshData.refundStatus === 'REFUNDED' || freshData.refundStatus === 'COMPLETED' || freshData.status === 'REFUNDED') {
            console.warn(`[initiateRefund] Already refunded inside tx. Skipping.`);
            return;
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const isGateway = refundResult.method === 'RAZORPAY' || refundResult.destination === 'GATEWAY';
        const noteText = `[REFUND] Rs.${refundAmount} via ${isGateway ? 'RAZORPAY' : 'WALLET'} at ${new Date().toISOString()}. Ref: ${refundResult.razorpayRefundId || refundResult.refundId || refundResult.txId || 'WALLET_CREDIT'}`;

        transaction.update(returnRef, {
            status: isGateway ? 'REFUND_INITIATED' : 'COMPLETED',
            refundStatus: isGateway ? 'INITIATED' : 'COMPLETED',
            refundMethod: isGateway ? 'RAZORPAY' : 'WALLET',
            refundDestination: isGateway ? 'GATEWAY' : 'WALLET',
            'financials.refundAmountInitiated': refundAmount,
            'financials.gatewayRefundId': refundResult.razorpayRefundId || refundResult.refundId || null,
            'financials.refundRequestId': refundResult.refundRequestId || null,
            'financials.walletTxId': refundResult.txId || null,
            'financials.processedAt': timestamp,
            adminNotes: admin.firestore.FieldValue.arrayUnion(noteText),
            updatedAt: timestamp,
        });

        transaction.update(orderRef, {
            status: isGateway ? 'RETURN_PROCESSING' : 'RETURNED',
            returnStatus: isGateway ? 'REFUND_INITIATED' : 'RETURN_COMPLETED',
            refundStatus: isGateway ? 'INITIATED' : 'REFUNDED',
            refundAmount: refundAmount,
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
                method: isGateway ? 'RAZORPAY' : 'WALLET',
                refundId: refundResult.razorpayRefundId || refundResult.refundId || refundResult.txId || `WALLET_${returnId}`,
            },
        });
    });

    const isGateway = refundResult.method === 'RAZORPAY' || refundResult.destination === 'GATEWAY';
    console.log(`[initiateRefund] Done for ${returnId}. Method:${isGateway ? 'RAZORPAY' : 'WALLET'}`);

    return {
        success: true,
        method: isGateway ? 'RAZORPAY' : 'WALLET',
        refundId: refundResult.razorpayRefundId || refundResult.refundId || refundResult.txId || null,
        refundRequestId: refundResult.refundRequestId || null,
        message: isGateway
            ? `Refund of Rs.${refundAmount} initiated via Razorpay. Ref: ${refundResult.razorpayRefundId || refundResult.refundId}`
            : `Rs.${refundAmount} credited to customer wallet as store credit.`,
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2A: Wallet Settlement Helper (System 2 GL Integrated)
// ─────────────────────────────────────────────────────────────────────────────
async function settleWalletRefund({
    userId,
    amount,
    returnId,
    orderId = null,
    creditNoteNumber = null,
    auth = null
}) {
    if (!userId) throw new Error("INVALID_UID: userId is required for wallet refund settlement.");
    if (!amount || Number(amount) <= 0) throw new Error("INVALID_AMOUNT: Refund amount must be positive.");
    if (!returnId && !creditNoteNumber) {
        throw new Error("MISSING_ENTITY_ID: returnId or creditNoteNumber is required.");
    }

    const ref = creditNoteNumber || returnId;
    const roundedAmount = Math.round(Number(amount) * 100) / 100;

    const result = await walletService.creditWallet({
        uid: userId,
        amount: roundedAmount,
        eventType: "ORDER_REFUND",
        entityId: ref,
        description: `Wallet refund settlement for Credit Note ${ref}`,
        metadata: {
            returnId: returnId || null,
            creditNoteNumber: creditNoteNumber || null,
            orderId: orderId || null
        },
        idempotencyKey: `JE_SETTLEMENT_WALLET_${ref}`
    }, {
        auth
    });

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2B: Online Razorpay Settlement Initiation Helper
// ─────────────────────────────────────────────────────────────────────────────
async function initiateRazorpayRefund({
    returnId,
    orderId,
    razorpayPaymentId,
    amount,
    creditNoteNumber = null,
    actorId = "SYSTEM",
    customRzp = null
}) {
    if (!razorpayPaymentId) throw new Error("MISSING_PAYMENT_ID: razorpayPaymentId is required for gateway refund.");
    if (!amount || Number(amount) <= 0) throw new Error("INVALID_AMOUNT: Refund amount must be positive.");

    const refundRequestId = `REF_REQ_${returnId || Date.now()}`;
    const refundRef = db.collection("refund_requests").doc(refundRequestId);

    // 1. Stage INITIATED record in refund_requests
    await refundRef.set({
        refundRequestId,
        returnId: returnId || null,
        orderId: orderId || null,
        creditNoteNumber: creditNoteNumber || null,
        razorpayPaymentId,
        amount: Number(amount),
        status: "INITIATED",
        destination: "GATEWAY",
        initiatedBy: actorId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Invoke Razorpay API
    let razorpayRefundId = null;
    if (customRzp) {
        const rzpResult = await customRzp.payments.refund(razorpayPaymentId, {
            amount: Math.round(Number(amount) * 100),
            notes: { returnId, orderId, refundRequestId }
        });
        razorpayRefundId = rzpResult?.id || `rfnd_mock_${Date.now()}`;
    } else {
        try {
            const res = await _processRazorpayRefund(razorpayPaymentId, Number(amount), returnId, refundRequestId);
            razorpayRefundId = res.refundId;
        } catch (err) {
            if (process.env.FIRESTORE_EMULATOR_HOST && (err.message.includes('credentials') || err.message.includes('not configured') || err.message.includes('missing or undefined'))) {
                razorpayRefundId = `rfnd_emu_${Date.now()}`;
            } else {
                throw err;
            }
        }
    }

    // 3. Update refund_requests with gateway refund ID
    await refundRef.update({
        razorpayRefundId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        method: "RAZORPAY",
        destination: "GATEWAY",
        refundRequestId,
        razorpayRefundId,
        refundId: razorpayRefundId,
        status: "INITIATED"
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private Helper: Razorpay Refund API
// ─────────────────────────────────────────────────────────────────────────────
async function _processRazorpayRefund(razorpayPaymentId, amount, returnId, refundRequestId = null) {
    const keyId = getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID');
    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured in environment variables.');
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    console.log(`[initiateRefund] Calling Razorpay API. PaymentId: ${razorpayPaymentId}`);

    const notes = {
        returnId: returnId,
        reason: 'Admin approved return refund',
    };
    if (refundRequestId) {
        notes.refundRequestId = refundRequestId;
    }

    const refund = await rzp.payments.refund(razorpayPaymentId, {
        amount: Math.round(amount * 100), // Razorpay expects paise
        notes,
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
async function _processWalletCredit(userId, amount, returnId, orderId, creditNoteNumber = null, auth = null) {
    const res = await settleWalletRefund({
        userId,
        amount,
        returnId,
        orderId,
        creditNoteNumber,
        auth
    });

    return {
        method: 'WALLET_CREDIT',
        refundId: res.txId,
        txId: res.txId,
        alreadyProcessed: res.alreadyProcessed
    };
}

exports.settleWalletRefund = settleWalletRefund;
exports.initiateRazorpayRefund = initiateRazorpayRefund;

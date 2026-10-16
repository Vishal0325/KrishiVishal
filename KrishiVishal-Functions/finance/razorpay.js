const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const Razorpay = require("razorpay");
const { razorpayKeySecret, razorpayWebhookSecret, razorpayKeyId, getSecretVal } = require("../core/secrets");
const { postJournalEntry } = require("./generalLedger");

const REGION = 'asia-south1';

/**
 * Helper to derive YYYY-MM fiscal period identifier.
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit'
    }).format(d);
}

/**
 * Records deferred revenue recognition upon successful prepaid order payment capture.
 * System 2 double entry:
 *   Debit:  1050_GATEWAY_RECEIVABLE (Paise captured on payment gateway)
 *   Credit: 2070_DEFERRED_REVENUE (Advance received from customer before delivery)
 * 
 * Strict Transaction Contract (Rules 1-5):
 * - Deterministic entryId: JE_PREPAID_ORDER_CAPTURED_${orderId}
 * - Idempotent replay: if already captured, safely returns existing record.
 */
async function recordPrepaidOrderCaptured({
    orderId,
    amount,
    gateway = "RAZORPAY",
    paymentId = null,
    date = new Date(),
    createdBy = "SYSTEM_PAYMENT_CAPTURE"
}, options = {}) {
    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");
    const roundedAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (roundedAmount <= 0) throw new Error("INVALID_AMOUNT: Captured amount must be positive.");

    const periodId = getFiscalPeriodId(date);
    const entryId = `JE_PREPAID_ORDER_CAPTURED_${orderId}`;

    const payload = {
        entryId,
        periodId,
        date: date instanceof Date ? date : new Date(date),
        refType: "GATEWAY_SETTLEMENT",
        refId: orderId,
        memo: `Prepaid Order Payment Captured for Order #${orderId} (Gateway: ${gateway}, Payment: ${paymentId || 'N/A'})`,
        lines: [
            {
                accountCode: "1050_GATEWAY_RECEIVABLE",
                debit: roundedAmount,
                credit: 0,
                description: `Gateway funds captured Order ${orderId}`
            },
            {
                accountCode: "2070_DEFERRED_REVENUE",
                debit: 0,
                credit: roundedAmount,
                description: `Deferred revenue recognized for Order ${orderId}`
            }
        ],
        createdBy
    };

    return await postJournalEntry(payload, options);
}

/**
 * Hardened verifyPayment: Focuses on verification, status update, and System 2 prepaid capture.
 */
exports.verifyPayment = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new HttpsError('invalid-argument', 'Missing mandatory payment details.');
    }

    const keyId = getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID');
    const secret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');
    if (!keyId || !secret) throw new HttpsError('internal', 'Razorpay credentials not configured.');

    const rzp = new Razorpay({ key_id: keyId, key_secret: secret });

    try {
        // 1. Signature Verification (HMAC)
        const generatedSignature = crypto
            .createHmac("sha256", secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        const genBuf = Buffer.from(generatedSignature, 'utf8');
        const reqBuf = Buffer.from(razorpaySignature, 'utf8');
        if (genBuf.length !== reqBuf.length || !crypto.timingSafeEqual(genBuf, reqBuf)) {
            throw new HttpsError('invalid-argument', 'Invalid payment signature.');
        }

        // 2. Razorpay API Reconciliation
        const rzpPayment = await rzp.payments.fetch(razorpayPaymentId);

        if (rzpPayment.status !== 'captured') {
            throw new Error(`Payment not captured. Status: ${rzpPayment.status}`);
        }
        if (rzpPayment.order_id !== razorpayOrderId) {
            throw new Error('Razorpay Order ID mismatch.');
        }
        if (rzpPayment.currency !== 'INR') {
            throw new Error(`Invalid currency: ${rzpPayment.currency}`);
        }

        // 3. Status Transition in Transaction
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) throw new Error('Order not found.');
            const orderData = orderSnap.data();

            if (orderData.razorpayOrderId !== razorpayOrderId) {
                throw new Error('Internal Razorpay Order ID mismatch.');
            }
            if (orderData.userId !== context.auth.uid) {
                throw new Error('Order ownership mismatch.');
            }

            // Reconcile Amount (Razorpay uses Paise)
            const expectedPaise = Math.round((orderData.totalAmount || 0) * 100);
            if (rzpPayment.amount !== expectedPaise) {
                throw new Error(`Amount mismatch. Expected ${expectedPaise}, got ${rzpPayment.amount}`);
            }

            if (orderData.paymentStatus === 'PAID') return; // Idempotent success

            // Post System 2 Deferred Revenue Capture (Dr 1050 / Cr 2070)
            await recordPrepaidOrderCaptured({
                orderId,
                amount: orderData.totalAmount,
                gateway: "RAZORPAY",
                paymentId: razorpayPaymentId,
                createdBy: context.auth.uid
            }, { tx: transaction });

            transaction.update(orderRef, {
                paymentStatus: "PAID",
                status: "CONFIRMED",
                razorpayPaymentId,
                paymentMethod: "RAZORPAY_ONLINE",
                paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log Security Audit
            const auditRef = db.collection("audit_logs").doc();
            transaction.set(auditRef, {
                event: "PAYMENT_VERIFIED",
                actorId: context.auth.uid,
                targetId: orderId,
                paymentId: razorpayPaymentId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true, message: 'Payment verified successfully.' };
    } catch (error) {
        console.error("verifyPayment Error:", error.message);
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * Core processor for Razorpay Webhook Events:
 * Handles payment.captured, order.paid, payment.failed, refund.processed, and refund.failed.
 * Callable directly for deterministic emulator testing.
 */
async function processRazorpayWebhookEvent(body, eventId = null) {
    const effectiveEventId = eventId || `EVT_MANUAL_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const eventType = body?.event;

    const supportedEvents = ["payment.captured", "order.paid", "payment.failed", "refund.processed", "refund.failed"];
    if (!supportedEvents.includes(eventType)) {
        return { status: 'ignored', event: eventType };
    }

    if (eventType === "payment.captured") {
        const payment = body.payload?.payment?.entity;
        const orderId = payment?.notes?.orderId;
        if (!orderId) throw new Error('Missing orderId in payment notes.');

        await db.runTransaction(async (transaction) => {
            // 1. Idempotency Check
            const eventRef = db.collection("razorpay_webhook_events").doc(effectiveEventId);
            if ((await transaction.get(eventRef)).exists) return;

            // 2. Order Reconciliation
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Order not found.');
            const orderData = orderSnap.data();

            if (payment.order_id && orderData.razorpayOrderId && payment.order_id !== orderData.razorpayOrderId) {
                throw new Error('Order ID mismatch.');
            }
            if (payment.status !== 'captured') throw new Error('Payment not captured.');
            if (payment.currency !== 'INR') throw new Error('Currency mismatch.');

            const expectedPaise = Math.round((orderData.totalAmount || 0) * 100);
            if (payment.amount !== expectedPaise) throw new Error('Amount mismatch.');

            if (['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(orderData.status)) {
                throw new Error(`Cannot process payment for ${orderData.status} order.`);
            }

            // Post System 2 Deferred Revenue Capture (Dr 1050 / Cr 2070)
            if (orderData.paymentStatus !== 'PAID') {
                await recordPrepaidOrderCaptured({
                    orderId,
                    amount: orderData.totalAmount,
                    gateway: "RAZORPAY",
                    paymentId: payment.id,
                    createdBy: "RAZORPAY_WEBHOOK"
                }, { tx: transaction });
            }

            // 3. Atomic Commit
            transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), orderId, event: eventType });
            if (orderData.paymentStatus !== 'PAID') {
                transaction.update(orderRef, {
                    paymentStatus: "PAID",
                    status: "CONFIRMED",
                    razorpayPaymentId: payment.id,
                    paymentMethod: "RAZORPAY_ONLINE",
                    webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
    } else if (eventType === "order.paid") {
        const orderEntity = body.payload?.order?.entity;
        const paymentEntity = body.payload?.payment?.entity;
        const orderId = orderEntity?.notes?.orderId || paymentEntity?.notes?.orderId;
        if (!orderId) throw new Error('Missing orderId in order payload.');

        await db.runTransaction(async (transaction) => {
            const eventRef = db.collection("razorpay_webhook_events").doc(effectiveEventId);
            if ((await transaction.get(eventRef)).exists) return;

            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Order not found.');
            const orderData = orderSnap.data();

            if (orderData.paymentStatus !== 'PAID') {
                await recordPrepaidOrderCaptured({
                    orderId,
                    amount: orderData.totalAmount,
                    gateway: "RAZORPAY",
                    paymentId: paymentEntity?.id || orderData.razorpayPaymentId || null,
                    createdBy: "RAZORPAY_WEBHOOK"
                }, { tx: transaction });
            }

            transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), orderId, event: eventType });
            if (orderData.paymentStatus !== 'PAID') {
                transaction.update(orderRef, {
                    paymentStatus: "PAID",
                    status: "CONFIRMED",
                    razorpayPaymentId: paymentEntity?.id || orderData.razorpayPaymentId || null,
                    paymentMethod: "RAZORPAY_ONLINE",
                    webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
    } else if (eventType === "payment.failed") {
        const payment = body.payload?.payment?.entity;
        const orderId = payment?.notes?.orderId;
        if (!orderId) throw new Error('Missing orderId in payment payload.');

        const errorCode = payment?.error_code || payment?.error_reason || 'PAYMENT_FAILED';
        const errorDescription = payment?.error_description || 'Payment failed on gateway.';

        await db.runTransaction(async (transaction) => {
            const eventRef = db.collection("razorpay_webhook_events").doc(effectiveEventId);
            if ((await transaction.get(eventRef)).exists) return;

            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Order not found.');
            const orderData = orderSnap.data();

            transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), orderId, event: eventType });
            if (orderData.paymentStatus !== 'PAID') {
                transaction.update(orderRef, {
                    paymentStatus: "FAILED",
                    paymentError: {
                        code: errorCode,
                        description: errorDescription,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const auditRef = db.collection("audit_logs").doc();
                transaction.set(auditRef, {
                    event: "PAYMENT_FAILED",
                    targetId: orderId,
                    paymentId: payment?.id || null,
                    error: errorDescription,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
    } else if (eventType === "refund.processed") {
        const refundEntity = body.payload?.refund?.entity;
        const razorpayRefundId = refundEntity?.id;
        const amount = Number(refundEntity?.amount || 0) / 100;
        const returnId = refundEntity?.notes?.returnId;
        const orderId = refundEntity?.notes?.orderId;
        const refundRequestId = refundEntity?.notes?.refundRequestId;

        if (!razorpayRefundId) throw new Error('Missing refund id in refund.processed webhook.');

        await db.runTransaction(async (transaction) => {
            // 1. Webhook idempotency
            const eventRef = db.collection("razorpay_webhook_events").doc(effectiveEventId);
            if ((await transaction.get(eventRef)).exists) return;

            // 2. Post Journal Entry: Dr 2060 / Cr 1050
            const jeResult = await postJournalEntry({
                entryId: `JE_SETTLEMENT_GATEWAY_${razorpayRefundId}`,
                periodId: getFiscalPeriodId(),
                date: new Date(),
                refType: "GATEWAY_SETTLEMENT",
                refId: razorpayRefundId,
                memo: `Online Gateway Refund Processed: ${razorpayRefundId} (Order: ${orderId || 'N/A'}, Return: ${returnId || 'N/A'})`,
                lines: [
                    {
                        accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE",
                        debit: amount,
                        credit: 0,
                        description: `Clear refund liability for Gateway Refund ${razorpayRefundId}`
                    },
                    {
                        accountCode: "1050_GATEWAY_RECEIVABLE",
                        debit: 0,
                        credit: amount,
                        description: `Gateway payout for Refund ${razorpayRefundId}`
                    }
                ],
                createdBy: "RAZORPAY_WEBHOOK"
            }, { tx: transaction });

            // 3. Stage writes AFTER postJournalEntry
            transaction.set(eventRef, {
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                orderId: orderId || null,
                returnId: returnId || null,
                event: eventType,
                razorpayRefundId,
                journalEntryId: jeResult.entryId
            });

            if (refundRequestId) {
                const reqRef = db.collection("refund_requests").doc(refundRequestId);
                transaction.set(reqRef, {
                    status: "PROCESSED",
                    razorpayRefundId,
                    journalEntryId: jeResult.entryId,
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (returnId) {
                const retRef = db.collection("returns").doc(returnId);
                transaction.set(retRef, {
                    refundStatus: "COMPLETED",
                    status: "COMPLETED",
                    "financials.gatewayRefundProcessedAt": admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        });
    } else if (eventType === "refund.failed") {
        const refundEntity = body.payload?.refund?.entity;
        const razorpayRefundId = refundEntity?.id;
        const errorCode = refundEntity?.error_code || "REFUND_FAILED";
        const errorDescription = refundEntity?.error_description || "Razorpay refund failed on gateway.";
        const returnId = refundEntity?.notes?.returnId;
        const refundRequestId = refundEntity?.notes?.refundRequestId;

        await db.runTransaction(async (transaction) => {
            // 1. Webhook idempotency
            const eventRef = db.collection("razorpay_webhook_events").doc(effectiveEventId);
            if ((await transaction.get(eventRef)).exists) return;

            // 2. Mark failure in refund_requests and returns.
            // NOTE: 2060_CUSTOMER_REFUNDS_PAYABLE liability is INTENTIONALLY LEFT UNTOUCHED (open)!
            transaction.set(eventRef, {
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                returnId: returnId || null,
                event: eventType,
                razorpayRefundId,
                error: errorDescription
            });

            if (refundRequestId) {
                const reqRef = db.collection("refund_requests").doc(refundRequestId);
                transaction.set(reqRef, {
                    status: "FAILED",
                    failureReason: errorDescription,
                    errorCode,
                    failedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (returnId) {
                const retRef = db.collection("returns").doc(returnId);
                transaction.set(retRef, {
                    refundStatus: "FAILED",
                    "financials.failureReason": errorDescription,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // Log audit alert
            const auditRef = db.collection("audit_logs").doc();
            transaction.set(auditRef, {
                event: "GATEWAY_REFUND_FAILED",
                targetId: returnId || refundRequestId || razorpayRefundId,
                refundId: razorpayRefundId,
                error: errorDescription,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    return { status: 'ok', event: eventType };
}

/**
 * Hardened Razorpay Webhook with Idempotency, Integrity checks, and Expanded Event Handling.
 * Handles: payment.captured, order.paid, payment.failed, refund.processed, and refund.failed.
 */
exports.razorpayWebhook = onRequest({ region: REGION, secrets: [razorpayWebhookSecret] }, async (req, res) => {
    const secret = getSecretVal(razorpayWebhookSecret, 'RAZORPAY_WEBHOOK_SECRET');
    if (!secret) return res.status(500).json({ error: 'Config missing.' });

    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    if (!signature || !req.rawBody || !eventId) return res.status(400).json({ error: 'Security fail.' });

    try {
        const expectedSignature = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
        const sigBuf = Buffer.from(signature, 'utf8');
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return res.status(400).json({ error: 'Signature mismatch.' });
        }

        const body = req.body || {};
        const result = await processRazorpayWebhookEvent(body, eventId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Webhook Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

exports.recordPrepaidOrderCaptured = recordPrepaidOrderCaptured;
exports.processRazorpayWebhookEvent = processRazorpayWebhookEvent;
exports.getFiscalPeriodId = getFiscalPeriodId;

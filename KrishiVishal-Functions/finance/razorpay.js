const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const Razorpay = require("razorpay");

const REGION = 'asia-south1';

/**
 * Hardened verifyPayment: Focuses on verification and status update.
 * Accounting is handled by the downstream onOrderPaidLedger trigger.
 */
exports.verifyPayment = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new HttpsError('invalid-argument', 'Missing mandatory payment details.');
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !secret) throw new HttpsError('internal', 'Razorpay credentials not configured.');

    const rzp = new Razorpay({ key_id: keyId, key_secret: secret });

    try {
        // 1. Signature Verification (HMAC)
        const generatedSignature = crypto
            .createHmac("sha256", secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (!crypto.timingSafeEqual(Buffer.from(generatedSignature, 'utf8'), Buffer.from(razorpaySignature, 'utf8'))) {
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
 * Hardened Razorpay Webhook with Idempotency and Integrity checks.
 */
exports.razorpayWebhook = onRequest({ region: REGION }, async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'Config missing.' });

    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    if (!signature || !req.rawBody || !eventId) return res.status(400).json({ error: 'Security fail.' });

    try {
        const expectedSignature = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
        if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))) {
            return res.status(400).json({ error: 'Signature mismatch.' });
        }

        const body = req.body || {};
        if (body.event !== "payment.captured") return res.status(200).json({ status: 'ignored' });

        const payment = body.payload?.payment?.entity;
        const orderId = payment?.notes?.orderId;
        if (!orderId) return res.status(400).json({ error: 'Missing orderId.' });

        await db.runTransaction(async (transaction) => {
            // 1. Idempotency Check
            const eventRef = db.collection("razorpay_webhook_events").doc(eventId);
            if ((await transaction.get(eventRef)).exists) return;

            // 2. Order Reconciliation
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Order not found.');
            const orderData = orderSnap.data();

            if (payment.order_id !== orderData.razorpayOrderId) throw new Error('Order ID mismatch.');
            if (payment.status !== 'captured') throw new Error('Payment not captured.');
            if (payment.currency !== 'INR') throw new Error('Currency mismatch.');

            const expectedPaise = Math.round((orderData.totalAmount || 0) * 100);
            if (payment.amount !== expectedPaise) throw new Error('Amount mismatch.');

            if (['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(orderData.status)) {
                throw new Error(`Cannot process payment for ${orderData.status} order.`);
            }

            // 3. Atomic Commit
            transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), orderId });
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

        return res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error("Webhook Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

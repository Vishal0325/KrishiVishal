const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { CircuitBreaker } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * C4: Hardened verifyPayment with input validation, order ownership, status checks,
 * double payment prevention, atomic ledger entries, and audit logging.
 */
exports.verifyPayment = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    // Validate inputs
    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }
    if (!razorpayPaymentId || typeof razorpayPaymentId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid razorpayPaymentId.');
    }
    if (!razorpayOrderId || typeof razorpayOrderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid razorpayOrderId.');
    }
    if (!razorpaySignature || typeof razorpaySignature !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid razorpaySignature.');
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        throw new HttpsError('internal', 'Payment secret (RAZORPAY_KEY_SECRET) is not configured.');
    }

    try {
        // Constant-time timing-safe signature comparison
        const generatedSignature = crypto
            .createHmac("sha256", secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        let isSignatureValid = false;
        try {
            isSignatureValid = crypto.timingSafeEqual(
                Buffer.from(generatedSignature, 'utf8'),
                Buffer.from(razorpaySignature, 'utf8')
            );
        } catch (e) {
            isSignatureValid = false;
        }

        if (!isSignatureValid) {
            throw new HttpsError('invalid-argument', 'Invalid payment signature.');
        }

        // Run transaction to verify order state and record ledger entry
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) {
                throw new Error('Order not found.');
            }

            const orderData = orderSnap.data();

            // Verify order ownership
            if (orderData.userId !== context.auth.uid) {
                throw new Error('You do not have permission to verify payment for this order.');
            }

            // Verify valid state for payment confirmation
            const validPaymentStates = ['PLACED', 'PAYMENT_PENDING', 'PENDING'];
            if (!validPaymentStates.includes(orderData.status) && !validPaymentStates.includes(orderData.paymentStatus)) {
                throw new Error(`Cannot verify payment for order in status: ${orderData.status}`);
            }

            // Prevent double-payment verification
            if (orderData.paymentStatus === 'PAID' && orderData.razorpayPaymentId) {
                throw new Error('Payment has already been verified for this order.');
            }

            // Update order atomically
            transaction.update(orderRef, {
                paymentStatus: "PAID",
                status: "CONFIRMED",
                razorpayPaymentId,
                razorpayOrderId,
                paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Create ledger entry in same transaction
            const ledgerRef = db.collection("finance").doc("ledger").collection("entries").doc();
            transaction.set(ledgerRef, {
                id: ledgerRef.id,
                type: "PAYMENT_RECEIVED",
                orderId,
                userId: orderData.userId,
                amount: orderData.totalAmount || 0,
                gstAmount: orderData.totalTax || 0,
                paymentMethod: "RAZORPAY_ONLINE",
                razorpayPaymentId,
                razorpayOrderId,
                status: "POSTED",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Create audit log
            const auditRef = db.collection("audit_logs").doc();
            transaction.set(auditRef, {
                id: auditRef.id,
                event: "PAYMENT_VERIFIED",
                userId: context.auth.uid,
                orderId,
                razorpayPaymentId,
                amount: orderData.totalAmount || 0,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true, orderId, message: 'Payment verified and order confirmed successfully.' };
    } catch (error) {
        console.error("Payment verification error:", error);
        throw new HttpsError('invalid-argument', error.message);
    }
});

/**
 * C3: Hardened razorpayWebhook with config checks, timing-safe validation, and error guards.
 */
exports.razorpayWebhook = onRequest({ region: REGION }, async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Validate webhook secret configuration
    if (!secret) {
        console.error("CRITICAL: RAZORPAY_WEBHOOK_SECRET is not configured.");
        return res.status(500).json({ error: 'Webhook configuration error.' });
    }

    // Validate signature header
    const signature = req.headers["x-razorpay-signature"];
    if (!signature || typeof signature !== 'string') {
        console.warn("Missing or invalid x-razorpay-signature header.");
        return res.status(400).json({ error: 'Missing signature.' });
    }

    // Validate raw body
    if (!req.rawBody) {
        console.warn("Missing raw body in webhook request.");
        return res.status(400).json({ error: 'Missing request body.' });
    }

    try {
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(req.rawBody)
            .digest("hex");

        let isSignatureValid = false;
        try {
            isSignatureValid = crypto.timingSafeEqual(
                Buffer.from(signature, 'utf8'),
                Buffer.from(expectedSignature, 'utf8')
            );
        } catch (e) {
            isSignatureValid = false;
        }

        if (!isSignatureValid) {
            console.warn("Webhook signature mismatch.");
            return res.status(400).json({ error: 'Invalid webhook signature.' });
        }

        const body = req.body || {};
        if (body.event === "payment.captured") {
            const payment = body.payload?.payment?.entity;
            if (!payment) {
                console.warn("Missing payment entity in captured event payload.");
                return res.status(400).json({ error: 'Invalid payment payload.' });
            }

            const orderId = payment.notes?.orderId;
            if (!orderId || typeof orderId !== 'string') {
                console.warn("Missing or invalid orderId in payment notes.");
                return res.status(400).json({ error: 'Invalid orderId in notes.' });
            }

            // Update order
            await db.collection("orders").doc(orderId).update({
                paymentStatus: "PAID",
                razorpayPaymentId: payment.id,
                paymentMethod: "RAZORPAY_ONLINE",
                webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.info(`Payment successfully captured and recorded for order: ${orderId}`);
        }

        return res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error("Webhook processing exception:", error);
        return res.status(500).json({ error: 'Webhook processing error.' });
    }
});

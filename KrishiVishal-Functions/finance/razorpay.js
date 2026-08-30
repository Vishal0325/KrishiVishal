const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const Razorpay = require("razorpay");

const REGION = 'asia-south1';

/**
 * C-RP1, C-RP2: Hardened verifyPayment with server-side reconciliation,
 * signature binding, and Razorpay API verification.
 */
exports.verifyPayment = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    // Validate inputs
    if (!orderId || typeof orderId !== 'string' || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new HttpsError('invalid-argument', 'Missing mandatory payment details.');
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !secret) {
        throw new HttpsError('internal', 'Razorpay credentials not configured.');
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: secret });

    try {
        // 1. Signature Verification (HMAC)
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

        // 2. Razorpay API Reconciliation (Fetch payment details from server)
        const rzpPayment = await rzp.payments.fetch(razorpayPaymentId);

        if (rzpPayment.status !== 'captured') {
            throw new Error(`Payment not captured. Current status: ${rzpPayment.status}`);
        }

        if (rzpPayment.order_id !== razorpayOrderId) {
            throw new Error('Payment mismatch: Razorpay Order ID does not match payment record.');
        }

        // 3. Transactional Business Logic Reconciliation
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) {
                throw new Error('Internal Order not found.');
            }

            const orderData = orderSnap.data();

            // C-RP1: Verify client-provided Razorpay Order ID matches stored one
            if (orderData.razorpayOrderId !== razorpayOrderId) {
                throw new Error('Security Breach: Razorpay Order ID binding mismatch.');
            }

            // Verify order ownership
            if (orderData.userId !== context.auth.uid) {
                throw new Error('Permission denied: Order ownership mismatch.');
            }

            // Verify valid state for payment confirmation
            const validStates = ['PLACED', 'PAYMENT_PENDING', 'PENDING'];
            if (!validStates.includes(orderData.status) && !validStates.includes(orderData.paymentStatus)) {
                // If already PAID, we can return success (idempotency)
                if (orderData.paymentStatus === 'PAID') return;
                throw new Error(`Order in status ${orderData.status} cannot be verified.`);
            }

            // C-RP2: Verify amount reconciliation (Razorpay amount is in paise)
            const expectedAmountPaise = Math.round((orderData.totalAmount || 0) * 100);
            if (rzpPayment.amount !== expectedAmountPaise) {
                throw new Error(`Amount Mismatch: Expected ${expectedAmountPaise}, Received ${rzpPayment.amount}`);
            }

            if (rzpPayment.currency !== 'INR') {
                throw new Error(`Currency Mismatch: Expected INR, Received ${rzpPayment.currency}`);
            }

            // Update order atomically
            transaction.update(orderRef, {
                paymentStatus: "PAID",
                status: "CONFIRMED",
                razorpayPaymentId,
                paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Create ledger entry using standard accounting logic (Liability/Revenue Account)
            const ledgerRef = db.collection("ledger").doc();
            const timestamp = admin.firestore.FieldValue.serverTimestamp();

            transaction.set(ledgerRef, {
                id: ledgerRef.id,
                account: "SALES", // Revenue increases with Credit
                type: "CREDIT",
                amount: (orderData.totalAmount || 0) - (orderData.totalTax || 0),
                referenceId: orderId,
                description: `Payment Verified for Order #${orderId}`,
                createdAt: timestamp,
                timestamp: timestamp
            });

            // Post GST liability
            if (orderData.totalTax > 0) {
                const gstRef = db.collection("ledger").doc();
                transaction.set(gstRef, {
                    account: "GST_PAYABLE",
                    type: "CREDIT",
                    amount: orderData.totalTax,
                    referenceId: orderId,
                    description: `GST for Order #${orderId}`,
                    createdAt: timestamp,
                    timestamp: timestamp
                });
            }

            // Record Audit Log
            const auditRef = db.collection("audit_logs").doc();
            transaction.set(auditRef, {
                event: "PAYMENT_VERIFIED",
                actorId: context.auth.uid,
                targetId: orderId,
                amount: orderData.totalAmount,
                paymentId: razorpayPaymentId,
                timestamp: timestamp
            });
        });

        return { success: true, orderId, message: 'Payment verified and order confirmed successfully.' };
    } catch (error) {
        console.error("CRITICAL: Payment verification failure:", error.message);
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * C-RP3 to C-RP8: Hardened razorpayWebhook with idempotency, amount verification,
 * order binding, and transactional integrity.
 */
exports.razorpayWebhook = onRequest({ region: REGION }, async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error("CRITICAL: RAZORPAY_WEBHOOK_SECRET is not configured.");
        return res.status(500).json({ error: 'Webhook configuration error.' });
    }

    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"]; // C-RP3: For idempotency

    if (!signature || !req.rawBody || !eventId) {
        return res.status(400).json({ error: 'Missing security headers/body.' });
    }

    try {
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(req.rawBody)
            .digest("hex");

        if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))) {
            console.warn("Webhook signature mismatch.");
            return res.status(400).json({ error: 'Invalid webhook signature.' });
        }

        const body = req.body || {};
        if (body.event !== "payment.captured") {
            return res.status(200).json({ status: 'ignored' });
        }

        const payment = body.payload?.payment?.entity;
        const orderId = payment?.notes?.orderId;

        if (!orderId || typeof orderId !== 'string') {
            console.warn("Webhook Error: orderId missing in payment notes.");
            return res.status(400).json({ error: 'orderId missing in notes.' });
        }

        // C-RP3: Implement idempotency and C-RP4-8 verification in a transaction
        await db.runTransaction(async (transaction) => {
            // 1. Idempotency Check
            const eventRef = db.collection("razorpay_webhook_events").doc(eventId);
            const eventSnap = await transaction.get(eventRef);
            if (eventSnap.exists) {
                console.log(`Duplicate Webhook Event: ${eventId}. Skipping.`);
                return;
            }

            // 2. Order Integrity Check
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) {
                throw new Error(`Order ${orderId} not found.`);
            }

            const orderData = orderSnap.data();

            // C-RP4: Verify Razorpay Order ID binding
            if (payment.order_id !== orderData.razorpayOrderId) {
                throw new Error(`Integrity Fail: Payment Order ID ${payment.order_id} does not match stored ${orderData.razorpayOrderId}`);
            }

            // C-RP5: Verify Amount
            const expectedAmountPaise = Math.round((orderData.totalAmount || 0) * 100);
            if (payment.amount !== expectedAmountPaise) {
                throw new Error(`Amount Mismatch: Razorpay ${payment.amount}, Expected ${expectedAmountPaise}`);
            }

            // C-RP7: Order State Validation
            if (['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(orderData.status)) {
                throw new Error(`Invalid Transition: Cannot mark ${orderData.status} order as PAID.`);
            }

            // 3. Commit Updates
            transaction.set(eventRef, {
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                orderId,
                paymentId: payment.id,
                amount: payment.amount
            });

            if (orderData.paymentStatus !== 'PAID') {
                transaction.update(orderRef, {
                    paymentStatus: "PAID",
                    status: "CONFIRMED", // C-RP6: Only if all checks pass
                    razorpayPaymentId: payment.id,
                    paymentMethod: "RAZORPAY_ONLINE",
                    webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });

        console.info(`Webhook successfully processed for order: ${orderId}`);
        return res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error("Webhook processing exception:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

const crypto = require("crypto");
const functions \u003d require(\"firebase-functions/v1\");
const admin \u003d require(\"firebase-admin\");
const { getRequiredSecret } \u003d require(\"./src/security_utils\");

/**
 * Webhook handler to verify Razorpay payments.
 * Hardened with signature verification, idempotency, state validation, and amount matching.
 */
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
    let secret;
    try {
        secret = getRequiredSecret('RAZORPAY_WEBHOOK_SECRET');
    } catch (e) {
        console.error("FATAL: RAZORPAY_WEBHOOK_SECRET is not configured. Webhook failing closed.");
        return res.status(500).send("Internal Configuration Error");
    }
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
        return res.status(400).send("Missing signature");
    }

    // Mandatory HMAC Signature Verification (Correction 4)
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(req.rawBody)
        .digest("hex");

    if (signature !== expectedSignature) {
        console.warn("CRITICAL: Invalid webhook signature received. Potential tampering attempt.");
        return res.status(400).send("Invalid signature");
    }

    const eventId = req.body.id;
    const event = req.body.event;
    const payment = req.body.payload.payment.entity;

    // 1. Replay Protection: Check if this eventId was already processed
    const db = admin.firestore();
    const eventLogRef = db.collection("webhook_events").doc(eventId);

    if (event === "payment.captured") {
        const orderId = payment.notes?.orderId;
        if (!orderId) {
            console.error("No orderId found in payment notes.");
            return res.status(200).send("ok (no orderId)");
        }

        try {
            await db.runTransaction(async (transaction) => {
                const eventLogSnap = await transaction.get(eventLogRef);
                if (eventLogSnap.exists) {
                    console.log(`Webhook event ${eventId} already processed. Skipping.`);
                    return;
                }

                const orderRef = db.collection("orders").doc(orderId);
                const orderSnap = await transaction.get(orderRef);

                if (!orderSnap.exists) {
                    console.error(`Order ${orderId} from webhook not found.`);
                    return;
                }
                const order = orderSnap.data();

                // 2. Razorpay Order ID Matching
                if (payment.order_id && order.razorpayOrderId && payment.order_id !== order.razorpayOrderId) {
                     console.error(`Razorpay Order ID mismatch: Webhook=${payment.order_id}, Internal=${order.razorpayOrderId}`);
                     return;
                }

                // 3. Amount Validation (Correction 4)
                const expectedPaise = Math.round(order.totalAmount * 100);
                if (payment.amount !== expectedPaise) {
                    console.error(`Amount mismatch in webhook: Razorpay=${payment.amount}, Order=${expectedPaise}`);
                    return;
                }

                // 4. State Validation & Update
                if (order.paymentStatus !== 'PAID') {
                    transaction.update(orderRef, {
                        paymentStatus: "PAID",
                        status: "CONFIRMED",
                        razorpayPaymentId: payment.id,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // 5. Transactional Outbox for Side Effects
                    const outboxRef = db.collection("outbox").doc();
                    transaction.set(outboxRef, {
                        type: "PAYMENT_CAPTURED",
                        payload: {
                            orderId,
                            paymentId: payment.id,
                            userId: order.userId
                        },
                        status: "PENDING",
                        retryCount: 0,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                // Log the event as processed
                transaction.set(eventLogRef, {
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    orderId,
                    type: event,
                    paymentId: payment.id
                });
            });
        } catch (error) {
            console.error("Webhook transaction error:", error);
            return res.status(500).send("Transaction Error");
        }
    }

    res.status(200).send("ok");
});

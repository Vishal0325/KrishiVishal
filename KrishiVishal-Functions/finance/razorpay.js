const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { CircuitBreaker } = require("../core/utils");

const REGION = 'asia-south1';

exports.verifyPayment = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generatedSignature = crypto.createHmac("sha256", secret).update(razorpayOrderId + "|" + razorpayPaymentId).digest("hex");
    if (generatedSignature !== razorpaySignature) throw new HttpsError('invalid-argument', 'Invalid signature.');
    await db.collection("orders").doc(orderId).update({ paymentStatus: "PAID", status: "CONFIRMED", razorpayPaymentId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

exports.razorpayWebhook = onRequest({ region: REGION }, async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    if (signature !== expectedSignature) return res.status(400).send("Invalid signature");
    if (req.body.event === "payment.captured") {
        const payment = req.body.payload.payment.entity;
        const orderId = payment.notes.orderId;
        await db.collection("orders").doc(orderId).update({ paymentStatus: "PAID", razorpayPaymentId: payment.id });
    }
    res.status(200).send("ok");
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag } = require("../core/utils");

const REGION = 'asia-south1';

exports.payWithWallet = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { orderId } = data;
    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) {
                throw new Error("Order not found.");
            }

            const orderData = orderSnap.data();
            const orderTotal = orderData.totalAmount || 0;

            // 1. Authorization: Verify order ownership
            if (orderData.userId !== context.auth.uid) {
                throw new Error("You do not have permission to pay for this order.");
            }

            // 2. Idempotency: Check if already paid
            if (orderData.paymentStatus === 'PAID') {
                return; // Already processed
            }

            // 3. Validation: Verify order status allows payment
            if (!['PLACED', 'PENDING', 'PAYMENT_PENDING'].includes(orderData.status)) {
                throw new Error(`Order in ${orderData.status} status cannot be paid.`);
            }

            const userRef = db.collection("users").doc(context.auth.uid);
            const userSnap = await transaction.get(userRef);
            const currentBalance = userSnap.data().walletBalance || 0;

            if (currentBalance < orderTotal) {
                throw new Error(`Insufficient wallet balance. Required: ₹${orderTotal}, Available: ₹${currentBalance}`);
            }

            // 4. Atomic Updates
            transaction.update(userRef, {
                walletBalance: admin.firestore.FieldValue.increment(-orderTotal),
                lastWalletTransactionAt: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.update(orderRef, {
                paymentStatus: "PAID",
                paymentMethod: "WALLET",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log granular wallet transaction for audit trail
            const walletLogRef = db.collection("users").doc(context.auth.uid).collection("wallet_history").doc();
            transaction.set(walletLogRef, {
                id: walletLogRef.id,
                type: "ORDER_PAYMENT",
                orderId: orderId,
                amount: orderTotal,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true, message: "Payment successful via wallet." };
    } catch (error) {
        console.error("Wallet payment failed:", error);
        throw new HttpsError('failed-precondition', error.message);
    }
});

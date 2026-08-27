const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag } = require("../core/utils");

const REGION = 'asia-south1';

exports.payWithWallet = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { amount, orderId } = data;
    await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(context.auth.uid);
        const userSnap = await transaction.get(userRef);
        if ((userSnap.data().walletBalance || 0) < amount) throw new Error("Insufficient balance.");
        transaction.update(userRef, { walletBalance: admin.firestore.FieldValue.increment(-amount) });
        transaction.update(db.collection("orders").doc(orderId), { paymentStatus: "PAID", paymentMethod: "WALLET", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    return { success: true };
});

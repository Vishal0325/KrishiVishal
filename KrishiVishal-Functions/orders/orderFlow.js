const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag, addToOutbox, isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * createOrder: Full logic with inventory and transactional safety.
 */
exports.createOrder = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { cartItems, address, paymentMethod, userName, userPhone } = data;

    try {
        const orderId = db.collection("orders").doc().id;
        let subtotal = 0, totalDiscount = 0, totalTax = 0;
        let orderOtp = "";

        await db.runTransaction(async (transaction) => {
            const items = [];
            for (const item of cartItems) {
                const productRef = db.collection("products").doc(item.productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) throw new Error(`Product not found: ${item.productId}`);
                const product = productSnap.data();

                let itemPrice = product.discountedPrice || product.price || product.basePrice || 0;
                let itemMrp = product.basePrice || product.mrp || itemPrice;
                let stock = product.stockQuantity !== undefined ? product.stockQuantity : (product.stock || 0);

                if (stock < item.quantity) throw new Error(`Out of stock: ${product.name}`);
                transaction.update(productRef, { stockQuantity: admin.firestore.FieldValue.increment(-item.quantity) });

                const gstRate = product.gstRate || 5;
                const itemTax = (itemPrice * item.quantity * gstRate) / 100;
                subtotal += itemMrp * item.quantity;
                totalDiscount += (itemMrp - itemPrice) * item.quantity;
                totalTax += itemTax;

                items.push({ productId: item.productId, productName: product.name, quantity: item.quantity, price: itemPrice, mrp: itemMrp, gstAmount: itemTax });
            }

            const totalAmount = (subtotal - totalDiscount) + totalTax + 50;
            const order = { id: orderId, userId: context.auth.uid, userName, userPhone, address, items, totalAmount, paymentMethod, paymentStatus: "PENDING", status: "PLACED", createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            transaction.set(db.collection("orders").doc(orderId), order);
            const otp = crypto.randomInt(100000, 999999).toString();
            transaction.set(db.collection("orders").doc(orderId).collection("internal").doc("otp"), { value: otp });
            addToOutbox(transaction, "ORDER_CREATED", { orderId, userId: context.auth.uid });
            // Store OTP reference so we can return it after transaction
            orderOtp = otp;
        });
        const finalAmount = (subtotal - totalDiscount) + totalTax + 50;
        return { orderId, totalAmount: finalAmount, customerOTP: orderOtp };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.cancelOrder = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, reason } = data;
    await db.collection("orders").doc(orderId).update({ status: "CANCELLED", cancellationReason: reason, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

exports.verifyDeliveryOTP = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, otp } = data;
    const otpSnap = await db.collection("orders").doc(orderId).collection("internal").doc("otp").get();
    if (!otpSnap.exists || otpSnap.data().value !== otp) throw new HttpsError('permission-denied', 'Invalid OTP.');
    await db.collection("orders").doc(orderId).update({ status: "DELIVERED", deliveredAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

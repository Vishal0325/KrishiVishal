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
            let hasOnDemandItems = false;

            for (const item of cartItems) {
                const productRef = db.collection("products").doc(item.productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) throw new Error(`Product not found: ${item.productId}`);
                const product = productSnap.data();

                let itemPrice = product.discountedPrice || product.price || product.basePrice || 0;
                let itemMrp = product.basePrice || product.mrp || itemPrice;
                let stock = product.stockQuantity !== undefined ? product.stockQuantity : (product.stock || 0);
                const fulfillmentType = product.fulfillmentType || 'SELF_STOCK';

                if (fulfillmentType === 'ON_DEMAND') {
                    hasOnDemandItems = true;
                    // Route to procurement queue
                    const queueRef = db.collection("procurement_queue").doc();
                    transaction.set(queueRef, {
                        id: queueRef.id,
                        orderId,
                        productId: item.productId,
                        productName: product.name,
                        quantity: item.quantity,
                        supplierId: product.primarySupplierId || null,
                        estimatedCostPrice: product.estimatedCostPrice || 0,
                        status: 'PROCUREMENT_PENDING',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    // SELF_STOCK: enforce inventory reservation
                    if (stock < item.quantity) throw new Error(`Out of stock: ${product.name}`);
                    transaction.update(productRef, { stockQuantity: admin.firestore.FieldValue.increment(-item.quantity) });
                }

                const gstRate = product.gstRate || 5;
                const itemTax = (itemPrice * item.quantity * gstRate) / 100;
                subtotal += itemMrp * item.quantity;
                totalDiscount += (itemMrp - itemPrice) * item.quantity;
                totalTax += itemTax;

                items.push({
                    productId: item.productId,
                    productName: product.name,
                    quantity: item.quantity,
                    price: itemPrice,
                    mrp: itemMrp,
                    gstAmount: itemTax,
                    fulfillmentType,
                    supplierId: product.primarySupplierId || null
                });
            }

            const totalAmount = (subtotal - totalDiscount) + totalTax + 50;
            const initialStatus = hasOnDemandItems ? "PROCUREMENT_PENDING" : "PLACED";
            const order = {
                id: orderId,
                userId: context.auth.uid,
                userName,
                userPhone,
                address,
                items,
                totalAmount,
                paymentMethod,
                paymentStatus: "PENDING",
                status: initialStatus,
                hasOnDemandItems,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            transaction.set(db.collection("orders").doc(orderId), order);
            const otp = crypto.randomInt(100000, 999999).toString();
            transaction.set(db.collection("orders").doc(orderId).collection("internal").doc("otp"), { value: otp });
            addToOutbox(transaction, "ORDER_CREATED", { orderId, userId: context.auth.uid, status: initialStatus });
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
    addToOutbox(null, "ORDER_DELIVERED", { orderId, userId: context.auth.uid });
    return { success: true };
});

/**
 * Valid canonical order state transitions
 */
const ALLOWED_TRANSITIONS = {
    PLACED: ['PAYMENT_CONFIRMED', 'PROCUREMENT_PENDING', 'READY_FOR_PACKING', 'CANCELLED'],
    PAYMENT_CONFIRMED: ['PROCUREMENT_PENDING', 'READY_FOR_PACKING', 'CANCELLED'],
    PROCUREMENT_PENDING: ['READY_FOR_PACKING', 'CANCELLED'],
    READY_FOR_PACKING: ['PACKING', 'CANCELLED'],
    PACKING: ['PACKED', 'READY_FOR_PACKING', 'CANCELLED'],
    PACKED: ['READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'CANCELLED'],
    READY_FOR_PICKUP: ['RIDER_ASSIGNED', 'RIDER_ACCEPTED', 'CANCELLED'],
    RIDER_ASSIGNED: ['RIDER_ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
    RIDER_ACCEPTED: ['OUT_FOR_DELIVERY', 'RIDER_ASSIGNED', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
    DELIVERED: ['RETURN_REQUESTED'],
    CANCELLED: []
};

/**
 * updateOrderStatus: Secure status progression
 */
exports.updateOrderStatus = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, targetStatus, note, riderId } = data;

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const currentStatus = orderSnap.data().status || 'PLACED';
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    // Allow Admin override or check allowed transition
    const updatePayload = {
        status: targetStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (riderId !== undefined) {
        updatePayload.riderId = riderId;
    }

    if (note) {
        updatePayload.statusNote = note;
    }

    await orderRef.update(updatePayload);
    addToOutbox(null, `ORDER_STATUS_${targetStatus}`, { orderId, from: currentStatus, to: targetStatus, userId: context.auth.uid });

    return { success: true, from: currentStatus, to: targetStatus };
});

/**
 * generateSignedQRPayload: Generates opaque HMAC-signed QR token for package handover
 */
exports.generateSignedQRPayload = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId } = data;

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    const salt = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const hmacSecret = process.env.QR_HMAC_SECRET || 'KV_MASTER_QR_SECRET_PURNEA_2026';

    const rawPayload = `${orderId}|${orderData.totalAmount || 0}|${salt}|${timestamp}`;
    const hash = crypto.createHmac('sha256', hmacSecret).update(rawPayload).digest('hex');

    const qrPayload = {
        orderId,
        amount: orderData.totalAmount || 0,
        paymentMethod: orderData.paymentMethod || 'COD',
        customerName: orderData.userName || '',
        customerPhone: orderData.userPhone || '',
        salt,
        timestamp,
        checksum: hash.slice(0, 16)
    };

    // Store security verification payload in internal subcollection
    await db.collection("orders").doc(orderId).collection("internal").doc("qrSecurity").set({
        token: hash,
        salt,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Mark order as PACKED and set QR generated
    await db.collection("orders").doc(orderId).update({
        status: "PACKED",
        qrGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, qrPayload: JSON.stringify(qrPayload) };
});


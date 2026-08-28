const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag, addToOutbox, isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * createOrder: Full logic with inventory, thorough input validation (H2), and transactional safety.
 */
exports.createOrder = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { cartItems, address, paymentMethod, userName, userPhone } = data;

    // H2: Validate cartItems
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new HttpsError('invalid-argument', 'Cart cannot be empty.');
    }
    if (cartItems.length > 100) {
        throw new HttpsError('invalid-argument', 'Cart exceeds maximum items (100).');
    }

    for (const item of cartItems) {
        if (!item.productId || typeof item.productId !== 'string' || item.productId.length > 100) {
            throw new HttpsError('invalid-argument', 'Invalid product ID in cart.');
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) {
            throw new HttpsError('invalid-argument', `Invalid quantity for product ${item.productId}`);
        }
    }

    // H2: Validate address (supports formatted string from Android app or structured object)
    if (!address) {
        throw new HttpsError('invalid-argument', 'Delivery address is required.');
    }
    if (typeof address === 'string') {
        if (address.trim().length < 5 || address.length > 500) {
            throw new HttpsError('invalid-argument', 'Invalid address string length.');
        }
    } else if (typeof address === 'object') {
        const requiredAddressFields = ['line1', 'city', 'state'];
        for (const field of requiredAddressFields) {
            if (!address[field] || typeof address[field] !== 'string' || address[field].trim().length === 0) {
                throw new HttpsError('invalid-argument', `Missing or invalid address field: ${field}`);
            }
        }
    } else {
        throw new HttpsError('invalid-argument', 'Invalid delivery address format.');
    }

    // H2: Validate payment method
    const validPaymentMethods = ['COD', 'RAZORPAY_ONLINE', 'WALLET'];
    if (!validPaymentMethods.includes(paymentMethod)) {
        throw new HttpsError('invalid-argument', 'Invalid payment method.');
    }

    // H2: Validate user details
    if (!userName || typeof userName !== 'string' || userName.trim().length === 0 || userName.length > 100) {
        throw new HttpsError('invalid-argument', 'Invalid user name.');
    }
    const cleanPhone = (userPhone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        throw new HttpsError('invalid-argument', 'Invalid Indian phone number (10 digits starting with 6-9).');
    }

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
                if (!productSnap.exists) {
                    // L1: Generic identifier without unvalidated name reflection
                    throw new Error(`Product not found: ${item.productId}`);
                }
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
                    // L1: Safe error message
                    if (stock < item.quantity) throw new Error(`Out of stock: product ${item.productId}`);
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
                userName: userName.trim(),
                userPhone: `+91${cleanPhone}`,
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
            transaction.set(db.collection("orders").doc(orderId).collection("internal").doc("otp"), {
                value: otp,
                attempts: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            addToOutbox(transaction, "ORDER_CREATED", { orderId, userId: context.auth.uid, status: initialStatus });
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
    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    const isOwner = orderData.userId === context.auth.uid;
    const isAdmin = await isAdminRequest(context);

    if (!isOwner && !isAdmin) {
        throw new HttpsError('permission-denied', 'You do not have permission to cancel this order.');
    }

    // Only allow cancellation if order has not reached out for delivery / delivered
    if (['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(orderData.status) && !isAdmin) {
        throw new HttpsError('failed-precondition', `Cannot cancel order in ${orderData.status} state.`);
    }

    await orderRef.update({
        status: "CANCELLED",
        cancellationReason: reason || "User requested cancellation",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    addToOutbox(null, "ORDER_CANCELLED", { orderId, userId: context.auth.uid });
    return { success: true };
});

/**
 * C1: Hardened verifyDeliveryOTP with rate limiting, expiry, timing safety, and transactional protection.
 */
exports.verifyDeliveryOTP = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, otp } = data;

    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }
    if (!otp || typeof otp !== 'string' || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        throw new HttpsError('invalid-argument', 'OTP must be a 6-digit string.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) {
                throw new Error('Order not found.');
            }

            const orderData = orderSnap.data();
            const isAdmin = await isAdminRequest(context);
            const isAssignedRider = orderData.riderId === context.auth.uid;

            // Verify caller is assigned rider or admin
            if (!isAssignedRider && !isAdmin) {
                throw new Error('Only the assigned delivery rider or admin can verify OTP.');
            }

            // Verify order state
            if (!['OUT_FOR_DELIVERY', 'RIDER_ACCEPTED'].includes(orderData.status) && !isAdmin) {
                throw new Error(`Order cannot be marked delivered from ${orderData.status} state.`);
            }

            const otpRef = orderRef.collection("internal").doc("otp");
            const otpSnap = await transaction.get(otpRef);

            if (!otpSnap.exists) {
                throw new Error('Delivery OTP not found or has expired.');
            }

            const otpData = otpSnap.data();
            const attempts = otpData.attempts || 0;

            // Enforce max 3 attempts
            if (attempts >= 3) {
                transaction.delete(otpRef);
                throw new Error('Maximum OTP verification attempts (3) exceeded. Please generate a new OTP or contact support.');
            }

            // Enforce 15 minutes expiry if createdAt exists
            if (otpData.createdAt && otpData.createdAt.toMillis) {
                const ageMs = Date.now() - otpData.createdAt.toMillis();
                if (ageMs > 15 * 60 * 1000) {
                    transaction.delete(otpRef);
                    throw new Error('Delivery OTP has expired (15 minutes limit).');
                }
            }

            // Constant-time timing-safe comparison
            const otpVal = String(otpData.value || '');
            let isValid = false;
            try {
                isValid = crypto.timingSafeEqual(
                    Buffer.from(otp, 'utf8'),
                    Buffer.from(otpVal, 'utf8')
                );
            } catch (e) {
                isValid = false;
            }

            if (!isValid) {
                transaction.update(otpRef, {
                    attempts: admin.firestore.FieldValue.increment(1),
                    lastFailedAttemptAt: admin.firestore.FieldValue.serverTimestamp()
                });
                const remaining = 2 - attempts;
                throw new Error(`Invalid OTP. ${remaining > 0 ? remaining + ' attempt(s) remaining.' : 'Attempts exceeded.'}`);
            }

            // OTP verified successfully: delete OTP and update order
            transaction.delete(otpRef);

            transaction.update(orderRef, {
                status: "DELIVERED",
                deliveryStatus: "DELIVERED",
                deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
                otpVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            addToOutbox(transaction, "ORDER_DELIVERED", {
                orderId,
                riderId: context.auth.uid,
                userId: orderData.userId,
                deliveredAt: new Date().toISOString()
            });
        });

        return { success: true, message: 'Delivery OTP verified and order marked DELIVERED.' };
    } catch (error) {
        throw new HttpsError('invalid-argument', error.message);
    }
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
 * H1: updateOrderStatus - Validates order ownership and status progression.
 */
exports.updateOrderStatus = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, targetStatus, note, riderId } = data;

    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }
    if (!targetStatus || typeof targetStatus !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid targetStatus.');
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    const isOwner = orderData.userId === context.auth.uid;
    const isAssignedRider = orderData.riderId === context.auth.uid;
    const isAdmin = await isAdminRequest(context);

    if (!isOwner && !isAssignedRider && !isAdmin) {
        throw new HttpsError('permission-denied', 'No permission to update this order.');
    }

    const currentStatus = orderData.status || 'PLACED';
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(targetStatus) && !isAdmin) {
        throw new HttpsError('invalid-argument', `Cannot transition from ${currentStatus} to ${targetStatus}.`);
    }

    const updatePayload = {
        status: targetStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (riderId !== undefined && isAdmin) {
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


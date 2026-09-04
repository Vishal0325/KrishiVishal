const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag, addToOutbox, isAdminRequest } = require("../core/utils");
const {
    reserveOrderStock,
    releaseOrderStock,
    completeOrderStock,
    DEFAULT_WAREHOUSE_ID
} = require("../inventory/inventoryEngine");
const Razorpay = require("razorpay");

const REGION = 'asia-south1';

/**
 * Creates a Razorpay Order server-side to lock the amount.
 * This prevents client-side price tampering — amount is set by the server,
 * not by the app. Razorpay will reject any payment whose amount does not
 * match the locked Razorpay Order.
 */
async function createRazorpayOrder(orderId, totalAmountINR) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars.');
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const rzpOrder = await rzp.orders.create({
        amount: Math.round(totalAmountINR * 100), // paise
        currency: 'INR',
        receipt: orderId,                          // our internal order ID as receipt
        notes: { orderId },                        // makes webhook reconciliation easy
        payment_capture: 1,                        // auto-capture payment
    });

    if (!rzpOrder || !rzpOrder.id) {
        throw new Error('Razorpay order creation returned an invalid response.');
    }

    console.log(`[createOrder] Razorpay Order created: ${rzpOrder.id} for orderId: ${orderId}`);
    return rzpOrder.id;
}

/**
 * createOrder: Full logic with FEFO inventory reservation, input validation, and transactional safety.
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

    // H2: Validate address
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
            const selfStockItems = [];
            let hasOnDemandItems = false;

            for (const item of cartItems) {
                const skuCode = item.skuCode;
                const productId = item.productId;

                if (!skuCode) {
                    throw new Error(`SKU Code is required for item: ${item.productName || item.productId}`);
                }

                const skuRef = db.collection("skus").doc(skuCode);
                const skuSnap = await transaction.get(skuRef);
                if (!skuSnap.exists) {
                    throw new Error(`SKU not found: ${skuCode}`);
                }
                const skuData = skuSnap.data();

                const productRef = db.collection("products").doc(productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) {
                    throw new Error(`Product not found: ${productId}`);
                }
                const product = productSnap.data();

                const itemPrice = Number(skuData.pricing?.consumerPrice || product.discountedPrice || 0);
                const itemMrp = Number(skuData.pricing?.mrp || product.mrp || itemPrice);
                const fulfillmentType = product.fulfillmentType || 'SELF_STOCK';

                if (fulfillmentType === 'ON_DEMAND') {
                    hasOnDemandItems = true;
                    const queueRef = db.collection("procurement_queue").doc();
                    transaction.set(queueRef, {
                        id: queueRef.id,
                        orderId,
                        productId: item.productId,
                        skuCode: skuCode,
                        productName: product.name,
                        quantity: item.quantity,
                        supplierId: product.primarySupplierId || null,
                        status: 'PROCUREMENT_PENDING',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    selfStockItems.push({
                        skuCode,
                        quantity: item.quantity,
                        warehouseId: item.warehouseId || DEFAULT_WAREHOUSE_ID
                    });
                }

                const gstRate = Number(skuData.tax?.gstRate || product.gstRate || 5);
                const itemTax = (itemPrice * item.quantity * gstRate) / 100;
                subtotal += itemMrp * item.quantity;
                totalDiscount += (itemMrp - itemPrice) * item.quantity;
                totalTax += itemTax;

                items.push({
                    productId: item.productId,
                    skuCode: skuCode,
                    productName: product.name,
                    quantity: item.quantity,
                    price: itemPrice,
                    mrp: itemMrp,
                    hsnCode: skuData.tax?.hsnCode || product.hsnCode || "31021010",
                    gstRate: gstRate,
                    gstAmount: itemTax,
                    fulfillmentType,
                    batchAllocations: [] // Will be populated after FEFO reservation
                });
            }

            // Perform atomic FEFO stock reservation for all self-stock items
            if (selfStockItems.length > 0) {
                const reservationResult = await reserveOrderStock(transaction, {
                    orderId,
                    items: selfStockItems,
                    userId: context.auth.uid,
                    idempotencyKey: `ORDER:${orderId}:RESERVE`
                });

                // Attach batch allocations to respective items in order snapshot
                if (reservationResult.allocationsSummary) {
                    for (const allocSummary of reservationResult.allocationsSummary) {
                        const targetItem = items.find(i => i.skuCode === allocSummary.skuCode);
                        if (targetItem) {
                            targetItem.batchAllocations = allocSummary.allocations || [];
                        }
                    }
                }
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
                totalTax,
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

        // ── Razorpay Order Creation (ONLINE payments only) ──────────────────
        // For RAZORPAY_ONLINE, we create a server-side Razorpay Order to lock
        // the amount. The client MUST use this razorpayOrderId when opening the
        // Razorpay SDK — this prevents any client-side amount tampering.
        let razorpayOrderId = null;
        if (paymentMethod === 'RAZORPAY_ONLINE') {
            try {
                razorpayOrderId = await createRazorpayOrder(orderId, finalAmount);
                // Persist the Razorpay Order ID on the order document immediately
                await db.collection("orders").doc(orderId).update({
                    razorpayOrderId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (rzpError) {
                // Razorpay order creation failed — still return orderId so the
                // client can retry. Flag paymentStatus as RAZORPAY_INIT_FAILED
                // so the system doesn't mistakenly mark this as PAID.
                console.error('[createOrder] Razorpay order init failed:', rzpError.message);
                await db.collection("orders").doc(orderId).update({
                    paymentStatus: 'RAZORPAY_INIT_FAILED',
                    razorpayInitError: rzpError.message,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                throw new HttpsError('internal', `Order created but payment init failed: ${rzpError.message}`);
            }
        }

        return {
            orderId,
            totalAmount: finalAmount,
            razorpayOrderId, // null for COD/WALLET, populated for RAZORPAY_ONLINE
        };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
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

    await db.runTransaction(async (transaction) => {
        const oSnap = await transaction.get(orderRef);
        if (!oSnap.exists) throw new Error("Order not found");
        const currentData = oSnap.data();

        if (currentData.status === "CANCELLED") {
            return; // Already cancelled
        }

        // Release reserved inventory
        const selfStockItems = (currentData.items || []).filter(item => item.fulfillmentType !== 'ON_DEMAND');
        if (selfStockItems.length > 0) {
            await releaseOrderStock(transaction, {
                orderId,
                items: selfStockItems,
                actorId: context.auth.uid,
                actorRole: isAdmin ? "ADMIN" : "CUSTOMER",
                reason: reason || "Order cancelled",
                idempotencyKey: `ORDER:${orderId}:CANCEL_RELEASE`
            });
        }

        transaction.update(orderRef, {
            status: "CANCELLED",
            cancellationReason: reason || "User requested cancellation",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        addToOutbox(transaction, "ORDER_CANCELLED", { orderId, userId: context.auth.uid });
    });

    return { success: true };
});

/**
 * requestReturn: Handles customer return requests securely with server validations:
 * 1. User authentication & order ownership check
 * 2. Order status must be DELIVERED
 * 3. 7-day return policy window check
 * 4. Duplicate return prevention
 * 5. Creates return doc in 'returns' collection
 * 6. Updates order returnStatus
 */
exports.requestReturn = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { orderId, reason, customerComment, proofUrls, productId, productName, quantity } = data;

    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid or missing orderId.');
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
        throw new HttpsError('invalid-argument', 'Return reason is required.');
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    if (orderData.userId !== context.auth.uid) {
        throw new HttpsError('permission-denied', 'You can only request returns for your own orders.');
    }

    if (orderData.status !== 'DELIVERED') {
        throw new HttpsError('failed-precondition', `Returns can only be requested for delivered orders. Current status: ${orderData.status}`);
    }

    // Return window check (7 days = 7 * 24 * 60 * 60 * 1000 ms)
    const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const deliveryTimestamp = orderData.deliveredAt || orderData.updatedAt || orderData.createdAt;
    if (deliveryTimestamp) {
        const deliveryDate = deliveryTimestamp.toDate ? deliveryTimestamp.toDate() : new Date(deliveryTimestamp);
        const elapsed = Date.now() - deliveryDate.getTime();
        if (elapsed > RETURN_WINDOW_MS) {
            throw new HttpsError('failed-precondition', 'Return window has expired (7 days from delivery).');
        }
    }

    // Check for existing active return requests for this order
    const existingReturnsSnap = await db.collection("returns")
        .where("orderId", "==", orderId)
        .get();

    const activeReturns = existingReturnsSnap.docs.filter(doc => {
        const status = doc.data().status;
        return !['REJECTED', 'CANCELLED'].includes(status);
    });

    if (activeReturns.length > 0) {
        throw new HttpsError('already-exists', 'An active return request already exists for this order.');
    }

    // Generate unique return ID
    const returnId = "RET-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const targetProduct = (orderData.items && orderData.items.length > 0) ? orderData.items[0] : null;

    const returnDoc = {
        id: returnId,
        orderId,
        userId: context.auth.uid,
        productId: productId || (targetProduct ? targetProduct.productId : "general"),
        productName: productName || (targetProduct ? (targetProduct.productName || targetProduct.name || "Item") : "Ordered Item"),
        quantity: typeof quantity === 'number' && quantity > 0 ? quantity : (targetProduct ? (targetProduct.quantity || 1) : 1),
        reason: reason.trim(),
        customerComment: typeof customerComment === 'string' ? customerComment.trim() : "",
        proofUrls: Array.isArray(proofUrls) ? proofUrls : [],
        status: "REQUESTED",
        refundMethod: orderData.paymentMethod === "RAZORPAY_ONLINE" ? "UPI" : "WALLET",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();
    batch.set(db.collection("returns").doc(returnId), returnDoc);
    batch.update(orderRef, {
        returnStatus: "RETURN_REQUESTED",
        returnId: returnId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    console.log(`[requestReturn] Return request ${returnId} created for order ${orderId} by user ${context.auth.uid}`);

    return {
        returnId,
        status: "REQUESTED",
        message: "Return request submitted successfully."
    };
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

            // OTP verified successfully: delete OTP and complete inventory deduction
            transaction.delete(otpRef);

            // Complete inventory stock mutation atomically
            const selfStockItems = (orderData.items || []).filter(item => item.fulfillmentType !== 'ON_DEMAND');
            if (selfStockItems.length > 0) {
                await completeOrderStock(transaction, {
                    orderId,
                    items: selfStockItems,
                    actorId: context.auth.uid,
                    idempotencyKey: `ORDER:${orderId}:COMPLETE_STOCK`
                });
            }

            transaction.update(orderRef, {
                status: "DELIVERED",
                paymentStatus: "PAID",
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
    const hmacSecret = process.env.QR_HMAC_SECRET;
    if (!hmacSecret) {
        if (process.env.NODE_ENV === 'production' || process.env.FUNCTIONS_EMULATOR !== 'true') {
            console.warn("QR_HMAC_SECRET is not set in environment. Falling back to local default for sandbox testing.");
        }
    }
    const secretToUse = hmacSecret || 'KV_MASTER_QR_SECRET_PURNEA_2026';

    const rawPayload = `${orderId}|${orderData.totalAmount || 0}|${salt}|${timestamp}`;
    const hash = crypto.createHmac('sha256', secretToUse).update(rawPayload).digest('hex');

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


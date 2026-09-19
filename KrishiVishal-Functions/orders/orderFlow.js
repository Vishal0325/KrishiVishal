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
const { validateAndReserveSlot } = require("./deliverySlots");
const Razorpay = require("razorpay");
const { razorpayKeySecret, qrHmacSecret, razorpayKeyId, getSecretVal } = require("../core/secrets");

const REGION = 'asia-south1';

/**
 * Creates a Razorpay Order server-side to lock the amount.
 * This prevents client-side price tampering — amount is set by the server,
 * not by the app. Razorpay will reject any payment whose amount does not
 * match the locked Razorpay Order.
 */
async function createRazorpayOrder(orderId, totalAmountINR) {
    const keyId = getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID');
    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');

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
exports.createOrder = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { cartItems, address, paymentMethod, userName, userPhone, deliverySlotId } = data;

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

    // H2: Validate address — Canonical Structured Object Format
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
        throw new HttpsError('invalid-argument', 'Delivery address must be a structured object { line1, pincode, city, state, ... }.');
    }
    const requiredAddressFields = ['line1', 'city', 'state', 'pincode'];
    for (const field of requiredAddressFields) {
        if (!address[field] || typeof address[field] !== 'string' || address[field].trim().length === 0) {
            throw new HttpsError('invalid-argument', `Missing or invalid address field: ${field}`);
        }
    }
    const cleanPincode = address.pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
        throw new HttpsError('invalid-argument', 'Pincode must be a 6-digit number.');
    }

    const structuredAddress = {
        line1: address.line1.trim(),
        line2: (address.line2 || '').trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        pincode: cleanPincode,
        landmark: (address.landmark || '').trim(),
        lat: typeof address.lat === 'number' ? address.lat : null,
        lng: typeof address.lng === 'number' ? address.lng : null
    };

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
        let subtotal = 0, totalDiscount = 0, totalTax = 0, totalExtraTax = 0;
        let orderOtp = "";

        await db.runTransaction(async (transaction) => {
            // ── PHASE 1: ALL READS FIRST (Strict Firestore Transaction Rule) ──

            // 1. Read settings/config
            const settingsSnap = await transaction.get(db.collection("settings").doc("config"));

            // 2. Read delivery slot (if provided)
            let slotDoc = null;
            let slotRef = null;
            if (deliverySlotId && typeof deliverySlotId === 'string' && deliverySlotId.trim().length > 0) {
                slotRef = db.collection("delivery_slots").doc(deliverySlotId.trim());
                slotDoc = await transaction.get(slotRef);
            }

            // 3. Read all product and SKU documents for cart items
            const fetchedProducts = [];
            for (const item of cartItems) {
                const productId = item.productId || item.skuCode || item.id;
                if (!productId) {
                    throw new HttpsError('invalid-argument', 'Missing productId for cart item.');
                }

                const productRef = db.collection("products").doc(productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) {
                    throw new Error(`Product not found: ${productId}`);
                }

                const skuCode = (item.skuCode && item.skuCode.trim().length > 0) ? item.skuCode : (productSnap.data()?.skuCode || productId);
                let skuData = null;
                let skuRef = null;
                if (skuCode && skuCode !== productId) {
                    skuRef = db.collection("skus").doc(skuCode);
                    const skuSnap = await transaction.get(skuRef);
                    if (skuSnap.exists) {
                        skuData = skuSnap.data();
                    }
                }

                fetchedProducts.push({
                    item,
                    productId,
                    productRef,
                    product: productSnap.data() || {},
                    skuCode,
                    skuRef,
                    skuData
                });
            }

            // ── PHASE 2: IN-MEMORY CALCULATIONS & VALIDATIONS (No Firestore I/O) ──

            // Validate delivery slot
            let reservedSlot = null;
            if (slotDoc) {
                if (!slotDoc.exists) {
                    throw new Error(`Delivery slot not found: ${deliverySlotId}`);
                }
                const sData = slotDoc.data();
                if (!sData.isActive) {
                    throw new Error(`Delivery slot ${deliverySlotId} is no longer active.`);
                }
                const maxCapacity = Number(sData.maxCapacity) || 0;
                const currentBookings = Number(sData.currentBookings) || 0;
                if (currentBookings >= maxCapacity) {
                    throw new Error(`Delivery slot is fully booked (${currentBookings}/${maxCapacity}). Please select another slot.`);
                }
                reservedSlot = {
                    slotId: deliverySlotId,
                    date: sData.date,
                    startTime: sData.startTime,
                    endTime: sData.endTime,
                    hubId: sData.hubId
                };
            }

            // Process items and stock updates
            const items = [];
            const onDemandQueueEntries = [];
            const stockUpdates = [];
            let hasOnDemandItems = false;

            for (const fp of fetchedProducts) {
                const { item, productId, productRef, product, skuCode, skuRef, skuData } = fp;

                const itemPrice = Number(
                    skuData?.pricing?.consumerPrice ||
                    (product.discountedPrice > 0 ? product.discountedPrice : (product.price || product.basePrice || 0))
                );
                const itemMrp = Number(skuData?.pricing?.mrp || product.mrp || product.price || itemPrice);
                const fulfillmentType = product.fulfillmentType || 'SELF_STOCK';

                if (fulfillmentType === 'ON_DEMAND') {
                    hasOnDemandItems = true;
                    const queueRef = db.collection("procurement_queue").doc();
                    onDemandQueueEntries.push({
                        ref: queueRef,
                        data: {
                            id: queueRef.id,
                            orderId,
                            productId: productId,
                            skuCode: skuCode,
                            productName: product.name || 'Unknown Product',
                            quantity: item.quantity,
                            supplierId: product.primarySupplierId || null,
                            status: 'PROCUREMENT_PENDING',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        }
                    });
                } else {
                    if (skuData) {
                        const avail = skuData.inventory?.availableStock || 0;
                        if (avail < item.quantity) {
                            throw new Error(`Insufficient stock for ${skuData.name || skuCode}. Available: ${avail}, Requested: ${item.quantity}`);
                        }
                        stockUpdates.push({
                            type: 'SKU',
                            ref: skuRef,
                            quantity: item.quantity
                        });
                    } else if (product.stock !== undefined && typeof product.stock === 'number') {
                        if (product.stock < item.quantity) {
                            throw new Error(`Insufficient stock for ${product.name || productId}. Available: ${product.stock}, Requested: ${item.quantity}`);
                        }
                        stockUpdates.push({
                            type: 'PRODUCT',
                            ref: productRef,
                            quantity: item.quantity
                        });
                    }
                }

                const gstRate = Number(skuData?.tax?.gstRate || product.gstRate || 0);
                const isTaxInclusive = product.isTaxInclusive !== false; // defaults to true
                
                const itemTotal = itemPrice * item.quantity;
                let itemTax = 0;
                let extraTax = 0;
                
                if (isTaxInclusive) {
                    const taxable = itemTotal / (1 + (gstRate / 100));
                    itemTax = itemTotal - taxable;
                } else {
                    itemTax = (itemTotal * gstRate) / 100;
                    extraTax = itemTax;
                }
                
                subtotal += itemMrp * item.quantity;
                totalDiscount += (itemMrp - itemPrice) * item.quantity;
                totalTax += itemTax;
                totalExtraTax += extraTax;


                items.push({
                    productId: productId,
                    skuCode: skuCode,
                    productName: product.name || 'Unknown Product',
                    imageUrl: product.imageUrl || (Array.isArray(product.images) && product.images[0]) || '',
                    quantity: item.quantity,
                    price: itemPrice,
                    mrp: itemMrp,
                    variantId: item.variantId || null,
                    variantLabel: item.variantLabel || null,
                    hsnCode: skuData?.tax?.hsnCode || product.hsnCode || "31021010",
                    gstRate: gstRate,
                    gstAmount: itemTax,
                    fulfillmentType,
                    batchAllocations: []
                });
            }

            const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
            const configuredDeliveryCharge = Number(settingsData.deliveryCharge) || 50;
            const freeDeliveryAbove = Number(settingsData.freeDeliveryAbove) || 0;
            const netCartValue = subtotal - totalDiscount;
            const deliveryCharge = (freeDeliveryAbove > 0 && netCartValue >= freeDeliveryAbove) ? 0 : configuredDeliveryCharge;
            const totalAmount = netCartValue + totalExtraTax + deliveryCharge;
            const initialStatus = hasOnDemandItems ? "PROCUREMENT_PENDING" : "PLACED";

            const addressString = [
                structuredAddress.line1,
                structuredAddress.line2,
                structuredAddress.city,
                structuredAddress.state,
                structuredAddress.pincode
            ].filter(Boolean).join(", ");

            const otp = crypto.randomInt(1000, 9999).toString();

            const order = {
                id: orderId,
                userId: context.auth.uid,
                userName: userName.trim(),
                userPhone: `+91${cleanPhone}`,
                address: addressString,
                structuredAddress: structuredAddress,
                landmark: structuredAddress.landmark || "",
                customerOTP: otp,
                deliveryOtp: otp,
                items,
                subtotal: netCartValue,
                totalTax,
                deliveryCharge,
                deliveryCharges: deliveryCharge,
                totalAmount,
                paymentMethod,
                paymentStatus: "PENDING",
                status: initialStatus,
                hasOnDemandItems,
                deliverySlotId: deliverySlotId || null,
                deliverySlot: reservedSlot || null,
                targetLat: structuredAddress.lat || 0.0,
                targetLng: structuredAddress.lng || 0.0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // ── PHASE 3: ALL WRITES (Executed at the very end) ──

            // 1. Update delivery slot booking count
            if (slotRef && slotDoc) {
                transaction.update(slotRef, {
                    currentBookings: admin.firestore.FieldValue.increment(1),
                    lastBookedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 2. Decrement inventory stock
            for (const su of stockUpdates) {
                if (su.type === 'SKU') {
                    transaction.update(su.ref, {
                        "inventory.availableStock": admin.firestore.FieldValue.increment(-su.quantity),
                        "inventory.committedStock": admin.firestore.FieldValue.increment(su.quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else if (su.type === 'PRODUCT') {
                    transaction.update(su.ref, {
                        stock: admin.firestore.FieldValue.increment(-su.quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            // 3. Set on-demand queue items
            for (const od of onDemandQueueEntries) {
                transaction.set(od.ref, od.data);
            }

            // 4. Save order document
            transaction.set(db.collection("orders").doc(orderId), order);

            // 5. Store OTP in internal subcollection
            transaction.set(db.collection("orders").doc(orderId).collection("internal").doc("otp"), {
                value: otp,
                attempts: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 6. Outbox notification
            addToOutbox(transaction, "ORDER_CREATED", { orderId, userId: context.auth.uid, status: initialStatus });
            orderOtp = otp;
        });

        // Recalculate for Razorpay (reads from same settings snap — use cached values)
        const settingsForRzp = await db.collection("settings").doc("config").get();
        const stData = settingsForRzp.exists ? settingsForRzp.data() : {};
        const cfgDelivery = Number(stData.deliveryCharge) || 50;
        const cfgFreeAbove = Number(stData.freeDeliveryAbove) || 0;
        const netCart = subtotal - totalDiscount;
        const finalDelivery = (cfgFreeAbove > 0 && netCart >= cfgFreeAbove) ? 0 : cfgDelivery;
        const finalAmount = netCart + totalExtraTax + finalDelivery;

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
            customerOTP: orderOtp,
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

        // Stock release is now handled atomically by Admin Panel's onOrderUpdate trigger
        // which listens to the "CANCELLED" status change and properly updates warehouse_inventory.

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
    if (!otp || typeof otp !== 'string' || !/^\d{4,6}$/.test(otp)) {
        throw new HttpsError('invalid-argument', 'OTP must be a 4 to 6-digit numeric string.');
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
    PACKED: ['READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'ASSIGNED', 'CANCELLED'],
    READY_FOR_PICKUP: ['RIDER_ASSIGNED', 'ASSIGNED', 'RIDER_ACCEPTED', 'PICKED_UP', 'CANCELLED'],
    RIDER_ASSIGNED: ['RIDER_ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'CANCELLED'],
    ASSIGNED: ['RIDER_ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'CANCELLED'],
    RIDER_ACCEPTED: ['OUT_FOR_DELIVERY', 'PICKED_UP', 'RIDER_ASSIGNED', 'ASSIGNED', 'CANCELLED'],
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

    if (isAdmin) {
        const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(targetStatus)) {
            throw new HttpsError('invalid-argument', `Cannot transition from ${currentStatus} to ${targetStatus}.`);
        }
    } else if (isAssignedRider) {
        if (targetStatus === 'DELIVERED') {
            throw new HttpsError('permission-denied', 'DELIVERED status can only be set via verifyDeliveryOTP with customer OTP.');
        }
        const riderAllowed = {
            READY_FOR_PICKUP: ['RIDER_ACCEPTED', 'ASSIGNED', 'RIDER_ASSIGNED'],
            RIDER_ASSIGNED: ['RIDER_ACCEPTED', 'OUT_FOR_DELIVERY', 'PICKED_UP'],
            ASSIGNED: ['RIDER_ACCEPTED', 'OUT_FOR_DELIVERY', 'PICKED_UP'],
            RIDER_ACCEPTED: ['OUT_FOR_DELIVERY', 'PICKED_UP'],
            OUT_FOR_DELIVERY: ['DELIVERY_FAILED']
        };
        const validForRider = riderAllowed[currentStatus] || [];
        if (!validForRider.includes(targetStatus)) {
            throw new HttpsError('permission-denied', `Riders cannot transition order from ${currentStatus} to ${targetStatus}.`);
        }
    } else if (isOwner) {
        const customerAllowed = ['PLACED', 'PAYMENT_CONFIRMED'];
        if (targetStatus !== 'CANCELLED' || !customerAllowed.includes(currentStatus)) {
            throw new HttpsError('permission-denied', 'Customers can only cancel orders in PLACED or PAYMENT_CONFIRMED status.');
        }
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
exports.generateSignedQRPayload = onCall({ region: REGION, secrets: [qrHmacSecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin or Warehouse Manager authorization required.');
    }
    const { orderId } = data;

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    const hmacSecret = getSecretVal(qrHmacSecret, 'QR_HMAC_SECRET');
    if (!hmacSecret) {
        if (process.env.NODE_ENV === 'production' || process.env.FUNCTIONS_EMULATOR !== 'true') {
            console.warn("QR_HMAC_SECRET is not set in environment. Falling back to local default for sandbox testing.");
        }
    }
    const secretToUse = hmacSecret || 'KV_MASTER_QR_SECRET_PURNEA_2026';

    const salt = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
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

/**
 * verifyScannedQR: Validates HMAC-signed QR token for package pickup / handover
 */
exports.verifyScannedQR = onCall({ region: REGION, secrets: [qrHmacSecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const role = (context.auth.token?.role || '').toLowerCase();
    const isPrivileged = ['rider', 'serviceman', 'admin', 'superadmin', 'warehouse_manager'].includes(role) || (await isAdminRequest(context));
    if (!isPrivileged) {
        throw new HttpsError('permission-denied', 'Only authorized personnel can verify QR codes.');
    }

    const { qrPayload } = data;
    if (!qrPayload) throw new HttpsError('invalid-argument', 'Missing qrPayload.');

    let parsed;
    try {
        parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
    } catch (e) {
        throw new HttpsError('invalid-argument', 'Invalid QR JSON payload.');
    }

    const { orderId, amount, salt, timestamp, checksum } = parsed;
    if (!orderId || !salt || !timestamp || !checksum) {
        throw new HttpsError('invalid-argument', 'Incomplete QR data.');
    }

    const hmacSecret = getSecretVal(qrHmacSecret, 'QR_HMAC_SECRET') || 'KV_MASTER_QR_SECRET_PURNEA_2026';
    const rawPayload = `${orderId}|${amount || 0}|${salt}|${timestamp}`;
    const computedHash = crypto.createHmac('sha256', hmacSecret).update(rawPayload).digest('hex');

    if (computedHash.slice(0, 16) !== checksum) {
        throw new HttpsError('permission-denied', 'QR verification failed: Tampered or invalid QR code signature.');
    }

    const secSnap = await db.collection("orders").doc(orderId).collection("internal").doc("qrSecurity").get();
    if (secSnap.exists) {
        const secData = secSnap.data();
        if (secData.token !== computedHash) {
            throw new HttpsError('permission-denied', 'QR security mismatch in internal record.');
        }
    }

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const orderData = orderSnap.data();
    return {
        success: true,
        orderId,
        status: orderData.status,
        totalAmount: orderData.totalAmount,
        paymentMethod: orderData.paymentMethod,
        order: orderData
    };
});


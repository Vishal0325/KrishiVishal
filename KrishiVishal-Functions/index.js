const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const Razorpay = require("razorpay");

admin.initializeApp();
const db = admin.firestore();

const {
    requireAuth,
    requireAdmin,
    requireRider,
    requireOrderOwner,
    requireAssignedRider,
    validateOrderTransition,
    getRequiredSecret
} = require("./src/security_utils");

const { logAudit } = require("./src/audit_utils");

/**
 * ============================================================
 * V4 ENTERPRISE UTILITIES (Circuit Breaker, Feature Flags, etc.)
 * ============================================================
 */

class CircuitBreaker {
    constructor(serviceName, options = {}) {
        this.serviceName = serviceName;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
    }

    async execute(action) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error(`Circuit Breaker [${this.serviceName}] is OPEN.`);
            }
        }
        try {
            const result = await action();
            this.reset();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) this.state = 'OPEN';
    }

    reset() { this.failures = 0; this.state = 'CLOSED'; }
}

const razorpayBreaker = new CircuitBreaker('Razorpay');
const gspBreaker = new CircuitBreaker('GSP');

/**
 * ============================================================
 * GSP ADAPTER ARCHITECTURE (e-Invoice & e-Way Bill)
 * ============================================================
 */

class GSPProvider {
    async authenticate() { throw new Error("Not implemented"); }
    async generateEInvoice(order) { throw new Error("Not implemented"); }
    async cancelEInvoice(irn, reason) { throw new Error("Not implemented"); }
    async generateEWayBill(order) { throw new Error("Not implemented"); }
    async updateEWayBill(ewbNo, data) { throw new Error("Not implemented"); }
    async cancelEWayBill(ewbNo, reason) { throw new Error("Not implemented"); }
    async getStatus(type, id) { throw new Error("Not implemented"); }
}

class MockGSPProvider extends GSPProvider {
    async authenticate() { return "mock_token_" + Date.now(); }
    async generateEInvoice(order) {
        if (order.totalAmount > 1000000) return { status: 'FAILED', error: 'Limit exceeded' };
        return {
            status: 'SUCCESS',
            irn: "MOCK_IRN_" + crypto.randomBytes(4).toString('hex').toUpperCase(),
            ackNo: "ACK" + Date.now()
        };
    }
    async cancelEInvoice(irn, reason) { return { status: 'SUCCESS' }; }
    async generateEWayBill(order) {
        return { status: 'SUCCESS', ewbNo: "EWB" + Date.now() };
    }
    async updateEWayBill(ewbNo, data) { return { status: 'SUCCESS' }; }
    async cancelEWayBill(ewbNo, reason) { return { status: 'SUCCESS' }; }
    async getStatus(type, id) { return { status: 'SUCCESS', data: {} }; }
}

const ClearTaxProvider = require("./src/providers/ClearTaxProvider");

async function getGSPProvider() {
    const config = await db.collection("settings").doc("config").get();
    const gspConfig = config.data()?.gsp || { activeProvider: 'MOCK', mode: 'SANDBOX' };

    // Safety: In Production mode, refuse MOCK unless explicitly allowed for testing
    if (gspConfig.activeProvider === 'MOCK' && gspConfig.mode === 'PRODUCTION') {
        console.warn("CRITICAL: MOCK GSP Provider requested in PRODUCTION mode. Falling back to error.");
        throw new Error("MOCK provider not allowed in production.");
    }

    if (gspConfig.activeProvider === 'CLEARTAX') {
        const authToken = getRequiredSecret('CLEARTAX_AUTH_TOKEN', 'ClearTax API token');
        return new ClearTaxProvider({ authToken, mode: gspConfig.mode });
    }

    if (gspConfig.activeProvider === 'MOCK') return new MockGSPProvider();
    return new MockGSPProvider();
}

async function checkFeatureFlag(flagName) {
    const config = await db.collection("settings").doc("config").get();
    const flags = config.data() || {};
    if (flags.maintenanceMode) throw new functions.https.HttpsError('unavailable', 'System under maintenance.');
    return !!flags[flagName];
}

function addToOutbox(transaction, type, payload) {
    const outboxRef = db.collection("outbox").doc();
    transaction.set(outboxRef, {
        type: type, payload: payload, status: "PENDING",
        retryCount: 0, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/**
 * ============================================================
 * ORIGINAL TRIGGERS (Restored for Backward Compatibility)
 * ============================================================
 */

exports.onEmergencyAlertCreated = functions.firestore
    .document("emergency_alerts/{alertId}")
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        if (!data) return;
        const mapsUrl = `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`;
        const payload = {
            notification: { title: "🚨 EMERGENCY SOS 🚨", body: `${data.riderName || "A Rider"} has triggered an SOS!` },
            data: { riderId: data.riderId, locationUrl: mapsUrl, alertId: context.params.alertId }
        };
        await admin.messaging().sendToTopic("dispatch_team", payload);
    });

/**
 * OPERATIONS: Manage User Roles & Auto-Promote Whitelisted Riders
 */
exports.onUserRoleUpdate = functions.firestore
    .document("users/{userId}")
    .onWrite(async (change, context) => {
        const data = change.after.exists ? change.after.data() : null;
        if (!data) return null;

        // AUTO-PROMOTE: If user registers and phone is in whitelisted_riders
        if (!data.role && data.phone) {
            const rawPhone = data.phone.replace(/\+/g, "").replace(/^91/, ""); // Strip + and 91
            const phoneVariants = [data.phone, `+91${rawPhone}`, rawPhone];

            let whitelistSnap = null;
            let whitelistData = null;

            for (const p of phoneVariants) {
                const snap = await db.collection("whitelisted_riders").doc(p).get();
                if (snap.exists) {
                    whitelistSnap = snap;
                    whitelistData = snap.data();
                    break;
                }
            }

            if (whitelistSnap && whitelistSnap.exists) {
                // Generate Unique 5-Digit ID
                let uniqueId = '';
                let isUnique = false;
                while (!isUnique) {
                    const randomId = Math.floor(10000 + Math.random() * 90000).toString();
                    const check = await db.collection("users").where("riderSerialId", "==", randomId).get();
                    if (check.empty) { uniqueId = randomId; isUnique = true; }
                }

                await change.after.ref.update({
                    role: 'RIDER',
                    name: data.name === "New Rider" || !data.name ? (whitelistData.name || data.name) : data.name,
                    isAdmin: false, // Rider should not have Admin privileges
                    whitelisted: true,
                    riderSerialId: uniqueId,
                    riderIdDisplay: `KV-${uniqueId}`,
                    onboardedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                await db.collection("riders").doc(context.params.userId).set({
                    name: whitelistData.name || data.name,
                    phone: data.phone,
                    riderSerialId: uniqueId,
                    riderIdDisplay: `KV-${uniqueId}`,
                    status: 'ACTIVE',
                    online: false
                }, { merge: true });

                console.log(`Auto-Promoted & Generated ID: KV-${uniqueId} for ${data.phone}`);
                return null;
            }
        }

        // FALLBACK: If user is RIDER (Ensure riders collection is always in sync)
        if (data.role === 'RIDER') {
            let uniqueId = data.riderSerialId;

            // If ID is missing, generate it
            if (!uniqueId) {
                let isUnique = false;
                while (!isUnique) {
                    const randomId = Math.floor(10000 + Math.random() * 90000).toString();
                    const check = await db.collection("users").where("riderSerialId", "==", randomId).get();
                    if (check.empty) { uniqueId = randomId; isUnique = true; }
                }
                await change.after.ref.update({
                    riderSerialId: uniqueId,
                    riderIdDisplay: `KV-${uniqueId}`
                });
            }

            // ALWAYS ensure entry exists in 'riders' collection
            await db.collection("riders").doc(context.params.userId).set({
                name: data.name || "New Rider",
                phone: data.phone || "",
                riderSerialId: uniqueId,
                riderIdDisplay: `KV-${uniqueId}`,
                status: data.status || 'ACTIVE',
                online: data.online || false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`Synced Rider Collection for: ${context.params.userId}`);
        }

        // CUSTOM CLAIMS: Admin / Rider access control
        // HARDENING: A user with 'RIDER' role should never have 'admin' claim
        const claims = {
            admin: data.role === 'RIDER' ? false : !!data.isAdmin,
            role: data.role || null,
            isRider: data.role === 'RIDER',
            isActive: data.isActive !== false
        };

        await admin.auth().setCustomUserClaims(context.params.userId, claims);

        await logAudit("USER_CLAIMS_UPDATED", context.params.userId, { claims });
        return null;
    });

exports.onProductUpdate = functions.firestore
    .document("products/{productId}")
    .onUpdate(async (change) => {
        const after = change.after.data();
        const settingsSnap = await db.collection("settings").doc("config").get();
        const threshold = settingsSnap.data()?.lowStockThreshold || 10;
        if (after.stockQuantity <= threshold) {
            await admin.messaging().sendToTopic("admin_alerts", {
                notification: { title: "📦 LOW STOCK ALERT", body: `${after.name} is low! Only ${after.stockQuantity} left.` }
            });
        }
    });

/**
 * onOrderDelivered: Triggered when order status is updated.
 * CLEANED: Stock deduction removed from here because it is now handled
 * transactionally in createOrder (Stock Reservation pattern).
 */
exports.onOrderDelivered = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const before = change.before.data();

        // Log delivery for analytics, but don't deduct stock again!
        if (before.status !== "DELIVERED" && after.status === "DELIVERED") {
            console.log(`Order ${context.params.orderId} delivered successfully.`);
        }
        return null;
    });

exports.auditProductChange = functions.firestore
    .document("products/{productId}")
    .onWrite(async (change, context) => {
        const action = !change.before.exists ? "CREATE" : !change.after.exists ? "DELETE" : "UPDATE";
        const data = change.after.exists ? change.after.data() : change.before.data();
        await db.collection("audit_logs").add({
            action: `${action}_PRODUCT`, resourceId: context.params.productId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(), details: { name: data?.name }
        });
    });

/**
 * ============================================================
 * V4 NEW CORE FUNCTIONS (GST, AI, Ledger, Outbox)
 * ============================================================
 */

/**
 * createOrder: Hardened order creation with server-side pricing, stock checks, and strict validation.
 * Ensures cart validation, server-side source of truth for prices, and transactional stock updates.
 */
exports.createOrder = functions.runWith({
    minInstances: 1,
    memory: "512MB"
}).https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const { cartItems, address, paymentMethod, userName, userPhone } = data;

    // 1. Mandatory Input Validation (Correction 6)
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Cart must be a non-empty array.');
    }

    if (cartItems.length > 50) {
        throw new functions.https.HttpsError('invalid-argument', 'Cart exceeds maximum allowed items.');
    }

    // Basic structure validation for address and contact
    if (!address || (typeof address !== 'object' && typeof address !== 'string')) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid delivery address required.');
    }

    const validPaymentMethods = ['COD', 'ONLINE', 'WALLET'];
    if (!validPaymentMethods.includes(paymentMethod)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid payment method.');
    }

    if (paymentMethod === 'ONLINE') {
        const onlineEnabled = await checkFeatureFlag('enableOnlinePayments');
        if (!onlineEnabled) throw new functions.https.HttpsError('failed-precondition', "Online payments are currently disabled.");
    }
    
    try {
        const orderId = db.collection("orders").doc().id;
        let totalAmount = 0;
        let totalTax = 0;

        const result = await db.runTransaction(async (transaction) => {
            const items = [];

            // 1. Collect all product and cost references first (ALL READS MUST BE FIRST)
            const productRefs = cartItems.map(item => {
                if (!item.productId || typeof item.productId !== 'string') {
                    throw new Error("Invalid productId in cart.");
                }
                return db.collection("products").doc(item.productId);
            });
            const costRefs = cartItems.map(item => db.collection("product_costs").doc(item.productId));

            const productSnaps = await transaction.getAll(...productRefs);
            const costSnaps = await transaction.getAll(...costRefs);

            const productDataMap = {};
            productSnaps.forEach(snap => { if (snap.exists) productDataMap[snap.id] = snap.data(); });

            const costDataMap = {};
            costSnaps.forEach(snap => { if (snap.exists) costDataMap[snap.id] = snap.data(); });

            for (const item of cartItems) {
                const product = productDataMap[item.productId];

                // 2. Product and Quantity Validation
                if (!product) throw new Error(`Product ${item.productId} not found.`);
                if (product.isActive === false) throw new Error(`Product ${product.name} is currently unavailable.`);

                const qty = Number(item.quantity);
                if (!Number.isInteger(qty) || qty <= 0) {
                    throw new Error(`Invalid quantity for ${product.name}. Must be a positive integer.`);
                }

                const MAX_QTY_PER_ITEM = 100;
                if (qty > MAX_QTY_PER_ITEM) {
                    throw new Error(`Quantity for ${product.name} exceeds maximum limit of ${MAX_QTY_PER_ITEM}.`);
                }

                // 3. Price Source of Truth (Task 8 - Price comes only from server)
                const price = Number(product.discountedPrice || product.price);
                const gstRate = Number(product.gstRate || 0);

                const costData = costDataMap[item.productId] || {};
                let itemCost = Number(costData.costPrice || 0);

                if (item.variantId && costData.variantsCost && costData.variantsCost[item.variantId]) {
                    itemCost = Number(costData.variantsCost[item.variantId]);
                }

                const itemTax = (price * qty * gstRate) / 100;
                totalAmount += (price * qty) + itemTax;
                totalTax += itemTax;

                items.push({
                    productId: item.productId,
                    variantId: item.variantId || null,
                    quantity: qty,
                    productName: product.name,
                    price, // authoritative
                    gstRate,
                    costPrice: itemCost,
                    hsnCode: product.hsnCode || "",
                    imageUrl: product.imageUrl || ""
                });

                // 4. Transactional Stock Check and Update
                const productRef = db.collection("products").doc(item.productId);
                const currentStock = Number(product.stockQuantity || 0);

                if (currentStock < qty) {
                    throw new Error(`Insufficient stock for ${product.name}. Available: ${currentStock}`);
                }

                transaction.update(productRef, {
                    stockQuantity: admin.firestore.FieldValue.increment(-qty),
                    stock: admin.firestore.FieldValue.increment(-qty)
                });

                if (item.variantId) {
                    const variantRef = productRef.collection("variants").doc(item.variantId);
                    const variantSnap = await transaction.get(variantRef);
                    if (!variantSnap.exists) throw new Error(`Variant ${item.variantId} not found for ${product.name}`);

                    const variantStock = Number(variantSnap.data().stock || 0);
                    if (variantStock < qty) throw new Error(`Variant for ${product.name} out of stock.`);

                    transaction.update(variantRef, {
                        stock: admin.firestore.FieldValue.increment(-qty)
                    });
                }
            }

            // Generate high-entropy 6-digit OTP
            const customerOTP = crypto.randomInt(100000, 999999).toString();

            const order = {
                id: orderId,
                userId: uid,
                userName: userName || "Customer",
                userPhone: userPhone || "",
                address,
                items,
                totalAmount: Math.round(totalAmount * 100) / 100,
                totalTax: Math.round(totalTax * 100) / 100,
                paymentMethod,
                paymentStatus: "PENDING",
                status: "PLACED",
                customerOTP,
                otpCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
                otpRetryCount: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            transaction.set(db.collection("orders").doc(orderId), order);
            addToOutbox(transaction, "ORDER_CREATED", { orderId, userId: uid });

            return { orderId, totalAmount: order.totalAmount, customerOTP };
        });

        await logAudit({
            action: "ORDER_CREATED",
            actorId: uid,
            targetId: orderId,
            targetType: "ORDER",
            metadata: { total: result.totalAmount }
        });

        return result;
    } catch (e) {
        console.error("createOrder Error:", e);
        throw new functions.https.HttpsError('internal', e.message);
    }
});

/**
 * verifyPayment: Hardened verification for Razorpay payments.
 * Implements authentication, ownership, Razorpay ID matching, HMAC signature verification,
 * amount/currency validation, and audit logging.
 */
exports.verifyPayment = functions.runWith({ secrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] }).https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing mandatory payment verification fields.');
    }

    const razorpaySecret = getRequiredSecret('RAZORPAY_KEY_SECRET', 'Razorpay signing secret');
    const razorpayKeyId = getRequiredSecret('RAZORPAY_KEY_ID', 'Razorpay account key');

    // 1. Fetch Order and Verify Ownership/Existence
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'Order not found.');
    const order = orderSnap.data();

    requireOrderOwner(order, context);

    // 2. Already Paid Protection
    if (order.paymentStatus === 'PAID') {
        return { success: true, message: "Order already marked as paid." };
    }

    // 3. HMAC Signature Verification
    const expectedSignature = crypto.createHmac("sha256", razorpaySecret)
        .update(razorpayOrderId + "|" + razorpayPaymentId).digest("hex");

    if (expectedSignature !== razorpaySignature) {
        await logAudit({
            action: "PAYMENT_SIGNATURE_MISMATCH",
            actorId: uid,
            targetId: orderId,
            targetType: "ORDER",
            metadata: { razorpayOrderId, razorpayPaymentId }
        });
        throw new functions.https.HttpsError("invalid-argument", "Invalid payment signature.");
    }

    // 4. Fetch actual payment details from Razorpay for validation (Task 3.7, 3.8)
    try {
        const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpaySecret });
        const payment = await razorpayBreaker.execute(() => razorpay.payments.fetch(razorpayPaymentId));

        // 4a. Razorpay Order ID Matching (Task 3.4)
        if (payment.order_id !== razorpayOrderId) {
            throw new Error("Razorpay Order ID mismatch.");
        }

        // 4b. Amount and Currency Validation (Task 3.7, 3.8)
        // Razorpay amounts are in paise
        const expectedPaise = Math.round(order.totalAmount * 100);
        if (payment.amount !== expectedPaise) {
            console.error(`Amount mismatch: Razorpay=${payment.amount}, Order=${expectedPaise}`);
            throw new Error("Payment amount mismatch.");
        }

        if (payment.currency !== 'INR') {
            throw new Error("Payment currency mismatch.");
        }

        if (payment.status !== 'captured') {
            // Note: In some flows it might be 'authorized', but we expect 'captured' for delivery
            console.warn(`Payment status is ${payment.status}, expected captured.`);
        }

        // 5. Atomic Update and Audit
        await db.runTransaction(async (transaction) => {
            const freshOrderSnap = await transaction.get(orderRef);
            const freshOrder = freshOrderSnap.data();

            if (freshOrder.paymentStatus === 'PAID') return; // Idempotency guard

            validateOrderTransition(freshOrder.status, 'CONFIRMED', context);

            transaction.update(orderRef, {
                paymentStatus: "PAID",
                paymentMethod: "ONLINE",
                status: "CONFIRMED",
                razorpayPaymentId,
                razorpayOrderId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Ledger Posting (or let the trigger handle it)
            // The trigger exports.onOrderPaidLedger will pick this up
        });

        await logAudit({
            action: "PAYMENT_VERIFIED",
            actorId: uid,
            targetId: orderId,
            targetType: "ORDER",
            metadata: { method: 'RAZORPAY', razorpayPaymentId }
        });

        return { success: true };
    } catch (e) {
        console.error("verifyPayment Error:", e);
        throw new functions.https.HttpsError('internal', e.message || "Payment verification failed.");
    }
});

/**
 * initiateRefund: Securely initiate a refund for a returned order.
 * Enforces admin authorization, eligibility checks, amount validation, and audit logging.
 */
exports.initiateRefund = functions.runWith({ secrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] }).https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    requireAdmin(context);

    const { returnId, refundAmount } = data;

    if (!returnId || refundAmount === undefined) {
        throw new functions.https.HttpsError('invalid-argument', 'Return ID and refund amount are required.');
    }

    const amount = Number(refundAmount);
    if (isNaN(amount) || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Refund amount must be a positive number.');
    }

    const keyId = getRequiredSecret('RAZORPAY_KEY_ID', 'Razorpay account key');
    const keySecret = getRequiredSecret('RAZORPAY_KEY_SECRET', 'Razorpay signing secret');

    try {
        const result = await db.runTransaction(async (transaction) => {
            const returnRef = db.collection("returns").doc(returnId);
            const returnSnap = await transaction.get(returnRef);
            if (!returnSnap.exists) throw new Error('Return request not found.');
            const returnData = returnSnap.data();

            if (returnData.refundStatus === 'COMPLETED') {
                throw new Error("Refund already completed for this return.");
            }

            const orderRef = db.collection("orders").doc(returnData.orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Associated order not found.');
            const orderData = orderSnap.data();

            // 1. Amount Validation (Correction 10)
            const maxRefund = Number(orderData.totalAmount);
            if (amount > maxRefund) {
                throw new Error(`Refund amount ₹${amount} exceeds order total ₹${maxRefund}`);
            }

            // 2. COD vs Online Logic
            if (orderData.paymentMethod === 'COD') {
                transaction.update(returnRef, {
                    refundStatus: "COMPLETED",
                    status: "COMPLETED",
                    refundAmount: amount,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return { type: 'COD', orderId: orderData.id };
            } else {
                // Online Refund via Razorpay
                const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

                // We perform the external API call outside the transaction if possible,
                // but for strong consistency we mark as 'PROCESSING' first.
                transaction.update(returnRef, { refundStatus: 'PROCESSING' });
                return { type: 'ONLINE', orderId: orderData.id, razorpayPaymentId: orderData.razorpayPaymentId };
            }
        });

        if (result.type === 'ONLINE') {
            const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
            const refund = await razorpayBreaker.execute(() => razorpay.payments.refund(result.razorpayPaymentId, {
                amount: Math.round(amount * 100),
                notes: { returnId, orderId: result.orderId, actorId: uid }
            }));

            await db.collection("returns").doc(returnId).update({
                refundStatus: "COMPLETED",
                gatewayRefundId: refund.id,
                status: "COMPLETED",
                refundAmount: amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await logAudit({
                action: "REFUND_ONLINE",
                actorId: uid,
                targetId: returnId,
                targetType: "RETURN",
                metadata: { orderId: result.orderId, amount, gatewayRefundId: refund.id }
            });
        } else {
            await logAudit({
                action: "REFUND_COD",
                actorId: uid,
                targetId: returnId,
                targetType: "RETURN",
                metadata: { orderId: result.orderId, amount }
            });
        }

        return { success: true };
    } catch (e) {
        console.error("Refund failed:", e);
        throw new functions.https.HttpsError('internal', `Refund failed: ${e.message}`);
    }
});

/**
 * AI: Approve Action Request (SuperAdmin Only)
 */
exports.approveAiAction = functions.https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'SuperAdmin only.');
    const { requestId } = data;

    const reqRef = db.collection("ai_action_requests").doc(requestId);
    const snap = await reqRef.get();

    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Request not found.');
    const request = snap.data();

    if (request.status !== 'PENDING') throw new functions.https.HttpsError('failed-precondition', 'Request is not pending.');

    await reqRef.update({
        status: 'APPROVED',
        approvedBy: {
            uid: context.auth.uid,
            email: context.auth.token.email,
            role: 'SuperAdmin'
        },
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: `Action ${requestId} approved and queued.` };
});

/**
 * AI: Reject Action Request (SuperAdmin Only)
 */
exports.rejectAiAction = functions.https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'SuperAdmin only.');
    const { requestId, reason } = data;

    if (!reason) throw new functions.https.HttpsError('invalid-argument', 'Rejection reason required.');

    const reqRef = db.collection("ai_action_requests").doc(requestId);
    await reqRef.update({
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedBy: {
            uid: context.auth.uid,
            email: context.auth.token.email
        },
        rejectedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});

/**
 * AI: Get System Health Metrics
 */
exports.getAiSystemHealth = functions.https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'Admin only.');

    const logs = await db.collection("ai_activity_logs").orderBy("timestamp", "desc").limit(100).get();
    const actions = await db.collection("ai_action_requests").get();

    return {
        requestsToday: logs.size,
        pendingApprovals: actions.docs.filter(d => d.data().status === 'PENDING').length,
        completedActions: actions.docs.filter(d => d.data().status === 'COMPLETED').length,
        rejectedActions: actions.docs.filter(d => d.data().status === 'REJECTED').length,
        lastActive: logs.docs[0]?.data().timestamp || null
    };
});

exports.aiSupervisor = functions.https.onCall(async (data, context) => {
    requireAdmin(context);

    // EMERGENCY KILL SWITCH
    const config = await db.collection("settings").doc("config").get();
    if (config.data()?.disableAiSupervisor) {
        throw new functions.https.HttpsError('unavailable', 'AI Supervisor is temporarily disabled by SuperAdmin.');
    }

    const { prompt } = data; // Prompt is now the ONLY required input from frontend
    const startTime = Date.now();

    // 1. Intent Classification (Server-side)
    let agentType = 'GENERAL';
    const lowerPrompt = (prompt || "").toLowerCase();

    // Inventory Detection
    if (["stock", "inventory", "saaman", "maal", "product", "daam", "price", "adjustment"].some(k => lowerPrompt.includes(k))) agentType = 'INVENTORY';
    // Finance Detection
    if (["money", "finance", "paisa", "bikri", "munafa", "profit", "revenue", "gst", "hisab"].some(k => lowerPrompt.includes(k))) agentType = 'FINANCE';
    // SLA / Operations
    if (["order", "late", "status", "rider", "delivery", "sla"].some(k => lowerPrompt.includes(k))) agentType = 'OPERATIONS';
    // Analytics / Health
    if (["health", "error", "logs", "traffic", "performance", "realtime"].some(k => lowerPrompt.includes(k))) agentType = 'ANALYTICS';

    let response = { message: "I am KrishiVishal AI. How can I help you manage the business?", agentType };

    try {
        if (agentType === 'ANALYTICS') {
            const tenMinsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 600000);
            const errorLogs = await db.collection("ai_activity_logs")
                .where("status", "==", "ERROR")
                .where("timestamp", ">=", tenMinsAgo)
                .get();

            const totalCalls = await db.collection("ai_activity_logs")
                .where("timestamp", ">=", tenMinsAgo)
                .count().get();

            response = {
                message: `App health is GOOD. ${errorLogs.size} errors in the last 10 mins across ${totalCalls.data().count} total AI calls.`,
                data: { errorRate: errorLogs.size / (totalCalls.data().count || 1), recentErrors: errorLogs.size },
                agentType: 'ANALYTICS',
                verified: true
            };
        } else if (agentType === 'FINANCE') {
            const accounts = await db.collection("accounts").get();
            const accData = accounts.docs.map(d => ({ id: d.id, balance: d.data().balance }));
            response = {
                message: "Financial summary generated from the immutable ledger.",
                data: accData,
                agentType: 'FINANCE',
                verified: true,
                source: 'ledger'
            };
        } else if (agentType === 'INVENTORY') {
            if (lowerPrompt.includes("total") || lowerPrompt.includes("kitne")) {
                const countSnap = await db.collection("products").count().get();
                response = {
                    message: `Hamare paas total ${countSnap.data().count} products hain.`,
                    data: { totalProducts: countSnap.data().count },
                    agentType: 'INVENTORY',
                    verified: true
                };
            } else {
                const lowStock = await db.collection("products").where("stockQuantity", "<", 10).limit(10).get();
                const items = lowStock.docs.map(d => ({ id: d.id, name: d.data().name, stock: d.data().stockQuantity, price: d.data().price }));

                // PROPOSE ACTION (SENSITIVE)
                let proposedActionId = null;
                if (lowerPrompt.includes("fix") && items.length > 0) {
                    const actionRef = db.collection("ai_action_requests").doc();
                    await actionRef.set({
                        action: 'UPDATE_PRICE',
                        targetId: items[0].id,
                        reason: "Stock velocity correction",
                        status: 'PENDING',
                        riskLevel: 'HIGH',
                        params: { productId: items[0].id, newPrice: items[0].price * 1.1 },
                        requestedBy: 'AI_SUPERVISOR',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    proposedActionId = actionRef.id;
                }

                response = {
                    message: proposedActionId ? "Action proposed for low stock." : "Inventory audit complete.",
                    data: items,
                    proposedActionId,
                    agentType: 'INVENTORY',
                    verified: true
                };
            }
        }

        // Log AI Activity with Trace
        await db.collection("ai_activity_logs").add({
            prompt,
            agentType,
            requestedBy: context.auth.token.email,
            uid: context.auth.uid,
            responseTimeMs: Date.now() - startTime,
            status: 'SUCCESS',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return response;
    } catch (error) {
        await db.collection("ai_activity_logs").add({
            prompt, agentType, status: 'ERROR', error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * GSP: Generate Finance Summary (Admin Only)
 * Aggregates ledger data on server-side for the dashboard.
 */
exports.getFinanceSummary = functions.runWith({
    memory: "512MB"
}).https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'Admin only.');

    const { startDate, endDate } = data; // ISO Strings
    const start = admin.firestore.Timestamp.fromDate(new Date(startDate));
    const end = admin.firestore.Timestamp.fromDate(new Date(endDate));

    try {
        const query = db.collection("ledger")
            .where("timestamp", ">=", start)
            .where("timestamp", "<=", end);

        const snapshot = await query.get();
        const metrics = {
            totalRevenue: 0,
            cogs: 0,
            expenses: 0,
            gstCollected: 0,
            refunds: 0,
            returnsCount: 0,
            ordersCount: 0
        };

        snapshot.forEach(doc => {
            const entry = doc.data();
            const amt = Number(entry.amount || 0);

            switch (entry.account) {
                case 'SALES':
                    if (entry.type === 'CREDIT') metrics.totalRevenue += amt;
                    if (entry.type === 'DEBIT') metrics.refunds += amt;
                    break;
                case 'GST_PAYABLE':
                    if (entry.type === 'CREDIT') metrics.gstCollected += amt;
                    break;
                case 'EXPENSE':
                case 'PURCHASE':
                    metrics.expenses += amt;
                    break;
                case 'COGS':
                    if (entry.type === 'DEBIT') metrics.cogs += amt;
                    if (entry.type === 'CREDIT') metrics.cogs -= amt; // reversal
                    break;
            }
        });

        const grossProfit = metrics.totalRevenue - metrics.cogs;
        const netProfit = grossProfit - metrics.expenses;

        return {
            ...metrics,
            grossProfit,
            netProfit,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.processOutbox = functions.firestore.document("outbox/{id}").onCreate(async (snap) => {
    const event = snap.data();
    if (event.type === "ORDER_CREATED") {
        await admin.messaging().sendToTopic("admin_alerts", { notification: { title: "New Order", body: `Order ${event.payload.orderId} placed.` } });
    }
    return snap.ref.update({ status: "COMPLETED", processedAt: admin.firestore.FieldValue.serverTimestamp() });
});

exports.onOrderPaidLedger = functions.firestore.document("orders/{id}").onUpdate(async (change, context) => {
    const newData = change.after.data(); const oldData = change.before.data();

    // FIXED: Trigger on paymentStatus instead of status (Correction for Finance Zero issue)
    const isNowPaid = newData.paymentStatus === 'PAID' && oldData.paymentStatus !== 'PAID';

    if (isNowPaid && !newData.ledgerPosted) {
        const orderId = context.params.id;

        // Double check ledger for referenceId to ensure absolute idempotency
        const existingEntries = await db.collection("ledger")
            .where("referenceId", "==", orderId)
            .where("account", "==", "SALES")
            .limit(1)
            .get();

        if (!existingEntries.empty) {
            console.log(`Ledger entry already exists for Order: ${orderId}. Marking as posted.`);
            await db.collection("orders").doc(orderId).update({ ledgerPosted: true });
            return null;
        }

        const totalAmount = Number(newData.totalAmount || 0);
        const totalTax = Number(newData.totalTax || 0);
        const netSales = totalAmount - totalTax;

        try {
            const batch = db.batch();
            let totalCogs = 0;

            // 0. Calculate COGS (Cost of Goods Sold) from product cost data
            if (newData.items) {
                for (const item of newData.items) {
                    const cost = Number(item.costPrice || 0);
                    const qty = Number(item.quantity || 1);
                    totalCogs += (cost * qty);
                }
            }

            // 1. Credit SALES (Revenue)
            batch.set(db.collection("ledger").doc(), {
                account: 'SALES', type: 'CREDIT', amount: netSales,
                description: `Order #${orderId} Sales Revenue`,
                referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Credit GST_PAYABLE (Tax)
            if (totalTax > 0) {
                batch.set(db.collection("ledger").doc(), {
                    account: 'GST_PAYABLE', type: 'CREDIT', amount: totalTax,
                    description: `Order #${orderId} GST Component`,
                    referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 3. Debit RAZORPAY_PENDING, CASH_IN_HAND or WALLET (Asset)
            let assetAccount = 'CASH_IN_HAND';
            if (newData.paymentMethod === 'WALLET') assetAccount = 'WALLET_BALANCE';
            else if (newData.paymentMethod === 'ONLINE') assetAccount = 'RAZORPAY_PENDING';

            batch.set(db.collection("ledger").doc(), {
                account: assetAccount, type: 'DEBIT', amount: totalAmount,
                description: `Order #${orderId} Payment Received (${newData.paymentMethod})`,
                referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Debit COGS & Credit INVENTORY
            if (totalCogs > 0) {
                batch.set(db.collection("ledger").doc(), {
                    account: 'COGS', type: 'DEBIT', amount: totalCogs,
                    description: `Cost of Goods Sold for #${orderId}`,
                    referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                batch.set(db.collection("ledger").doc(), {
                    account: 'INVENTORY', type: 'CREDIT', amount: totalCogs,
                    description: `Inventory Reduction for #${orderId}`,
                    referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 5. Mark order as posted to prevent duplicates
            batch.update(db.collection("orders").doc(orderId), { ledgerPosted: true });

            // 6. Update Product Sales Stats (Smart Notifications Support)
            const items = newData.items || [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const item of items) {
                const productId = item.productId;
                const quantity = item.quantity || 1;

                // Increment lifetime sales
                batch.update(db.collection("products").doc(productId), {
                    salesCount: admin.firestore.FieldValue.increment(quantity)
                });

                // Record daily sale for rolling 90d popularity
                const statId = `${productId}_${today.toISOString().split('T')[0]}`;
                batch.set(db.collection("sales_stats").doc(statId), {
                    productId,
                    date: admin.firestore.Timestamp.fromDate(today),
                    quantity: admin.firestore.FieldValue.increment(quantity)
                }, { merge: true });
            }

            // 7. Update User Interests (Smart Notifications)
            const userId = newData.userId;
            if (userId) {
                const categories = [...new Set(items.map(i => i.category).filter(c => !!c))];
                if (categories.length > 0) {
                    batch.update(db.collection("users").doc(userId), {
                        interestedCategories: admin.firestore.FieldValue.arrayUnion(...categories)
                    });
                }
            }

            await batch.commit();
            console.log(`Enterprise Ledger + COGS posted for Order: ${orderId}`);
        } catch (e) {
            console.error("Ledger posting failed:", e);
        }
    }
});

/**
 * SYNC: Automatically assign return pickup to original delivery rider
 */
exports.onReturnRequestCreated = functions.firestore
    .document("returns/{returnId}")
    .onCreate(async (snap, context) => {
        const returnData = snap.data();
        const orderId = returnData.orderId;

        if (!orderId) return null;

        try {
            // 1. Find original rider from order history
            const orderDoc = await admin.firestore().collection("orders").doc(orderId).get();
            if (!orderDoc.exists) return null;

            const originalRiderId = orderDoc.data().riderId;

            if (originalRiderId) {
                // 2. Assign and update status
                await snap.ref.update({
                    riderId: originalRiderId,
                    status: "PICKUP_SCHEDULED",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 3. Notify Rider via FCM
                const riderDoc = await admin.firestore().collection("riders").doc(originalRiderId).get();
                const fcmToken = riderDoc.data()?.fcmToken;

                if (fcmToken) {
                    await admin.messaging().send({
                        notification: {
                            title: "New Return Pickup 📦",
                            body: `Return assigned for Order #${orderId.slice(-8).toUpperCase()}`,
                        },
                        data: { type: "RETURN_PICKUP", returnId: context.params.returnId },
                        token: fcmToken
                    });
                }
            }
            return null;
        } catch (e) {
            console.error("Auto-assign return failed:", e);
            return null;
        }
    });

/**
 * OPERATIONS: Monitor Order SLAs and send active nudges (Rider Intelligence)
 */
exports.monitorOrderSLA = functions.pubsub.schedule("every 30 minutes").onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const thirtyMinsAgo = new Date(now.toDate().getTime() - 30 * 60 * 1000);
    const oneHourAgo = new Date(now.toDate().getTime() - 60 * 60 * 1000);

    try {
        // 1. Nudge for Delayed Pickup
        const delayedPickups = await db.collection("orders")
            .where("status", "==", "ASSIGNED")
            .where("updatedAt", "<", thirtyMinsAgo)
            .limit(50)
            .get();

        for (const order of delayedPickups.docs) {
            const data = order.data();
            if (data.riderId) {
                await admin.messaging().send({
                    notification: { title: "🚚 Pickup Reminder", body: `Order #${order.id.slice(0,8)} is waiting for pickup!` },
                    token: (await db.collection("users").doc(data.riderId).get()).data()?.fcmToken
                }).catch(() => {});
            }
        }

        // 2. Alert for Delayed Delivery
        const delayedDeliveries = await db.collection("orders")
            .where("status", "==", "OUT_FOR_DELIVERY")
            .where("updatedAt", "<", oneHourAgo)
            .limit(50)
            .get();

        if (delayedDeliveries.size > 0) {
            await admin.messaging().sendToTopic("admin_alerts", {
                notification: { title: "🚨 Delivery Delay", body: `${delayedDeliveries.size} orders are taking longer than 1 hour to deliver.` }
            });
        }

        console.log(`SLA Audit complete. Nudges sent for ${delayedPickups.size} orders.`);
    } catch (e) {
        console.error("SLA Monitor failed:", e);
    }
});

/**
 * OPERATIONS: Update Rider Performance Scorecard
 */
exports.onOrderDeliveryUpdate = functions.firestore.document("orders/{id}").onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    const riderId = newData.riderId;

    if (!riderId) return;

    // Trigger only on final states
    const finalStates = ['DELIVERED', 'CANCELLED', 'RETURNED'];
    if (finalStates.includes(newData.status) && oldData.status !== newData.status) {
        const perfRef = db.collection("rider_performance").doc(riderId);

        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(perfRef);
            const stats = snap.exists ? snap.data() : {
                totalAssigned: 0, successful: 0, cancelled: 0,
                totalDeliveryTimeMs: 0, ratingsSum: 0, ratingsCount: 0
            };

            stats.totalAssigned += 1;
            if (newData.status === 'DELIVERED') {
                stats.successful += 1;
                // Calculate delivery time if timestamps exist
                if (newData.assignedAt && newData.deliveredAt) {
                    const duration = newData.deliveredAt.toDate() - newData.assignedAt.toDate();
                    stats.totalDeliveryTimeMs += duration;
                }
            } else {
                stats.cancelled += 1;
            }

            transaction.set(perfRef, { ...stats, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        console.log(`Performance updated for Rider: ${riderId}`);
    }
});

exports.onReturnStatusUpdate = functions.firestore.document("returns/{id}").onUpdate(async (change) => {
    const newData = change.after.data();
    if (newData.qcStatus === "PASSED") {
        await db.collection("products").doc(newData.productId).update({ stockQuantity: admin.firestore.FieldValue.increment(newData.quantity) });
    }
});

exports.onReturnCompletedLedger = functions.firestore.document("returns/{id}").onUpdate(async (change, context) => {
    const newData = change.after.data(); const oldData = change.before.data();

    // GUARD: Only post if status changes to COMPLETED and it hasn't been posted yet
    if (newData.status === 'COMPLETED' && oldData.status !== 'COMPLETED' && !newData.ledgerPosted) {
        const returnId = context.params.id;

        // Double check ledger for referenceId to ensure absolute idempotency
        const existingEntries = await db.collection("ledger")
            .where("referenceId", "==", returnId)
            .where("account", "==", "SALES")
            .limit(1)
            .get();

        if (!existingEntries.empty) {
            console.log(`Ledger entry already exists for Return: ${returnId}. Marking as posted.`);
            await db.collection("returns").doc(returnId).update({ ledgerPosted: true });
            return null;
        }

        const refundAmount = Number(newData.refundAmount || 0);

        try {
            const batch = db.batch();
            const orderSnap = await db.collection("orders").doc(newData.orderId).get();
            const orderData = orderSnap.data();

            let gstToReverse = 0;
            let cogsToReverse = 0;

            if (orderData && orderData.items) {
                // Find the item being returned to get the original GST and Cost data
                const returnedItem = orderData.items.find(item => item.productId === newData.productId);
                if (returnedItem) {
                    const rate = Number(returnedItem.gstRate || 0);
                    const cost = Number(returnedItem.costPrice || 0);
                    const qty = Number(newData.quantity || 1);

                    // reverse calculation: Tax = (Total / (100 + Rate)) * Rate
                    gstToReverse = (refundAmount / (100 + rate)) * rate;
                    cogsToReverse = cost * qty;
                }
            }

            const netSalesReverse = refundAmount - gstToReverse;

            // 1. Debit SALES (Revenue Reversal)
            batch.set(db.collection("ledger").doc(), {
                account: 'SALES', type: 'DEBIT', amount: netSalesReverse,
                description: `Return #${returnId} Revenue Reversal`,
                referenceId: returnId, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Debit GST_PAYABLE (Tax Reversal)
            if (gstToReverse > 0) {
                batch.set(db.collection("ledger").doc(), {
                    account: 'GST_PAYABLE', type: 'DEBIT', amount: gstToReverse,
                    description: `Return #${returnId} GST Reversal`,
                    referenceId: returnId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 3. Credit RAZORPAY_PENDING, CASH_IN_HAND or WALLET (Asset Restoration)
            let assetAccount = 'CASH_IN_HAND';
            if (newData.refundMethod === 'WALLET') assetAccount = 'WALLET_BALANCE';
            else if (newData.refundMethod === 'ONLINE') assetAccount = 'RAZORPAY_PENDING';

            batch.set(db.collection("ledger").doc(), {
                account: assetAccount, type: 'CREDIT', amount: refundAmount,
                description: `Return #${returnId} Refund Issued`,
                referenceId: returnId, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Credit COGS & Debit INVENTORY (Reversal)
            if (cogsToReverse > 0) {
                batch.set(db.collection("ledger").doc(), {
                    account: 'COGS', type: 'CREDIT', amount: cogsToReverse,
                    description: `Return #${returnId} COGS Reversal`,
                    referenceId: returnId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                batch.set(db.collection("ledger").doc(), {
                    account: 'INVENTORY', type: 'DEBIT', amount: cogsToReverse,
                    description: `Return #${returnId} Inventory Restoration`,
                    referenceId: returnId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 5. Mark return as posted
            batch.update(db.collection("returns").doc(returnId), { ledgerPosted: true });

            await batch.commit();
            console.log(`Enterprise Ledger posted for Return: ${returnId}`);
        } catch (e) {
            console.error("Return Ledger posting failed:", e);
        }
    }
});

exports.onOrderStatusUpdate = functions.firestore.document("orders/{id}").onUpdate(async (change, context) => {
    const newData = change.after.data(); const oldData = change.before.data();
    if (newData.status !== oldData.status) {
        const user = await db.collection("users").doc(newData.userId).get();
        const fcmToken = user.data()?.fcmToken;
        if (fcmToken) {
            await admin.messaging().send({ notification: { title: "Order Update", body: `Order status is now ${newData.status}` }, token: fcmToken });
        }
    }
});

exports.sendBroadcastNotification = functions.firestore.document("broadcast_notifications/{id}").onCreate(async (snap) => {
    const data = snap.data();
    await admin.messaging().send({ notification: { title: data.title, body: data.body }, topic: data.topic || "all" });
});

exports.processAiAction = functions.firestore.document("ai_action_requests/{id}").onUpdate(async (change, context) => {
    const newData = change.after.data(); const oldData = change.before.data();

    // GUARD: Only execute if status changed to APPROVED and not already COMPLETED
    if (newData.status === 'APPROVED' && oldData.status !== 'APPROVED' && !newData.executedAt) {
        const requestId = context.params.id;
        try {
            if (newData.action === 'UPDATE_PRICE') {
                await db.collection("products").doc(newData.params.productId).update({
                    price: newData.params.newPrice,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Mark as COMPLETED to prevent duplicate execution
            await change.after.ref.update({
                status: 'COMPLETED',
                executedAt: admin.firestore.FieldValue.serverTimestamp(),
                result: 'SUCCESS'
            });
            console.log(`AI Action Request [${requestId}] executed successfully.`);
        } catch (error) {
            console.error(`AI Action Request [${requestId}] failed:`, error);
            await change.after.ref.update({
                status: 'FAILED',
                error: error.message,
                executedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
});

/**
 * GSP: Generate e-Invoice (Admin Only)
 * Enforces Idempotency, Admin Auth, and Production Safety.
 */
exports.generateEInvoice = functions.https.onCall(async (data, context) => {
    requireAdmin(context);

    const { orderId } = data;
    const provider = await getGSPProvider();

    // PRODUCTION SAFETY: Block MOCK in PRODUCTION (Correction 8)
    const configSnap = await db.collection("settings").doc("config").get();
    const gspConfig = configSnap.data()?.gsp || {};
    if (provider instanceof MockGSPProvider && gspConfig.mode === 'PRODUCTION') {
         throw new functions.https.HttpsError('failed-precondition', 'Real GSP integration required for production.');
    }

    // IDEMPOTENCY: Use deterministic ID
    const requestId = `${orderId}_E_INVOICE`;
    const auditRef = db.collection("gsp_requests").doc(requestId);

    const existingReq = await auditRef.get();
    if (existingReq.exists && existingReq.data().status === 'SUCCESS') {
        return existingReq.data().providerResponse;
    }

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'Order not found');
    const order = orderSnap.data();

    try {
        const response = await gspBreaker.execute(() => provider.generateEInvoice(order));

        // SANITIZATION: Ensure no auth tokens or sensitive headers are stored
        const sanitizedResponse = { ...response };
        delete sanitizedResponse.token;
        delete sanitizedResponse.authHeader;

        await auditRef.set({
            orderId, type: 'E_INVOICE', status: response.status,
            providerResponse: sanitizedResponse,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        if (response.status === 'SUCCESS') {
            await db.collection("orders").doc(orderId).update({
                irn: response.irn,
                ackNo: response.ackNo,
                einvoiceStatus: 'SUCCESS',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return response;
    } catch (error) {
        await auditRef.set({
            orderId, type: 'E_INVOICE', status: 'FAILED',
            error: error.message, timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * FINANCE: Record Bank Payout (SuperAdmin Only)
 * Moves funds from RAZORPAY_PENDING to BANK_ACCOUNT and records fees.
 */
exports.recordBankPayout = functions.https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'SuperAdmin only.');
    const { payoutId, grossAmount, netAmount, fees, taxOnFees, timestamp } = data;

    try {
        const batch = db.batch();
        const refId = payoutId || `PO_${Date.now()}`;

        // 1. Debit BANK_ACCOUNT (Actual money received)
        batch.set(db.collection("ledger").doc(), {
            account: 'BANK_ACCOUNT', type: 'DEBIT', amount: Number(netAmount),
            description: `Bank Payout Received [${refId}]`,
            referenceId: refId, timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Debit GATEWAY_FEES (Razorpay commission + GST)
        const totalFees = Number(fees || 0) + Number(taxOnFees || 0);
        if (totalFees > 0) {
            batch.set(db.collection("ledger").doc(), {
                account: 'GATEWAY_FEES', type: 'DEBIT', amount: totalFees,
                description: `Razorpay Fees for Payout [${refId}]`,
                referenceId: refId, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 3. Credit RAZORPAY_PENDING (Clear the receivable)
        batch.set(db.collection("ledger").doc(), {
            account: 'RAZORPAY_PENDING', type: 'CREDIT', amount: Number(grossAmount),
            description: `Razorpay Balance Cleared [${refId}]`,
            referenceId: refId, timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true, message: `Payout [${refId}] reconciled successfully.` };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * FINANCE: Record General Expense Payment (Admin Only)
 * Posts to Ledger and updates Expense/Payout status.
 */
exports.recordExpensePayment = functions.https.onCall(async (data, context) => {
    requireAdmin(context);
    const {
        type, // 'GENERAL_EXPENSE' or 'RIDER_PAYOUT'
        targetId,
        amount,
        method,
        referenceId,
        description,
        riderStats // Optional, for rider payouts
    } = data;

    if (!amount || amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'Invalid amount.');

    try {
        const batch = db.batch();
        const timestamp = admin.firestore.FieldValue.serverTimestamp();

        // 1. Create Ledger Entry (The Source of Truth for Finance)
        const account = type === 'RIDER_PAYOUT' ? 'RIDER_PAYMENT' : (data.account || 'GENERAL_EXPENSE');
        batch.set(db.collection("ledger").doc(), {
            account,
            type: 'DEBIT', // Money going out
            amount: Number(amount),
            description: description || `Payment for ${type}`,
            referenceId: referenceId || targetId,
            actorId: context.auth.uid,
            timestamp
        });

        // 2. Update Target Document
        if (type === 'RIDER_PAYOUT' && riderStats) {
            // Record in Payout Logs
            batch.set(db.collection("payout_logs").doc(), {
                riderId: targetId,
                riderName: riderStats.riderName,
                amount: Number(amount),
                method,
                referenceId: referenceId || 'N/A',
                month: riderStats.month,
                year: riderStats.year,
                ordersCount: riderStats.ordersCount,
                paidAt: timestamp,
                breakdown: riderStats.breakdown || {}
            });
        } else if (type === 'GENERAL_EXPENSE') {
            const expenseRef = db.collection("expenses").doc(targetId);
            const expenseSnap = await expenseRef.get();
            if (!expenseSnap.exists) throw new Error("Expense not found");

            const currentPaid = Number(expenseSnap.data().paidAmountMinor || 0);
            const totalAmount = Number(expenseSnap.data().totalAmountMinor || 0);
            const newPaid = currentPaid + Math.round(Number(amount) * 100);

            const status = newPaid >= totalAmount ? 'PAID' : 'PARTIALLY_PAID';

            batch.update(expenseRef, {
                paidAmountMinor: newPaid,
                paymentStatus: status,
                updatedAt: timestamp
            });

            // Record Payment Detail
            batch.set(db.collection("expensePayments").doc(), {
                expenseId: targetId,
                amountMinor: Math.round(Number(amount) * 100),
                paymentMethod: method,
                transactionId: referenceId,
                paymentDate: new Date().toISOString(),
                createdBy: context.auth.uid,
                createdAt: timestamp
            });
        }

        await batch.commit();

        await logAudit({
            action: type === 'RIDER_PAYOUT' ? 'RIDER_PAYOUT_PROCESSED' : 'EXPENSE_PAID',
            actorId: context.auth.uid,
            targetId,
            targetType: type,
            metadata: { amount, method, referenceId }
        });

        return { success: true };
    } catch (error) {
        console.error("recordExpensePayment Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * ATTACHMENTS: Atomic/Idempotent Deletion (SuperAdmin Only)
 * Deletes from Storage first, then atomically removes from Firestore array.
 */
exports.deleteExpenseAttachment = functions.https.onCall(async (data, context) => {
    requireAdmin(context);
    const { expenseId, attachmentId } = data;

    if (!expenseId || !attachmentId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameters.');
    }

    try {
        const expenseRef = db.collection("expenses").doc(expenseId);

        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(expenseRef);
            if (!snap.exists) throw new Error("Expense not found");

            const attachments = snap.data().attachments || [];
            const attachment = attachments.find(a => a.id === attachmentId);

            if (!attachment) {
                console.warn(`Attachment ${attachmentId} already deleted or not found.`);
                return;
            }

            // IDEMPOTENCY: Storage delete should be handled carefully.
            const bucket = admin.storage().bucket();
            const file = bucket.file(attachment.storagePath);

            try {
                await file.delete();
            } catch (storageErr) {
                if (storageErr.code !== 404) throw storageErr;
            }

            // Remove from array
            transaction.update(expenseRef, {
                attachments: attachments.filter(a => a.id !== attachmentId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await logAudit({
                action: "ATTACHMENT_DELETED",
                actorId: context.auth.uid,
                targetId: expenseId,
                targetType: "EXPENSE",
                metadata: { attachmentId }
            });
        });

        return { success: true };
    } catch (error) {
        console.error("deleteExpenseAttachment Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * RECURRING: Process Recurring Expenses (Runs daily)
 */
exports.processRecurringExpenses = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    try {
        const q = db.collection("recurringExpenses")
            .where("status", "==", "ACTIVE")
            .where("nextRunDate", "<=", todayStr);

        const snapshot = await q.get();
        if (snapshot.empty) return null;

        const batch = db.batch();

        for (const doc of snapshot.docs) {
            const config = doc.data();
            const expenseId = db.collection("expenses").doc().id;

            // Create pending expense
            batch.set(db.collection("expenses").doc(expenseId), {
                expenseNumber: `RECUR-${Date.now().toString().slice(-6)}`,
                expenseDate: admin.firestore.FieldValue.serverTimestamp(),
                categoryId: config.categoryId,
                categoryName: config.categoryName,
                vendorId: config.vendorId || "",
                vendorName: config.vendorName || "Self",
                description: `Recurring: ${config.name}`,
                subtotalMinor: config.amountMinor,
                totalAmountMinor: config.amountMinor, // Simplified for recurring auto-gen
                approvalStatus: 'PENDING',
                paymentStatus: 'UNPAID',
                deleted: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Calculate next run date
            const nextDate = new Date(config.nextRunDate);
            if (config.frequency === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
            else if (config.frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);

            batch.update(doc.ref, {
                nextRunDate: nextDate.toISOString().split('T')[0],
                lastRunDate: todayStr,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
        console.log(`Processed ${snapshot.size} recurring expenses.`);
    } catch (e) {
        console.error("Recurring Expenses Error:", e);
    }
});

/**
 * GSP: Generate e-Way Bill (Admin Only)
 * Enforces Admin Auth and Production Safety.
 */
exports.generateEWayBill = functions.https.onCall(async (data, context) => {
    requireAdmin(context);

    const { orderId } = data;
    const provider = await getGSPProvider();

    // PRODUCTION SAFETY: Block MOCK in PRODUCTION (Correction 8)
    const configSnap = await db.collection("settings").doc("config").get();
    const gspConfig = configSnap.data()?.gsp || {};
    if (provider instanceof MockGSPProvider && gspConfig.mode === 'PRODUCTION') {
         throw new functions.https.HttpsError('failed-precondition', 'Real GSP integration required for production.');
    }

    const requestId = `${orderId}_E_WAY_BILL`;
    const auditRef = db.collection("gsp_requests").doc(requestId);

    const existingReq = await auditRef.get();
    if (existingReq.exists && existingReq.data().status === 'SUCCESS') {
        return existingReq.data().providerResponse;
    }

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'Order not found');
    const order = orderSnap.data();

    try {
        const response = await gspBreaker.execute(() => provider.generateEWayBill(order));

        await auditRef.set({
            orderId, type: 'E_WAY_BILL', status: response.status,
            providerResponse: response, timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        if (response.status === 'SUCCESS') {
            await db.collection("orders").doc(orderId).update({
                ewbNo: response.ewbNo,
                ewaybillStatus: 'SUCCESS',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return response;
    } catch (error) {
        await auditRef.set({
            orderId, type: 'E_WAY_BILL', status: 'FAILED',
            error: error.message, timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
});

const recommendations = require("./recommendations");
const razorpayVerification = require("./razorpay_verification");

exports.onProductWrite = recommendations.onProductWrite;
exports.refreshPopularity = recommendations.refreshPopularity;
exports.getRecommendations = recommendations.getRecommendations;
exports.backfillProductMetadata = recommendations.backfillProductMetadata;

exports.razorpayWebhook = razorpayVerification.razorpayWebhook;

/**
 * payWithWallet: Securely pay using user's wallet balance.
 * Hardened with server-side validation, owner check, and transactional integrity.
 */
/**
 * payWithWallet: Securely pay using user's wallet balance.
 * Hardened with server-side validation, owner check, and STRONG transactional idempotency.
 */
exports.payWithWallet = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const { orderId } = data;

    if (!orderId) throw new functions.https.HttpsError('invalid-argument', 'Order ID required.');

    try {
        const result = await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) throw new Error("Order not found.");
            const order = orderSnap.data();

            // 1. Authorization: Only owner can pay
            requireOrderOwner(order, context);

            // 2. Strong Idempotency & State Validation
            if (order.paymentStatus === 'PAID') return { success: true, message: "Order already paid." };
            if (order.ledgerPosted === true) return { success: true, message: "Payment already processed." };

            if (order.status === 'CANCELLED') throw new Error("Cannot pay for a cancelled order.");

            // 3. Server-side Amount Calculation (Authority)
            const amount = Number(order.totalAmount);
            if (!amount || isNaN(amount) || amount <= 0) throw new Error("Invalid order amount on server.");

            const userRef = db.collection("users").doc(uid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new Error("User profile not found.");

            const walletBalance = Number(userSnap.data().walletBalance || 0);
            if (walletBalance < amount) {
                throw new Error(`Insufficient wallet balance. Needed: ₹${amount}, Available: ₹${walletBalance}`);
            }

            // 4. Atomic Multi-doc Update
            // 4a. Deduct Wallet Balance
            transaction.update(userRef, {
                walletBalance: admin.firestore.FieldValue.increment(-amount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4b. Update Order Payment & Status
            // Enforce transition PLACED -> CONFIRMED
            validateOrderTransition(order.status, 'CONFIRMED', context);

            transaction.update(orderRef, {
                paymentStatus: "PAID",
                paymentMethod: "WALLET",
                status: "CONFIRMED",
                ledgerPosted: true, // Mark as posted within transaction
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4c. Create Ledger Entry (Atomic)
            const ledgerRef = db.collection("ledger").doc();
            transaction.set(ledgerRef, {
                account: 'WALLET_BALANCE',
                type: 'CREDIT',
                amount: amount,
                actorId: uid,
                description: `Payment for Order #${orderId} (Wallet)`,
                referenceId: orderId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, newBalance: Math.round((walletBalance - amount) * 100) / 100 };
        });

        await logAudit({
            action: "WALLET_PAYMENT",
            actorId: uid,
            targetId: orderId,
            targetType: "ORDER",
            metadata: { method: 'WALLET' }
        });

        return result;
    } catch (error) {
        console.error("payWithWallet Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * cancelOrder: Securely cancel an order and revert stock.
 * Handles financial reversal in the ledger if the order was PAID.
 */
exports.cancelOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');

    const { orderId, reason } = data;
    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) throw new Error("Order not found.");
            const order = orderSnap.data();

            if (order.userId !== context.auth.uid && !context.auth.token.admin) {
                throw new Error("Permission denied.");
            }

            const status = order.status;
            if (["SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"].includes(status)) {
                throw new Error(`Order cannot be cancelled in ${status} status.`);
            }

            // Financial reversal if already PAID
            if (order.paymentStatus === 'PAID') {
                const totalAmount = order.totalAmount || 0;
                const totalTax = order.totalTax || 0;
                const netSales = totalAmount - totalTax;

                // 1. Debit SALES (Revenue Reversal)
                transaction.set(db.collection("ledger").doc(), {
                    account: 'SALES', type: 'DEBIT', amount: netSales,
                    description: `Order #${orderId} Cancellation Reversal`,
                    referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                // 2. Debit GST_PAYABLE (Tax Reversal)
                if (totalTax > 0) {
                    transaction.set(db.collection("ledger").doc(), {
                        account: 'GST_PAYABLE', type: 'DEBIT', amount: totalTax,
                        description: `Order #${orderId} GST Reversal`,
                        referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                // 3. Credit Cash/Wallet (Asset Restoration)
                const assetAccount = order.paymentMethod === 'WALLET' ? 'WALLET_BALANCE' : 'CASH_IN_HAND';
                transaction.set(db.collection("ledger").doc(), {
                    account: assetAccount, type: 'CREDIT', amount: totalAmount,
                    description: `Order #${orderId} Refund due to Cancellation`,
                    referenceId: orderId, timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                if (order.paymentMethod === 'WALLET') {
                    transaction.update(db.collection("users").doc(order.userId), {
                        walletBalance: admin.firestore.FieldValue.increment(totalAmount)
                    });
                }
            }

            // Revert stock
            for (const item of order.items) {
                const productRef = db.collection("products").doc(item.productId);
                transaction.update(productRef, {
                    stockQuantity: admin.firestore.FieldValue.increment(item.quantity),
                    stock: admin.firestore.FieldValue.increment(item.quantity)
                });

                if (item.variantId) {
                    const variantRef = productRef.collection("variants").doc(item.variantId);
                    transaction.update(variantRef, {
                        stock: admin.firestore.FieldValue.increment(item.quantity)
                    });
                }
            }

            // Final Order Update
            transaction.update(orderRef, {
                status: "CANCELLED",
                cancellationReason: reason,
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * verifyDeliveryOTP: Securely verify customer OTP before marking as delivered.
 * Enforces assigned rider/admin only, status validation, and brute-force protection.
 */
/**
 * verifyDeliveryOTP: Securely verify customer OTP before marking as delivered.
 * Enforces assigned rider/admin only, status validation, and brute-force protection.
 */
exports.verifyDeliveryOTP = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const { orderId, otp } = data;

    if (!orderId || !otp) throw new functions.https.HttpsError('invalid-argument', 'Missing Order ID or OTP.');

    try {
        const orderRef = db.collection("orders").doc(orderId);
        const result = await db.runTransaction(async (transaction) => {
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error("Order not found.");
            const order = orderSnap.data();

            // 1. Authorization: Only assigned rider or admin
            requireAssignedRider(order, context);

            // 2. State Validation
            if (order.status === 'DELIVERED') throw new Error("Order already delivered.");

            // Expected statuses for delivery
            const deliveryStates = ['SHIPPED', 'OUT_FOR_DELIVERY'];
            if (!deliveryStates.includes(order.status)) {
                throw new Error(`Invalid order status for delivery: ${order.status}`);
            }

            // 3. Brute-force Protection (Task 2.8)
            const retryLimit = 5;
            const otpRetryCount = order.otpRetryCount || 0;
            if (otpRetryCount >= retryLimit) {
                throw new Error("OTP retry limit exceeded. Please contact support.");
            }

            // 4. OTP Match & Expiry (Task 2.6, 2.7)
            // Assuming OTP expires after 24 hours if not specified
            const now = Date.now();
            const otpCreatedAt = order.otpCreatedAt ? order.otpCreatedAt.toMillis() : (order.updatedAt ? order.updatedAt.toMillis() : 0);
            const isExpired = (now - otpCreatedAt) > (24 * 60 * 60 * 1000);

            if (isExpired) {
                 throw new Error("OTP has expired. Please generate a new one.");
            }

            if (order.customerOTP !== otp) {
                transaction.update(orderRef, {
                    otpRetryCount: admin.firestore.FieldValue.increment(1),
                    lastOtpAttempt: admin.firestore.FieldValue.serverTimestamp()
                });
                throw new Error("Invalid OTP.");
            }

            // 5. Successful Delivery (Task 2.12)
            // Atomic transition to DELIVERED
            validateOrderTransition(order.status, 'DELIVERED', context);

            transaction.update(orderRef, {
                status: "DELIVERED",
                deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                otpRetryCount: 0 // Reset on success
            });

            return { success: true };
        });

        await logAudit({
            action: "ORDER_DELIVERED_OTP",
            actorId: uid,
            targetId: orderId,
            targetType: "ORDER",
            metadata: { riderId: uid }
        });

        return result;
    } catch (error) {
        console.error("verifyDeliveryOTP Error:", error);
        if (error.message === "Invalid OTP." || error.message.includes("Permission denied")) {
            throw new functions.https.HttpsError('permission-denied', error.message);
        }
        throw new functions.https.HttpsError('internal', error.message);
    }
});


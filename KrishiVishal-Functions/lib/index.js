"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPayment = exports.createOrder = exports.auditProductChange = exports.onProductUpdate = exports.onUserRoleUpdate = exports.onEmergencyAlertCreated = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
/**
 * Gen 1 (v1) Triggers to maintain compatibility with existing deployment
 */
exports.onEmergencyAlertCreated = functions.firestore
    .document("emergency_alerts/{alertId}")
    .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    if (!data)
        return;
    const riderName = data.riderName || "A Rider";
    const mapsUrl = `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`;
    const payload = {
        notification: {
            title: "🚨 EMERGENCY SOS 🚨",
            body: `${riderName} has triggered an SOS!`,
        },
        data: {
            riderId: data.riderId,
            locationUrl: mapsUrl,
            alertId: context.params.alertId
        }
    };
    try {
        await admin.messaging().sendToTopic("dispatch_team", payload);
    }
    catch (error) {
        console.error("Error sending FCM:", error);
    }
});
exports.onUserRoleUpdate = functions.firestore
    .document("users/{userId}")
    .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    const userId = context.params.userId;
    if (!data || !data.isAdmin) {
        await admin.auth().setCustomUserClaims(userId, { role: null, admin: false });
        return;
    }
    await admin.auth().setCustomUserClaims(userId, {
        role: data.role || "Viewer",
        admin: true,
        isActive: data.isActive !== false
    });
});
exports.onProductUpdate = functions.firestore
    .document("products/{productId}")
    .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after)
        return;
    const settingsSnap = await db.collection("settings").doc("config").get();
    const threshold = settingsSnap.data()?.lowStockThreshold || 10;
    if (after.stockQuantity <= threshold && before.stockQuantity > threshold) {
        const payload = {
            notification: {
                title: "📦 LOW STOCK ALERT",
                body: `${after.name} is low! Only ${after.stockQuantity} left.`,
            }
        };
        await admin.messaging().sendToTopic("admin_alerts", payload);
    }
});
exports.auditProductChange = functions.firestore
    .document("products/{productId}")
    .onWrite(async (change, context) => {
    const action = !change.before.exists ? "CREATE" : !change.after.exists ? "DELETE" : "UPDATE";
    const data = change.after.exists ? change.after.data() : change.before.data();
    await db.collection("audit_logs").add({
        action: `${action}_PRODUCT`,
        resourceId: context.params.productId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { name: data?.name }
    });
});
/**
 * HTTPS Callable Functions (using v1 syntax for consistency)
 */
exports.createOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }
    const { cartItems, address, paymentMethod, userName, userPhone } = data;
    const userId = context.auth.uid;
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Cart is empty.");
    }
    let totalAmount = 0;
    const orderItems = [];
    for (const item of cartItems) {
        const productDoc = await db.collection("products").doc(item.productId).get();
        const product = productDoc.data();
        if (!productDoc.exists || !product?.isActive) {
            throw new functions.https.HttpsError("not-found", `Product ${item.productId} not available`);
        }
        let price = product.discountedPrice || product.price || product.basePrice;
        if (item.variantId) {
            const variantDoc = await db.collection("products").doc(item.productId)
                .collection("variants").doc(item.variantId).get();
            if (variantDoc.exists)
                price = variantDoc.data()?.price || price;
        }
        totalAmount += price * item.quantity;
        orderItems.push({
            productId: item.productId,
            productName: product.name,
            quantity: item.quantity,
            price: price,
            imageUrl: product.imageUrl || (product.images && product.images[0]) || "",
            variantId: item.variantId || null
        });
    }
    const orderId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    await db.collection("orders").doc(orderId).set({
        id: orderId, userId, items: orderItems, totalAmount, paymentMethod,
        address, status: "PENDING", createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userName: userName || "", userPhone: userPhone || ""
    });
    return { orderId, totalAmount };
});
const crypto = require("crypto");
exports.verifyPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required");
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;
    const razorpaySecret = functions.config().razorpay?.secret || "rzp_test_placeholder_secret";
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto.createHmac("sha256", razorpaySecret)
        .update(body.toString()).digest("hex");
    if (expectedSignature === razorpaySignature) {
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists)
                throw new Error("Order not found");
            const order = orderSnap.data();
            transaction.update(orderRef, {
                status: "PAID", razorpayPaymentId,
                paidAt: admin.firestore.FieldValue.serverTimestamp()
            });
            if (order?.items) {
                for (const item of order.items) {
                    const productRef = db.collection("products").doc(item.productId);
                    transaction.update(productRef, {
                        stockQuantity: admin.firestore.FieldValue.increment(-item.quantity)
                    });
                }
            }
        });
        return { success: true };
    }
    else {
        throw new functions.https.HttpsError("invalid-argument", "Payment verification failed");
    }
});
//# sourceMappingURL=index.js.map
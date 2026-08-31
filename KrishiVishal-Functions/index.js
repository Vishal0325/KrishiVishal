/**
 * KrishiVishal Cloud Functions - Entry Point
 * Consolidated and simplified exports for reliable Firebase deployment.
 */

// L3: Startup environment variable configuration verification
const REQUIRED_ENV_VARS = ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'QR_HMAC_SECRET', 'CLEARTAX_AUTH_TOKEN'];
for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
        console.warn(`[CONFIG WARNING] Missing environment variable: ${envVar}. Some features may run with fallback or restricted functionality.`);
    }
}

const orders = require('./orders/orderFlow');
const orderTriggers = require('./orders/orderTriggers');
const razorpay = require('./finance/razorpay');
const ledger = require('./finance/ledger');
const wallet = require('./finance/wallet');
const inventory = require('./inventory/stock');
const recommendations = require('./inventory/recommendations');
const adminTools = require('./admin/aiSupervisor');
const sla = require('./admin/slaMonitor');
const messaging = require('./messaging/notifications');

// --- ORDERS ---
exports.createOrder = orders.createOrder;
exports.verifyDeliveryOTP = orders.verifyDeliveryOTP;
exports.cancelOrder = orders.cancelOrder;
exports.updateOrderStatus = orders.updateOrderStatus;
exports.generateSignedQRPayload = orders.generateSignedQRPayload;
exports.onOrderStatusUpdate = orderTriggers.onOrderStatusUpdate;
exports.onReturnRequestCreated = orderTriggers.onReturnRequestCreated;
exports.onOrderDeliveryUpdate = orderTriggers.onOrderDeliveryUpdate;

// --- FINANCE & PAYMENTS ---
exports.verifyPayment = razorpay.verifyPayment;
exports.razorpayWebhook = razorpay.razorpayWebhook;
exports.onOrderPaidLedger = ledger.onOrderPaidLedger;
exports.onReturnCompletedLedger = ledger.onReturnCompletedLedger;
exports.payWithWallet = wallet.payWithWallet;
exports.recordExpensePayment = ledger.recordExpensePayment;
exports.deleteExpenseAttachment = ledger.deleteExpenseAttachment;

// --- INVENTORY ---
exports.onReturnStockSync = inventory.onReturnStockSync;
exports.onProductWrite = recommendations.onProductWrite;
exports.refreshPopularity = recommendations.refreshPopularity;
exports.getRecommendations = recommendations.getRecommendations;
exports.backfillProductMetadata = recommendations.backfillProductMetadata;

// --- ADMIN & AI ---
exports.aiSupervisor = adminTools.aiSupervisor;
exports.processAiAction = adminTools.processAiAction;
exports.monitorOrderSLA = sla.monitorOrderSLA;

// --- COMPLIANCE (GSP) ---
const { getGSPProvider } = require('./src/providers/GSPFactory');
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { isAdminRequest } = require("./core/utils");

exports.generateEWayBill = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    const { orderId } = request.data || {};
    if (!orderId) throw new HttpsError('invalid-argument', 'Missing orderId.');

    const { db } = require('./core/admin');
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

    const provider = await getGSPProvider();
    const result = await provider.generateEWayBill({ ...orderSnap.data(), id: orderId });

    if (result.status === 'SUCCESS') {
        await db.collection("gsp_requests").doc(`${orderId}_EWB`).set(result);
        await orderSnap.ref.update({
            ewayBillNo: result.providerReferenceId,
            ewayBillGeneratedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
        });
    }

    return result;
});

// --- MESSAGING ---
exports.processOutbox = messaging.processOutbox;
exports.sendBroadcastNotification = messaging.sendBroadcastNotification;

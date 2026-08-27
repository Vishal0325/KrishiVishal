/**
 * KrishiVishal Cloud Functions - Entry Point
 * Consolidated and simplified exports for reliable Firebase deployment.
 */

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
exports.onOrderStatusUpdate = orderTriggers.onOrderStatusUpdate;
exports.onReturnRequestCreated = orderTriggers.onReturnRequestCreated;

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

// --- MESSAGING ---
exports.processOutbox = messaging.processOutbox;
exports.sendBroadcastNotification = messaging.sendBroadcastNotification;

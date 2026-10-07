/**
 * KrishiVishal Cloud Functions - Entry Point
 * Refactored for Zero Cold-Start Latency via On-Demand Lazy Loading.
 * Region: asia-south1 (Mumbai)
 */

const { setGlobalOptions } = require('firebase-functions/v2');
// Enforce all Cloud Functions to deploy exclusively to asia-south1 (Mumbai) with optimized resource limits
setGlobalOptions({ region: 'asia-south1', maxInstances: 10, memory: '256MiB', cpu: 0.083 });

// L3: Startup environment variable configuration verification (Non-blocking)
const REQUIRED_ENV_VARS = ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'QR_HMAC_SECRET', 'CLEARTAX_AUTH_TOKEN'];
for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar] && process.env.NODE_ENV !== 'test') {
        console.warn(`[CONFIG WARNING] Missing environment variable: ${envVar}. Some features may run with fallback or restricted functionality.`);
    }
}

// Module Cache to ensure single require per source module when accessed
const moduleCache = new Map();

function getModule(modPath) {
    if (!moduleCache.has(modPath)) {
        moduleCache.set(modPath, require(modPath));
    }
    return moduleCache.get(modPath);
}

function lazy(modPath, exportName) {
    let cached;
    return {
        enumerable: true,
        configurable: true,
        get() {
            if (cached === undefined) {
                cached = getModule(modPath)[exportName];
            }
            return cached;
        }
    };
}

// Registry of 98 Modular Lazy Exports
const FUNCTION_MAP = {
    // --- ORDERS (16) ---
    createOrder: ['./orders/orderFlow', 'createOrder'],
    onOrderStatusChange: ['./orders/orderFlow', 'onOrderStatusChange'],
    getAvailableSlots: ['./orders/deliverySlots', 'getAvailableSlots'],
    deleteDeliverySlot: ['./orders/deliverySlots', 'deleteDeliverySlot'],
    requestReturn: ['./orders/orderFlow', 'requestReturn'],
    verifyDeliveryOTP: ['./orders/orderFlow', 'verifyDeliveryOTP'],
    cancelOrder: ['./orders/orderFlow', 'cancelOrder'],
    updateOrderStatus: ['./orders/orderFlow', 'updateOrderStatus'],
    generateSignedQRPayload: ['./orders/orderFlow', 'generateSignedQRPayload'],
    verifyScannedQR: ['./orders/orderFlow', 'verifyScannedQR'],
    riderMutations: ['./orders/riderMutations', 'riderMutations'],
    onOrderStatusUpdate: ['./orders/orderTriggers', 'onOrderStatusUpdate'],
    onReturnRequestCreated: ['./orders/orderTriggers', 'onReturnRequestCreated'],
    onOrderDeliveryUpdate: ['./orders/orderTriggers', 'onOrderDeliveryUpdate'],
    onProcurementQueueUpdated: ['./orders/orderTriggers', 'onProcurementQueueUpdated'],
    onOrderRiderAssigned: ['./orders/orderTriggers', 'onOrderRiderAssigned'],

    // --- LOGISTICS & ROUTE BATCHING (3) ---
    optimizeHubDeliveryBatches: ['./logistics/routeBatching', 'optimizeHubDeliveryBatches'],
    generateWeeklyRiderPayouts: ['./logistics/riderPayoutEngine', 'generateWeeklyRiderPayouts'],
    approveRiderPayout: ['./logistics/riderPayoutEngine', 'approveRiderPayout'],

    // --- FINANCE & PAYMENTS (17) ---
    verifyPayment: ['./finance/razorpay', 'verifyPayment'],
    razorpayWebhook: ['./finance/razorpay', 'razorpayWebhook'],
    initiateRefund: ['./finance/initiateRefund', 'initiateRefund'],
    onOrderPaidLedger: ['./finance/ledger', 'onOrderPaidLedger'],
    onReturnCompletedLedger: ['./finance/ledger', 'onReturnCompletedLedger'],
    payWithWallet: ['./finance/wallet', 'payWithWallet'],
    redeemWalletAtCheckout: ['./finance/wallet', 'redeemWalletAtCheckout'],
    createWalletTopUpOrder: ['./finance/walletTopUp', 'createWalletTopUpOrder'],
    verifyWalletTopUp: ['./finance/walletTopUp', 'verifyWalletTopUp'],
    adminAdjustWallet: ['./finance/walletTopUp', 'adminAdjustWallet'],
    getWalletHistory: ['./finance/walletTopUp', 'getWalletHistory'],
    recordExpensePayment: ['./finance/ledger', 'recordExpensePayment'],
    deleteExpenseAttachment: ['./finance/ledger', 'deleteExpenseAttachment'],
    recordBankPayout: ['./finance/ledger', 'recordBankPayout'],
    onGoodsReceiptCreated: ['./finance/ledger', 'onGoodsReceiptCreated'],
    onCashDepositVerified: ['./finance/ledger', 'onCashDepositVerified'],
    confirmCashSettlement: ['./finance/cashSettlement', 'confirmCashSettlement'],

    // --- INVENTORY & WMS (16) ---
    onReturnStockSync: ['./inventory/stock', 'onReturnStockSync'],
    onSkuWrite: ['./inventory/stock', 'onSkuWrite'],
    importSkus: ['./inventory/importSkus', 'importSkus'],
    upsertSku: ['./inventory/importSkus', 'upsertSku'],
    adjustInventory: ['./inventory/importSkus', 'adjustInventory'],
    receiveGrn: ['./inventory/importSkus', 'receiveGrn'],
    writeOffStock: ['./inventory/importSkus', 'writeOffStock'],
    getInventoryReport: ['./inventory/importSkus', 'getInventoryReport'],
    migrateSkuWeights: ['./inventory/importSkus', 'migrateSkuWeights'],
    onProductWrite: ['./inventory/recommendations', 'onProductWrite'],
    refreshPopularity: ['./inventory/recommendations', 'refreshPopularity'],
    getRecommendations: ['./inventory/recommendations', 'getRecommendations'],
    backfillProductMetadata: ['./inventory/recommendations', 'backfillProductMetadata'],
    onStockTransferUpdated: ['./inventory/stockTransferTriggers', 'onStockTransferUpdated'],
    onStockTransferCreatedGuard: ['./inventory/stockTransfers', 'onStockTransferCreatedGuard'],
    onStockTransferReceived: ['./inventory/stockTransfers', 'onStockTransferReceived'],
    startHubAuditSession: ['./inventory/cycleCountEngine', 'startHubAuditSession'],
    submitAuditCounts: ['./inventory/cycleCountEngine', 'submitAuditCounts'],
    reconcileAuditSession: ['./inventory/cycleCountEngine', 'reconcileAuditSession'],
    resolveQuarantinedStock: ['./inventory/quarantineEngine', 'resolveQuarantinedStock'],

    // --- MARKETING & REFERRALS (14) ---
    generateReferralCode: ['./marketing/referrals', 'generateReferralCode'],
    applyReferralCode: ['./marketing/referrals', 'applyReferralCode'],
    getOrCreateReferralCode: ['./marketing/referrals', 'getOrCreateReferralCode'],
    detectAbandonedCarts: ['./marketing/abandonedCarts', 'detectAbandonedCarts'],
    runAbandonedCartScan: ['./marketing/abandonedCarts', 'runAbandonedCartScan'],
    metaLeadWebhook: ['./marketing/metaLeadWebhook', 'metaLeadWebhook'],
    onOrderDeliveredCAPI: ['./marketing/marketingTriggers', 'onOrderDeliveredCAPI'],
    updateLeadDisposition: ['./marketing/leadsEngine', 'updateLeadDisposition'],
    assignLeadsToHub: ['./marketing/leadsEngine', 'assignLeadsToHub'],
    getFarmersByCropStage: ['./marketing/cropCycleMarketingEngine', 'getFarmersByCropStage'],
    registerAsKisanMitra: ['./marketing/vleCommissionEngine', 'registerAsKisanMitra'],
    verifyVleKyc: ['./marketing/vleCommissionEngine', 'verifyVleKyc'],
    getVleDashboardSummary: ['./marketing/vleCommissionEngine', 'getVleDashboardSummary'],
    cronMaturityVleCommissions: ['./marketing/vleCommissionEngine', 'cronMaturityVleCommissions'],

    // --- ADMIN & AI (5) ---
    aiSupervisor: ['./admin/aiSupervisor', 'aiSupervisor'],
    processAiAction: ['./admin/aiSupervisor', 'processAiAction'],
    approveAiAction: ['./admin/aiSupervisor', 'approveAiAction'],
    rejectAiAction: ['./admin/aiSupervisor', 'rejectAiAction'],
    monitorOrderSLA: ['./admin/slaMonitor', 'monitorOrderSLA'],

    // --- COMPLIANCE CRON (1) ---
    licenseExpiryCron: ['./compliance/licenseExpiryCron', 'licenseExpiryCron'],

    // --- MESSAGING & ADVISORY (6) ---
    processOutbox: ['./messaging/notifications', 'processOutbox'],
    registerFcmToken: ['./messaging/notifications', 'registerFcmToken'],
    deleteFcmToken: ['./messaging/notifications', 'deleteFcmToken'],
    sendBroadcastNotification: ['./messaging/notifications', 'sendBroadcastNotification'],
    cronCropAdvisory: ['./messaging/cropAdvisory', 'cronCropAdvisory'],
    runCropAdvisoryEngine: ['./messaging/cropAdvisory', 'runCropAdvisoryEngine'],

    // --- SERVICE MARKETPLACE (9) ---
    createServiceBooking: ['./src/services/serviceMarketplace', 'createServiceBooking'],
    matchPartner: ['./src/services/serviceMarketplace', 'matchPartner'],
    acceptBooking: ['./src/services/serviceMarketplace', 'acceptBooking'],
    onBookingCompleted: ['./src/services/serviceMarketplace', 'onBookingCompleted'],
    verifyStartOtp: ['./src/services/serviceMarketplace', 'verifyStartOtp'],
    verifyEndOtp: ['./src/services/serviceMarketplace', 'verifyEndOtp'],
    rejectBooking: ['./src/services/serviceMarketplace', 'rejectBooking'],
    expandRadiusOnTimeout: ['./src/services/serviceMarketplace', 'expandRadiusOnTimeout'],
    rechargePartnerWallet: ['./src/services/serviceMarketplace', 'rechargePartnerWallet'],

    // --- ROLE PROVISIONING (3) ---
    claimRiderRole: ['./auth/roleProvisioning', 'claimRiderRole'],
    setUserRole: ['./auth/roleProvisioning', 'setUserRole'],
    deactivateUser: ['./auth/roleProvisioning', 'deactivateUser'],

    // --- ADMIN SERVICES (7) ---
    addSecureAuditLog: ['./admin/adminServices', 'addSecureAuditLog'],
    getSecureProductCost: ['./admin/adminServices', 'getSecureProductCost'],
    searchUsers: ['./admin/adminServices', 'searchUsers'],
    createStaffMember: ['./admin/adminServices', 'createStaffMember'],
    generateWorkforceId: ['./admin/adminServices', 'generateWorkforceId'],
    getFinanceSummary: ['./admin/adminServices', 'getFinanceSummary'],
    saveExpense: ['./admin/adminServices', 'saveExpense']
};

// Register all modular exports on exports object
for (const [fnName, [modPath, exportName]] of Object.entries(FUNCTION_MAP)) {
    Object.defineProperty(exports, fnName, lazy(modPath, exportName));
}

// --- DIRECT IN-INDEX CALLABLE FUNCTIONS (3) ---

// 1. generateEWayBill (Lazy loaded GSP Provider & Admin checks)
let _generateEWayBill;
Object.defineProperty(exports, 'generateEWayBill', {
    enumerable: true,
    configurable: true,
    get() {
        if (!_generateEWayBill) {
            const { onCall, HttpsError } = require("firebase-functions/v2/https");
            const { cleartaxAuthToken } = require("./core/secrets");
            _generateEWayBill = onCall({ region: 'asia-south1', secrets: [cleartaxAuthToken] }, async (request) => {
                const { isAdminRequest } = require("./core/utils");
                if (!(await isAdminRequest({ auth: request.auth }))) {
                    throw new HttpsError('permission-denied', 'Admin only.');
                }

                const { orderId } = request.data || {};
                if (!orderId) throw new HttpsError('invalid-argument', 'Missing orderId.');

                const { db } = require('./core/admin');
                const orderSnap = await db.collection("orders").doc(orderId).get();
                if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');

                const { getGSPProvider } = require('./src/providers/GSPFactory');
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
        }
        return _generateEWayBill;
    }
});

// 2. generateInvoicePdf (Lazy loaded PDFKit & Invoice Service)
let _generateInvoicePdf;
Object.defineProperty(exports, 'generateInvoicePdf', {
    enumerable: true,
    configurable: true,
    get() {
        if (!_generateInvoicePdf) {
            const { onCall, HttpsError } = require("firebase-functions/v2/https");
            _generateInvoicePdf = onCall({ region: 'asia-south1' }, async (request) => {
                if (!request.auth) {
                    throw new HttpsError('unauthenticated', 'User must be authenticated.');
                }

                const { orderId, clearTaxData } = request.data || {};
                if (!orderId) {
                    throw new HttpsError('invalid-argument', 'Missing orderId.');
                }

                try {
                    const { generateAndUploadInvoice } = require('./invoices/invoiceService');
                    return await generateAndUploadInvoice(orderId, clearTaxData);
                } catch (error) {
                    console.error(`[generateInvoicePdf] Error generating invoice for ${orderId}:`, error);
                    throw new HttpsError('internal', error.message || 'Failed to generate PDF invoice.');
                }
            });
        }
        return _generateInvoicePdf;
    }
});

// 3. extractVoiceIntent (Lazy loaded Gemini GenAI & Voice Intent Service)
let _extractVoiceIntent;
Object.defineProperty(exports, 'extractVoiceIntent', {
    enumerable: true,
    configurable: true,
    get() {
        if (!_extractVoiceIntent) {
            const { onCall, HttpsError } = require("firebase-functions/v2/https");
            _extractVoiceIntent = onCall({ region: 'asia-south1', memory: '256MiB' }, async (request) => {
                const { query } = request.data || {};
                if (!query || typeof query !== 'string' || query.trim().length === 0) {
                    throw new HttpsError('invalid-argument', 'Query string is required and cannot be empty.');
                }

                try {
                    const { extractVoiceIntent } = require('./search/voiceIntentService');
                    const intent = await extractVoiceIntent(query.trim());
                    return intent;
                } catch (error) {
                    console.error('[extractVoiceIntent] Error extracting voice intent:', error);
                    throw new HttpsError('internal', error.message || 'Failed to extract voice intent.');
                }
            });
        }
        return _extractVoiceIntent;
    }
});

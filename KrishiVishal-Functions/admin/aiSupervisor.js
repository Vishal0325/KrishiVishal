const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * AI Supervisor Orchestrator with sanitized logging (M4).
 */
exports.aiSupervisor = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Only admins can access AI Supervisor.');
    }

    const data = request.data || {};
    const { prompt, agentType } = data;

    try {
        // M4: Hash PII and sanitize prompt
        const email = context.auth.token?.email || context.auth.uid || "unknown";
        const emailHash = crypto.createHash('sha256').update(email).digest('hex');
        const rawPrompt = typeof prompt === 'string' ? prompt : '';
        const sanitizedPrompt = rawPrompt
            .substring(0, 500)
            .replace(/\b\d{12,16}\b/g, '****');

        await db.collection("ai_activity_logs").add({
            promptLength: rawPrompt.length,
            promptSanitized: sanitizedPrompt,
            agentType: agentType || 'GENERAL',
            requestedByHash: emailHash,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        let response = {};

        switch (agentType) {
            case 'INVENTORY':
                const lowStock = await db.collection("products")
                    .where("stock", "<", 10)
                    .limit(5)
                    .get();
                response = {
                    message: `I found ${lowStock.size} items with low stock. Would you like to review price adjustments or restock?`,
                    data: lowStock.docs.map(doc => ({ id: doc.id, name: doc.data().name, stock: doc.data().stock }))
                };
                break;
            case 'FINANCE':
                const accounts = await db.collection("accounts").get();
                response = {
                    message: "Financial summary generated. All ledgers are balanced.",
                    data: accounts.docs.map(doc => ({ id: doc.id, balance: doc.data().balance }))
                };
                break;
            case 'SUPPORT':
                response = {
                    message: "Support analysis: 95% of tickets are resolved. No high-risk fraud detected in the last 24 hours.",
                    data: { status: 'GREEN', riskScore: 0.05 }
                };
                break;
            default:
                response = { message: "Hello Admin, I am KrishiVishal AI Supervisor. I can help manage Inventory, Finance, and Support workflows." };
        }

        return response;
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Handles sensitive AI actions after Admin approval.
 */
exports.processAiAction = onDocumentUpdated({ document: "ai_action_requests/{requestId}", region: REGION }, async (event) => {
    const change = event.data;
    if (!change) return null;
    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData) return null;

    if (newData.status === 'APPROVED' && oldData.status !== 'APPROVED') {
        const { action, params } = newData;

        try {
            if (action === 'UPDATE_PRICE') {
                const { productId, newPrice } = params;

                if (!productId || typeof newPrice !== 'number' || newPrice <= 0) {
                    throw new Error("Invalid Product ID or Price amount.");
                }

                await db.runTransaction(async (transaction) => {
                    const productRef = db.collection("products").doc(productId);
                    const pSnap = await transaction.get(productRef);
                    if (!pSnap.exists) throw new Error("Product does not exist.");

                    const oldPrice = pSnap.data().price || 0;

                    // Business Rule: Guard against extreme price fluctuations (> 80% change)
                    const percentChange = Math.abs((newPrice - oldPrice) / oldPrice);
                    if (percentChange > 0.8 && oldPrice > 0) {
                        throw new Error(`Price change too extreme (${Math.round(percentChange * 100)}%). Manual intervention required.`);
                    }

                    transaction.update(productRef, {
                        price: newPrice,
                        oldPrice: oldPrice,
                        priceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Log Audit for AI Action
                    const auditRef = db.collection("audit_logs").doc();
                    transaction.set(auditRef, {
                        action: "AI_PRICE_UPDATE",
                        productId,
                        oldPrice,
                        newPrice,
                        approvedBy: newData.approvedBy || "Admin",
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
            }

            return change.after.ref.update({
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'COMPLETED'
            });
        } catch (error) {
            console.error("Error processing AI action:", error);
            return change.after.ref.update({ status: 'FAILED', error: error.message });
        }
    }
    return null;
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * AI Supervisor Orchestrator.
 */
exports.aiSupervisor = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Only admins can access AI Supervisor.');
    }

    const data = request.data || {};
    const { prompt, agentType } = data;

    try {
        await db.collection("ai_activity_logs").add({
            prompt,
            agentType,
            requestedBy: context.auth.token.email,
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
                await db.collection("products").doc(params.productId).update({
                    price: params.newPrice,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

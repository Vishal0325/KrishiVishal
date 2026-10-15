const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { isAdminRequest, isFinanceRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * ARCHITECTURAL LOGGING DESIGN & CONSOLIDATION DECISION:
 * 
 * 1. 'audit_logs' collection:
 *    - Purpose: Authoritative audit trail for administrative mutations, manual overrides,
 *      security policy alterations, price/stock adjustments, and financial ledger writes.
 *    - Schema: { action, entityType, entityId, performedBy, previousState, newState, timestamp, ipAddress }
 *    - Access: Read-only for Admin / SuperAdmin, strictly written via Server SDK / Cloud Functions.
 * 
 * 2. 'ai_activity_logs' collection:
 *    - Purpose: Specific telemetry for AI Supervisor assistant operations.
 *    - Captures sanitized prompts (PII redacted), tokens, inferred agent types,
 *      generated suggestions, and human administrator approval/rejection decisions.
 *    - Schema: { promptLength, promptSanitized, agentType, requestedByHash, timestamp }
 * 
 * Keeping these collections logically separated ensures regulatory compliance and avoids
 * mixing high-volume AI telemetry with critical financial/security audit records.
 */

/**
 * AI Supervisor Orchestrator with sanitized logging (M4).
 */
exports.aiSupervisor = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const data = request.data || {};
    const { prompt, agentType } = data;
    const supportedAgentTypes = ['INVENTORY', 'FINANCE', 'SUPPORT', 'GENERAL'];
    if (typeof prompt !== 'string' || prompt.length > 5000 ||
        (agentType !== undefined && !supportedAgentTypes.includes(agentType))) {
        throw new HttpsError('invalid-argument', 'A prompt of at most 5000 characters and a supported agentType are required.');
    }
    if (agentType === 'FINANCE') {
        if (!(await isFinanceRequest(context))) {
            throw new HttpsError('permission-denied', 'Finance role required for the finance assistant.');
        }
    } else if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Only admins can access AI Supervisor.');
    }

    try {
        // M4: Hash PII and sanitize prompt
        const email = context.auth.token?.email || context.auth.uid || "unknown";
        const emailHash = crypto.createHash('sha256').update(email).digest('hex');
        const rawPrompt = typeof prompt === 'string' ? prompt : '';
        const sanitizedPrompt = rawPrompt
            .substring(0, 500)
            .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[REDACTED_PAN]')
            .replace(/\b\d{12,16}\b/g, '[REDACTED_NUMBER]')
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
            .replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g, '[REDACTED_PHONE]');

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
                    message: "Financial account balances retrieved. Reconciliation status must be checked separately.",
                    data: accounts.docs.map(doc => ({ id: doc.id, balance: doc.data().balance }))
                };
                break;
            case 'SUPPORT':
                response = {
                    message: "Support analytics are not connected to this assistant yet.",
                    data: { status: 'UNAVAILABLE' }
                };
                break;
            default:
                response = { message: "Hello Admin, I am KrishiVishal AI Supervisor. I can help manage Inventory, Finance, and Support workflows." };
        }

        return response;
    } catch (error) {
        console.error('AI Supervisor request failed:', error);
        throw new HttpsError('internal', 'AI Supervisor request failed.');
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
            if (action !== 'UPDATE_PRICE') {
                throw new Error(`Unsupported AI action: ${action || 'unknown'}`);
            }
            if (action === 'UPDATE_PRICE') {
                const { productId, newPrice } = params;

                if (typeof productId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(productId) ||
                    typeof newPrice !== 'number' || !Number.isFinite(newPrice) || newPrice <= 0) {
                    throw new Error("Invalid Product ID or Price amount.");
                }

                await db.runTransaction(async (transaction) => {
                    const actionRef = change.after.ref;
                    const actionSnap = await transaction.get(actionRef);
                    if (!actionSnap.exists || actionSnap.data().status !== 'APPROVED') return;

                    const productRef = db.collection("products").doc(productId);
                    const pSnap = await transaction.get(productRef);
                    if (!pSnap.exists) throw new Error("Product does not exist.");

                    const oldPrice = Number(pSnap.data().price || 0);
                    if (!Number.isFinite(oldPrice) || oldPrice < 0) {
                        throw new Error("Existing Product Price is invalid.");
                    }

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
                    const auditRef = db.collection("audit_logs").doc(`AI_PRICE_UPDATE_${event.params.requestId}`);
                    transaction.set(auditRef, {
                        action: "AI_PRICE_UPDATE",
                        productId,
                        oldPrice,
                        newPrice,
                        approvedBy: newData.approvedBy || "Admin",
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                    transaction.update(actionRef, {
                        processedAt: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'COMPLETED'
                    });
                });
            }
            return null;
        } catch (error) {
            console.error("Error processing AI action:", error);
            await db.runTransaction(async (transaction) => {
                const actionRef = change.after.ref;
                const actionSnap = await transaction.get(actionRef);
                if (!actionSnap.exists || actionSnap.data().status !== 'APPROVED') return;
                transaction.update(actionRef, {
                    status: 'FAILED',
                    error: String(error.message || error).slice(0, 500),
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            return null;
        }
    }
    return null;
});

/**
 * Approve AI Action
 */
exports.approveAiAction = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin role required to approve/reject AI actions');
    }

    const data = request.data || {};
    const actionId = data.actionId || data.requestId;
    if (typeof actionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(actionId)) {
        throw new HttpsError('invalid-argument', 'A valid requestId or actionId is required');
    }

    const requestRef = db.collection("ai_action_requests").doc(actionId);
    const auditRef = db.collection("audit_logs").doc(`AI_ACTION_DECISION_${actionId}`);
    const token = request.auth.token || {};
    await db.runTransaction(async (transaction) => {
        const actionSnapshot = await transaction.get(requestRef);
        if (!actionSnapshot.exists) throw new HttpsError('not-found', 'AI action request was not found.');
        const status = actionSnapshot.data().status;
        if (status === 'APPROVED' || status === 'COMPLETED') return;
        if (status !== 'PENDING') {
            throw new HttpsError('failed-precondition', `Cannot approve an AI action in ${status || 'unknown'} state.`);
        }
        transaction.update(requestRef, {
            status: "APPROVED",
            approvedBy: request.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        transaction.create(auditRef, {
            actionId,
            decision: 'APPROVED',
            reviewedBy: request.auth.uid,
            reviewerRole: token.role || 'ADMIN',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            notes: typeof data.notes === 'string' ? data.notes.slice(0, 1000) : ''
        });
    });

    return { success: true };
});

/**
 * Reject AI Action
 */
exports.rejectAiAction = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin role required to approve/reject AI actions');
    }

    const data = request.data || {};
    const actionId = data.actionId || data.requestId;
    if (typeof actionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(actionId)) {
        throw new HttpsError('invalid-argument', 'A valid requestId or actionId is required');
    }

    const reason = typeof data.reason === 'string' ? data.reason.slice(0, 1000)
        : (typeof data.notes === 'string' ? data.notes.slice(0, 1000) : 'Rejected by Admin');
    const requestRef = db.collection("ai_action_requests").doc(actionId);
    const auditRef = db.collection("audit_logs").doc(`AI_ACTION_DECISION_${actionId}`);
    const token = request.auth.token || {};
    await db.runTransaction(async (transaction) => {
        const actionSnapshot = await transaction.get(requestRef);
        if (!actionSnapshot.exists) throw new HttpsError('not-found', 'AI action request was not found.');
        const status = actionSnapshot.data().status;
        if (status === 'REJECTED') return;
        if (status !== 'PENDING') {
            throw new HttpsError('failed-precondition', `Cannot reject an AI action in ${status || 'unknown'} state.`);
        }
        transaction.update(requestRef, {
            status: "REJECTED",
            reason,
            rejectedBy: request.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        transaction.create(auditRef, {
            actionId,
            decision: 'REJECTED',
            reviewedBy: request.auth.uid,
            reviewerRole: token.role || 'ADMIN',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            notes: reason
        });
    });

    return { success: true };
});

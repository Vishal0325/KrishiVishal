const admin = require("firebase-admin");

/**
 * Audit Logging Helper
 * Records sensitive actions in the 'audit_logs' collection.
 */
async function logAudit({ action, actorId, targetId, targetType, metadata = {} }) {
    try {
        const db = admin.firestore();
        await db.collection("audit_logs").add({
            action,
            actorId,
            targetId,
            targetType,
            metadata,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            serverTime: new Date().toISOString()
        });
    } catch (e) {
        console.error("CRITICAL: Audit log failed:", e, { action, targetId });
    }
}

module.exports = {
    logAudit
};

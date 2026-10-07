/**
 * Immutable Audit Logger for Sensitive Enterprise Collections
 * KrishiVishal Security & Financial Control Architecture.
 * 
 * Captures before/after state diffs on financial_settings, skus, suppliers, and users_roles.
 * Writes append-only immutable audit records into the `audit_logs` collection.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");

const SENSITIVE_COLLECTIONS = [
    "financial_settings",
    "skus",
    "suppliers",
    "users_roles",
    "fiscal_periods"
];

/**
 * Computes deep/shallow differences between two objects.
 * Omits internal meta fields like updatedAt, timestamps from triggering noise if identical.
 */
function computeObjectDiff(beforeData = {}, afterData = {}) {
    const diff = {};
    const allKeys = new Set([...Object.keys(beforeData || {}), ...Object.keys(afterData || {})]);

    for (const key of allKeys) {
        const valBefore = beforeData ? beforeData[key] : undefined;
        const valAfter = afterData ? afterData[key] : undefined;

        // Skip internal/volatile fields if desired
        if (key === "updatedAt" || key === "_updatedAt") continue;

        // Simple equivalence comparison for primitives and JSON serializable objects
        const strBefore = JSON.stringify(valBefore);
        const strAfter = JSON.stringify(valAfter);

        if (strBefore !== strAfter) {
            diff[key] = {
                old: valBefore !== undefined ? valBefore : null,
                new: valAfter !== undefined ? valAfter : null
            };
        }
    }

    return diff;
}

/**
 * Core handler to process a document mutation and write an audit record.
 * 
 * @param {string} collectionName
 * @param {string} documentId
 * @param {object|null} beforeData
 * @param {object|null} afterData
 * @param {string} triggeredBy
 * @returns {Promise<object|null>} The audit document payload written
 */
async function processAuditLog(collectionName, documentId, beforeData, afterData, triggeredBy = "SYSTEM") {
    let action = "UPDATE";

    if (!beforeData && afterData) {
        action = "CREATE";
    } else if (beforeData && !afterData) {
        action = "DELETE";
    }

    const changedFields = computeObjectDiff(beforeData, afterData);

    // If no meaningful field changed, skip logging
    if (action === "UPDATE" && Object.keys(changedFields).length === 0) {
        return null;
    }

    const auditPayload = {
        collection: collectionName,
        documentId: documentId,
        action: action,
        changedFields: changedFields,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        triggeredBy: triggeredBy || "SYSTEM",
        metadata: {
            fieldCountChanged: Object.keys(changedFields).length
        }
    };

    const docRef = await db.collection("audit_logs").add(auditPayload);
    return {
        logId: docRef.id,
        ...auditPayload
    };
}

/**
 * Cloud Function trigger generator for a given collection path
 */
function createCollectionAuditTrigger(collectionName) {
    return onDocumentWritten({
        document: `${collectionName}/{docId}`,
        region: "asia-south1",
        memory: "256MiB"
    }, async (event) => {
        const docId = event.params.docId;
        const beforeData = event.data?.before?.exists ? event.data.before.data() : null;
        const afterData = event.data?.after?.exists ? event.data.after.data() : null;

        const triggeredBy = event.auth?.uid || (afterData && afterData.updatedBy) || "SYSTEM";

        try {
            await processAuditLog(collectionName, docId, beforeData, afterData, triggeredBy);
        } catch (err) {
            console.error(`[AuditLogger] Failed to record audit log for ${collectionName}/${docId}:`, err);
        }
    });
}

// Generate exported triggers for sensitive collections
const onFinancialSettingsWritten = createCollectionAuditTrigger("financial_settings");
const onSkuWrittenAudit = createCollectionAuditTrigger("skus");
const onSupplierWritten = createCollectionAuditTrigger("suppliers");
const onUserRoleWritten = createCollectionAuditTrigger("users_roles");

module.exports = {
    SENSITIVE_COLLECTIONS,
    computeObjectDiff,
    processAuditLog,
    createCollectionAuditTrigger,
    onFinancialSettingsWritten,
    onSkuWrittenAudit,
    onSupplierWritten,
    onUserRoleWritten
};

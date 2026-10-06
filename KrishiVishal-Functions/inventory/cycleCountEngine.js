/**
 * KrishiVishal Spoke Hub Cycle Counting & Inventory Audit Engine
 * Blind physical audits, variance calculation, automated quarantine, and manager debit note generation.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';
const ALLOWED_AUDIT_ROLES = ['hubmanager', 'admin', 'superadmin', 'warehousemanager', 'auditor', 'stockauditor'];

/**
 * Validates caller role for audit operations.
 */
function requireAuditRole(auth) {
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const token = auth.token || {};
    const role = (token.role || '').toLowerCase();
    const isAuthorized = token.admin === true ||
        token.isAdmin === true ||
        token.isSuperAdmin === true ||
        ALLOWED_AUDIT_ROLES.includes(role);

    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Caller lacks warehouse audit permissions.');
    }
}

/**
 * Pure function: Computes variance between frozen system snapshot and physical counted items.
 *
 * Rules:
 * 1. variance = countedQty - systemQty
 * 2. variance === 0 && condition === 'GOOD' -> "PASSED"
 * 3. condition === 'DAMAGED' || condition === 'EXPIRED' -> "QUARANTINED"
 * 4. variance < 0 -> "SHORTAGE", discrepancyValue = Math.abs(variance) * landingCost
 * 5. variance > 0 -> "SURPLUS", discrepancyValue = variance * landingCost
 * 6. If total shortage discrepancy > ₹1,000 -> requiresDebitNote = true
 */
function computeAuditVariance(systemSnapshot = {}, submittedCounts = []) {
    let totalShortageValue = 0;
    let totalSurplusValue = 0;
    const damagedItems = [];
    const adjustments = [];
    const varianceReport = [];

    // Map counts by composite key skuCode_batchNumber
    const countedMap = {};
    for (const item of submittedCounts) {
        const sku = String(item.skuCode || '').trim();
        const batch = String(item.batchNumber || 'DEFAULT').trim();
        const key = `${sku}_${batch}`;
        countedMap[key] = {
            skuCode: sku,
            batchNumber: batch,
            countedQty: Number(item.countedQty || 0),
            condition: (item.condition || 'GOOD').toUpperCase()
        };
    }

    // Process all items in system snapshot
    const processedKeys = new Set();

    for (const [key, systemItem] of Object.entries(systemSnapshot)) {
        processedKeys.add(key);
        const sku = systemItem.skuCode;
        const batch = systemItem.batchNumber || 'DEFAULT';
        const systemQty = Number(systemItem.systemQty || 0);
        const landingCost = Number(systemItem.landingCost || 100);
        const productName = systemItem.productName || sku;

        const countData = countedMap[key] || {
            skuCode: sku,
            batchNumber: batch,
            countedQty: 0,
            condition: 'GOOD'
        };

        const countedQty = countData.countedQty;
        const condition = countData.condition;
        const rawVariance = countedQty - systemQty;

        let status = 'PASSED';
        let financialImpact = 0;

        if (condition === 'DAMAGED' || condition === 'EXPIRED') {
            status = 'QUARANTINED';
            financialImpact = countedQty * landingCost;
            damagedItems.push({
                skuCode: sku,
                batchNumber: batch,
                productName,
                quantity: countedQty,
                condition,
                landingCost,
                financialImpact
            });
            adjustments.push({
                skuCode: sku,
                batchNumber: batch,
                systemQty,
                countedQty,
                variance: -countedQty,
                condition,
                landingCost,
                financialImpact,
                reason: 'AUDIT_DAMAGE_QUARANTINE'
            });
        } else if (rawVariance < 0) {
            status = 'SHORTAGE';
            const shortageQty = Math.abs(rawVariance);
            financialImpact = Math.round(shortageQty * landingCost * 100) / 100;
            totalShortageValue += financialImpact;
            adjustments.push({
                skuCode: sku,
                batchNumber: batch,
                systemQty,
                countedQty,
                variance: rawVariance,
                condition,
                landingCost,
                financialImpact,
                reason: 'AUDIT_SHORTAGE'
            });
        } else if (rawVariance > 0) {
            status = 'SURPLUS';
            financialImpact = Math.round(rawVariance * landingCost * 100) / 100;
            totalSurplusValue += financialImpact;
            adjustments.push({
                skuCode: sku,
                batchNumber: batch,
                systemQty,
                countedQty,
                variance: rawVariance,
                condition,
                landingCost,
                financialImpact,
                reason: 'AUDIT_SURPLUS_INWARD'
            });
        }

        varianceReport.push({
            skuCode: sku,
            batchNumber: batch,
            productName,
            systemQty,
            countedQty,
            variance: rawVariance,
            condition,
            landingCost,
            financialImpact,
            status
        });
    }

    // Process any unmapped physical items (SKUs counted that were not in snapshot)
    for (const [key, countData] of Object.entries(countedMap)) {
        if (!processedKeys.has(key)) {
            const countedQty = countData.countedQty;
            const landingCost = 100;
            const financialImpact = countedQty * landingCost;
            totalSurplusValue += financialImpact;

            adjustments.push({
                skuCode: countData.skuCode,
                batchNumber: countData.batchNumber,
                systemQty: 0,
                countedQty,
                variance: countedQty,
                condition: countData.condition,
                landingCost,
                financialImpact,
                reason: 'AUDIT_SURPLUS_UNREGISTERED_INWARD'
            });

            varianceReport.push({
                skuCode: countData.skuCode,
                batchNumber: countData.batchNumber,
                productName: countData.skuCode,
                systemQty: 0,
                countedQty,
                variance: countedQty,
                condition: countData.condition,
                landingCost,
                financialImpact,
                status: 'SURPLUS'
            });
        }
    }

    totalShortageValue = Math.round(totalShortageValue * 100) / 100;
    totalSurplusValue = Math.round(totalSurplusValue * 100) / 100;
    const requiresDebitNote = totalShortageValue > 1000;

    return {
        varianceReport,
        totalShortageValue,
        totalSurplusValue,
        damagedItems,
        adjustments,
        requiresDebitNote
    };
}

/**
 * Callable Function: startHubAuditSession
 * Creates a blind audit session. Freezes system stock in a private subcollection
 * but DOES NOT disclose system quantities in the response.
 */
const startHubAuditSession = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requireAuditRole(request.auth);

    const { hubId, category, auditorId } = request.data || {};
    if (!hubId) {
        throw new HttpsError('invalid-argument', 'Missing required parameter: hubId.');
    }

    const sessionId = `AUD_${hubId}_${Date.now()}`;
    const effectiveAuditorId = auditorId || request.auth.uid;

    // 1. Fetch current live stock for the hub
    const stockQuery = db.collection("warehouse_stock").where("hubId", "==", hubId);
    const stockSnap = await stockQuery.get();

    const snapshotMap = {};
    const blindItemsList = [];

    stockSnap.docs.forEach(doc => {
        const data = doc.data();
        const skuCode = data.skuCode || doc.id;
        const batchNumber = data.batchNumber || data.batchNo || 'DEFAULT';
        const itemCategory = data.category || 'GENERAL';

        if (category && category !== 'ALL' && itemCategory.toLowerCase() !== category.toLowerCase()) {
            return;
        }

        const systemQty = Number(data.availableStock ?? data.quantity ?? data.currentStock ?? 0);
        const landingCost = Number(data.landingCost ?? data.costPrice ?? data.purchasePrice ?? data.unitCost ?? 100);
        const productName = data.productName || data.name || skuCode;

        const key = `${skuCode}_${batchNumber}`;
        snapshotMap[key] = {
            skuCode,
            productName,
            batchNumber,
            category: itemCategory,
            systemQty,
            landingCost
        };

        // Blind Item — Strictly without systemQty or landingCost
        blindItemsList.push({
            skuCode,
            productName,
            batchNumber,
            category: itemCategory
        });
    });

    // 2. Save Session Document
    const sessionRef = db.collection("audit_sessions").doc(sessionId);
    await sessionRef.set({
        sessionId,
        hubId,
        category: category || 'ALL',
        auditorId: effectiveAuditorId,
        status: 'IN_PROGRESS',
        totalItemsCount: blindItemsList.length,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid
    });

    // 3. Freeze System Snapshot in private subcollection (Blind Audit Security)
    await sessionRef.collection("system_snapshot").doc("current").set({
        sessionId,
        hubId,
        snapshot: snapshotMap,
        frozenAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        sessionId,
        hubId,
        category: category || 'ALL',
        status: 'IN_PROGRESS',
        totalItems: blindItemsList.length,
        itemsToCount: blindItemsList // Blind Audit: No systemQty returned to client
    };
});

/**
 * Callable Function: submitAuditCounts
 * Auditor submits scanned physical counts.
 */
const submitAuditCounts = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requireAuditRole(request.auth);

    const { sessionId, items = [] } = request.data || {};
    if (!sessionId || !Array.isArray(items)) {
        throw new HttpsError('invalid-argument', 'Valid sessionId and items array are required.');
    }

    const sessionRef = db.collection("audit_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
        throw new HttpsError('not-found', `Audit session ${sessionId} not found.`);
    }

    const sessionData = sessionSnap.data();
    if (sessionData.status !== 'IN_PROGRESS') {
        throw new HttpsError('failed-precondition', `Audit session is in status ${sessionData.status}, expected IN_PROGRESS.`);
    }

    // Clean and validate items
    const sanitizedItems = items.map(item => ({
        skuCode: String(item.skuCode || '').trim(),
        batchNumber: String(item.batchNumber || 'DEFAULT').trim(),
        countedQty: Math.max(0, Number(item.countedQty || 0)),
        condition: ['DAMAGED', 'EXPIRED'].includes((item.condition || '').toUpperCase())
            ? (item.condition || '').toUpperCase()
            : 'GOOD'
    }));

    await sessionRef.update({
        submittedCounts: sanitizedItems,
        status: 'COUNTS_SUBMITTED',
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedBy: request.auth.uid
    });

    return {
        success: true,
        sessionId,
        status: 'COUNTS_SUBMITTED',
        totalItemsSubmitted: sanitizedItems.length
    };
});

/**
 * Callable Function: reconcileAuditSession
 * Compares physical counts with frozen snapshot, creates adjustments,
 * moves damaged stock to quarantine, updates warehouse stock,
 * and generates manager debit note if shortage > ₹1,000.
 */
const reconcileAuditSession = onCall({ region: REGION, timeoutSeconds: 90, memory: '256MiB' }, async (request) => {
    requireAuditRole(request.auth);

    const { sessionId } = request.data || {};
    if (!sessionId) {
        throw new HttpsError('invalid-argument', 'Missing required parameter: sessionId.');
    }

    const sessionRef = db.collection("audit_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
        throw new HttpsError('not-found', `Audit session ${sessionId} not found.`);
    }

    const sessionData = sessionSnap.data();
    const hubId = sessionData.hubId;
    const submittedCounts = sessionData.submittedCounts || [];

    // Read the frozen snapshot
    const snapshotSnap = await sessionRef.collection("system_snapshot").doc("current").get();
    if (!snapshotSnap.exists) {
        throw new HttpsError('not-found', `Frozen system snapshot for session ${sessionId} not found.`);
    }

    const systemSnapshot = snapshotSnap.data().snapshot || {};

    // 1. Calculate Variance
    const varianceSummary = computeAuditVariance(systemSnapshot, submittedCounts);
    const { varianceReport, totalShortageValue, totalSurplusValue, damagedItems, adjustments, requiresDebitNote } = varianceSummary;

    const batch = db.batch();

    // 2. Record Inventory Adjustments
    adjustments.forEach(adj => {
        const adjId = `ADJ_${sessionId}_${adj.skuCode}_${adj.batchNumber}`;
        const adjRef = db.collection("inventory_adjustments").doc(adjId);
        batch.set(adjRef, {
            adjustmentId: adjId,
            sessionId,
            hubId,
            skuCode: adj.skuCode,
            batchNumber: adj.batchNumber,
            systemQty: adj.systemQty,
            countedQty: adj.countedQty,
            variance: adj.variance,
            condition: adj.condition,
            landingCost: adj.landingCost,
            financialImpact: adj.financialImpact,
            reason: adj.reason,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    // 3. Move Damaged/Expired Stock to Quarantine
    damagedItems.forEach(dmg => {
        const qrnId = `QRN_${sessionId}_${dmg.skuCode}_${dmg.batchNumber}`;
        const qrnRef = db.collection("quarantine_stock").doc(qrnId);
        batch.set(qrnRef, {
            quarantineId: qrnId,
            hubId,
            sessionId,
            skuCode: dmg.skuCode,
            productName: dmg.productName,
            batchNumber: dmg.batchNumber,
            quantity: dmg.quantity,
            condition: dmg.condition,
            landingCost: dmg.landingCost,
            financialImpact: dmg.financialImpact,
            quarantinedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'QUARANTINED'
        });
    });

    // 4. Update warehouse_stock with physical counted GOOD stock
    varianceReport.forEach(item => {
        const stockDocId = `${item.skuCode}_${hubId}`;
        const stockRef = db.collection("warehouse_stock").doc(stockDocId);
        const goodQty = item.condition === 'GOOD' ? item.countedQty : 0;

        batch.set(stockRef, {
            skuCode: item.skuCode,
            hubId,
            batchNumber: item.batchNumber,
            availableStock: goodQty,
            lastAuditedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAuditSessionId: sessionId
        }, { merge: true });
    });

    // 5. Shortage Threshold Alert (> ₹1,000) & Hub Manager Liability Debit Note
    let debitNoteId = null;
    if (requiresDebitNote) {
        // A. Raise Critical Admin Alert
        const alertId = `ALERT_AUDIT_SHORTAGE_${sessionId}`;
        const alertRef = db.collection("admin_alerts").doc(alertId);
        batch.set(alertRef, {
            alertId,
            type: 'INVENTORY_SHORTAGE_THRESHOLD_EXCEEDED',
            severity: 'CRITICAL',
            hubId,
            sessionId,
            totalShortageValue,
            threshold: 1000,
            message: `Hub ${hubId} inventory audit reported critical shortage of ₹${totalShortageValue.toFixed(2)}, exceeding liability threshold.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // B. Generate Hub Manager Debit Note
        debitNoteId = `DN_${hubId}_${Date.now()}`;
        const debitNoteRef = db.collection("hub_debit_notes").doc(debitNoteId);
        batch.set(debitNoteRef, {
            debitNoteId,
            hubId,
            sessionId,
            issuedTo: sessionData.auditorId || hubId,
            liabilityType: 'HUB_MANAGER_INVENTORY_SHORTAGE',
            amount: totalShortageValue,
            currency: 'INR',
            status: 'ISSUED',
            reason: `Physical audit shortage exceeding ₹1,000 threshold (Total: ₹${totalShortageValue})`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    // 6. Complete Session
    batch.update(sessionRef, {
        status: 'COMPLETED',
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        reconciledBy: request.auth.uid,
        totalShortageValue,
        totalSurplusValue,
        requiresDebitNote,
        debitNoteId,
        varianceReport
    });

    await batch.commit();

    return {
        success: true,
        sessionId,
        status: 'COMPLETED',
        totalShortageValue,
        totalSurplusValue,
        requiresDebitNote,
        debitNoteId,
        totalItemsReconciled: varianceReport.length,
        varianceReport
    };
});

module.exports = {
    computeAuditVariance,
    startHubAuditSession,
    submitAuditCounts,
    reconcileAuditSession
};

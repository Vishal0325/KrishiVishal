const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { getWarehouseStockRef, recordMovement } = require("./inventoryEngine");

const REGION = 'asia-south1';

/**
 * Validates batch metadata on stock transfer creation or dispatch
 * Rejects quantity-only movements without batchId, expiryDate, mfgDate
 */
function validateTransferBatchMetadata(items) {
    for (const item of items) {
        if (!item.batchId || !item.expiryDate || !item.mfgDate) {
            throw new Error(`Mandatory Batch Metadata Missing: batchId, expiryDate, and mfgDate are required for SKU ${item.skuCode || item.productId}`);
        }
    }
}

/**
 * Handles Destination Receipt Preservation when transfer is marked RECEIVED
 */
async function processStockTransferReceipt(beforeData, afterData, transferId) {
    if (!beforeData || !afterData || !transferId) return { skipped: true, reason: 'INVALID_INPUT' };

    const wasReceived = beforeData.status === 'RECEIVED';
    const isReceived = afterData.status === 'RECEIVED';

    if (wasReceived || !isReceived) {
        return { skipped: true, reason: 'NOT_TRANSITIONED_TO_RECEIVED' };
    }

    const destinationHubId = afterData.destinationHubId || afterData.destinationHub;
    if (!destinationHubId) throw new Error("Destination hub ID is missing");

    const items = afterData.items || afterData.lineItems || [];

    await db.runTransaction(async (transaction) => {
        for (const item of items) {
            const skuCode = item.skuCode || item.productId;
            const batchId = item.batchId;
            const quantity = Number(item.quantity || 0);

            if (!skuCode || !batchId || quantity <= 0) continue;

            const skuRef = db.collection("skus").doc(skuCode);
            const batchRef = skuRef.collection("batches").doc(batchId);

            const mfgTimestamp = item.mfgDate ? admin.firestore.Timestamp.fromDate(new Date(item.mfgDate)) : null;
            const expTimestamp = item.expiryDate ? admin.firestore.Timestamp.fromDate(new Date(item.expiryDate)) : null;

            const wsRef = getWarehouseStockRef(skuCode, batchId, destinationHubId);
            const wsSnap = await transaction.get(wsRef);
            
            // Destination Receipt Preservation
            transaction.set(batchRef, {
                batchId: batchId,
                batchNumber: item.batchNumber || batchId,
                mfgDate: mfgTimestamp,
                expiryDate: expTimestamp,
                stock: admin.firestore.FieldValue.increment(quantity),
                warehouseId: destinationHubId,
                isActive: true,
                qualityStatus: "PASSED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };

            const availBefore = wsData.availableStock || 0;
            const availAfter = availBefore + quantity;

            transaction.set(wsRef, {
                skuCode,
                batchId,
                warehouseId: destinationHubId,
                availableStock: availAfter,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            transaction.update(skuRef, {
                "inventory.availableStock": admin.firestore.FieldValue.increment(quantity),
                "inventory.totalStock": admin.firestore.FieldValue.increment(quantity),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            recordMovement(transaction, {
                movementType: "TRANSFER_RECEIPT",
                skuCode,
                batchId,
                batchNumber: item.batchNumber || batchId,
                warehouseId: destinationHubId,
                quantity,
                availableBefore: availBefore,
                availableAfter: availAfter,
                committedBefore: wsData.committedStock || 0,
                committedAfter: wsData.committedStock || 0,
                referenceId: transferId,
                actorId: afterData.receivedBy || "SYSTEM",
                actorRole: "HUB_MANAGER",
                reason: `Inter-hub transfer received at destination ${destinationHubId}`,
                idempotencyKey: 'TRF_RECV_' + transferId + '_' + skuCode + '_' + batchId
            });
        }
    });

    return { success: true, processed: true };
}

exports.processStockTransferReceipt = processStockTransferReceipt;
exports.validateTransferBatchMetadata = validateTransferBatchMetadata;

exports.onStockTransferCreatedGuard = onDocumentCreated({ document: "stock_transfers/{transferId}", region: REGION }, async (event) => {
    const data = event.data?.data();
    if (!data) return;
    try {
        validateTransferBatchMetadata(data.items || data.lineItems || []);
    } catch (err) {
        await event.data.ref.update({ status: 'REJECTED_INVALID_BATCH', error: err.message });
    }
});

exports.onStockTransferReceived = onDocumentUpdated({ document: "stock_transfers/{transferId}", region: REGION }, async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const transferId = event.params.transferId;

    try {
        if (afterData.status === 'IN_TRANSIT' && beforeData.status !== 'IN_TRANSIT') {
             validateTransferBatchMetadata(afterData.items || afterData.lineItems || []);
        }
    } catch (err) {
        await event.data?.after?.ref.update({ status: 'FAILED_VALIDATION', error: err.message });
        return;
    }

    return await processStockTransferReceipt(beforeData, afterData, transferId);
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { getWarehouseStockRef, recordMovement, DEFAULT_WAREHOUSE_ID } = require("./inventoryEngine");
const { postLedgerEntry } = require("../finance/ledger");

const REGION = 'asia-south1';

/**
 * Core business logic for resolving quarantined stock (RTV or Write-Off)
 * Usable inside unit tests and from onCall wrapper.
 */
async function resolveQuarantinedStockLogic(payload) {
    const {
        quarantineId,
        action,
        quantity,
        vendorId = "",
        vendorName = "",
        debitNoteRef = "",
        writeOffReason = "",
        unitCost = 0,
        actorId = "SYSTEM"
    } = payload || {};

    if (!quarantineId) {
        throw new Error("INVALID_ARGUMENT: quarantineId is required.");
    }
    if (!['RETURN_TO_VENDOR', 'WRITE_OFF'].includes(action)) {
        throw new Error("INVALID_ARGUMENT: action must be RETURN_TO_VENDOR or WRITE_OFF.");
    }
    const resolveQty = Number(quantity);
    if (!resolveQty || isNaN(resolveQty) || resolveQty <= 0) {
        throw new Error("INVALID_ARGUMENT: quantity must be greater than 0.");
    }

    return await db.runTransaction(async (transaction) => {
        const qRef = db.collection("inventory_quarantine").doc(quarantineId);
        const qSnap = await transaction.get(qRef);

        if (!qSnap.exists) {
            throw new Error(`NOT_FOUND: Quarantine record ${quarantineId} does not exist.`);
        }

        const qData = qSnap.data();
        const currentStatus = qData.status || "PENDING";
        if (currentStatus !== "PENDING" && currentStatus !== "PARTIALLY_RESOLVED") {
            throw new Error(`INVALID_STATE: Quarantine record is already ${currentStatus}.`);
        }

        const totalDamaged = Number(qData.damagedQty || 0);
        const alreadyResolved = Number(qData.resolvedQty || 0);
        const remainingDamaged = totalDamaged - alreadyResolved;

        if (resolveQty > remainingDamaged) {
            throw new Error(`INSUFFICIENT_QUARANTINE_STOCK: Requested ${resolveQty} exceeds remaining damaged stock (${remainingDamaged}).`);
        }

        const skuCode = qData.skuCode;
        const batchId = qData.batchId;
        const hubId = qData.hubId || qData.warehouseId || DEFAULT_WAREHOUSE_ID;

        // Fetch warehouse_stock doc to get current quarantinedQty
        const wsRef = getWarehouseStockRef(skuCode, batchId, hubId);
        const wsSnap = await transaction.get(wsRef);
        const wsData = wsSnap.exists ? wsSnap.data() : {};
        const currentWsQuarantined = Number(wsData.quarantinedQty || 0);

        if (currentWsQuarantined < resolveQty) {
            throw new Error(`INSUFFICIENT_QUARANTINE_STOCK: Warehouse quarantined stock (${currentWsQuarantined}) is less than requested ${resolveQty}.`);
        }

        // Fetch SKU doc to get catalog details / cost fallback
        const skuRef = db.collection("skus").doc(skuCode);
        const skuSnap = await transaction.get(skuRef);
        const skuData = skuSnap.exists ? skuSnap.data() : {};

        // Fetch batch doc for cost if available
        const batchRef = skuRef.collection("batches").doc(batchId);
        const batchSnap = await transaction.get(batchRef);
        const batchData = batchSnap.exists ? batchSnap.data() : {};

        const effectiveUnitCost = Number(unitCost || batchData.landingCost || skuData.costPrice || skuData.purchasePrice || 100);
        const totalResolutionValue = Number((resolveQty * effectiveUnitCost).toFixed(2));

        // 1. Update warehouse_stock: decrement quarantinedQty atomically
        const newWsQuarantined = Math.max(0, currentWsQuarantined - resolveQty);
        transaction.set(wsRef, {
            quarantinedQty: newWsQuarantined,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Update SKU aggregate
        transaction.update(skuRef, {
            "inventory.quarantinedStock": admin.firestore.FieldValue.increment(-resolveQty),
            "inventory.totalStock": admin.firestore.FieldValue.increment(-resolveQty),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update inventory_quarantine document
        const newResolvedTotal = alreadyResolved + resolveQty;
        const finalStatus = newResolvedTotal >= totalDamaged
            ? (action === 'RETURN_TO_VENDOR' ? 'RETURNED_TO_VENDOR' : 'WRITTEN_OFF')
            : 'PARTIALLY_RESOLVED';

        transaction.update(qRef, {
            status: finalStatus,
            resolvedQty: newResolvedTotal,
            lastAction: action,
            lastResolvedQty: resolveQty,
            vendorId: vendorId || qData.vendorId || "",
            vendorName: vendorName || qData.vendorName || "",
            debitNoteRef: debitNoteRef || qData.debitNoteRef || "",
            writeOffReason: writeOffReason || qData.writeOffReason || "",
            resolutionValue: totalResolutionValue,
            resolvedBy: actorId,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const cleanBatch = batchId || "GENERAL";
        const cleanRef = debitNoteRef || qData.grnId || quarantineId;

        // 3. Movement Log & Double-Entry Ledger
        if (action === 'RETURN_TO_VENDOR') {
            recordMovement(transaction, {
                movementType: "PURCHASE_RETURN_DEFECTIVE",
                skuCode,
                batchId: cleanBatch,
                batchNumber: qData.batchNumber || cleanBatch,
                warehouseId: hubId,
                quantity: resolveQty,
                availableBefore: Number(wsData.availableStock || 0),
                availableAfter: Number(wsData.availableStock || 0),
                committedBefore: Number(wsData.committedStock || 0),
                committedAfter: Number(wsData.committedStock || 0),
                referenceId: debitNoteRef || quarantineId,
                actorId,
                actorRole: "HUB_MANAGER",
                reason: `Returned to Vendor [${vendorName || vendorId || 'Supplier'}] - Debit Note: ${debitNoteRef || 'N/A'}`,
                idempotencyKey: `RTV_${quarantineId}_${Date.now()}`
            });

            // Ledger: Debit ACCOUNTS_PAYABLE, Credit INVENTORY_QUARANTINE_ASSET
            await postLedgerEntry(transaction, {
                account: 'ACCOUNTS_PAYABLE',
                type: 'DEBIT',
                amount: totalResolutionValue,
                referenceId: debitNoteRef || quarantineId,
                referenceType: 'RETURN_TO_VENDOR',
                idempotencyKey: `LEDGER_RTV_DR_${quarantineId}_${Date.now()}`,
                description: `Debit Note against vendor for defective stock return [${skuCode}]`
            });

            await postLedgerEntry(transaction, {
                account: 'INVENTORY_QUARANTINE_ASSET',
                type: 'CREDIT',
                amount: totalResolutionValue,
                referenceId: debitNoteRef || quarantineId,
                referenceType: 'RETURN_TO_VENDOR',
                idempotencyKey: `LEDGER_RTV_CR_${quarantineId}_${Date.now()}`,
                description: `Relieve quarantine stock asset for vendor return [${skuCode}]`
            });
        } else {
            // WRITE_OFF action
            recordMovement(transaction, {
                movementType: "DAMAGE_SCRAP_WRITEOFF",
                skuCode,
                batchId: cleanBatch,
                batchNumber: qData.batchNumber || cleanBatch,
                warehouseId: hubId,
                quantity: resolveQty,
                availableBefore: Number(wsData.availableStock || 0),
                availableAfter: Number(wsData.availableStock || 0),
                committedBefore: Number(wsData.committedStock || 0),
                committedAfter: Number(wsData.committedStock || 0),
                referenceId: quarantineId,
                actorId,
                actorRole: "HUB_MANAGER",
                reason: `Stock Scrap/Write-Off: ${writeOffReason || 'Defective/Expired on arrival'}`,
                idempotencyKey: `WRITEOFF_${quarantineId}_${Date.now()}`
            });

            // Ledger: Debit INVENTORY_SHRINKAGE_LOSS, Credit INVENTORY_QUARANTINE_ASSET
            await postLedgerEntry(transaction, {
                account: 'INVENTORY_SHRINKAGE_LOSS',
                type: 'DEBIT',
                amount: totalResolutionValue,
                referenceId: quarantineId,
                referenceType: 'QUARANTINE_WRITE_OFF',
                idempotencyKey: `LEDGER_SCRAP_DR_${quarantineId}_${Date.now()}`,
                description: `Expense loss for scrap/damaged stock write-off [${skuCode}]`
            });

            await postLedgerEntry(transaction, {
                account: 'INVENTORY_QUARANTINE_ASSET',
                type: 'CREDIT',
                amount: totalResolutionValue,
                referenceId: quarantineId,
                referenceType: 'QUARANTINE_WRITE_OFF',
                idempotencyKey: `LEDGER_SCRAP_CR_${quarantineId}_${Date.now()}`,
                description: `Relieve quarantine stock asset for scrapped inventory [${skuCode}]`
            });
        }

        return {
            success: true,
            quarantineId,
            action,
            resolvedQty: resolveQty,
            totalResolutionValue,
            status: finalStatus,
            remainingDamaged: totalDamaged - newResolvedTotal
        };
    });
}

/**
 * Callable Function: resolveQuarantinedStock
 */
const resolveQuarantinedStock = onCall({ region: REGION }, async (request) => {
    const token = request.auth?.token || {};
    const allowed = token.admin === true || token.isAdmin === true ||
        ['SuperAdmin', 'HubManager', 'InventoryManager'].includes(token.role);
    if (!allowed) {
        throw new HttpsError('permission-denied', 'Only Hub Managers or Admins can resolve quarantined inventory.');
    }

    try {
        const payload = {
            ...request.data,
            actorId: request.auth?.uid || "ADMIN"
        };
        return await resolveQuarantinedStockLogic(payload);
    } catch (err) {
        if (err.message.startsWith("INVALID_ARGUMENT") || err.message.startsWith("INSUFFICIENT_QUARANTINE_STOCK") || err.message.startsWith("INVALID_STATE")) {
            throw new HttpsError("invalid-argument", err.message);
        }
        if (err.message.startsWith("NOT_FOUND")) {
            throw new HttpsError("not-found", err.message);
        }
        throw new HttpsError("internal", err.message);
    }
});

module.exports = {
    resolveQuarantinedStock,
    resolveQuarantinedStockLogic
};

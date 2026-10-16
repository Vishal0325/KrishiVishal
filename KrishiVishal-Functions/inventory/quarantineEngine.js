const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { getWarehouseStockRef, recordMovement, DEFAULT_WAREHOUSE_ID } = require("./inventoryEngine");
const { postJournalEntry } = require("../finance/generalLedger");
const { getFiscalPeriodId } = require("../finance/walletService");
const { isSystem1Frozen } = require("../finance/ledger");
const { isAccountActive, isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * Core business logic for resolving quarantined stock (RTV or Write-Off)
 * Usable inside unit tests and from onCall wrapper.
 */
async function resolveQuarantinedStockLogic(payload) {
    const {
        quarantineId,
        requestId,
        action,
        quantity,
        vendorId = "",
        vendorName = "",
        debitNoteRef = "",
        writeOffReason = "",
        unitCost = 0,
        actorId = "SYSTEM",
        allowedHubId = null
    } = payload || {};

    if (!quarantineId || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
        throw new Error("INVALID_ARGUMENT: quarantineId and a valid requestId are required.");
    }
    if (!['RETURN_TO_VENDOR', 'WRITE_OFF'].includes(action)) {
        throw new Error("INVALID_ARGUMENT: action must be RETURN_TO_VENDOR or WRITE_OFF.");
    }
    const resolveQty = Number(quantity);
    if (!resolveQty || isNaN(resolveQty) || resolveQty <= 0) {
        throw new Error("INVALID_ARGUMENT: quantity must be greater than 0.");
    }
    const operationFingerprint = JSON.stringify({
        quarantineId,
        action,
        quantity: resolveQty,
        actorId,
        vendorId,
        vendorName,
        debitNoteRef,
        writeOffReason,
        unitCost
    });

    return await db.runTransaction(async (transaction) => {
        const requestRef = db.collection("quarantine_resolution_requests").doc(requestId);
        const requestSnap = await transaction.get(requestRef);
        if (requestSnap.exists) {
            const prior = requestSnap.data();
            if (prior.quarantineId !== quarantineId || prior.action !== action ||
                prior.quantity !== resolveQty || prior.actorId !== actorId ||
                (prior.operationFingerprint && prior.operationFingerprint !== operationFingerprint)) {
                throw new Error("INVALID_ARGUMENT: requestId was already used for a different resolution.");
            }
            if (allowedHubId) {
                const priorQuarantineSnap = await transaction.get(
                    db.collection("inventory_quarantine").doc(quarantineId)
                );
                const priorQuarantine = priorQuarantineSnap.exists ? priorQuarantineSnap.data() : {};
                const priorHubId = priorQuarantine.hubId || priorQuarantine.warehouseId || DEFAULT_WAREHOUSE_ID;
                if (priorHubId !== allowedHubId) {
                    throw new HttpsError('permission-denied', 'Hub Managers may only resolve quarantine stock assigned to their hub.');
                }
            }
            return prior.result;
        }

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
        if (allowedHubId && hubId !== allowedHubId) {
            throw new HttpsError('permission-denied', 'Hub Managers may only resolve quarantine stock assigned to their hub.');
        }

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

        // PHASE 2: SYSTEM 2 JOURNAL ENTRY (Must execute before any caller writes - Contract Rule 2)
        const now = new Date();
        const periodId = getFiscalPeriodId(now);
        let journalEntryId = null;

        if (action === 'RETURN_TO_VENDOR') {
            const rtvEntryId = `JE_QUARANTINE_RTV_${requestId}`;
            const rtvReferenceId = debitNoteRef
                ? `${debitNoteRef}_${quarantineId}_${alreadyResolved + resolveQty}`
                : `${quarantineId}_${alreadyResolved + resolveQty}`;
            const jeResult = await postJournalEntry({
                entryId: rtvEntryId,
                refType: 'QUARANTINE_RESOLUTION',
                refId: rtvReferenceId,
                periodId,
                date: now,
                memo: `RTV Settlement: Debit Note #${debitNoteRef || 'N/A'} for ${resolveQty} units of SKU ${skuCode} returned to Supplier ${vendorId || 'N/A'}`,
                lines: [
                    {
                        accountCode: '2010_ACCOUNTS_PAYABLE_SUPPLIERS',
                        debit: totalResolutionValue,
                        credit: 0,
                        description: `Debit Note against vendor for defective stock return [${skuCode}]`
                    },
                    {
                        accountCode: '1045_INVENTORY_QUARANTINE_ASSET',
                        debit: 0,
                        credit: totalResolutionValue,
                        description: `Relieve quarantine stock asset for vendor return [${skuCode}]`
                    }
                ],
                createdBy: actorId
            }, transaction);
            journalEntryId = jeResult?.entryId || rtvEntryId;
        } else {
            // WRITE_OFF action
            const scrapEntryId = `JE_QUARANTINE_SCRAP_${requestId}`;
            const jeResult = await postJournalEntry({
                entryId: scrapEntryId,
                refType: 'QUARANTINE_RESOLUTION',
                refId: quarantineId,
                periodId,
                date: now,
                memo: `Scrap Write-Off: Approved write-off of ${resolveQty} units of SKU ${skuCode} (Quarantine #${quarantineId})`,
                lines: [
                    {
                        accountCode: '5020_INVENTORY_SHRINKAGE_LOSS',
                        debit: totalResolutionValue,
                        credit: 0,
                        description: `Expense loss for scrap/damaged stock write-off [${skuCode}]`
                    },
                    {
                        accountCode: '1045_INVENTORY_QUARANTINE_ASSET',
                        debit: 0,
                        credit: totalResolutionValue,
                        description: `Relieve quarantine stock asset for scrapped inventory [${skuCode}]`
                    }
                ],
                createdBy: actorId
            }, transaction);
            journalEntryId = jeResult?.entryId || scrapEntryId;
        }

        // PHASE 3: ALL CALLER WRITES STAGED STRICTLY AFTER postJournalEntry
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
            journalEntryId,
            resolvedBy: actorId,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const cleanBatch = batchId || "GENERAL";

        // 3. Movement Log & Backward-compatible Ledger
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
                idempotencyKey: `RTV_${requestId}`
            });

            // Backward-compatible ledger record (only active when System 1 is not frozen)
            if (!isSystem1Frozen()) {
                const leg1 = db.collection("ledger").doc(`LEDGER_RTV_DR_${requestId}`);
                transaction.set(leg1, {
                    account: 'ACCOUNTS_PAYABLE',
                    type: 'DEBIT',
                    amount: totalResolutionValue,
                    referenceId: debitNoteRef || quarantineId,
                    referenceType: 'RETURN_TO_VENDOR',
                    description: `Debit Note against vendor for defective stock return [${skuCode}]`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                const leg2 = db.collection("ledger").doc(`LEDGER_RTV_CR_${requestId}`);
                transaction.set(leg2, {
                    account: 'INVENTORY_QUARANTINE_ASSET',
                    type: 'CREDIT',
                    amount: totalResolutionValue,
                    referenceId: debitNoteRef || quarantineId,
                    referenceType: 'RETURN_TO_VENDOR',
                    description: `Relieve quarantine stock asset for vendor return [${skuCode}]`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }
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
                idempotencyKey: `WRITEOFF_${requestId}`
            });

            // Backward-compatible ledger record (only active when System 1 is not frozen)
            if (!isSystem1Frozen()) {
                const leg1 = db.collection("ledger").doc(`LEDGER_SCRAP_DR_${requestId}`);
                transaction.set(leg1, {
                    account: 'INVENTORY_SHRINKAGE_LOSS',
                    type: 'DEBIT',
                    amount: totalResolutionValue,
                    referenceId: quarantineId,
                    referenceType: 'QUARANTINE_WRITE_OFF',
                    description: `Expense loss for scrap/damaged stock write-off [${skuCode}]`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                const leg2 = db.collection("ledger").doc(`LEDGER_SCRAP_CR_${requestId}`);
                transaction.set(leg2, {
                    account: 'INVENTORY_QUARANTINE_ASSET',
                    type: 'CREDIT',
                    amount: totalResolutionValue,
                    referenceId: quarantineId,
                    referenceType: 'QUARANTINE_WRITE_OFF',
                    description: `Relieve quarantine stock asset for scrapped inventory [${skuCode}]`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        const result = {
            success: true,
            quarantineId,
            requestId,
            action,
            resolvedQty: resolveQty,
            totalResolutionValue,
            status: finalStatus,
            remainingDamaged: totalDamaged - newResolvedTotal,
            journalEntryId
        };
        transaction.create(requestRef, {
            quarantineId,
            action,
            quantity: resolveQty,
            actorId,
            operationFingerprint,
            result,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return result;
    });
}

/**
 * Callable Function: resolveQuarantinedStock
 */
const resolveQuarantinedStock = onCall({ region: REGION }, async (request) => {
    const token = request.auth?.token || {};
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const isAdmin = await isAdminRequest(request);
    const isInventoryManager = token.role === 'InventoryManager' && await isAccountActive(request.auth.uid);
    const isHubManager = ['HubManager', 'WarehouseManager'].includes(token.role) &&
        typeof token.hubId === 'string' && token.hubId.trim().length > 0 &&
        await isAccountActive(request.auth.uid);
    if (!isAdmin && !isInventoryManager && !isHubManager) {
        throw new HttpsError('permission-denied', 'Only Hub Managers or Admins can resolve quarantined inventory.');
    }
    const requestId = request.data?.requestId;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
        throw new HttpsError('invalid-argument', 'A valid requestId is required for idempotent quarantine resolution.');
    }

    try {
        const payload = {
            ...request.data,
            actorId: request.auth.uid,
            allowedHubId: isHubManager ? token.hubId : null
        };
        return await resolveQuarantinedStockLogic(payload);
    } catch (err) {
        if (err instanceof HttpsError) throw err;
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

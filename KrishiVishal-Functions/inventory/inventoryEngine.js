/**
 * KrishiVishal Inventory Engine
 * - Authoritative Warehouse Stock Management
 * - FEFO (First-Expiry-First-Out) Allocation
 * - Immutable Movement Ledger (inventory_movements)
 * - Strict Idempotency Handling
 */

const { db, admin } = require("../core/admin");
const { validateSku } = require("./skuValidator");

const DEFAULT_WAREHOUSE_ID = "WH-PURNEA-01";

/**
 * Checks and locks idempotency key within a transaction.
 * @param {FirebaseFirestore.Transaction} transaction 
 * @param {string} idempotencyKey 
 * @returns {Promise<{ alreadyProcessed: boolean, cachedResult?: any, keyRef: FirebaseFirestore.DocumentReference }>}
 */
async function checkIdempotency(transaction, idempotencyKey) {
    if (!idempotencyKey) {
        throw new Error("Idempotency key is required for inventory mutations.");
    }
    const keyRef = db.collection("idempotency_keys").doc(idempotencyKey);
    const keySnap = await transaction.get(keyRef);

    if (keySnap.exists) {
        const data = keySnap.data();
        if (data.status === "COMPLETED") {
            return { alreadyProcessed: true, cachedResult: data.result, keyRef };
        }
        if (data.status === "PROCESSING") {
            // Check for stale lock (> 60s)
            const ageMs = Date.now() - (data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now());
            if (ageMs < 60000) {
                throw new Error(`Concurrent operation in progress for key '${idempotencyKey}'.`);
            }
        }
    }

    return { alreadyProcessed: false, keyRef };
}

/**
 * Marks idempotency key as completed
 */
function recordIdempotencySuccess(transaction, keyRef, resultPayload) {
    transaction.set(keyRef, {
        status: "COMPLETED",
        result: resultPayload || { success: true },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Appends an immutable inventory ledger record.
 */
function recordMovement(transaction, movement) {
    const movementRef = db.collection("inventory_movements").doc();
    const movementId = movementRef.id;

    const payload = {
        movementId,
        movementType: movement.movementType,
        skuCode: movement.skuCode,
        batchId: movement.batchId || null,
        batchNumber: movement.batchNumber || null,
        warehouseId: movement.warehouseId || DEFAULT_WAREHOUSE_ID,
        quantity: Number(movement.quantity || 0),
        availableBefore: Number(movement.availableBefore ?? 0),
        availableAfter: Number(movement.availableAfter ?? 0),
        committedBefore: Number(movement.committedBefore ?? 0),
        committedAfter: Number(movement.committedAfter ?? 0),
        referenceId: movement.referenceId || "",
        actorId: movement.actorId || "SYSTEM",
        actorRole: movement.actorRole || "SYSTEM",
        reason: movement.reason || "",
        note: movement.note || "",
        idempotencyKey: movement.idempotencyKey || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    transaction.set(movementRef, payload);
    return movementId;
}

/**
 * Helper to get warehouse_stock doc reference
 */
function getWarehouseStockRef(skuCode, batchId, warehouseId = DEFAULT_WAREHOUSE_ID) {
    const cleanBatch = batchId || "GENERAL";
    const docId = `${skuCode}_${cleanBatch}_${warehouseId}`;
    return db.collection("warehouse_stock").doc(docId);
}

/**
 * Allocates sellable stock using FEFO across active, non-expired, PASSED batches.
 * @param {FirebaseFirestore.Transaction} transaction 
 * @param {string} skuCode 
 * @param {number} requiredQty 
 * @param {string} warehouseId 
 * @returns {Promise<Array<{ batchId: string, batchNumber: string, warehouseId: string, allocatedQty: number, expiryDate: any }>>}
 */
async function allocateStockFEFO(transaction, skuCode, requiredQty, warehouseId = DEFAULT_WAREHOUSE_ID) {
    if (requiredQty <= 0) return [];

    const nowTimestamp = admin.firestore.Timestamp.now();

    // 1. Fetch all batches for SKU
    const skuRef = db.collection("skus").doc(skuCode);
    const batchesSnap = await transaction.get(
        skuRef.collection("batches")
            .where("isActive", "==", true)
            .where("qualityStatus", "==", "PASSED")
    );

    const eligibleBatches = [];

    for (const doc of batchesSnap.docs) {
        const b = doc.data();
        // Exclude expired batches
        if (b.expiryDate && b.expiryDate.toMillis() <= nowTimestamp.toMillis()) {
            continue;
        }

        // Get location stock for this batch in target warehouse
        const wsRef = getWarehouseStockRef(skuCode, doc.id, warehouseId);
        const wsSnap = await transaction.get(wsRef);
        const availableInWs = wsSnap.exists ? (wsSnap.data().availableStock || 0) : 0;

        if (availableInWs > 0) {
            eligibleBatches.push({
                batchId: doc.id,
                batchNumber: b.batchNumber || doc.id,
                warehouseId,
                availableStock: availableInWs,
                expiryDate: b.expiryDate || admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 3600 * 1000),
                wsRef
            });
        }
    }

    // 2. Sort FEFO (Earliest expiry date first)
    eligibleBatches.sort((a, b) => a.expiryDate.toMillis() - b.expiryDate.toMillis());

    let remainingNeeded = requiredQty;
    const allocations = [];

    for (const batch of eligibleBatches) {
        if (remainingNeeded <= 0) break;

        const allocQty = Math.min(batch.availableStock, remainingNeeded);
        allocations.push({
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            warehouseId: batch.warehouseId,
            allocatedQty: allocQty,
            expiryDate: batch.expiryDate,
            wsRef: batch.wsRef
        });

        remainingNeeded -= allocQty;
    }

    if (remainingNeeded > 0) {
        throw new Error(`Insufficient sellable stock for SKU ${skuCode}. Required: ${requiredQty}, Available (non-expired, PASSED): ${requiredQty - remainingNeeded}`);
    }

    return allocations;
}

/**
 * Reserves stock for an order atomically using FEFO
 */
async function reserveOrderStock(transaction, { orderId, items, userId, idempotencyKey }) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    const allocationsSummary = [];

    for (const item of items) {
        const { skuCode, quantity } = item;
        const skuRef = db.collection("skus").doc(skuCode);
        const skuSnap = await transaction.get(skuRef);

        if (!skuSnap.exists) {
            throw new Error(`SKU ${skuCode} does not exist in master catalog.`);
        }

        const skuData = skuSnap.data();
        if (skuData.isActive === false) {
            throw new Error(`SKU ${skuCode} is currently deactivated.`);
        }

        const currentSkuAvail = skuData.inventory?.availableStock || 0;
        const currentSkuCommitted = skuData.inventory?.committedStock || 0;

        if (currentSkuAvail < quantity) {
            throw new Error(`Insufficient overall available stock for SKU ${skuCode}. Available: ${currentSkuAvail}, Requested: ${quantity}`);
        }

        // Allocate across batches via FEFO
        const batchAllocs = await allocateStockFEFO(transaction, skuCode, quantity, item.warehouseId || DEFAULT_WAREHOUSE_ID);

        for (const alloc of batchAllocs) {
            const wsSnap = await transaction.get(alloc.wsRef);
            const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };

            const wsAvailBefore = wsData.availableStock || 0;
            const wsCommittedBefore = wsData.committedStock || 0;
            const wsAvailAfter = wsAvailBefore - alloc.allocatedQty;
            const wsCommittedAfter = wsCommittedBefore + alloc.allocatedQty;

            transaction.set(alloc.wsRef, {
                skuCode,
                batchId: alloc.batchId,
                warehouseId: alloc.warehouseId,
                availableStock: wsAvailAfter,
                committedStock: wsCommittedAfter,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Ledger record for each batch allocation
            recordMovement(transaction, {
                movementType: "ORDER_RESERVED",
                skuCode,
                batchId: alloc.batchId,
                batchNumber: alloc.batchNumber,
                warehouseId: alloc.warehouseId,
                quantity: alloc.allocatedQty,
                availableBefore: wsAvailBefore,
                availableAfter: wsAvailAfter,
                committedBefore: wsCommittedBefore,
                committedAfter: wsCommittedAfter,
                referenceId: orderId,
                actorId: userId,
                actorRole: "CUSTOMER",
                reason: `Reserved for customer order #${orderId}`,
                idempotencyKey: `${idempotencyKey}:${alloc.batchId}`
            });
        }

        // Update SKU aggregate inventory
        transaction.update(skuRef, {
            "inventory.availableStock": admin.firestore.FieldValue.increment(-quantity),
            "inventory.committedStock": admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        allocationsSummary.push({
            skuCode,
            quantity,
            allocations: batchAllocs.map(b => ({
                batchId: b.batchId,
                batchNumber: b.batchNumber,
                allocatedQty: b.allocatedQty
            }))
        });
    }

    const result = { success: true, orderId, allocationsSummary };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Releases reserved stock back to available (Order cancellation/rejection)
 */
async function releaseOrderStock(transaction, { orderId, items, actorId, actorRole = "SYSTEM", reason, idempotencyKey }) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    for (const item of items) {
        const { skuCode, batchAllocations, quantity } = item;
        const skuRef = db.collection("skus").doc(skuCode);

        if (Array.isArray(batchAllocations) && batchAllocations.length > 0) {
            for (const alloc of batchAllocations) {
                const wsRef = getWarehouseStockRef(skuCode, alloc.batchId, alloc.warehouseId || DEFAULT_WAREHOUSE_ID);
                const wsSnap = await transaction.get(wsRef);
                const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };

                const wsAvailBefore = wsData.availableStock || 0;
                const wsCommittedBefore = wsData.committedStock || 0;
                const wsAvailAfter = wsAvailBefore + alloc.allocatedQty;
                const wsCommittedAfter = Math.max(0, wsCommittedBefore - alloc.allocatedQty);

                transaction.set(wsRef, {
                    availableStock: wsAvailAfter,
                    committedStock: wsCommittedAfter,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                recordMovement(transaction, {
                    movementType: "ORDER_RELEASED",
                    skuCode,
                    batchId: alloc.batchId,
                    batchNumber: alloc.batchNumber,
                    warehouseId: alloc.warehouseId || DEFAULT_WAREHOUSE_ID,
                    quantity: alloc.allocatedQty,
                    availableBefore: wsAvailBefore,
                    availableAfter: wsAvailAfter,
                    committedBefore: wsCommittedBefore,
                    committedAfter: wsCommittedAfter,
                    referenceId: orderId,
                    actorId,
                    actorRole,
                    reason: reason || `Stock released for cancelled order #${orderId}`,
                    idempotencyKey: `${idempotencyKey}:${alloc.batchId}`
                });
            }
        }

        // Update SKU aggregate
        transaction.update(skuRef, {
            "inventory.availableStock": admin.firestore.FieldValue.increment(quantity),
            "inventory.committedStock": admin.firestore.FieldValue.increment(-quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const result = { success: true, orderId, released: true };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Completes order stock deduction upon delivery verification
 */
async function completeOrderStock(transaction, { orderId, items, actorId, idempotencyKey }) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    for (const item of items) {
        const { skuCode, batchAllocations, quantity } = item;
        const skuRef = db.collection("skus").doc(skuCode);

        if (Array.isArray(batchAllocations) && batchAllocations.length > 0) {
            for (const alloc of batchAllocations) {
                const wsRef = getWarehouseStockRef(skuCode, alloc.batchId, alloc.warehouseId || DEFAULT_WAREHOUSE_ID);
                const wsSnap = await transaction.get(wsRef);
                const wsData = wsSnap.exists ? wsSnap.data() : { committedStock: 0, availableStock: 0 };

                const wsCommittedBefore = wsData.committedStock || 0;
                const wsCommittedAfter = Math.max(0, wsCommittedBefore - alloc.allocatedQty);

                transaction.set(wsRef, {
                    committedStock: wsCommittedAfter,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // Decrement batch stock inside skus/{skuCode}/batches/{batchId}
                const batchRef = skuRef.collection("batches").doc(alloc.batchId);
                transaction.update(batchRef, {
                    stock: admin.firestore.FieldValue.increment(-alloc.allocatedQty),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                recordMovement(transaction, {
                    movementType: "ORDER_COMPLETED",
                    skuCode,
                    batchId: alloc.batchId,
                    batchNumber: alloc.batchNumber,
                    warehouseId: alloc.warehouseId || DEFAULT_WAREHOUSE_ID,
                    quantity: alloc.allocatedQty,
                    availableBefore: wsData.availableStock || 0,
                    availableAfter: wsData.availableStock || 0,
                    committedBefore: wsCommittedBefore,
                    committedAfter: wsCommittedAfter,
                    referenceId: orderId,
                    actorId,
                    actorRole: "RIDER",
                    reason: `Order #${orderId} fulfilled and delivered`,
                    idempotencyKey: `${idempotencyKey}:${alloc.batchId}`
                });
            }
        }

        // Update SKU aggregate
        transaction.update(skuRef, {
            "inventory.committedStock": admin.firestore.FieldValue.increment(-quantity),
            "inventory.totalStock": admin.firestore.FieldValue.increment(-quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const result = { success: true, orderId, completed: true };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Inward Goods Receipt Note (GRN / Purchase Receipt)
 */
async function receiveGrn(transaction, {
    skuCode,
    batchNumber,
    mfgDate,
    expiryDate,
    quantity,
    warehouseId = DEFAULT_WAREHOUSE_ID,
    binLocation = "",
    supplierId = "",
    purchaseOrderId = "",
    grnId = "",
    landingCost = 0,
    actorId,
    idempotencyKey
}) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    const skuRef = db.collection("skus").doc(skuCode);
    const skuSnap = await transaction.get(skuRef);
    if (!skuSnap.exists) {
        throw new Error(`SKU ${skuCode} does not exist in master catalog.`);
    }

    const cleanBatchNumber = (batchNumber || "GEN-" + Date.now()).trim().toUpperCase();
    const batchId = `${cleanBatchNumber}`;
    const batchRef = skuRef.collection("batches").doc(batchId);

    const mfgTimestamp = mfgDate ? admin.firestore.Timestamp.fromDate(new Date(mfgDate)) : null;
    const expTimestamp = expiryDate ? admin.firestore.Timestamp.fromDate(new Date(expiryDate)) : null;

    // Upsert batch record
    transaction.set(batchRef, {
        batchId,
        batchNumber: cleanBatchNumber,
        mfgDate: mfgTimestamp,
        expiryDate: expTimestamp,
        stock: admin.firestore.FieldValue.increment(quantity),
        warehouseId,
        binLocation,
        supplierId,
        purchaseOrderId,
        grnId,
        landingCost: Number(landingCost || 0),
        qualityStatus: "PASSED",
        isActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Upsert warehouse stock
    const wsRef = getWarehouseStockRef(skuCode, batchId, warehouseId);
    const wsSnap = await transaction.get(wsRef);
    const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };

    const availBefore = wsData.availableStock || 0;
    const availAfter = availBefore + quantity;

    transaction.set(wsRef, {
        skuCode,
        batchId,
        warehouseId,
        binLocation,
        availableStock: availAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update SKU aggregate
    transaction.update(skuRef, {
        "inventory.availableStock": admin.firestore.FieldValue.increment(quantity),
        "inventory.totalStock": admin.firestore.FieldValue.increment(quantity),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Ledger entry
    recordMovement(transaction, {
        movementType: "PURCHASE_RECEIPT",
        skuCode,
        batchId,
        batchNumber: cleanBatchNumber,
        warehouseId,
        quantity,
        availableBefore: availBefore,
        availableAfter: availAfter,
        committedBefore: wsData.committedStock || 0,
        committedAfter: wsData.committedStock || 0,
        referenceId: grnId || purchaseOrderId || "GRN_DIRECT",
        actorId,
        actorRole: "ADMIN",
        reason: `GRN Inward receipt (${cleanBatchNumber})`,
        idempotencyKey
    });

    const result = { success: true, skuCode, batchId, quantity, availableStock: availAfter };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Stock Adjustment with ledger trail
 */
async function adjustStock(transaction, {
    skuCode,
    batchId = "GENERAL",
    warehouseId = DEFAULT_WAREHOUSE_ID,
    adjustmentQty,
    reason,
    actorId,
    idempotencyKey
}) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    const skuRef = db.collection("skus").doc(skuCode);
    const skuSnap = await transaction.get(skuRef);
    if (!skuSnap.exists) throw new Error(`SKU ${skuCode} not found.`);

    const wsRef = getWarehouseStockRef(skuCode, batchId, warehouseId);
    const wsSnap = await transaction.get(wsRef);
    const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };

    const availBefore = wsData.availableStock || 0;
    const availAfter = availBefore + adjustmentQty;

    if (availAfter < 0) {
        throw new Error(`Adjustment of ${adjustmentQty} would result in negative available stock (${availAfter}) for SKU ${skuCode}.`);
    }

    transaction.set(wsRef, {
        availableStock: availAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    transaction.update(skuRef, {
        "inventory.availableStock": admin.firestore.FieldValue.increment(adjustmentQty),
        "inventory.totalStock": admin.firestore.FieldValue.increment(adjustmentQty),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    recordMovement(transaction, {
        movementType: adjustmentQty > 0 ? "ADJUSTMENT" : "ADJUSTMENT",
        skuCode,
        batchId,
        warehouseId,
        quantity: Math.abs(adjustmentQty),
        availableBefore: availBefore,
        availableAfter: availAfter,
        committedBefore: wsData.committedStock || 0,
        committedAfter: wsData.committedStock || 0,
        referenceId: "MANUAL_ADJUSTMENT",
        actorId,
        actorRole: "ADMIN",
        reason: reason || "Manual Inventory Adjustment",
        idempotencyKey
    });

    const result = { success: true, skuCode, adjustmentQty, availableStock: availAfter };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Write off Damaged or Expired Stock
 */
async function writeOffStock(transaction, {
    skuCode,
    batchId,
    warehouseId = DEFAULT_WAREHOUSE_ID,
    quantity,
    type = "DAMAGE", // DAMAGE | EXPIRED
    reason,
    actorId,
    idempotencyKey
}) {
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    if (quantity <= 0) throw new Error("Write-off quantity must be > 0.");

    const skuRef = db.collection("skus").doc(skuCode);
    const wsRef = getWarehouseStockRef(skuCode, batchId, warehouseId);
    const wsSnap = await transaction.get(wsRef);
    const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0, damagedStock: 0 };

    const availBefore = wsData.availableStock || 0;
    if (availBefore < quantity) {
        throw new Error(`Cannot write off ${quantity} units. Available stock is only ${availBefore}.`);
    }

    const availAfter = availBefore - quantity;
    const damagedAfter = (wsData.damagedStock || 0) + (type === "DAMAGE" ? quantity : 0);

    transaction.set(wsRef, {
        availableStock: availAfter,
        damagedStock: damagedAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    transaction.update(skuRef, {
        "inventory.availableStock": admin.firestore.FieldValue.increment(-quantity),
        "inventory.totalStock": admin.firestore.FieldValue.increment(-quantity),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    recordMovement(transaction, {
        movementType: type === "EXPIRED" ? "EXPIRED" : "DAMAGE",
        skuCode,
        batchId,
        warehouseId,
        quantity,
        availableBefore: availBefore,
        availableAfter: availAfter,
        committedBefore: wsData.committedStock || 0,
        committedAfter: wsData.committedStock || 0,
        referenceId: `${type}_WRITEOFF`,
        actorId,
        actorRole: "ADMIN",
        reason: reason || `Stock write-off (${type})`,
        idempotencyKey
    });

    const result = { success: true, skuCode, batchId, quantity, type, remainingAvailable: availAfter };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

module.exports = {
    DEFAULT_WAREHOUSE_ID,
    checkIdempotency,
    recordIdempotencySuccess,
    recordMovement,
    getWarehouseStockRef,
    allocateStockFEFO,
    reserveOrderStock,
    releaseOrderStock,
    completeOrderStock,
    receiveGrn,
    adjustStock,
    writeOffStock
};

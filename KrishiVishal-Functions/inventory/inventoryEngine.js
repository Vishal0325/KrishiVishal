/**
 * KrishiVishal Inventory Engine
 * - Authoritative Warehouse Stock Management
 * - FEFO (First-Expiry-First-Out) Allocation
 * - Immutable Movement Ledger (inventory_movements)
 * - Strict Idempotency Handling
 */

const { db, admin } = require("../core/admin");
const { validateSku } = require("./skuValidator");
const { HttpsError } = require("firebase-functions/v2/https");

const DEFAULT_WAREHOUSE_ID = "HUB-SAM-001";

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

    // 1. Fetch all batches for SKU (Strict transaction.get)
    const skuRef = db.collection("skus").doc(skuCode);
    const batchesSnap = await transaction.get(
        skuRef.collection("batches")
            .where("isActive", "==", true)
            .where("qualityStatus", "==", "PASSED")
    );

    const eligibleBatches = [];

    for (const doc of batchesSnap.docs) {
        const b = doc.data() || {};
        // Exclude expired batches
        if (b.expiryDate && b.expiryDate.toMillis() <= nowTimestamp.toMillis()) {
            continue;
        }

        // Get location stock for this batch in target warehouse (Strict transaction.get)
        const wsRef = getWarehouseStockRef(skuCode, doc.id, warehouseId);
        const wsSnap = await transaction.get(wsRef);
        const wsData = wsSnap.exists ? wsSnap.data() : {};
        const availableInWs = Number(wsData.availableStock || 0);

        if (availableInWs > 0) {
            eligibleBatches.push({
                batchId: doc.id,
                batchNumber: b.batchNumber || doc.id,
                warehouseId,
                availableStock: availableInWs,
                expiryDate: b.expiryDate || admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 3600 * 1000),
                createdAt: b.createdAt || b.receivedAt || null,
                landingCost: Number(b.landingCost || 0),
                wsRef
            });
        }
    }

    // 2. Sort FEFO (Earliest expiry date first. If expiry is identical, tie-break by createdAt then batchNumber)
    eligibleBatches.sort((a, b) => {
        const diff = a.expiryDate.toMillis() - b.expiryDate.toMillis();
        if (diff !== 0) return diff;
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.batchNumber).localeCompare(String(b.batchNumber));
    });

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
            landingCost: batch.landingCost,
            wsRef: batch.wsRef
        });

        remainingNeeded -= allocQty;
    }

    if (remainingNeeded > 0) {
        throw new HttpsError('failed-precondition', `Insufficient stock at designated spoke hub: ${warehouseId}`);
    }

    return allocations;
}

/**
 * Reserves stock for an order atomically using FEFO
 * Phase 1: Pure Reads
 * Phase 2: In-Memory Computations
 * Phase 3: Pure Writes
 */
/**
 * Phase 1 + 2: Plans stock reservation for an order atomically using FEFO (STRICTLY READS ONLY).
 * Returns { alreadyProcessed, cachedResult, orderId, allocationsSummary, reservationPlan }
 */
async function planOrderStockReservation(transaction, { orderId, items, userId, idempotencyKey, destinationHubId }) {
    // ── PHASE 1: ALL READS FIRST ──
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) {
        return {
            alreadyProcessed: true,
            cachedResult,
            orderId,
            allocationsSummary: cachedResult?.allocationsSummary || []
        };
    }

    const targetHubId = destinationHubId || DEFAULT_WAREHOUSE_ID;

    // Merge identical SKU/item lines for the same warehouse to prevent over-allocation & clobbered writes
    const mergedItemsMap = new Map();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const targetSku = item.skuCode || item.productId;
        const itemWarehouse = destinationHubId || item.warehouseId || targetHubId;
        const key = `${targetSku}__${itemWarehouse}`;
        const qty = Number(item.quantity || 0);
        const itemWithIndex = { ...item, lineIndex: item.lineIndex !== undefined ? item.lineIndex : i };

        if (mergedItemsMap.has(key)) {
            const existing = mergedItemsMap.get(key);
            existing.quantity += qty;
            // Retain original line item details with stable lineIndex
            existing.rawItems.push(itemWithIndex);
        } else {
            mergedItemsMap.set(key, {
                skuCode: item.skuCode,
                productId: item.productId,
                targetSku,
                itemWarehouse,
                quantity: qty,
                rawItems: [itemWithIndex]
            });
        }
    }

    const readPlan = [];

    for (const mergedItem of mergedItemsMap.values()) {
        const { targetSku, itemWarehouse, quantity, rawItems } = mergedItem;
        const skuRef = db.collection("skus").doc(targetSku);
        const skuSnap = await transaction.get(skuRef);

        if (skuSnap.exists) {
            const skuData = skuSnap.data() || {};
            if (skuData.isActive === false) {
                throw new Error(`SKU ${targetSku} is currently deactivated.`);
            }

            // Allocate across batches via FEFO (strictly reads)
            const batchAllocs = await allocateStockFEFO(transaction, targetSku, quantity, itemWarehouse);

            // Read live wsRef snapshots for each allocated batch
            const allocWithData = [];
            for (const alloc of batchAllocs) {
                const wsSnap = await transaction.get(alloc.wsRef);
                const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };
                allocWithData.push({
                    alloc: {
                        batchId: alloc.batchId,
                        batchNumber: alloc.batchNumber,
                        warehouseId: alloc.warehouseId,
                        allocatedQty: alloc.allocatedQty,
                        expiryDate: alloc.expiryDate,
                        landingCost: alloc.landingCost
                    },
                    wsAvailBefore: Number(wsData.availableStock || 0),
                    wsCommittedBefore: Number(wsData.committedStock || 0)
                });
            }

            readPlan.push({
                type: 'SKU',
                targetSku,
                quantity,
                rawItems,
                allocWithData
            });
        } else {
            // Fallback for direct products catalog (legacy / non-SKU)
            const prodTargetId = mergedItem.productId || targetSku;
            const productRef = db.collection("products").doc(prodTargetId);
            const productSnap = await transaction.get(productRef);
            let wsSnap = null;
            let wsRef = null;

            if (productSnap.exists) {
                wsRef = getWarehouseStockRef(prodTargetId, "GENERAL", itemWarehouse);
                wsSnap = await transaction.get(wsRef);
            }

            readPlan.push({
                type: 'LEGACY_PRODUCT',
                prodTargetId,
                quantity,
                rawItems,
                itemWarehouse,
                productExists: Boolean(productSnap.exists),
                productData: productSnap.exists ? productSnap.data() : null,
                wsExists: Boolean(wsSnap && wsSnap.exists),
                wsAvail: wsSnap && wsSnap.exists ? Number(wsSnap.data().availableStock || 0) : null
            });
        }
    }

    // ── PHASE 2: IN-MEMORY CALCULATIONS & VALIDATIONS ──
    const allocationsSummary = [];

    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            // Flatten all allocated batch slices for this merged SKU
            const availableBatchSlices = plan.allocWithData.map(b => ({
                batchId: b.alloc.batchId,
                batchNumber: b.alloc.batchNumber,
                warehouseId: b.alloc.warehouseId,
                expiryDate: b.alloc.expiryDate,
                landingCost: b.alloc.landingCost,
                remainingSlice: b.alloc.allocatedQty
            }));

            // Deterministically distribute FEFO batches across original rawItems in order
            for (const raw of plan.rawItems) {
                let neededForLine = Number(raw.quantity || 0);
                const lineAllocations = [];
                let totalLineCost = 0;
                let totalLineAllocQty = 0;

                for (const slice of availableBatchSlices) {
                    if (neededForLine <= 0) break;
                    if (slice.remainingSlice <= 0) continue;

                    const takeQty = Math.min(slice.remainingSlice, neededForLine);
                    const lCost = Number(slice.landingCost) || 0;
                    lineAllocations.push({
                        batchId: slice.batchId,
                        batchNumber: slice.batchNumber,
                        warehouseId: slice.warehouseId,
                        allocatedQty: takeQty,
                        quantity: takeQty,
                        expiryDate: slice.expiryDate,
                        landingCost: lCost,
                        warehouseStockId: `${plan.targetSku}_${slice.batchId}_${slice.warehouseId}`
                    });

                    totalLineCost += lCost * takeQty;
                    totalLineAllocQty += takeQty;

                    slice.remainingSlice -= takeQty;
                    neededForLine -= takeQty;
                }

                const batchCost = totalLineAllocQty > 0 ? (totalLineCost / totalLineAllocQty) : null;

                allocationsSummary.push({
                    lineIndex: raw.lineIndex,
                    skuCode: plan.targetSku,
                    lineItemId: raw.lineItemId || raw.id || null,
                    productId: raw.productId || null,
                    quantity: Number(raw.quantity || 0),
                    allocations: lineAllocations,
                    batchAllocations: lineAllocations,
                    batchCost,
                    catalogCost: raw.catalogCost !== undefined ? raw.catalogCost : null
                });
            }
        } else {
            const { productExists, productData, wsExists, wsAvail, quantity, itemWarehouse, prodTargetId, rawItems } = plan;
            if (productExists && productData) {
                if (wsExists && wsAvail !== null) {
                    if (wsAvail < quantity) {
                        throw new HttpsError('failed-precondition', `Insufficient stock at designated spoke hub: ${itemWarehouse}`);
                    }
                } else if (productData.hubStocks && productData.hubStocks[itemWarehouse] !== undefined) {
                    const spokeStock = Number(productData.hubStocks[itemWarehouse]) || 0;
                    if (spokeStock < quantity) {
                        throw new HttpsError('failed-precondition', `Insufficient stock at designated spoke hub: ${itemWarehouse}`);
                    }
                } else if (productData.stock !== undefined && typeof productData.stock === 'number') {
                    if (productData.stock < quantity) {
                        throw new HttpsError('failed-precondition', `Insufficient stock at designated spoke hub: ${itemWarehouse}`);
                    }
                }
            }

            for (const raw of rawItems) {
                allocationsSummary.push({
                    lineIndex: raw.lineIndex,
                    skuCode: prodTargetId,
                    lineItemId: raw.lineItemId || raw.id || null,
                    productId: raw.productId || null,
                    quantity: Number(raw.quantity || 0),
                    allocations: [],
                    batchAllocations: [],
                    batchCost: null,
                    catalogCost: raw.catalogCost !== undefined ? raw.catalogCost : null
                });
            }
        }
    }

    return {
        alreadyProcessed: false,
        orderId,
        allocationsSummary,
        reservationPlan: {
            orderId,
            userId,
            idempotencyKey,
            readPlan,
            allocationsSummary
        }
    };
}

/**
 * Phase 3: Applies writes for the planned stock reservation (STRICTLY WRITES ONLY).
 */
function applyOrderStockReservation(transaction, reservationPlan) {
    if (!reservationPlan || !reservationPlan.readPlan) {
        throw new Error("Invalid reservationPlan provided to applyOrderStockReservation.");
    }
    const { orderId, userId, idempotencyKey, readPlan, allocationsSummary } = reservationPlan;

    // ── PHASE 3: ALL WRITES EXECUTED AT THE END ──
    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            for (const item of plan.allocWithData) {
                const { alloc, wsAvailBefore, wsCommittedBefore } = item;
                const wsAvailAfter = wsAvailBefore - alloc.allocatedQty;
                const wsCommittedAfter = wsCommittedBefore + alloc.allocatedQty;
                const wsRef = getWarehouseStockRef(plan.targetSku, alloc.batchId, alloc.warehouseId);

                transaction.set(wsRef, {
                    skuCode: plan.targetSku,
                    batchId: alloc.batchId,
                    warehouseId: alloc.warehouseId,
                    availableStock: wsAvailAfter,
                    committedStock: wsCommittedAfter,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                recordMovement(transaction, {
                    movementType: "ORDER_RESERVED",
                    skuCode: plan.targetSku,
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
            const skuRef = db.collection("skus").doc(plan.targetSku);
            transaction.update(skuRef, {
                "inventory.availableStock": admin.firestore.FieldValue.increment(-plan.quantity),
                "inventory.committedStock": admin.firestore.FieldValue.increment(plan.quantity),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const { wsExists, prodTargetId, quantity, itemWarehouse, productExists, productData } = plan;
            if (productExists && productData) {
                const productRef = db.collection("products").doc(prodTargetId);
                const wsRef = getWarehouseStockRef(prodTargetId, "GENERAL", itemWarehouse);
                if (wsExists) {
                    transaction.update(wsRef, {
                        availableStock: admin.firestore.FieldValue.increment(-quantity),
                        committedStock: admin.firestore.FieldValue.increment(quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else if (productData.hubStocks && productData.hubStocks[itemWarehouse] !== undefined) {
                    transaction.update(productRef, {
                        [`hubStocks.${itemWarehouse}`]: admin.firestore.FieldValue.increment(-quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else if (productData.stock !== undefined && typeof productData.stock === 'number') {
                    transaction.update(productRef, {
                        stock: admin.firestore.FieldValue.increment(-quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        }
    }

    const keyRef = db.collection("idempotency_keys").doc(idempotencyKey);
    const result = { success: true, orderId, allocationsSummary };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Reserves stock for an order atomically using FEFO (Composite wrapper).
 */
async function reserveOrderStock(transaction, payload) {
    const planResult = await planOrderStockReservation(transaction, payload);
    if (planResult.alreadyProcessed) {
        return planResult.cachedResult;
    }
    return applyOrderStockReservation(transaction, planResult.reservationPlan);
}

/**
 * Releases reserved stock back to available (Order cancellation/rejection)
 * Strictly separates Phase 1 (Reads), Phase 2 (Validation & Shortfall Check), Phase 3 (Writes)
 */
async function releaseOrderStock(transaction, { orderId, items, actorId, actorRole = "SYSTEM", reason, idempotencyKey }) {
    // ── PHASE 1: ALL READS FIRST ──
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    let orderRef = null;
    let orderSnap = null;
    if (orderId) {
        orderRef = db.collection("orders").doc(orderId);
        orderSnap = await transaction.get(orderRef);
        if (orderSnap.exists && orderSnap.data().stockRestored === true) {
            console.log(`[releaseOrderStock] Order ${orderId} stockRestored already true. Skipping idempotent release.`);
            return { success: true, orderId, alreadyRestored: true };
        }
    }

    const readPlan = [];

    const mergedSkuMap = new Map();

    for (const item of items) {
        const { skuCode, productId, batchAllocations, quantity } = item;
        const targetSku = skuCode || productId;
        const skuRef = db.collection("skus").doc(targetSku);
        const skuSnap = await transaction.get(skuRef);

        if (skuSnap.exists) {
            if (!mergedSkuMap.has(targetSku)) {
                mergedSkuMap.set(targetSku, {
                    type: 'SKU',
                    targetSku,
                    skuRef,
                    skuSnap,
                    totalQuantity: 0,
                    batchMap: new Map() // key: `${batchId}__${warehouseId}`
                });
            }

            const skuEntry = mergedSkuMap.get(targetSku);
            const itemQty = Number(quantity || 0);
            skuEntry.totalQuantity += itemQty;

            if (Array.isArray(batchAllocations) && batchAllocations.length > 0) {
                for (const alloc of batchAllocations) {
                    const warehouseId = alloc.warehouseId || DEFAULT_WAREHOUSE_ID;
                    const batchKey = `${alloc.batchId}__${warehouseId}`;
                    if (skuEntry.batchMap.has(batchKey)) {
                        const existingAlloc = skuEntry.batchMap.get(batchKey);
                        existingAlloc.allocatedQty += Number(alloc.allocatedQty || 0);
                    } else {
                        skuEntry.batchMap.set(batchKey, {
                            batchId: alloc.batchId,
                            batchNumber: alloc.batchNumber,
                            warehouseId,
                            allocatedQty: Number(alloc.allocatedQty || 0),
                            landingCost: alloc.landingCost,
                            expiryDate: alloc.expiryDate
                        });
                    }
                }
            } else {
                // Line without batch allocations (legacy line within the same order)
                skuEntry.legacyQuantity = (skuEntry.legacyQuantity || 0) + itemQty;
            }
        } else {
            const prodTargetId = productId || targetSku;
            const productRef = db.collection("products").doc(prodTargetId);
            const productSnap = await transaction.get(productRef);
            readPlan.push({
                type: 'LEGACY_PRODUCT',
                prodTargetId,
                quantity: Number(quantity || 0),
                productRef,
                productSnap
            });
        }
    }

    // Read warehouse stock docs for merged batch allocations
    for (const skuEntry of mergedSkuMap.values()) {
        const allocWithSnaps = [];
        for (const alloc of skuEntry.batchMap.values()) {
            const wsRef = getWarehouseStockRef(skuEntry.targetSku, alloc.batchId, alloc.warehouseId);
            const wsSnap = await transaction.get(wsRef);
            const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0 };
            allocWithSnaps.push({
                alloc,
                wsRef,
                wsData
            });
        }

        readPlan.push({
            type: 'SKU',
            targetSku: skuEntry.targetSku,
            quantity: skuEntry.totalQuantity,
            legacyQuantity: skuEntry.legacyQuantity || 0,
            skuRef: skuEntry.skuRef,
            hasBatchAllocations: skuEntry.batchMap.size > 0,
            allocWithSnaps
        });
    }

    // ── PHASE 2: IN-MEMORY CALCULATIONS & SHORTFALL AUDIT ──
    const reconciliationEntries = [];
    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            let totalRestoredForSku = Number(plan.legacyQuantity || 0);
            if (plan.allocWithSnaps.length > 0) {
                for (const item of plan.allocWithSnaps) {
                    const { alloc, wsData } = item;
                    const wsCommittedBefore = Number(wsData.committedStock || 0);
                    const restoredQty = Math.min(alloc.allocatedQty, wsCommittedBefore);
                    item.restoredQty = restoredQty;
                    totalRestoredForSku += restoredQty;

                    if (alloc.allocatedQty > wsCommittedBefore) {
                        const diff = alloc.allocatedQty - wsCommittedBefore;
                        console.warn(`[releaseOrderStock] WARNING: Allocated qty ${alloc.allocatedQty} exceeds committedStock ${wsCommittedBefore} for SKU ${plan.targetSku} batch ${alloc.batchId} on order ${orderId}. Logging to inventory_reconciliation.`);
                        const reconRef = db.collection("inventory_reconciliation").doc();
                        reconciliationEntries.push({
                            ref: reconRef,
                            data: {
                                reconciliationId: reconRef.id,
                                type: "RELEASE_MISMATCH",
                                orderId: orderId || null,
                                skuCode: plan.targetSku,
                                batchId: alloc.batchId,
                                expectedQty: alloc.allocatedQty,
                                foundCommittedQty: wsCommittedBefore,
                                difference: diff,
                                actorId: actorId || "SYSTEM",
                                severity: "MEDIUM",
                                status: "PENDING_AUDIT",
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            }
                        });
                    }
                }
                plan.totalRestoredForSku = totalRestoredForSku;
            } else {
                // Pure legacy order with empty batchAllocations
                plan.totalRestoredForSku = plan.quantity;
            }
        }
    }

    // ── PHASE 3: ALL WRITES EXECUTED AT THE END ──
    for (const entry of reconciliationEntries) {
        transaction.set(entry.ref, entry.data);
    }

    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            if (plan.allocWithSnaps.length > 0) {
                for (const item of plan.allocWithSnaps) {
                    const { alloc, wsRef, wsData, restoredQty } = item;
                    const wsAvailBefore = Number(wsData.availableStock || 0);
                    const wsCommittedBefore = Number(wsData.committedStock || 0);
                    const wsAvailAfter = wsAvailBefore + restoredQty;
                    const wsCommittedAfter = Math.max(0, wsCommittedBefore - alloc.allocatedQty);

                    transaction.set(wsRef, {
                        availableStock: wsAvailAfter,
                        committedStock: wsCommittedAfter,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    recordMovement(transaction, {
                        movementType: "ORDER_RELEASED",
                        skuCode: plan.targetSku,
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

            // Fix 3: Update SKU aggregate availableStock ONLY by total restoredQty (to prevent phantom stock inflation on mismatch)
            // committedStock decrements by totalRestoredForSku to keep aggregate consistent
            transaction.update(plan.skuRef, {
                "inventory.availableStock": admin.firestore.FieldValue.increment(plan.totalRestoredForSku),
                "inventory.committedStock": admin.firestore.FieldValue.increment(-plan.totalRestoredForSku),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            if (plan.productSnap && plan.productSnap.exists) {
                transaction.update(plan.productRef, {
                    stock: admin.firestore.FieldValue.increment(plan.quantity),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }
    }

    if (orderRef && orderSnap && orderSnap.exists) {
        transaction.update(orderRef, {
            stockRestored: true,
            stockRestoredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const result = { success: true, orderId, released: true };
    recordIdempotencySuccess(transaction, keyRef, result);
    return result;
}

/**
 * Completes order stock deduction upon delivery verification
 * Strictly separates Phase 1 (Reads), Phase 2 (Shortfall Audit), Phase 3 (Writes)
 */
async function completeOrderStock(transaction, { orderId, items, actorId, idempotencyKey }) {
    // ── PHASE 1: ALL READS FIRST ──
    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    let orderRef = null;
    let orderSnap = null;
    if (orderId) {
        orderRef = db.collection("orders").doc(orderId);
        orderSnap = await transaction.get(orderRef);
        if (orderSnap.exists && orderSnap.data().stockCompleted === true) {
            console.log(`[completeOrderStock] Order ${orderId} stockCompleted already true. Skipping idempotent complete.`);
            return { success: true, orderId, alreadyCompleted: true };
        }
    }

    const readPlan = [];
    const mergedSkuMap = new Map();

    for (const item of items) {
        const { skuCode, productId, batchAllocations, quantity } = item;
        const targetSku = skuCode || productId;
        const skuRef = db.collection("skus").doc(targetSku);
        const skuSnap = await transaction.get(skuRef);

        if (skuSnap.exists) {
            if (!mergedSkuMap.has(targetSku)) {
                mergedSkuMap.set(targetSku, {
                    type: 'SKU',
                    targetSku,
                    skuRef,
                    skuSnap,
                    totalQuantity: 0,
                    batchMap: new Map() // key: `${batchId}__${warehouseId}`
                });
            }

            const skuEntry = mergedSkuMap.get(targetSku);
            const itemQty = Number(quantity || 0);
            skuEntry.totalQuantity += itemQty;

            if (Array.isArray(batchAllocations) && batchAllocations.length > 0) {
                for (const alloc of batchAllocations) {
                    const warehouseId = alloc.warehouseId || DEFAULT_WAREHOUSE_ID;
                    const batchKey = `${alloc.batchId}__${warehouseId}`;
                    if (skuEntry.batchMap.has(batchKey)) {
                        const existingAlloc = skuEntry.batchMap.get(batchKey);
                        existingAlloc.allocatedQty += Number(alloc.allocatedQty || 0);
                    } else {
                        skuEntry.batchMap.set(batchKey, {
                            batchId: alloc.batchId,
                            batchNumber: alloc.batchNumber,
                            warehouseId,
                            allocatedQty: Number(alloc.allocatedQty || 0),
                            landingCost: alloc.landingCost,
                            expiryDate: alloc.expiryDate
                        });
                    }
                }
            } else {
                // Line without batch allocations (legacy line within the same order)
                skuEntry.legacyQuantity = (skuEntry.legacyQuantity || 0) + itemQty;
            }
        }
    }

    // Read warehouse stock docs and batch docs for merged batch allocations
    for (const skuEntry of mergedSkuMap.values()) {
        const allocWithSnaps = [];
        for (const alloc of skuEntry.batchMap.values()) {
            const wsRef = getWarehouseStockRef(skuEntry.targetSku, alloc.batchId, alloc.warehouseId);
            const wsSnap = await transaction.get(wsRef);
            const wsData = wsSnap.exists ? wsSnap.data() : { committedStock: 0, availableStock: 0 };

            const batchRef = skuEntry.skuRef.collection("batches").doc(alloc.batchId);
            const batchSnap = await transaction.get(batchRef);

            allocWithSnaps.push({
                alloc,
                wsRef,
                wsData,
                batchRef,
                batchSnap
            });
        }

        readPlan.push({
            type: 'SKU',
            targetSku: skuEntry.targetSku,
            quantity: skuEntry.totalQuantity,
            legacyQuantity: skuEntry.legacyQuantity || 0,
            skuRef: skuEntry.skuRef,
            hasBatchAllocations: skuEntry.batchMap.size > 0,
            allocWithSnaps
        });
    }

    // ── PHASE 2: IN-MEMORY SHORTFALL AUDIT (Non-blocking: Audit logged, delivery continues) ──
    const reconciliationEntries = [];
    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            let totalCommittedDeducted = Number(plan.legacyQuantity || 0);
            if (plan.allocWithSnaps.length > 0) {
                for (const item of plan.allocWithSnaps) {
                    const { alloc, wsData, batchSnap } = item;
                    const wsCommittedBefore = Number(wsData.committedStock || 0);
                    // Actual committed deduction for this batch
                    const actualDeduction = Math.min(alloc.allocatedQty, wsCommittedBefore);
                    item.actualDeduction = actualDeduction;
                    totalCommittedDeducted += actualDeduction;

                    // Fix 2: Check if batch document exists. If missing, log reconciliation and do not throw
                    if (!batchSnap || !batchSnap.exists) {
                        console.error(`[completeOrderStock] BATCH DOC MISSING on order ${orderId}: batch ${alloc.batchId} under SKU ${plan.targetSku} not found in Firestore. Skipping batch doc update, delivery continues.`);
                        const reconRef = db.collection("inventory_reconciliation").doc();
                        reconciliationEntries.push({
                            ref: reconRef,
                            data: {
                                reconciliationId: reconRef.id,
                                type: "BATCH_DOC_MISSING",
                                orderId: orderId || null,
                                skuCode: plan.targetSku,
                                batchId: alloc.batchId,
                                expectedQty: alloc.allocatedQty,
                                actualDeductedQty: actualDeduction,
                                skuAggregateDecremented: true,
                                actorId: actorId || "RIDER",
                                severity: "CRITICAL",
                                status: "PENDING_AUDIT",
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            }
                        });
                    }

                    if (alloc.allocatedQty > wsCommittedBefore) {
                        const diff = alloc.allocatedQty - wsCommittedBefore;
                        console.error(`[completeOrderStock] SHORTFALL DETECTED on order ${orderId}: allocated ${alloc.allocatedQty} exceeds committed ${wsCommittedBefore} for SKU ${plan.targetSku} batch ${alloc.batchId}. Logged to inventory_reconciliation.`);
                        const reconRef = db.collection("inventory_reconciliation").doc();
                        reconciliationEntries.push({
                            ref: reconRef,
                            data: {
                                reconciliationId: reconRef.id,
                                type: "DELIVERY_SHORTFALL",
                                orderId: orderId || null,
                                skuCode: plan.targetSku,
                                batchId: alloc.batchId,
                                expectedQty: alloc.allocatedQty,
                                foundCommittedQty: wsCommittedBefore,
                                difference: diff,
                                actorId: actorId || "RIDER",
                                severity: "HIGH",
                                status: "PENDING_AUDIT",
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            }
                        });
                    }
                }
                plan.totalCommittedDeducted = totalCommittedDeducted;
            } else {
                // Legacy order with empty batchAllocations
                plan.totalCommittedDeducted = plan.quantity;
            }
        }
    }

    // ── PHASE 3: ALL WRITES EXECUTED AT THE END ──
    for (const entry of reconciliationEntries) {
        transaction.set(entry.ref, entry.data);
    }
    for (const plan of readPlan) {
        if (plan.type === 'SKU') {
            if (plan.allocWithSnaps.length > 0) {
                for (const item of plan.allocWithSnaps) {
                    const { alloc, wsRef, wsData, batchRef, batchSnap, actualDeduction } = item;
                    const wsCommittedBefore = Number(wsData.committedStock || 0);
                    const wsCommittedAfter = Math.max(0, wsCommittedBefore - alloc.allocatedQty);

                    transaction.set(wsRef, {
                        committedStock: wsCommittedAfter,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    // Decrement batch stock inside skus/{skuCode}/batches/{batchId} only by actualDeduction if batch exists
                    if (batchSnap && batchSnap.exists) {
                        transaction.update(batchRef, {
                            stock: admin.firestore.FieldValue.increment(-actualDeduction),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    recordMovement(transaction, {
                        movementType: "ORDER_COMPLETED",
                        skuCode: plan.targetSku,
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

            // Update SKU aggregate (Clamped to actual committed deducted to keep consistency with clamped warehouse_stock)
            transaction.update(plan.skuRef, {
                "inventory.committedStock": admin.firestore.FieldValue.increment(-plan.totalCommittedDeducted),
                "inventory.totalStock": admin.firestore.FieldValue.increment(-plan.totalCommittedDeducted),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    if (orderRef && orderSnap && orderSnap.exists) {
        transaction.update(orderRef, {
            stockCompleted: true,
            stockCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    quantity, // Backward compatibility
    receivedQty,
    acceptedQty,
    damagedQty = 0,
    damageReason = "",
    warehouseId = DEFAULT_WAREHOUSE_ID,
    binLocation = "",
    supplierId = "",
    purchaseOrderId = "",
    grnId = "",
    landingCost = 0,
    actorId,
    idempotencyKey
}) {
    const finalReceived = receivedQty !== undefined ? receivedQty : quantity;
    const finalAccepted = acceptedQty !== undefined ? acceptedQty : quantity;
    const finalDamaged = damagedQty || 0;

    if (finalReceived !== (finalAccepted + finalDamaged)) {
        throw new Error(`GRN Validation Failed: receivedQty (${finalReceived}) must equal acceptedQty (${finalAccepted}) + damagedQty (${finalDamaged})`);
    }

    const { alreadyProcessed, cachedResult, keyRef } = await checkIdempotency(transaction, idempotencyKey);
    if (alreadyProcessed) return cachedResult;

    // ── READ PHASE ──
    let effectiveSkuCode = skuCode;
    let skuRef = db.collection("skus").doc(effectiveSkuCode);
    let skuSnap = await transaction.get(skuRef);
    let skuData = null;
    let shouldProvisionSku = false;
    let provisionSkuData = null;
    let prodRef = null;
    let prodSnap = null;

    if (!skuSnap.exists) {
        // Fallback 1: Query by productId == effectiveSkuCode
        const skusByProd = await transaction.get(
            db.collection("skus").where("productId", "==", effectiveSkuCode).limit(1)
        );
        if (!skusByProd.empty) {
            effectiveSkuCode = skusByProd.docs[0].id;
            skuRef = db.collection("skus").doc(effectiveSkuCode);
            skuSnap = await transaction.get(skuRef);
            skuData = skuSnap.data();
        } else {
            // Fallback 2: Check products collection directly
            prodRef = db.collection("products").doc(effectiveSkuCode);
            prodSnap = await transaction.get(prodRef);
            if (prodSnap.exists) {
                const pData = prodSnap.data() || {};
                effectiveSkuCode = pData.skuCode || effectiveSkuCode;
                skuRef = db.collection("skus").doc(effectiveSkuCode);
                skuSnap = await transaction.get(skuRef);
                if (skuSnap.exists) {
                    skuData = skuSnap.data();
                } else {
                    shouldProvisionSku = true;
                    provisionSkuData = {
                        skuCode: effectiveSkuCode,
                        productId: prodRef.id,
                        name: pData.name || effectiveSkuCode,
                        isActive: pData.isActive !== false,
                        pricing: {
                            consumerPrice: Number(pData.price || 0),
                            mrp: Number(pData.mrp || 0),
                            landingCost: Number(landingCost || pData.costPrice || 0)
                        },
                        inventory: {
                            availableStock: finalAccepted,
                            committedStock: 0,
                            totalStock: finalAccepted + finalDamaged,
                            quarantinedStock: finalDamaged
                        },
                        tax: {
                            gstRate: Number(pData.gstRate || 18),
                            hsnCode: pData.hsnCode || "3808"
                        },
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    };
                    skuData = provisionSkuData;
                }
            } else {
                throw new Error(`SKU ${skuCode} does not exist in master catalog or product database.`);
            }
        }
    } else {
        skuData = skuSnap.data();
    }

    if (!prodRef && skuData && skuData.productId) {
        prodRef = db.collection("products").doc(skuData.productId);
        prodSnap = await transaction.get(prodRef);
    }

    const cleanBatchNumber = (batchNumber || "GEN-" + Date.now()).trim().toUpperCase();
    const batchId = `${cleanBatchNumber}`;
    const batchRef = skuRef.collection("batches").doc(batchId);

    // Read warehouse stock
    const wsRef = getWarehouseStockRef(effectiveSkuCode, batchId, warehouseId);
    const wsSnap = await transaction.get(wsRef);
    const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0, quarantinedQty: 0 };

    // ── ALL READS FINISHED. WRITE PHASE STARTS HERE ──
    const availBefore = wsData.availableStock || 0;
    const availAfter = availBefore + finalAccepted;
    const quarantinedBefore = wsData.quarantinedQty || 0;
    const quarantinedAfter = quarantinedBefore + finalDamaged;

    if (shouldProvisionSku && provisionSkuData) {
        transaction.set(skuRef, provisionSkuData);
    } else {
        const skuUpdate = {
            "inventory.availableStock": admin.firestore.FieldValue.increment(finalAccepted),
            "inventory.totalStock": admin.firestore.FieldValue.increment(finalAccepted + finalDamaged),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (finalDamaged > 0) {
            skuUpdate["inventory.quarantinedStock"] = admin.firestore.FieldValue.increment(finalDamaged);
        }
        transaction.update(skuRef, skuUpdate);
    }

    const mfgTimestamp = mfgDate ? admin.firestore.Timestamp.fromDate(new Date(mfgDate)) : null;
    const expTimestamp = expiryDate ? admin.firestore.Timestamp.fromDate(new Date(expiryDate)) : null;

    // Upsert batch record (only accepted goes to saleable stock)
    transaction.set(batchRef, {
        batchId,
        batchNumber: cleanBatchNumber,
        mfgDate: mfgTimestamp,
        expiryDate: expTimestamp,
        stock: admin.firestore.FieldValue.increment(finalAccepted),
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
    transaction.set(wsRef, {
        skuCode: effectiveSkuCode,
        batchId,
        warehouseId,
        binLocation,
        availableStock: availAfter,
        quarantinedQty: quarantinedAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update product stock directly
    if (prodRef && prodSnap && prodSnap.exists) {
        transaction.update(prodRef, {
            stock: admin.firestore.FieldValue.increment(finalAccepted),
            stockQuantity: admin.firestore.FieldValue.increment(finalAccepted),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    if (finalDamaged > 0) {
        const quarantineRef = db.collection("inventory_quarantine").doc();
        transaction.set(quarantineRef, {
            skuCode: effectiveSkuCode,
            batchId,
            hubId: warehouseId,
            damagedQty: finalDamaged,
            damageReason,
            grnId: grnId || purchaseOrderId || "GRN_DIRECT",
            reportedBy: actorId || "SYSTEM",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    if (finalAccepted > 0) {
        recordMovement(transaction, {
            movementType: "PURCHASE_RECEIPT_AVAILABLE",
            skuCode: effectiveSkuCode,
            batchId,
            batchNumber: cleanBatchNumber,
            warehouseId,
            quantity: finalAccepted,
            availableBefore: availBefore,
            availableAfter: availAfter,
            committedBefore: wsData.committedStock || 0,
            committedAfter: wsData.committedStock || 0,
            referenceId: grnId || purchaseOrderId || "GRN_DIRECT",
            actorId,
            actorRole: "ADMIN",
            reason: `GRN Inward receipt (${cleanBatchNumber}) - Accepted`,
            idempotencyKey: idempotencyKey + "_ACCEPT"
        });
    }

    if (finalDamaged > 0) {
        recordMovement(transaction, {
            movementType: "PURCHASE_RECEIPT_QUARANTINE",
            skuCode: effectiveSkuCode,
            batchId,
            batchNumber: cleanBatchNumber,
            warehouseId,
            quantity: finalDamaged,
            availableBefore: availAfter, 
            availableAfter: availAfter,
            committedBefore: wsData.committedStock || 0,
            committedAfter: wsData.committedStock || 0,
            referenceId: grnId || purchaseOrderId || "GRN_DIRECT",
            actorId,
            actorRole: "ADMIN",
            reason: `GRN Inward receipt (${cleanBatchNumber}) - Damaged: ${damageReason}`,
            idempotencyKey: idempotencyKey + "_QUARANTINE"
        });
    }

    const result = { success: true, skuCode: effectiveSkuCode, batchId, receivedQty: finalReceived, acceptedQty: finalAccepted, damagedQty: finalDamaged, availableStock: availAfter };
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
    planOrderStockReservation,
    applyOrderStockReservation,
    reserveOrderStock,
    releaseOrderStock,
    completeOrderStock,
    receiveGrn,
    adjustStock,
    writeOffStock
};

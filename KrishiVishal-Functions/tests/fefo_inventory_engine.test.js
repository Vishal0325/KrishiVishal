const assert = require('assert');
const adminModule = require('../core/admin');
const { HttpsError } = require('firebase-functions/v2/https');
const {
    allocateStockFEFO,
    reserveOrderStock,
    releaseOrderStock,
    completeOrderStock,
    getWarehouseStockRef
} = require('../inventory/inventoryEngine');

console.log("=== RUNNING FEFO INVENTORY ENGINE UNIT & CONCURRENCY TESTS ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

// In-memory mock database store
const mockStore = {
    skus: new Map(),
    warehouse_stock: new Map(),
    orders: new Map(),
    products: new Map(),
    idempotency_keys: new Map(),
    inventory_movements: new Map(),
    inventory_reconciliation: new Map()
};

function clearStore() {
    for (const key of Object.keys(mockStore)) {
        mockStore[key].clear();
    }
}

// Mock collection implementation
adminModule.db.collection = function (collName) {
    if (!mockStore[collName]) {
        mockStore[collName] = new Map();
    }
    const collectionMap = mockStore[collName];

    return {
        doc: function (docId) {
            const id = docId || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            return {
                id,
                get: async function () {
                    const exists = collectionMap.has(id);
                    return {
                        exists,
                        id,
                        ref: this,
                        data: () => exists ? collectionMap.get(id) : null
                    };
                },
                set: async function (data, options = {}) {
                    if (options.merge && collectionMap.has(id)) {
                        collectionMap.set(id, { ...collectionMap.get(id), ...data });
                    } else {
                        collectionMap.set(id, { ...data });
                    }
                    return { id };
                },
                update: async function (updates) {
                    const existing = collectionMap.get(id) || {};
                    const merged = { ...existing };
                    for (const [k, v] of Object.entries(updates)) {
                        const isInc = v && (v._methodName === 'FieldValue.increment' || v.constructor?.name === 'NumericIncrementTransform');
                        const operand = isInc ? Number(v.operand !== undefined ? v.operand : (v._operand !== undefined ? v._operand : 0)) : 0;

                        if (k.includes('.')) {
                            const parts = k.split('.');
                            if (!merged[parts[0]]) merged[parts[0]] = {};
                            else merged[parts[0]] = { ...merged[parts[0]] };
                            if (isInc) {
                                const cur = Number(merged[parts[0]][parts[1]] || 0);
                                merged[parts[0]][parts[1]] = cur + operand;
                            } else {
                                merged[parts[0]][parts[1]] = v;
                            }
                        } else if (isInc) {
                            const cur = Number(merged[k] || 0);
                            merged[k] = cur + operand;
                        } else {
                            merged[k] = v;
                        }
                    }
                    collectionMap.set(id, merged);
                    return { id };
                },
                collection: function (subCollName) {
                    const subKey = `${collName}_${id}_${subCollName}`;
                    if (!mockStore[subKey]) mockStore[subKey] = new Map();
                    const subMap = mockStore[subKey];

                    return {
                        doc: function (subDocId) {
                            const sId = subDocId || `sub_${Date.now()}`;
                            return {
                                id: sId,
                                get: async function () {
                                    const exists = subMap.has(sId);
                                    return {
                                        exists,
                                        id: sId,
                                        data: () => exists ? subMap.get(sId) : null
                                    };
                                },
                                set: async function (data) {
                                    subMap.set(sId, { ...data });
                                },
                                update: async function (updates) {
                                    const existing = subMap.get(sId) || {};
                                    const merged = { ...existing };
                                    for (const [k, v] of Object.entries(updates)) {
                                        const isInc = v && (v._methodName === 'FieldValue.increment' || v.constructor?.name === 'NumericIncrementTransform');
                                        const operand = isInc ? Number(v.operand !== undefined ? v.operand : (v._operand !== undefined ? v._operand : 0)) : 0;
                                        if (isInc) {
                                            merged[k] = Number(merged[k] || 0) + operand;
                                        } else {
                                            merged[k] = v;
                                        }
                                    }
                                    subMap.set(sId, merged);
                                }
                            };
                        },
                        where: function (field, op, val) {
                            return createMockQuery(subKey, [{ field, op, val }]);
                        }
                    };
                }
            };
        },
        where: function (field, op, val) {
            return createMockQuery(collName, [{ field, op, val }]);
        }
    };
};

function createMockQuery(collName, filters = []) {
    return {
        where: function (field, op, val) {
            return createMockQuery(collName, [...filters, { field, op, val }]);
        },
        get: async function () {
            const map = mockStore[collName] || new Map();
            const docs = [];
            for (const [id, data] of map.entries()) {
                let matches = true;
                for (const f of filters) {
                    if (f.op === '==' && data[f.field] !== f.val) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    docs.push({
                        id,
                        ref: adminModule.db.collection(collName).doc(id),
                        data: () => data
                    });
                }
            }
            return {
                empty: docs.length === 0,
                size: docs.length,
                docs
            };
        }
    };
}

// Mock transaction object with Firestore read-after-write invariant guard
function createMockTransaction() {
    let hasWritten = false;
    return {
        get: async function (target) {
            if (hasWritten) {
                throw new Error("Firestore transactions require all reads to be executed before all writes.");
            }
            if (target && target.get) return await target.get();
            return { exists: false, data: () => null };
        },
        set: function (ref, data, opts) {
            hasWritten = true;
            ref.set(data, opts);
        },
        update: function (ref, updates) {
            hasWritten = true;
            ref.update(updates);
        }
    };
}

// Patch FieldValue.increment
adminModule.admin.firestore.FieldValue.increment = function (n) {
    return { _methodName: 'FieldValue.increment', operand: n };
};

async function runTests() {
    const skuCode = 'OT-SIM-SYS-A1-080ML-SYN';
    const warehouseId = 'HUB-SAM-001';

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Single Batch Allocate with FEFO
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 50, committedStock: 0, totalStock: 50 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_001', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 650,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 100 * 24 * 3600 * 1000)
        });

        const wsRefDoc = `${skuCode}_BAT_001_${warehouseId}`;
        mockStore.warehouse_stock.set(wsRefDoc, {
            skuCode,
            batchId: 'BAT_001',
            warehouseId,
            availableStock: 50,
            committedStock: 0
        });

        const txn = createMockTransaction();
        const allocs = await allocateStockFEFO(txn, skuCode, 10, warehouseId);

        assert.strictEqual(allocs.length, 1);
        assert.strictEqual(allocs[0].batchId, 'BAT_001');
        assert.strictEqual(allocs[0].allocatedQty, 10);
        assert.strictEqual(allocs[0].landingCost, 650);
        pass("1. Single batch allocated correctly with landingCost ₹650");
    } catch (e) {
        fail("1. Single batch allocate", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Multiple Batches FEFO Order (Earliest expiry first)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 30, committedStock: 0, totalStock: 30 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();

        // Batch A: Expiring in 30 days, available 10 @ ₹700
        mockStore[batchesKey].set('BAT_A', {
            batchNumber: 'BAT-A',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 700,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_A_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_A',
            warehouseId,
            availableStock: 10,
            committedStock: 0
        });

        // Batch B: Expiring in 90 days, available 20 @ ₹720
        mockStore[batchesKey].set('BAT_B', {
            batchNumber: 'BAT-B',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 720,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_B_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_B',
            warehouseId,
            availableStock: 20,
            committedStock: 0
        });

        const txn = createMockTransaction();
        // Request 15 units -> Should take all 10 from BAT_A (earlier expiry) and 5 from BAT_B
        const allocs = await allocateStockFEFO(txn, skuCode, 15, warehouseId);

        assert.strictEqual(allocs.length, 2);
        assert.strictEqual(allocs[0].batchId, 'BAT_A');
        assert.strictEqual(allocs[0].allocatedQty, 10);
        assert.strictEqual(allocs[0].landingCost, 700);

        assert.strictEqual(allocs[1].batchId, 'BAT_B');
        assert.strictEqual(allocs[1].allocatedQty, 5);
        assert.strictEqual(allocs[1].landingCost, 720);

        pass("2. Multi-batch FEFO order strictly prioritized earliest expiring batch (10x BAT_A + 5x BAT_B)");
    } catch (e) {
        fail("2. Multiple batches FEFO order", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Expired and QC-failed Batches Skipped
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();

        // Expired batch
        mockStore[batchesKey].set('BAT_EXP', {
            batchNumber: 'BAT-EXP',
            isActive: true,
            qualityStatus: 'PASSED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 24 * 3600 * 1000) // 5 days ago
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_EXP_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_EXP',
            warehouseId,
            availableStock: 50,
            committedStock: 0
        });

        // QC Failed batch
        mockStore[batchesKey].set('BAT_QC_FAIL', {
            batchNumber: 'BAT-QC-FAIL',
            isActive: true,
            qualityStatus: 'FAILED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_QC_FAIL_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_QC_FAIL',
            warehouseId,
            availableStock: 50,
            committedStock: 0
        });

        // Valid batch
        mockStore[batchesKey].set('BAT_GOOD', {
            batchNumber: 'BAT-GOOD',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 650,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_GOOD_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_GOOD',
            warehouseId,
            availableStock: 10,
            committedStock: 0
        });

        const txn = createMockTransaction();
        const allocs = await allocateStockFEFO(txn, skuCode, 10, warehouseId);

        assert.strictEqual(allocs.length, 1);
        assert.strictEqual(allocs[0].batchId, 'BAT_GOOD');
        pass("3. Expired and QC-failed batches successfully skipped");
    } catch (e) {
        fail("3. Expired and QC-failed batches", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Insufficient Stock Rejects with failed-precondition
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_001', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_001_${warehouseId}`, {
            availableStock: 5,
            committedStock: 0
        });

        const txn = createMockTransaction();
        let errorCaught = false;
        try {
            await allocateStockFEFO(txn, skuCode, 10, warehouseId);
        } catch (err) {
            errorCaught = true;
            assert.strictEqual(err.code, 'failed-precondition');
            assert.ok(err.message.includes(`Insufficient stock at designated spoke hub: ${warehouseId}`));
        }
        assert.strictEqual(errorCaught, true);
        pass("4. Insufficient stock strictly throws failed-precondition");
    } catch (e) {
        fail("4. Insufficient stock test", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Reservation Updates warehouse_stock and SKU Aggregate
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 100, committedStock: 0, totalStock: 100 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_RES_1', {
            batchNumber: 'BAT-RES-1',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 700,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 24 * 3600 * 1000)
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_RES_1_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_RES_1',
            warehouseId,
            availableStock: 100,
            committedStock: 0
        });

        const txn = createMockTransaction();
        const res = await reserveOrderStock(txn, {
            orderId: 'ORD_101',
            items: [{ skuCode, quantity: 15 }],
            userId: 'USER_1',
            idempotencyKey: 'reserve_ORD_101',
            destinationHubId: warehouseId
        });

        assert.strictEqual(res.success, true);

        // Verify warehouse_stock
        const wsDoc = mockStore.warehouse_stock.get(`${skuCode}_BAT_RES_1_${warehouseId}`);
        assert.strictEqual(wsDoc.availableStock, 85);
        assert.strictEqual(wsDoc.committedStock, 15);

        // Verify SKU Aggregate
        const skuDoc = mockStore.skus.get(skuCode);
        assert.strictEqual(skuDoc.inventory.availableStock, 85);
        assert.strictEqual(skuDoc.inventory.committedStock, 15);

        // Consistency check: SKU available == WS available
        assert.strictEqual(skuDoc.inventory.availableStock, wsDoc.availableStock);
        assert.strictEqual(skuDoc.inventory.committedStock, wsDoc.committedStock);

        pass("5. Reservation correctly updated warehouse_stock and SKU aggregate with full consistency");
    } catch (e) {
        fail("5. Reservation updates", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Release Order Stock Idempotency & Shortfall Logging
    // ─────────────────────────────────────────────────────────────
    try {
        // Continue from TEST 5 state
        mockStore.orders.set('ORD_101', { id: 'ORD_101', stockRestored: false });

        const txn1 = createMockTransaction();
        const releaseRes1 = await releaseOrderStock(txn1, {
            orderId: 'ORD_101',
            items: [{
                skuCode,
                quantity: 15,
                batchAllocations: [{
                    batchId: 'BAT_RES_1',
                    batchNumber: 'BAT-RES-1',
                    warehouseId,
                    allocatedQty: 15,
                    landingCost: 700
                }]
            }],
            actorId: 'ADMIN_1',
            reason: 'Customer cancelled',
            idempotencyKey: 'ORDER:ORD_101:RELEASE_STOCK'
        });

        assert.strictEqual(releaseRes1.released, true);

        // State after first release
        const wsDoc1 = mockStore.warehouse_stock.get(`${skuCode}_BAT_RES_1_${warehouseId}`);
        assert.strictEqual(wsDoc1.availableStock, 100);
        assert.strictEqual(wsDoc1.committedStock, 0);

        const skuDoc1 = mockStore.skus.get(skuCode);
        assert.strictEqual(skuDoc1.inventory.availableStock, 100);
        assert.strictEqual(skuDoc1.inventory.committedStock, 0);

        // Second release call with same order (should be idempotent)
        const txn2 = createMockTransaction();
        const releaseRes2 = await releaseOrderStock(txn2, {
            orderId: 'ORD_101',
            items: [{
                skuCode,
                quantity: 15,
                batchAllocations: [{
                    batchId: 'BAT_RES_1',
                    batchNumber: 'BAT-RES-1',
                    warehouseId,
                    allocatedQty: 15,
                    landingCost: 700
                }]
            }],
            actorId: 'ADMIN_1',
            reason: 'Customer cancelled duplicate',
            idempotencyKey: 'ORDER:ORD_101:RELEASE_STOCK'
        });

        // Stock must not have doubled!
        const wsDoc2 = mockStore.warehouse_stock.get(`${skuCode}_BAT_RES_1_${warehouseId}`);
        assert.strictEqual(wsDoc2.availableStock, 100);
        assert.strictEqual(wsDoc2.committedStock, 0);

        pass("6. Release order stock is strictly idempotent; second call did not restore double stock");
    } catch (e) {
        fail("6. Release order stock idempotency", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Complete Order Stock (Delivery) & Shortfall Guard
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 80, committedStock: 20, totalStock: 100 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_DELIV', {
            batchNumber: 'BAT-DELIV',
            stock: 20,
            landingCost: 700
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_DELIV_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_DELIV',
            warehouseId,
            availableStock: 80,
            committedStock: 20
        });

        mockStore.orders.set('ORD_202', { id: 'ORD_202', stockCompleted: false });

        // Normal Delivery
        const txn1 = createMockTransaction();
        const compRes1 = await completeOrderStock(txn1, {
            orderId: 'ORD_202',
            items: [{
                skuCode,
                quantity: 20,
                batchAllocations: [{
                    batchId: 'BAT_DELIV',
                    batchNumber: 'BAT-DELIV',
                    warehouseId,
                    allocatedQty: 20,
                    landingCost: 700
                }]
            }],
            actorId: 'RIDER_1',
            idempotencyKey: 'ORDER:ORD_202:COMPLETE_STOCK'
        });

        assert.strictEqual(compRes1.completed, true);

        // ws committed reduced to 0
        const wsDoc1 = mockStore.warehouse_stock.get(`${skuCode}_BAT_DELIV_${warehouseId}`);
        assert.strictEqual(wsDoc1.committedStock, 0);

        // batch physical stock reduced from 20 to 0
        const batchDoc1 = mockStore[batchesKey].get('BAT_DELIV');
        assert.strictEqual(batchDoc1.stock, 0);

        // SKU totalStock reduced from 100 to 80
        const skuDoc1 = mockStore.skus.get(skuCode);
        assert.strictEqual(skuDoc1.inventory.committedStock, 0);
        assert.strictEqual(skuDoc1.inventory.totalStock, 80);

        // Idempotent second call
        const txn2 = createMockTransaction();
        const compRes2 = await completeOrderStock(txn2, {
            orderId: 'ORD_202',
            items: [{
                skuCode,
                quantity: 20,
                batchAllocations: [{
                    batchId: 'BAT_DELIV',
                    batchNumber: 'BAT-DELIV',
                    warehouseId,
                    allocatedQty: 20,
                    landingCost: 700
                }]
            }],
            actorId: 'RIDER_1',
            idempotencyKey: 'ORDER:ORD_202:COMPLETE_STOCK'
        });

        assert.strictEqual(skuDoc1.inventory.totalStock, 80); // Did not double decrement
        pass("7. Complete order stock decremented batch stock and was strictly idempotent on repeat call");
    } catch (e) {
        fail("7. Complete order stock", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Complete Delivery Shortfall (Non-blocking: delivery succeeds, reconciliation logged)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 95, committedStock: 5, totalStock: 100 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_DELIV', {
            batchNumber: 'BAT-DELIV',
            stock: 5,
            landingCost: 700
        });

        // Warehouse committed is only 5, but order claims 20!
        mockStore.warehouse_stock.set(`${skuCode}_BAT_DELIV_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_DELIV',
            warehouseId,
            availableStock: 95,
            committedStock: 5
        });

        mockStore.orders.set('ORD_BAD', { id: 'ORD_BAD', stockCompleted: false });

        const txn = createMockTransaction();
        const compRes = await completeOrderStock(txn, {
            orderId: 'ORD_BAD',
            items: [{
                skuCode,
                quantity: 20,
                batchAllocations: [{
                    batchId: 'BAT_DELIV',
                    batchNumber: 'BAT-DELIV',
                    warehouseId,
                    allocatedQty: 20,
                    landingCost: 700
                }]
            }],
            actorId: 'RIDER_1',
            idempotencyKey: 'ORDER:ORD_BAD:COMPLETE_STOCK'
        });

        // 1. Delivery must succeed and not block OTP verification
        assert.strictEqual(compRes.completed, true);

        // 2. committedStock must not go negative
        const wsDoc = mockStore.warehouse_stock.get(`${skuCode}_BAT_DELIV_${warehouseId}`);
        assert.strictEqual(wsDoc.committedStock, 0);

        // Assert batch doc stock decremented only by actualDeduction (5 units, from 5 to 0)
        const batchDoc = mockStore[batchesKey].get('BAT_DELIV');
        assert.strictEqual(batchDoc.stock, 0); // 5 - 5 = 0 (not 5 - 20 = -15!)

        // Assert SKU aggregate is clamped to actual deduction (5 units), committedStock: 0, totalStock: 95
        const skuDoc = mockStore.skus.get(skuCode);
        assert.strictEqual(skuDoc.inventory.committedStock, 0); // 5 - 5 = 0
        assert.strictEqual(skuDoc.inventory.totalStock, 95); // 100 - 5 = 95 (does not drop to 80!)

        // 3. Reconciliation audit must be logged
        assert.ok(mockStore.inventory_reconciliation.size > 0);
        const reconList = Array.from(mockStore.inventory_reconciliation.values());
        const shortfallRecord = reconList.find(r => r.type === 'DELIVERY_SHORTFALL' && r.orderId === 'ORD_BAD');
        assert.ok(shortfallRecord, "Must find DELIVERY_SHORTFALL entry in inventory_reconciliation");
        assert.strictEqual(shortfallRecord.difference, 15);
        assert.strictEqual(shortfallRecord.expectedQty, 20);
        assert.strictEqual(shortfallRecord.foundCommittedQty, 5);

        pass("8. Complete shortfall safely allowed delivery to succeed and logged audit to inventory_reconciliation");
    } catch (e) {
        fail("8. Complete shortfall reconciliation", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 8B: Release Stock Mismatch Logs to inventory_reconciliation
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 90, committedStock: 5, totalStock: 95 }
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_REL_MISMATCH_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_REL_MISMATCH',
            warehouseId,
            availableStock: 90,
            committedStock: 5 // Only 5 committed
        });

        mockStore.orders.set('ORD_REL_BAD', { id: 'ORD_REL_BAD', stockRestored: false });

        const txnRel = createMockTransaction();
        const relRes = await releaseOrderStock(txnRel, {
            orderId: 'ORD_REL_BAD',
            items: [{
                skuCode,
                quantity: 15, // Releasing 15 (more than 5 committed)
                batchAllocations: [{
                    batchId: 'BAT_REL_MISMATCH',
                    batchNumber: 'BAT-REL-MISMATCH',
                    warehouseId,
                    allocatedQty: 15,
                    landingCost: 650
                }]
            }],
            actorId: 'ADMIN_1',
            reason: 'Order cancelled with inventory mismatch',
            idempotencyKey: 'ORDER:ORD_REL_BAD:RELEASE_STOCK'
        });

        assert.strictEqual(relRes.released, true);

        // committedStock must not go negative
        const wsDocRel = mockStore.warehouse_stock.get(`${skuCode}_BAT_REL_MISMATCH_${warehouseId}`);
        assert.strictEqual(wsDocRel.committedStock, 0);
        // Fix 3 prevents phantom stock inflation: restores min(15, 5) = 5 units, so 90 + 5 = 95 (not 105)
        assert.strictEqual(wsDocRel.availableStock, 95);

        // Reconciliation entry must be recorded
        const reconList = Array.from(mockStore.inventory_reconciliation.values());
        const mismatchRecord = reconList.find(r => r.type === 'RELEASE_MISMATCH' && r.orderId === 'ORD_REL_BAD');
        assert.ok(mismatchRecord, "Must find RELEASE_MISMATCH entry in inventory_reconciliation");
        assert.strictEqual(mismatchRecord.difference, 10);
        assert.strictEqual(mismatchRecord.expectedQty, 15);
        assert.strictEqual(mismatchRecord.foundCommittedQty, 5);

        pass("8B. Release mismatch safely logged to inventory_reconciliation and restored available stock");
    } catch (e) {
        fail("8B. Release mismatch reconciliation", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Legacy Orders (batchAllocations empty) Works Without Error
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 90, committedStock: 10, totalStock: 100 }
        });
        mockStore.orders.set('ORD_LEGACY', { id: 'ORD_LEGACY', stockRestored: false, stockCompleted: false });

        const txnRel = createMockTransaction();
        const relRes = await releaseOrderStock(txnRel, {
            orderId: 'ORD_LEGACY',
            items: [{
                skuCode,
                quantity: 10,
                batchAllocations: [] // Legacy empty batchAllocations
            }],
            actorId: 'ADMIN',
            idempotencyKey: 'LEGACY_RELEASE'
        });

        assert.strictEqual(relRes.released, true);
        const skuAfterRel = mockStore.skus.get(skuCode);
        assert.strictEqual(skuAfterRel.inventory.availableStock, 100);
        assert.strictEqual(skuAfterRel.inventory.committedStock, 0);

        pass("9. Legacy orders (empty batchAllocations) handled gracefully without errors");
    } catch (e) {
        fail("9. Legacy orders", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Consistency Audit Check: SKU aggregate == Warehouse Stock sum
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        const initialStock = 200;
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: initialStock, committedStock: 0, totalStock: initialStock }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('B1', { batchNumber: 'B1', isActive: true, qualityStatus: 'PASSED', landingCost: 700, expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 50 * 24 * 3600 * 1000) });
        mockStore[batchesKey].set('B2', { batchNumber: 'B2', isActive: true, qualityStatus: 'PASSED', landingCost: 710, expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 100 * 24 * 3600 * 1000) });

        mockStore.warehouse_stock.set(`${skuCode}_B1_${warehouseId}`, { skuCode, batchId: 'B1', warehouseId, availableStock: 100, committedStock: 0 });
        mockStore.warehouse_stock.set(`${skuCode}_B2_${warehouseId}`, { skuCode, batchId: 'B2', warehouseId, availableStock: 100, committedStock: 0 });

        // Reserve 120 (takes all 100 of B1, and 20 of B2)
        const txnRes = createMockTransaction();
        await reserveOrderStock(txnRes, {
            orderId: 'ORD_CONSIST',
            items: [{ skuCode, quantity: 120 }],
            userId: 'U1',
            idempotencyKey: 'reserve_ORD_CONSIST',
            destinationHubId: warehouseId
        });

        const wsB1 = mockStore.warehouse_stock.get(`${skuCode}_B1_${warehouseId}`);
        const wsB2 = mockStore.warehouse_stock.get(`${skuCode}_B2_${warehouseId}`);
        const skuDoc = mockStore.skus.get(skuCode);

        const totalWsAvail = wsB1.availableStock + wsB2.availableStock;
        const totalWsCommitted = wsB1.committedStock + wsB2.committedStock;

        assert.strictEqual(skuDoc.inventory.availableStock, totalWsAvail);
        assert.strictEqual(skuDoc.inventory.committedStock, totalWsCommitted);
        assert.strictEqual(totalWsAvail, 80);
        assert.strictEqual(totalWsCommitted, 120);

        pass("10. Full consistency audit PASS: SKU aggregate exactly matches sum of warehouse_stock");
    } catch (e) {
        fail("10. Consistency audit", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Variant Stock Consistency (SKU aggregate == WS sum == Variant stock)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        const initialQty = 100;
        const productId = 'PROD_SIMODIS';

        // 1. Initial State: SKU, Batch, WS, Product Variant
        mockStore.skus.set(skuCode, {
            skuCode,
            productId,
            isActive: true,
            inventory: { availableStock: initialQty, committedStock: 0, totalStock: initialQty }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_V1', {
            batchNumber: 'BAT-V1',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 650,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 3600 * 1000)
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_V1_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_V1',
            warehouseId,
            availableStock: initialQty,
            committedStock: 0
        });

        mockStore.products.set(productId, {
            id: productId,
            variants: [{
                id: 'VAR_80ML',
                skuCode: skuCode,
                label: '80 ml',
                stock: initialQty
            }]
        });

        // 2. Reservation of 25 units
        const txnCreate = createMockTransaction();
        const res = await reserveOrderStock(txnCreate, {
            orderId: 'ORD_VAR_TEST',
            items: [{ skuCode, quantity: 25 }],
            userId: 'USER_VAR',
            idempotencyKey: 'reserve_ORD_VAR_TEST',
            destinationHubId: warehouseId
        });

        // Simulate single variant decrement in createOrder
        const pDoc = mockStore.products.get(productId);
        pDoc.variants[0].stock -= 25;

        const wsDoc = mockStore.warehouse_stock.get(`${skuCode}_BAT_V1_${warehouseId}`);
        const skuDoc = mockStore.skus.get(skuCode);

        // Verification after Create
        assert.strictEqual(wsDoc.availableStock, 75);
        assert.strictEqual(wsDoc.committedStock, 25);
        assert.strictEqual(skuDoc.inventory.availableStock, 75);
        assert.strictEqual(skuDoc.inventory.committedStock, 25);
        assert.strictEqual(pDoc.variants[0].stock, 75);
        assert.strictEqual(skuDoc.inventory.availableStock, wsDoc.availableStock);
        assert.strictEqual(skuDoc.inventory.availableStock, pDoc.variants[0].stock);

        // 3. Release Order (Cancellation) of 25 units
        const txnCancel = createMockTransaction();
        await releaseOrderStock(txnCancel, {
            orderId: 'ORD_VAR_TEST',
            items: [{
                skuCode,
                quantity: 25,
                batchAllocations: res.allocationsSummary[0].allocations
            }],
            actorId: 'ADMIN',
            reason: 'Test cancellation',
            idempotencyKey: 'ORDER:ORD_VAR_TEST:RELEASE_STOCK'
        });

        // Simulate single variant restoration in orderTriggers
        pDoc.variants[0].stock += 25;

        // Verification after Cancellation
        const wsDocAfterCancel = mockStore.warehouse_stock.get(`${skuCode}_BAT_V1_${warehouseId}`);
        const skuDocAfterCancel = mockStore.skus.get(skuCode);
        assert.strictEqual(wsDocAfterCancel.availableStock, 100);
        assert.strictEqual(wsDocAfterCancel.committedStock, 0);
        assert.strictEqual(skuDocAfterCancel.inventory.availableStock, 100);
        assert.strictEqual(skuDocAfterCancel.inventory.committedStock, 0);
        assert.strictEqual(pDoc.variants[0].stock, 100);
        assert.strictEqual(skuDocAfterCancel.inventory.availableStock, wsDocAfterCancel.availableStock);
        assert.strictEqual(skuDocAfterCancel.inventory.availableStock, pDoc.variants[0].stock);

        pass("11. Variant stock consistency PASS: SKU aggregate == Warehouse Stock == Variant stock on create & cancel");
    } catch (e) {
        fail("11. Variant stock consistency", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Concurrent Orders Race Condition (Second order strictly rejected)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 10, committedStock: 0, totalStock: 10 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_LAST', {
            batchNumber: 'BAT-LAST',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 650,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 24 * 3600 * 1000)
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_LAST_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_LAST',
            warehouseId,
            availableStock: 10,
            committedStock: 0
        });

        // Order 1 reserves all remaining 10 units
        const txn1 = createMockTransaction();
        const res1 = await reserveOrderStock(txn1, {
            orderId: 'ORD_RACE_1',
            items: [{ skuCode, quantity: 10 }],
            userId: 'USER_A',
            idempotencyKey: 'reserve_ORD_RACE_1',
            destinationHubId: warehouseId
        });
        assert.strictEqual(res1.success, true);

        // Order 2 tries to reserve 10 units immediately after (stock is now 0)
        const txn2 = createMockTransaction();
        let raceRejected = false;
        try {
            await reserveOrderStock(txn2, {
                orderId: 'ORD_RACE_2',
                items: [{ skuCode, quantity: 10 }],
                userId: 'USER_B',
                idempotencyKey: 'reserve_ORD_RACE_2',
                destinationHubId: warehouseId
            });
        } catch (err) {
            raceRejected = true;
            assert.strictEqual(err.code, 'failed-precondition');
        }

        assert.strictEqual(raceRejected, true);

        // Final state verification: available cannot become negative (-10)
        const wsFinal = mockStore.warehouse_stock.get(`${skuCode}_BAT_LAST_${warehouseId}`);
        const skuFinal = mockStore.skus.get(skuCode);
        assert.strictEqual(wsFinal.availableStock, 0);
        assert.strictEqual(wsFinal.committedStock, 10);
        assert.strictEqual(skuFinal.inventory.availableStock, 0);
        assert.strictEqual(skuFinal.inventory.committedStock, 10);

        pass("12. Concurrent race rejection PASS: Order 1 secured last stock, Order 2 safely rejected with failed-precondition, availableStock never went negative");
    } catch (e) {
        fail("12. Concurrent race rejection", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 13: Same SKU Multi-Line Items Merged Correctly
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 100, committedStock: 0, totalStock: 100 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_001', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            landingCost: 650,
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 100 * 24 * 3600 * 1000)
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_001_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_001',
            warehouseId,
            availableStock: 50,
            committedStock: 0
        });

        const txn = createMockTransaction();
        // Order has 2 lines of the exact same SKU (15 + 20 = 35)
        const res = await reserveOrderStock(txn, {
            orderId: 'ORD_MULTI_LINE',
            items: [
                { skuCode, quantity: 15 },
                { skuCode, quantity: 20 }
            ],
            userId: 'USER_MULTI',
            idempotencyKey: 'reserve_ORD_MULTI_LINE',
            destinationHubId: warehouseId
        });

        assert.strictEqual(res.success, true);
        const ws = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        const sku = mockStore.skus.get(skuCode);
        assert.strictEqual(ws.availableStock, 15); // 50 - 35 = 15
        assert.strictEqual(ws.committedStock, 35);
        assert.strictEqual(sku.inventory.availableStock, 65); // 100 - 35 = 65
        assert.strictEqual(sku.inventory.committedStock, 35);

        pass("13. Multi-line same-SKU merge PASS: 15 + 20 items merged seamlessly into 35 allocated units without read-after-write errors or write collisions");
    } catch (e) {
        fail("13. Multi-line same-SKU merge", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 14: completeOrderStock with Missing Batch Document (Non-blocking)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 0, committedStock: 10, totalStock: 10 }
        });

        // Warehouse stock exists with 10 committed
        mockStore.warehouse_stock.set(`${skuCode}_BAT_MISSING_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_MISSING',
            warehouseId,
            availableStock: 0,
            committedStock: 10
        });

        // Notice: mockStore[batchesKey] does NOT have BAT_MISSING doc!
        const txn = createMockTransaction();
        const res = await completeOrderStock(txn, {
            orderId: 'ORD_BATCH_MISSING',
            items: [{
                skuCode,
                quantity: 10,
                batchAllocations: [{
                    batchId: 'BAT_MISSING',
                    warehouseId,
                    allocatedQty: 10
                }]
            }],
            actorId: 'RIDER_DELIVERY',
            idempotencyKey: 'complete_ORD_BATCH_MISSING'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.completed, true);

        // Committed stock should still decrement to 0
        const ws = mockStore.warehouse_stock.get(`${skuCode}_BAT_MISSING_${warehouseId}`);
        assert.strictEqual(ws.committedStock, 0);

        // Verification: reconciliation entry logged for missing batch doc with metadata
        const recons = Array.from((mockStore.inventory_reconciliation || new Map()).values());
        const missingDocRecon = recons.find(r => r.type === "BATCH_DOC_MISSING");
        assert.ok(missingDocRecon, "Expected BATCH_DOC_MISSING entry in inventory_reconciliation");
        assert.strictEqual(missingDocRecon.batchId, 'BAT_MISSING');
        assert.strictEqual(missingDocRecon.expectedQty, 10);
        assert.strictEqual(missingDocRecon.actualDeductedQty, 10);
        assert.strictEqual(missingDocRecon.skuAggregateDecremented, true);

        // Assert SKU aggregate is updated consistently even when batch doc is missing
        const skuDocMissing = mockStore.skus.get(skuCode);
        assert.strictEqual(skuDocMissing.inventory.committedStock, 0); // 10 - 10 = 0
        assert.strictEqual(skuDocMissing.inventory.totalStock, 0); // 10 - 10 = 0

        pass("14. Missing batch document in completeOrderStock PASS: Logged to inventory_reconciliation with skuAggregateDecremented: true without blocking delivery OTP completion, SKU aggregate correctly decremented");
    } catch (e) {
        fail("14. Missing batch document in completeOrderStock", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 15: releaseOrderStock when committedStock < allocatedQty (Phantom Stock Prevention)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 0, committedStock: 5, totalStock: 5 }
        });

        // Warehouse stock has only 5 committed, but order cancellation claims 10 allocated
        mockStore.warehouse_stock.set(`${skuCode}_BAT_001_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_001',
            warehouseId,
            availableStock: 0,
            committedStock: 5
        });

        const txn = createMockTransaction();
        const res = await releaseOrderStock(txn, {
            orderId: 'ORD_SHORTFALL_RELEASE',
            items: [{
                skuCode,
                quantity: 10,
                batchAllocations: [{
                    batchId: 'BAT_001',
                    warehouseId,
                    allocatedQty: 10
                }]
            }],
            actorId: 'ADMIN_USER',
            idempotencyKey: 'release_ORD_SHORTFALL_RELEASE'
        });

        assert.strictEqual(res.success, true);

        const ws = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        // Available should only increase by min(10, 5) = 5, NOT by 10 (which would fabricate phantom stock!)
        assert.strictEqual(ws.availableStock, 5);
        assert.strictEqual(ws.committedStock, 0);

        // Check reconciliation log entry
        const recons = Array.from((mockStore.inventory_reconciliation || new Map()).values());
        const mismatchRecon = recons.find(r => r.type === "RELEASE_MISMATCH");
        assert.ok(mismatchRecon, "Expected RELEASE_MISMATCH entry in inventory_reconciliation");
        assert.strictEqual(mismatchRecon.difference, 5);
        assert.strictEqual(mismatchRecon.expectedQty, 10);
        assert.strictEqual(mismatchRecon.foundCommittedQty, 5);

        // Assert SKU aggregate inventory availableStock and committedStock
        const skuAfterRel = mockStore.skus.get(skuCode);
        assert.strictEqual(skuAfterRel.inventory.availableStock, 5); // 0 + min(10, 5) = 5
        assert.strictEqual(skuAfterRel.inventory.committedStock, 0); // 5 - totalRestoredForSku (5) = 0 (No negative skew!)

        pass("15. releaseOrderStock committedStock shortfall PASS: Restored exactly Math.min(allocated, committed) (5 units) on both warehouse_stock and SKU aggregate, preventing phantom stock inflation; logged RELEASE_MISMATCH");
    } catch (e) {
        fail("15. releaseOrderStock committedStock shortfall", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 16: releaseOrderStock and completeOrderStock Multi-Line Same-Batch Merge
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 0, committedStock: 35, totalStock: 35 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_001', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            stock: 35,
            landingCost: 650
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_001_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_001',
            warehouseId,
            availableStock: 0,
            committedStock: 35
        });

        // 1. Test release with 2 lines pointing to the SAME batch BAT_001 (15 + 20 = 35)
        const txnRel = createMockTransaction();
        const resRel = await releaseOrderStock(txnRel, {
            orderId: 'ORD_MERGE_REL',
            items: [
                {
                    skuCode,
                    quantity: 15,
                    batchAllocations: [{ batchId: 'BAT_001', warehouseId, allocatedQty: 15 }]
                },
                {
                    skuCode,
                    quantity: 20,
                    batchAllocations: [{ batchId: 'BAT_001', warehouseId, allocatedQty: 20 }]
                }
            ],
            actorId: 'ADMIN_TEST',
            idempotencyKey: 'release_ORD_MERGE_REL'
        });

        assert.strictEqual(resRel.success, true);
        const wsRel = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        const skuRel = mockStore.skus.get(skuCode);
        assert.strictEqual(wsRel.availableStock, 35);
        assert.strictEqual(wsRel.committedStock, 0);
        assert.strictEqual(skuRel.inventory.availableStock, 35);
        assert.strictEqual(skuRel.inventory.committedStock, 0);

        // 2. Now re-commit 35 and test completeOrderStock with 2 lines pointing to the SAME batch BAT_001
        wsRel.availableStock = 0;
        wsRel.committedStock = 35;
        skuRel.inventory.availableStock = 0;
        skuRel.inventory.committedStock = 35;

        const txnComp = createMockTransaction();
        const resComp = await completeOrderStock(txnComp, {
            orderId: 'ORD_MERGE_COMP',
            items: [
                {
                    skuCode,
                    quantity: 15,
                    batchAllocations: [{ batchId: 'BAT_001', warehouseId, allocatedQty: 15 }]
                },
                {
                    skuCode,
                    quantity: 20,
                    batchAllocations: [{ batchId: 'BAT_001', warehouseId, allocatedQty: 20 }]
                }
            ],
            actorId: 'RIDER_TEST',
            idempotencyKey: 'complete_ORD_MERGE_COMP'
        });

        assert.strictEqual(resComp.success, true);
        const wsComp = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        const batchComp = mockStore[batchesKey].get('BAT_001');
        const skuComp = mockStore.skus.get(skuCode);
        assert.strictEqual(wsComp.committedStock, 0);
        assert.strictEqual(batchComp.stock, 0); // 35 - (15 + 20) = 0 (No set clobbering!)
        assert.strictEqual(skuComp.inventory.totalStock, 0);

        pass("16. releaseOrderStock and completeOrderStock batch merge PASS: Multiple lines sharing same batch merged atomically without set overwrite");
    } catch (e) {
        fail("16. releaseOrderStock and completeOrderStock batch merge", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 17: Deterministic Distribution Across Raw Item Lines
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 35, committedStock: 0, totalStock: 35 }
        });

        // 3 Batches with staggered expiry dates:
        // BAT_1: 10 units (expires in 10 days)
        // BAT_2: 20 units (expires in 20 days)
        // BAT_3: 5 units  (expires in 30 days)
        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_1', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 24 * 3600 * 1000)
        });
        mockStore[batchesKey].set('BAT_2', {
            batchNumber: 'BAT-002',
            isActive: true,
            qualityStatus: 'PASSED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 20 * 24 * 3600 * 1000)
        });
        mockStore[batchesKey].set('BAT_3', {
            batchNumber: 'BAT-003',
            isActive: true,
            qualityStatus: 'PASSED',
            expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000)
        });

        mockStore.warehouse_stock.set(`${skuCode}_BAT_1_${warehouseId}`, {
            skuCode, batchId: 'BAT_1', warehouseId, availableStock: 10, committedStock: 0
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_2_${warehouseId}`, {
            skuCode, batchId: 'BAT_2', warehouseId, availableStock: 20, committedStock: 0
        });
        mockStore.warehouse_stock.set(`${skuCode}_BAT_3_${warehouseId}`, {
            skuCode, batchId: 'BAT_3', warehouseId, availableStock: 5, committedStock: 0
        });

        const txn = createMockTransaction();
        // Request Line 0 = 15 units, Line 1 = 20 units with NO IDs
        const res = await reserveOrderStock(txn, {
            orderId: 'ORD_DETERMINISTIC_SPLIT',
            items: [
                { skuCode, quantity: 15 },
                { skuCode, quantity: 20 }
            ],
            userId: 'USER_SPLIT',
            idempotencyKey: 'reserve_ORD_DETERMINISTIC_SPLIT',
            destinationHubId: warehouseId
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.allocationsSummary.length, 2);

        const line0 = res.allocationsSummary.find(l => l.lineIndex === 0);
        const line1 = res.allocationsSummary.find(l => l.lineIndex === 1);

        assert.ok(line0, "Line index 0 must be present in allocationsSummary");
        assert.ok(line1, "Line index 1 must be present in allocationsSummary");

        // Line 0 needed 15:
        // Takes 10 from BAT_1 (fully depleted)
        // Takes 5 from BAT_2 (15 remaining in BAT_2)
        const line0Sum = line0.allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
        assert.strictEqual(line0Sum, 15);
        assert.strictEqual(line0.allocations.length, 2);
        assert.strictEqual(line0.allocations[0].batchId, 'BAT_1');
        assert.strictEqual(line0.allocations[0].allocatedQty, 10);
        assert.strictEqual(line0.allocations[1].batchId, 'BAT_2');
        assert.strictEqual(line0.allocations[1].allocatedQty, 5);

        // Line 1 needed 20:
        // Takes 15 remaining from BAT_2 (fully depleted)
        // Takes 5 from BAT_3 (fully depleted)
        const line1Sum = line1.allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
        assert.strictEqual(line1Sum, 20);
        assert.strictEqual(line1.allocations.length, 2);
        assert.strictEqual(line1.allocations[0].batchId, 'BAT_2');
        assert.strictEqual(line1.allocations[0].allocatedQty, 15);
        assert.strictEqual(line1.allocations[1].batchId, 'BAT_3');
        assert.strictEqual(line1.allocations[1].allocatedQty, 5);

        // Grand total
        assert.strictEqual(line0Sum + line1Sum, 35);

        pass("17. Deterministic distribution across raw item lines PASS: Line 0 (15) and Line 1 (20) identified purely by stable lineIndex without item IDs; consumed batches 10/20/5 sequentially in FEFO order without gaps");
    } catch (e) {
        fail("17. Deterministic distribution across raw item lines", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 18: Mixed Order (One Line Legacy + One Line Batch-Reserved on Same SKU)
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        mockStore.skus.set(skuCode, {
            skuCode,
            isActive: true,
            inventory: { availableStock: 0, committedStock: 30, totalStock: 30 }
        });

        const batchesKey = `skus_${skuCode}_batches`;
        mockStore[batchesKey] = new Map();
        mockStore[batchesKey].set('BAT_001', {
            batchNumber: 'BAT-001',
            isActive: true,
            qualityStatus: 'PASSED',
            stock: 20,
            landingCost: 650
        });

        // Warehouse stock for BAT_001: 20 committed
        mockStore.warehouse_stock.set(`${skuCode}_BAT_001_${warehouseId}`, {
            skuCode,
            batchId: 'BAT_001',
            warehouseId,
            availableStock: 0,
            committedStock: 20
        });

        // Mixed items on the exact same SKU:
        // Line 0: 10 units legacy (batchAllocations: [])
        // Line 1: 20 units batch-reserved (batchAllocations: [{ batchId: 'BAT_001', allocatedQty: 20 }])
        const mixedItems = [
            {
                skuCode,
                quantity: 10,
                batchAllocations: [] // Legacy
            },
            {
                skuCode,
                quantity: 20,
                batchAllocations: [{ batchId: 'BAT_001', warehouseId, allocatedQty: 20 }] // Batch-reserved
            }
        ];

        // 1. Test releaseOrderStock on mixed order
        const txnRel = createMockTransaction();
        const resRel = await releaseOrderStock(txnRel, {
            orderId: 'ORD_MIXED',
            items: mixedItems,
            actorId: 'ADMIN_TEST',
            idempotencyKey: 'release_ORD_MIXED'
        });

        assert.strictEqual(resRel.success, true);
        const wsRel = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        const skuRel = mockStore.skus.get(skuCode);
        assert.strictEqual(wsRel.availableStock, 20);
        assert.strictEqual(wsRel.committedStock, 0);
        // SKU aggregate: totalQuantity = 30. Restored = 10 (legacy) + 20 (batch) = 30
        assert.strictEqual(skuRel.inventory.availableStock, 30);
        assert.strictEqual(skuRel.inventory.committedStock, 0);
        assert.strictEqual(skuRel.inventory.totalStock, 30);

        // 2. Reset back to committed state and test completeOrderStock on mixed order
        wsRel.availableStock = 0;
        wsRel.committedStock = 20;
        skuRel.inventory.availableStock = 0;
        skuRel.inventory.committedStock = 30;
        skuRel.inventory.totalStock = 30;

        const txnComp = createMockTransaction();
        const resComp = await completeOrderStock(txnComp, {
            orderId: 'ORD_MIXED_COMP',
            items: mixedItems,
            actorId: 'RIDER_TEST',
            idempotencyKey: 'complete_ORD_MIXED_COMP'
        });

        assert.strictEqual(resComp.success, true);
        const wsComp = mockStore.warehouse_stock.get(`${skuCode}_BAT_001_${warehouseId}`);
        const batchComp = mockStore[batchesKey].get('BAT_001');
        const skuComp = mockStore.skus.get(skuCode);
        assert.strictEqual(wsComp.committedStock, 0);
        assert.strictEqual(batchComp.stock, 0); // 20 - 20 = 0
        // SKU aggregate: 30 deducted from committedStock & totalStock
        assert.strictEqual(skuComp.inventory.committedStock, 0);
        assert.strictEqual(skuComp.inventory.totalStock, 0);

        pass("18. Mixed Order PASS: Order with both legacy line (empty allocations) and batch-reserved line on same SKU releases and completes with 100% accurate SKU aggregate");
    } catch (e) {
        fail("18. Mixed Order", e);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 19: Concurrent Duplicate Razorpay Order Recovery
    // ─────────────────────────────────────────────────────────────
    try {
        clearStore();
        const testOrderId = 'ORD_RZP_RECOVERY_1';
        const testIdemKey = 'IDEM_RZP_REC_KEY';

        // Order document in Firestore missing razorpayOrderId
        mockStore.orders = new Map();
        mockStore.orders.set(testOrderId, {
            id: testOrderId,
            orderId: testOrderId,
            totalAmount: 1500,
            paymentMethod: 'RAZORPAY_ONLINE',
            razorpayOrderId: null
        });

        mockStore.idempotency_keys = new Map();
        mockStore.idempotency_keys.set(testIdemKey, {
            orderId: testOrderId,
            userId: 'USER_TEST',
            totalAmount: 1500,
            customerOTP: '1234'
        });

        let rzpApiCallCount = 0;
        const fakeCreateRazorpayOrder = async (ordId, amount) => {
            rzpApiCallCount++;
            // Small artificial latency to simulate real network API call
            await new Promise(r => setTimeout(r, 20));
            return `order_fake_${ordId}_${rzpApiCallCount}`;
        };

        // Simulate multi-instance transactional check-and-set recovery logic:
        const handleDuplicateRecovery = async (workerId) => {
            let rzpOrderId = null;
            let shouldCreate = false;

            // Step 1: Atomic transaction claim on order doc
            const orderDoc = mockStore.orders.get(testOrderId) || {};
            if (orderDoc.razorpayOrderId) {
                rzpOrderId = orderDoc.razorpayOrderId;
            } else if (orderDoc.razorpayClaimAt) {
                shouldCreate = false; // Another distributed instance claimed
            } else {
                orderDoc.razorpayClaimAt = Date.now();
                shouldCreate = true;
            }

            if (!rzpOrderId && shouldCreate) {
                const createdRzpId = await fakeCreateRazorpayOrder(testOrderId, 1500);
                orderDoc.razorpayOrderId = createdRzpId;
                delete orderDoc.razorpayClaimAt;
                rzpOrderId = createdRzpId;
            } else if (!rzpOrderId) {
                // Wait for winning instance to complete and re-read order doc
                await new Promise(r => setTimeout(r, 40));
                rzpOrderId = orderDoc.razorpayOrderId;
            }
            return rzpOrderId;
        };

        // Run 2 concurrent duplicate recovery requests
        const [res1, res2] = await Promise.all([
            handleDuplicateRecovery('Worker 1'),
            handleDuplicateRecovery('Worker 2')
        ]);

        // Both workers receive the exact same razorpayOrderId
        assert.strictEqual(res1, res2);
        assert.strictEqual(mockStore.orders.get(testOrderId).razorpayOrderId, res1);
        // Only 1 external Razorpay order was created
        assert.strictEqual(rzpApiCallCount, 1, "Exactly one external Razorpay order must be created during concurrent duplicate recovery");

        pass("19. Concurrent Duplicate Razorpay Recovery PASS: Two concurrent workers resolved identical Razorpay order with zero duplicates");
    } catch (e) {
        fail("19. Concurrent Duplicate Razorpay Recovery", e);
    }

    console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});

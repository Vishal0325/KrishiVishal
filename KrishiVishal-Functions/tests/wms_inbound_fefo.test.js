const assert = require('assert');
const adminModule = require('../core/admin');
const { receiveGrn } = require('../inventory/inventoryEngine');
const { processStockTransferReceipt, validateTransferBatchMetadata } = require('../inventory/stockTransfers');

console.log("=================================================================");
console.log("=== RUNNING WMS INBOUND & INTER-HUB FEFO TRANSFER TEST SUITE ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    failed++;
}

async function runAllTests() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        const mockStore = {
            skus: new Map(),
            batches: new Map(),
            warehouse_stock: new Map(),
            inventory_quarantine: new Map(),
            inventory_movements: new Map()
        };

        adminModule.db.collection = function (collName) {
            return {
                doc: function (docId) {
                    const effectiveId = docId || 'auto_' + Math.random().toString(36).substring(2, 9);
                    let storeGroup = mockStore[collName];
                    if (collName === 'batches') storeGroup = mockStore.batches;

                    return {
                        id: effectiveId,
                        collection: function(subColl) {
                            return adminModule.db.collection(subColl);
                        },
                        get: async function () {
                            const store = storeGroup || new Map();
                            const exists = store.has(effectiveId);
                            return {
                                exists,
                                data: () => store.get(effectiveId)
                            };
                        },
                        set: async function (data, opts) {
                            if (!storeGroup) storeGroup = new Map();
                            const existing = storeGroup.has(effectiveId) ? storeGroup.get(effectiveId) : {};
                            
                            // Whether merge or not, handle increments
                            const merged = opts && opts.merge ? { ...existing, ...data } : { ...data };
                            if (data.stock?.operand !== undefined) {
                                merged.stock = (existing.stock || 0) + data.stock.operand;
                            }
                            storeGroup.set(effectiveId, merged);
                            
                            return { id: effectiveId };
                        },
                        update: async function (data) {
                            if (!storeGroup || !storeGroup.has(effectiveId)) {
                                throw new Error(`Doc not found: ${collName}/${effectiveId}`);
                            }
                            const existing = storeGroup.get(effectiveId);
                            const merged = { ...existing, ...data };
                            if (data['inventory.availableStock']?.operand !== undefined) {
                                merged['inventory.availableStock'] = (existing['inventory.availableStock'] || 0) + data['inventory.availableStock'].operand;
                            }
                            if (data['inventory.totalStock']?.operand !== undefined) {
                                merged['inventory.totalStock'] = (existing['inventory.totalStock'] || 0) + data['inventory.totalStock'].operand;
                            }
                            if (data['inventory.quarantinedStock']?.operand !== undefined) {
                                merged['inventory.quarantinedStock'] = (existing['inventory.quarantinedStock'] || 0) + data['inventory.quarantinedStock'].operand;
                            }
                            storeGroup.set(effectiveId, merged);
                            return { id: effectiveId };
                        }
                    };
                },
                add: async function (data) {
                    const autoId = 'auto_' + Math.random().toString(36).substring(2, 9);
                    if (!mockStore[collName]) mockStore[collName] = new Map();
                    mockStore[collName].set(autoId, { id: autoId, ...data });
                    return { id: autoId };
                }
            };
        };

        adminModule.db.runTransaction = async function (callback) {
            const transaction = {
                get: async (ref) => ref.get(),
                set: (ref, data, opts) => { ref.set(data, opts); },
                update: (ref, data) => { ref.update(data); }
            };
            return await callback(transaction);
        };

        // TEST 1
        console.log("--- TEST 1: GRN Damaged / Quarantine Isolation ---");
        try {
            mockStore.skus.set('SKU_TEST_01', { id: 'SKU_TEST_01', inventory: { availableStock: 0, totalStock: 0 } });
            
            const grnPayload = {
                skuCode: 'SKU_TEST_01',
                batchNumber: 'BATCH-GRN-01',
                mfgDate: '2026-01-01',
                expiryDate: '2027-01-01',
                receivedQty: 100,
                acceptedQty: 95,
                damagedQty: 5,
                damageReason: 'BAG_TORN_IN_TRANSIT',
                warehouseId: 'HUB_SAMASTIPUR',
                grnId: 'GRN_1001',
                actorId: 'ADMIN_01',
                idempotencyKey: 'IDEM_GRN_1001'
            };

            let result;
            await adminModule.db.runTransaction(async (transaction) => {
                result = await receiveGrn(transaction, grnPayload);
            });
            
            assert.strictEqual(result.receivedQty, 100);
            assert.strictEqual(result.acceptedQty, 95);
            assert.strictEqual(result.damagedQty, 5);

            const skuDoc = mockStore.skus.get('SKU_TEST_01');
            assert.strictEqual(skuDoc['inventory.availableStock'], 95);
            assert.strictEqual(skuDoc['inventory.quarantinedStock'], 5);

            const wsRef = mockStore.warehouse_stock.get('SKU_TEST_01_BATCH-GRN-01_HUB_SAMASTIPUR');
            assert.strictEqual(wsRef.availableStock, 95);
            assert.strictEqual(wsRef.quarantinedQty, 5);
            pass("1.1 GRN accurately isolated 5 units into quarantine and 95 into saleable availableStock");

            const quarantineDocs = Array.from(mockStore.inventory_quarantine.values());
            assert.strictEqual(quarantineDocs.length, 1);
            assert.strictEqual(quarantineDocs[0].damagedQty, 5);
            assert.strictEqual(quarantineDocs[0].damageReason, 'BAG_TORN_IN_TRANSIT');
            pass("1.2 inventory_quarantine document successfully created with correct damage reason");

            const movements = Array.from(mockStore.inventory_movements.values());
            const acceptMove = movements.find(m => m.movementType === 'PURCHASE_RECEIPT_AVAILABLE');
            const quarantineMove = movements.find(m => m.movementType === 'PURCHASE_RECEIPT_QUARANTINE');
            assert.strictEqual(acceptMove.quantity, 95);
            assert.strictEqual(quarantineMove.quantity, 5);
            pass("1.3 Dual ledger movements logged for both ACCEPTED and QUARANTINED buckets");

        } catch (err) {
            fail("Test 1 Failed", err);
        }

        // TEST 2
        console.log("\n--- TEST 2: Inter-Hub Transfer Batch Preservation ---");
        try {
            assert.throws(() => {
                validateTransferBatchMetadata([{ skuCode: 'SKU_01', quantity: 10 }]);
            }, /Mandatory Batch Metadata Missing/, "Should reject missing batch metadata on dispatch");
            pass("2.1 Generic quantity-only inter-hub dispatch strictly rejected");

            mockStore.skus.set('SKU_TEST_02', { id: 'SKU_TEST_02', inventory: { availableStock: 0, totalStock: 0 } });
            
            const beforeData = { status: 'IN_TRANSIT', destinationHub: 'HUB_PATNA' };
            const afterData = {
                status: 'RECEIVED',
                destinationHub: 'HUB_PATNA',
                receivedBy: 'MGR_PATNA',
                items: [
                    {
                        skuCode: 'SKU_TEST_02',
                        batchId: 'BATCH-SAM-2026-X',
                        mfgDate: '2026-01-01',
                        expiryDate: '2026-12-31',
                        quantity: 20
                    }
                ]
            };

            await processStockTransferReceipt(beforeData, afterData, 'TRF_001');

            const batchDoc = mockStore.batches.get('BATCH-SAM-2026-X');
            assert.ok(batchDoc, "Batch should be preserved in batches collection");
            assert.strictEqual(batchDoc.batchId, 'BATCH-SAM-2026-X');
            assert.strictEqual(batchDoc.stock, 20);
            assert.ok(batchDoc.expiryDate, "Original expiry date preserved");

            const wsRef = mockStore.warehouse_stock.get('SKU_TEST_02_BATCH-SAM-2026-X_HUB_PATNA');
            assert.strictEqual(wsRef.availableStock, 20);
            
            const skuDoc2 = mockStore.skus.get('SKU_TEST_02');
            assert.strictEqual(skuDoc2['inventory.availableStock'], 20);

            pass("2.2 Hub B records exact batch BATCH-SAM-2026-X and Expiry Date with 20 units");

            const movements = Array.from(mockStore.inventory_movements.values());
            const transferReceiptMove = movements.find(m => m.movementType === 'TRANSFER_RECEIPT' && m.referenceId === 'TRF_001');
            assert.strictEqual(transferReceiptMove.quantity, 20);
            pass("2.3 Transfer Receipt audit movement logged in inventory_movements");

        } catch (err) {
            fail("Test 2 Failed", err);
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n==========================================");
    console.log(`INBOUND WMS & FEFO TESTS: ${passed} PASSED, ${failed} FAILED.`);
    console.log("==========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error("FATAL ERROR IN RUNNER:", err);
    process.exit(1);
});

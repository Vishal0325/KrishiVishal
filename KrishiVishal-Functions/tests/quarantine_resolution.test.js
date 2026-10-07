const assert = require('assert');
const adminModule = require('../core/admin');
const { resolveQuarantinedStockLogic } = require('../inventory/quarantineEngine');

console.log("=================================================================");
console.log("=== RUNNING WMS QUARANTINE RESOLUTION (RTV / SCRAP) TEST SUITE ===");
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
            inventory_quarantine: new Map(),
            warehouse_stock: new Map(),
            skus: new Map(),
            batches: new Map(),
            ledger: new Map(),
            accounts: new Map(),
            inventory_movements: new Map()
        };

        adminModule.db.collection = function (collName) {
            return {
                doc: function (docId) {
                    const effectiveId = docId || ('auto_' + Math.random().toString(36).substring(2, 9));
                    let storeGroup = mockStore[collName];
                    if (!storeGroup) {
                        storeGroup = new Map();
                        mockStore[collName] = storeGroup;
                    }

                    return {
                        id: effectiveId,
                        collection: function (subColl) {
                            return adminModule.db.collection(subColl);
                        },
                        get: async function () {
                            const exists = storeGroup.has(effectiveId);
                            return {
                                exists,
                                data: () => storeGroup.get(effectiveId)
                            };
                        },
                        set: async function (data, opts) {
                            const existing = storeGroup.has(effectiveId) ? storeGroup.get(effectiveId) : {};
                            const merged = opts && opts.merge ? { ...existing, ...data } : { ...data };

                            // FieldValue.increment resolution
                            for (const key of Object.keys(data)) {
                                if (data[key] && typeof data[key] === 'object' && data[key].operand !== undefined) {
                                    merged[key] = (existing[key] || 0) + data[key].operand;
                                }
                            }
                            storeGroup.set(effectiveId, merged);
                            return { id: effectiveId };
                        },
                        update: async function (data) {
                            if (!storeGroup.has(effectiveId)) {
                                throw new Error(`Doc not found: ${collName}/${effectiveId}`);
                            }
                            const existing = storeGroup.get(effectiveId);
                            const merged = { ...existing, ...data };

                            for (const key of Object.keys(data)) {
                                if (data[key] && typeof data[key] === 'object' && data[key].operand !== undefined) {
                                    merged[key] = (existing[key] || 0) + data[key].operand;
                                }
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

        // --- SEED BASE DATA FOR TESTS ---
        const seedBase = () => {
            mockStore.inventory_quarantine.clear();
            mockStore.warehouse_stock.clear();
            mockStore.skus.clear();
            mockStore.batches.clear();
            mockStore.ledger.clear();
            mockStore.accounts.clear();
            mockStore.inventory_movements.clear();

            // Seed SKU
            mockStore.skus.set('SKU_QUAR_01', {
                id: 'SKU_QUAR_01',
                costPrice: 500,
                inventory: { availableStock: 100, quarantinedStock: 10, totalStock: 110 }
            });

            // Seed batch subdoc
            mockStore.batches.set('BAT_2026_01', {
                id: 'BAT_2026_01',
                landingCost: 500,
                stock: 100
            });

            // Seed warehouse_stock: docId is `${skuCode}_${batchId}_${warehouseId}`
            mockStore.warehouse_stock.set('SKU_QUAR_01_BAT_2026_01_HUB_SAMASTIPUR', {
                skuCode: 'SKU_QUAR_01',
                batchId: 'BAT_2026_01',
                warehouseId: 'HUB_SAMASTIPUR',
                availableStock: 100,
                quarantinedQty: 10
            });

            // Seed Quarantine Record: 10 units damaged
            mockStore.inventory_quarantine.set('Q_REC_001', {
                id: 'Q_REC_001',
                skuCode: 'SKU_QUAR_01',
                batchId: 'BAT_2026_01',
                hubId: 'HUB_SAMASTIPUR',
                damagedQty: 10,
                resolvedQty: 0,
                damageReason: 'BAG_TORN_IN_TRANSIT',
                status: 'PENDING',
                grnId: 'GRN_1001'
            });
        };

        // =========================================================================
        // CASE 1: RETURN TO VENDOR (RTV) FLOW
        // =========================================================================
        console.log("--- CASE 1: Return to Vendor (RTV) Flow ---");
        try {
            seedBase();

            const result = await resolveQuarantinedStockLogic({
                quarantineId: 'Q_REC_001',
                action: 'RETURN_TO_VENDOR',
                quantity: 5,
                vendorId: 'VEN_IFFCO_01',
                vendorName: 'IFFCO Bihar Depot',
                debitNoteRef: 'DN-2026-001',
                actorId: 'MGR_SAMASTIPUR'
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.resolvedQty, 5);
            assert.strictEqual(result.action, 'RETURN_TO_VENDOR');

            // 1.1 Quarantined stock decreased
            const wsDoc = mockStore.warehouse_stock.get('SKU_QUAR_01_BAT_2026_01_HUB_SAMASTIPUR');
            assert.strictEqual(wsDoc.quarantinedQty, 5, "quarantinedQty must decrease from 10 to 5");
            pass("1.1 Warehouse quarantinedQty accurately decremented by 5");

            // 1.2 Quarantine document updated
            const qDoc = mockStore.inventory_quarantine.get('Q_REC_001');
            assert.strictEqual(qDoc.resolvedQty, 5);
            assert.strictEqual(qDoc.status, 'PARTIALLY_RESOLVED');
            pass("1.2 Quarantine doc resolvedQty set to 5 and status to PARTIALLY_RESOLVED");

            // Complete remaining 5 to test final RETURNED_TO_VENDOR status
            const finishResult = await resolveQuarantinedStockLogic({
                quarantineId: 'Q_REC_001',
                action: 'RETURN_TO_VENDOR',
                quantity: 5,
                debitNoteRef: 'DN-2026-002'
            });
            assert.strictEqual(finishResult.status, 'RETURNED_TO_VENDOR');
            const qDocFinal = mockStore.inventory_quarantine.get('Q_REC_001');
            assert.strictEqual(qDocFinal.status, 'RETURNED_TO_VENDOR');
            assert.strictEqual(qDocFinal.resolvedQty, 10);
            pass("1.3 Final clearance marks status as RETURNED_TO_VENDOR when 100% resolved");

            // 1.4 Double-entry Ledger: Check ACCOUNTS_PAYABLE DEBIT and INVENTORY_QUARANTINE_ASSET CREDIT
            const ledgerEntries = Array.from(mockStore.ledger.values());
            const rtvDebitLeg = ledgerEntries.find(l => l.account === 'ACCOUNTS_PAYABLE' && l.type === 'DEBIT');
            const rtvCreditLeg = ledgerEntries.find(l => l.account === 'INVENTORY_QUARANTINE_ASSET' && l.type === 'CREDIT');

            assert.ok(rtvDebitLeg, "Must record DEBIT to ACCOUNTS_PAYABLE (vendor deduction)");
            assert.ok(rtvCreditLeg, "Must record CREDIT to INVENTORY_QUARANTINE_ASSET");
            assert.strictEqual(rtvDebitLeg.amount, 2500, "Debit amount = 5 units * 500 landing cost = 2500");
            assert.strictEqual(rtvCreditLeg.amount, 2500);
            pass("1.4 Double-entry ledger balanced: Debit ACCOUNTS_PAYABLE (₹2500) == Credit INVENTORY_QUARANTINE_ASSET (₹2500)");

            // 1.5 Movement Log: PURCHASE_RETURN_DEFECTIVE
            const movements = Array.from(mockStore.inventory_movements.values());
            const returnMove = movements.find(m => m.movementType === 'PURCHASE_RETURN_DEFECTIVE');
            assert.ok(returnMove, "Movement PURCHASE_RETURN_DEFECTIVE must be logged");
            assert.strictEqual(returnMove.quantity, 5);
            pass("1.5 Inventory audit movement logged as PURCHASE_RETURN_DEFECTIVE");

        } catch (err) {
            fail("Case 1 Failed", err);
        }

        // =========================================================================
        // CASE 2: WRITE-OFF / SCRAP FLOW
        // =========================================================================
        console.log("\n--- CASE 2: Write-Off / Scrap Flow ---");
        try {
            seedBase();

            const result = await resolveQuarantinedStockLogic({
                quarantineId: 'Q_REC_001',
                action: 'WRITE_OFF',
                quantity: 3,
                writeOffReason: 'Moisture caking beyond salvage',
                actorId: 'AUDITOR_01'
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.resolvedQty, 3);
            assert.strictEqual(result.action, 'WRITE_OFF');

            // 2.1 Quarantined stock decreased from 10 to 7
            const wsDoc = mockStore.warehouse_stock.get('SKU_QUAR_01_BAT_2026_01_HUB_SAMASTIPUR');
            assert.strictEqual(wsDoc.quarantinedQty, 7);
            pass("2.1 Warehouse quarantinedQty decreased by 3 (from 10 to 7)");

            // 2.2 Ledger: Debit INVENTORY_SHRINKAGE_LOSS, Credit INVENTORY_QUARANTINE_ASSET
            const ledgerEntries = Array.from(mockStore.ledger.values());
            const lossDebitLeg = ledgerEntries.find(l => l.account === 'INVENTORY_SHRINKAGE_LOSS' && l.type === 'DEBIT');
            const assetCreditLeg = ledgerEntries.find(l => l.account === 'INVENTORY_QUARANTINE_ASSET' && l.type === 'CREDIT');

            assert.ok(lossDebitLeg, "Must record DEBIT to INVENTORY_SHRINKAGE_LOSS (shrinkage expense)");
            assert.ok(assetCreditLeg, "Must record CREDIT to INVENTORY_QUARANTINE_ASSET");
            assert.strictEqual(lossDebitLeg.amount, 1500, "Loss amount = 3 units * 500 = 1500");
            assert.strictEqual(assetCreditLeg.amount, 1500);
            pass("2.2 Double-entry ledger balanced: Debit INVENTORY_SHRINKAGE_LOSS (₹1500) == Credit INVENTORY_QUARANTINE_ASSET (₹1500)");

            // 2.3 Movement Log: DAMAGE_SCRAP_WRITEOFF
            const movements = Array.from(mockStore.inventory_movements.values());
            const scrapMove = movements.find(m => m.movementType === 'DAMAGE_SCRAP_WRITEOFF');
            assert.ok(scrapMove, "Movement DAMAGE_SCRAP_WRITEOFF must be logged");
            assert.strictEqual(scrapMove.quantity, 3);
            pass("2.3 Inventory audit movement logged as DAMAGE_SCRAP_WRITEOFF");

        } catch (err) {
            fail("Case 2 Failed", err);
        }

        // =========================================================================
        // CASE 3: OVER-CLEARANCE GUARD
        // =========================================================================
        console.log("\n--- CASE 3: Over-Clearance Guard ---");
        try {
            seedBase();

            // Quarantine record only has 10 units. Attempt to resolve 15 units.
            let threw = false;
            try {
                await resolveQuarantinedStockLogic({
                    quarantineId: 'Q_REC_001',
                    action: 'WRITE_OFF',
                    quantity: 15
                });
            } catch (err) {
                threw = true;
                assert(err.message.includes('INSUFFICIENT_QUARANTINE_STOCK'), `Error must contain INSUFFICIENT_QUARANTINE_STOCK: ${err.message}`);
            }

            assert.strictEqual(threw, true, "Must throw INSUFFICIENT_QUARANTINE_STOCK when resolving 15 units from 10");
            pass("3.1 Over-clearance strictly blocked with INSUFFICIENT_QUARANTINE_STOCK");

            // Also test resolving after already fully settled
            await resolveQuarantinedStockLogic({
                quarantineId: 'Q_REC_001',
                action: 'WRITE_OFF',
                quantity: 10
            });

            let settledThrew = false;
            try {
                await resolveQuarantinedStockLogic({
                    quarantineId: 'Q_REC_001',
                    action: 'RETURN_TO_VENDOR',
                    quantity: 1
                });
            } catch (err) {
                settledThrew = true;
                assert(err.message.includes('INVALID_STATE'), `Error must report INVALID_STATE: ${err.message}`);
            }

            assert.strictEqual(settledThrew, true, "Must reject resolution attempt on already WRITTEN_OFF doc");
            pass("3.2 Re-resolution attempt on settled record strictly rejected with INVALID_STATE");

        } catch (err) {
            fail("Case 3 Failed", err);
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================");
    console.log(`QUARANTINE RESOLUTION TESTS: ${passed} PASSED, ${failed} FAILED.`);
    console.log("=================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error("FATAL ERROR IN RUNNER:", err);
    process.exit(1);
});

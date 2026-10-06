const assert = require('assert');
const adminModule = require('../core/admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { allocateStockFEFO, reserveOrderStock } = require('../inventory/inventoryEngine');
const { processStockTransferEWayBill } = require('../inventory/stockTransferTriggers');
const { checkLicenseExpiries } = require('../compliance/licenseExpiryCron');

console.log("=== RUNNING SPRINT 2: SPOKE INVENTORY ISOLATION & STATUTORY AUTOMATION TEST SUITE ===\n");

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

async function runSprint2Tests() {
    // Save original db.collection
    const originalCollection = adminModule.db.collection;

    // In-memory mock database store for collections
    const mockStore = {
        skus: new Map(),
        warehouse_stock: new Map(),
        stock_transfers: new Map(),
        admin_alerts: new Map(),
        agri_licenses: new Map(),
        statutory_licenses: new Map(),
        idempotency_keys: new Map(),
        inventory_movements: new Map()
    };

    function clearStore() {
        for (const key of Object.keys(mockStore)) {
            mockStore[key].clear();
        }
    }

    // Helper to setup mock db.collection
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
                        collectionMap.set(id, { ...existing, ...updates });
                        return { id };
                    },
                    collection: function (subCollName) {
                        // Subcollection handling (e.g. skus/{skuCode}/batches)
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
            },
            add: async function (data) {
                const id = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const record = {
                    ...data,
                    id,
                    createdAt: {
                        toMillis: () => Date.now(),
                        toDate: () => new Date()
                    }
                };
                collectionMap.set(id, record);
                return { id };
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

    try {
        // ─────────────────────────────────────────────────────────────
        // TEST 1: Spoke Inventory Isolation Guard (allocateStockFEFO & reserveOrderStock)
        // ─────────────────────────────────────────────────────────────
        console.log("--- TEST 1: Spoke Inventory Isolation Guard ---");
        try {
            clearStore();

            const testSku = 'FE-URE-GRN-46-050KG-IFF';
            const centralHubId = 'HUB-SAM-001';      // Mother Hub (Central Samastipur)
            const destinationSpokeId = 'REG-RAH-002'; // Destination Spoke Hub (Rahika)

            // Seed SKU
            mockStore.skus.set(testSku, {
                skuCode: testSku,
                isActive: true,
                name: 'Urea Fertilizer 50kg'
            });

            // Seed Batch in skus/{skuCode}/batches
            const batchesKey = `skus_${testSku}_batches`;
            mockStore[batchesKey] = new Map();
            mockStore[batchesKey].set('BATCH_001', {
                batchNumber: 'BATCH-001',
                isActive: true,
                qualityStatus: 'PASSED',
                expiryDate: adminModule.admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 3600 * 1000)
            });

            // Central mother hub HAS 500 units
            mockStore.warehouse_stock.set(`${testSku}_BATCH_001_${centralHubId}`, {
                skuCode: testSku,
                batchId: 'BATCH_001',
                warehouseId: centralHubId,
                availableStock: 500,
                committedStock: 0
            });

            // Destination spoke hub has 0 units (empty / 0 stock)
            mockStore.warehouse_stock.set(`${testSku}_BATCH_001_${destinationSpokeId}`, {
                skuCode: testSku,
                batchId: 'BATCH_001',
                warehouseId: destinationSpokeId,
                availableStock: 0,
                committedStock: 0
            });

            // Mock transaction object
            const mockTransaction = {
                get: async function (target) {
                    if (target.get) return await target.get();
                    return { exists: false, data: () => null };
                },
                set: function (ref, data, opts) {
                    ref.set(data, opts);
                }
            };

            // 1.1: Attempting to allocate from spoke hub with 0 stock MUST throw failed-precondition
            let spokeAllocFailed = false;
            try {
                await allocateStockFEFO(mockTransaction, testSku, 10, destinationSpokeId);
            } catch (err) {
                spokeAllocFailed = true;
                assert(err.message.includes(`Insufficient stock at designated spoke hub: ${destinationSpokeId}`),
                    `Error message must specify spoke hub: ${err.message}`);
                assert.strictEqual(err.code, 'failed-precondition', 'Error code must be failed-precondition');
            }
            assert.strictEqual(spokeAllocFailed, true, 'allocateStockFEFO must reject allocation from spoke hub with 0 units');
            pass("1.1 allocateStockFEFO strictly rejects stock reservation when destination spoke hub has 0 units, even if central mother hub has 500 units");

            // 1.2: Mother hub allocation succeeds for 10 units
            const motherAlloc = await allocateStockFEFO(mockTransaction, testSku, 10, centralHubId);
            assert.strictEqual(motherAlloc.length, 1);
            assert.strictEqual(motherAlloc[0].allocatedQty, 10);
            assert.strictEqual(motherAlloc[0].warehouseId, centralHubId);
            pass("1.2 allocateStockFEFO successfully allocates stock when queried against central mother hub");

            // 1.3: Seed spoke hub with 15 units, then verify spoke allocation succeeds
            mockStore.warehouse_stock.set(`${testSku}_BATCH_001_${destinationSpokeId}`, {
                skuCode: testSku,
                batchId: 'BATCH_001',
                warehouseId: destinationSpokeId,
                availableStock: 15,
                committedStock: 0
            });

            const spokeAllocSuccess = await allocateStockFEFO(mockTransaction, testSku, 10, destinationSpokeId);
            assert.strictEqual(spokeAllocSuccess.length, 1);
            assert.strictEqual(spokeAllocSuccess[0].allocatedQty, 10);
            assert.strictEqual(spokeAllocSuccess[0].warehouseId, destinationSpokeId);
            pass("1.3 allocateStockFEFO allocates strictly from destination spoke hub when spoke has sufficient stock");

        } catch (err) {
            fail("TEST 1 Spoke Inventory Isolation Guard", err);
        }

        // ─────────────────────────────────────────────────────────────
        // TEST 2: onStockTransferUpdated triggers ClearTax E-Way Bill generation (>= ₹50,000)
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- TEST 2: Inter-Hub Dispatch E-Way Bill Auto-Generation (>= ₹50,000) ---");
        try {
            clearStore();

            const transferId = 'TRF_INTERHUB_001';
            mockStore.stock_transfers.set(transferId, {
                status: 'CREATED',
                totalConsignmentValue: 75000,
                originHubGstin: '10AAACK9821M1Z5',
                originHubAddress: 'Samastipur Central Mother Hub',
                originHubPincode: 848101,
                destinationHubGstin: '10AAACK9821M1Z6',
                destinationHubAddress: 'Rahika Spoke Hub, Madhubani',
                destinationHubPincode: 847235,
                vehicleNo: 'BR09GA1234',
                transporterId: 'TR_BIHAR_FAST',
                driverPhone: '9876543210',
                lrNumber: 'LR-2026-9988',
                items: [
                    { skuCode: 'FE-URE-GRN-46-050KG-IFF', quantity: 100, price: 750, hsnCode: '3102' }
                ]
            });

            const beforeData = {
                status: 'CREATED',
                totalConsignmentValue: 75000
            };

            const afterData = {
                ...mockStore.stock_transfers.get(transferId),
                status: 'IN_TRANSIT'
            };

            // Mock ClearTax provider returning SUCCESS
            let capturedPayload = null;
            const mockClearTaxProvider = {
                generateEWayBill: async function (payload) {
                    capturedPayload = payload;
                    return {
                        status: 'SUCCESS',
                        provider: 'CLEARTAX',
                        ewayBillNo: 'EWB_100200300400',
                        validUpto: '2026-10-10 23:59:59',
                        pdfUrl: 'https://cdn.cleartax.in/ewb/100200300400.pdf'
                    };
                }
            };

            const result = await processStockTransferEWayBill(beforeData, afterData, transferId, mockClearTaxProvider);

            assert.strictEqual(result.success, true, 'E-Way bill generation must succeed');
            assert.strictEqual(result.ewayBillNumber, 'EWB_100200300400');
            assert.strictEqual(result.status, 'GENERATED');

            // Verify payload mapping
            assert.strictEqual(capturedPayload.originHubGstin, '10AAACK9821M1Z5');
            assert.strictEqual(capturedPayload.destinationHubGstin, '10AAACK9821M1Z6');
            assert.strictEqual(capturedPayload.vehicleNo, 'BR09GA1234');
            assert.strictEqual(capturedPayload.totalConsignmentValue, 75000);
            assert.strictEqual(capturedPayload.items.length, 1);

            // Verify stock_transfers doc updated
            const updatedTransfer = mockStore.stock_transfers.get(transferId);
            assert.strictEqual(updatedTransfer.ewayBillNumber, 'EWB_100200300400');
            assert.strictEqual(updatedTransfer.ewayBillStatus, 'GENERATED');
            assert.strictEqual(updatedTransfer.ewayBillPdfUrl, 'https://cdn.cleartax.in/ewb/100200300400.pdf');
            pass("2.1 onStockTransferUpdated triggers ClearTax and generates E-Way bill when transfer moves to IN_TRANSIT with total amount >= ₹50,000");

            // 2.2: Test Provider Failure escalates to admin_alerts
            const failTransferId = 'TRF_INTERHUB_FAIL';
            mockStore.stock_transfers.set(failTransferId, {
                status: 'CREATED',
                totalConsignmentValue: 60000,
                vehicleNo: 'BR09GA5678'
            });

            const failingProvider = {
                generateEWayBill: async function () {
                    return {
                        status: 'FAILED',
                        error: { message: 'NIC Portal Timed Out' }
                    };
                }
            };

            const failResult = await processStockTransferEWayBill(
                { status: 'CREATED' },
                { status: 'IN_TRANSIT', totalConsignmentValue: 60000 },
                failTransferId,
                failingProvider
            );

            assert.strictEqual(failResult.success, false);
            assert.strictEqual(failResult.status, 'FAILED');
            assert(mockStore.stock_transfers.get(failTransferId).ewayBillError.includes('NIC Portal Timed Out'));

            // Check admin_alerts escalation
            const alerts = Array.from(mockStore.admin_alerts.values());
            const ewayFailAlert = alerts.find(a => a.type === 'EWAY_BILL_GENERATION_FAILED');
            assert(ewayFailAlert !== undefined, 'Admin alert must be created on E-Way bill generation failure');
            assert.strictEqual(ewayFailAlert.severity, 'HIGH');
            assert.strictEqual(ewayFailAlert.transferId, failTransferId);
            pass("2.2 ClearTax provider failure atomically records FAILED status on transfer and logs HIGH severity escalation to admin_alerts");

        } catch (err) {
            fail("TEST 2 Inter-Hub Dispatch E-Way Bill Auto-Generation", err);
        }

        // ─────────────────────────────────────────────────────────────
        // TEST 3: E-Way Bill Statutory Threshold Guard (< ₹50,000)
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- TEST 3: E-Way Bill Statutory Threshold & Idempotency Guards ---");
        try {
            clearStore();

            const transferId = 'TRF_INTERHUB_LOW_VALUE';
            mockStore.stock_transfers.set(transferId, {
                status: 'CREATED',
                totalConsignmentValue: 35000,
                vehicleNo: 'BR09GA9999'
            });

            let providerCalled = false;
            const mockClearTaxProvider = {
                generateEWayBill: async function () {
                    providerCalled = true;
                    return { status: 'SUCCESS' };
                }
            };

            const beforeData = { status: 'CREATED', totalConsignmentValue: 35000 };
            const afterData = { status: 'IN_TRANSIT', totalConsignmentValue: 35000 };

            const result = await processStockTransferEWayBill(beforeData, afterData, transferId, mockClearTaxProvider);

            assert.strictEqual(result.skipped, true, 'Transfer < ₹50,000 must skip E-Way bill generation');
            assert.strictEqual(result.reason, 'CONSIGNMENT_VALUE_BELOW_THRESHOLD');
            assert.strictEqual(providerCalled, false, 'ClearTax provider must NOT be invoked when value < ₹50,000');
            pass("3.1 onStockTransferUpdated skips E-Way Bill generation when consignment amount is < ₹50,000");

            // 3.2: Idempotency check: Already generated E-Way bill is skipped
            const alreadyGeneratedAfter = {
                status: 'IN_TRANSIT',
                totalConsignmentValue: 80000,
                ewayBillNumber: 'EWB_EXISTING_12345',
                ewayBillStatus: 'GENERATED'
            };

            const idempResult = await processStockTransferEWayBill(beforeData, alreadyGeneratedAfter, transferId, mockClearTaxProvider);
            assert.strictEqual(idempResult.skipped, true);
            assert.strictEqual(idempResult.reason, 'ALREADY_GENERATED');
            assert.strictEqual(providerCalled, false, 'ClearTax provider must NOT be invoked if already generated');
            pass("3.2 Idempotency guard prevents duplicate E-Way bill generation for already generated transfers");

        } catch (err) {
            fail("TEST 3 E-Way Bill Statutory Threshold Guard", err);
        }

        // ─────────────────────────────────────────────────────────────
        // TEST 4: Statutory Agri-License Expiry Engine — Immediate Halting of Expired Licenses
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- TEST 4: Agri-License Expiry Audit — Immediate Halting ---");
        try {
            clearStore();

            const referenceDate = new Date('2026-10-02T10:00:00.000Z');

            // 1. Expired license (expiry date: 2026-09-20, 12 days ago)
            mockStore.agri_licenses.set('LIC_FORM_VIII_EXPIRED', {
                licenseType: 'Form VIII Insecticide License',
                hubId: 'REG-KHA-003',
                hubName: 'Kalyanpur Spoke Hub',
                status: 'ACTIVE',
                expiryDate: new Date('2026-09-20T00:00:00.000Z')
            });

            // 2. Active valid license (expiry date: 2027-03-31, ~180 days in future)
            mockStore.agri_licenses.set('LIC_SEED_VALID', {
                licenseType: 'Seed Dealer License',
                hubId: 'HUB-SAM-001',
                hubName: 'Samastipur Central Hub',
                status: 'ACTIVE',
                expiryDate: new Date('2027-03-31T00:00:00.000Z')
            });

            const summary = await checkLicenseExpiries(referenceDate, ['agri_licenses']);

            assert.strictEqual(summary.scanned, 2, 'Must scan 2 active licenses');
            assert.strictEqual(summary.expired, 1, 'Must identify 1 expired license');

            // Check license doc status was set to EXPIRED
            const expiredLic = mockStore.agri_licenses.get('LIC_FORM_VIII_EXPIRED');
            assert.strictEqual(expiredLic.status, 'EXPIRED', 'Expired license status must be set to EXPIRED');

            // Check valid license doc was NOT changed
            const validLic = mockStore.agri_licenses.get('LIC_SEED_VALID');
            assert.strictEqual(validLic.status, 'ACTIVE', 'Valid license status must remain ACTIVE');

            // Check CRITICAL alert written to admin_alerts
            const alerts = Array.from(mockStore.admin_alerts.values());
            const criticalAlert = alerts.find(a => a.type === 'LICENSE_EXPIRED' && a.licenseId === 'LIC_FORM_VIII_EXPIRED');
            assert(criticalAlert !== undefined, 'Critical alert must be created in admin_alerts for expired license');
            assert.strictEqual(criticalAlert.severity, 'CRITICAL');
            assert.strictEqual(criticalAlert.hubId, 'REG-KHA-003');
            assert(criticalAlert.message.includes('Trading and dispatch must be halted immediately'),
                'Critical alert message must mandate trading and dispatch halt');
            pass("4.1 licenseExpiryCron marks active licenses with past dates as EXPIRED and writes CRITICAL alerts to admin_alerts");

        } catch (err) {
            fail("TEST 4 Agri-License Expiry Audit", err);
        }

        // ─────────────────────────────────────────────────────────────
        // TEST 5: Statutory Agri-License Expiry Engine — 30-Day Warning and 7-Day Deduplication Window
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- TEST 5: Agri-License Warning Thresholds & Deduplication Window ---");
        try {
            clearStore();

            const referenceDate = new Date('2026-10-02T10:00:00.000Z');

            // 1. License expiring in 25 days (threshold THIRTY_DAYS)
            mockStore.agri_licenses.set('LIC_FERT_WARN_25D', {
                licenseType: 'Fertilizer Form A/O',
                hubId: 'REG-RAH-002',
                hubName: 'Rahika Spoke Hub',
                status: 'ACTIVE',
                expiryDate: new Date('2026-10-27T10:00:00.000Z') // 25 days
            });

            // 2. License expiring in 10 days (threshold FIFTEEN_DAYS)
            mockStore.statutory_licenses.set('LIC_SEED_WARN_10D', {
                licenseType: 'Seed Retail License',
                hubId: 'REG-TAJ-004',
                hubName: 'Tajpur Spoke Hub',
                status: 'ACTIVE',
                expiryDate: new Date('2026-10-12T10:00:00.000Z') // 10 days
            });

            // First run on Day 0
            const run1 = await checkLicenseExpiries(referenceDate, ['agri_licenses', 'statutory_licenses']);
            assert.strictEqual(run1.scanned, 2);
            assert.strictEqual(run1.warningAlertsCreated, 2);
            assert.strictEqual(run1.dedupedWarnings, 0);

            const alerts1 = Array.from(mockStore.admin_alerts.values());
            const alert30 = alerts1.find(a => a.licenseId === 'LIC_FERT_WARN_25D');
            assert(alert30 !== undefined, '30-day warning alert must be created');
            assert.strictEqual(alert30.threshold, 'THIRTY_DAYS');
            assert.strictEqual(alert30.severity, 'HIGH');
            assert.strictEqual(alert30.daysRemaining, 25);
            assert(alert30.recipientRoles.includes('ComplianceOfficer'));

            const alert15 = alerts1.find(a => a.licenseId === 'LIC_SEED_WARN_10D');
            assert(alert15 !== undefined, '15-day warning alert must be created');
            assert.strictEqual(alert15.threshold, 'FIFTEEN_DAYS');
            assert.strictEqual(alert15.severity, 'HIGH');
            assert.strictEqual(alert15.daysRemaining, 10);
            pass("5.1 licenseExpiryCron triggers 30-day and 15-day warning alerts with HIGH severity and compliance metadata");

            // Second run 2 days later (Day 2: well within 7-day deduplication window)
            const day2 = new Date('2026-10-04T10:00:00.000Z');
            const run2 = await checkLicenseExpiries(day2, ['agri_licenses', 'statutory_licenses']);

            assert.strictEqual(run2.warningAlertsCreated, 0, 'No new warning alerts should be created within 7-day window');
            assert.strictEqual(run2.dedupedWarnings, 2, 'Both licenses should be deduplicated');
            assert.strictEqual(mockStore.admin_alerts.size, 2, 'Total alerts in admin_alerts must still be exactly 2');
            pass("5.2 licenseExpiryCron strictly enforces 7-day deduplication window preventing duplicate notification flooding");

        } catch (err) {
            fail("TEST 5 Agri-License Warning Thresholds & Deduplication Window", err);
        }

    } finally {
        // Restore original collection
        adminModule.db.collection = originalCollection;
    }

    console.log("\n=======================================================");
    console.log(`SPRINT 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint2Tests().catch(err => {
    console.error("FATAL ERROR in Sprint 2 Test Suite:", err);
    process.exit(1);
});

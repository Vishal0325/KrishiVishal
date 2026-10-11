/**
 * KrishiVishal - CA Mock Audit Data Isolation Test Suite
 * 
 * Verifies that:
 * 1. ORD-TEST-001, 002, 003 are excluded from statutory Trial Balance, P&L, and GSTR-1 by default.
 * 2. GRN-TEST-001 and JE-2026-04-GRN-001 are excluded from statutory Trial Balance.
 * 3. Credit Note KV/CN/26-27/00001 is excluded from statutory GSTR-1.
 * 4. Legitimate customer orders, supplier purchases, credit notes, and journals remain included.
 * 5. When includeSimulations === true, simulation fixtures are accurately processed.
 * 6. Trial Balance mathematical balance (Debits === Credits) holds in both statutory and simulation modes.
 */

const assert = require('assert');
const adminModule = require('../core/admin');
const { generateTrialBalance, generateProfitAndLoss, generateBalanceSheet } = require('../finance/financialReports');
const { generateGstr1Summary } = require('../tax/gstrReportEngine');
const { isSimulationJournalEntry, isSimulationOrder, isSimulationCreditNote } = require('../finance/simulationClassifier');

console.log("==========================================================================");
console.log("=== RUNNING CA MOCK AUDIT DATA ISOLATION TEST SUITE ===");
console.log("==========================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err?.message || err}`);
    failed++;
}

async function runIsolationTestSuite() {
    const originalCollection = adminModule.db.collection;

    try {
        // Build in-memory Firestore mock store
        const store = {
            journal_entries: new Map(),
            orders: new Map(),
            credit_notes: new Map()
        };

        function createMockDocRef(colName, docId) {
            const table = store[colName] || (store[colName] = new Map());
            return {
                id: docId,
                collection: (subName) => ({
                    get: async () => {
                        // lines subcollection mock
                        const parent = table.get(docId) || {};
                        const lines = parent.lines || [];
                        return {
                            empty: lines.length === 0,
                            size: lines.length,
                            docs: lines.map((l, i) => ({
                                id: `L_${i}`,
                                data: () => l
                            }))
                        };
                    }
                }),
                get: async () => ({
                    exists: table.has(docId),
                    id: docId,
                    data: () => table.get(docId)
                }),
                set: async (data) => {
                    table.set(docId, data);
                    return true;
                }
            };
        }

        adminModule.db.collection = (colName) => {
            const table = store[colName] || (store[colName] = new Map());
            return {
                doc: (id) => createMockDocRef(colName, id),
                where: function(field, op, val) {
                    let filters = [{ field, op, val }];
                    const queryObj = {
                        where: function(f2, op2, val2) {
                            filters.push({ field: f2, op: op2, val: val2 });
                            return queryObj;
                        },
                        get: async () => {
                            let docs = Array.from(table.entries()).map(([id, data]) => ({
                                id,
                                ref: createMockDocRef(colName, id),
                                data: () => data
                            }));

                            for (const f of filters) {
                                docs = docs.filter(d => {
                                    const item = d.data();
                                    return item[f.field] === f.val;
                                });
                            }

                            return {
                                empty: docs.length === 0,
                                size: docs.length,
                                docs
                            };
                        }
                    };
                    return queryObj;
                },
                get: async () => {
                    const docs = Array.from(table.entries()).map(([id, data]) => ({
                        id,
                        ref: createMockDocRef(colName, id),
                        data: () => data
                    }));
                    return { empty: docs.length === 0, size: docs.length, docs };
                }
            };
        };

        // Populate fixtures:
        // 1. Simulation Fixtures (Period 2026-04)
        store.journal_entries.set('JE-2026-04-ORD-001', {
            id: 'JE-2026-04-ORD-001',
            orderId: 'ORD-TEST-001',
            refType: 'SALES_DELIVERY',
            refNumber: 'KV/26-27/00001',
            periodId: '2026-04',
            lines: [
                { accountCode: '2070_DEFERRED_REVENUE', debit: 2520, credit: 0 },
                { accountCode: '4010_SALES_AGRI_INPUTS', debit: 0, credit: 2400 },
                { accountCode: '2020_OUTPUT_CGST_PAYABLE', debit: 0, credit: 60 },
                { accountCode: '2030_OUTPUT_SGST_PAYABLE', debit: 0, credit: 60 },
                { accountCode: '5010_COGS_AGRI_INPUTS', debit: 1800, credit: 0 },
                { accountCode: '1040_INVENTORY_MAIN_HUB', debit: 0, credit: 1800 }
            ]
        });

        store.journal_entries.set('JE-2026-04-ORD-002', {
            id: 'JE-2026-04-ORD-002',
            orderId: 'ORD-TEST-002',
            refType: 'SALES_DELIVERY',
            refNumber: 'KV/26-27/00002',
            periodId: '2026-04',
            lines: [
                { accountCode: '1010_CASH_IN_HAND_RIDERS', debit: 1888, credit: 0 },
                { accountCode: '4010_SALES_AGRI_INPUTS', debit: 0, credit: 1600 },
                { accountCode: '2020_OUTPUT_CGST_PAYABLE', debit: 0, credit: 144 },
                { accountCode: '2030_OUTPUT_SGST_PAYABLE', debit: 0, credit: 144 },
                { accountCode: '5010_COGS_AGRI_INPUTS', debit: 1120, credit: 0 },
                { accountCode: '1040_INVENTORY_MAIN_HUB', debit: 0, credit: 1120 }
            ]
        });

        store.journal_entries.set('JE-2026-04-GRN-001', {
            id: 'JE-2026-04-GRN-001',
            refNumber: 'GRN-TEST-001',
            refType: 'PURCHASE_GRN',
            periodId: '2026-04',
            lines: [
                { accountCode: '1040_INVENTORY_MAIN_HUB', debit: 80952.38, credit: 0 },
                { accountCode: '1040_INPUT_CGST_RECOVERY', debit: 2023.81, credit: 0 },
                { accountCode: '1041_INPUT_SGST_RECOVERY', debit: 2023.81, credit: 0 },
                { accountCode: '2050_TDS_PAYABLE_194Q', debit: 0, credit: 35.00 },
                { accountCode: '2010_ACCOUNTS_PAYABLE_SUPPLIERS', debit: 0, credit: 84965.00 }
            ]
        });

        // Orders
        store.orders.set('ORD-TEST-001', {
            orderId: 'ORD-TEST-001',
            financialPeriodId: '2026-04',
            financialStatus: 'RECOGNIZED',
            invoiceNumber: 'KV/26-27/00001',
            shippingState: 'Bihar',
            items: [{ skuId: 'FERT-DAP', hsnCode: '3105', quantity: 2, taxablePrice: 1200, cgstAmount: 60, sgstAmount: 60 }]
        });

        store.orders.set('ORD-TEST-002', {
            orderId: 'ORD-TEST-002',
            financialPeriodId: '2026-04',
            financialStatus: 'RECOGNIZED',
            invoiceNumber: 'KV/26-27/00002',
            shippingState: 'Bihar',
            items: [{ skuId: 'PEST-CYPER', hsnCode: '3808', quantity: 4, taxablePrice: 400, cgstAmount: 144, sgstAmount: 144 }]
        });

        store.credit_notes.set('KV_CN_26-27_00001', {
            creditNoteNumber: 'KV/CN/26-27/00001',
            creditNoteNo: 'KV/CN/26-27/00001',
            orderId: 'ORD-TEST-003',
            financialPeriodId: '2026-04',
            status: 'ISSUED',
            taxableAmount: 600,
            items: [{ skuId: 'SEED-PADDY', hsnCode: '1209', quantity: 1, taxableAmount: 600, cgstAmount: 0, sgstAmount: 0 }]
        });

        // 2. Real Customer & Supplier Legitimate Records (Period 2026-04)
        store.journal_entries.set('JE_REAL_CUST_001', {
            id: 'JE_REAL_CUST_001',
            orderId: 'KV-ORD-987654',
            refType: 'ORDER_DELIVERY',
            refNumber: 'KV/26-27/00500',
            periodId: '2026-04',
            lines: [
                { accountCode: '1010_CASH_IN_HAND_RIDERS', debit: 1050, credit: 0 },
                { accountCode: '4010_SALES_AGRI_INPUTS', debit: 0, credit: 1000 },
                { accountCode: '2020_OUTPUT_CGST_PAYABLE', debit: 0, credit: 25 },
                { accountCode: '2030_OUTPUT_SGST_PAYABLE', debit: 0, credit: 25 },
                { accountCode: '5010_COGS_AGRI_INPUTS', debit: 700, credit: 0 },
                { accountCode: '1040_INVENTORY_MAIN_HUB', debit: 0, credit: 700 }
            ]
        });

        store.orders.set('KV-ORD-987654', {
            orderId: 'KV-ORD-987654',
            financialPeriodId: '2026-04',
            financialStatus: 'RECOGNIZED',
            invoiceNumber: 'KV/26-27/00500',
            shippingState: 'Bihar',
            items: [{ skuId: 'REAL-NEEM-OIL', hsnCode: '3808', quantity: 2, taxablePrice: 500, cgstAmount: 25, sgstAmount: 25 }]
        });

        store.credit_notes.set('KVCN-REAL-001', {
            creditNoteNumber: 'KVCN/26-27/00099',
            creditNoteNo: 'KVCN/26-27/00099',
            orderId: 'KV-ORD-987654',
            financialPeriodId: '2026-04',
            status: 'ISSUED',
            taxableAmount: 200,
            items: [{ skuId: 'REAL-NEEM-OIL', hsnCode: '3808', quantity: 1, taxableAmount: 200, cgstAmount: 5, sgstAmount: 5 }]
        });

        // --- TEST 1: Classification Helper Accuracy ---
        try {
            assert.strictEqual(isSimulationJournalEntry({ orderId: 'ORD-TEST-002' }), true);
            assert.strictEqual(isSimulationJournalEntry({ refNumber: 'GRN-TEST-001' }), true);
            assert.strictEqual(isSimulationJournalEntry({}, 'JE-2026-04-ORD-001'), true);
            assert.strictEqual(isSimulationJournalEntry({ isSimulation: true }), true);
            assert.strictEqual(isSimulationJournalEntry({ orderId: 'KV-ORD-987654' }), false);

            assert.strictEqual(isSimulationOrder({ orderId: 'ORD-TEST-001' }), true);
            assert.strictEqual(isSimulationOrder({ orderId: 'KV-ORD-987654' }), false);

            assert.strictEqual(isSimulationCreditNote({ orderId: 'ORD-TEST-003' }), true);
            assert.strictEqual(isSimulationCreditNote({ creditNoteNumber: 'KVCN/26-27/00099' }), false);

            pass("1. Simulation Classifier correctly identifies all test fixtures without false positives");
        } catch (err) {
            fail("1. Simulation Classifier", err);
        }

        // --- TEST 2: Statutory Trial Balance Excludes Simulations by Default ---
        try {
            const tbStatutory = await generateTrialBalance({ periodId: '2026-04' });
            // Only JE_REAL_CUST_001 should be present: Total Debits = 1050 + 700 = 1750
            assert.strictEqual(tbStatutory.totalDebits, 1750.00);
            assert.strictEqual(tbStatutory.totalCredits, 1750.00);
            assert.strictEqual(tbStatutory.isBalanced, true);
            pass("2. Statutory Trial Balance excludes ORD-TEST and GRN-TEST entries (Debits ₹1,750 == Credits ₹1,750)");
        } catch (err) {
            fail("2. Statutory Trial Balance exclusion", err);
        }

        // --- TEST 3: Statutory P&L Excludes Simulations by Default ---
        try {
            const pnlStatutory = await generateProfitAndLoss({ periodId: '2026-04' });
            // Legitimate sales = 1000, COGS = 700, GP = 300
            assert.strictEqual(pnlStatutory.grossRevenue, 1000.00);
            assert.strictEqual(pnlStatutory.cogs, 700.00);
            assert.strictEqual(pnlStatutory.grossProfit, 300.00);
            pass("3. Statutory P&L excludes ORD-TEST sales & COGS (Revenue ₹1,000, COGS ₹700, GP ₹300)");
        } catch (err) {
            fail("3. Statutory P&L exclusion", err);
        }

        // --- TEST 4: Statutory GSTR-1 Excludes Simulation Orders & Credit Notes ---
        try {
            const gstrStatutory = await generateGstr1Summary({ periodId: '2026-04' });
            // Only KV-ORD-987654 (Taxable 1000, Tax 50) net of KVCN-REAL-001 (Taxable 200, Tax 10)
            assert.strictEqual(gstrStatutory.totalTaxableValue, 800.00);
            assert.strictEqual(gstrStatutory.totalTaxLiability, 40.00);
            assert.strictEqual(gstrStatutory.table13Documents.invoices.totalIssued, 1);
            assert.strictEqual(gstrStatutory.table13Documents.creditNotes.totalIssued, 1);
            pass("4. Statutory GSTR-1 excludes ORD-TEST invoices and KV/CN/26-27/00001 (Net Taxable ₹800, Tax ₹40)");
        } catch (err) {
            fail("4. Statutory GSTR-1 exclusion", err);
        }

        // --- TEST 5: Internal Audit Mode (includeSimulations = true) ---
        try {
            const tbAudit = await generateTrialBalance({ periodId: '2026-04', includeSimulations: true });
            // Includes all 3 simulation entries + 1 real entry
            assert(tbAudit.totalDebits > 1750.00);
            assert.strictEqual(tbAudit.isBalanced, true);

            const pnlAudit = await generateProfitAndLoss({ periodId: '2026-04', includeSimulations: true });
            assert(pnlAudit.grossRevenue >= 5000.00);

            const gstrAudit = await generateGstr1Summary({ periodId: '2026-04', includeSimulations: true });
            assert(gstrAudit.table13Documents.invoices.totalIssued >= 3);

            pass("5. Internal Audit Mode (includeSimulations: true) includes simulation fixtures and maintains mathematical balance");
        } catch (err) {
            fail("5. Internal Audit Mode", err);
        }

    } finally {
        adminModule.db.collection = originalCollection;
    }
}

runIsolationTestSuite().then(() => {
    console.log(`\n==========================================================================`);
    console.log(`TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================================================\n`);
    if (failed > 0) process.exit(1);
});

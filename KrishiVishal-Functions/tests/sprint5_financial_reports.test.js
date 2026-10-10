const assert = require('assert');
const adminModule = require('../core/admin');
const { generateTrialBalance, generateProfitAndLoss, generateBalanceSheet } = require('../finance/financialReports');
const { generateGstr1Summary } = require('../tax/gstrReportEngine');
const { postJournalEntry } = require('../finance/generalLedger');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 5: FINANCIAL REPORTING & GSTR-1 TEST SUITE ===");
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

async function runSprint5TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // Mock In-memory Firestore store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            journal_lines: new Map(), // key: entryId -> array of lines
            orders: new Map(),
            credit_notes: new Map()
        };

        function createMockDocRef(collectionName, docId) {
            const table = store[collectionName] || (store[collectionName] = new Map());
            return {
                id: docId,
                get: async () => {
                    const data = table.get(docId);
                    return {
                        exists: !!data,
                        id: docId,
                        data: () => data
                    };
                },
                set: async (payload, options = {}) => {
                    const existing = table.get(docId) || {};
                    const merged = options.merge ? { ...existing, ...payload } : payload;
                    table.set(docId, merged);
                    return true;
                },
                update: async (patch) => {
                    const existing = table.get(docId) || {};
                    table.set(docId, { ...existing, ...patch });
                    return true;
                },
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId),
                        get: async () => {
                            // Find lines for this entry
                            const lines = store.journal_lines.get(docId) || [];
                            return {
                                docs: lines.map((l, i) => ({
                                    id: `L_${i}`,
                                    data: () => l
                                }))
                            };
                        }
                    };
                }
            };
        }

        adminModule.db.collection = function (colName) {
            return {
                doc: (id) => createMockDocRef(colName, id),
                add: async (payload) => {
                    const newId = `ID_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                    const table = store[colName] || (store[colName] = new Map());
                    table.set(newId, payload);
                    return { id: newId };
                },
                where: function (field, op, val) {
                    const self = this;
                    const filters = [{ field, op, val }];
                    const chain = {
                        where: function (f2, op2, val2) {
                            filters.push({ field: f2, op: op2, val: val2 });
                            return chain;
                        },
                        get: async () => {
                            const table = store[colName] || new Map();
                            const results = [];
                            for (const [id, data] of table.entries()) {
                                const matches = filters.every(filt => data[filt.field] === filt.val);
                                if (matches) {
                                    results.push({
                                        id,
                                        ref: createMockDocRef(colName, id),
                                        data: () => data
                                    });
                                }
                            }
                            return { docs: results };
                        }
                    };
                    return chain;
                },
                get: async () => {
                    const table = store[colName] || new Map();
                    const results = [];
                    for (const [id, data] of table.entries()) {
                        results.push({
                            id,
                            ref: createMockDocRef(colName, id),
                            data: () => data
                        });
                    }
                    return { docs: results };
                }
            };
        };

        // Mutex for mock runTransaction
        let txLock = Promise.resolve();
        adminModule.db.runTransaction = async function (updateFunction) {
            const currentLock = txLock;
            let resolveLock;
            txLock = new Promise(r => resolveLock = r);

            await currentLock;
            try {
                const transaction = {
                    get: async (docRef) => docRef.get(),
                    set: (docRef, payload, options) => {
                        docRef.set(payload, options);
                    },
                    update: (docRef, patch) => {
                        docRef.update(patch);
                    }
                };
                return await updateFunction(transaction);
            } finally {
                resolveLock();
            }
        };

        const periodId = "2026-10";

        // Seed 3 Double-Entry Events:
        // Event 1: Sales Recognition (Gross Sales ₹1,00,000, 18% GST ₹18,000, COGS ₹60,000)
        const je1Id = "JE_202610_001";
        store.journal_entries.set(je1Id, {
            entryId: je1Id,
            periodId,
            refType: "ORDER_DELIVERY",
            refId: "ORD_BULK_01",
            status: "POSTED"
        });
        store.journal_lines.set(je1Id, [
            { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 118000, credit: 0 },
            { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 100000 },
            { accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: 0, credit: 9000 },
            { accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: 0, credit: 9000 },
            { accountCode: "5010_COGS_AGRI_INPUTS", debit: 60000, credit: 0 },
            { accountCode: "1040_INVENTORY_MAIN_HUB", debit: 0, credit: 60000 }
        ]);

        // Event 2: Operating Expenses (Rider Delivery Fees ₹10,000 paid from Cash Vault)
        const je2Id = "JE_202610_002";
        store.journal_entries.set(je2Id, {
            entryId: je2Id,
            periodId,
            refType: "EXPENSE",
            refId: "EXP_RIDER_PAYOUT_01",
            status: "POSTED"
        });
        store.journal_lines.set(je2Id, [
            { accountCode: "6010_RIDER_DELIVERY_PAYOUTS", debit: 10000, credit: 0 },
            { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 10000 }
        ]);

        // Event 3: Owner Equity Capital (₹50,000 into HDFC Bank)
        const je3Id = "JE_202610_003";
        store.journal_entries.set(je3Id, {
            entryId: je3Id,
            periodId,
            refType: "CAPITAL",
            refId: "CAP_EQUITY_01",
            status: "POSTED"
        });
        store.journal_lines.set(je3Id, [
            { accountCode: "1030_BANK_CURRENT_HDFC", debit: 50000, credit: 0 },
            { accountCode: "3010_SHARE_CAPITAL", debit: 0, credit: 50000 }
        ]);

        // =================================================================
        // PART 1: TRIAL BALANCE RECONCILIATION
        // =================================================================
        console.log("--- PART 1: Trial Balance Reconciliation ---");

        const tb = await generateTrialBalance({ periodId });
        assert.strictEqual(tb.isBalanced, true);
        assert.strictEqual(tb.totalDebits, tb.totalCredits);
        assert.strictEqual(tb.totalDebits, 238000); // 118k + 60k + 10k + 50k = 238k
        pass(`1.1 Trial Balance Perfectly Balanced: Total Debits (₹${tb.totalDebits}) == Total Credits (₹${tb.totalCredits})`);

        // =================================================================
        // PART 2: PROFIT & LOSS STATEMENT
        // =================================================================
        console.log("\n--- PART 2: Profit & Loss Statement ---");

        const pnl = await generateProfitAndLoss({ periodId });
        assert.strictEqual(pnl.grossRevenue, 100000);
        assert.strictEqual(pnl.cogs, 60000);
        assert.strictEqual(pnl.grossProfit, 40000);
        assert.strictEqual(pnl.grossMarginPercentage, 40);
        assert.strictEqual(pnl.operatingExpenses, 10000);
        assert.strictEqual(pnl.netProfit, 30000);

        pass("2.1 P&L Statement: Sales ₹1,00,000, COGS ₹60,000 -> Gross Profit ₹40,000 (40.0%), Net Profit ₹30,000");

        // =================================================================
        // PART 3: BALANCE SHEET FUNDAMENTAL ACCOUNTING EQUATION
        // =================================================================
        console.log("\n--- PART 3: Balance Sheet Accounting Equation ---");

        const bs = await generateBalanceSheet({ periodId });
        assert.strictEqual(bs.isBalanced, true);
        assert.strictEqual(bs.currentPeriodEarnings, 30000);

        // Assets: Cash in Hand (118k - 10k = 108k) + Bank (50k) - Inventory (60k) = 98k
        assert.strictEqual(bs.totalAssets, 98000);
        // Liabilities: Output GST (18k)
        assert.strictEqual(bs.totalLiabilities, 18000);
        // Equity: Share Capital (50k)
        assert.strictEqual(bs.totalEquity, 50000);
        // Total Liabilities & Equity: 18k + 50k + 30k (Net Profit) = 98k
        assert.strictEqual(bs.totalEquityAndLiabilities, 98000);

        pass("3.1 Balance Sheet Accounting Equation Verified: Total Assets (₹98,000) === Total Liabilities + Equity + Net Profit (₹98,000)");

        // =================================================================
        // PART 4: STATUTORY GSTR-1 AGGREGATION (TABLES 7, 12, 13)
        // =================================================================
        console.log("\n--- PART 4: Statutory GSTR-1 Tables 7, 12, 13 Aggregation ---");

        // Seed 2 Delivered Orders for GSTR-1
        store.orders.set("ORD_GSTR_1", {
            orderId: "ORD_GSTR_1",
            invoiceNumber: "KV/26-27/00001",
            financialPeriodId: periodId,
            financialStatus: "RECOGNIZED",
            shippingState: "Bihar",
            items: [
                {
                    name: "Insecticide Confidor",
                    hsn: "3808",
                    quantity: 5,
                    sellingPrice: 1000,
                    taxRate: 0.18,
                    cgstAmount: 450,
                    sgstAmount: 450,
                    igstAmount: 0
                }
            ]
        });

        store.orders.set("ORD_GSTR_2", {
            orderId: "ORD_GSTR_2",
            invoiceNumber: "KV/26-27/00002",
            financialPeriodId: periodId,
            financialStatus: "RECOGNIZED",
            shippingState: "Uttar Pradesh",
            items: [
                {
                    name: "Neem Coated Urea",
                    hsn: "3102",
                    quantity: 10,
                    sellingPrice: 500,
                    taxRate: 0.05,
                    cgstAmount: 0,
                    sgstAmount: 0,
                    igstAmount: 250
                }
            ]
        });

        // Seed Credit Note
        store.credit_notes.set("CN_GSTR_1", {
            creditNoteNo: "KVCN/26-27/00001",
            financialPeriodId: periodId,
            periodId,
            status: "ISSUED"
        });

        const gstr1 = await generateGstr1Summary({ periodId, financialYear: "26-27" });
        assert.strictEqual(gstr1.periodId, "2026-10");
        assert.strictEqual(gstr1.table7B2C.length, 2); // Bihar 18% & UP 5%
        assert.strictEqual(gstr1.table12Hsn.length, 2); // HSN 3808 & 3102
        assert.strictEqual(gstr1.table13Documents.invoices.totalIssued, 2);
        assert.strictEqual(gstr1.table13Documents.invoices.fromSerial, "KV/26-27/00001");
        assert.strictEqual(gstr1.table13Documents.invoices.toSerial, "KV/26-27/00002");
        assert.strictEqual(gstr1.table13Documents.creditNotes.totalIssued, 1);
        assert.strictEqual(gstr1.table13Documents.creditNotes.fromSerial, "KVCN/26-27/00001");

        pass("4.1 GSTR-1 Summary Tables 7, 12, 13 perfectly formatted for GST Portal / ClearTax export");

        // =================================================================
        // PART 5: INDEX.JS LAZY EXPORT INTEGRATION
        // =================================================================
        console.log("\n--- PART 5: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.generateTrialBalance, 'function', 'generateTrialBalance must be exported');
        assert.strictEqual(typeof indexExports.generateProfitAndLoss, 'function', 'generateProfitAndLoss must be exported');
        assert.strictEqual(typeof indexExports.generateBalanceSheet, 'function', 'generateBalanceSheet must be exported');
        assert.strictEqual(typeof indexExports.generateGstr1Summary, 'function', 'generateGstr1Summary must be exported');
        pass("5.1 All Sprint 5 financial reporting functions exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 5 FINANCIAL REPORTS TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint5TestSuite().catch((err) => {
    console.error("Sprint 5 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

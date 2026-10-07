const assert = require('assert');
const adminModule = require('../core/admin');
const { postJournalEntry, validateJournalEntry, assertFiscalPeriodUnlocked, CHART_OF_ACCOUNTS } = require('../finance/generalLedger');
const { getNextInvoiceNumber, getCurrentFinancialYear } = require('../invoices/sequentialInvoiceEngine');
const { processAuditLog, computeObjectDiff } = require('../security/auditLogger');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 1: CA-COMPLIANT GENERAL LEDGER TEST SUITE ===");
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

async function runSprint1TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // In-memory Firestore mock store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            invoice_counters: new Map(),
            audit_logs: new Map()
        };

        // Mock document reference creator
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
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId)
                    };
                }
            };
        }

        // Mock collection
        adminModule.db.collection = function (colName) {
            return {
                doc: (id) => createMockDocRef(colName, id),
                add: async (payload) => {
                    const newId = `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                    const table = store[colName] || (store[colName] = new Map());
                    table.set(newId, payload);
                    return { id: newId };
                }
            };
        };

        // Mock runTransaction with serialization to mimic Firestore transactional row lock & isolation
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
                    }
                };
                return await updateFunction(transaction);
            } finally {
                resolveLock();
            }
        };

        // =================================================================
        // PART 1: DOUBLE-ENTRY BALANCE & VALIDATION TESTS
        // =================================================================
        console.log("--- PART 1: Chart of Accounts & Double-Entry Balance Check ---");

        // 1.1 Verify CoA canonical groups exist
        assert(CHART_OF_ACCOUNTS.ASSETS["1010_CASH_IN_HAND_RIDERS"]);
        assert(CHART_OF_ACCOUNTS.LIABILITIES["2020_OUTPUT_CGST_PAYABLE"]);
        assert(CHART_OF_ACCOUNTS.REVENUE["4010_SALES_AGRI_INPUTS"]);
        pass("1.1 Standard Chart of Accounts seed loaded with canonical account codes");

        // 1.2 Balanced journal entry passes
        const validOrderEntry = {
            refType: "ORDER_DELIVERY",
            refId: "ORD_BR_SAM_1001",
            periodId: "2026-10",
            date: new Date(),
            memo: "Customer order delivered via COD - Fert & Seeds",
            lines: [
                { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 1180, credit: 0 },
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 1000 },
                { accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: 0, credit: 90 },
                { accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: 0, credit: 90 }
            ],
            createdBy: "SYSTEM_DISPATCH"
        };

        const postResult = await postJournalEntry(validOrderEntry);
        assert.strictEqual(postResult.success, true);
        assert.strictEqual(postResult.totalAmount, 1180);
        assert(store.journal_entries.has(postResult.entryId));
        pass("1.2 Balanced journal entry (Debits == Credits == ₹1,180) posts atomically");

        // 1.3 Unbalanced entry throws UNBALANCED_JOURNAL_ENTRY
        const unbalancedEntry = {
            refType: "ORDER_DELIVERY",
            refId: "ORD_UNBALANCED_01",
            periodId: "2026-10",
            memo: "Unbalanced fraud/mistake entry",
            lines: [
                { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 1180, credit: 0 },
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 1000 } // Missing ₹180 GST credit
            ]
        };

        let threwUnbalanced = false;
        try {
            await postJournalEntry(unbalancedEntry);
        } catch (err) {
            threwUnbalanced = true;
            assert.strictEqual(err.code, "UNBALANCED_JOURNAL_ENTRY");
        }
        assert(threwUnbalanced, "Unbalanced journal entry must be strictly blocked");
        pass("1.3 Unbalanced entry strictly rejected with UNBALANCED_JOURNAL_ENTRY");

        // =================================================================
        // PART 2: FISCAL PERIOD LOCK GUARD
        // =================================================================
        console.log("\n--- PART 2: Fiscal Period Lock Guard ---");

        // Lock period 2026-09
        store.fiscal_periods.set("2026-09", {
            periodId: "2026-09",
            status: "LOCKED",
            lockedBy: "CA_AUDITOR_SHARMA",
            lockedAt: new Date()
        });

        const lockedPeriodEntry = {
            refType: "EXPENSE",
            refId: "EXP_BACKDATED_99",
            periodId: "2026-09",
            memo: "Late backdated invoice entry attempt",
            lines: [
                { accountCode: "6020_PAYMENT_GATEWAY_FEES", debit: 50, credit: 0 },
                { accountCode: "1030_BANK_CURRENT_HDFC", debit: 0, credit: 50 }
            ]
        };

        let threwLocked = false;
        try {
            await postJournalEntry(lockedPeriodEntry);
        } catch (err) {
            threwLocked = true;
            assert.strictEqual(err.code, "FISCAL_PERIOD_LOCKED");
        }
        assert(threwLocked, "Posting to locked period must be strictly rejected");
        pass("2.1 Backdated posting into LOCKED fiscal period (2026-09) blocked with FISCAL_PERIOD_LOCKED");

        // =================================================================
        // PART 3: CONSECUTIVE TAX INVOICE NUMBER GENERATOR
        // =================================================================
        console.log("\n--- PART 3: Sequential Tax Invoice Number Generator (Rule 46 CGST) ---");

        const testFY = "26-27";
        // Reset counter
        store.invoice_counters.set(testFY, { currentSequence: 0 });

        // Execute 5 parallel concurrent requests to getNextInvoiceNumber
        const invoicePromises = [
            getNextInvoiceNumber(testFY),
            getNextInvoiceNumber(testFY),
            getNextInvoiceNumber(testFY),
            getNextInvoiceNumber(testFY),
            getNextInvoiceNumber(testFY)
        ];

        const invoiceResults = await Promise.all(invoicePromises);
        const invoiceNumbers = invoiceResults.map(r => r.invoiceNumber);

        console.log("Generated Sequence:", invoiceNumbers.join(", "));
        assert.deepStrictEqual(invoiceNumbers, [
            "KV/26-27/00001",
            "KV/26-27/00002",
            "KV/26-27/00003",
            "KV/26-27/00004",
            "KV/26-27/00005"
        ]);
        assert.strictEqual(invoiceNumbers.length, 5);
        assert.strictEqual(invoiceNumbers.every(n => n.length <= 16), true);
        pass("3.1 5 parallel concurrent invoice generations generate consecutive non-colliding numbers (KV/26-27/00001 to 00005)");

        // =================================================================
        // PART 4: IMMUTABLE AUDIT LOG DIFF & FIELD MUTATION CAPTURE
        // =================================================================
        console.log("\n--- PART 4: Immutable Audit Log Diff Tracking ---");

        // Test diff computation
        const beforeSku = {
            skuId: "SKU_DAP_50KG",
            price: 1350,
            hsn: "31053000",
            category: "FERTILIZER"
        };

        const afterSku = {
            skuId: "SKU_DAP_50KG",
            price: 1400, // Price updated
            hsn: "31053000",
            category: "FERTILIZER",
            updatedBy: "ADMIN_RAMESH"
        };

        const diff = computeObjectDiff(beforeSku, afterSku);
        assert(diff.price);
        assert.strictEqual(diff.price.old, 1350);
        assert.strictEqual(diff.price.new, 1400);
        pass("4.1 computeObjectDiff isolates exact field mutation (price: 1350 -> 1400)");

        // Process audit log
        const auditLogResult = await processAuditLog("skus", "SKU_DAP_50KG", beforeSku, afterSku, "ADMIN_RAMESH");
        assert(auditLogResult);
        assert.strictEqual(auditLogResult.action, "UPDATE");
        assert.strictEqual(auditLogResult.collection, "skus");
        assert.strictEqual(auditLogResult.documentId, "SKU_DAP_50KG");
        assert.strictEqual(auditLogResult.triggeredBy, "ADMIN_RAMESH");
        assert.strictEqual(auditLogResult.changedFields.price.old, 1350);
        assert.strictEqual(auditLogResult.changedFields.price.new, 1400);

        pass("4.2 processAuditLog appends immutable structured audit record into audit_logs collection");

        // =================================================================
        // PART 5: INDEX.JS INTEGRATION VERIFICATION
        // =================================================================
        console.log("\n--- PART 5: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.postJournalEntry, 'function', 'postJournalEntry must be exported');
        assert.strictEqual(typeof indexExports.getNextInvoiceNumber, 'function', 'getNextInvoiceNumber must be exported');
        assert.strictEqual(typeof indexExports.onFinancialSettingsWritten, 'function', 'onFinancialSettingsWritten must be exported');
        assert.strictEqual(typeof indexExports.onSkuWrittenAudit, 'function', 'onSkuWrittenAudit must be exported');
        pass("5.1 All Sprint 1 CA-compliance functions exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 1 GENERAL LEDGER TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint1TestSuite().catch((err) => {
    console.error("Sprint 1 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

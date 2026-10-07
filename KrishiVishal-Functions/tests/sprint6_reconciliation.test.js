const assert = require('assert');
const adminModule = require('../core/admin');
const { reconcileGatewaySettlement, reconcileRiderCashBankDeposit } = require('../finance/reconciliationEngine');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 6: RECONCILIATION ENGINE TEST SUITE ===");
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

async function runSprint6TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // Mock In-memory Firestore store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            journal_lines: new Map(),
            gateway_settlements: new Map(),
            cash_deposits: new Map()
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
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId)
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
                    }
                };
                return await updateFunction(transaction);
            } finally {
                resolveLock();
            }
        };

        // =================================================================
        // PART 1: RAZORPAY GATEWAY SETTLEMENT RECONCILIATION
        // =================================================================
        console.log("--- PART 1: Razorpay Payment Gateway Settlement Reconciliation ---");

        // Scenario: Gross Online Order = ₹10,000, Gateway Fee = ₹200, Tax on Fee = ₹36 (Total Deductions = ₹236)
        // Net Bank Deposit = ₹9,764
        const gatewaySettlementPayload = {
            settlementId: "SETTLE_RZP_2026_9901",
            gatewayName: "RAZORPAY",
            grossOrderAmount: 10000,
            feeAmount: 200,
            taxOnFee: 36,
            netPayout: 9764,
            periodId: "2026-10",
            bankUtr: "HDFC_CMS_NEFT_981273645"
        };

        const reconResult = await reconcileGatewaySettlement(gatewaySettlementPayload);
        assert.strictEqual(reconResult.success, true);
        assert.strictEqual(reconResult.netPayout, 9764);
        assert.strictEqual(reconResult.totalFeeCharged, 236);

        // Verify stored settlement doc
        assert(store.gateway_settlements.has("SETTLE_RZP_2026_9901"));
        const savedSettlement = store.gateway_settlements.get("SETTLE_RZP_2026_9901");
        assert.strictEqual(savedSettlement.status, "RECONCILED");
        assert.strictEqual(savedSettlement.bankUtr, "HDFC_CMS_NEFT_981273645");

        // Verify balanced journal entry
        assert(store.journal_entries.has(reconResult.journalEntryId));
        const savedJE = store.journal_entries.get(reconResult.journalEntryId);
        assert.strictEqual(savedJE.refType, "GATEWAY_SETTLEMENT");
        assert.strictEqual(savedJE.status, "POSTED");
        assert.strictEqual(savedJE.totalAmount, 10000); // Debits: 9,764 (Bank) + 236 (Fee) == Credits: 10,000 (Receivable)

        pass("1.1 Razorpay Settlement Recon: Balanced double-entry passed (Dr Bank ₹9,764 + Dr Fee ₹236 == Cr Gateway Receivable ₹10,000)");

        // =================================================================
        // PART 2: RIDER CASH VAULT BANK DEPOSIT RECONCILIATION
        // =================================================================
        console.log("\n--- PART 2: Rider Cash Vault Bank Deposit Reconciliation ---");

        const depositPayload = {
            depositSlipId: "DEP_SLIP_SAM_2026_101",
            amount: 15000,
            depositedBy: "HUB_MGR_RAMESH",
            bankUtr: "HDFC_CASH_DEP_99281726",
            periodId: "2026-10"
        };

        const depResult = await reconcileRiderCashBankDeposit(depositPayload);
        assert.strictEqual(depResult.success, true);
        assert.strictEqual(depResult.amount, 15000);

        // Verify stored cash deposit doc
        assert(store.cash_deposits.has("DEP_SLIP_SAM_2026_101"));
        const savedDep = store.cash_deposits.get("DEP_SLIP_SAM_2026_101");
        assert.strictEqual(savedDep.status, "DEPOSITED");
        assert.strictEqual(savedDep.bankUtr, "HDFC_CASH_DEP_99281726");

        // Verify balanced journal entry
        assert(store.journal_entries.has(depResult.journalEntryId));
        const depJE = store.journal_entries.get(depResult.journalEntryId);
        assert.strictEqual(depJE.refType, "BANK_RECONCILIATION");
        assert.strictEqual(depJE.status, "POSTED");
        assert.strictEqual(depJE.totalAmount, 15000); // Dr Bank ₹15,000 == Cr Vault ₹15,000

        pass("2.1 Rider Cash Deposit Recon: Balanced double-entry passed (Dr Bank ₹15,000 == Cr Hub Cash Vault ₹15,000)");

        // =================================================================
        // PART 3: DISCREPANCY GUARD
        // =================================================================
        console.log("\n--- PART 3: Settlement Discrepancy Guard ---");

        const mismatchedPayload = {
            settlementId: "SETTLE_FRAUD_DISCREPANT",
            grossOrderAmount: 10000,
            feeAmount: 200,
            taxOnFee: 36,
            netPayout: 9500, // Missing ₹264! (Fraud or arithmetic mismatch)
            periodId: "2026-10",
            bankUtr: "HDFC_FAKE_UTR"
        };

        let threwDiscrepancy = false;
        try {
            await reconcileGatewaySettlement(mismatchedPayload);
        } catch (err) {
            threwDiscrepancy = true;
            assert.strictEqual(err.code, "SETTLEMENT_DISCREPANCY");
        }
        assert(threwDiscrepancy, "Discrepant settlement amounts must be strictly blocked");
        pass("3.1 Discrepancy Guard: System strictly throws SETTLEMENT_DISCREPANCY when Gross != Net + Fee + Tax");

        // =================================================================
        // PART 4: INDEX.JS LAZY EXPORT INTEGRATION
        // =================================================================
        console.log("\n--- PART 4: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.reconcileGatewaySettlement, 'function', 'reconcileGatewaySettlement must be exported');
        assert.strictEqual(typeof indexExports.reconcileRiderCashBankDeposit, 'function', 'reconcileRiderCashBankDeposit must be exported');
        pass("4.1 All Sprint 6 reconciliation functions exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 6 RECONCILIATION TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint6TestSuite().catch((err) => {
    console.error("Sprint 6 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

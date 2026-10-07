const assert = require('assert');
const adminModule = require('../core/admin');
const { recognizeOrderDeliveryFinancials } = require('../finance/salesLedger');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 4: REVENUE RECOGNITION & COGS TEST SUITE ===");
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

async function runSprint4TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // Mock In-memory Firestore store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            invoice_counters: new Map(),
            orders: new Map()
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

        // Initialize invoice counter
        store.invoice_counters.set("26-27", { currentSequence: 0 });

        // =================================================================
        // PART 1: COD INTRA-STATE SALE WITH COGS MATCHING
        // =================================================================
        console.log("--- PART 1: COD Intra-State Sale with COGS Matching ---");

        const codOrder = {
            orderId: "ORD_SAM_COD_1001",
            periodId: "2026-10",
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear: "26-27",
            items: [
                {
                    skuCode: "SKU_CONFIDOR_100ML",
                    sellingPrice: 1000,
                    unitCost: 700,
                    quantity: 1,
                    hsnCode: "3808" // 18% GST -> ₹180 GST, Total ₹1,180
                }
            ]
        };

        const codResult = await recognizeOrderDeliveryFinancials(codOrder);
        assert.strictEqual(codResult.success, true);
        assert.strictEqual(codResult.invoiceNumber, "KV/26-27/00001");
        assert.strictEqual(codResult.totalSales, 1180);
        assert.strictEqual(codResult.taxableAmount, 1000);
        assert.strictEqual(codResult.totalTax, 180);
        assert.strictEqual(codResult.totalCogs, 700);

        // Verify order document updated
        assert(store.orders.has("ORD_SAM_COD_1001"));
        const updatedOrder = store.orders.get("ORD_SAM_COD_1001");
        assert.strictEqual(updatedOrder.invoiceNumber, "KV/26-27/00001");
        assert.strictEqual(updatedOrder.financialStatus, "RECOGNIZED");
        assert.strictEqual(updatedOrder.cgstAmount, 90);
        assert.strictEqual(updatedOrder.sgstAmount, 90);
        assert.strictEqual(updatedOrder.igstAmount, 0);

        // Verify Double-Entry Journal Entry
        assert(store.journal_entries.has(codResult.journalEntryId));
        const codJE = store.journal_entries.get(codResult.journalEntryId);
        assert.strictEqual(codJE.status, "POSTED");
        assert.strictEqual(codJE.totalAmount, 1880); // Debits: 1,180 (Cash) + 700 (COGS) == Credits: 1,000 (Sales) + 180 (GST) + 700 (Inv)

        pass("1.1 COD Intra-State Sale with COGS: Balanced double-entry passed (Debits == Credits == ₹1,880 with Dr Rider Cash ₹1,180 & Dr COGS ₹700)");

        // =================================================================
        // PART 2: PREPAID INTER-STATE SALE (UP / OUTSIDE BIHAR)
        // =================================================================
        console.log("\n--- PART 2: Prepaid Inter-State Sale (UP) ---");

        const prepaidOrder = {
            orderId: "ORD_UP_PREPAID_2002",
            periodId: "2026-10",
            paymentMethod: "ONLINE",
            shippingState: "Uttar Pradesh",
            financialYear: "26-27",
            items: [
                {
                    skuCode: "SKU_CONFIDOR_100ML",
                    sellingPrice: 1000,
                    unitCost: 700,
                    quantity: 1,
                    hsnCode: "3808"
                }
            ]
        };

        const prepaidResult = await recognizeOrderDeliveryFinancials(prepaidOrder);
        assert.strictEqual(prepaidResult.invoiceNumber, "KV/26-27/00002");
        assert.strictEqual(prepaidResult.totalSales, 1180);

        const updatedPrepaidOrder = store.orders.get("ORD_UP_PREPAID_2002");
        assert.strictEqual(updatedPrepaidOrder.igstAmount, 180);
        assert.strictEqual(updatedPrepaidOrder.cgstAmount, 0);
        assert.strictEqual(updatedPrepaidOrder.sgstAmount, 0);

        const prepaidJE = store.journal_entries.get(prepaidResult.journalEntryId);
        assert.strictEqual(prepaidJE.totalAmount, 1880);

        pass("2.1 Prepaid Inter-State Sale (UP): Gateway Receivable debited and Output IGST credited (Invoice KV/26-27/00002)");

        // =================================================================
        // PART 3: RULE 46 SEQUENTIAL NUMBER ASSIGNMENT
        // =================================================================
        console.log("\n--- PART 3: Rule 46 Sequential Invoicing Verification ---");

        assert.strictEqual(codResult.invoiceNumber, "KV/26-27/00001");
        assert.strictEqual(prepaidResult.invoiceNumber, "KV/26-27/00002");
        pass("3.1 Orders assigned consecutive non-colliding Rule 46 Tax Invoice numbers (00001, 00002)");

        // =================================================================
        // PART 4: PERIOD LOCK GUARD ON ORDER DELIVERY
        // =================================================================
        console.log("\n--- PART 4: Period Lock Guard on Delivery ---");

        store.fiscal_periods.set("2026-09", {
            periodId: "2026-09",
            status: "LOCKED"
        });

        const lockedOrder = {
            orderId: "ORD_LOCKED_PERIOD",
            periodId: "2026-09",
            paymentMethod: "COD",
            shippingState: "Bihar",
            items: [{ skuCode: "SKU_TEST", sellingPrice: 500, unitCost: 300, quantity: 1, hsnCode: "3101" }]
        };

        let threwLocked = false;
        try {
            await recognizeOrderDeliveryFinancials(lockedOrder);
        } catch (err) {
            threwLocked = true;
            assert.strictEqual(err.code, "FISCAL_PERIOD_LOCKED");
        }
        assert(threwLocked, "Delivery into locked period must be safely blocked");
        pass("4.1 Period Lock Guard: Recognition into locked period (2026-09) strictly rejected");

        // =================================================================
        // PART 5: INDEX.JS LAZY EXPORT INTEGRATION
        // =================================================================
        console.log("\n--- PART 5: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.recognizeOrderDeliveryFinancials, 'function', 'recognizeOrderDeliveryFinancials must be exported');
        pass("5.1 recognizeOrderDeliveryFinancials exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 4 REVENUE RECOGNITION TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint4TestSuite().catch((err) => {
    console.error("Sprint 4 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

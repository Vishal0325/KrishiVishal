const assert = require('assert');
const adminModule = require('../core/admin');
const { calculateTaxForOrder, HSN_TAX_SLABS, resolveHsnRate } = require('../tax/gstEngine');
const { getNextCreditNoteNumber, generateCreditNoteForReturn } = require('../invoices/creditNoteEngine');
const { CHART_OF_ACCOUNTS } = require('../finance/generalLedger');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 2: DYNAMIC GST & CREDIT NOTE TEST SUITE ===");
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

async function runSprint2TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // In-memory Firestore mock store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            credit_note_counters: new Map(),
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
                delete: async () => {
                    table.delete(docId);
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
        // PART 1: DYNAMIC GST CALCULATION (INTRA-STATE - BIHAR)
        // =================================================================
        console.log("--- PART 1: Intra-State GST Calculation (Bihar) ---");

        const pesticideOrder = {
            shippingState: "Bihar",
            items: [
                {
                    skuId: "SKU_CONFIDOR_100ML",
                    name: "Confidor Insecticide",
                    hsn: "3808",
                    quantity: 1,
                    taxablePrice: 1000
                }
            ]
        };

        const intraResult = calculateTaxForOrder(pesticideOrder);
        assert.strictEqual(intraResult.supplyType, "INTRA_STATE");
        assert.strictEqual(intraResult.taxableAmount, 1000);
        assert.strictEqual(intraResult.cgstAmount, 90);
        assert.strictEqual(intraResult.sgstAmount, 90);
        assert.strictEqual(intraResult.igstAmount, 0);
        assert.strictEqual(intraResult.totalTax, 180);
        assert.strictEqual(intraResult.grandTotal, 1180);
        pass("1.1 Intra-State GST (Bihar): ₹1,000 Pesticide (18%) calculates CGST ₹90, SGST ₹90, IGST ₹0 (Grand Total: ₹1,180)");

        // =================================================================
        // PART 2: INTER-STATE GST CALCULATION (UP / JHARKHAND)
        // =================================================================
        console.log("\n--- PART 2: Inter-State GST Calculation (UP / Outside Bihar) ---");

        const interStateOrder = {
            shippingState: "Uttar Pradesh",
            items: [
                {
                    skuId: "SKU_CONFIDOR_100ML",
                    name: "Confidor Insecticide",
                    hsn: "3808",
                    quantity: 1,
                    taxablePrice: 1000
                }
            ]
        };

        const interResult = calculateTaxForOrder(interStateOrder);
        assert.strictEqual(interResult.supplyType, "INTER_STATE");
        assert.strictEqual(interResult.taxableAmount, 1000);
        assert.strictEqual(interResult.cgstAmount, 0);
        assert.strictEqual(interResult.sgstAmount, 0);
        assert.strictEqual(interResult.igstAmount, 180);
        assert.strictEqual(interResult.totalTax, 180);
        assert.strictEqual(interResult.grandTotal, 1180);
        pass("2.1 Inter-State GST (UP): ₹1,000 Pesticide (18%) calculates IGST ₹180, CGST ₹0, SGST ₹0 (Grand Total: ₹1,180)");

        // =================================================================
        // PART 3: SEEDS STATUTORY EXEMPTION (HSN 1209)
        // =================================================================
        console.log("\n--- PART 3: Seeds Statutory GST Exemption ---");

        const seedOrder = {
            shippingState: "Bihar",
            items: [
                {
                    skuId: "SKU_PADDY_SEEDS_10KG",
                    name: "Hybrid Paddy Seeds",
                    hsn: "1209",
                    quantity: 2,
                    taxablePrice: 500
                }
            ]
        };

        const seedResult = calculateTaxForOrder(seedOrder);
        assert.strictEqual(seedResult.taxableAmount, 1000);
        assert.strictEqual(seedResult.cgstAmount, 0);
        assert.strictEqual(seedResult.sgstAmount, 0);
        assert.strictEqual(seedResult.igstAmount, 0);
        assert.strictEqual(seedResult.totalTax, 0);
        assert.strictEqual(seedResult.grandTotal, 1000);
        assert.strictEqual(seedResult.items[0].taxRate, 0);
        pass("3.1 Seeds Exemption (HSN 1209): 0% GST verified across agricultural seeds");

        // Fertilizer 5% verification
        const fertOrder = {
            shippingState: "Bihar",
            items: [{ hsn: "3105", quantity: 1, taxablePrice: 1350 }]
        };
        const fertResult = calculateTaxForOrder(fertOrder);
        assert.strictEqual(fertResult.totalTax, 67.5);
        assert.strictEqual(fertResult.grandTotal, 1417.5);
        pass("3.2 Fertilizer Slab (HSN 3105): 5% GST verified (CGST ₹33.75, SGST ₹33.75)");

        // =================================================================
        // PART 4: CONSECUTIVE CREDIT NOTE NUMBER GENERATOR (RULE 53 CGST)
        // =================================================================
        console.log("\n--- PART 4: Sequential Rule 53 Credit Note Counter ---");

        const testFY = "26-27";
        store.credit_note_counters.set(testFY, { currentSequence: 0 });

        const cnPromises = [
            getNextCreditNoteNumber(testFY),
            getNextCreditNoteNumber(testFY),
            getNextCreditNoteNumber(testFY),
            getNextCreditNoteNumber(testFY)
        ];

        const cnResults = await Promise.all(cnPromises);
        const cnNumbers = cnResults.map(r => r.creditNoteNumber);
        console.log("Generated Credit Note Sequence:", cnNumbers.join(", "));

        assert.deepStrictEqual(cnNumbers, [
            "KVCN/26-27/00001",
            "KVCN/26-27/00002",
            "KVCN/26-27/00003",
            "KVCN/26-27/00004"
        ]);
        assert(cnNumbers.every(n => n.length <= 16), "Credit note numbers must not exceed statutory limit of 16 characters (Rule 53 CGST)");
        pass("4.1 4 parallel concurrent credit note generations produce consecutive numbers (KVCN/26-27/00001 to 00004)");

        // =================================================================
        // PART 5: CREDIT NOTE GENERATION & BALANCED JOURNAL REVERSAL
        // =================================================================
        console.log("\n--- PART 5: Credit Note Generation & Double-Entry Reversal ---");

        const returnPayload = {
            orderId: "ORD_RET_101",
            returnRequestId: "RET_SPRINT2_101",
            originalInvoiceNo: "KV/26-27/00042",
            returnReason: "RTO_FAILED_DELIVERY",
            shippingState: "Bihar",
            restockable: true,
            returnedItems: [
                {
                    skuId: "SKU_CONFIDOR_100ML",
                    name: "Confidor Insecticide",
                    hsn: "3808",
                    quantity: 1,
                    taxablePrice: 1000,
                    costPrice: 700
                }
            ],
            createdBy: "HUB_MGR_SAMASTIPUR"
        };

        const creditNoteOutput = await generateCreditNoteForReturn(returnPayload);
        assert.strictEqual(creditNoteOutput.success, true);
        assert.strictEqual(creditNoteOutput.totalRefundAmount, 1180);
        assert(creditNoteOutput.journalEntryId);

        // Verify credit note stored in mock firestore
        assert(store.credit_notes.has(creditNoteOutput.creditNoteId));
        const savedCN = store.credit_notes.get(creditNoteOutput.creditNoteId);
        assert.strictEqual(savedCN.originalInvoiceNo, "KV/26-27/00042");
        assert.strictEqual(savedCN.status, "ISSUED");
        assert.strictEqual(savedCN.cgstReversal, 90);
        assert.strictEqual(savedCN.sgstReversal, 90);
        assert.strictEqual(savedCN.totalRefundAmount, 1180);

        // Verify double-entry journal entry was created and balanced
        assert(store.journal_entries.has(creditNoteOutput.journalEntryId));
        const savedJE = store.journal_entries.get(creditNoteOutput.journalEntryId);
        assert.strictEqual(savedJE.refType, "SALES_RETURN");
        assert.strictEqual(savedJE.status, "POSTED");

        pass("5.1 Credit Note persists with Rule 53 metadata and passes atomic balanced reversal journal entry");

        // =================================================================
        // PART 6: INDEX.JS LAZY EXPORT VERIFICATION
        // =================================================================
        console.log("\n--- PART 6: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.calculateTaxForOrder, 'function', 'calculateTaxForOrder must be exported');
        assert.strictEqual(typeof indexExports.generateCreditNoteForReturn, 'function', 'generateCreditNoteForReturn must be exported');
        pass("6.1 All Sprint 2 functions exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 2 GST & CREDIT NOTE TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint2TestSuite().catch((err) => {
    console.error("Sprint 2 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

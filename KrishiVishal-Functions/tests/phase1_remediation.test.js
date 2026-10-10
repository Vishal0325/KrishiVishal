const assert = require('assert');
const adminModule = require('../core/admin');
const { getNextInvoiceNumber, getOrCreateInvoiceNumberForOrder, getCurrentFinancialYear } = require('../invoices/sequentialInvoiceEngine');
const {
    getNextCreditNoteNumber,
    generateCreditNoteForReturn,
    deriveLockDocId,
    deriveDeterministicJournalId,
    LOCK_STALE_TIMEOUT_MS
} = require('../invoices/creditNoteEngine');
const { postJournalEntry } = require('../finance/generalLedger');
const { recognizeOrderDeliveryFinancials } = require('../finance/salesLedger');
const { generateAndUploadInvoice, buildInvoicePdfBuffer } = require('../invoices/invoiceService');

console.log("=========================================================================");
console.log("=== RUNNING PHASE 1 GST REMEDIATION VERIFICATION TEST SUITE ===");
console.log("=========================================================================\n");

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

async function runPhase1TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;
    const originalStorageBucket = adminModule.storage.bucket;
    const originalFieldValue = adminModule.admin.firestore.FieldValue;
    const originalTimestamp = adminModule.admin.firestore.Timestamp;

    try {
        // Ensure FieldValue and Timestamp mock support
        const mockFieldValue = {
            serverTimestamp: () => ({
                _serverTimestamp: true,
                toMillis: () => Date.now(),
                seconds: Math.floor(Date.now() / 1000)
            })
        };
        const mockTimestamp = {
            fromDate: (d) => ({
                toDate: () => d,
                toMillis: () => d.getTime(),
                seconds: Math.floor(d.getTime() / 1000)
            })
        };
        adminModule.admin.firestore.FieldValue = mockFieldValue;
        adminModule.admin.firestore.Timestamp = mockTimestamp;
        adminModule.firestore = adminModule.admin.firestore;

        // In-memory Firestore and Storage store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            invoice_counters: new Map(),
            credit_note_counters: new Map(),
            credit_notes: new Map(),
            credit_note_locks: new Map(),
            orders: new Map()
        };

        const savedFiles = [];

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
                    const merged = { ...existing, ...patch };
                    table.set(docId, merged);
                    return true;
                },
                delete: async () => {
                    table.delete(docId);
                    return true;
                },
                collection: (subCol) => {
                    const subColPath = `${collectionName}/${docId}/${subCol}`;
                    return {
                        doc: (subId) => createMockDocRef(subColPath, subId),
                        get: async () => {
                            const table = store[subColPath] || new Map();
                            const docs = [];
                            for (const [sId, sData] of table.entries()) {
                                docs.push({ id: sId, data: () => sData });
                            }
                            return {
                                empty: docs.length === 0,
                                size: docs.length,
                                docs,
                                forEach: (cb) => docs.forEach(cb)
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
                    const table = store[colName] || new Map();
                    const matches = [];
                    for (const [id, data] of table.entries()) {
                        if (data[field] === val) {
                            matches.push({ id, data: () => data });
                        }
                    }
                    return {
                        limit: () => ({
                            get: async () => ({ empty: matches.length === 0, docs: matches.slice(0, 1) })
                        }),
                        get: async () => ({ empty: matches.length === 0, docs: matches })
                    };
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

        // Mock Storage bucket
        adminModule.storage.bucket = function () {
            return {
                name: 'krishivishal-test.appspot.com',
                file: function (storagePath) {
                    return {
                        save: async function (buffer, options) {
                            savedFiles.push({ path: storagePath, bufferSize: buffer.length, options });
                            return true;
                        }
                    };
                }
            };
        };

        const testFY = getCurrentFinancialYear();
        const testPeriod = "2026-10";
        store.fiscal_periods.set(testPeriod, { status: "OPEN" });

        // =====================================================================
        // TEST 1: SINGLE INVOICE NUMBER ACROSS GENERATION AND DELIVERY
        // =====================================================================
        console.log("--- TEST 1: Single Unified Invoice Number Across Lifecycle ---");

        const orderId1 = "ORD_UNIFIED_001";
        store.orders.set(orderId1, {
            id: orderId1,
            userName: "Rameshwar Singh",
            userPhone: "9876543210",
            address: "Samastipur, Bihar",
            items: [
                { skuId: "PEST_01", name: "Confidor 100ml", hsn: "3808", quantity: 2, sellingPrice: 500, price: 500 }
            ],
            totalAmount: 1180,
            paymentMethod: "COD"
        });

        // 1.1 Generate invoice at dispatch time
        const genResult = await generateAndUploadInvoice(orderId1);
        assert(genResult.success);
        const dispatchedInvoiceNumber = genResult.invoiceNumber;
        assert(dispatchedInvoiceNumber.startsWith("KV/"), `Invoice number must start with official prefix KV/, got: ${dispatchedInvoiceNumber}`);
        assert(dispatchedInvoiceNumber.length <= 16, `Rule 46: length must be <= 16, got: ${dispatchedInvoiceNumber.length}`);

        // 1.2 Confirm order document has root invoiceNumber assigned
        const orderAfterGen = store.orders.get(orderId1);
        assert.strictEqual(orderAfterGen.invoiceNumber, dispatchedInvoiceNumber);

        // 1.3 Later, order is delivered -> recognizeOrderDeliveryFinancials called
        const deliveryResult = await recognizeOrderDeliveryFinancials({
            orderId: orderId1,
            periodId: testPeriod,
            paymentMethod: "COD",
            shippingState: "Bihar",
            items: orderAfterGen.items
        });

        // 1.4 Must REUSE the exact same invoice number without incrementing counter
        assert.strictEqual(deliveryResult.invoiceNumber, dispatchedInvoiceNumber, "Delivery recognition must reuse the invoice number assigned at dispatch");
        
        const orderAfterDel = store.orders.get(orderId1);
        assert.strictEqual(orderAfterDel.invoiceNumber, dispatchedInvoiceNumber, "Order document must retain the same invoice number");
        assert.strictEqual(orderAfterDel.financialStatus, "RECOGNIZED");

        pass("1.1 Single official invoice number maintained between pre-delivery invoice generation and delivery recognition");

        // =====================================================================
        // TEST 2: IDEMPOTENCY ON RE-TRIGGER (ZERO DUPLICATE JOURNALS/INVOICES)
        // =====================================================================
        console.log("\n--- TEST 2: Idempotency on Repeated Triggers ---");

        const initialJeCount = store.journal_entries.size;
        const initialCounterSeq = store.invoice_counters.get(testFY)?.currentSequence;

        // Re-trigger delivery recognition on already recognized order
        const retryResult = await recognizeOrderDeliveryFinancials({
            orderId: orderId1,
            periodId: testPeriod,
            paymentMethod: "COD",
            shippingState: "Bihar",
            items: orderAfterGen.items
        });

        assert.strictEqual(retryResult.alreadyRecognized, true, "Retry must return alreadyRecognized: true");
        assert.strictEqual(retryResult.invoiceNumber, dispatchedInvoiceNumber, "Retry must return the same invoice number");
        assert.strictEqual(store.journal_entries.size, initialJeCount, "Zero duplicate journal entries must be created on retry");
        assert.strictEqual(store.invoice_counters.get(testFY)?.currentSequence, initialCounterSeq, "Counter must not be incremented on retry");

        pass("2.1 Re-triggering delivery recognition is completely idempotent: zero duplicate journals or invoice numbers");

        // =====================================================================
        // TEST 3: CONCURRENT INVOICE ALLOCATIONS FOR SAME ORDER
        // =====================================================================
        console.log("\n--- TEST 3: Concurrency Safety for Same Order ---");

        const orderIdConcurrent = "ORD_CONCURRENT_002";
        store.orders.set(orderIdConcurrent, { id: orderIdConcurrent });

        const concurrentAllocPromises = [
            getOrCreateInvoiceNumberForOrder(orderIdConcurrent),
            getOrCreateInvoiceNumberForOrder(orderIdConcurrent),
            getOrCreateInvoiceNumberForOrder(orderIdConcurrent),
            getOrCreateInvoiceNumberForOrder(orderIdConcurrent)
        ];

        const concurrentAllocResults = await Promise.all(concurrentAllocPromises);
        const allocatedNumbers = concurrentAllocResults.map(r => r.invoiceNumber);

        // All 4 concurrent calls must return the EXACT same invoice number
        const uniqueAllocated = new Set(allocatedNumbers);
        assert.strictEqual(uniqueAllocated.size, 1, `All concurrent requests must return identical invoice number, got: ${Array.from(uniqueAllocated).join(', ')}`);
        
        pass("3.1 4 concurrent allocation requests for the same order produce identical invoice number and only 1 counter increment");

        // =====================================================================
        // TEST 4: CONCURRENT INVOICE ALLOCATIONS ACROSS DIFFERENT ORDERS
        // =====================================================================
        console.log("\n--- TEST 4: Concurrency Safety Across Different Orders ---");

        const diffOrderPromises = [
            getOrCreateInvoiceNumberForOrder("ORD_DIFF_A"),
            getOrCreateInvoiceNumberForOrder("ORD_DIFF_B"),
            getOrCreateInvoiceNumberForOrder("ORD_DIFF_C")
        ];

        const diffOrderResults = await Promise.all(diffOrderPromises);
        const diffNumbers = diffOrderResults.map(r => r.invoiceNumber);
        const uniqueDiff = new Set(diffNumbers);

        assert.strictEqual(uniqueDiff.size, 3, "Different orders must receive unique non-colliding invoice numbers");
        assert(diffNumbers.every(num => num.length <= 16), "All generated invoice numbers must conform to Rule 46 (<= 16 characters)");

        pass("4.1 Concurrent invoice allocations across distinct orders allocate strictly unique sequential numbers <= 16 chars");

        // =====================================================================
        // TEST 5: CREDIT NOTE RULE 53 COMPLIANCE (<= 16 CHARACTERS)
        // =====================================================================
        console.log("\n--- TEST 5: Credit Note Rule 53 Length Limit (<= 16 Characters) ---");

        store.credit_note_counters.set(testFY, { currentSequence: 0 });

        const cnAllocPromises = [
            getNextCreditNoteNumber(testFY),
            getNextCreditNoteNumber(testFY),
            getNextCreditNoteNumber(testFY)
        ];

        const cnAllocResults = await Promise.all(cnAllocPromises);
        const cnNumbers = cnAllocResults.map(r => r.creditNoteNumber);

        console.log("Allocated Credit Note Numbers:", cnNumbers.join(", "));

        assert.strictEqual(cnNumbers[0], `KVCN/${testFY}/00001`);
        assert.strictEqual(cnNumbers[1], `KVCN/${testFY}/00002`);
        assert.strictEqual(cnNumbers[2], `KVCN/${testFY}/00003`);

        // Strict assertion: exactly <= 16 characters!
        assert(cnNumbers.every(cn => cn.length <= 16), `Rule 53 violation: CN length exceeds 16 chars! Lengths: ${cnNumbers.map(c => c.length).join(', ')}`);

        pass("5.1 Credit note numbers conform strictly to Rule 53(1)(c) length limit (<= 16 characters)");

        // =====================================================================
        // TEST 6: CREDIT NOTE IDEMPOTENCY & DUPLICATE POSTING GUARD
        // =====================================================================
        console.log("\n--- TEST 6: Credit Note Idempotency Guard ---");

        const cnPayload = {
            orderId: "ORD_CN_IDEM_TEST",
            returnRequestId: "RET_CN_IDEM_TEST",
            originalInvoiceNo: "KV/26-27/00001",
            returnReason: "RTO_FAILED_DELIVERY",
            shippingState: "Bihar",
            restockable: true,
            idempotencyKey: "CN_RET_KEY_999",
            returnedItems: [
                { skuId: "PEST_01", name: "Confidor", hsn: "3808", quantity: 1, taxablePrice: 500, costPrice: 350 }
            ]
        };

        const initialCnJeCount = store.journal_entries.size;

        // First call
        const cnResult1 = await generateCreditNoteForReturn(cnPayload);
        assert(cnResult1.success);
        assert(!cnResult1.alreadyIssued);
        const issuedCnNo = cnResult1.creditNoteNumber;

        // Verify credit note doc contains financialPeriodId
        const savedDoc = store.credit_notes.get(cnResult1.creditNoteId);
        assert(savedDoc.financialPeriodId, "credit_notes document must contain financialPeriodId");

        // 6.1 Sequential Duplicate Calls & Verification of Single Allocation
        const cnResult2 = await generateCreditNoteForReturn(cnPayload);
        assert(cnResult2.success);
        assert.strictEqual(cnResult2.alreadyIssued, true, "Sequential retry must return alreadyIssued: true");
        assert.strictEqual(cnResult2.creditNoteNumber, issuedCnNo, "Sequential retry must return the exact same credit note number");
        assert.strictEqual(store.journal_entries.size, initialCnJeCount + 1, "Zero duplicate reversal journals must be created on retry");
        pass("6.1 Sequential duplicate requests safely return existing Credit Note without duplicate journals");

        // 6.2 Concurrent Duplicate Requests with Same Key
        const cnPayloadConcSame = { ...cnPayload, idempotencyKey: "CN_KEY_CONC_SAME", orderId: "ORD_CONC_SAME", returnRequestId: "RET_CONC_SAME" };
        const initialJeCountConc = store.journal_entries.size;
        
        const concurrentSamePromises = [
            generateCreditNoteForReturn(cnPayloadConcSame),
            generateCreditNoteForReturn(cnPayloadConcSame),
            generateCreditNoteForReturn(cnPayloadConcSame)
        ];
        
        let sameSuccessCount = 0;
        let sameConflictCount = 0;
        let sameAlreadyIssuedCount = 0;
        
        for (const promise of concurrentSamePromises) {
            try {
                const res = await promise;
                if (res.alreadyIssued) sameAlreadyIssuedCount++;
                else sameSuccessCount++;
            } catch (err) {
                if (err.message.includes("CONCURRENT_ALLOCATION_IN_PROGRESS")) {
                    sameConflictCount++;
                } else {
                    throw err;
                }
            }
        }
        
        assert.strictEqual(sameSuccessCount, 1, "Exactly one concurrent call should succeed in allocating");
        assert.strictEqual(sameSuccessCount + sameAlreadyIssuedCount + sameConflictCount, 3, "All concurrent requests safely handled");
        assert.strictEqual(store.journal_entries.size, initialJeCountConc + 1, "Exactly one reversal journal created under concurrency");
        pass("6.2 Concurrent duplicate requests with the same key safely serialize and never duplicate journals");

        // 6.3 Concurrent Requests with Different Keys
        const diffKeyPromises = [
            generateCreditNoteForReturn({ ...cnPayload, idempotencyKey: "CN_DIFF_KEY_A", orderId: "ORD_DIFF_A", returnRequestId: "RET_DIFF_A" }),
            generateCreditNoteForReturn({ ...cnPayload, idempotencyKey: "CN_DIFF_KEY_B", orderId: "ORD_DIFF_B", returnRequestId: "RET_DIFF_B" }),
            generateCreditNoteForReturn({ ...cnPayload, idempotencyKey: "CN_DIFF_KEY_C", orderId: "ORD_DIFF_C", returnRequestId: "RET_DIFF_C" })
        ];
        const diffKeyResults = await Promise.all(diffKeyPromises);
        const diffCnNumbers = diffKeyResults.map(r => r.creditNoteNumber);
        const uniqueDiffCnNumbers = new Set(diffCnNumbers);
        assert.strictEqual(uniqueDiffCnNumbers.size, 3, "Different keys must allocate strictly distinct Credit Note numbers");
        assert(diffCnNumbers.every(n => n.length <= 16), "All Credit Note numbers must be <= 16 characters");
        pass("6.3 Concurrent requests with different keys produce distinct consecutive numbers");

        // 6.4 Active Stale Lock in ALLOCATING Recovers After Timeout
        const staleKey = "RET_STALE_RECOVER";
        const staleLockId = deriveLockDocId(`RET_${staleKey}`);
        const staleLockRef = createMockDocRef("credit_note_locks", staleLockId);
        // Pre-seed an ALLOCATING lock from 5 minutes ago (exceeds LOCK_STALE_TIMEOUT_MS)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        await staleLockRef.set({
            lockDocId: staleLockId,
            idempotencyKey: `RET_${staleKey}`,
            returnRequestId: staleKey,
            orderId: "ORD_STALE",
            returnReason: "RTO_FAILED_DELIVERY",
            periodId: "2026-10",
            status: "ALLOCATING",
            financialSummary: { grandTotal: 590 },
            createdAt: { toMillis: () => fiveMinutesAgo, seconds: Math.floor(fiveMinutesAgo / 1000) },
            updatedAt: { toMillis: () => fiveMinutesAgo, seconds: Math.floor(fiveMinutesAgo / 1000) }
        });
        const staleRecoverResult = await generateCreditNoteForReturn({
            ...cnPayload,
            returnRequestId: staleKey,
            idempotencyKey: "CLIENT_RETRY_TOKEN",
            orderId: "ORD_STALE"
        });
        assert(staleRecoverResult.success);
        assert(staleRecoverResult.creditNoteNumber);
        const savedStaleLock = store.credit_note_locks.get(staleLockId);
        assert.strictEqual(savedStaleLock.status, "COMPLETED", "Stale ALLOCATING operation must recover and transition to COMPLETED");
        pass("6.4 Crash immediately after lock acquisition safely recovers on subsequent retry");

        // 6.5 Failure After Number Reservation Reuses Sequence Without Gap
        const numResKey = "RET_NUM_RES_RETRY";
        const numResLockId = deriveLockDocId(`RET_${numResKey}`);
        const numResLockRef = createMockDocRef("credit_note_locks", numResLockId);
        const preAllocNumber = "KVCN/26-27/00088";
        await numResLockRef.set({
            lockDocId: numResLockId,
            idempotencyKey: `RET_${numResKey}`,
            returnRequestId: numResKey,
            orderId: "ORD_NUM_RES",
            returnReason: "RTO_FAILED_DELIVERY",
            periodId: "2026-10",
            status: "NUMBER_RESERVED",
            creditNoteNumber: preAllocNumber,
            creditNoteId: preAllocNumber.replace(/\//g, "_"),
            financialSummary: { grandTotal: 590 },
            createdAt: adminModule.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: adminModule.admin.firestore.FieldValue.serverTimestamp()
        });
        const numResResult = await generateCreditNoteForReturn({
            ...cnPayload,
            returnRequestId: numResKey,
            idempotencyKey: "CLIENT_RETRY_TOKEN",
            orderId: "ORD_NUM_RES"
        });
        assert.strictEqual(numResResult.creditNoteNumber, preAllocNumber, "Must reuse reserved credit note number without allocating a new one");
        assert(store.credit_notes.has(preAllocNumber.replace(/\//g, "_")), "Credit note document must be created with reserved number");
        pass("6.5 Failure after number reservation reuses reserved sequence on retry");

        // 6.6 Failure After Journal Posting Reuses Both Sequence and Journal
        const jePostKey = "RET_JE_POSTED_RETRY";
        const jePostLockId = deriveLockDocId(`RET_${jePostKey}`);
        const jePostLockRef = createMockDocRef("credit_note_locks", jePostLockId);
        const preJeAllocNumber = "KVCN/26-27/00089";
        const preJeJournalId = "JE_CN_202610_CUSTOM_089";
        // Pre-seed journal entry in store
        store.journal_entries.set(preJeJournalId, {
            entryId: preJeJournalId,
            refType: "SALES_RETURN",
            refId: preJeAllocNumber,
            periodId: "2026-10",
            totalAmount: 500,
            lineCount: 3,
            status: "POSTED"
        });
        await jePostLockRef.set({
            lockDocId: jePostLockId,
            idempotencyKey: `RET_${jePostKey}`,
            returnRequestId: jePostKey,
            orderId: "ORD_JE_POST",
            returnReason: "RTO_FAILED_DELIVERY",
            periodId: "2026-10",
            status: "JOURNAL_POSTED",
            creditNoteNumber: preJeAllocNumber,
            creditNoteId: preJeAllocNumber.replace(/\//g, "_"),
            journalEntryId: preJeJournalId,
            financialSummary: { grandTotal: 590 },
            createdAt: adminModule.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: adminModule.admin.firestore.FieldValue.serverTimestamp()
        });
        const jeInitialCount = store.journal_entries.size;
        const jePostResult = await generateCreditNoteForReturn({
            ...cnPayload,
            returnRequestId: jePostKey,
            idempotencyKey: "CLIENT_RETRY_TOKEN",
            orderId: "ORD_JE_POST"
        });
        assert.strictEqual(jePostResult.creditNoteNumber, preJeAllocNumber);
        assert.strictEqual(jePostResult.journalEntryId, preJeJournalId);
        assert.strictEqual(store.journal_entries.size, jeInitialCount, "Zero additional journals created on retry after JOURNAL_POSTED");
        pass("6.6 Failure after journal posting reuses journal and sequence without duplicate posting");

        // 6.7 Existing Journal with Matching Financial Contents (postJournalEntry Idempotency)
        // 6.7 Deterministic journal entry with matching financial contents is idempotent
        const matchJeId = "JE_TEST_IDEMPOTENT_MATCH";
        const testJeData = {
            entryId: matchJeId,
            refType: "SALES_RETURN",
            refId: "KVCN/26-27/00090",
            periodId: "2026-10",
            date: new Date(),
            memo: "Test Journal Entry Match",
            lines: [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 500, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 500 }
            ]
        };
        const post1 = await postJournalEntry(testJeData);
        assert(post1.success);
        assert(!post1.alreadyExists);
        const post2 = await postJournalEntry(testJeData);
        assert(post2.success);
        assert.strictEqual(post2.alreadyExists, true, "Second post with identical contents returns alreadyExists: true");

        // 6.7b Line Order Invariance: Same lines in reversed order must safely match
        const testJeDataReversedLines = {
            ...testJeData,
            lines: [
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 500 },
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 500, credit: 0 }
            ]
        };
        const postReversed = await postJournalEntry(testJeDataReversedLines);
        assert(postReversed.success);
        assert.strictEqual(postReversed.alreadyExists, true, "Lines in different order must pass canonical verification");
        pass("6.7 Deterministic journal entry with matching financial contents (including reversed line order) is idempotent");

        // 6.8 Existing Journal with Mismatched Financial Contents Throws Conflict
        let conflictThrown = false;
        try {
            await postJournalEntry({
                ...testJeData,
                lines: [
                    { accountCode: "4010_SALES_AGRI_INPUTS", debit: 700, credit: 0 },
                    { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 700 }
                ]
            });
        } catch (err) {
            if (err.message.includes("JOURNAL_ENTRY_CONFLICT")) {
                conflictThrown = true;
            }
        }
        assert(conflictThrown, "Must throw JOURNAL_ENTRY_CONFLICT when journal with same ID has differing amounts");

        // 6.8b Tampered Account Codes with identical totalAmount and lineCount must throw JOURNAL_ENTRY_CONFLICT
        let accountTamperConflictThrown = false;
        try {
            await postJournalEntry({
                ...testJeData,
                lines: [
                    { accountCode: "5010_COGS_AGRI_INPUTS", debit: 500, credit: 0 }, // Changed account!
                    { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 500 }
                ]
            });
        } catch (err) {
            if (err.message.includes("JOURNAL_ENTRY_CONFLICT")) {
                accountTamperConflictThrown = true;
            }
        }
        assert(accountTamperConflictThrown, "Must throw JOURNAL_ENTRY_CONFLICT when lines have tampered account codes despite identical totalAmount");
        pass("6.8 Existing journal with mismatched financial contents or tampered account codes strictly rejected with conflict");

        // 6.9 Retried Credit Note Request with Mismatched Financial Amounts Throws and Flags Reconciliation
        const mismatchCnKey = "RET_MISMATCH_AMOUNT";
        await generateCreditNoteForReturn({
            ...cnPayload,
            returnRequestId: mismatchCnKey,
            idempotencyKey: "KEY_1",
            orderId: "ORD_MISMATCH"
        });
        let mismatchThrown = false;
        try {
            await generateCreditNoteForReturn({
                ...cnPayload,
                returnRequestId: mismatchCnKey,
                idempotencyKey: "KEY_2",
                orderId: "ORD_MISMATCH",
                returnedItems: [
                    { skuId: "PEST_01", name: "Confidor", hsn: "3808", quantity: 5, taxablePrice: 2500, costPrice: 1750 }
                ]
            });
        } catch (err) {
            if (err.message.includes("FINANCIAL_AMOUNTS_MISMATCH")) {
                mismatchThrown = true;
            }
        }
        assert(mismatchThrown, "Must throw FINANCIAL_AMOUNTS_MISMATCH on altered financial amounts for same key");
        const mismatchLockDoc = store.credit_note_locks.get(deriveLockDocId(`RET_${mismatchCnKey}`));
        assert.strictEqual(mismatchLockDoc.status, "NEEDS_RECONCILIATION", "Lock must be flagged NEEDS_RECONCILIATION");
        pass("6.9 Retried Credit Note with modified financial amounts strictly rejected and flagged for reconciliation");

        // 6.10 Normalization of External Idempotency Keys with Invalid Characters
        const dirtyKey = "RET/ORD#123/CUSTOMER RETURN (Samastipur & Muzaffarpur) [2026/10] @#$%^&*!";
        const derivedDocId = deriveLockDocId(`RET_${dirtyKey}`);
        assert(!derivedDocId.includes("/"), "Derived lock document ID must NOT contain slashes");
        assert(!derivedDocId.includes(" "), "Derived lock document ID must NOT contain spaces");
        assert(derivedDocId.length <= 60, `Derived lock document ID length must be <= 60, got: ${derivedDocId.length}`);
        
        const dirtyResult = await generateCreditNoteForReturn({
            ...cnPayload,
            returnRequestId: dirtyKey,
            orderId: "ORD_DIRTY"
        });
        assert(dirtyResult.success);
        assert(dirtyResult.creditNoteNumber);
        pass("6.10 External idempotency keys with invalid characters, spaces, and slashes safely normalized");

        // 6.11 Complete Return Cycle Invariant: Exactly One Credit Note and One Corresponding Journal
        const finalKey = "RET_STABLE_INVARIANT_FINAL";
        const cycleResult1 = await generateCreditNoteForReturn({ ...cnPayload, returnRequestId: finalKey, idempotencyKey: "TOK_1", orderId: "ORD_FINAL" });
        const cycleResult2 = await generateCreditNoteForReturn({ ...cnPayload, returnRequestId: finalKey, idempotencyKey: "TOK_2", orderId: "ORD_FINAL" });
        const cycleResult3 = await generateCreditNoteForReturn({ ...cnPayload, returnRequestId: finalKey, idempotencyKey: "TOK_3", orderId: "ORD_FINAL" });

        assert.strictEqual(cycleResult1.creditNoteNumber, cycleResult2.creditNoteNumber);
        assert.strictEqual(cycleResult2.creditNoteNumber, cycleResult3.creditNoteNumber);
        assert.strictEqual(cycleResult1.journalEntryId, cycleResult2.journalEntryId);

        // Verify that in the database, exactly one credit note doc and one journal entry exist
        const cnDocsWithKey = Array.from(store.credit_notes.values()).filter(cn => cn.returnRequestId === finalKey);
        assert.strictEqual(cnDocsWithKey.length, 1, "Exactly one Credit Note document must exist in Firestore");
        const jeDoc = store.journal_entries.get(cycleResult1.journalEntryId);
        assert(jeDoc, "Corresponding journal entry must exist");
        assert.strictEqual(jeDoc.refId, cycleResult1.creditNoteNumber, "Journal entry refId must match the credit note number");

        pass("6.11 Complete return cycle invariant: Exactly one Credit Note and one corresponding reversal journal");

        // =====================================================================
        // TEST 6.12: TASK 1 RETURN REQUEST PERMANENT BUSINESS IDENTIFIER SCENARIOS (A - E)
        // =====================================================================
        console.log("\n--- TEST 6.12: Return Request Permanent Business Identifier Scenarios (A - E) ---");

        // Scenario A: Same returnRequestId and Same idempotency key
        const retReqPayloadA = {
            ...cnPayload,
            orderId: "ORD_RET_REQ_001",
            returnRequestId: "RET_CASE_A",
            idempotencyKey: "IDEM_KEY_A"
        };
        const resA1 = await generateCreditNoteForReturn(retReqPayloadA);
        const resA2 = await generateCreditNoteForReturn(retReqPayloadA);
        assert.strictEqual(resA1.creditNoteNumber, resA2.creditNoteNumber, "Scenario A: Must return identical Credit Note number");
        assert.strictEqual(resA2.alreadyIssued, true, "Scenario A: Second call must return alreadyIssued: true");
        pass("6.12-A Same returnRequestId and same idempotency key returns identical Credit Note");

        // Scenario B: Same returnRequestId and Different idempotency keys (Client/Admin Retry with new client token)
        const retReqPayloadB1 = {
            ...cnPayload,
            orderId: "ORD_RET_REQ_002",
            returnRequestId: "RET_CASE_B",
            idempotencyKey: "CLIENT_TOKEN_1"
        };
        const retReqPayloadB2 = {
            ...cnPayload,
            orderId: "ORD_RET_REQ_002",
            returnRequestId: "RET_CASE_B",
            idempotencyKey: "CLIENT_TOKEN_2_DIFFERENT"
        };
        const resB1 = await generateCreditNoteForReturn(retReqPayloadB1);
        const resB2 = await generateCreditNoteForReturn(retReqPayloadB2);
        assert.strictEqual(resB1.creditNoteNumber, resB2.creditNoteNumber, "Scenario B: Same returnRequestId with different idempotency keys must resolve to identical Credit Note");
        assert.strictEqual(resB2.alreadyIssued, true, "Scenario B: Call with different idempotency key must not create duplicate Credit Note");
        pass("6.12-B Same returnRequestId and different idempotency keys safely reuses original Credit Note (Zero duplicates)");

        // Scenario C: Same order with Two Distinct Valid Partial Returns
        const retReqPayloadC_Part1 = {
            ...cnPayload,
            orderId: "ORD_PARTIAL_RETURN",
            returnRequestId: "RET_PARTIAL_001",
            returnedItems: [
                { skuId: "PEST_01", name: "Confidor", hsn: "3808", quantity: 1, taxablePrice: 500, costPrice: 350 }
            ]
        };
        const retReqPayloadC_Part2 = {
            ...cnPayload,
            orderId: "ORD_PARTIAL_RETURN",
            returnRequestId: "RET_PARTIAL_002",
            returnedItems: [
                { skuId: "FERT_02", name: "Urea", hsn: "3102", quantity: 2, taxablePrice: 600, costPrice: 420 }
            ]
        };
        const resC1 = await generateCreditNoteForReturn(retReqPayloadC_Part1);
        const resC2 = await generateCreditNoteForReturn(retReqPayloadC_Part2);
        assert.notStrictEqual(resC1.creditNoteNumber, resC2.creditNoteNumber, "Scenario C: Distinct partial returns must allocate distinct Credit Note numbers");
        assert(resC1.creditNoteNumber.length <= 16 && resC2.creditNoteNumber.length <= 16, "Both partial credit notes must satisfy Rule 53 length limit");
        pass("6.12-C Same order with two distinct valid partial returns safely processes separate Credit Notes");

        // Scenario D: Same returnRequestId with Mismatched Financial Amounts
        let scenarioDConflictThrown = false;
        try {
            await generateCreditNoteForReturn({
                ...retReqPayloadA,
                returnedItems: [
                    { skuId: "PEST_01", name: "Confidor", hsn: "3808", quantity: 5, taxablePrice: 2500, costPrice: 1750 } // Altered amounts!
                ]
            });
        } catch (err) {
            if (err.message.includes("FINANCIAL_AMOUNTS_MISMATCH")) {
                scenarioDConflictThrown = true;
            }
        }
        assert(scenarioDConflictThrown, "Scenario D: Must throw FINANCIAL_AMOUNTS_MISMATCH on altered amounts for same returnRequestId");
        pass("6.12-D Same returnRequestId with mismatched financial amounts strictly rejected and flagged for reconciliation");

        // Scenario E: Two Concurrent Admin Requests for Same returnRequestId
        const retReqPayloadE = {
            ...cnPayload,
            orderId: "ORD_ADMIN_CONCURRENT",
            returnRequestId: "RET_CASE_E_ADMIN",
            idempotencyKey: "ADMIN_REQ_A"
        };
        const retReqPayloadE2 = {
            ...cnPayload,
            orderId: "ORD_ADMIN_CONCURRENT",
            returnRequestId: "RET_CASE_E_ADMIN",
            idempotencyKey: "ADMIN_REQ_B"
        };
        const concurrentAdminPromises = [
            generateCreditNoteForReturn(retReqPayloadE),
            generateCreditNoteForReturn(retReqPayloadE2)
        ];
        let adminSuccessCount = 0;
        let adminAlreadyIssuedCount = 0;
        let adminConflictCount = 0;
        for (const p of concurrentAdminPromises) {
            try {
                const res = await p;
                if (res.alreadyIssued) adminAlreadyIssuedCount++;
                else adminSuccessCount++;
            } catch (err) {
                if (err.message.includes("CONCURRENT_ALLOCATION_IN_PROGRESS")) {
                    adminConflictCount++;
                } else {
                    throw err;
                }
            }
        }
        assert.strictEqual(adminSuccessCount, 1, "Scenario E: Exactly one concurrent admin request succeeds in initial allocation");
        assert.strictEqual(adminSuccessCount + adminAlreadyIssuedCount + adminConflictCount, 2, "Scenario E: All concurrent admin requests safely handled");
        pass("6.12-E Two concurrent admin requests for same returnRequestId safely serialized with zero duplicates");

        // =====================================================================
        // TEST 7: PROVISIONAL PACKING SLIP VS STATUTORY TAX INVOICE
        // =====================================================================
        console.log("\n--- TEST 7: Packing Slip / Provisional Receipt Separation ---");

        const orderIdProv = "ORD_PROV_CHALLAN_99";
        store.orders.set(orderIdProv, {
            id: orderIdProv,
            userName: "Kisan Brother",
            userPhone: "9811223344",
            address: "Kalyanpur, Bihar",
            items: [{ productName: "Paddy Seed", quantity: 1, price: 200 }],
            totalAmount: 200
        });

        const counterBeforeProv = store.invoice_counters.get(testFY)?.currentSequence || 0;

        // Generate as provisional packing slip
        const provResult = await generateAndUploadInvoice(orderIdProv, null, { isProvisional: true, documentType: 'PACKING_SLIP' });
        assert(provResult.success);
        assert(provResult.invoiceNumber.startsWith("CHALLAN/"), `Provisional document must have CHALLAN prefix, got: ${provResult.invoiceNumber}`);

        const counterAfterProv = store.invoice_counters.get(testFY)?.currentSequence || 0;
        assert.strictEqual(counterAfterProv, counterBeforeProv, "Provisional packing slip must NOT consume an official Tax Invoice number from sequence counter");

        const orderProvData = store.orders.get(orderIdProv);
        assert.strictEqual(orderProvData.invoice.isProvisional, true);
        assert.strictEqual(orderProvData.invoice.status, "PROVISIONAL_GENERATED");
        assert.strictEqual(orderProvData.invoiceNumber, undefined, "Provisional packing slip must NOT set root order.invoiceNumber");

        pass("7.1 Provisional packing slip clearly separated from official Tax Invoice and does not consume statutory sequential numbers");

        // =====================================================================
        // RESTORE ORIGINAL MOCKS
        // =====================================================================
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
        adminModule.storage.bucket = originalStorageBucket;
        adminModule.admin.firestore.FieldValue = originalFieldValue;
        adminModule.admin.firestore.Timestamp = originalTimestamp;

    } catch (suiteErr) {
        console.error("FATAL SUITE ERROR:", suiteErr);
        failed++;
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
        adminModule.storage.bucket = originalStorageBucket;
        adminModule.admin.firestore.FieldValue = originalFieldValue;
        adminModule.admin.firestore.Timestamp = originalTimestamp;
    }

    console.log("\n=========================================================================");
    console.log(`PHASE 1 REMEDIATION SUITE: ${passed} PASSED, ${failed} FAILED`);
    console.log("=========================================================================\n");

    if (failed > 0) process.exit(1);
}

runPhase1TestSuite();

/**
 * Real Firestore Emulator Validation Suite
 * KrishiVishal GST & Credit Note Remediation - Concurrency, Idempotency & Crash Recovery
 *
 * SAFETY GUARD: Only runs when FIRESTORE_EMULATOR_HOST is present.
 * Absolutely NO writes to Production Firestore.
 */

const assert = require("assert");

// -------------------------------------------------------------
// STRICT PRODUCTION GUARDS
// -------------------------------------------------------------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: FIRESTORE_EMULATOR_HOST environment variable is not defined!");
    console.error("Aborting test execution to guarantee zero interaction with Production Firestore.");
    process.exit(1);
}

if (process.env.NODE_ENV === "production") {
    console.error("FATAL: NODE_ENV is set to 'production'! Aborting immediately.");
    process.exit(1);
}

// Set explicit test project ID
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "krishivishal-emulator-test";

const { admin, db } = require("../core/admin");
const {
    getNextCreditNoteNumber,
    reserveNextCreditNoteNumberForLock,
    generateCreditNoteForReturn,
    deriveLockDocId,
    deriveDeterministicJournalId,
    getFiscalPeriodId,
    LOCK_STALE_TIMEOUT_MS
} = require("../invoices/creditNoteEngine");
const {
    postJournalEntry,
    computeCanonicalLinesHash,
    assertFiscalPeriodUnlocked
} = require("../finance/generalLedger");
const { getCurrentFinancialYear } = require("../invoices/sequentialInvoiceEngine");
const { calculateTaxForOrder } = require("../tax/gstEngine");

console.log("=========================================================================");
console.log("=== KRISHIVISHAL GST EMULATOR CONCURRENCY & IDEMPOTENCY TEST SUITE ===");
console.log(`=== EMULATOR HOST: ${process.env.FIRESTORE_EMULATOR_HOST} | PROJECT: ${process.env.GCLOUD_PROJECT} ===`);
console.log("=========================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message || err}`);
    if (err.stack) console.error(`     ${err.stack.split("\n").slice(1, 3).join("\n    ")}`);
    failed++;
}

// Helper to clean up specific test collections between tests if needed
async function clearTestDocs(collectionName, prefix) {
    const snap = await db.collection(collectionName).get();
    const batch = db.batch();
    let count = 0;
    snap.forEach(doc => {
        if (!prefix || doc.id.startsWith(prefix) || (doc.data() && doc.data().idempotencyKey && doc.data().idempotencyKey.includes(prefix))) {
            batch.delete(doc.ref);
            count++;
        }
    });
    if (count > 0) {
        await batch.commit();
    }
}

async function runEmulatorValidationSuite() {
    try {
        console.log("--- TASK 1: ENVIRONMENT & PRODUCTION GUARDS ---");
        assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set");
        assert.strictEqual(process.env.NODE_ENV !== "production", true, "NODE_ENV must not be production");
        
        // Smoke test on emulator
        const probeRef = db.collection("_emulator_probe").doc("healthcheck");
        await probeRef.set({ ok: true, ts: admin.firestore.FieldValue.serverTimestamp() });
        const probeSnap = await probeRef.get();
        assert.strictEqual(probeSnap.exists, true);
        assert.strictEqual(probeSnap.data().ok, true);
        await probeRef.delete();
        pass("Task 1: Firestore Emulator connectivity verified and production guards active.");

        // =========================================================================
        // TASK 2: RETURN REQUEST CONCURRENCY ON EMULATOR
        // =========================================================================
        console.log("\n--- TASK 2: RETURN REQUEST CONCURRENCY ON EMULATOR ---");

        // Scenario 2.1: 10 concurrent requests with IDENTICAL returnRequestId + SAME idempotency key
        {
            const returnRequestId = "RET_EMU_CONC_SAME_001";
            const idempotencyKey = "IDEMP_SAME_KEY_001";
            const orderId = "ORD_EMU_CONC_001";
            const originalInvoiceNo = "KV/26-27/00101";
            const returnedItems = [
                { skuId: "SKU_WHEAT_50KG", name: "Certified Wheat Seed 50kg", quantity: 2, taxablePrice: 1200, costPrice: 900 }
            ];

            const requests = Array.from({ length: 10 }).map((_, idx) => {
                return generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo,
                    returnReason: "CUSTOMER_RETURN",
                    returnedItems,
                    returnRequestId,
                    idempotencyKey,
                    createdBy: `TEST_WORKER_${idx}`
                }).catch(err => ({ error: err.message, code: err.code }));
            });

            const results = await Promise.all(requests);
            const successful = results.filter(r => r && r.success);
            const errors = results.filter(r => r && r.error);

            // In our architecture, the 1st caller acquires lock and generates CN.
            // Other concurrent callers either observe ALLOCATING and get CONCURRENT_ALLOCATION_IN_PROGRESS,
            // or if the first caller finishes before they proceed, they safely get alreadyIssued: true.
            // In either case, the database MUST contain exactly 1 credit note.
            const lockDocId = deriveLockDocId(`RET_${returnRequestId}`);
            const lockDoc = await db.collection("credit_note_locks").doc(lockDocId).get();
            assert.strictEqual(lockDoc.exists, true, "Lock document must exist");
            assert.strictEqual(lockDoc.data().status, "COMPLETED", "Lock status must be COMPLETED");

            const cnSnap = await db.collection("credit_notes").where("returnRequestId", "==", returnRequestId).get();
            assert.strictEqual(cnSnap.size, 1, `Expected exactly 1 Credit Note in Firestore, found ${cnSnap.size}`);

            const createdCn = cnSnap.docs[0].data();
            const cnNumber = createdCn.creditNoteNo;
            assert.ok(cnNumber.startsWith("KVCN/"), `Valid CN format: ${cnNumber}`);

            // Verify successful responses all point to the exact same creditNoteNumber
            for (const s of successful) {
                assert.strictEqual(s.creditNoteNumber, cnNumber, "All successful returns must share identical CN number");
            }
            pass(`Scenario 2.1: 10 concurrent requests (same key) resulted in exactly 1 Credit Note (${cnNumber}).`);
        }

        // Scenario 2.2: 10 concurrent requests with IDENTICAL returnRequestId + 10 DIFFERENT idempotency keys
        {
            const returnRequestId = "RET_EMU_MULTI_KEY_002";
            const orderId = "ORD_EMU_CONC_002";
            const originalInvoiceNo = "KV/26-27/00102";
            const returnedItems = [
                { skuId: "SKU_NEEM_OIL_1L", name: "Organic Neem Oil 1L", quantity: 1, taxablePrice: 450, costPrice: 300 }
            ];

            // 10 concurrent callers with completely different idempotencyKeys
            const requests = Array.from({ length: 10 }).map((_, idx) => {
                return generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo,
                    returnReason: "CUSTOMER_RETURN",
                    returnedItems,
                    returnRequestId,
                    idempotencyKey: `DIFFERENT_UUID_${idx}_${Date.now()}`,
                    createdBy: `WORKER_DIFF_KEY_${idx}`
                }).catch(err => ({ error: err.message, code: err.code }));
            });

            const results = await Promise.all(requests);
            const successful = results.filter(r => r && r.success);

            const cnSnap = await db.collection("credit_notes").where("returnRequestId", "==", returnRequestId).get();
            assert.strictEqual(cnSnap.size, 1, `Must have exactly 1 Credit Note document, found ${cnSnap.size}`);

            const createdCn = cnSnap.docs[0].data();
            const cnNumber = createdCn.creditNoteNo;

            // Verify journal entries: exactly 1 journal entry for this return
            const periodId = getFiscalPeriodId();
            const detJournalId = deriveDeterministicJournalId(`RET_${returnRequestId}`, periodId);
            const jeDoc = await db.collection("journal_entries").doc(detJournalId).get();
            assert.strictEqual(jeDoc.exists, true, "Deterministic Journal Entry must exist");
            assert.strictEqual(jeDoc.data().refId, cnNumber, "Journal refId must match Credit Note Number");

            // Check that no duplicate journals were posted
            const allJeForRef = await db.collection("journal_entries").where("refId", "==", cnNumber).get();
            assert.strictEqual(allJeForRef.size, 1, `Expected 1 journal entry for ${cnNumber}, found ${allJeForRef.size}`);

            pass(`Scenario 2.2: 10 concurrent requests with different idempotency keys resolved to 1 CN (${cnNumber}) and 1 Journal.`);
        }

        // Scenario 2.3: Two distinct partial returns on the SAME order (RET_PART_1 and RET_PART_2)
        {
            const orderId = "ORD_EMU_PARTIAL_003";
            const originalInvoiceNo = "KV/26-27/00103";
            
            const part1Req = generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnReason: "PARTIAL_RETURN_A",
                returnedItems: [{ skuId: "SKU_P1", name: "Item Part 1", quantity: 1, taxablePrice: 500, costPrice: 350 }],
                returnRequestId: "RET_PART_1"
            });

            const part2Req = generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnReason: "PARTIAL_RETURN_B",
                returnedItems: [{ skuId: "SKU_P2", name: "Item Part 2", quantity: 2, taxablePrice: 300, costPrice: 200 }],
                returnRequestId: "RET_PART_2"
            });

            const [res1, res2] = await Promise.all([part1Req, part2Req]);
            assert.strictEqual(res1.success, true);
            assert.strictEqual(res2.success, true);
            assert.notStrictEqual(res1.creditNoteNumber, res2.creditNoteNumber, "Distinct partial returns must receive separate sequential numbers");

            const cn1 = await db.collection("credit_notes").doc(res1.creditNoteId).get();
            const cn2 = await db.collection("credit_notes").doc(res2.creditNoteId).get();
            assert.strictEqual(cn1.exists, true);
            assert.strictEqual(cn2.exists, true);
            assert.strictEqual(cn1.data().returnRequestId, "RET_PART_1");
            assert.strictEqual(cn2.data().returnRequestId, "RET_PART_2");
            assert.strictEqual(cn1.data().orderId, orderId);
            assert.strictEqual(cn2.data().orderId, orderId);

            pass(`Scenario 2.3: Two partial returns on same order generated distinct sequential CNs (${res1.creditNoteNumber}, ${res2.creditNoteNumber}).`);
        }

        // Scenario 2.4: Mismatched financial amounts for same returnRequestId on retry
        {
            const returnRequestId = "RET_EMU_MISMATCH_004";
            const orderId = "ORD_EMU_MISMATCH_004";
            const originalInvoiceNo = "KV/26-27/00104";

            // First generation: items worth ₹600
            const res1 = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnReason: "CUSTOMER_RETURN",
                returnedItems: [{ skuId: "SKU_MIS_1", name: "Item Original", quantity: 1, taxablePrice: 600, costPrice: 400 }],
                returnRequestId
            });
            assert.strictEqual(res1.success, true);

            // Attempt retry with different items worth ₹1200
            let threwMismatch = false;
            try {
                await generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo,
                    returnReason: "CUSTOMER_RETURN",
                    returnedItems: [{ skuId: "SKU_MIS_1", name: "Item Modified", quantity: 2, taxablePrice: 600, costPrice: 400 }],
                    returnRequestId
                });
            } catch (err) {
                threwMismatch = true;
                assert.ok(
                    err.code === "FINANCIAL_AMOUNTS_MISMATCH" || err.message.includes("FINANCIAL_AMOUNTS_MISMATCH"),
                    `Expected FINANCIAL_AMOUNTS_MISMATCH error, got: ${err.message}`
                );
            }
            assert.strictEqual(threwMismatch, true, "Tampered financial amounts on retry must be strictly rejected");

            // Verify lock was flagged for reconciliation
            const lockDocId = deriveLockDocId(`RET_${returnRequestId}`);
            const lockDoc = await db.collection("credit_note_locks").doc(lockDocId).get();
            assert.strictEqual(lockDoc.data().status, "NEEDS_RECONCILIATION");

            pass("Scenario 2.4: Mismatched financial amounts correctly flagged as NEEDS_RECONCILIATION and rejected.");
        }

        // Scenario 2.5: Concurrent Admin vs System requests for same returnRequestId
        {
            const returnRequestId = "RET_EMU_ADMIN_SYS_005";
            const orderId = "ORD_EMU_ADMIN_SYS_005";
            const originalInvoiceNo = "KV/26-27/00105";
            const returnedItems = [{ skuId: "SKU_TEST", name: "Test Seed", quantity: 1, taxablePrice: 800, costPrice: 500 }];

            const [p1, p2] = await Promise.allSettled([
                generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo,
                    returnReason: "RTO_FAILED_DELIVERY",
                    returnedItems,
                    returnRequestId,
                    createdBy: "ADMIN_OFFICER_PATNA"
                }),
                generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo,
                    returnReason: "RTO_FAILED_DELIVERY",
                    returnedItems,
                    returnRequestId,
                    createdBy: "SYSTEM_RTO_WEBHOOK"
                })
            ]);

            // Either both succeed with same CN number (one new, one alreadyIssued), or one succeeds and one catches concurrency lock
            const successes = [p1, p2].filter(p => p.status === "fulfilled" && p.value && p.value.success);
            assert.ok(successes.length >= 1, "At least one call must succeed");

            const cnSnap = await db.collection("credit_notes").where("returnRequestId", "==", returnRequestId).get();
            assert.strictEqual(cnSnap.size, 1, "Exactly one Credit Note document must be stored");

            pass(`Scenario 2.5: Admin vs System concurrency cleanly resolved without orphaned records.`);
        }

        // Scenario 2.6: Missing returnRequestId is strictly rejected
        {
            let missingReturnIdRejected = false;
            try {
                await generateCreditNoteForReturn({
                    orderId: "ORD_MISSING_RET_ID",
                    originalInvoiceNo: "KV/26-27/00106",
                    returnReason: "CUSTOMER_RETURN",
                    returnedItems: [{ skuId: "SKU_TEST", name: "Seed", quantity: 1, taxablePrice: 500, costPrice: 300 }]
                    // notice: returnRequestId is omitted
                });
            } catch (err) {
                missingReturnIdRejected = true;
                assert.ok(
                    err.code === "MISSING_RETURN_REQUEST_ID" || err.message.includes("MISSING_RETURN_REQUEST_ID"),
                    `Expected MISSING_RETURN_REQUEST_ID, got: ${err.message}`
                );
            }
            assert.strictEqual(missingReturnIdRejected, true, "Missing returnRequestId must be strictly rejected");
            pass("Scenario 2.6: Missing returnRequestId strictly rejected with MISSING_RETURN_REQUEST_ID.");
        }

        // Scenario 2.7: Two partial returns for same order and same returnReason with distinct Return IDs
        {
            const orderId = "ORD_SAME_REASON_PARTIAL";
            const originalInvoiceNo = "KV/26-27/00107";
            const resPartA = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnReason: "CUSTOMER_RETURN",
                returnedItems: [{ skuId: "SKU_P1", name: "Part A Item", quantity: 1, taxablePrice: 400, costPrice: 250 }],
                returnRequestId: "RET_PART_DISTINCT_A"
            });
            const resPartB = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnReason: "CUSTOMER_RETURN",
                returnedItems: [{ skuId: "SKU_P2", name: "Part B Item", quantity: 1, taxablePrice: 600, costPrice: 400 }],
                returnRequestId: "RET_PART_DISTINCT_B"
            });
            assert.strictEqual(resPartA.success, true);
            assert.strictEqual(resPartB.success, true);
            assert.notStrictEqual(resPartA.creditNoteNumber, resPartB.creditNoteNumber, "Distinct return IDs must receive distinct credit note numbers");
            pass("Scenario 2.7: Two partial returns with same reason and distinct Return IDs produced distinct sequential CNs.");
        }

        // =========================================================================
        // TASK 3: JOURNAL IDEMPOTENCY ON EMULATOR
        // =========================================================================
        console.log("\n--- TASK 3: JOURNAL IDEMPOTENCY ON EMULATOR ---");

        // Scenario 3.1: Repost same journal with identical lines
        {
            const entryId = "JE_EMU_IDEMP_001";
            const periodId = getFiscalPeriodId();
            const lines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 500, credit: 0, description: "Sales return" },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 500, description: "Customer refund" }
            ];

            const post1 = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00901",
                periodId,
                lines,
                createdBy: "TEST_SUITE"
            });
            assert.strictEqual(post1.success, true);
            assert.strictEqual(post1.entryId, entryId);
            assert.strictEqual(post1.alreadyExists, undefined);

            const post2 = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00901",
                periodId,
                lines,
                createdBy: "TEST_SUITE_RETRY"
            });
            assert.strictEqual(post2.success, true);
            assert.strictEqual(post2.alreadyExists, true, "Second post of identical journal must return alreadyExists: true");
            assert.strictEqual(post2.entryId, entryId);

            // Verify lines subcollection has exactly 2 lines (no duplicate lines added)
            const linesSnap = await db.collection("journal_entries").doc(entryId).collection("lines").get();
            assert.strictEqual(linesSnap.size, 2, `Lines subcollection must have 2 lines, found ${linesSnap.size}`);

            pass("Scenario 3.1: Reposting identical journal entry succeeded idempotently with alreadyExists: true.");
        }

        // Scenario 3.2: Tampered account code
        {
            const entryId = "JE_EMU_IDEMP_TAMPER_ACC";
            const periodId = getFiscalPeriodId();
            const validLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 1000, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 1000 }
            ];

            await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00902",
                periodId,
                lines: validLines
            });

            // Tamper: Change 4010 to 4020_DELIVERY_INCOME
            const tamperedLines = [
                { accountCode: "4020_DELIVERY_INCOME", debit: 1000, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 1000 }
            ];

            let tamperedRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00902",
                    periodId,
                    lines: tamperedLines
                });
            } catch (err) {
                tamperedRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(tamperedRejected, true, "Tampered account code must throw JOURNAL_ENTRY_CONFLICT");

            pass("Scenario 3.2: Tampered account code strictly rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.3: Tampered amounts
        {
            const entryId = "JE_EMU_IDEMP_TAMPER_AMT";
            const periodId = getFiscalPeriodId();
            const initialLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 750, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 750 }
            ];

            await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00903",
                periodId,
                lines: initialLines
            });

            // Tamper amounts to 850
            const tamperedLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 850, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 850 }
            ];

            let tamperedAmtRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00903",
                    periodId,
                    lines: tamperedLines
                });
            } catch (err) {
                tamperedAmtRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(tamperedAmtRejected, true, "Tampered amounts must throw JOURNAL_ENTRY_CONFLICT");

            pass("Scenario 3.3: Tampered line amounts strictly rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.4: Line order invariance
        {
            const entryId = "JE_EMU_IDEMP_ORDER_INV";
            const periodId = getFiscalPeriodId();
            const originalLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 300, credit: 0 },
                { accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: 27, credit: 0 },
                { accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: 27, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 354 }
            ];

            const initialPost = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00904",
                periodId,
                lines: originalLines
            });
            assert.strictEqual(initialPost.success, true);

            // Reverse line order
            const reversedLines = [...originalLines].reverse();
            const retryPost = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00904",
                periodId,
                lines: reversedLines
            });
            assert.strictEqual(retryPost.success, true);
            assert.strictEqual(retryPost.alreadyExists, true, "Permuted line order must match canonical hash");

            pass("Scenario 3.4: Line order invariance verified via canonical hash.");
        }

        // Scenario 3.5a: Matching legacy Journal without linesHash (reads persisted subcollection lines)
        {
            const entryId = "JE_EMU_LEGACY_MATCH";
            const periodId = getFiscalPeriodId();
            const lines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 400, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400 }
            ];

            // Seed legacy header without linesHash
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00905",
                periodId,
                date: admin.firestore.Timestamp.now(),
                totalAmount: 400,
                lineCount: 2,
                status: "POSTED"
            });
            // Seed persisted lines in subcollection
            await entryRef.collection("lines").doc("L_001").set({
                accountCode: "4010_SALES_AGRI_INPUTS", debit: 400, credit: 0, description: "Legacy Line 1"
            });
            await entryRef.collection("lines").doc("L_002").set({
                accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400, description: "Legacy Line 2"
            });

            const matchRetry = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00905",
                periodId,
                lines
            });
            assert.strictEqual(matchRetry.success, true);
            assert.strictEqual(matchRetry.alreadyExists, true, "Matching legacy entry reuses with alreadyExists: true");
            pass("Scenario 3.5a: Matching legacy Journal without linesHash validated against persisted lines.");
        }

        // Scenario 3.5b: Altered account code in legacy Journal
        {
            const entryId = "JE_EMU_LEGACY_TAMPER_ACC";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00906",
                periodId,
                totalAmount: 400,
                lineCount: 2,
                status: "POSTED"
            });
            await entryRef.collection("lines").doc("L_001").set({
                accountCode: "4010_SALES_AGRI_INPUTS", debit: 400, credit: 0
            });
            await entryRef.collection("lines").doc("L_002").set({
                accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400
            });

            // Incoming proposes 4020_DELIVERY_INCOME instead of 4010_SALES_AGRI_INPUTS
            let tamperAccRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00906",
                    periodId,
                    lines: [
                        { accountCode: "4020_DELIVERY_INCOME", debit: 400, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400 }
                    ]
                });
            } catch (err) {
                tamperAccRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(tamperAccRejected, true, "Altered account code in legacy journal must be strictly rejected");
            pass("Scenario 3.5b: Altered account code in legacy journal rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.5c: Altered debit/credit amounts in legacy Journal
        {
            const entryId = "JE_EMU_LEGACY_TAMPER_AMT";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00907",
                periodId,
                totalAmount: 500,
                lineCount: 2,
                status: "POSTED"
            });
            await entryRef.collection("lines").doc("L_001").set({
                accountCode: "4010_SALES_AGRI_INPUTS", debit: 500, credit: 0
            });
            await entryRef.collection("lines").doc("L_002").set({
                accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 500
            });

            let tamperAmtRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00907",
                    periodId,
                    lines: [
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 600, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 600 }
                    ]
                });
            } catch (err) {
                tamperAmtRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(tamperAmtRejected, true);
            pass("Scenario 3.5c: Altered line amounts in legacy journal rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.5d: Missing persisted line (persisted 1 line, proposed 2 lines)
        {
            const entryId = "JE_EMU_LEGACY_MISSING_LINE";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00908",
                periodId,
                totalAmount: 300,
                lineCount: 2,
                status: "POSTED"
            });
            // Only 1 line persisted in subcollection
            await entryRef.collection("lines").doc("L_001").set({
                accountCode: "4010_SALES_AGRI_INPUTS", debit: 300, credit: 0
            });

            let missingLineRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00908",
                    periodId,
                    lines: [
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 300, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 300 }
                    ]
                });
            } catch (err) {
                missingLineRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(missingLineRejected, true);
            pass("Scenario 3.5d: Missing persisted line in legacy journal rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.5e: Extra persisted line (persisted 3 lines, proposed 2 lines)
        {
            const entryId = "JE_EMU_LEGACY_EXTRA_LINE";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00909",
                periodId,
                totalAmount: 400,
                lineCount: 2,
                status: "POSTED"
            });
            // 3 lines persisted in subcollection
            await entryRef.collection("lines").doc("L_001").set({ accountCode: "4010_SALES_AGRI_INPUTS", debit: 200, credit: 0 });
            await entryRef.collection("lines").doc("L_002").set({ accountCode: "4010_SALES_AGRI_INPUTS", debit: 200, credit: 0 });
            await entryRef.collection("lines").doc("L_003").set({ accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400 });

            let extraLineRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00909",
                    periodId,
                    lines: [
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 400, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 400 }
                    ]
                });
            } catch (err) {
                extraLineRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(extraLineRejected, true);
            pass("Scenario 3.5e: Extra persisted line in legacy journal rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.5f: Reordered equivalent lines in legacy Journal
        {
            const entryId = "JE_EMU_LEGACY_REORDER";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00910",
                periodId,
                totalAmount: 450,
                lineCount: 2,
                status: "POSTED"
            });
            // Persisted in order: [Line 1: Sales, Line 2: Refund]
            await entryRef.collection("lines").doc("L_001").set({
                accountCode: "4010_SALES_AGRI_INPUTS", debit: 450, credit: 0
            });
            await entryRef.collection("lines").doc("L_002").set({
                accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 450
            });

            // Proposed in reverse order: [Refund, Sales]
            const reorderRetry = await postJournalEntry({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00910",
                periodId,
                lines: [
                    { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 450 },
                    { accountCode: "4010_SALES_AGRI_INPUTS", debit: 450, credit: 0 }
                ]
            });
            assert.strictEqual(reorderRetry.success, true);
            assert.strictEqual(reorderRetry.alreadyExists, true, "Reordered lines in legacy journal must match canonically");
            pass("Scenario 3.5f: Reordered equivalent lines in legacy journal matched canonically.");
        }

        // Scenario 3.5g: Legacy Journal with no persisted lines in subcollection
        {
            const entryId = "JE_EMU_LEGACY_EMPTY_LINES";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            await entryRef.set({
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00911",
                periodId,
                totalAmount: 350,
                lineCount: 2,
                status: "POSTED"
                // No lines added to subcollection!
            });

            let emptyLinesRejected = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00911",
                    periodId,
                    lines: [
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 350, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 350 }
                    ]
                });
            } catch (err) {
                emptyLinesRejected = true;
                assert.strictEqual(err.code, "JOURNAL_ENTRY_CONFLICT");
            }
            assert.strictEqual(emptyLinesRejected, true, "Legacy journal with empty lines subcollection must be rejected");
            pass("Scenario 3.5g: Legacy journal with missing subcollection lines rejected with JOURNAL_ENTRY_CONFLICT.");
        }

        // Scenario 3.5h: Verify that failed retries do not mutate the existing legacy Journal document
        {
            const entryId = "JE_EMU_LEGACY_IMMUTABLE";
            const periodId = getFiscalPeriodId();
            const entryRef = db.collection("journal_entries").doc(entryId);
            const initialPayload = {
                entryId,
                refType: "SALES_RETURN",
                refId: "KVCN/26-27/00912",
                periodId,
                totalAmount: 700,
                lineCount: 2,
                status: "POSTED",
                memo: "Original Legacy Memo",
                originalFlag: "IMMUTABLE_VAL"
            };
            await entryRef.set(initialPayload);
            await entryRef.collection("lines").doc("L_001").set({ accountCode: "4010_SALES_AGRI_INPUTS", debit: 700, credit: 0 });
            await entryRef.collection("lines").doc("L_002").set({ accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 700 });

            // Attempt conflicting post
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00912",
                    periodId,
                    lines: [
                        { accountCode: "4020_DELIVERY_INCOME", debit: 700, credit: 0 }, // Changed account!
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 700 }
                    ],
                    memo: "TAMPERED_MEMO"
                });
            } catch (e) {}

            // Assert existing doc was untouched
            const postSnap = await entryRef.get();
            assert.strictEqual(postSnap.data().memo, "Original Legacy Memo", "Existing document memo must not be overwritten");
            assert.strictEqual(postSnap.data().originalFlag, "IMMUTABLE_VAL");
            pass("Scenario 3.5h: Failed retries do not mutate existing legacy Journal document.");
        }

        // Scenario 3.6: Partial failure & Double-Entry Balance Validation
        {
            const entryId = "JE_EMU_UNBALANCED_001";
            const periodId = getFiscalPeriodId();
            const unbalancedLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 500, credit: 0 },
                { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 450 } // Diff 50
            ];

            let balanceErr = false;
            try {
                await postJournalEntry({
                    entryId,
                    refType: "SALES_RETURN",
                    refId: "KVCN/26-27/00906",
                    periodId,
                    lines: unbalancedLines
                });
            } catch (err) {
                balanceErr = true;
                assert.strictEqual(err.code, "UNBALANCED_JOURNAL_ENTRY");
            }
            assert.strictEqual(balanceErr, true, "Unbalanced journal must be blocked before Firestore writes");

            // Verify document was never written to Firestore
            const unbDoc = await db.collection("journal_entries").doc(entryId).get();
            assert.strictEqual(unbDoc.exists, false, "Unbalanced journal document must not exist in Firestore");

            pass("Scenario 3.6: Unbalanced journal entry rejected and transaction aborted.");
        }

        // =========================================================================
        // TASK 4: CRASH RECOVERY SIMULATION ON EMULATOR
        // =========================================================================
        console.log("\n--- TASK 4: CRASH RECOVERY SIMULATION ON EMULATOR ---");

        // State 4.1: Lock in ALLOCATING state - Stale Timeout Recovery
        {
            const returnRequestId = "RET_EMU_RECOV_ALLOC_001";
            const orderId = "ORD_EMU_RECOV_001";
            const lockDocId = deriveLockDocId(`RET_${returnRequestId}`);
            const lockRef = db.collection("credit_note_locks").doc(lockDocId);
            const returnedItems = [{ skuId: "SKU_R1", name: "R1", quantity: 1, taxablePrice: 250, costPrice: 150 }];
            const taxCalc = calculateTaxForOrder({ shippingState: "Bihar", items: returnedItems });

            // Pre-seed an active ALLOCATING lock (updated 5 seconds ago)
            await lockRef.set({
                lockDocId,
                idempotencyKey: `RET_${returnRequestId}`,
                returnRequestId,
                orderId,
                status: "ALLOCATING",
                updatedAtMs: Date.now() - 5000,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                financialSummary: taxCalc
            });

            // Concurrent call within 60s should be rejected with CONCURRENT_ALLOCATION_IN_PROGRESS
            let activeRejected = false;
            try {
                await generateCreditNoteForReturn({
                    orderId,
                    originalInvoiceNo: "KV/26-27/00301",
                    returnedItems,
                    returnRequestId
                });
            } catch (err) {
                activeRejected = true;
                assert.ok(err.message.includes("CONCURRENT_ALLOCATION_IN_PROGRESS"), `Expected CONCURRENT_ALLOCATION_IN_PROGRESS, got: ${err.message}`);
            }
            assert.strictEqual(activeRejected, true, "Active lock must reject concurrent calls");

            // Simulate crash & passage of time: set updatedAtMs to 70 seconds ago (> 60s timeout)
            await lockRef.update({
                updatedAtMs: Date.now() - (LOCK_STALE_TIMEOUT_MS + 10000)
            });

            // Now retrying must recover from crash, allocate number and complete successfully
            const recoveryRes = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo: "KV/26-27/00301",
                returnedItems,
                returnRequestId
            });
            assert.strictEqual(recoveryRes.success, true);
            assert.ok(recoveryRes.creditNoteNumber.startsWith("KVCN/"));

            const postRecovLock = await lockRef.get();
            assert.strictEqual(postRecovLock.data().status, "COMPLETED");

            pass("State 4.1: Stale ALLOCATING lock successfully recovered after timeout.");
        }

        // State 4.2: Crash after NUMBER_RESERVED (Crash between number allocation and journal posting)
        {
            const returnRequestId = "RET_EMU_RECOV_NUM_RES_002";
            const orderId = "ORD_EMU_RECOV_002";
            const originalInvoiceNo = "KV/26-27/00302";
            const lockDocId = deriveLockDocId(`RET_${returnRequestId}`);
            const lockRef = db.collection("credit_note_locks").doc(lockDocId);

            const reservedNumber = "KVCN/26-27/88801";
            const reservedId = "KVCN_26-27_88801";
            const returnedItems = [{ skuId: "SKU_R2", name: "R2", quantity: 1, taxablePrice: 500, costPrice: 350 }];
            const taxCalc = calculateTaxForOrder({ shippingState: "Bihar", items: returnedItems });

            // Pre-seed lock in NUMBER_RESERVED state with simulated crash
            await lockRef.set({
                lockDocId,
                idempotencyKey: `RET_${returnRequestId}`,
                returnRequestId,
                orderId,
                status: "NUMBER_RESERVED",
                creditNoteNumber: reservedNumber,
                creditNoteId: reservedId,
                updatedAtMs: Date.now(),
                financialSummary: taxCalc
            });

            // Capture current counter sequence before call
            const fy = getCurrentFinancialYear();
            const counterRef = db.collection("credit_note_counters").doc(fy);
            const beforeCounterSnap = await counterRef.get();
            const beforeSeq = beforeCounterSnap.exists ? beforeCounterSnap.data().currentSequence : 0;

            // Retrying the operation must reuse the pre-reserved number WITHOUT incrementing counter again
            const res = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnedItems,
                returnRequestId
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.creditNoteNumber, reservedNumber, "Must reuse reserved number");

            const afterCounterSnap = await counterRef.get();
            const afterSeq = afterCounterSnap.exists ? afterCounterSnap.data().currentSequence : 0;
            assert.strictEqual(afterSeq, beforeSeq, "Counter sequence must NOT increment when reusing NUMBER_RESERVED");

            // Verify Credit Note and Journal are both created
            const cnDoc = await db.collection("credit_notes").doc(reservedId).get();
            assert.strictEqual(cnDoc.exists, true);
            assert.strictEqual(cnDoc.data().creditNoteNo, reservedNumber);

            pass(`State 4.2: NUMBER_RESERVED recovered: reused ${reservedNumber} with zero counter leakage.`);
        }

        // State 4.3: Crash after JOURNAL_POSTED (Crash between journal posting and credit_notes doc writing)
        {
            const returnRequestId = "RET_EMU_RECOV_JE_POST_003";
            const orderId = "ORD_EMU_RECOV_003";
            const originalInvoiceNo = "KV/26-27/00303";
            const lockDocId = deriveLockDocId(`RET_${returnRequestId}`);
            const lockRef = db.collection("credit_note_locks").doc(lockDocId);

            const reservedNumber = "KVCN/26-27/88802";
            const reservedId = "KVCN_26-27_88802";
            const periodId = getFiscalPeriodId();
            const deterministicJournalId = deriveDeterministicJournalId(`RET_${returnRequestId}`, periodId);
            const returnedItems = [{ skuId: "SKU_R3", name: "R3", quantity: 1, taxablePrice: 1000, costPrice: 700 }];
            const taxCalc = calculateTaxForOrder({ shippingState: "Bihar", items: returnedItems });

            // Build journal lines corresponding to taxCalc and cost
            const journalLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: taxCalc.taxableAmount, credit: 0, description: `Sales Return: ${originalInvoiceNo}` }
            ];
            if (taxCalc.cgstAmount > 0) journalLines.push({ accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: taxCalc.cgstAmount, credit: 0 });
            if (taxCalc.sgstAmount > 0) journalLines.push({ accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: taxCalc.sgstAmount, credit: 0 });
            if (taxCalc.igstAmount > 0) journalLines.push({ accountCode: "2040_OUTPUT_IGST_PAYABLE", debit: taxCalc.igstAmount, credit: 0 });
            journalLines.push({ accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: taxCalc.grandTotal });
            // Inventory & COGS
            journalLines.push({ accountCode: "1040_INVENTORY_MAIN_HUB", debit: 700, credit: 0 });
            journalLines.push({ accountCode: "5010_COGS_AGRI_INPUTS", debit: 0, credit: 700 });

            // Pre-post the journal entry as if step 5 had completed before crash
            await postJournalEntry({
                entryId: deterministicJournalId,
                refType: "SALES_RETURN",
                refId: reservedNumber,
                periodId,
                lines: journalLines
            });

            // Pre-seed lock in JOURNAL_POSTED state
            await lockRef.set({
                lockDocId,
                idempotencyKey: `RET_${returnRequestId}`,
                returnRequestId,
                orderId,
                status: "JOURNAL_POSTED",
                creditNoteNumber: reservedNumber,
                creditNoteId: reservedId,
                journalEntryId: deterministicJournalId,
                updatedAtMs: Date.now(),
                financialSummary: taxCalc,
                restockedCostAmount: 700
            });

            // Resume operation
            const res = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnedItems,
                returnRequestId
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.creditNoteNumber, reservedNumber);
            assert.strictEqual(res.journalEntryId, deterministicJournalId);

            // Verify final lock state is COMPLETED and credit note document exists
            const postLock = await lockRef.get();
            assert.strictEqual(postLock.data().status, "COMPLETED");

            const cnDoc = await db.collection("credit_notes").doc(reservedId).get();
            assert.strictEqual(cnDoc.exists, true);
            assert.strictEqual(cnDoc.data().journalEntryId, deterministicJournalId);

            pass(`State 4.3: JOURNAL_POSTED recovered: reused journal ${deterministicJournalId} and finished CN.`);
        }

        // State 4.4: Pre-completed (COMPLETED) state retry
        {
            const returnRequestId = "RET_EMU_RECOV_COMPLETED_004";
            const orderId = "ORD_EMU_RECOV_004";
            const originalInvoiceNo = "KV/26-27/00304";
            const items = [{ skuId: "SKU_R4", name: "R4", quantity: 1, taxablePrice: 300, costPrice: 200 }];

            // Initial full run
            const first = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnedItems: items,
                returnRequestId
            });
            assert.strictEqual(first.success, true);

            // Second run
            const second = await generateCreditNoteForReturn({
                orderId,
                originalInvoiceNo,
                returnedItems: items,
                returnRequestId
            });
            assert.strictEqual(second.success, true);
            assert.strictEqual(second.alreadyIssued, true, "Already completed operation must return alreadyIssued: true");
            assert.strictEqual(second.creditNoteNumber, first.creditNoteNumber);
            assert.strictEqual(second.journalEntryId, first.journalEntryId);

            pass(`State 4.4: COMPLETED operation returned existing record with alreadyIssued: true.`);
        }

        // State 4.5: Analysis of sequence gap between counter increment and lock update
        {
            // Verify counter transaction semantics:
            // If getNextCreditNoteNumber() succeeds, counter doc in Firestore increments by 1.
            const fy = getCurrentFinancialYear();
            const counterRef = db.collection("credit_note_counters").doc(fy);
            const c1 = await counterRef.get();
            const seq1 = c1.data().currentSequence;

            const alloc = await getNextCreditNoteNumber();
            const c2 = await counterRef.get();
            const seq2 = c2.data().currentSequence;

            assert.strictEqual(seq2, seq1 + 1, "Counter sequence increments strictly monotonically");
            assert.strictEqual(alloc.sequence, seq2);
            pass("State 4.5: Monotonic sequence counter increment verified for audit trail.");
        }

        // State 4.6: Atomic Credit Note Number Reservation (reserveNextCreditNoteNumberForLock)
        {
            // 4.6a: Verify atomic counter + lock write in a single Firestore transaction
            const fy = getCurrentFinancialYear();
            const counterRef = db.collection("credit_note_counters").doc(fy);
            const beforeCounterSnap = await counterRef.get();
            const beforeSeq = beforeCounterSnap.exists ? Number(beforeCounterSnap.data().currentSequence) || 0 : 0;

            const testLockRef = db.collection("credit_note_locks").doc("LOCK_EMU_ATOMIC_RES_TEST");
            await testLockRef.set({
                lockDocId: "LOCK_EMU_ATOMIC_RES_TEST",
                idempotencyKey: "ATOMIC_RES_KEY_001",
                status: "ALLOCATING",
                updatedAtMs: Date.now()
            });

            const res1 = await reserveNextCreditNoteNumberForLock(testLockRef, fy, "KVCN");
            assert.strictEqual(res1.alreadyReserved, false);
            assert.strictEqual(res1.sequence, beforeSeq + 1);
            assert.strictEqual(res1.creditNoteNumber, `KVCN/${fy}/${String(beforeSeq + 1).padStart(5, "0")}`);

            // Verify both counter and lock were updated
            const afterCounterSnap = await counterRef.get();
            assert.strictEqual(afterCounterSnap.data().currentSequence, beforeSeq + 1);
            const afterLockSnap = await testLockRef.get();
            assert.strictEqual(afterLockSnap.data().status, "NUMBER_RESERVED");
            assert.strictEqual(afterLockSnap.data().creditNoteNumber, res1.creditNoteNumber);
            assert.strictEqual(afterLockSnap.data().sequence, beforeSeq + 1);

            // 4.6b: Verify idempotency - Calling reserveNextCreditNoteNumberForLock on the same lock reuses number
            const res2 = await reserveNextCreditNoteNumberForLock(testLockRef, fy, "KVCN");
            assert.strictEqual(res2.alreadyReserved, true);
            assert.strictEqual(res2.creditNoteNumber, res1.creditNoteNumber);
            assert.strictEqual(res2.sequence, res1.sequence);

            // Counter must NOT have incremented
            const counterAfterSecondCall = await counterRef.get();
            assert.strictEqual(counterAfterSecondCall.data().currentSequence, beforeSeq + 1);

            // 4.6c: Concurrency test - 4 concurrent callers attempting to reserve on the same lock
            const concurrentLockRef = db.collection("credit_note_locks").doc("LOCK_EMU_ATOMIC_CONCURRENT_TEST");
            await concurrentLockRef.set({
                lockDocId: "LOCK_EMU_ATOMIC_CONCURRENT_TEST",
                idempotencyKey: "ATOMIC_CONCURRENT_KEY_002",
                status: "ALLOCATING",
                updatedAtMs: Date.now()
            });

            const currentSeqBefore4 = (await counterRef.get()).data().currentSequence;
            const concurrentResults = await Promise.all([
                reserveNextCreditNoteNumberForLock(concurrentLockRef, fy, "KVCN"),
                reserveNextCreditNoteNumberForLock(concurrentLockRef, fy, "KVCN"),
                reserveNextCreditNoteNumberForLock(concurrentLockRef, fy, "KVCN"),
                reserveNextCreditNoteNumberForLock(concurrentLockRef, fy, "KVCN")
            ]);

            // All 4 concurrent calls must return the EXACT same credit note number
            const expectedAllocatedNumber = `KVCN/${fy}/${String(currentSeqBefore4 + 1).padStart(5, "0")}`;
            for (const r of concurrentResults) {
                assert.strictEqual(r.creditNoteNumber, expectedAllocatedNumber);
            }

            // Exactly one should have alreadyReserved: false, others alreadyReserved: true
            const initialReserves = concurrentResults.filter(r => r.alreadyReserved === false);
            const reusedReserves = concurrentResults.filter(r => r.alreadyReserved === true);
            assert.strictEqual(initialReserves.length, 1, "Exactly 1 caller must successfully perform initial allocation");
            assert.strictEqual(reusedReserves.length, 3, "Other 3 callers must receive alreadyReserved: true");

            // Counter should increment by exactly 1
            const counterAfter4 = await counterRef.get();
            assert.strictEqual(counterAfter4.data().currentSequence, currentSeqBefore4 + 1);

            pass("State 4.6: reserveNextCreditNoteNumberForLock verified atomic, monotonic, and idempotent across concurrent callers.");
        }

        // =========================================================================
        // SUMMARY
        // =========================================================================
        console.log("\n=========================================================================");
        console.log(`=== EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
        console.log("=========================================================================\n");

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (globalErr) {
        console.error("FATAL SUITE ERROR:", globalErr);
        process.exit(1);
    }
}

runEmulatorValidationSuite();

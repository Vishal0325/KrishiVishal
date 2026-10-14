/**
 * Package 1: General Ledger & Chart of Accounts Upgrade Test Suite
 * RUNS AGAINST REAL FIRESTORE EMULATOR.
 * Run with: firebase emulators:exec --only firestore "node tests/package1_ledger_pass_through.test.js"
 */

const assert = require('assert');
const { db, admin } = require('../core/admin');
const {
    postJournalEntry,
    validateJournalEntry,
    assertFiscalPeriodUnlocked,
    CHART_OF_ACCOUNTS
} = require('../finance/generalLedger');

console.log("=================================================================");
console.log("=== PACKAGE 1: LEDGER TRANSACTION PASS-THROUGH TEST SUITE ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                    ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    if (err.stack) {
        console.error(err.stack);
    }
    failed++;
}

async function runPackage1TestSuite() {
    // 0. Hard Guard: Must be connected to Real Firestore Emulator
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (!emulatorHost) {
        console.error("❌ CRITICAL: FIRESTORE_EMULATOR_HOST environment variable is missing!");
        console.error("This test suite strictly requires a running Firestore Emulator to prove real transaction semantics.");
        console.error("Execute using: firebase emulators:exec --only firestore \"node tests/package1_ledger_pass_through.test.js\"\n");
        process.exit(1);
    }

    console.log(`[Emulator Verification] Connected to REAL Firestore Emulator at ${emulatorHost}`);
    console.log(`[Project ID] ${process.env.GCLOUD_PROJECT || 'krishivishal-a9ed7'}\n`);

    // Verify live read/write capability to emulator
    const probeRef = db.collection("_test_probe_").doc("heartbeat");
    await probeRef.set({
        connected: true,
        emulatorHost: emulatorHost,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    const probeSnap = await probeRef.get();
    assert.strictEqual(probeSnap.exists, true, "Probe doc must exist in real emulator");
    assert.strictEqual(probeSnap.data().connected, true);
    console.log("✅ Probe check verified: Active read/write connection to Firestore Emulator confirmed.\n");

    // Seed open fiscal period in emulator
    await db.collection("fiscal_periods").doc("2026-10").set({
        periodId: "2026-10",
        isClosed: false,
        status: "OPEN",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // =================================================================
    // TEST (a): Real tx pass-through wallet balance update + JE atomic
    // =================================================================
    try {
        const userRef = db.collection("users").doc("user_wallet_test_a");
        await userRef.set({
            walletBalance: 1000,
            name: "Farmer Ramesh",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const jeEntryId = "JE_REAL_EMU_TX_001";
        const entryRef = db.collection("journal_entries").doc(jeEntryId);

        await db.runTransaction(async (tx) => {
            // 1. Caller read first
            const userSnap = await tx.get(userRef);
            assert.strictEqual(userSnap.exists, true);
            const currentBal = Number(userSnap.data().walletBalance);
            const debitAmt = 250;

            // 2. Journal entry posting inside the caller's active real Firestore transaction
            const jeResult = await postJournalEntry({
                entryId: jeEntryId,
                periodId: "2026-10",
                date: new Date("2026-10-14"),
                refType: "WALLET_TRANSACTION",
                refId: "WTX_REAL_001",
                memo: "Customer Wallet Checkout Payment",
                lines: [
                    { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: debitAmt, credit: 0 },
                    { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: debitAmt }
                ]
            }, null, tx);

            assert.strictEqual(jeResult.success, true);

            // 3. Update user wallet balance within same transaction
            tx.update(userRef, { walletBalance: currentBal - debitAmt });
        });

        // Read directly from real Firestore emulator to verify atomic persistence
        const updatedUserSnap = await userRef.get();
        assert.strictEqual(updatedUserSnap.data().walletBalance, 750, "User wallet balance must be 750");

        const postedJeSnap = await entryRef.get();
        assert.strictEqual(postedJeSnap.exists, true, "Journal entry doc must exist in Firestore");
        assert.strictEqual(postedJeSnap.data().totalAmount, 250);
        assert.strictEqual(postedJeSnap.data().status, "POSTED");

        const linesSnap = await entryRef.collection("lines").get();
        assert.strictEqual(linesSnap.size, 2, "Both debit and credit lines must be in Firestore subcollection");

        pass("Test (a): Real tx pass-through wallet balance update + JE committed atomically in Firestore Emulator");
    } catch (err) {
        fail("Test (a): Real tx pass-through wallet balance update + JE committed atomically in Firestore Emulator", err);
    }

    // =================================================================
    // TEST (b): Unbalanced JE par balance update bhi rollback
    // =================================================================
    try {
        const userRef = db.collection("users").doc("user_wallet_test_b");
        await userRef.set({
            walletBalance: 1000,
            name: "Farmer Suresh"
        });

        const jeEntryId = "JE_UNBALANCED_EMU_001";
        const entryRef = db.collection("journal_entries").doc(jeEntryId);

        let errorThrown = null;
        try {
            await db.runTransaction(async (tx) => {
                const userSnap = await tx.get(userRef);
                const currentBal = Number(userSnap.data().walletBalance);

                // Caller stages balance mutation
                tx.update(userRef, { walletBalance: currentBal - 200 });

                // Unbalanced journal entry (Debit 200 != Credit 150)
                await postJournalEntry({
                    entryId: jeEntryId,
                    periodId: "2026-10",
                    date: new Date("2026-10-14"),
                    refType: "WALLET_TRANSACTION",
                    refId: "WTX_UNBALANCED_EMU",
                    lines: [
                        { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 200, credit: 0 },
                        { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 150 }
                    ]
                }, null, tx);
            });
        } catch (err) {
            errorThrown = err;
        }

        assert.ok(errorThrown, "Should throw on unbalanced journal entry");
        assert.strictEqual(errorThrown.code, "UNBALANCED_JOURNAL_ENTRY");

        // Verify real Firestore rollback: user wallet balance must remain 1000
        const userAfterSnap = await userRef.get();
        assert.strictEqual(userAfterSnap.data().walletBalance, 1000, "Wallet balance must NOT mutate on unbalanced JE rollback");

        // Verify journal entry was not written to Firestore
        const jeSnap = await entryRef.get();
        assert.strictEqual(jeSnap.exists, false, "Unbalanced JE must not be written to Firestore");

        pass("Test (b): Unbalanced JE causes complete rollback of caller's balance update in Firestore Emulator");
    } catch (err) {
        fail("Test (b): Unbalanced JE causes complete rollback of caller's balance update in Firestore Emulator", err);
    }

    // =================================================================
    // TEST (c): Same idempotency key do baar -> sirf ek entry, alreadyProcessed
    // =================================================================
    try {
        const jeEntryId = "JE_IDEMP_REAL_EMU_001";
        const entryRef = db.collection("journal_entries").doc(jeEntryId);

        const entryPayload = {
            entryId: jeEntryId,
            periodId: "2026-10",
            date: new Date("2026-10-14"),
            refType: "WALLET_TRANSACTION",
            refId: "WTX_IDEMP_EMU_001",
            memo: "Referral promotion reward credit",
            lines: [
                { accountCode: "6030_REFERRAL_PROMOTION_EXPENSE", debit: 100, credit: 0 },
                { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 0, credit: 100 }
            ]
        };

        // 1st Call in real Firestore
        const firstResult = await postJournalEntry(entryPayload);
        assert.strictEqual(firstResult.success, true);
        assert.strictEqual(firstResult.entryId, jeEntryId);
        assert.strictEqual(firstResult.totalAmount, 100);

        // 2nd Call with identical payload and entryId in real Firestore
        const secondResult = await postJournalEntry(entryPayload);
        assert.strictEqual(secondResult.success, true);
        assert.strictEqual(secondResult.entryId, jeEntryId);
        assert.strictEqual(secondResult.alreadyProcessed, true, "Must flag alreadyProcessed on idempotency match");
        assert.strictEqual(secondResult.alreadyExists, true);

        // Verify only 1 JE and only 2 lines exist in real Firestore
        const jeSnap = await entryRef.get();
        assert.strictEqual(jeSnap.exists, true);

        const linesSnap = await entryRef.collection("lines").get();
        assert.strictEqual(linesSnap.size, 2, "Lines must not be duplicated on replay in Firestore");

        pass("Test (c): Duplicate idempotency key safely returns alreadyProcessed without duplicate records in Firestore");
    } catch (err) {
        fail("Test (c): Duplicate idempotency key safely returns alreadyProcessed without duplicate records in Firestore", err);
    }

    // =================================================================
    // TEST (d): Fiscal period locked -> caller ke writes rollback
    // =================================================================
    try {
        // Seed locked period in real Firestore emulator
        await db.collection("fiscal_periods").doc("2026-09").set({
            periodId: "2026-09",
            isClosed: true,
            status: "LOCKED"
        });

        const userRef = db.collection("users").doc("user_wallet_test_d");
        await userRef.set({
            walletBalance: 500,
            name: "Farmer Mahesh"
        });

        const jeEntryId = "JE_LOCKED_PERIOD_EMU_001";
        const entryRef = db.collection("journal_entries").doc(jeEntryId);

        let lockedError = null;
        try {
            await db.runTransaction(async (tx) => {
                const userSnap = await tx.get(userRef);

                // Post to LOCKED fiscal period (performs reads, encounters locked period, throws FISCAL_PERIOD_LOCKED)
                await postJournalEntry({
                    entryId: jeEntryId,
                    periodId: "2026-09",
                    date: new Date("2026-09-15"),
                    refType: "WALLET_TRANSACTION",
                    refId: "WTX_LOCKED_EMU",
                    lines: [
                        { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 50, credit: 0 },
                        { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 50 }
                    ]
                }, null, tx);

                // Stage a balance change (unreachable due to error)
                tx.update(userRef, { walletBalance: Number(userSnap.data().walletBalance) - 50 });
            });
        } catch (err) {
            lockedError = err;
        }

        assert.ok(lockedError, "Should throw on locked fiscal period");
        assert.strictEqual(lockedError.code, "FISCAL_PERIOD_LOCKED");

        // Verify rollback in real Firestore: user wallet balance remains 500
        const userAfterSnap = await userRef.get();
        assert.strictEqual(userAfterSnap.data().walletBalance, 500, "Wallet balance must NOT mutate when fiscal period is locked");

        // Verify journal entry not written in Firestore
        const jeSnap = await entryRef.get();
        assert.strictEqual(jeSnap.exists, false, "Locked JE must not be written to Firestore");

        pass("Test (d): Locked fiscal period aborts transaction and rolls back caller's writes in Firestore Emulator");
    } catch (err) {
        fail("Test (d): Locked fiscal period aborts transaction and rolls back caller's writes in Firestore Emulator", err);
    }

    // =================================================================
    // TEST (e): Strict reads-before-writes ordering & NEGATIVE test
    // =================================================================
    try {
        // Part 1 (NEGATIVE TEST): Verify real Firestore SDK strictly throws read-after-write error
        // when caller attempts a write BEFORE postJournalEntry executes reads
        const negUserRef = db.collection("users").doc("user_neg_rw_test");
        await negUserRef.set({ walletBalance: 800 });

        let readAfterWriteCaught = false;
        let caughtErrorMessage = "";

        try {
            await db.runTransaction(async (tx) => {
                // VIOLATION of contract: Caller performs a write FIRST
                tx.update(negUserRef, { walletBalance: 700 });

                // postJournalEntry attempts tx.get(periodRef) inside, which violates Firestore protocol
                await postJournalEntry({
                    entryId: "JE_NEG_READ_AFTER_WRITE",
                    periodId: "2026-10",
                    date: new Date("2026-10-14"),
                    refType: "WALLET_TRANSACTION",
                    refId: "WTX_NEG_RW",
                    lines: [
                        { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 100, credit: 0 },
                        { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 100 }
                    ]
                }, null, tx);
            });
        } catch (err) {
            caughtErrorMessage = err.message || "";
            if (caughtErrorMessage.toLowerCase().includes("reads must come before writes") ||
                caughtErrorMessage.toLowerCase().includes("all reads to be executed before all writes") ||
                caughtErrorMessage.toLowerCase().includes("read")) {
                readAfterWriteCaught = true;
            }
        }

        assert.strictEqual(readAfterWriteCaught, true, `Real Firestore must reject read-after-write. Caught: ${caughtErrorMessage}`);
        console.log(`   [Negative Test Proof] Real Firestore threw expected native constraint: "${caughtErrorMessage.split('\n')[0]}"`);

        // Part 2 (POSITIVE TEST): Verify postJournalEntry executes all its reads before any writes inside caller transaction
        const posUserRef = db.collection("users").doc("user_wallet_test_a");
        await db.runTransaction(async (tx) => {
            // Caller reads first
            const userSnap = await tx.get(posUserRef);
            assert.strictEqual(userSnap.exists, true);

            // Caller calls postJournalEntry with tx pass-through
            // postJournalEntry reads fiscal period and existing entry before performing any sets
            const result = await postJournalEntry({
                entryId: "JE_READS_BEFORE_WRITES_OK",
                periodId: "2026-10",
                date: new Date("2026-10-14"),
                refType: "WALLET_TRANSACTION",
                refId: "WTX_ORDER_OK",
                lines: [
                    { accountCode: "6035_CUSTOMER_GOODWILL_EXPENSE", debit: 50, credit: 0 },
                    { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 0, credit: 50 }
                ]
            }, null, tx);

            assert.strictEqual(result.success, true);

            // Caller writes after postJournalEntry
            tx.update(posUserRef, { lastUpdated: "2026-10-14" });
        });

        pass("Test (e): Real Firestore enforces reads-before-writes (negative contract test caught + positive test passed)");
    } catch (err) {
        fail("Test (e): Real Firestore enforces reads-before-writes", err);
    }

    // =================================================================
    // TEST (f): Existing callers compatibility and new CoA accounts check
    // =================================================================
    try {
        // Verify all 6 newly added accounts are present in Chart of Accounts
        assert.ok(CHART_OF_ACCOUNTS.ASSETS["1015_RIDER_RECEIVABLE_SHORTAGES"], "1015 must be in ASSETS");
        assert.strictEqual(CHART_OF_ACCOUNTS.ASSETS["1015_RIDER_RECEIVABLE_SHORTAGES"].category, "CURRENT_ASSET");
        assert.strictEqual(CHART_OF_ACCOUNTS.ASSETS["1015_RIDER_RECEIVABLE_SHORTAGES"].normalBalance, "DEBIT");

        assert.ok(CHART_OF_ACCOUNTS.LIABILITIES["2015_RIDER_PAYOUTS_PAYABLE"], "2015 must be in LIABILITIES");
        assert.strictEqual(CHART_OF_ACCOUNTS.LIABILITIES["2015_RIDER_PAYOUTS_PAYABLE"].category, "CURRENT_LIABILITY");
        assert.strictEqual(CHART_OF_ACCOUNTS.LIABILITIES["2015_RIDER_PAYOUTS_PAYABLE"].normalBalance, "CREDIT");

        assert.ok(CHART_OF_ACCOUNTS.LIABILITIES["2065_CUSTOMER_WALLET_LIABILITY"], "2065 must be in LIABILITIES");
        assert.strictEqual(CHART_OF_ACCOUNTS.LIABILITIES["2065_CUSTOMER_WALLET_LIABILITY"].category, "CURRENT_LIABILITY");
        assert.strictEqual(CHART_OF_ACCOUNTS.LIABILITIES["2065_CUSTOMER_WALLET_LIABILITY"].normalBalance, "CREDIT");

        assert.ok(CHART_OF_ACCOUNTS.EXPENSES["6030_REFERRAL_PROMOTION_EXPENSE"], "6030 must be in EXPENSES");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6030_REFERRAL_PROMOTION_EXPENSE"].category, "OPERATING_EXPENSE");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6030_REFERRAL_PROMOTION_EXPENSE"].normalBalance, "DEBIT");

        assert.ok(CHART_OF_ACCOUNTS.EXPENSES["6035_CUSTOMER_GOODWILL_EXPENSE"], "6035 must be in EXPENSES");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6035_CUSTOMER_GOODWILL_EXPENSE"].category, "OPERATING_EXPENSE");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6035_CUSTOMER_GOODWILL_EXPENSE"].normalBalance, "DEBIT");

        assert.ok(CHART_OF_ACCOUNTS.EXPENSES["6040_CASH_SHORTAGE_LOSS"], "6040 must be in EXPENSES");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6040_CASH_SHORTAGE_LOSS"].category, "OPERATING_EXPENSE");
        assert.strictEqual(CHART_OF_ACCOUNTS.EXPENSES["6040_CASH_SHORTAGE_LOSS"].normalBalance, "DEBIT");

        // Verify 1055 was NOT added
        assert.strictEqual(CHART_OF_ACCOUNTS.ASSETS["1055"], undefined, "1055 must NOT exist");

        // Verify legacy caller invocation without tx (runs standalone transaction directly in Firestore)
        const legacyCallResult = await postJournalEntry({
            entryId: "JE_LEGACY_CALLER_EMU_001",
            periodId: "2026-10",
            date: new Date("2026-10-14"),
            refType: "RIDER_PAYOUT",
            refId: "PAYOUT_WEEK_41",
            memo: "Weekly rider payout clearance",
            lines: [
                { accountCode: "2015_RIDER_PAYOUTS_PAYABLE", debit: 3200, credit: 0 },
                { accountCode: "1015_RIDER_RECEIVABLE_SHORTAGES", debit: 0, credit: 500 },
                { accountCode: "1030_BANK_CURRENT_ACCOUNT", debit: 0, credit: 2700 }
            ]
        });

        assert.strictEqual(legacyCallResult.success, true);
        assert.strictEqual(legacyCallResult.totalAmount, 3200);

        // Verify legacy context with auth role passes in real Firestore
        const legacyWithContext = await postJournalEntry({
            entryId: "JE_LEGACY_WITH_CONTEXT_EMU",
            periodId: "2026-10",
            date: new Date("2026-10-14"),
            refType: "ORDER_DELIVERY",
            refId: "INV_LEGACY_01",
            lines: [
                { accountCode: "1050_GATEWAY_RECEIVABLE", debit: 590, credit: 0 },
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 500 },
                { accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: 0, credit: 45 },
                { accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: 0, credit: 45 }
            ]
        }, { auth: { uid: "cfo_user", token: { role: "CFO" } } });

        assert.strictEqual(legacyWithContext.success, true);

        // Verify Firestore actually persisted legacy entries
        const legacySnap = await db.collection("journal_entries").doc("JE_LEGACY_CALLER_EMU_001").get();
        assert.strictEqual(legacySnap.exists, true);
        assert.strictEqual(legacySnap.data().totalAmount, 3200);

        pass("Test (f): Legacy callers compatible and new CoA accounts validated successfully in Firestore Emulator");
    } catch (err) {
        fail("Test (f): Legacy callers compatible and new CoA accounts validated successfully in Firestore Emulator", err);
    }

    // =================================================================
    // TEST (g): Rule 5 Contract Guard - Two postJournalEntry in Same Tx
    // Attempting to call postJournalEntry a second time in the same
    // transaction MUST fail because the second call tries to read
    // periodRef/entryRef after the first call has staged writes (tx.set).
    // =================================================================
    console.log("--- TEST (g): Rule 5 Single-JE-per-Transaction Enforcement ---");
    try {
        let secondCallFailedWithReadAfterWrite = false;
        let caughtErrorMessage = "";

        try {
            await db.runTransaction(async (transaction) => {
                // First postJournalEntry: reads period, stages writes (tx.set)
                const je1 = await postJournalEntry({
                    entryId: "JE_MULTI_TX_FIRST_001",
                    periodId: "2026-10",
                    date: new Date("2026-10-14"),
                    refType: "ORDER_DELIVERY",
                    refId: "ORD_MULTI_001",
                    lines: [
                        { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 100, credit: 0 },
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 100 }
                    ]
                }, { tx: transaction });

                assert.strictEqual(je1.success, true);

                // Second postJournalEntry inside the SAME transaction:
                // Attempts tx.get() on periodRef/entryRef AFTER tx.set() has already occurred
                await postJournalEntry({
                    entryId: "JE_MULTI_TX_SECOND_002",
                    periodId: "2026-10",
                    date: new Date("2026-10-14"),
                    refType: "SALES_RETURN",
                    refId: "RET_MULTI_002",
                    lines: [
                        { accountCode: "4010_SALES_AGRI_INPUTS", debit: 50, credit: 0 },
                        { accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE", debit: 0, credit: 50 }
                    ]
                }, { tx: transaction });
            });
        } catch (txErr) {
            caughtErrorMessage = txErr.message || "";
            if (/reads to be executed before all writes|read-after-write|Firestore transactions require all reads/i.test(caughtErrorMessage)) {
                secondCallFailedWithReadAfterWrite = true;
            } else {
                throw txErr;
            }
        }

        assert.strictEqual(secondCallFailedWithReadAfterWrite, true, 
            `Expected Firestore read-after-write error on second postJournalEntry in same tx, got: ${caughtErrorMessage}`);

        // Verify that neither entry was committed to the database (atomic rollback)
        const checkSnap1 = await db.collection("journal_entries").doc("JE_MULTI_TX_FIRST_001").get();
        const checkSnap2 = await db.collection("journal_entries").doc("JE_MULTI_TX_SECOND_002").get();
        assert.strictEqual(checkSnap1.exists, false, "First JE must be rolled back by transaction failure");
        assert.strictEqual(checkSnap2.exists, false, "Second JE must not exist");

        pass("Test (g): Rule 5 enforced - calling postJournalEntry twice in same transaction triggers Firestore read-after-write error and rolls back atomically");
    } catch (err) {
        fail("Test (g): Rule 5 enforced - calling postJournalEntry twice in same transaction", err);
    }

    console.log("\n=================================================================");
    console.log(`PACKAGE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runPackage1TestSuite().catch((err) => {
    console.error("FATAL in Package 1 Test Suite:", err);
    process.exit(1);
});

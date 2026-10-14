/**
 * Package 1: General Ledger & Chart of Accounts Upgrade Test Suite
 * Tests caller transaction pass-through, atomic rollback, idempotency,
 * fiscal period lock, reads-before-writes ordering, and CoA expansion.
 */

const assert = require('assert');
const adminModule = require('../core/admin');
const {
    postJournalEntry,
    validateJournalEntry,
    assertFiscalPeriodUnlocked,
    CHART_OF_ACCOUNTS
} = require('../finance/generalLedger');

console.log("=================================================================");
console.log("=== PACKAGE 1: LEDGER TRANSACTION PASS-THROUGH TEST SUITE ===");
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

async function runPackage1TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // Multi-collection in-memory store
        const store = {};

        function getTable(name) {
            if (!store[name]) store[name] = new Map();
            return store[name];
        }

        function createMockDocRef(path) {
            const parts = path.split('/');
            const docId = parts[parts.length - 1];
            const colPath = parts.slice(0, -1).join('/');

            return {
                id: docId,
                path: path,
                get: async () => {
                    const table = getTable(colPath);
                    const data = table.get(docId);
                    return {
                        exists: !!data,
                        id: docId,
                        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
                    };
                },
                set: async (payload, options = {}) => {
                    const table = getTable(colPath);
                    const existing = table.get(docId) || {};
                    const merged = options.merge ? { ...existing, ...payload } : { ...payload };
                    table.set(docId, JSON.parse(JSON.stringify(merged)));
                    return true;
                },
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${path}/${subCol}/${subId}`),
                        get: async () => {
                            const subColPath = `${path}/${subCol}`;
                            const table = getTable(subColPath);
                            const docs = Array.from(table.entries()).map(([id, d]) => ({
                                id,
                                data: () => JSON.parse(JSON.stringify(d)),
                                exists: true
                            }));
                            return {
                                empty: docs.length === 0,
                                size: docs.length,
                                docs
                            };
                        }
                    };
                }
            };
        }

        adminModule.db.collection = function (colName) {
            return {
                doc: (id) => createMockDocRef(`${colName}/${id}`),
                get: async () => {
                    const table = getTable(colName);
                    const docs = Array.from(table.entries()).map(([id, d]) => ({
                        id,
                        data: () => JSON.parse(JSON.stringify(d)),
                        exists: true
                    }));
                    return {
                        empty: docs.length === 0,
                        size: docs.length,
                        docs
                    };
                }
            };
        };

        // Transaction runner with strict ACID staging, rollback, and reads-before-writes enforcement
        adminModule.db.runTransaction = async function (updateFunction) {
            let hasWritten = false;
            const stagedWrites = [];

            const tx = {
                get: async (docRef) => {
                    if (hasWritten) {
                        const err = new Error("Firestore transactions require all reads to be executed before all writes.");
                        err.code = "READ_AFTER_WRITE";
                        throw err;
                    }
                    return await docRef.get();
                },
                set: (docRef, payload, options = {}) => {
                    hasWritten = true;
                    stagedWrites.push({ docRef, payload, options });
                }
            };

            // Execute transactional function
            const result = await updateFunction(tx);

            // Commit staged writes only if updateFunction succeeds without throwing
            for (const write of stagedWrites) {
                await write.docRef.set(write.payload, write.options);
            }

            return result;
        };

        // Seed initial fiscal period
        const periodTable = getTable('fiscal_periods');
        periodTable.set('2026-10', {
            periodId: '2026-10',
            isClosed: false,
            status: 'OPEN'
        });

        // =================================================================
        // TEST (a): tx pass-through me wallet balance update + JE atomic
        // =================================================================
        try {
            const userTable = getTable('users');
            userTable.set('user_wallet_test_a', {
                walletBalance: 1000,
                name: "Farmer Ramesh"
            });

            await adminModule.db.runTransaction(async (tx) => {
                const userRef = adminModule.db.collection('users').doc('user_wallet_test_a');
                const userSnap = await tx.get(userRef);
                const currentBal = userSnap.data().walletBalance;
                const debitAmt = 250;

                // Journal entry posting inside the caller's active transaction
                const jeResult = await postJournalEntry({
                    entryId: "JE_WALLET_TX_001",
                    periodId: "2026-10",
                    date: new Date("2026-10-14"),
                    refType: "WALLET_TRANSACTION",
                    refId: "WTX_001",
                    memo: "Customer Wallet Checkout Payment",
                    lines: [
                        { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: debitAmt, credit: 0 },
                        { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: debitAmt }
                    ]
                }, null, tx);

                assert.strictEqual(jeResult.success, true);

                // Update user wallet balance within same transaction
                tx.set(userRef, { walletBalance: currentBal - debitAmt }, { merge: true });
            });

            const updatedUser = userTable.get('user_wallet_test_a');
            assert.strictEqual(updatedUser.walletBalance, 750, "User wallet balance should be decremented to 750");

            const jeTable = getTable('journal_entries');
            const postedJE = jeTable.get('JE_WALLET_TX_001');
            assert.ok(postedJE, "Journal entry doc must exist");
            assert.strictEqual(postedJE.totalAmount, 250);
            assert.strictEqual(postedJE.status, "POSTED");

            const linesTable = getTable('journal_entries/JE_WALLET_TX_001/lines');
            assert.strictEqual(linesTable.size, 2, "Both debit and credit lines must be posted");
            assert.strictEqual(linesTable.get('L_001').accountCode, "2065_CUSTOMER_WALLET_LIABILITY");
            assert.strictEqual(linesTable.get('L_002').accountCode, "1010_CASH_IN_HAND_RIDERS");

            pass("Test (a): tx pass-through wallet balance update + JE committed atomically");
        } catch (err) {
            fail("Test (a): tx pass-through wallet balance update + JE committed atomically", err);
        }

        // =================================================================
        // TEST (b): Unbalanced JE par balance update bhi rollback
        // =================================================================
        try {
            const userTable = getTable('users');
            userTable.set('user_wallet_test_b', {
                walletBalance: 1000,
                name: "Farmer Suresh"
            });

            let errorThrown = null;
            try {
                await adminModule.db.runTransaction(async (tx) => {
                    const userRef = adminModule.db.collection('users').doc('user_wallet_test_b');
                    const userSnap = await tx.get(userRef);
                    const currentBal = userSnap.data().walletBalance;

                    // Staging balance mutation
                    tx.set(userRef, { walletBalance: currentBal - 200 }, { merge: true });

                    // Unbalanced journal entry (Debit 200 != Credit 150)
                    await postJournalEntry({
                        entryId: "JE_UNBALANCED_001",
                        periodId: "2026-10",
                        date: new Date("2026-10-14"),
                        refType: "WALLET_TRANSACTION",
                        refId: "WTX_UNBALANCED",
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

            // Verify rollback: user wallet balance must remain 1000
            const userAfter = userTable.get('user_wallet_test_b');
            assert.strictEqual(userAfter.walletBalance, 1000, "Wallet balance must NOT mutate on unbalanced JE rollback");

            // Verify journal entry was not persisted
            const jeTable = getTable('journal_entries');
            assert.strictEqual(jeTable.get('JE_UNBALANCED_001'), undefined, "Unbalanced JE must not be written");

            pass("Test (b): Unbalanced JE causes complete rollback of caller's balance update");
        } catch (err) {
            fail("Test (b): Unbalanced JE causes complete rollback of caller's balance update", err);
        }

        // =================================================================
        // TEST (c): Same idempotency key do baar -> sirf ek entry, alreadyProcessed
        // =================================================================
        try {
            const entryPayload = {
                entryId: "JE_IDEMP_TEST_001",
                periodId: "2026-10",
                date: new Date("2026-10-14"),
                refType: "WALLET_TRANSACTION",
                refId: "WTX_IDEMP_001",
                memo: "Referral promotion reward credit",
                lines: [
                    { accountCode: "6030_REFERRAL_PROMOTION_EXPENSE", debit: 100, credit: 0 },
                    { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 0, credit: 100 }
                ]
            };

            // 1st Call
            const firstResult = await postJournalEntry(entryPayload);
            assert.strictEqual(firstResult.success, true);
            assert.strictEqual(firstResult.entryId, "JE_IDEMP_TEST_001");
            assert.strictEqual(firstResult.totalAmount, 100);

            // 2nd Call with identical payload and entryId
            const secondResult = await postJournalEntry(entryPayload);
            assert.strictEqual(secondResult.success, true);
            assert.strictEqual(secondResult.entryId, "JE_IDEMP_TEST_001");
            assert.strictEqual(secondResult.alreadyProcessed, true, "Must flag alreadyProcessed on idempotency match");
            assert.strictEqual(secondResult.alreadyExists, true);

            // Verify only 1 JE and only 2 lines exist
            const jeTable = getTable('journal_entries');
            assert.ok(jeTable.get('JE_IDEMP_TEST_001'));

            const linesTable = getTable('journal_entries/JE_IDEMP_TEST_001/lines');
            assert.strictEqual(linesTable.size, 2, "Lines must not be duplicated on replay");

            pass("Test (c): Duplicate idempotency key safely returns alreadyProcessed without duplicate records");
        } catch (err) {
            fail("Test (c): Duplicate idempotency key safely returns alreadyProcessed without duplicate records", err);
        }

        // =================================================================
        // TEST (d): Fiscal period locked -> caller ke writes rollback
        // =================================================================
        try {
            const periodTable = getTable('fiscal_periods');
            periodTable.set('2026-09', {
                periodId: '2026-09',
                isClosed: true,
                status: 'LOCKED'
            });

            const userTable = getTable('users');
            userTable.set('user_wallet_test_d', {
                walletBalance: 500,
                name: "Farmer Mahesh"
            });

            let lockedError = null;
            try {
                await adminModule.db.runTransaction(async (tx) => {
                    const userRef = adminModule.db.collection('users').doc('user_wallet_test_d');
                    const userSnap = await tx.get(userRef);

                    // Post to LOCKED fiscal period (performs reads, encounters locked period, throws FISCAL_PERIOD_LOCKED)
                    await postJournalEntry({
                        entryId: "JE_LOCKED_PERIOD_001",
                        periodId: "2026-09",
                        date: new Date("2026-09-15"),
                        refType: "WALLET_TRANSACTION",
                        refId: "WTX_LOCKED",
                        lines: [
                            { accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 50, credit: 0 },
                            { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 50 }
                        ]
                    }, null, tx);

                    // Stage a balance change (unreachable due to error)
                    tx.set(userRef, { walletBalance: userSnap.data().walletBalance - 50 }, { merge: true });
                });
            } catch (err) {
                lockedError = err;
            }

            assert.ok(lockedError, "Should throw on locked fiscal period");
            assert.strictEqual(lockedError.code, "FISCAL_PERIOD_LOCKED");

            // Verify rollback: user wallet balance remains 500
            const userAfter = userTable.get('user_wallet_test_d');
            assert.strictEqual(userAfter.walletBalance, 500, "Wallet balance must NOT mutate when fiscal period is locked");

            // Verify journal entry not written
            const jeTable = getTable('journal_entries');
            assert.strictEqual(jeTable.get('JE_LOCKED_PERIOD_001'), undefined);

            pass("Test (d): Locked fiscal period aborts transaction and rolls back caller's writes");
        } catch (err) {
            fail("Test (d): Locked fiscal period aborts transaction and rolls back caller's writes", err);
        }

        // =================================================================
        // TEST (e): Strict reads-before-writes order verification
        // =================================================================
        try {
            // Part 1: Verify transaction tracker catches reads after writes
            let trackerCaught = false;
            try {
                await adminModule.db.runTransaction(async (tx) => {
                    const dummyRef = adminModule.db.collection('users').doc('dummy');
                    tx.set(dummyRef, { test: 1 });
                    await tx.get(dummyRef); // Must trigger READ_AFTER_WRITE
                });
            } catch (err) {
                if (err.code === "READ_AFTER_WRITE") {
                    trackerCaught = true;
                }
            }
            assert.strictEqual(trackerCaught, true, "Transaction tracker must strictly enforce reads before writes");

            // Part 2: Verify postJournalEntry executes all its reads before any writes inside caller transaction
            await adminModule.db.runTransaction(async (tx) => {
                // Caller reads first
                const userRef = adminModule.db.collection('users').doc('user_wallet_test_a');
                const userSnap = await tx.get(userRef);
                assert.ok(userSnap.exists);

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
                tx.set(userRef, { lastUpdated: "2026-10-14" }, { merge: true });
            });

            pass("Test (e): Strict reads-before-writes ordering respected by postJournalEntry");
        } catch (err) {
            fail("Test (e): Strict reads-before-writes ordering respected by postJournalEntry", err);
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

            // Verify legacy caller invocation without tx (context = null, isolated internal transaction)
            const legacyCallResult = await postJournalEntry({
                entryId: "JE_LEGACY_CALLER_001",
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

            // Verify legacy context with auth role passes
            const legacyWithContext = await postJournalEntry({
                entryId: "JE_LEGACY_WITH_CONTEXT",
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

            pass("Test (f): Legacy callers compatible and new CoA accounts validated successfully");
        } catch (err) {
            fail("Test (f): Legacy callers compatible and new CoA accounts validated successfully", err);
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
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

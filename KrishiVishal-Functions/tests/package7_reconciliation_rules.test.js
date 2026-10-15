/**
 * Package 7 Test Suite: Automated Nightly Reconciliation, System 1 Freeze, Security Rules Lockdown & Go-Live Finalization
 * 
 * Verifies:
 * (a) Nightly Financial Reconciliation - Discrepancy Detection: Injected discrepancy generates P0_CRITICAL reconciliation_alert
 * (b) Nightly Financial Reconciliation - Zero Discrepancy: Balanced state generates clean reconciliation_log audit record
 * (c) Security Rules: Direct client update to users/{userId}.walletBalance / pendingPromoClawback fails with PERMISSION_DENIED
 * (d) Security Rules: Direct client write to wallet_transactions, rider_transactions, journal_entries, cash_settlements fails with PERMISSION_DENIED
 * (e) System 1 Freeze: Legacy writers (postLedgerEntry, updateAccountBalance) throw SYSTEM_1_FROZEN error; triggers no-op cleanly
 * 
 * RUN COMMAND:
 * firebase emulators:exec --only firestore "node tests/package7_reconciliation_rules.test.js"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// HARD EMULATOR GUARD
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: Package 7 tests MUST run against the Firestore emulator.");
    console.error("Please run with: firebase emulators:exec --only firestore \"node tests/package7_reconciliation_rules.test.js\"");
    process.exit(1);
}

const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("../finance/generalLedger");
const { reconcileDailyLedgerCore } = require("../finance/nightlyReconciliation");
const { postLedgerEntry, updateAccountBalance, onOrderPaidLedger, onCashDepositVerified, freezeSystem1 } = require("../finance/ledger");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");

console.log("=========================================================================================");
console.log("=== PACKAGE 7: NIGHTLY RECONCILIATION, SYSTEM 1 FREEZE & RULES LOCKDOWN SUITE        ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                                           ===");
console.log("=========================================================================================\n");
console.log(`[Emulator Verification] Connected to REAL Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`[Project ID] ${process.env.GCLOUD_PROJECT || "krishivishal-a9ed7"}\n`);

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
}

async function clearEmulatorData() {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
        const axios = require("axios");
        const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
        const projectId = process.env.GCLOUD_PROJECT || "krishivishal-a9ed7";
        try {
            await axios.delete(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`);
            console.log(`[Emulator Reset] Successfully cleared Firestore emulator data via REST API (${emulatorHost})`);
        } catch (e) {
            console.warn(`[Emulator Reset] REST delete failed (${e.message}), running collection fallback purge`);
            const collections = ["users", "riders", "journal_entries", "reconciliation_alerts", "reconciliation_logs", "orders", "wallet_transactions", "rider_transactions", "cash_settlements", "payout_requests", "rider_payouts"];
            for (const col of collections) {
                const snap = await db.collection(col).get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }
        }
    }
}

async function runTests() {
    // Reset emulator data before test suite runs to ensure deterministic isolation
    await clearEmulatorData();

    const now = new Date();
    const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Setup: Ensure current fiscal period is unlocked for System 2 entries
    await db.collection("fiscal_periods").doc(periodId).set({
        status: "OPEN",
        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // =========================================================================
    // TEST (a): NIGHTLY RECONCILIATION - ARTIFICIAL DISCREPANCY DETECTION
    // =========================================================================
    console.log("--- TEST (a): Nightly Reconciliation Discrepancy Detection & Alert Generation ---");
    try {
        const testUserUid = `user_recon_disc_${Date.now()}`;
        // Create user with ₹1,500 wallet balance but zero corresponding liability entry in General Ledger
        await db.collection("users").doc(testUserUid).set({
            uid: testUserUid,
            name: "Recon Test User Discrepancy",
            phone: "+919876543210",
            walletBalance: 1500,
            isTestRecord: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Run reconciliation core
        const reconResult = await reconcileDailyLedgerCore({ triggeredBy: "TEST_SUITE_DISCREPANCY" });

        assert.strictEqual(reconResult.balanced, false, "Reconciliation must detect invariant discrepancy");
        assert.ok(reconResult.alertId, "Alert ID must be returned on discrepancy");
        assert.ok(reconResult.checks.wallet.diff >= 1500, "Wallet diff must account for user balance");

        // Verify alert document in reconciliation_alerts collection
        const alertDoc = await db.collection("reconciliation_alerts").doc(reconResult.alertId).get();
        assert.ok(alertDoc.exists, "reconciliation_alerts document must exist in Firestore");
        const alertData = alertDoc.data();
        assert.strictEqual(alertData.status, "UNRESOLVED");
        assert.strictEqual(alertData.severity, "P0_CRITICAL");
        assert.ok(alertData.message.includes("CRITICAL: Nightly financial reconciliation detected discrepancy"));

        pass("Test (a): Artificial discrepancy correctly detected and P0_CRITICAL reconciliation_alert persisted");
    } catch (err) {
        fail("Test (a): Discrepancy detection failed", err);
    }

    // =========================================================================
    // TEST (b): NIGHTLY RECONCILIATION - ZERO DISCREPANCY AUDIT LOG
    // =========================================================================
    console.log("\n--- TEST (b): Nightly Reconciliation Zero Discrepancy Clean Audit Log ---");
    try {
        // Step 1: Clean users collection of non-test records or align balance
        const allUsers = await db.collection("users").get();
        for (const uDoc of allUsers.docs) {
            // Mark existing user docs as test records so we have a perfectly clean canvas
            await uDoc.ref.update({ isTestRecord: true });
        }

        const allRiders = await db.collection("riders").get();
        for (const rDoc of allRiders.docs) {
            await rDoc.ref.update({ isTestRecord: true });
        }

        // Step 2: Create exactly 1 canonical user and 1 canonical rider with matching GL entries
        const cleanUserUid = `user_recon_clean_${Date.now()}`;
        const cleanRiderId = `rider_recon_clean_${Date.now()}`;

        await db.collection("users").doc(cleanUserUid).set({
            uid: cleanUserUid,
            name: "Clean User",
            phone: "+919123456780",
            walletBalance: 500,
            isTestRecord: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("riders").doc(cleanRiderId).set({
            riderId: cleanRiderId,
            name: "Clean Rider",
            phone: "+919123456781",
            cash_in_hand: 300,
            isTestRecord: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Calculate current GL closing balances
        const { getLedgerExtractCore } = require("../finance/generalLedger");
        const currentWalletExt = await getLedgerExtractCore({ accountCode: "2065_CUSTOMER_WALLET_LIABILITY" });
        const currentRiderExt = await getLedgerExtractCore({ accountCode: "1010_CASH_IN_HAND_RIDERS" });

        // Post balancing System 2 entry to make GL liability match user balance (₹500) and GL rider cash match rider cash (₹300)
        const walletDelta = 500 - (Number(currentWalletExt.closingBalance) || 0);
        const riderDelta = 300 - (Number(currentRiderExt.closingBalance) || 0);

        const jeLines = [];
        if (Math.abs(walletDelta) > 0.001) {
            if (walletDelta > 0) {
                // Credit 2065 to increase liability, Debit 1020 cash vault
                jeLines.push({ accountCode: "1020_HUB_CASH_VAULT", debit: walletDelta, credit: 0, description: "Recon True-Up Debit" });
                jeLines.push({ accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: 0, credit: walletDelta, description: "Recon True-Up Credit" });
            } else {
                const absDelta = Math.abs(walletDelta);
                jeLines.push({ accountCode: "2065_CUSTOMER_WALLET_LIABILITY", debit: absDelta, credit: 0, description: "Recon True-Up Debit" });
                jeLines.push({ accountCode: "1020_HUB_CASH_VAULT", debit: 0, credit: absDelta, description: "Recon True-Up Credit" });
            }
        }

        if (Math.abs(riderDelta) > 0.001) {
            if (riderDelta > 0) {
                // Debit 1010 to increase asset, Credit 4010 or 1020
                jeLines.push({ accountCode: "1010_CASH_IN_HAND_RIDERS", debit: riderDelta, credit: 0, description: "Rider Recon True-Up Debit" });
                jeLines.push({ accountCode: "1020_HUB_CASH_VAULT", debit: 0, credit: riderDelta, description: "Rider Recon True-Up Credit" });
            } else {
                const absRiderDelta = Math.abs(riderDelta);
                jeLines.push({ accountCode: "1020_HUB_CASH_VAULT", debit: absRiderDelta, credit: 0, description: "Rider Recon True-Up Debit" });
                jeLines.push({ accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: absRiderDelta, description: "Rider Recon True-Up Credit" });
            }
        }

        if (jeLines.length >= 2) {
            await postJournalEntry({
                entryId: `JE_RECON_TRUEUP_${Date.now()}`,
                refType: "BANK_RECONCILIATION",
                refId: `RECON_ALIGN_${Date.now()}`,
                periodId,
                date: new Date(),
                memo: "Nightly Recon Calibration Entry",
                lines: jeLines,
                createdBy: "RECON_TEST"
            });
        }

        // Run reconciliation core
        const cleanResult = await reconcileDailyLedgerCore({ triggeredBy: "TEST_SUITE_CLEAN" });

        assert.strictEqual(cleanResult.balanced, true, `All invariants must balance: ${JSON.stringify(cleanResult.checks)}`);
        assert.ok(cleanResult.logId, "Log ID must be returned on zero discrepancy");
        assert.strictEqual(cleanResult.checks.wallet.balanced, true);
        assert.strictEqual(cleanResult.checks.riderCash.balanced, true);
        assert.strictEqual(cleanResult.checks.generalLedger.balanced, true);

        // Verify audit log document in reconciliation_logs collection
        const logDoc = await db.collection("reconciliation_logs").doc(cleanResult.logId).get();
        assert.ok(logDoc.exists, "reconciliation_logs document must exist in Firestore");
        const logData = logDoc.data();
        assert.strictEqual(logData.status, "BALANCED");
        assert.strictEqual(logData.message, "All financial invariants verified successfully. Zero discrepancy.");

        pass("Test (b): Zero discrepancy case verified clean reconciliation_logs audit document");
    } catch (err) {
        fail("Test (b): Zero discrepancy verification failed", err);
    }

    // =========================================================================
    // TEST (c) & (d): FIRESTORE SECURITY RULES LOCKDOWN
    // =========================================================================
    console.log("\n--- TEST (c) & (d): Firestore Security Rules Final Lockdown ---");
    let testEnv = null;
    try {
        const rulesPath = path.resolve(__dirname, "../../firestore.rules");
        const rulesContent = fs.readFileSync(rulesPath, "utf8");

        testEnv = await initializeTestEnvironment({
            projectId: process.env.GCLOUD_PROJECT || "krishivishal-a9ed7",
            firestore: {
                rules: rulesContent
            }
        });

        const targetUserUid = `client_user_${Date.now()}`;
        // Seed baseline document with rules disabled
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminFs = context.firestore();
            await adminFs.collection("users").doc(targetUserUid).set({
                uid: targetUserUid,
                name: "Client Test User",
                phone: "+919988776655",
                walletBalance: 250,
                role: "Customer"
            });
        });

        // Client contexts
        const ownerClient = testEnv.authenticatedContext(targetUserUid);
        const superAdminClient = testEnv.authenticatedContext("super_admin_user", {
            role: "SuperAdmin",
            isSuperAdmin: true
        });

        // TEST (c): Client write to users.walletBalance fails with PERMISSION_DENIED
        await assertFails(
            ownerClient.firestore().collection("users").doc(targetUserUid).update({
                walletBalance: 99999
            })
        );
        pass("Test (c.1): Customer client write to users.walletBalance strictly blocked (PERMISSION_DENIED)");

        await assertFails(
            ownerClient.firestore().collection("users").doc(targetUserUid).update({
                pendingPromoClawback: 500
            })
        );
        pass("Test (c.2): Customer client write to users.pendingPromoClawback strictly blocked (PERMISSION_DENIED)");

        // SuperAdmin client also cannot mutate walletBalance directly from client SDK
        await assertFails(
            superAdminClient.firestore().collection("users").doc(targetUserUid).update({
                walletBalance: 5000
            })
        );
        pass("Test (c.3): SuperAdmin client write to users.walletBalance strictly blocked (PERMISSION_DENIED)");

        // Customer CAN update safe profile fields like name
        await assertSucceeds(
            ownerClient.firestore().collection("users").doc(targetUserUid).update({
                name: "Updated Client Name"
            })
        );
        pass("Test (c.4): Customer can still update non-financial profile fields (name)");

        // TEST (d): Client write to financial collections strictly blocked
        // 1. wallet_transactions
        await assertFails(
            ownerClient.firestore().collection("wallet_transactions").doc("txn_hack").set({
                uid: targetUserUid,
                amount: 1000,
                type: "CREDIT"
            })
        );
        pass("Test (d.1): Client write to wallet_transactions strictly blocked (allow write: if false)");

        // 2. rider_transactions
        await assertFails(
            ownerClient.firestore().collection("rider_transactions").doc("rtxn_hack").set({
                riderId: "rider_hack",
                amount: 1000,
                type: "CREDIT"
            })
        );
        pass("Test (d.2): Client write to rider_transactions strictly blocked (allow write: if false)");

        // 3. journal_entries & lines
        await assertFails(
            superAdminClient.firestore().collection("journal_entries").doc("je_hack").set({
                refType: "CAPITAL",
                totalAmount: 500000
            })
        );
        await assertFails(
            superAdminClient.firestore().collection("journal_entries").doc("je_hack").collection("lines").doc("line_1").set({
                debit: 500000
            })
        );
        pass("Test (d.3): Client write to journal_entries and lines strictly blocked (allow write: if false)");

        // 4. cash_settlements
        await assertFails(
            ownerClient.firestore().collection("cash_settlements").doc("settle_hack").set({
                riderId: targetUserUid,
                amount: 1000
            })
        );
        pass("Test (d.4): Client write to cash_settlements strictly blocked (allow write: if false)");

        // 5. payout_requests
        await assertFails(
            superAdminClient.firestore().collection("payout_requests").doc("payout_hack").set({
                riderId: "rider_1",
                amount: 5000
            })
        );
        pass("Test (d.5): Client write to payout_requests strictly blocked (allow write: if false)");

        // 6. users/{uid}/wallet_history
        await assertFails(
            ownerClient.firestore().collection("users").doc(targetUserUid).collection("wallet_history").doc("wh_hack").set({
                amount: 500
            })
        );
        pass("Test (d.6): Client write to users/{uid}/wallet_history strictly blocked (allow write: if false)");

    } catch (err) {
        fail("Test (c) & (d): Security rules verification failed", err);
    } finally {
        if (testEnv) {
            await testEnv.cleanup();
        }
    }

    // =========================================================================
    // TEST (e): SYSTEM 1 FREEZE GUARD
    // =========================================================================
    console.log("\n--- TEST (e): System 1 Freeze Guard Verification ---");
    try {
        freezeSystem1(true);

        // 1. postLedgerEntry throws SYSTEM_1_FROZEN
        let postLedgerThrew = false;
        try {
            await postLedgerEntry({
                account: "CASH_IN_HAND",
                type: "DEBIT",
                amount: 500,
                description: "Legacy freeze test entry"
            });
        } catch (err) {
            postLedgerThrew = true;
            assert.strictEqual(err.code, "SYSTEM_1_FROZEN");
            assert.ok(err.message.includes("Legacy System 1 ledger writes are permanently deprecated"));
        }
        assert.strictEqual(postLedgerThrew, true, "postLedgerEntry must throw SYSTEM_1_FROZEN");
        pass("Test (e.1): postLedgerEntry strictly rejected with SYSTEM_1_FROZEN error");

        // 2. updateAccountBalance throws SYSTEM_1_FROZEN
        let updateBalThrew = false;
        try {
            await updateAccountBalance();
        } catch (err) {
            updateBalThrew = true;
            assert.strictEqual(err.code, "SYSTEM_1_FROZEN");
            assert.ok(err.message.includes("Legacy System 1 account balance updates are permanently deprecated"));
        }
        assert.strictEqual(updateBalThrew, true, "updateAccountBalance must throw SYSTEM_1_FROZEN");
        pass("Test (e.2): updateAccountBalance strictly rejected with SYSTEM_1_FROZEN error");

        // 3. onOrderPaidLedger trigger returns null cleanly without writing to ledger
        const fakeOrderEvent = {
            data: {
                before: { data: () => ({ paymentStatus: "PENDING" }) },
                after: { data: () => ({ paymentStatus: "PAID", totalAmount: 1000, items: [] }), ref: db.collection("orders").doc("ord_test") }
            },
            params: { orderId: "ord_test" }
        };
        const orderResult = await onOrderPaidLedger.run(fakeOrderEvent);
        assert.strictEqual(orderResult, null, "onOrderPaidLedger must no-op cleanly");
        pass("Test (e.3): onOrderPaidLedger trigger permanently frozen (clean no-op)");

        // 4. onCashDepositVerified trigger returns null cleanly without writing to ledger
        const fakeDepositEvent = {
            data: {
                before: { data: () => ({ status: "PENDING" }) },
                after: { data: () => ({ status: "VERIFIED", amount: 2000, orderIds: [] }), ref: db.collection("cash_deposits").doc("dep_test") }
            },
            params: { depositId: "dep_test" }
        };
        const depositResult = await onCashDepositVerified.run(fakeDepositEvent);
        assert.strictEqual(depositResult, null, "onCashDepositVerified must no-op cleanly");
        pass("Test (e.4): onCashDepositVerified trigger permanently frozen (clean no-op)");

    } catch (err) {
        fail("Test (e): System 1 freeze guard verification failed", err);
    } finally {
        freezeSystem1(false);
    }

    // =========================================================================
    // FINAL SUITE REPORT
    // =========================================================================
    console.log("\n=========================================================================================");
    console.log(`PACKAGE 7 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
    console.log("=========================================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Fatal error during Package 7 test suite execution:", err);
    process.exit(1);
});

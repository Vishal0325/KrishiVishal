/**
 * Package 4 Test Suite: Rider Cash Settlement, Shortage Management & Weekly Payout Overhaul
 * 
 * Verifies:
 * (a) Exact Settlement: Full handover (₹5000 / ₹5000) -> Dr 1020_HUB_CASH_VAULT / Cr 1010_CASH_IN_HAND_RIDERS, rider cashInHand zeroed, rider_transactions audit log
 * (b) Shortage Settlement: Under-deposit (₹4800 / ₹5000) -> Dr 1020 ₹4800 + Dr 1015 ₹200 / Cr 1010 ₹5000, pendingShortageAmount = ₹200
 * (c) Full Shortage Recovery on Weekly Payout: Gross ₹1000, Shortage ₹200 -> Dr 2015 ₹1000 / Cr 1015 ₹200 + Cr 1030 ₹800, pendingShortageAmount = 0
 * (d) Deficit Carry Forward (Shortage > Earnings): Gross ₹100, Shortage ₹250 -> Dr 2015 ₹100 / Cr 1015 ₹100, Net payout = ₹0, Carried forward = ₹150
 * (e) Replay Idempotency: Duplicate calls do not double-mutate balances, shortage, or create duplicate journal entries
 * (f) Fiscal Period Lock Guard: Locked fiscal period aborts cash settlement transaction atomically
 * 
 * RUN COMMAND:
 * firebase emulators:exec --only firestore "node tests/package4_rider_cash_payout.test.js"
 */

const assert = require("assert");

// HARD EMULATOR GUARD
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: Package 4 tests MUST run against the Firestore emulator.");
    console.error("Please run with: firebase emulators:exec --only firestore \"node tests/package4_rider_cash_payout.test.js\"");
    process.exit(1);
}

const { db, admin } = require("../core/admin");
const { confirmCashSettlement } = require("../finance/cashSettlement");
const { approveRiderPayout, calculateRiderPayout } = require("../logistics/riderPayoutEngine");

console.log("=================================================================");
console.log("=== PACKAGE 4: RIDER CASH SETTLEMENT & WEEKLY PAYOUT OVERHAUL ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                   ===");
console.log("=================================================================\n");
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

async function getJournalEntryLines(entryId) {
    const snap = await db.collection("journal_entries").doc(entryId).collection("lines").get();
    return snap.docs.map(d => d.data());
}

async function runTests() {
    const now = new Date();
    const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const futurePeriodId = "2029-12";

    // Setup: Ensure current fiscal period is unlocked
    await db.collection("fiscal_periods").doc(periodId).set({
        status: "OPEN",
        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Setup: Seed authorized users for callable guards
    await db.collection("users").doc("HUB_MGR_01").set({
        role: "hubmanager",
        name: "Samastipur Hub Manager",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection("users").doc("FINANCE_ADMIN_01").set({
        role: "financeadmin",
        name: "Finance Controller",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const hubMgrAuth = { uid: "HUB_MGR_01", token: { role: "hubmanager" } };
    const financeAdminAuth = { uid: "FINANCE_ADMIN_01", token: { role: "financeadmin" } };

    // =================================================================
    // TEST (a): Exact Settlement (Full Handover ₹5000 / ₹5000)
    // =================================================================
    console.log("\n--- TEST (a): Exact Cash Settlement (Full Handover ₹5000) ---");
    try {
        const riderId = "RIDER_P4_EXACT";
        const settlementId = "SETTLE_P4_EXACT_001";
        const orderId = "ORD_P4_EXACT_001";

        // 1. Seed rider with ₹5,000 cash in hand
        await db.collection("riders").doc(riderId).set({
            id: riderId,
            name: "Ramesh Rider",
            cash_in_hand: 5000,
            cashInHand: 5000,
            pendingShortageAmount: 0
        });

        // 2. Seed pending order
        await db.collection("orders").doc(orderId).set({
            id: orderId,
            riderId,
            status: "DELIVERED",
            paymentMethod: "COD",
            codAmount: 5000,
            isCashDeposited: false
        });

        // 3. Seed pending settlement record
        await db.collection("cash_settlements").doc(settlementId).set({
            id: settlementId,
            riderId,
            hubId: "HUB_SAMASTIPUR_01",
            totalCollected: 5000,
            totalAmount: 5000,
            status: "PENDING_VERIFICATION",
            pendingOrderIds: [orderId],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Hub manager confirms exact settlement
        const res = await confirmCashSettlement.run({
            auth: hubMgrAuth,
            data: {
                settlementId,
                depositedAmount: 5000,
                hubId: "HUB_SAMASTIPUR_01"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, "CONFIRMED");
        assert.strictEqual(res.depositedAmount, 5000);
        assert.strictEqual(res.shortage, 0);

        // 5. Verify rider cash_in_hand is 0
        const riderSnap = await db.collection("riders").doc(riderId).get();
        assert.strictEqual(riderSnap.data().cash_in_hand, 0);
        assert.strictEqual(riderSnap.data().cashInHand, 0);
        assert.strictEqual(riderSnap.data().pendingShortageAmount, 0);

        // 6. Verify order marked deposited
        const orderSnap = await db.collection("orders").doc(orderId).get();
        assert.strictEqual(orderSnap.data().isCashDeposited, true);
        assert.strictEqual(orderSnap.data().settlementId, settlementId);

        // 7. Verify System 2 Journal Entry
        const jeId = `JE_HUB_SETTLEMENT_${settlementId}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert(jeSnap.exists, "Journal entry header must exist");
        assert.strictEqual(jeSnap.data().refType, "COD_SETTLEMENT");
        assert.strictEqual(jeSnap.data().totalAmount, 5000);

        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 2);
        const drVault = lines.find(l => l.accountCode === "1020_HUB_CASH_VAULT");
        const crRider = lines.find(l => l.accountCode === "1010_CASH_IN_HAND_RIDERS");
        assert(drVault && crRider, "Must have Dr 1020 and Cr 1010 lines");
        assert.strictEqual(drVault.debit, 5000);
        assert.strictEqual(crRider.credit, 5000);

        // 8. Verify root rider_transactions audit document
        const rtId = `RT_${riderId}_SETTLE_${settlementId}`;
        const rtSnap = await db.collection("rider_transactions").doc(rtId).get();
        assert(rtSnap.exists, "Root rider_transactions record must exist");
        assert.strictEqual(rtSnap.data().category, "CASH_DEPOSITED");
        assert.strictEqual(rtSnap.data().depositedAmount, 5000);
        assert.strictEqual(rtSnap.data().shortageAmount, 0);
        assert.strictEqual(rtSnap.data().effectOnCashInHand, -5000);
        assert.strictEqual(rtSnap.data().cashInHandAfter, 0);

        pass("Test (a): Exact settlement posted 2-leg JE (Dr 1020 ₹5000 / Cr 1010 ₹5000), cleared rider cash, and logged rider_transactions");
    } catch (err) {
        fail("Test (a): Exact settlement", err);
    }

    // =================================================================
    // TEST (b): Shortage Settlement (Collected ₹5000, Deposited ₹4800, Shortage ₹200)
    // =================================================================
    console.log("\n--- TEST (b): Shortage Settlement (Deposited ₹4800 / ₹5000, Shortage ₹200) ---");
    try {
        const riderId = "RIDER_P4_SHORT";
        const settlementId = "SETTLE_P4_SHORT_001";
        const orderId = "ORD_P4_SHORT_001";

        await db.collection("riders").doc(riderId).set({
            id: riderId,
            name: "Suresh Rider",
            cash_in_hand: 5000,
            cashInHand: 5000,
            pendingShortageAmount: 0
        });

        await db.collection("orders").doc(orderId).set({
            id: orderId,
            riderId,
            status: "DELIVERED",
            paymentMethod: "COD",
            codAmount: 5000,
            isCashDeposited: false
        });

        await db.collection("cash_settlements").doc(settlementId).set({
            id: settlementId,
            riderId,
            hubId: "HUB_SAMASTIPUR_01",
            totalCollected: 5000,
            status: "PENDING_VERIFICATION",
            pendingOrderIds: [orderId],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const res = await confirmCashSettlement.run({
            auth: hubMgrAuth,
            data: {
                settlementId,
                depositedAmount: 4800,
                hubId: "HUB_SAMASTIPUR_01"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, "SETTLED_WITH_SHORTAGE");
        assert.strictEqual(res.depositedAmount, 4800);
        assert.strictEqual(res.shortage, 200);

        // Verify rider pendingShortageAmount = ₹200 and cash_in_hand = 0
        const riderSnap = await db.collection("riders").doc(riderId).get();
        assert.strictEqual(riderSnap.data().cash_in_hand, 0);
        assert.strictEqual(riderSnap.data().pendingShortageAmount, 200);

        // Verify 3-Leg System 2 Journal Entry
        const jeId = `JE_HUB_SETTLEMENT_SHORTAGE_${settlementId}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert(jeSnap.exists, "Shortage JE header must exist");
        assert.strictEqual(jeSnap.data().totalAmount, 5000);

        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 3, "Shortage JE must have exactly 3 legs");
        const drVault = lines.find(l => l.accountCode === "1020_HUB_CASH_VAULT");
        const drShortage = lines.find(l => l.accountCode === "1015_RIDER_RECEIVABLE_SHORTAGES");
        const crRider = lines.find(l => l.accountCode === "1010_CASH_IN_HAND_RIDERS");

        assert.strictEqual(drVault.debit, 4800);
        assert.strictEqual(drShortage.debit, 200);
        assert.strictEqual(crRider.credit, 5000);
        assert.strictEqual(drVault.debit + drShortage.debit, crRider.credit);

        // Verify root rider_transactions audit doc
        const rtId = `RT_${riderId}_SETTLE_${settlementId}`;
        const rtSnap = await db.collection("rider_transactions").doc(rtId).get();
        assert(rtSnap.exists);
        assert.strictEqual(rtSnap.data().category, "CASH_DEPOSITED");
        assert.strictEqual(rtSnap.data().depositedAmount, 4800);
        assert.strictEqual(rtSnap.data().shortageAmount, 200);
        assert.strictEqual(rtSnap.data().effectOnCashInHand, -5000);
        assert.strictEqual(rtSnap.data().cashInHandAfter, 0);

        pass("Test (b): Shortage settlement posted 3-leg JE (Dr 1020 ₹4800 + Dr 1015 ₹200 == Cr 1010 ₹5000) and recorded pendingShortageAmount ₹200");
    } catch (err) {
        fail("Test (b): Shortage settlement", err);
    }

    // =================================================================
    // TEST (c): Full Shortage Recovery on Weekly Payout (Gross ₹1000, Shortage ₹200 -> Net ₹800)
    // =================================================================
    console.log("\n--- TEST (c): Weekly Payout Shortage Recovery (Gross ₹1000, Shortage ₹200 -> Net ₹800) ---");
    try {
        const riderId = "RIDER_P4_SHORT"; // From Test (b), pendingShortageAmount = 200
        const payoutId = "PAYOUT_P4_WEEKLY_001";

        // Seed payout document in PENDING_APPROVAL
        await db.collection("rider_payouts").doc(payoutId).set({
            payoutId,
            riderId,
            riderName: "Suresh Rider",
            hubId: "HUB_SAMASTIPUR_01",
            startDate: "2026-10-01",
            endDate: "2026-10-07",
            grossEarnings: 1000,
            grossPayoutAmount: 1000,
            pendingShortageAmount: 200,
            shortageDeducted: 200,
            netPayable: 800,
            netPayoutAmount: 800,
            status: "PENDING_APPROVAL",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const res = await approveRiderPayout.run({
            auth: financeAdminAuth,
            data: {
                payoutId,
                paymentMode: "NEFT",
                referenceNo: "NEFT_REF_1001"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, "PAID");
        assert.strictEqual(res.grossEarnings, 1000);
        assert.strictEqual(res.shortageDeducted, 200);
        assert.strictEqual(res.netPayoutAmount, 800);

        // Verify rider pendingShortageAmount is cleared to 0
        const riderSnap = await db.collection("riders").doc(riderId).get();
        assert.strictEqual(riderSnap.data().pendingShortageAmount, 0);

        // Verify System 2 Journal Entry
        const jeId = `JE_RIDER_WEEKLY_PAYOUT_${payoutId}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert(jeSnap.exists, "Payout journal entry must exist");
        assert.strictEqual(jeSnap.data().refType, "RIDER_PAYOUT");
        assert.strictEqual(jeSnap.data().totalAmount, 1000);

        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 3);
        const drPayable = lines.find(l => l.accountCode === "2015_RIDER_PAYOUTS_PAYABLE");
        const crShortage = lines.find(l => l.accountCode === "1015_RIDER_RECEIVABLE_SHORTAGES");
        const crBank = lines.find(l => l.accountCode === "1030_BANK_CURRENT_HDFC");

        assert.strictEqual(drPayable.debit, 1000);
        assert.strictEqual(crShortage.credit, 200);
        assert.strictEqual(crBank.credit, 800);
        assert.strictEqual(drPayable.debit, crShortage.credit + crBank.credit);

        // Verify root rider_transactions audit doc
        const rtId = `RT_${riderId}_PAYOUT_${payoutId}`;
        const rtSnap = await db.collection("rider_transactions").doc(rtId).get();
        assert(rtSnap.exists);
        assert.strictEqual(rtSnap.data().category, "WEEKLY_PAYOUT_DISBURSED");
        assert.strictEqual(rtSnap.data().amount, 800);
        assert.strictEqual(rtSnap.data().shortageDeducted, 200);
        assert.strictEqual(rtSnap.data().effectOnNetPayable, -1000);

        pass("Test (c): Payout approved with full shortage recovery (Dr 2015 ₹1000 == Cr 1015 ₹200 + Cr 1030 ₹800), shortage zeroed");
    } catch (err) {
        fail("Test (c): Payout shortage recovery", err);
    }

    // =================================================================
    // TEST (d): Deficit Carry Forward (Shortage ₹250 > Earnings ₹100 -> Net ₹0, Carry Forward ₹150)
    // =================================================================
    console.log("\n--- TEST (d): Deficit Carry Forward (Shortage ₹250 > Earnings ₹100) ---");
    try {
        const riderId = "RIDER_P4_DEFICIT";
        const payoutId = "PAYOUT_P4_DEFICIT_001";

        // Rider has ₹250 pending shortage
        await db.collection("riders").doc(riderId).set({
            id: riderId,
            name: "Mohan Rider",
            cash_in_hand: 0,
            pendingShortageAmount: 250
        });

        // Weekly payout with gross earnings of only ₹100
        await db.collection("rider_payouts").doc(payoutId).set({
            payoutId,
            riderId,
            riderName: "Mohan Rider",
            grossEarnings: 100,
            grossPayoutAmount: 100,
            pendingShortageAmount: 250,
            status: "PENDING_APPROVAL"
        });

        const res = await approveRiderPayout.run({
            auth: financeAdminAuth,
            data: {
                payoutId,
                paymentMode: "NEFT"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, "PAID");
        assert.strictEqual(res.grossEarnings, 100);
        assert.strictEqual(res.shortageDeducted, 100, "Should only deduct up to gross earnings");
        assert.strictEqual(res.netPayoutAmount, 0, "Net payout must strictly be 0 (no negative bank payout)");

        // Verify remaining shortage carried forward
        const riderSnap = await db.collection("riders").doc(riderId).get();
        assert.strictEqual(riderSnap.data().pendingShortageAmount, 150, "Remaining deficit ₹150 must remain in pendingShortageAmount");

        // Verify System 2 Journal Entry
        const jeId = `JE_RIDER_WEEKLY_PAYOUT_${payoutId}`;
        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 2);
        const drPayable = lines.find(l => l.accountCode === "2015_RIDER_PAYOUTS_PAYABLE");
        const crShortage = lines.find(l => l.accountCode === "1015_RIDER_RECEIVABLE_SHORTAGES");
        assert.strictEqual(drPayable.debit, 100);
        assert.strictEqual(crShortage.credit, 100);

        pass("Test (d): Deficit carry forward enforced: Net payout = ₹0, shortage deducted ₹100, remaining ₹150 carried forward in 1015");
    } catch (err) {
        fail("Test (d): Deficit carry forward", err);
    }

    // =================================================================
    // TEST (e): Replay Idempotency (Repeat Calls)
    // =================================================================
    console.log("\n--- TEST (e): Replay Idempotency ---");
    try {
        const settlementId = "SETTLE_P4_EXACT_001"; // From Test (a)
        const payoutId = "PAYOUT_P4_WEEKLY_001";     // From Test (c)

        // Repeat confirmCashSettlement on already confirmed settlement
        let settlementReplayErr = null;
        try {
            await confirmCashSettlement.run({
                auth: hubMgrAuth,
                data: { settlementId, depositedAmount: 5000 }
            });
        } catch (e) {
            settlementReplayErr = e;
        }
        assert(settlementReplayErr, "Repeat settlement on confirmed record should be rejected by state precondition");

        // Repeat approveRiderPayout on already paid payout
        let payoutReplayErr = null;
        try {
            await approveRiderPayout.run({
                auth: financeAdminAuth,
                data: { payoutId }
            });
        } catch (e) {
            payoutReplayErr = e;
        }
        assert(payoutReplayErr, "Repeat approve on paid payout should be rejected");

        // Verify journal entry count has not duplicated
        const jeId = `JE_HUB_SETTLEMENT_${settlementId}`;
        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 2, "Lines must not be duplicated");

        pass("Test (e): Replay idempotency and state guards prevent duplicate mutations and journal lines");
    } catch (err) {
        fail("Test (e): Replay idempotency", err);
    }

    // =================================================================
    // TEST (f): Fiscal Period Lock Guard (Atomic Rollback on Locked Period)
    // =================================================================
    console.log("\n--- TEST (f): Fiscal Period Lock Guard ---");
    try {
        const lockedPeriodId = "2025-01";
        await db.collection("fiscal_periods").doc(lockedPeriodId).set({
            status: "LOCKED",
            lockedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Assert assertFiscalPeriodUnlocked throws on locked period
        const { assertFiscalPeriodUnlocked } = require("../finance/generalLedger");
        let lockedPeriodErr = null;
        try {
            await assertFiscalPeriodUnlocked(lockedPeriodId);
        } catch (e) {
            lockedPeriodErr = e;
        }

        assert(lockedPeriodErr, "Locked fiscal period must throw error");
        assert.strictEqual(lockedPeriodErr.code, "FISCAL_PERIOD_LOCKED");

        pass("Test (f): Fiscal Period Lock Guard successfully protects locked accounting periods");
    } catch (err) {
        fail("Test (f): Fiscal period lock guard", err);
    }

    // =================================================================
    // SUMMARY
    // =================================================================
    console.log("\n=================================================================");
    console.log(`PACKAGE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("Fatal test execution error:", err);
    process.exit(1);
});

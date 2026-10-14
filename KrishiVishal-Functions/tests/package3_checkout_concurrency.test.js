/**
 * Package 3 Test Suite: Checkout Consolidation, Dual-Read History (T0), and Concurrency Testing
 * 
 * Verifies:
 * (a) 10 Parallel Debits: ₹100 balance with 10 simultaneous payWithWallet requests -> Exactly 1 success, 9 rejections, final balance ₹0.00
 * (b) Replay Idempotency: Same orderId paid twice -> Second call returns alreadyProcessed: true, zero duplicate lines or debits
 * (c) Dual-Read History Test: 2 legacy docs + 2 root docs -> Seamlessly merged in descending chronological order
 * (d) Fiscal Period Lock Test: Locked period aborts wallet payment transaction and preserves wallet balance
 * (e) Complete Prepaid Lifecycle: Wallet payment (2065 -> 2070) followed by delivery recognition (2070 -> 4010), net 2070 = 0
 * 
 * RUN COMMAND:
 * firebase emulators:exec --only firestore "node tests/package3_checkout_concurrency.test.js"
 */

const assert = require("assert");

// HARD EMULATOR GUARD
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: Package 3 tests MUST run against the Firestore emulator.");
    console.error("Please run with: firebase emulators:exec --only firestore \"node tests/package3_checkout_concurrency.test.js\"");
    process.exit(1);
}

const { db, admin } = require("../core/admin");
const { payWithWalletHandler } = require("../finance/wallet");
const { getWalletHistoryCore, WALLET_CUTOVER_T0 } = require("../finance/walletTopUp");
const walletService = require("../finance/walletService");
const { recognizeOrderDeliveryFinancials } = require("../finance/salesLedger");

console.log("=================================================================");
console.log("=== PACKAGE 3: CHECKOUT CONSOLIDATION & DUAL-READ HISTORY     ===");
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
    // 0. Connection probe
    try {
        const probeRef = db.collection("_emulator_probe").doc("p3_probe");
        await probeRef.set({ test: true, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        const probeSnap = await probeRef.get();
        assert.strictEqual(probeSnap.exists, true);
        console.log("✅ Probe check verified: Active read/write connection to Firestore Emulator confirmed.\n");
    } catch (err) {
        console.error("FATAL: Failed to connect to Firestore Emulator:", err);
        process.exit(1);
    }

    // =========================================================================
    // TEST (a): 10 Parallel Debits on ₹100 Balance (Concurrency & Double-Spend Guard)
    // =========================================================================
    try {
        console.log("--- TEST (a): 10 Parallel Debits on ₹100 Balance (Concurrency & Double-Spend Guard) ---");
        const userId = "usr_p3_conc_100";
        await db.collection("users").doc(userId).set({
            uid: userId,
            walletBalance: 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Seed 10 distinct unfulfilled orders of ₹100 each for this user
        const orderIds = [];
        for (let i = 1; i <= 10; i++) {
            const orderId = `ORD_P3_PARALLEL_${String(i).padStart(2, "0")}`;
            orderIds.push(orderId);
            await db.collection("orders").doc(orderId).set({
                orderId,
                userId,
                status: "PENDING",
                paymentStatus: "PENDING",
                totalAmount: 100,
                shippingState: "Bihar",
                items: [{ skuId: "SKU_TEST_01", name: "Seed Packet", quantity: 1, sellingPrice: 100, costPrice: 60, hsn: "1209" }],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // Fire all 10 payments simultaneously
        const paymentPromises = orderIds.map(orderId => 
            payWithWalletHandler({ orderId }, { auth: { uid: userId } })
        );

        const results = await Promise.allSettled(paymentPromises);

        const fulfilled = results.filter(r => r.status === "fulfilled");
        const rejected = results.filter(r => r.status === "rejected");

        assert.strictEqual(fulfilled.length, 1, `Exactly 1 parallel payment must succeed (got ${fulfilled.length})`);
        assert.strictEqual(rejected.length, 9, `Exactly 9 parallel payments must be rejected (got ${rejected.length})`);

        // Verify rejected reasons indicate insufficient wallet balance
        rejected.forEach(r => {
            const errMsg = r.reason?.message || "";
            assert.ok(
                errMsg.includes("Insufficient wallet balance") || errMsg.includes("INSUFFICIENT_WALLET_BALANCE"),
                `Rejected reason must mention insufficient balance, got: ${errMsg}`
            );
        });

        // Verify final wallet balance in Firestore is strictly 0.00
        const userDoc = await db.collection("users").doc(userId).get();
        assert.strictEqual(userDoc.data().walletBalance, 0, "User wallet balance must be exactly 0 after winning transaction");

        // Verify winning order in Firestore
        const winningResult = fulfilled[0].value;
        const winningOrderId = winningResult.orderId;
        const winningOrderDoc = await db.collection("orders").doc(winningOrderId).get();
        assert.strictEqual(winningOrderDoc.data().paymentStatus, "PAID", "Winning order must be marked PAID");
        assert.strictEqual(winningOrderDoc.data().paymentMethod, "WALLET", "Winning order paymentMethod must be WALLET");

        // Verify winning System 2 Journal Entry
        const winningJeDoc = await db.collection("journal_entries").doc(`JE_WALLET_ORDER_PAYMENT_${winningOrderId}`).get();
        assert.strictEqual(winningJeDoc.exists, true, "Winning Journal Entry must exist in journal_entries");
        const lines = await getJournalEntryLines(`JE_WALLET_ORDER_PAYMENT_${winningOrderId}`);
        assert.strictEqual(lines.length, 2, "Winning Journal Entry must contain exactly 2 lines");

        const lineMap = {};
        lines.forEach(l => { lineMap[l.accountCode] = l; });
        assert.strictEqual(Number(lineMap["2065_CUSTOMER_WALLET_LIABILITY"]?.debit || 0), 100, "Debit 2065 must be ₹100");
        assert.strictEqual(Number(lineMap["2070_DEFERRED_REVENUE"]?.credit || 0), 100, "Credit 2070 must be ₹100");

        // Verify remaining 9 orders remained PENDING
        for (const orderId of orderIds) {
            if (orderId === winningOrderId) continue;
            const doc = await db.collection("orders").doc(orderId).get();
            assert.strictEqual(doc.data().paymentStatus, "PENDING", `Order ${orderId} must remain PENDING`);
        }

        pass("Test (a): 10 Parallel Debits on ₹100 balance verified (Exactly 1 won, 9 rejected with insufficient balance, final balance ₹0.00, Dr 2065 / Cr 2070)");
    } catch (err) {
        fail("Test (a): 10 Parallel Debits on ₹100 Balance", err);
    }

    // =========================================================================
    // TEST (b): Replay Idempotency (Duplicate Order Payment)
    // =========================================================================
    try {
        console.log("\n--- TEST (b): Replay Idempotency (Duplicate Order Payment) ---");
        const userId = "usr_p3_replay_500";
        const orderId = "ORD_P3_REPLAY_TEST_001";
        const orderAmount = 150;

        await db.collection("users").doc(userId).set({
            uid: userId,
            walletBalance: 500,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("orders").doc(orderId).set({
            orderId,
            userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            totalAmount: orderAmount,
            shippingState: "Bihar",
            items: [{ skuId: "SKU_TEST_02", name: "Bio Fertilizer", quantity: 1, sellingPrice: 150, costPrice: 90, hsn: "3105" }],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1st Call: Initial Payment
        const res1 = await payWithWalletHandler({ orderId }, { auth: { uid: userId } });
        assert.strictEqual(res1.success, true, "First call must succeed");
        assert.strictEqual(res1.alreadyProcessed, false, "First call alreadyProcessed must be false");
        assert.strictEqual(res1.balanceBefore, 500);
        assert.strictEqual(res1.balanceAfter, 350);

        const userAfter1 = await db.collection("users").doc(userId).get();
        assert.strictEqual(userAfter1.data().walletBalance, 350, "Wallet balance must be 350 after 1st call");

        const jeId = `JE_WALLET_ORDER_PAYMENT_${orderId}`;
        const lines1 = await getJournalEntryLines(jeId);
        assert.strictEqual(lines1.length, 2, "Journal Entry must have exactly 2 lines");

        // 2nd Call: Replay with the same orderId
        const res2 = await payWithWalletHandler({ orderId }, { auth: { uid: userId } });
        assert.strictEqual(res2.success, true, "Replay call must succeed idempotently");
        assert.strictEqual(res2.alreadyProcessed, true, "Replay call must return alreadyProcessed: true");

        // Invariant: Balance must NOT be debited a second time!
        const userAfter2 = await db.collection("users").doc(userId).get();
        assert.strictEqual(userAfter2.data().walletBalance, 350, "Wallet balance must stay strictly 350 (no duplicate debit)");

        // Invariant: Journal entry lines must NOT be duplicated!
        const lines2 = await getJournalEntryLines(jeId);
        assert.strictEqual(lines2.length, 2, "Journal Entry lines subcollection must not have duplicate lines");

        pass("Test (b): Replay Idempotency verified (2nd call returns alreadyProcessed: true, balance untouched at ₹350, zero duplicate ledger lines)");
    } catch (err) {
        fail("Test (b): Replay Idempotency", err);
    }

    // =========================================================================
    // TEST (c): Dual-Read History Test ($T_0$ Cutover)
    // =========================================================================
    try {
        console.log("\n--- TEST (c): Dual-Read History Test ($T_0$ Cutover) ---");
        const userId = "usr_p3_dual_read_999";

        // Seed 2 legacy documents in subcollection `users/{uid}/wallet_history`
        const legRef1 = db.collection("users").doc(userId).collection("wallet_history").doc("leg_doc_001");
        await legRef1.set({
            id: "leg_doc_001",
            type: "REFUND_CREDIT",
            amount: 120,
            description: "Store credit for Return #RET-001",
            orderId: "ORD_LEG_001",
            returnId: "RET_LEG_001",
            timestamp: new Date("2026-09-10T10:00:00.000Z")
        });

        const legRef2 = db.collection("users").doc(userId).collection("wallet_history").doc("leg_doc_002");
        await legRef2.set({
            id: "leg_doc_002",
            type: "ORDER_PAYMENT",
            amount: 80,
            description: "Order Payment #ORD_LEG_002",
            orderId: "ORD_LEG_002",
            timestamp: new Date("2026-09-15T14:30:00.000Z")
        });

        // Seed 2 new canonical documents in root collection `wallet_transactions`
        const rootRef1 = db.collection("wallet_transactions").doc("TX_ROOT_001");
        await rootRef1.set({
            txId: "TX_ROOT_001",
            uid: userId,
            type: "CREDIT",
            eventType: "TOPUP",
            amount: 500,
            description: "Customer Topup via Gateway",
            createdAt: admin.firestore.Timestamp.fromDate(new Date("2026-10-15T09:00:00.000Z")),
            timestampMs: new Date("2026-10-15T09:00:00.000Z").getTime()
        });

        const rootRef2 = db.collection("wallet_transactions").doc("TX_ROOT_002");
        await rootRef2.set({
            txId: "TX_ROOT_002",
            uid: userId,
            type: "DEBIT",
            eventType: "ORDER_PAYMENT",
            entityId: "ORD_ROOT_002",
            metadata: { orderId: "ORD_ROOT_002" },
            amount: 250,
            description: "Order Payment for #ORD_ROOT_002",
            createdAt: admin.firestore.Timestamp.fromDate(new Date("2026-10-16T12:00:00.000Z")),
            timestampMs: new Date("2026-10-16T12:00:00.000Z").getTime()
        });

        // Execute getWalletHistoryCore
        const historyRes = await getWalletHistoryCore(userId, { limit: 10 });

        assert.strictEqual(historyRes.success, true, "getWalletHistory must succeed");
        assert.strictEqual(historyRes.transactions.length, 4, "Must seamlessly merge all 4 documents (2 legacy + 2 root)");

        // Assert chronological order: newest first
        assert.strictEqual(historyRes.transactions[0].id, "TX_ROOT_002", "1st transaction must be TX_ROOT_002 (Oct 16)");
        assert.strictEqual(historyRes.transactions[1].id, "TX_ROOT_001", "2nd transaction must be TX_ROOT_001 (Oct 15)");
        assert.strictEqual(historyRes.transactions[2].id, "leg_doc_002", "3rd transaction must be leg_doc_002 (Sep 15)");
        assert.strictEqual(historyRes.transactions[3].id, "leg_doc_001", "4th transaction must be leg_doc_001 (Sep 10)");

        // Assert uniform schema compatibility with Customer App Android WalletRepository
        historyRes.transactions.forEach(t => {
            assert.ok(typeof t.id === "string" && t.id.length > 0, "id must be non-empty string");
            assert.ok(typeof t.type === "string" && t.type.length > 0, "type must be non-empty string");
            assert.ok(typeof t.amount === "number" && t.amount > 0, "amount must be positive number");
            assert.ok(typeof t.description === "string", "description must be string");
            assert.ok(t.timestamp !== undefined, "timestamp must be defined");
        });

        assert.strictEqual(historyRes.transactions[0].type, "ORDER_PAYMENT");
        assert.strictEqual(historyRes.transactions[1].type, "TOPUP");
        assert.strictEqual(historyRes.transactions[2].type, "ORDER_PAYMENT");
        assert.strictEqual(historyRes.transactions[3].type, "REFUND_CREDIT");

        pass("Test (c): Dual-Read History ($T_0$) verified (2 legacy + 2 root merged chronologically with uniform Customer App schema)");
    } catch (err) {
        fail("Test (c): Dual-Read History Test", err);
    }

    // =========================================================================
    // TEST (d): Fiscal Period Lock Test
    // =========================================================================
    try {
        console.log("\n--- TEST (d): Fiscal Period Lock Test ---");
        const userId = "usr_p3_period_lock_400";
        const lockedPeriod = "2026-05";

        await db.collection("users").doc(userId).set({
            uid: userId,
            walletBalance: 400,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Explicitly lock fiscal period 2026-05
        await db.collection("fiscal_periods").doc(lockedPeriod).set({
            periodId: lockedPeriod,
            status: "LOCKED",
            lockedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let lockThrew = false;
        try {
            await walletService.debitWallet({
                uid: userId,
                amount: 150,
                eventType: "ORDER_PAYMENT",
                entityId: "ORD_P3_LOCK_001",
                periodId: lockedPeriod,
                idempotencyKey: "JE_WALLET_ORDER_PAYMENT_LOCK_001"
            });
        } catch (err) {
            lockThrew = true;
            assert.strictEqual(err.code, "FISCAL_PERIOD_LOCKED", "Error code must be FISCAL_PERIOD_LOCKED");
        }

        assert.strictEqual(lockThrew, true, "Transaction must strictly throw when fiscal period is locked");

        // Verify balance was rolled back and untouched in Firestore
        const userDoc = await db.collection("users").doc(userId).get();
        assert.strictEqual(userDoc.data().walletBalance, 400, "User wallet balance must remain strictly ₹400 (Rollback verified)");

        // Verify zero orphaned journal entries or wallet_transactions
        const jeDoc = await db.collection("journal_entries").doc("JE_WALLET_ORDER_PAYMENT_LOCK_001").get();
        assert.strictEqual(jeDoc.exists, false, "Journal entry must not exist in locked period");

        // Clean up locked period
        await db.collection("fiscal_periods").doc(lockedPeriod).delete();

        pass("Test (d): Fiscal Period Lock verified (Wallet debit aborted with FISCAL_PERIOD_LOCKED, balance preserved at ₹400)");
    } catch (err) {
        fail("Test (d): Fiscal Period Lock Test", err);
    }

    // =========================================================================
    // TEST (e): Complete Prepaid Revenue Lifecycle (Payment Dr 2065/Cr 2070 -> Delivery Dr 2070/Cr 4010)
    // =========================================================================
    try {
        console.log("\n--- TEST (e): Complete Prepaid Revenue Lifecycle (Wallet Payment -> Delivery) ---");
        const userId = "usr_p3_e2e_lifecycle";
        const orderId = "ORD_P3_E2E_DELIVERY_001";
        const totalAmount = 1050;
        const taxableAmount = 1000;
        const costPrice = 700;

        await db.collection("users").doc(userId).set({
            uid: userId,
            walletBalance: 2000,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("orders").doc(orderId).set({
            orderId,
            userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            totalAmount,
            shippingState: "Bihar",
            items: [{
                skuId: "SKU_FERT_50",
                name: "Zinc Fertilizer",
                quantity: 1,
                sellingPrice: 1000,
                taxablePrice: taxableAmount,
                costPrice: costPrice,
                hsn: "3105" // 5% GST -> 25 CGST + 25 SGST = 1050 total
            }],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1. Customer pays using Wallet at checkout
        const payRes = await payWithWalletHandler({ orderId }, { auth: { uid: userId } });
        assert.strictEqual(payRes.success, true);
        assert.strictEqual(payRes.balanceAfter, 950);

        const payLines = await getJournalEntryLines(`JE_WALLET_ORDER_PAYMENT_${orderId}`);
        const payMap = {};
        payLines.forEach(l => { payMap[l.accountCode] = l; });

        // Advance receipt posted to Deferred Revenue
        assert.strictEqual(Number(payMap["2065_CUSTOMER_WALLET_LIABILITY"]?.debit || 0), 1050);
        assert.strictEqual(Number(payMap["2070_DEFERRED_REVENUE"]?.credit || 0), 1050);

        // 2. Rider delivers the order -> Delivery financial recognition
        const deliveryRes = await recognizeOrderDeliveryFinancials({
            orderId,
            paymentMethod: "WALLET",
            shippingState: "Bihar",
            items: [{
                skuId: "SKU_FERT_50",
                name: "Zinc Fertilizer",
                quantity: 1,
                sellingPrice: 1000,
                taxablePrice: taxableAmount,
                costPrice: costPrice,
                hsn: "3105"
            }]
        });

        assert.strictEqual(deliveryRes.success, true);
        const deliveryLines = await getJournalEntryLines(deliveryRes.journalEntryId);
        const delMap = {};
        deliveryLines.forEach(l => { delMap[l.accountCode] = l; });

        // Deferred revenue cleared (debited) on fulfillment
        assert.strictEqual(Number(delMap["2070_DEFERRED_REVENUE"]?.debit || 0), 1050, "Delivery must debit 2070_DEFERRED_REVENUE for full order value ₹1050");
        assert.strictEqual(Number(delMap["4010_SALES_AGRI_INPUTS"]?.credit || 0), taxableAmount, "Delivery must credit 4010_SALES_AGRI_INPUTS for taxable value ₹1000");

        // Net Deferred Revenue change is exactly 0
        const netDeferredRevenue = Number(payMap["2070_DEFERRED_REVENUE"]?.credit || 0) - Number(delMap["2070_DEFERRED_REVENUE"]?.debit || 0);
        assert.strictEqual(netDeferredRevenue, 0, "Invariant verified: Net Deferred Revenue (2070) balance across wallet payment and delivery is ₹0.00");

        pass("Test (e): Complete Prepaid Revenue Lifecycle verified (Dr 2065/Cr 2070 at payment, Dr 2070/Cr 4010 at delivery, Net 2070 = ₹0.00)");
    } catch (err) {
        fail("Test (e): Complete Prepaid Revenue Lifecycle", err);
    }

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log("\n=================================================================");
    console.log(`PACKAGE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Fatal test error:", err);
    process.exit(1);
});

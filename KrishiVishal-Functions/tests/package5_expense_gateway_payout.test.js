/**
 * Package 5 Test Suite: Company Expenses & Payment Gateway Settlement Migration to System 2
 * 
 * Verifies:
 * (a) Bank Expense Payment: Dr Expense / Cr 1030 Bank, balanced 2-leg entry verification
 * (b) Cash Vault Expense Payment: Dr Expense / Cr 1020 Hub Vault, balanced 2-leg entry verification
 * (c) Gateway Settlement: 4-leg entry (Dr 1030 Bank + Dr 6020 Fee + Dr 1060/1070 GST == Cr 1050 Gateway Receivable)
 * (d) Replay Idempotency: Duplicate calls on same expenseId/payoutId do not create duplicate ledger lines or documents
 * (e) Fiscal Period Lock Guard: Locked accounting period strictly rejects expense/payout entry
 * 
 * RUN COMMAND:
 * firebase emulators:exec --only firestore "node tests/package5_expense_gateway_payout.test.js"
 */

const assert = require("assert");

// HARD EMULATOR GUARD
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: Package 5 tests MUST run against the Firestore emulator.");
    console.error("Please run with: firebase emulators:exec --only firestore \"node tests/package5_expense_gateway_payout.test.js\"");
    process.exit(1);
}

const { db, admin } = require("../core/admin");
const { recordExpensePayment, recordBankPayout } = require("../finance/ledger");
const { assertFiscalPeriodUnlocked, postJournalEntry } = require("../finance/generalLedger");

console.log("=================================================================");
console.log("=== PACKAGE 5: EXPENSES & PAYMENT GATEWAY SETTLEMENT (SYS 2)  ===");
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

    // Setup: Unlock current fiscal period
    await db.collection("fiscal_periods").doc(periodId).set({
        status: "OPEN",
        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Setup: Seed admin user for authorization check
    await db.collection("users").doc("FINANCE_ADMIN_P5").set({
        role: "FinanceAdmin",
        admin: true,
        name: "Finance Controller",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const adminAuth = {
        uid: "FINANCE_ADMIN_P5",
        token: { admin: true, isAdmin: true, role: "FinanceAdmin" }
    };

    // =================================================================
    // TEST (a): Bank Expense Payment (Dr Expense / Cr 1030 Bank)
    // =================================================================
    console.log("\n--- TEST (a): Bank Expense Payment ---");
    try {
        const expenseId = "EXP_P5_BANK_001";
        const res = await recordExpensePayment.run({
            auth: adminAuth,
            data: {
                expenseId,
                amount: 1500,
                category: "OFFICE_RENT",
                paymentMode: "BANK",
                description: "Monthly Hub Rent Settlement"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.expenseId, expenseId);
        assert.strictEqual(res.amount, 1500);
        assert.strictEqual(res.paymentMode, "BANK");

        // Verify expenses document persisted
        const expDoc = await db.collection("expenses").doc(expenseId).get();
        assert(expDoc.exists, "Expense document must exist in Firestore");
        assert.strictEqual(expDoc.data().creditAccount, "1030_BANK_CURRENT_HDFC");
        assert.strictEqual(expDoc.data().status, "POSTED");

        // Verify System 2 Journal Entry
        const jeId = `JE_EXPENSE_${expenseId}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert(jeSnap.exists, "Journal entry header must exist in journal_entries");
        assert.strictEqual(jeSnap.data().refType, "EXPENSE");
        assert.strictEqual(jeSnap.data().totalAmount, 1500);

        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 2, "Expense entry must have exactly 2 lines");
        const drExpense = lines.find(l => l.debit > 0);
        const crBank = lines.find(l => l.credit > 0);

        assert(drExpense && crBank, "Must have debit expense and credit bank legs");
        assert.strictEqual(drExpense.debit, 1500);
        assert.strictEqual(crBank.accountCode, "1030_BANK_CURRENT_HDFC");
        assert.strictEqual(crBank.credit, 1500);

        pass("Test (a): Bank expense payment posted 2-leg balanced JE (Dr Expense ₹1500 == Cr 1030_BANK_CURRENT_HDFC ₹1500)");
    } catch (err) {
        fail("Test (a): Bank expense payment", err);
    }

    // =================================================================
    // TEST (b): Cash Vault Expense Payment (Dr Expense / Cr 1020 Vault)
    // =================================================================
    console.log("\n--- TEST (b): Cash Vault Expense Payment ---");
    try {
        const expenseId = "EXP_P5_CASH_001";
        const res = await recordExpensePayment.run({
            auth: adminAuth,
            data: {
                expenseId,
                amount: 350,
                category: "TEA_SNACKS",
                paymentMode: "CASH",
                description: "Warehouse Staff Refreshments"
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.expenseId, expenseId);
        assert.strictEqual(res.amount, 350);
        assert.strictEqual(res.paymentMode, "CASH");

        // Verify expenses document
        const expDoc = await db.collection("expenses").doc(expenseId).get();
        assert(expDoc.exists);
        assert.strictEqual(expDoc.data().creditAccount, "1020_HUB_CASH_VAULT");

        // Verify System 2 Journal Entry
        const jeId = `JE_EXPENSE_${expenseId}`;
        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 2);
        const drExpense = lines.find(l => l.debit > 0);
        const crVault = lines.find(l => l.accountCode === "1020_HUB_CASH_VAULT");

        assert.strictEqual(drExpense.debit, 350);
        assert.strictEqual(crVault.credit, 350);

        pass("Test (b): Cash vault expense payment posted 2-leg balanced JE (Dr Expense ₹350 == Cr 1020_HUB_CASH_VAULT ₹350)");
    } catch (err) {
        fail("Test (b): Cash vault expense payment", err);
    }

    // =================================================================
    // TEST (c): Gateway Settlement 4-Leg Entry (Dr Bank + Dr Fees + Dr GST == Cr Receivable)
    // =================================================================
    console.log("\n--- TEST (c): Payment Gateway Settlement (4-leg reconciliation) ---");
    try {
        const payoutId = "SETTLE_RZP_P5_001";
        const res = await recordBankPayout.run({
            auth: adminAuth,
            data: {
                payoutId,
                grossAmount: 10000,
                netAmount: 9764,
                fees: 200,
                taxOnFees: 36,
                cgst: 18,
                sgst: 18
            }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.payoutId, payoutId);
        assert.strictEqual(res.grossAmount, 10000);
        assert.strictEqual(res.netAmount, 9764);
        assert.strictEqual(res.fees, 200);

        // Verify gateway_settlements record
        const settleDoc = await db.collection("gateway_settlements").doc(payoutId).get();
        assert(settleDoc.exists);
        assert.strictEqual(settleDoc.data().status, "SETTLED");
        assert.strictEqual(settleDoc.data().grossAmount, 10000);

        // Verify System 2 Journal Entry
        const jeId = `JE_GATEWAY_SETTLEMENT_${payoutId}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert(jeSnap.exists);
        assert.strictEqual(jeSnap.data().refType, "BANK_PAYOUT");
        assert.strictEqual(jeSnap.data().totalAmount, 10000);

        const lines = await getJournalEntryLines(jeId);
        assert.strictEqual(lines.length, 5, "Must have Bank, Fee, CGST, SGST debits + Gateway Receivable credit");

        const drBank = lines.find(l => l.accountCode === "1030_BANK_CURRENT_HDFC");
        const drFee = lines.find(l => l.accountCode === "6020_PAYMENT_GATEWAY_FEES");
        const drCGST = lines.find(l => l.accountCode === "1060_INPUT_CGST");
        const drSGST = lines.find(l => l.accountCode === "1070_INPUT_SGST");
        const crGateway = lines.find(l => l.accountCode === "1050_GATEWAY_RECEIVABLE");

        assert(drBank && drFee && drCGST && drSGST && crGateway, "All 5 legs must be correctly mapped");
        assert.strictEqual(drBank.debit, 9764);
        assert.strictEqual(drFee.debit, 200);
        assert.strictEqual(drCGST.debit, 18);
        assert.strictEqual(drSGST.debit, 18);
        assert.strictEqual(crGateway.credit, 10000);

        const totalDebits = drBank.debit + drFee.debit + drCGST.debit + drSGST.debit;
        assert.strictEqual(totalDebits, crGateway.credit, "Total Debits (₹10,000) must equal Total Credits (₹10,000)");

        pass("Test (c): Gateway settlement posted balanced 4-leg entry: Dr 1030 ₹9764 + Dr 6020 ₹200 + Dr 1060 ₹18 + Dr 1070 ₹18 == Cr 1050 ₹10,000");
    } catch (err) {
        fail("Test (c): Gateway settlement", err);
    }

    // =================================================================
    // TEST (d): Replay Idempotency
    // =================================================================
    console.log("\n--- TEST (d): Replay Idempotency (Repeat Calls) ---");
    try {
        const expenseId = "EXP_P5_BANK_001";
        const payoutId = "SETTLE_RZP_P5_001";

        // Repeat expense payment call
        const repeatExpRes = await recordExpensePayment.run({
            auth: adminAuth,
            data: {
                expenseId,
                amount: 1500,
                category: "OFFICE_RENT",
                paymentMode: "BANK"
            }
        });
        assert.strictEqual(repeatExpRes.success, true);
        assert.strictEqual(repeatExpRes.alreadyProcessed, true);

        // Verify line count has not duplicated
        const expLines = await getJournalEntryLines(`JE_EXPENSE_${expenseId}`);
        assert.strictEqual(expLines.length, 2, "Expense JE lines must not duplicate on replay");

        // Repeat gateway payout call
        const repeatPayoutRes = await recordBankPayout.run({
            auth: adminAuth,
            data: {
                payoutId,
                grossAmount: 10000,
                netAmount: 9764,
                fees: 200,
                taxOnFees: 36
            }
        });
        assert.strictEqual(repeatPayoutRes.success, true);
        assert.strictEqual(repeatPayoutRes.alreadyProcessed, true);

        // Verify line count has not duplicated
        const payoutLines = await getJournalEntryLines(`JE_GATEWAY_SETTLEMENT_${payoutId}`);
        assert.strictEqual(payoutLines.length, 5, "Gateway settlement JE lines must not duplicate on replay");

        pass("Test (d): Replay idempotency verified: Repeat calls return alreadyProcessed: true with zero line duplication");
    } catch (err) {
        fail("Test (d): Replay idempotency", err);
    }

    // =================================================================
    // TEST (e): Fiscal Period Lock Guard
    // =================================================================
    console.log("\n--- TEST (e): Fiscal Period Lock Guard ---");
    try {
        const lockedPeriodId = "2024-03";
        await db.collection("fiscal_periods").doc(lockedPeriodId).set({
            status: "LOCKED",
            lockedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let lockedError = null;
        try {
            await postJournalEntry({
                entryId: "JE_EXPENSE_LOCKED_PERIOD",
                refType: "EXPENSE",
                refId: "EXP_LOCKED",
                periodId: lockedPeriodId,
                date: new Date(),
                memo: "Locked period test expense",
                lines: [
                    { accountCode: "6050_GENERAL_ADMIN_EXPENSES", debit: 500, credit: 0 },
                    { accountCode: "1030_BANK_CURRENT_HDFC", debit: 0, credit: 500 }
                ],
                createdBy: "ADMIN"
            });
        } catch (err) {
            lockedError = err;
        }

        assert(lockedError, "Must throw on locked fiscal period");
        assert.strictEqual(lockedError.code, "FISCAL_PERIOD_LOCKED");

        pass("Test (e): Fiscal period lock guard enforced: Locked periods strictly reject expense postings");
    } catch (err) {
        fail("Test (e): Fiscal period lock guard", err);
    }

    // =================================================================
    // SUMMARY
    // =================================================================
    console.log("\n=================================================================");
    console.log(`PACKAGE 5 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("Fatal test error in Package 5 suite:", err);
    process.exit(1);
});

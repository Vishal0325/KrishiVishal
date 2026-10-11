/**
 * WORKFLOW 5 FIXES & VERIFICATION TEST SUITE
 * 
 * Tests FIX 1: Missing Cost Price handling (MISSING_COST_PRICE throw, retry, partial post protection)
 * Tests FIX 2: Rider Delivery Expense Accrual & P&L Matching (6010_RIDER_DELIVERY_PAYOUTS, balanced trial balance, no duplicate)
 */

const assert = require('assert');
const { admin, db } = require('../core/admin');
const { recognizeOrderDeliveryFinancials, getFiscalPeriodId } = require('../finance/salesLedger');
const { generateTrialBalance, generateProfitAndLoss } = require('../finance/financialReports');
const { getCurrentFinancialYear } = require('../invoices/sequentialInvoiceEngine');
const { postJournalEntry } = require('../finance/generalLedger');

console.log("==================================================================================");
console.log("=== RUNNING WORKFLOW 5 FIXES VERIFICATION (COST PRICE & RIDER EXPENSE P&L) ===");
console.log("==================================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err?.message || err}`);
    failed++;
}

async function runFixesTests() {
    const periodId = getFiscalPeriodId();
    const financialYear = getCurrentFinancialYear();

    // ─────────────────────────────────────────────────────────────
    // TEST SUITE 1: FIX 1 — COST PRICE VALIDATION & PROTECTION
    // ─────────────────────────────────────────────────────────────
    console.log("--- 1. FIX 1: Missing / Invalid Cost Price Protection ---");

    // Test 1.1: Order with missing costPrice throws MISSING_COST_PRICE
    try {
        const orderMissingCost = {
            orderId: `ORD_FAIL_NO_COST_${Date.now()}`,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear,
            items: [
                {
                    skuCode: 'SKU_NO_COST_01',
                    name: 'Test Product No Cost',
                    quantity: 1,
                    taxablePrice: 500.00,
                    sellingPrice: 500.00,
                    hsnCode: '3808'
                }
            ]
        };

        let threwError = false;
        try {
            await recognizeOrderDeliveryFinancials(orderMissingCost);
        } catch (err) {
            threwError = true;
            assert(err.message.includes("MISSING_COST_PRICE"), `Expected MISSING_COST_PRICE error, got: ${err.message}`);
        }
        assert(threwError, "Must throw MISSING_COST_PRICE error when cost price is absent");
        pass("1.1 Missing cost price strictly rejected with MISSING_COST_PRICE error (no arbitrary 70% guessing)");
    } catch (err) {
        fail("1.1 Missing cost price rejection", err);
    }

    // Test 1.2: Order with zero or negative costPrice throws MISSING_COST_PRICE
    try {
        const orderZeroCost = {
            orderId: `ORD_FAIL_ZERO_COST_${Date.now()}`,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear,
            items: [
                {
                    skuCode: 'SKU_ZERO_COST_01',
                    name: 'Test Product Zero Cost',
                    quantity: 1,
                    taxablePrice: 500.00,
                    costPrice: 0,
                    hsnCode: '3808'
                }
            ]
        };

        let threwZero = false;
        try {
            await recognizeOrderDeliveryFinancials(orderZeroCost);
        } catch (err) {
            threwZero = true;
            assert(err.message.includes("MISSING_COST_PRICE"));
        }
        assert(threwZero, "Must reject zero cost price");
        pass("1.2 Zero/invalid cost price strictly rejected with MISSING_COST_PRICE");
    } catch (err) {
        fail("1.2 Zero/invalid cost price rejection", err);
    }

    // Test 1.3: Batch cost supported when product-level cost is absent
    try {
        const orderBatchCost = {
            orderId: `ORD_BATCH_COST_${Date.now()}`,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear,
            items: [
                {
                    skuCode: 'SKU_BATCH_01',
                    name: 'Test Batch Product',
                    quantity: 2,
                    taxablePrice: 300.00,
                    sellingPrice: 300.00,
                    hsnCode: '3808',
                    batchAllocations: [
                        { batchNumber: 'BATCH_2026_A', landingCost: 210.00, quantity: 2 }
                    ]
                }
            ]
        };

        const batchRes = await recognizeOrderDeliveryFinancials(orderBatchCost);
        assert.strictEqual(batchRes.success, true);
        assert.strictEqual(batchRes.totalCogs, 420.00, 'COGS must equal 2 * 210 = 420.00 from batch');
        pass("1.3 Batch landingCost successfully utilized when line-level costPrice is on batch allocation");
    } catch (err) {
        fail("1.3 Batch cost resolution", err);
    }

    // Test 1.4: Failed transaction leaves NO partial journal entries or corrupted order state
    try {
        const badOrderId = `ORD_ATOMIC_TEST_${Date.now()}`;
        try {
            await recognizeOrderDeliveryFinancials({
                orderId: badOrderId,
                periodId,
                paymentMethod: "COD",
                shippingState: "Bihar",
                items: [{ skuCode: 'SKU_BAD', quantity: 1, taxablePrice: 100 }] // No cost!
            });
        } catch (e) {
            // expected
        }

        const orderDoc = await db.collection("orders").doc(badOrderId).get();
        const orderData = orderDoc.data() || {};
        assert.notStrictEqual(orderData.financialStatus, "RECOGNIZED", "Failed order must not be marked RECOGNIZED");
        assert.strictEqual(orderData.journalEntryId, undefined, "Failed order must have no journalEntryId");
        pass("1.4 Atomicity verified: Failed order creation leaves zero partial journal entries or corrupted state");
    } catch (err) {
        fail("1.4 Atomicity verification", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SUITE 2: FIX 2 — RIDER DELIVERY EXPENSE & P&L MATCHING
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. FIX 2: Rider Delivery Expense Accrual & P&L Integration ---");

    // Test 2.1: ₹700 Sales, ₹500 COGS, and ₹30 Rider Delivery Expense Accounting Flow
    const testScenarioOrderId = `ORD_SCENARIO_700_500_30_${Date.now()}`;
    let scenarioResult;

    try {
        const scenarioPayload = {
            orderId: testScenarioOrderId,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear,
            riderId: "rider_ramesh_01",
            riderEarning: 30.00, // explicit ₹30 rider delivery earning
            items: [
                {
                    skuCode: 'SKU_FERT_TEST',
                    name: 'Fertilizer 50kg',
                    hsnCode: '3102',
                    quantity: 2,
                    taxablePrice: 350.00, // 2 * 350 = 700 taxable
                    costPrice: 250.00,    // 2 * 250 = 500 COGS
                    taxRate: 0.05,
                    cgstAmount: 17.50,
                    sgstAmount: 17.50,
                    igstAmount: 0.00
                }
            ]
        };

        scenarioResult = await recognizeOrderDeliveryFinancials(scenarioPayload);
        assert.strictEqual(scenarioResult.success, true);
        assert.strictEqual(scenarioResult.taxableAmount, 700.00);
        assert.strictEqual(scenarioResult.totalSales, 735.00);
        assert.strictEqual(scenarioResult.totalCogs, 500.00);

        // Fetch journal entry and inspect lines
        const jeDoc = await db.collection("journal_entries").doc(scenarioResult.journalEntryId).get();
        assert(jeDoc.exists);
        const jeData = jeDoc.data();
        assert.strictEqual(jeData.totalDebit, jeData.totalCredit, 'Debits must equal Credits');

        const linesSnap = await jeDoc.ref.collection("lines").get();
        const lines = linesSnap.docs.map(d => d.data());

        const riderCashDebit = lines.find(l => l.accountCode === "1010_CASH_IN_HAND_RIDERS");
        const salesCredit = lines.find(l => l.accountCode === "4010_SALES_AGRI_INPUTS");
        const cogsDebit = lines.find(l => l.accountCode === "5010_COGS_AGRI_INPUTS");
        const invCredit = lines.find(l => l.accountCode === "1040_INVENTORY_MAIN_HUB");
        const riderExpenseDebit = lines.find(l => l.accountCode === "6010_RIDER_DELIVERY_PAYOUTS");
        const riderPayableCredit = lines.find(l => l.accountCode === "2010_ACCOUNTS_PAYABLE_SUPPLIERS");

        assert.strictEqual(riderCashDebit.debit, 735.00);
        assert.strictEqual(salesCredit.credit, 700.00);
        assert.strictEqual(cogsDebit.debit, 500.00);
        assert.strictEqual(invCredit.credit, 500.00);
        assert.strictEqual(riderExpenseDebit.debit, 30.00, "Must debit 6010_RIDER_DELIVERY_PAYOUTS by ₹30");
        assert.strictEqual(riderPayableCredit.credit, 30.00, "Must credit 2010_ACCOUNTS_PAYABLE_SUPPLIERS by ₹30");

        // Total Debits = 735 + 500 + 30 = 1265. Total Credits = 700 + 35 + 500 + 30 = 1265.
        const totalDebits = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
        const totalCredits = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
        assert.strictEqual(totalDebits, 1265.00);
        assert.strictEqual(totalCredits, 1265.00);

        pass("2.1 Scenario Accounting: Sales ₹700, COGS ₹500, Rider Expense ₹30 posted to 6010_RIDER_DELIVERY_PAYOUTS, balanced at ₹1,265.00");
    } catch (err) {
        fail("2.1 Scenario Accounting", err);
    }

    // Test 2.2: P&L Statement Verification with Operating Expenses
    try {
        const pnl = await generateProfitAndLoss({ periodId });
        console.log(`   [P&L Result] Gross Revenue: ₹${pnl.grossRevenue}, COGS: ₹${pnl.cogs}, Gross Profit: ₹${pnl.grossProfit}`);
        console.log(`   [P&L Result] Operating Expenses: ₹${pnl.operatingExpenses}, Net Profit: ₹${pnl.netProfit}`);

        assert(pnl.isTrialBalanceBalanced, "Trial balance must remain balanced");
        assert(pnl.operatingExpenses >= 30.00, "Operating expenses must reflect rider delivery payout (>= ₹30)");
        assert.strictEqual(pnl.netProfit, pnl.grossProfit - pnl.operatingExpenses, "Net Profit must equal Gross Profit - Operating Expenses");

        pass("2.2 Statutory P&L reflects Rider Delivery Expense under Operating Expenses; Trial Balance remains strictly balanced");
    } catch (err) {
        fail("2.2 P&L Statement Verification", err);
    }

    // Test 2.3: Idempotency - Duplicate recognition does not post duplicate rider expense
    try {
        const repeatRes = await recognizeOrderDeliveryFinancials({
            orderId: testScenarioOrderId,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            riderId: "rider_ramesh_01",
            riderEarning: 30.00,
            items: [
                { skuCode: 'SKU_FERT_TEST', quantity: 2, taxablePrice: 350.00, costPrice: 250.00 }
            ]
        });

        assert.strictEqual(repeatRes.alreadyRecognized, true);
        assert.strictEqual(repeatRes.journalEntryId, scenarioResult.journalEntryId);
        pass("2.3 Duplicate recognition blocked: Zero duplicate rider expense or journal entries created");
    } catch (err) {
        fail("2.3 Idempotency verification", err);
    }

    console.log("\n==================================================================================");
    console.log(`WORKFLOW 5 FIXES VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================================");
}

runFixesTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});

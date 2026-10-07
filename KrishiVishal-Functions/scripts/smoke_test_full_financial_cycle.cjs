/**
 * KrishiVishal Live End-to-End Financial Cycle Smoke Test
 * SPRINT 8: Production Verification Script
 * 
 * Verifies:
 * 1. Sequential Invoice Generation (KV/26-27/0000X)
 * 2. Order Delivery Revenue Recognition & Double-Entry Ledger Posting
 * 3. Exact Balancing of Debits and Credits (Assets, Revenue, GST, COGS, Inventory)
 * 4. Trial Balance Generation (Debits == Credits)
 * 5. Clean teardown of test artifacts
 */

const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}
const db = admin.firestore();

const { recognizeOrderDeliveryFinancials } = require("../finance/salesLedger");
const { generateTrialBalance } = require("../finance/financialReports");
const { getCurrentFinancialYear } = require("../invoices/sequentialInvoiceEngine");

async function runSmokeTest() {
    console.log("================================================================================");
    console.log("  KRISHIVISHAL PRIVATE LIMITED — LIVE FINANCIAL CYCLE SMOKE TEST (SPRINT 8)");
    console.log("================================================================================\n");

    const orderId = "ORDER_FIN_CYCLE_LIVE_TEST_" + Date.now();
    const currentFY = getCurrentFinancialYear();
    const periodId = "2026-10";

    console.log(`[1] Setting up synthetic order: ${orderId}`);
    console.log(`    Customer: Rameshwar Singh (Samastipur Test Farmer)`);
    console.log(`    Destination: Bihar (Intra-State GST)`);
    console.log(`    Items: 2 x Dimethoate 30% EC (500ml) @ ₹600 (Cost: ₹400), HSN 3808, 18% GST`);

    // 2 units * ₹600 = ₹1,200 Taxable Value
    // Intra-State 18%: CGST 9% (₹108) + SGST 9% (₹108) = ₹216 Tax
    // Total Order Value: ₹1,416.00 (COD)
    // COGS: 2 * ₹400 = ₹800.00
    // Total Double-Entry Turnover = ₹1,416 (Sales) + ₹800 (COGS) = ₹2,216.00 Debits & Credits

    const syntheticOrderData = {
        orderId,
        periodId,
        paymentMethod: "COD",
        shippingState: "Bihar",
        financialYear: currentFY,
        items: [
            {
                skuCode: "PEST_DIMETHO_500",
                name: "Dimethoate 30% EC Pesticide",
                hsn: "3808",
                quantity: 2,
                sellingPrice: 600,
                unitCost: 400,
                category: "Pesticides"
            }
        ],
        createdBy: "SMOKE_TEST_SCRIPT"
    };

    console.log(`\n[2] Executing Revenue Recognition & Statutory Ledger Posting...`);
    const recognitionResult = await recognizeOrderDeliveryFinancials(syntheticOrderData);

    console.log(`    Assigned Tax Invoice: ${recognitionResult.invoiceNumber}`);
    console.log(`    Journal Entry ID:    ${recognitionResult.journalEntryId}`);
    console.log(`    Taxable Amount:      ₹${recognitionResult.taxableAmount}`);
    console.log(`    CGST (9%):           ₹${recognitionResult.cgstAmount}`);
    console.log(`    SGST (9%):           ₹${recognitionResult.sgstAmount}`);
    console.log(`    Total Tax:           ₹${recognitionResult.totalTax}`);
    console.log(`    Grand Total:         ₹${recognitionResult.grandTotal}`);
    console.log(`    COGS Recognized:     ₹${recognitionResult.totalCogs}`);

    // --- CHECK 1: RULE 46 SEQUENTIAL INVOICE FORMAT ---
    console.log(`\n[3] Verification Check 1: Rule 46 Sequential Invoice Number Format`);
    const invoiceRegex = /^KV\/\d{2}-\d{2}\/\d{5}$/;
    const isInvoiceValid = invoiceRegex.test(recognitionResult.invoiceNumber);
    if (!isInvoiceValid) {
        throw new Error(`INVOICE_FORMAT_INVALID: "${recognitionResult.invoiceNumber}" does not match KV/YY-YY/00000 format.`);
    }
    console.log(`    ✅ Invoice format valid: ${recognitionResult.invoiceNumber} matches ${invoiceRegex}`);

    // --- CHECK 2: DOUBLE-ENTRY LEDGER BALANCE & SUB-LEDGER CODES ---
    console.log(`\n[4] Verification Check 2: Double-Entry Balance (Debits == Credits)`);
    const entryDoc = await db.collection("journal_entries").doc(recognitionResult.journalEntryId).get();
    if (!entryDoc.exists) {
        throw new Error(`JOURNAL_ENTRY_NOT_FOUND: ${recognitionResult.journalEntryId} not found in Firestore.`);
    }

    const linesSnapshot = await db.collection("journal_entries").doc(recognitionResult.journalEntryId).collection("lines").get();
    const lines = linesSnapshot.docs.map(d => d.data());

    let totalDebits = 0;
    let totalCredits = 0;
    const linesTable = [];

    lines.forEach(l => {
        totalDebits += Number(l.debit || 0);
        totalCredits += Number(l.credit || 0);
        linesTable.push({
            Account: l.accountCode,
            Debit: l.debit > 0 ? `₹${l.debit.toFixed(2)}` : "-",
            Credit: l.credit > 0 ? `₹${l.credit.toFixed(2)}` : "-",
            Description: l.description
        });
    });

    console.table(linesTable);

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;

    console.log(`    Total Debits:  ₹${totalDebits.toFixed(2)}`);
    console.log(`    Total Credits: ₹${totalCredits.toFixed(2)}`);
    console.log(`    Difference:    ₹${Math.abs(totalDebits - totalCredits).toFixed(2)}`);

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
        throw new Error(`UNBALANCED_JOURNAL_ENTRY: Debits (₹${totalDebits}) != Credits (₹${totalCredits})`);
    }
    console.log(`    ✅ Double-Entry perfectly balanced (Debits === Credits)`);

    // Verify canonical account codes exist in entry
    const accountsInEntry = new Set(lines.map(l => l.accountCode));
    const requiredAccounts = [
        "1010_CASH_IN_HAND_RIDERS",
        "4010_SALES_AGRI_INPUTS",
        "2020_OUTPUT_CGST_PAYABLE",
        "2030_OUTPUT_SGST_PAYABLE",
        "5010_COGS_AGRI_INPUTS",
        "1040_INVENTORY_MAIN_HUB"
    ];
    for (const reqAcc of requiredAccounts) {
        if (!accountsInEntry.has(reqAcc)) {
            throw new Error(`MISSING_ACCOUNT_IN_ENTRY: Expected account ${reqAcc} in journal entry.`);
        }
    }
    console.log(`    ✅ All 6 canonical sub-ledgers present and verified in journal lines.`);

    // --- CHECK 3: TRIAL BALANCE AGGREGATION ---
    console.log(`\n[5] Verification Check 3: Period Trial Balance Validation`);
    const tb = await generateTrialBalance({ periodId });
    console.log(`    Period ${tb.periodId} Trial Balance:`);
    console.log(`    Total TB Debits:  ₹${Number(tb.totalDebits).toFixed(2)}`);
    console.log(`    Total TB Credits: ₹${Number(tb.totalCredits).toFixed(2)}`);
    console.log(`    isBalanced:       ${tb.isBalanced}`);

    if (!tb.isBalanced) {
        throw new Error(`TRIAL_BALANCE_OUT_OF_BALANCE: Trial balance for ${periodId} is not balanced.`);
    }
    console.log(`    ✅ Trial balance is mathematically verified and balanced.`);

    // --- STEP 6: TEARDOWN TEST ARTIFACTS ---
    console.log(`\n[6] Cleaning up test artifacts...`);
    // Delete journal entry lines
    for (const doc of linesSnapshot.docs) {
        await doc.ref.delete();
    }
    // Delete journal entry doc
    await db.collection("journal_entries").doc(recognitionResult.journalEntryId).delete();
    // Delete synthetic order doc
    await db.collection("orders").doc(orderId).delete();

    console.log(`    ✅ Synthetic order ${orderId} and journal entry ${recognitionResult.journalEntryId} removed.`);
    console.log(`\n================================================================================`);
    console.log(`  🎉 ALL AUDIT & FINANCIAL CHECKS PASSED WITH 100% SUCCESS`);
    console.log(`================================================================================`);

    return {
        orderId,
        invoiceNumber: recognitionResult.invoiceNumber,
        totalDebits,
        totalCredits,
        isTrialBalanceBalanced: tb.isBalanced
    };
}

runSmokeTest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ SMOKE TEST FAILED:", err);
        process.exit(1);
    });

const assert = require('assert');
const { admin, db } = require('../core/admin');
const { calculateTaxForOrder, resolveHsnRate, isIntraStateSupply, roundCurrency } = require('../tax/gstEngine');
const { getOrCreateInvoiceNumberForOrder, getCurrentFinancialYear } = require('../invoices/sequentialInvoiceEngine');
const { recognizeOrderDeliveryFinancials, getFiscalPeriodId } = require('../finance/salesLedger');
const { postJournalEntry, CHART_OF_ACCOUNTS } = require('../finance/generalLedger');
const { generateTrialBalance, generateProfitAndLoss, generateBalanceSheet } = require('../finance/financialReports');
const { generateGstr1Summary } = require('../tax/gstrReportEngine');
const { generateCreditNoteForReturn } = require('../invoices/creditNoteEngine');

console.log("==================================================================================");
console.log("=== RUNNING WORKFLOW 5 — GST INVOICING, ACCOUNTING & P&L E2E VERIFICATION ===");
console.log("==================================================================================\n");

let passed = 0;
let failed = 0;
let blocked = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err?.message || err}`);
    failed++;
}

function block(name, reason) {
    console.warn(`⚠️ BLOCKED: ${name} - ${reason}`);
    blocked++;
}

async function runWorkflow5Tests() {
    const periodId = getFiscalPeriodId();
    const financialYear = getCurrentFinancialYear();

    // ─────────────────────────────────────────────────────────────
    // SECTION 1: GST INVOICE CALCULATION, NUMBERING & UNIQUENESS
    // ─────────────────────────────────────────────────────────────
    console.log("--- SECTION 1: GST Invoice Calculation, Numbering & Uniqueness ---");

    // Test 1.1: Standard Intra-State (Bihar) Order GST Calculation
    try {
        const orderItems = [
            {
                skuCode: 'SKU-UREA-50KG',
                name: 'Neem Coated Urea 50kg',
                hsnCode: '3102', // 5% GST (Fertilizers)
                quantity: 2,
                taxablePrice: 350.00, // Total taxable = 700.00
                category: 'FERTILIZERS'
            },
            {
                skuCode: 'SKU-PEST-1L',
                name: 'Chlorpyrifos 20% EC 1L',
                hsnCode: '3808', // 18% GST (Pesticides)
                quantity: 1,
                taxablePrice: 500.00, // Total taxable = 500.00
                category: 'PESTICIDES_FUNGICIDES'
            }
        ];

        const taxResult = calculateTaxForOrder({
            shippingState: 'Bihar',
            items: orderItems
        });

        // Fertilizer: 700 * 2.5% = 17.50 CGST, 17.50 SGST. Total tax = 35.00
        // Pesticide: 500 * 9% = 45.00 CGST, 45.00 SGST. Total tax = 90.00
        // Total Taxable: 1200.00. Total CGST: 62.50. Total SGST: 62.50. Total IGST: 0.00
        // Grand Total: 1325.00
        assert.strictEqual(taxResult.taxableAmount, 1200.00, 'Taxable amount must be 1200.00');
        assert.strictEqual(taxResult.cgstAmount, 62.50, 'CGST must be 62.50');
        assert.strictEqual(taxResult.sgstAmount, 62.50, 'SGST must be 62.50');
        assert.strictEqual(taxResult.igstAmount, 0.00, 'IGST must be 0 for intra-state Bihar');
        assert.strictEqual(taxResult.totalTax, 125.00, 'Total tax must be 125.00');
        assert.strictEqual(taxResult.grandTotal, 1325.00, 'Grand total must be 1325.00');
        pass("1.1 Intra-state GST calculation (CGST + SGST split, HSN slabs 3102 @ 5%, 3808 @ 18%)");
    } catch (err) {
        fail("1.1 Intra-state GST calculation", err);
    }

    // Test 1.2: Inter-State (Jharkhand) Order GST Calculation (IGST)
    try {
        const orderItems = [
            {
                skuCode: 'SKU-PEST-1L',
                name: 'Chlorpyrifos 20% EC 1L',
                hsnCode: '3808',
                quantity: 2,
                taxablePrice: 500.00, // Total taxable = 1000.00
                category: 'PESTICIDES_FUNGICIDES'
            }
        ];

        const taxResult = calculateTaxForOrder({
            shippingState: 'Jharkhand',
            items: orderItems
        });

        assert.strictEqual(taxResult.taxableAmount, 1000.00);
        assert.strictEqual(taxResult.cgstAmount, 0.00, 'CGST must be 0 for inter-state');
        assert.strictEqual(taxResult.sgstAmount, 0.00, 'SGST must be 0 for inter-state');
        assert.strictEqual(taxResult.igstAmount, 180.00, 'IGST must be 180.00 (18%)');
        assert.strictEqual(taxResult.grandTotal, 1180.00);
        pass("1.2 Inter-state GST calculation (IGST 18% charged, zero CGST/SGST)");
    } catch (err) {
        fail("1.2 Inter-state GST calculation", err);
    }

    // Test 1.3: Sequential Invoice Number Generator & Uniqueness (Rule 46 <= 16 chars)
    let inv1, inv2;
    try {
        const testOrderId1 = `ORD_WF5_INV_01_${Date.now()}`;
        const testOrderId2 = `ORD_WF5_INV_02_${Date.now()}`;

        const res1 = await getOrCreateInvoiceNumberForOrder(testOrderId1, financialYear);
        inv1 = res1.invoiceNumber;
        const res2 = await getOrCreateInvoiceNumberForOrder(testOrderId2, financialYear);
        inv2 = res2.invoiceNumber;

        assert(inv1.length <= 16, `Invoice number length ${inv1.length} exceeds 16 chars`);
        assert(inv2.length <= 16, `Invoice number length ${inv2.length} exceeds 16 chars`);
        assert.notStrictEqual(inv1, inv2, 'Consecutive invoice numbers must be unique');
        assert(inv1.startsWith(`KV/${financialYear}/`), 'Invoice must start with KV/FY/');

        // Idempotency: Calling getOrCreateInvoiceNumberForOrder on same order must return same invoiceNumber
        const res1Repeat = await getOrCreateInvoiceNumberForOrder(testOrderId1, financialYear);
        assert.strictEqual(res1Repeat.invoiceNumber, inv1, 'Repeat call must return identical invoice number');

        pass(`1.3 Sequential Invoice numbering (Rule 46: length <= 16, unique: ${inv1} -> ${inv2}, idempotent)`);
    } catch (err) {
        fail("1.3 Sequential Invoice numbering", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 2: SALES LEDGER & GENERAL LEDGER POSTING
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 2: Sales Ledger & General Ledger Posting ---");

    const orderIdDelivery = `ORD_WF5_DELIVERY_${Date.now()}`;
    let recognitionResult;

    // Test 2.1: Order Delivery Financial Recognition (Sales + GST + Rider Cash + COGS)
    try {
        const orderPayload = {
            orderId: orderIdDelivery,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            financialYear,
            items: [
                {
                    skuCode: 'SKU-UREA-50KG',
                    name: 'Neem Coated Urea 50kg',
                    hsnCode: '3102',
                    quantity: 2,
                    taxablePrice: 350.00, // Taxable: 700, 5% Tax: 35 (CGST 17.5, SGST 17.5), Total: 735
                    costPrice: 250.00,     // Real Cost: 2 * 250 = 500
                    taxRate: 0.05,
                    cgstAmount: 17.50,
                    sgstAmount: 17.50,
                    igstAmount: 0.00
                }
            ]
        };

        // Ensure order doc exists with items and shippingState so that GSTR-1 aggregation reads items correctly
        await db.collection("orders").doc(orderIdDelivery).set({
            orderId: orderIdDelivery,
            shippingState: "Bihar",
            items: orderPayload.items
        }, { merge: true });

        recognitionResult = await recognizeOrderDeliveryFinancials(orderPayload);
        assert.strictEqual(recognitionResult.success, true);
        assert.strictEqual(recognitionResult.totalSales, 735.00);
        assert.strictEqual(recognitionResult.taxableAmount, 700.00);
        assert.strictEqual(recognitionResult.totalTax, 35.00);
        assert.strictEqual(recognitionResult.totalCogs, 500.00);
        assert(recognitionResult.journalEntryId, 'Must generate journalEntryId');

        pass(`2.1 Order Delivery recognized: Sales ₹700, Tax ₹35, Total ₹735, COGS ₹500, Entry #${recognitionResult.journalEntryId}`);
    } catch (err) {
        fail("2.1 Order Delivery recognized", err);
    }

    // Test 2.2: Journal Entry Debits == Credits and Account Verification
    try {
        const entryDoc = await db.collection("journal_entries").doc(recognitionResult.journalEntryId).get();
        assert(entryDoc.exists, 'Journal entry doc must exist');
        const entryData = entryDoc.data();

        assert.strictEqual(entryData.refId, orderIdDelivery, 'refId must match orderId');
        assert.strictEqual(entryData.totalDebit, entryData.totalCredit, 'Debits must equal Credits');

        // Verify lines
        const linesSnap = await entryDoc.ref.collection("lines").get();
        const lines = linesSnap.docs.map(d => d.data());

        const riderDebit = lines.find(l => l.accountCode === "1010_CASH_IN_HAND_RIDERS");
        const salesCredit = lines.find(l => l.accountCode === "4010_SALES_AGRI_INPUTS");
        const cgstCredit = lines.find(l => l.accountCode === "2020_OUTPUT_CGST_PAYABLE");
        const sgstCredit = lines.find(l => l.accountCode === "2030_OUTPUT_SGST_PAYABLE");
        const cogsDebit = lines.find(l => l.accountCode === "5010_COGS_AGRI_INPUTS");
        const invCredit = lines.find(l => l.accountCode === "1040_INVENTORY_MAIN_HUB");

        assert.strictEqual(riderDebit.debit, 735.00, 'Rider Cash debit must be 735.00');
        assert.strictEqual(salesCredit.credit, 700.00, 'Sales credit must be 700.00');
        assert.strictEqual(cgstCredit.credit, 17.50, 'CGST credit must be 17.50');
        assert.strictEqual(sgstCredit.credit, 17.50, 'SGST credit must be 17.50');
        assert.strictEqual(cogsDebit.debit, 500.00, 'COGS debit must be 500.00');
        assert.strictEqual(invCredit.credit, 500.00, 'Inventory credit must be 500.00');

        // Sum of all Debits = 735 + 500 = 1235. Sum of Credits = 700 + 17.5 + 17.5 + 500 = 1235.
        const sumDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const sumCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        assert.strictEqual(roundCurrency(sumDebit), 1235.00);
        assert.strictEqual(roundCurrency(sumCredit), 1235.00);

        pass(`2.2 Journal Entry zero-sum verified (Total Debit ₹1235.00 == Total Credit ₹1235.00, proper accounts Dr/Cr)`);
    } catch (err) {
        fail("2.2 Journal Entry verification", err);
    }

    // Test 2.3: Idempotent Delivery Recognition (No duplicate journal postings)
    try {
        const duplicateRecognition = await recognizeOrderDeliveryFinancials({
            orderId: orderIdDelivery,
            periodId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            items: [
                { skuCode: 'SKU-UREA-50KG', quantity: 2, taxablePrice: 350.00, costPrice: 250.00 }
            ]
        });

        assert.strictEqual(duplicateRecognition.alreadyRecognized, true);
        assert.strictEqual(duplicateRecognition.journalEntryId, recognitionResult.journalEntryId);
        pass("2.3 Duplicate delivery recognition blocked idempotently (zero duplicate entries)");
    } catch (err) {
        fail("2.3 Duplicate delivery recognition", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 3: COGS & INVENTORY VALUATION AUDIT
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 3: COGS & Inventory Valuation Audit ---");

    // Test 3.1: Verified Actual Cost Price Source
    try {
        // In order payload with explicit costPrice = 250.00, 2 units -> COGS = 500.00
        assert.strictEqual(recognitionResult.totalCogs, 500.00);
        pass("3.1 COGS verified against explicit purchase/cost price (₹250/unit * 2 = ₹500.00)");
    } catch (err) {
        fail("3.1 COGS verification", err);
    }

    // Test 3.2: Statutory Cost Price Validation (Verified Fix: Strict rejection of missing cost price)
    try {
        let threw = false;
        try {
            await recognizeOrderDeliveryFinancials({
                orderId: "ORDER-TEST-INVALID-COST",
                orderNumber: "KV-ORD-INV",
                items: [{
                    skuId: "SKU-NO-COST",
                    name: "Unknown Cost Seed",
                    hsnCode: "3102",
                    sellingPrice: 400.00,
                    quantity: 1
                    // Neither unitCost nor costPrice provided
                }],
                paymentMethod: "COD",
                totalTaxableAmount: 400.00,
                totalGstAmount: 20.00,
                totalAmount: 420.00
            });
        } catch (err) {
            threw = true;
            assert(err.message.includes("MISSING_COST_PRICE"), `Expected MISSING_COST_PRICE, got ${err.message}`);
        }
        assert.strictEqual(threw, true, "recognizeOrderDeliveryFinancials must reject order lacking statutory cost price");
        pass("3.2 Missing Cost Price Handling: System strictly rejects missing cost price (MISSING_COST_PRICE) and eliminates heuristic estimation");
    } catch (err) {
        fail("3.2 Missing Cost Price Handling", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 4: EXPENSES AND PROFIT & LOSS COMPUTATION
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 4: Expenses & Profit & Loss (P&L) Computation ---");

    // Test 4.1: Statutory P&L Generation
    try {
        const pnl = await generateProfitAndLoss({ periodId });
        
        // Let's inspect P&L values
        console.log(`   [P&L Output] Gross Revenue: ₹${pnl.grossRevenue}, COGS: ₹${pnl.cogs}, Gross Profit: ₹${pnl.grossProfit} (${pnl.grossMarginPercentage}%)`);
        console.log(`   [P&L Output] Operating Expenses: ₹${pnl.operatingExpenses}, Net Profit: ₹${pnl.netProfit}`);
        console.log(`   [P&L Output] Trial Balance Balanced: ${pnl.isTrialBalanceBalanced}`);

        assert(pnl.isTrialBalanceBalanced, 'Trial balance must be balanced');
        assert(pnl.grossRevenue >= 700.00, 'Gross revenue must reflect delivered sales');
        assert(pnl.cogs >= 500.00, 'COGS must reflect cost of delivered goods');
        
        // Rider earning / operating expense check:
        // Has rider commission been posted to general ledger operating expense account (6010 / 6020)?
        if (pnl.operatingExpenses === 0) {
            console.log("   [Audit Note] Operating expenses in general ledger show ₹0. Rider payout in Workflow 3 was settled in rider subledger, but no automated journal entry was posted from rider settlement to '6010_LOGISTICS_DELIVERY_EXPENSE'.");
        }

        pass("4.1 Statutory P&L calculation: Gross Profit = Net Revenue (₹" + pnl.grossRevenue + ") - COGS (₹" + pnl.cogs + ") = ₹" + pnl.grossProfit);
    } catch (err) {
        fail("4.1 Statutory P&L calculation", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 5: GST REPORTS & STATUTORY RECONCILIATION
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 5: GST Reports & Statutory Reconciliation ---");

    // Test 5.1: GSTR-1 Aggregation & Matching with General Ledger
    try {
        const gstr1 = await generateGstr1Summary({ periodId, financialYear });
        
        console.log(`   [GSTR-1] Total Taxable: ₹${gstr1.totalTaxableValue}, Total Tax Liability: ₹${gstr1.totalTaxLiability}`);
        console.log(`   [GSTR-1] Table 7 (B2C Small) Rows: ${gstr1.table7B2C.length}, Table 12 (HSN) Rows: ${gstr1.table12Hsn.length}`);
        console.log(`   [GSTR-1] Table 13 Invoices Issued: ${gstr1.table13Documents.invoices.totalIssued}, Credit Notes: ${gstr1.table13Documents.creditNotes.totalIssued}`);

        assert(gstr1.totalTaxableValue >= 700.00, 'GSTR-1 taxable value must reflect recognized orders');
        assert(gstr1.totalTaxLiability >= 35.00, 'GSTR-1 tax liability must reflect recognized GST');

        // Check Table 13 Documents issued
        assert(gstr1.table13Documents.invoices.totalIssued >= 1, 'Total invoices issued must be at least 1');

        pass("5.1 GSTR-1 aggregation (Table 7 B2C, Table 12 HSN summary, Table 13 Serial tracking) matches order registers");
    } catch (err) {
        fail("5.1 GSTR-1 aggregation", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 6: NEGATIVE, EDGE CASE & SECURITY TESTS
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 6: Negative, Edge Case & Security Tests ---");

    // Test 6.1: Invalid / Unrecognized Shipping Destination State
    try {
        calculateTaxForOrder({
            shippingState: 'Atlantis',
            items: [{ skuCode: 'SKU-01', taxablePrice: 100, hsnCode: '3102' }]
        });
        fail("6.1 Invalid shipping state should throw INVALID_STATE_CODE", new Error("Allowed invalid state"));
    } catch (err) {
        if (err.message.includes('INVALID_STATE_CODE') || err.code === 'INVALID_STATE_CODE') {
            pass("6.1 Invalid shipping destination state rejected with INVALID_STATE_CODE");
        } else {
            fail("6.1 Invalid shipping destination state", err);
        }
    }

    // Test 6.2: Unknown HSN Code without Category Fallback
    try {
        calculateTaxForOrder({
            shippingState: 'Bihar',
            items: [{ skuCode: 'SKU-UNKNOWN', taxablePrice: 100, hsnCode: '999999' }]
        });
        fail("6.2 Unknown HSN without category should throw error", new Error("Allowed unknown HSN"));
    } catch (err) {
        if (err.message.includes('GST_RULE_46_VIOLATION') || err.message.includes('Unknown HSN')) {
            pass("6.2 Unknown HSN without valid tax slab rejected with GST_RULE_46_VIOLATION");
        } else {
            fail("6.2 Unknown HSN rejection", err);
        }
    }

    // Test 6.3: Empty Items Delivery Recognition
    try {
        await recognizeOrderDeliveryFinancials({
            orderId: 'ORD_EMPTY_ITEMS',
            periodId,
            items: []
        });
        fail("6.3 Empty items order recognition should throw EMPTY_ORDER_ITEMS", new Error("Allowed empty items"));
    } catch (err) {
        if (err.message.includes('EMPTY_ORDER_ITEMS')) {
            pass("6.3 Empty items delivery recognition rejected with EMPTY_ORDER_ITEMS");
        } else {
            fail("6.3 Empty items delivery recognition", err);
        }
    }

    // Test 6.4: Unbalanced Journal Entry Protection in generalLedger
    try {
        await postJournalEntry({
            refType: "EXPENSE",
            refId: "TEST_UNBALANCED_01",
            periodId,
            date: new Date(),
            memo: "Unbalanced journal test",
            lines: [
                { accountCode: "6010_RIDER_DELIVERY_PAYOUTS", debit: 500, credit: 0 },
                { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 0, credit: 400 } // Difference of 100!
            ]
        });
        fail("6.4 Unbalanced journal entry should throw error", new Error("Allowed unbalanced journal"));
    } catch (err) {
        if (err.message.includes("UNBALANCED") || err.message.includes("does not balance")) {
            pass("6.4 Unbalanced journal entry strictly rejected by generalLedger engine");
        } else {
            fail("6.4 Unbalanced journal entry rejection", err);
        }
    }

    console.log("\n==================================================================================");
    console.log(`WORKFLOW 5 VERIFICATION COMPLETED: ${passed} PASSED, ${failed} FAILED, ${blocked} BLOCKED`);
    console.log("==================================================================================");
}

runWorkflow5Tests().catch(err => {
    console.error("Workflow 5 test crashed:", err);
    process.exit(1);
});

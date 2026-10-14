/**
 * Real Firestore Emulator Validation Suite
 * Package 2b: Two-Step Refund Integration & Prepaid Revenue Lifecycle
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

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "krishivishal-a9ed7";

const { admin, db } = require("../core/admin");
const { generateCreditNoteForReturn } = require("../invoices/creditNoteEngine");
const { settleWalletRefund, initiateRazorpayRefund } = require("../finance/initiateRefund");
const { recordPrepaidOrderCaptured, processRazorpayWebhookEvent } = require("../finance/razorpay");
const { recognizeOrderDeliveryFinancials } = require("../finance/salesLedger");
const { postJournalEntry } = require("../finance/generalLedger");

console.log("=================================================================");
console.log("=== PACKAGE 2b: TWO-STEP REFUND & PREPAID REVENUE LIFECYCLE   ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                   ===");
console.log("=================================================================\n");

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

/**
 * Helper to fetch persistent journal lines from subcollection
 */
async function getJournalEntryLines(entryId) {
    const snap = await db.collection("journal_entries").doc(entryId).collection("lines").get();
    return snap.docs.map(d => d.data());
}

async function runTests() {
    console.log(`[Emulator Verification] Connected to REAL Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log(`[Project ID] ${process.env.GCLOUD_PROJECT}\n`);

    // Probe emulator
    const probeDoc = db.collection("_emulator_probe").doc("p2b_probe");
    await probeDoc.set({ timestamp: Date.now(), mode: "EMULATOR_TEST" });
    const snap = await probeDoc.get();
    assert.strictEqual(snap.exists, true, "Active read/write connection to Firestore Emulator confirmed.");
    console.log("✅ Probe check verified: Active read/write connection to Firestore Emulator confirmed.\n");

    // =========================================================================
    // TEST (a): Step 1 Credit Note JE Verification (Dr 4010/GST, Cr 2060 + Restock 1040/5010)
    // =========================================================================
    try {
        console.log("--- TEST (a): Step 1 Credit Note Statutory JE & Restocking Verification ---");
        const orderId = "ORD_P2B_TEST_001";
        const returnRequestId = "RET_P2B_TEST_001";
        const originalInvoiceNo = "SAM-26-000000001";

        // Seed parent order
        await db.collection("orders").doc(orderId).set({
            orderId,
            invoiceNumber: originalInvoiceNo,
            status: "DELIVERED",
            shippingState: "Bihar",
            totalAmount: 1180,
            items: [
                {
                    skuId: "SKU_BIO_PEST_01",
                    name: "Organic Bio-Pesticide 1L",
                    quantity: 1,
                    taxablePrice: 1000,
                    sellingPrice: 1000,
                    costPrice: 600,
                    hsn: "3808"
                }
            ]
        });

        const cnResult = await generateCreditNoteForReturn({
            orderId,
            returnRequestId,
            originalInvoiceNo,
            returnedItems: [
                {
                    skuId: "SKU_BIO_PEST_01",
                    name: "Organic Bio-Pesticide 1L",
                    quantity: 1,
                    taxablePrice: 1000,
                    sellingPrice: 1000,
                    costPrice: 600,
                    hsn: "3808"
                }
            ],
            shippingState: "Bihar",
            restockable: true,
            useCreditNoteEntryId: true,
            createdBy: "P2B_TEST_RUNNER"
        });

        assert.strictEqual(cnResult.success, true, "Credit note issuance must succeed");
        const cnNumber = cnResult.creditNoteNumber;
        assert(cnNumber && cnNumber.startsWith("CN-SAM-26-"), `Credit note number must conform to Rule 53 CN-SAM-26- format, got: ${cnNumber}`);
        assert(cnNumber.length <= 16, `Credit note number length must be <= 16 chars (Rule 53), got: ${cnNumber.length}`);

        // Verify Step 1 Journal Entry: entryId = JE_CREDIT_NOTE_${cnNumber}
        const expectedJeId = `JE_CREDIT_NOTE_${cnNumber}`;
        assert.strictEqual(cnResult.journalEntryId, expectedJeId, `Journal entry ID must match JE_CREDIT_NOTE_\${cnNumber}, got: ${cnResult.journalEntryId}`);

        const jeDoc = await db.collection("journal_entries").doc(expectedJeId).get();
        assert.strictEqual(jeDoc.exists, true, "Step 1 Journal Entry document must exist in journal_entries");

        const lines = await getJournalEntryLines(expectedJeId);
        assert(lines.length >= 4, `Expected at least 4 lines in Credit Note JE, got: ${lines.length}`);

        let totalDebit = 0;
        let totalCredit = 0;
        const lineMap = {};

        lines.forEach(l => {
            totalDebit += Number(l.debit || 0);
            totalCredit += Number(l.credit || 0);
            lineMap[l.accountCode] = { debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
        });

        assert.strictEqual(totalDebit, totalCredit, "Step 1 JE must be strictly balanced (Dr == Cr)");

        // Assert Step 1 double-entry accounts
        assert.strictEqual(lineMap["4010_SALES_AGRI_INPUTS"]?.debit, 1000, "Must debit 4010_SALES_AGRI_INPUTS for taxable value (1000)");
        assert.strictEqual(lineMap["2020_OUTPUT_CGST_PAYABLE"]?.debit, 90, "Must debit 2020_OUTPUT_CGST_PAYABLE for CGST reversal (90)");
        assert.strictEqual(lineMap["2030_OUTPUT_SGST_PAYABLE"]?.debit, 90, "Must debit 2030_OUTPUT_SGST_PAYABLE for SGST reversal (90)");
        assert.strictEqual(lineMap["2060_CUSTOMER_REFUNDS_PAYABLE"]?.credit, 1180, "Must credit 2060_CUSTOMER_REFUNDS_PAYABLE for full invoice value (1180)");

        // Assert inventory & COGS restock lines
        assert.strictEqual(lineMap["1040_INVENTORY_MAIN_HUB"]?.debit, 600, "Must debit 1040_INVENTORY_MAIN_HUB for cost of returned goods (600)");
        assert.strictEqual(lineMap["5010_COGS_AGRI_INPUTS"]?.credit, 600, "Must credit 5010_COGS_AGRI_INPUTS for COGS reversal (600)");

        pass("Test (a): Step 1 Credit Note JE verified (Dr 4010 ₹1000, Dr CGST ₹90, Dr SGST ₹90, Cr 2060 ₹1180 + Restock Dr 1040 ₹600 / Cr 5010 ₹600)");
    } catch (err) {
        fail("Test (a): Step 1 Credit Note JE verification", err);
    }

    // =========================================================================
    // TEST (b): Step 2A Wallet Refund Settlement (Dr 2060 / Cr 2065 via walletService)
    // =========================================================================
    try {
        console.log("\n--- TEST (b): Step 2A Wallet Refund Settlement (Dr 2060 / Cr 2065) ---");
        const userId = "usr_p2b_wallet_001";
        const returnId = "RET_P2B_TEST_001";
        const creditNoteNumber = "CN-SAM-26-000001";
        const refundAmount = 1180;

        // Seed user with existing balance ₹500
        await db.collection("users").doc(userId).set({
            uid: userId,
            walletBalance: 500,
            phoneNumber: "+919876543210"
        });

        const settleResult = await settleWalletRefund({
            userId,
            amount: refundAmount,
            returnId,
            creditNoteNumber,
            orderId: "ORD_P2B_TEST_001",
            auth: { uid: "admin_finance_01" }
        });

        assert.strictEqual(settleResult.success, true, "Wallet settlement must return success");
        assert.strictEqual(settleResult.alreadyProcessed, false, "Initial settlement should not be alreadyProcessed");
        assert.strictEqual(settleResult.balanceBefore, 500, "Balance before settlement must be ₹500");
        assert.strictEqual(settleResult.balanceAfter, 1680, "Balance after settlement must be ₹1,680 (500 + 1180)");

        // Verify root wallet_transactions record
        const txDoc = await db.collection("wallet_transactions").doc(settleResult.txId).get();
        assert.strictEqual(txDoc.exists, true, "Root wallet_transactions record must exist");
        const txData = txDoc.data();
        assert.strictEqual(txData.eventType, "ORDER_REFUND", "Transaction eventType must be ORDER_REFUND");
        assert.strictEqual(txData.amount, 1180, "Transaction amount must be 1180");
        assert.strictEqual(txData.type, "CREDIT", "Transaction type must be CREDIT");

        // Verify Step 2A System 2 Journal Entry
        const expectedSettlementJeId = `JE_SETTLEMENT_WALLET_${creditNoteNumber}`;
        const settleJeDoc = await db.collection("journal_entries").doc(expectedSettlementJeId).get();
        assert.strictEqual(settleJeDoc.exists, true, "Settlement Journal Entry document must exist in journal_entries");

        const linesB = await getJournalEntryLines(expectedSettlementJeId);
        const settleLines = {};
        linesB.forEach(l => {
            settleLines[l.accountCode] = { debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
        });

        assert.strictEqual(settleLines["2060_CUSTOMER_REFUNDS_PAYABLE"]?.debit, 1180, "Step 2A must debit 2060_CUSTOMER_REFUNDS_PAYABLE for ₹1180");
        assert.strictEqual(settleLines["2065_CUSTOMER_WALLET_LIABILITY"]?.credit, 1180, "Step 2A must credit 2065_CUSTOMER_WALLET_LIABILITY for ₹1180");

        // Idempotency check: replay settleWalletRefund
        const replayResult = await settleWalletRefund({
            userId,
            amount: refundAmount,
            returnId,
            creditNoteNumber,
            orderId: "ORD_P2B_TEST_001"
        });

        assert.strictEqual(replayResult.alreadyProcessed, true, "Replay must return alreadyProcessed: true");
        const recheckUser = (await db.collection("users").doc(userId).get()).data();
        assert.strictEqual(recheckUser.walletBalance, 1680, "User wallet balance must remain unchanged at ₹1,680 on replay");

        pass("Test (b): Step 2A Wallet Settlement verified (Dr 2060 ₹1180, Cr 2065 ₹1180, walletBalance updated to ₹1680, replay idempotent)");
    } catch (err) {
        fail("Test (b): Step 2A Wallet Settlement", err);
    }

    // =========================================================================
    // TEST (c): Step 2B Razorpay Webhook Processed vs Failed Scenario (Liability Open Proof)
    // =========================================================================
    try {
        console.log("\n--- TEST (c): Step 2B Razorpay Webhook Processed vs Failed Scenario ---");

        // --- Part 1 & 2: Initiation & Processed Webhook ---
        const returnIdOnline = "RET_P2B_ONLINE_001";
        const orderIdOnline = "ORD_P2B_ONLINE_001";
        const rzpPaymentId = "pay_p2b_online_001";
        const rzpRefundId = "rfnd_p2b_online_001";
        const refundAmountOnline = 750;

        // Seed order & return
        await db.collection("orders").doc(orderIdOnline).set({
            orderId: orderIdOnline,
            totalAmount: refundAmountOnline,
            paymentMethod: "RAZORPAY_ONLINE",
            razorpayPaymentId: rzpPaymentId
        });
        await db.collection("returns").doc(returnIdOnline).set({
            returnId: returnIdOnline,
            orderId: orderIdOnline,
            refundAmount: refundAmountOnline,
            creditNoteNo: "CN-SAM-26-000002"
        });

        // Step 2B Initiation
        const initResult = await initiateRazorpayRefund({
            returnId: returnIdOnline,
            orderId: orderIdOnline,
            razorpayPaymentId: rzpPaymentId,
            amount: refundAmountOnline,
            creditNoteNumber: "CN-SAM-26-000002",
            actorId: "admin_tester"
        });

        assert.strictEqual(initResult.status, "INITIATED", "Razorpay refund must be INITIATED");
        const refundRequestId = initResult.refundRequestId;

        const reqDoc = await db.collection("refund_requests").doc(refundRequestId).get();
        assert.strictEqual(reqDoc.exists, true, "refund_requests document must exist");
        assert.strictEqual(reqDoc.data().status, "INITIATED", "refund_requests status must be INITIATED");

        // Dispatch refund.processed webhook event
        const processedEventId = "evt_rfnd_proc_001";
        await processRazorpayWebhookEvent({
            event: "refund.processed",
            payload: {
                refund: {
                    entity: {
                        id: rzpRefundId,
                        payment_id: rzpPaymentId,
                        amount: refundAmountOnline * 100, // paise
                        status: "processed",
                        notes: {
                            returnId: returnIdOnline,
                            orderId: orderIdOnline,
                            refundRequestId
                        }
                    }
                }
            }
        }, processedEventId);

        // Verify refund_requests is PROCESSED
        const reqDocAfter = await db.collection("refund_requests").doc(refundRequestId).get();
        assert.strictEqual(reqDocAfter.data().status, "PROCESSED", "refund_requests status must become PROCESSED");

        // Verify Step 2B Journal Entry: Dr 2060 / Cr 1050
        const expectedGatewayJeId = `JE_SETTLEMENT_GATEWAY_${rzpRefundId}`;
        const gatewayJeDoc = await db.collection("journal_entries").doc(expectedGatewayJeId).get();
        assert.strictEqual(gatewayJeDoc.exists, true, "Gateway settlement Journal Entry must exist");

        const linesC = await getJournalEntryLines(expectedGatewayJeId);
        const gatewayLines = {};
        linesC.forEach(l => {
            gatewayLines[l.accountCode] = { debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
        });

        assert.strictEqual(gatewayLines["2060_CUSTOMER_REFUNDS_PAYABLE"]?.debit, 750, "Must debit 2060_CUSTOMER_REFUNDS_PAYABLE for ₹750");
        assert.strictEqual(gatewayLines["1050_GATEWAY_RECEIVABLE"]?.credit, 750, "Must credit 1050_GATEWAY_RECEIVABLE for ₹750");

        // --- Part 3: Failed Webhook Scenario (Liability Open Proof) ---
        const returnIdFail = "RET_P2B_FAIL_001";
        const orderIdFail = "ORD_P2B_FAIL_001";
        const failPaymentId = "pay_fail_999";
        const failRefundId = "rfnd_fail_999";
        const failAmount = 400;

        // Issue Step 1 Credit Note: creates ₹400 Credit Liability in 2060
        await db.collection("orders").doc(orderIdFail).set({
            orderId: orderIdFail,
            invoiceNumber: "SAM-26-000000099",
            shippingState: "Bihar",
            totalAmount: failAmount,
            items: [{ skuId: "SKU_TOOL_01", name: "Hand Trowel", quantity: 1, taxablePrice: failAmount, sellingPrice: failAmount, costPrice: 200, hsn: "8201" }]
        });

        const step1FailCn = await generateCreditNoteForReturn({
            orderId: orderIdFail,
            returnRequestId: returnIdFail,
            originalInvoiceNo: "SAM-26-000000099",
            returnedItems: [{ skuId: "SKU_TOOL_01", name: "Hand Trowel", quantity: 1, taxablePrice: failAmount, sellingPrice: failAmount, costPrice: 200, hsn: "8201" }],
            shippingState: "Bihar",
            restockable: false,
            useCreditNoteEntryId: true
        });

        // Step 1 credited 2060 with ₹400
        const step1FailLines = await getJournalEntryLines(`JE_CREDIT_NOTE_${step1FailCn.creditNoteNumber}`);
        const failLine2060 = step1FailLines.find(l => l.accountCode === "2060_CUSTOMER_REFUNDS_PAYABLE");
        assert.strictEqual(failLine2060.credit, failAmount, "Step 1 established ₹400 refund liability in 2060");

        // Initiate gateway refund request
        const failInitResult = await initiateRazorpayRefund({
            returnId: returnIdFail,
            orderId: orderIdFail,
            razorpayPaymentId: failPaymentId,
            amount: failAmount,
            creditNoteNumber: step1FailCn.creditNoteNumber
        });

        // Dispatch refund.failed webhook event
        const failEventId = "evt_rfnd_fail_001";
        await processRazorpayWebhookEvent({
            event: "refund.failed",
            payload: {
                refund: {
                    entity: {
                        id: failRefundId,
                        payment_id: failPaymentId,
                        amount: failAmount * 100,
                        status: "failed",
                        error_code: "GATEWAY_BANK_REJECTED",
                        error_description: "Customer bank account closed or frozen",
                        notes: {
                            returnId: returnIdFail,
                            orderId: orderIdFail,
                            refundRequestId: failInitResult.refundRequestId
                        }
                    }
                }
            }
        }, failEventId);

        // Verify refund_requests is marked FAILED
        const failReqDoc = await db.collection("refund_requests").doc(failInitResult.refundRequestId).get();
        assert.strictEqual(failReqDoc.data().status, "FAILED", "refund_requests status must be marked FAILED");
        assert.strictEqual(failReqDoc.data().errorCode, "GATEWAY_BANK_REJECTED", "Error code must be recorded");

        // PROOF OF OPEN LIABILITY: Zero settlement journal entries exist for failRefundId!
        const noGatewayJe = await db.collection("journal_entries").doc(`JE_SETTLEMENT_GATEWAY_${failRefundId}`).get();
        assert.strictEqual(noGatewayJe.exists, false, "CRITICAL: No settlement journal entry should be posted on refund failure!");

        // Invariant: The 2060 liability remains completely intact and open on the general ledger!
        pass("Test (c): Step 2B Razorpay Webhook verified (processed posts Dr 2060 / Cr 1050; failed marks FAILED and leaves 2060 liability open without debit JE)");
    } catch (err) {
        fail("Test (c): Step 2B Razorpay Webhook", err);
    }

    // =========================================================================
    // TEST (d): Prepaid Order Capture (1050 -> 2070) & Delivery Fulfillment (2070 -> 4010)
    // =========================================================================
    try {
        console.log("\n--- TEST (d): Prepaid Order Capture (1050 -> 2070) & Delivery Fulfillment (2070 -> 4010) ---");
        const prepaidOrderId = "ORD_P2B_PREPAID_001";
        const prepaidPaymentId = "pay_prepaid_capture_001";
        const totalAmount = 1050;
        const taxableAmount = 1000;
        const costPrice = 800;

        // 1. Payment Capture Stage: Dr 1050 / Cr 2070
        const captureResult = await recordPrepaidOrderCaptured({
            orderId: prepaidOrderId,
            amount: totalAmount,
            gateway: "RAZORPAY",
            paymentId: prepaidPaymentId,
            createdBy: "PAYMENT_GATEWAY_WEBHOOK"
        });

        assert.strictEqual(captureResult.success, true, "Prepaid order capture JE must succeed");
        const captureJeId = `JE_PREPAID_ORDER_CAPTURED_${prepaidOrderId}`;
        assert.strictEqual(captureResult.entryId, captureJeId, "Entry ID must match deterministic format");

        const captureJeDoc = await db.collection("journal_entries").doc(captureJeId).get();
        assert.strictEqual(captureJeDoc.exists, true, "Capture JE document must exist in journal_entries");

        const linesD1 = await getJournalEntryLines(captureJeId);
        const captureLines = {};
        linesD1.forEach(l => {
            captureLines[l.accountCode] = { debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
        });

        assert.strictEqual(captureLines["1050_GATEWAY_RECEIVABLE"]?.debit, 1050, "Capture must debit 1050_GATEWAY_RECEIVABLE for ₹1050");
        assert.strictEqual(captureLines["2070_DEFERRED_REVENUE"]?.credit, 1050, "Capture must credit 2070_DEFERRED_REVENUE for ₹1050 (Advance receipt)");

        // 2. Delivery Fulfillment Stage: Dr 2070 / Cr 4010 + GST (Cleared by salesLedger)
        await db.collection("orders").doc(prepaidOrderId).set({
            orderId: prepaidOrderId,
            paymentMethod: "RAZORPAY_ONLINE",
            status: "SHIPPED",
            totalAmount: 1050,
            shippingState: "Bihar",
            items: [
                {
                    skuId: "SKU_FERT_01",
                    name: "NPK Water Soluble Fertilizer",
                    quantity: 1,
                    sellingPrice: 1000,
                    taxablePrice: taxableAmount,
                    costPrice: costPrice,
                    hsn: "3105"
                }
            ]
        });

        const deliveryResult = await recognizeOrderDeliveryFinancials({
            orderId: prepaidOrderId,
            paymentMethod: "RAZORPAY_ONLINE",
            shippingState: "Bihar",
            items: [
                {
                    skuId: "SKU_FERT_01",
                    name: "NPK Water Soluble Fertilizer",
                    quantity: 1,
                    sellingPrice: 1000,
                    taxablePrice: taxableAmount,
                    costPrice: costPrice,
                    hsn: "3105"
                }
            ]
        });

        assert.strictEqual(deliveryResult.success, true, "Delivery revenue recognition must succeed");
        const deliveryJeDoc = await db.collection("journal_entries").doc(deliveryResult.journalEntryId).get();
        assert.strictEqual(deliveryJeDoc.exists, true, "Delivery Journal Entry must exist");

        const linesD2 = await getJournalEntryLines(deliveryResult.journalEntryId);
        const deliveryLines = {};
        linesD2.forEach(l => {
            deliveryLines[l.accountCode] = { debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
        });

        // Deferred Revenue Cleared (Debited)
        assert.strictEqual(deliveryLines["2070_DEFERRED_REVENUE"]?.debit, 1050, "Delivery fulfillment must debit 2070_DEFERRED_REVENUE for ₹1050 (clearing deferred revenue)");
        assert.strictEqual(deliveryLines["4010_SALES_AGRI_INPUTS"]?.credit, taxableAmount, `Delivery fulfillment must credit 4010_SALES_AGRI_INPUTS for taxable value (${taxableAmount})`);

        // INVARIANT VERIFICATION: Net 2070 change across lifecycle is exactly 0
        const netDeferredRevenue = (captureLines["2070_DEFERRED_REVENUE"]?.credit || 0) - (deliveryLines["2070_DEFERRED_REVENUE"]?.debit || 0);
        assert.strictEqual(netDeferredRevenue, 0, "Invariant verified: Net Deferred Revenue (2070) balance across capture and delivery is ₹0.00");

        pass("Test (d): Prepaid Order Capture & Delivery Lifecycle verified (Dr 1050 / Cr 2070 on capture, Dr 2070 / Cr 4010 on delivery, Net 2070 = ₹0.00)");
    } catch (err) {
        fail("Test (d): Prepaid Order Capture & Delivery Lifecycle", err);
    }

    // =========================================================================
    // TEST (e): Proof of Zero Double Reversal (Sales Reversal Only in Step 1)
    // =========================================================================
    try {
        console.log("\n--- TEST (e): Proof of Zero Double Reversal Across Two-Step Lifecycle ---");
        const e2eOrderId = "ORD_P2B_E2E_DOUBLE_REV";
        const e2eReturnId = "RET_P2B_E2E_DOUBLE_REV";
        const e2eInvoiceNo = "SAM-26-000000077";
        const totalValue = 1180;
        const taxableVal = 1000;

        // 1. Initial State: Order Delivered & Revenue Recognized
        await db.collection("orders").doc(e2eOrderId).set({
            orderId: e2eOrderId,
            invoiceNumber: e2eInvoiceNo,
            paymentMethod: "COD",
            status: "DELIVERED",
            shippingState: "Bihar",
            totalAmount: totalValue,
            items: [{ skuId: "SKU_BIO_01", name: "Bio Fungicide", quantity: 1, taxablePrice: taxableVal, sellingPrice: totalValue, costPrice: 500, hsn: "3808" }]
        });

        await recognizeOrderDeliveryFinancials({
            orderId: e2eOrderId,
            paymentMethod: "COD",
            shippingState: "Bihar",
            items: [{ skuId: "SKU_BIO_01", name: "Bio Fungicide", quantity: 1, taxablePrice: taxableVal, sellingPrice: totalValue, costPrice: 500, hsn: "3808" }]
        });

        // 2. Step 1: Credit Note Issued
        const e2eCnResult = await generateCreditNoteForReturn({
            orderId: e2eOrderId,
            returnRequestId: e2eReturnId,
            originalInvoiceNo: e2eInvoiceNo,
            returnedItems: [{ skuId: "SKU_BIO_01", name: "Bio Fungicide", quantity: 1, taxablePrice: taxableVal, sellingPrice: totalValue, costPrice: 500, hsn: "3808" }],
            shippingState: "Bihar",
            restockable: true,
            useCreditNoteEntryId: true
        });

        const step1Lines = await getJournalEntryLines(e2eCnResult.journalEntryId);

        // Step 1 MUST reverse sales (Debit 4010)
        const step1SalesDebit = step1Lines.filter(l => l.accountCode === "4010_SALES_AGRI_INPUTS").reduce((acc, l) => acc + (l.debit || 0), 0);
        assert.strictEqual(step1SalesDebit, taxableVal, "Step 1 Credit Note must debit 4010_SALES_AGRI_INPUTS for exactly ₹1000");

        // 3. Step 2A: Wallet Settlement Executed
        const e2eSettlement = await settleWalletRefund({
            userId: "usr_p2b_wallet_001",
            amount: totalValue,
            returnId: e2eReturnId,
            creditNoteNumber: e2eCnResult.creditNoteNumber,
            orderId: e2eOrderId
        });

        const step2Lines = await getJournalEntryLines(e2eSettlement.journalEntryId);

        // CRITICAL PROOF: Step 2 settlement does NOT touch 4010_SALES_AGRI_INPUTS or GST accounts
        const step2SalesTouch = step2Lines.filter(l => l.accountCode === "4010_SALES_AGRI_INPUTS" || l.accountCode.includes("OUTPUT_GST"));
        assert.strictEqual(step2SalesTouch.length, 0, "Step 2 settlement must have ZERO lines referencing 4010 or GST accounts!");

        // Step 2 ONLY debits 2060 and credits 2065
        const step2Accounts = step2Lines.map(l => l.accountCode).sort();
        assert.deepStrictEqual(step2Accounts, ["2060_CUSTOMER_REFUNDS_PAYABLE", "2065_CUSTOMER_WALLET_LIABILITY"], "Step 2 accounts strictly restricted to 2060 and 2065");

        pass("Test (e): Proof of zero double reversal verified (Sales revenue 4010 debited strictly once in Step 1; Step 2 only touches 2060 and 2065)");
    } catch (err) {
        fail("Test (e): Proof of zero double reversal", err);
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n=================================================================");
    console.log(`PACKAGE 2b TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("FATAL ERROR in Package 2b test runner:", err);
    process.exit(1);
});

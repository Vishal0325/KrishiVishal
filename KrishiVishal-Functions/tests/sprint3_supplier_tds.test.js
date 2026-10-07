const assert = require('assert');
const adminModule = require('../core/admin');
const { calculateTdsDeduction, isValidPan, TDS_SECTIONS } = require('../tax/tdsEngine');
const { recordSupplierPurchaseInvoice, recordSupplierPayment } = require('../finance/supplierLedger');
const { CHART_OF_ACCOUNTS } = require('../finance/generalLedger');

console.log("=================================================================");
console.log("=== RUNNING SPRINT 3: SUPPLIER AP & STATUTORY TDS TEST SUITE ===");
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

async function runSprint3TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // Mock In-memory Firestore store
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            supplier_invoices: new Map(),
            audit_logs: new Map()
        };

        function createMockDocRef(collectionName, docId) {
            const table = store[collectionName] || (store[collectionName] = new Map());
            return {
                id: docId,
                get: async () => {
                    const data = table.get(docId);
                    return {
                        exists: !!data,
                        id: docId,
                        data: () => data
                    };
                },
                set: async (payload, options = {}) => {
                    const existing = table.get(docId) || {};
                    const merged = options.merge ? { ...existing, ...payload } : payload;
                    table.set(docId, merged);
                    return true;
                },
                update: async (patch) => {
                    const existing = table.get(docId) || {};
                    table.set(docId, { ...existing, ...patch });
                    return true;
                },
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId)
                    };
                }
            };
        }

        adminModule.db.collection = function (colName) {
            return {
                doc: (id) => createMockDocRef(colName, id),
                add: async (payload) => {
                    const newId = `ID_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                    const table = store[colName] || (store[colName] = new Map());
                    table.set(newId, payload);
                    return { id: newId };
                }
            };
        };

        // Mutex for mock runTransaction
        let txLock = Promise.resolve();
        adminModule.db.runTransaction = async function (updateFunction) {
            const currentLock = txLock;
            let resolveLock;
            txLock = new Promise(r => resolveLock = r);

            await currentLock;
            try {
                const transaction = {
                    get: async (docRef) => docRef.get(),
                    set: (docRef, payload, options) => {
                        docRef.set(payload, options);
                    },
                    update: (docRef, patch) => {
                        docRef.update(patch);
                    }
                };
                return await updateFunction(transaction);
            } finally {
                resolveLock();
            }
        };

        // =================================================================
        // PART 1: SECTION 194C TDS (CONTRACTORS / TRANSPORTERS)
        // =================================================================
        console.log("--- PART 1: Section 194C TDS (Individual vs Company) ---");

        const validPanInd = "ABCDE1234F";
        const validPanComp = "AABCK9821M";

        // Case 1A: Individual Transporter (1% TDS on ₹50,000)
        const resInd = calculateTdsDeduction({
            section: "194C",
            amount: 50000,
            entityType: "INDIVIDUAL",
            pan: validPanInd
        });
        assert.strictEqual(resInd.applicableRate, 0.01);
        assert.strictEqual(resInd.tdsAmount, 500);
        assert.strictEqual(resInd.netPayable, 49500);
        assert.strictEqual(resInd.isPanMissingPenalty, false);
        pass("1.1 194C Individual Transporter: 1% TDS on ₹50,000 = ₹500 (Net Payable: ₹49,500)");

        // Case 1B: Company Fleet Provider (2% TDS on ₹50,000)
        const resComp = calculateTdsDeduction({
            section: "194C",
            amount: 50000,
            entityType: "COMPANY",
            pan: validPanComp
        });
        assert.strictEqual(resComp.applicableRate, 0.02);
        assert.strictEqual(resComp.tdsAmount, 1000);
        assert.strictEqual(resComp.netPayable, 49000);
        assert.strictEqual(resComp.isPanMissingPenalty, false);
        pass("1.2 194C Corporate Transporter: 2% TDS on ₹50,000 = ₹1,000 (Net Payable: ₹49,000)");

        // Threshold check (single invoice <= 30k and aggregate <= 100k -> 0 TDS)
        const belowThreshold = calculateTdsDeduction({
            section: "194C",
            amount: 25000,
            entityType: "INDIVIDUAL",
            pan: validPanInd,
            fyCumulativeAmount: 20000
        });
        assert.strictEqual(belowThreshold.tdsAmount, 0);
        assert.strictEqual(belowThreshold.netPayable, 25000);
        pass("1.3 194C Threshold Guard: Single invoice ₹25,000 below ₹30,000 single / ₹1,00,000 aggregate threshold pays full ₹25,000");

        // =================================================================
        // PART 2: SECTION 206AA PENALTY (MISSING / INVALID PAN)
        // =================================================================
        console.log("\n--- PART 2: Section 206AA Penalty TDS (Flat 20%) ---");

        const invalidPanTest = calculateTdsDeduction({
            section: "194C",
            amount: 50000,
            entityType: "INDIVIDUAL",
            pan: "INVALID_PAN_123" // Invalid regex
        });
        assert.strictEqual(invalidPanTest.isPanMissingPenalty, true);
        assert.strictEqual(invalidPanTest.applicableRate, 0.20);
        assert.strictEqual(invalidPanTest.tdsAmount, 10000);
        assert.strictEqual(invalidPanTest.netPayable, 40000);
        pass("2.1 Section 206AA Missing PAN Penalty: Flat 20% TDS deducted (₹10,000 on ₹50,000)");

        // =================================================================
        // PART 3: SECTION 194H (VLE / KISAN MITRA COMMISSION)
        // =================================================================
        console.log("\n--- PART 3: Section 194H TDS (Commission > ₹15,000) ---");

        const vleCommissionTds = calculateTdsDeduction({
            section: "194H",
            amount: 20000,
            pan: validPanInd
        });
        assert.strictEqual(vleCommissionTds.applicableRate, 0.05);
        assert.strictEqual(vleCommissionTds.tdsAmount, 1000);
        assert.strictEqual(vleCommissionTds.netPayable, 19000);
        pass("3.1 Section 194H VLE Commission: 5% TDS on ₹20,000 = ₹1,000 (Net Payable: ₹19,000)");

        // =================================================================
        // PART 4: INBOUND PURCHASE GRN & DOUBLE-ENTRY LEDGER BALANCE
        // =================================================================
        console.log("\n--- PART 4: Purchase GRN Invoice & Double-Entry AP Ledger ---");

        // Purchase ₹1,00,000 Fertilizers (5% GST = ₹5,000 GST, Total ₹1,05,000)
        // TDS 194Q = 0.1% of ₹1,00,000 = ₹100
        // Net Payable to Vendor = ₹1,05,000 - ₹100 = ₹1,04,900
        const purchaseInvoicePayload = {
            supplierId: "SUPPLIER_IFFCO_PATNA",
            supplierInvoiceNo: "INV_IFFCO_2026_098",
            supplierGstin: "10AAACI1234M1Z8",
            supplierPan: "AABCK9821M",
            entityType: "COMPANY",
            grnId: "GRN_SAM_2026_551",
            periodId: "2026-10",
            shippingState: "Bihar",
            applyTds194Q: true,
            fyCumulativeAmount: 5500000, // Exceeds ₹50 Lakhs threshold
            items: [
                {
                    skuCode: "SKU_UREA_NEEM_45KG",
                    name: "Neem Coated Urea",
                    hsnCode: "3102",
                    quantity: 400,
                    taxableAmount: 100000
                }
            ],
            createdBy: "PROCUREMENT_MANAGER_SHARMA"
        };

        const purchaseResult = await recordSupplierPurchaseInvoice(purchaseInvoicePayload);
        assert.strictEqual(purchaseResult.success, true);
        assert.strictEqual(purchaseResult.grandTotal, 105000); // 100k + 5k GST
        assert.strictEqual(purchaseResult.tdsAmount, 100);     // 0.1% on 100k
        assert.strictEqual(purchaseResult.netSupplierPayable, 104900);

        // Verify stored supplier invoice
        assert(store.supplier_invoices.has(purchaseResult.invoiceDocId));
        const savedInv = store.supplier_invoices.get(purchaseResult.invoiceDocId);
        assert.strictEqual(savedInv.status, "POSTED");
        assert.strictEqual(savedInv.outstandingBalance, 104900);
        assert.strictEqual(savedInv.paidAmount, 0);

        // Verify balanced journal entry in store
        assert(store.journal_entries.has(purchaseResult.journalEntryId));
        const savedJE = store.journal_entries.get(purchaseResult.journalEntryId);
        assert.strictEqual(savedJE.refType, "PURCHASE_GRN");
        assert.strictEqual(savedJE.status, "POSTED");
        assert.strictEqual(savedJE.totalAmount, 105000); // Total Debits == Total Credits == ₹105,000

        pass("4.1 Inbound GRN Invoice: Balanced double-entry passed (Dr Inv ₹1,00,000 + Dr CGST/SGST ₹5,000 == Cr AP ₹1,04,900 + Cr TDS ₹100)");

        // =================================================================
        // PART 5: SUPPLIER PAYMENT SETTLEMENT VIA BANK
        // =================================================================
        console.log("\n--- PART 5: Supplier Payment Settlement via Bank UTR ---");

        const paymentPayload = {
            supplierId: "SUPPLIER_IFFCO_PATNA",
            invoiceId: purchaseResult.invoiceDocId,
            paymentAmount: 104900,
            bankAccountCode: "1030_BANK_CURRENT_HDFC",
            utrRef: "HDFC_CMS_NEFT_9876543210",
            periodId: "2026-10",
            paidBy: "FINANCE_CONTROLLER_VERMA"
        };

        const payResult = await recordSupplierPayment(paymentPayload);
        assert.strictEqual(payResult.success, true);
        assert.strictEqual(payResult.status, "PAID");
        assert.strictEqual(payResult.remainingOutstanding, 0);

        const updatedInv = store.supplier_invoices.get(purchaseResult.invoiceDocId);
        assert.strictEqual(updatedInv.status, "PAID");
        assert.strictEqual(updatedInv.outstandingBalance, 0);
        assert.strictEqual(updatedInv.paidAmount, 104900);
        assert.strictEqual(updatedInv.lastUtrRef, "HDFC_CMS_NEFT_9876543210");

        // Verify settlement journal entry
        assert(store.journal_entries.has(payResult.journalEntryId));
        const settlementJE = store.journal_entries.get(payResult.journalEntryId);
        assert.strictEqual(settlementJE.totalAmount, 104900); // Dr AP ₹1,04,900 == Cr Bank ₹1,04,900
        pass("5.1 Supplier Bank Settlement: AP successfully reduced to ₹0 with UTR audit trail and balanced settlement JE");

        // Overpayment guard check
        let threwOverpayment = false;
        try {
            await recordSupplierPayment({
                supplierId: "SUPPLIER_IFFCO_PATNA",
                invoiceId: purchaseResult.invoiceDocId,
                paymentAmount: 500, // Invoice is already paid
                utrRef: "HDFC_CMS_NEFT_OVERPAY"
            });
        } catch (err) {
            threwOverpayment = true;
            assert(err.message.includes("OVERPAYMENT_BLOCKED"));
        }
        assert(threwOverpayment, "Overpayment on settled invoice must be blocked");
        pass("5.2 Overpayment Guard: System blocks payments exceeding outstanding invoice payable balance");

        // =================================================================
        // PART 6: INDEX.JS LAZY EXPORT INTEGRATION
        // =================================================================
        console.log("\n--- PART 6: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.calculateTdsDeduction, 'function', 'calculateTdsDeduction must be exported');
        assert.strictEqual(typeof indexExports.recordSupplierPurchaseInvoice, 'function', 'recordSupplierPurchaseInvoice must be exported');
        assert.strictEqual(typeof indexExports.recordSupplierPayment, 'function', 'recordSupplierPayment must be exported');
        pass("6.1 All Sprint 3 functions exported cleanly on index.js with lazy loading");

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=================================================================");
    console.log(`SPRINT 3 SUPPLIER AP & TDS TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint3TestSuite().catch((err) => {
    console.error("Sprint 3 Test Suite Unhandled Failure:", err);
    process.exit(1);
});

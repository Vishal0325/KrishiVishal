/**
 * KrishiVishal Supplier Accounts Payable (AP) & Purchase GRN Ledger Engine
 * Double-Entry Accounting conforming to Indian Accounting Standards and Income Tax.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 3).
 */

const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");
const { calculateTaxForOrder, roundCurrency } = require("../tax/gstEngine");
const { calculateTdsDeduction } = require("../tax/tdsEngine");

/**
 * Derives current fiscal period in 'YYYY-MM' format.
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
}

/**
 * Records an inbound supplier purchase invoice backed by a Goods Receipt Note (GRN),
 * calculates statutory Input GST and Section 194Q TDS, and creates an atomic double-entry journal entry.
 * 
 * @param {object} invoiceData
 * @returns {Promise<object>}
 */
async function recordSupplierPurchaseInvoice(invoiceData) {
    const {
        supplierId,
        supplierInvoiceNo,
        supplierGstin,
        supplierPan,
        entityType = "COMPANY",
        grnId,
        periodId = getFiscalPeriodId(),
        items = [],
        shippingState = "Bihar",
        applyTds194Q = false,
        fyCumulativeAmount = 0,
        createdBy = "PROCUREMENT_MANAGER"
    } = invoiceData;

    if (!supplierId) throw new Error("MISSING_SUPPLIER_ID: supplierId is required.");
    if (!supplierInvoiceNo) throw new Error("MISSING_INVOICE_NO: supplierInvoiceNo is required.");
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("EMPTY_PURCHASE_ITEMS: Purchase invoice must have at least one line item.");
    }

    // 1. Calculate Input GST on purchased goods (Intra-state vs Inter-state)
    const taxCalculation = calculateTaxForOrder({
        shippingState,
        items: items.map(item => ({
            skuId: item.skuCode || item.skuId,
            name: item.name || item.skuCode,
            hsn: item.hsnCode || item.hsn,
            quantity: item.quantity || 1,
            taxablePrice: item.taxableAmount !== undefined ? (item.taxableAmount / (item.quantity || 1)) : item.unitPrice,
            category: item.category
        }))
    });

    const { taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, grandTotal } = taxCalculation;

    // Helper to get FY string (e.g. "2026-27")
    const getCurrentFinancialYear = () => {
        const d = new Date();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        return month >= 4 ? `${year}-${String(year+1).slice(2)}` : `${year-1}-${String(year).slice(2)}`;
    };

    // Helper to calculate cumulative amount for TDS threshold
    const getFyCumulativeAmount = async (supplierPan, section, financialYear) => {
        if (!supplierPan) return 0;
        const snapshot = await db.collection('supplier_invoices')
            .where('supplierPan', '==', supplierPan)
            .where('tdsSection', '==', section)
            .where('financialYear', '==', financialYear)
            .where('status', '==', 'POSTED')
            .get();
        return snapshot.docs.reduce((sum, doc) => sum + (doc.data().taxableAmount || 0), 0);
    };

    // 2. Calculate Statutory TDS (Section 194Q on purchase of goods) if applicable
    let tdsDeduction = { tdsAmount: 0, accountCode: "2050_TDS_PAYABLE_194Q" };
    if (applyTds194Q) {
        // Retrieve real cumulative amount from Firestore
        const currentFY = getCurrentFinancialYear();
        const realCumulativeAmount = await getFyCumulativeAmount(supplierPan, "SEC_194Q", currentFY);
        
        tdsDeduction = calculateTdsDeduction({
            section: "194Q",
            amount: taxableAmount, // In India, TDS 194Q is deducted on invoice value excluding GST if GST is shown separately
            entityType,
            pan: supplierPan,
            fyCumulativeAmount: realCumulativeAmount
        });
    }

    const tdsAmount = roundCurrency(tdsDeduction.tdsAmount || 0);
    // Net Payable to Supplier = Grand Total (Goods + GST) - TDS
    const netSupplierPayable = roundCurrency(grandTotal - tdsAmount);

    // 3. Construct Balanced Double-Entry Journal Lines
    const journalLines = [
        // Dr 1040_INVENTORY_MAIN_HUB (Total Taxable Goods Value)
        {
            accountCode: "1040_INVENTORY_MAIN_HUB",
            debit: taxableAmount,
            credit: 0,
            description: `Inbound GRN ${grnId || ''} Inv ${supplierInvoiceNo}`
        }
    ];

    // Input Tax Credit (Asset) Debits
    if (cgstAmount > 0) {
        journalLines.push({
            accountCode: "1060_INPUT_CGST",
            debit: cgstAmount,
            credit: 0,
            description: `Input CGST ITC on Inv ${supplierInvoiceNo}`
        });
    }
    if (sgstAmount > 0) {
        journalLines.push({
            accountCode: "1070_INPUT_SGST",
            debit: sgstAmount,
            credit: 0,
            description: `Input SGST ITC on Inv ${supplierInvoiceNo}`
        });
    }
    if (igstAmount > 0) {
        journalLines.push({
            accountCode: "1080_INPUT_IGST",
            debit: igstAmount,
            credit: 0,
            description: `Input IGST ITC on Inv ${supplierInvoiceNo}`
        });
    }

    // Cr 2010_ACCOUNTS_PAYABLE_SUPPLIERS (Net Payable to Vendor)
    journalLines.push({
        accountCode: "2010_ACCOUNTS_PAYABLE_SUPPLIERS",
        debit: 0,
        credit: netSupplierPayable,
        description: `Payable to Vendor ${supplierId} Inv ${supplierInvoiceNo}`
    });

    // Cr TDS Payable if TDS was deducted
    if (tdsAmount > 0) {
        journalLines.push({
            accountCode: tdsDeduction.accountCode || "2050_TDS_PAYABLE_194Q",
            debit: 0,
            credit: tdsAmount,
            description: `TDS u/s ${tdsDeduction.section || '194Q'} on Inv ${supplierInvoiceNo}`
        });
    }

    // 4. Post Double-Entry Journal Entry Atomically
    const journalResult = await postJournalEntry({
        refType: "PURCHASE_GRN",
        refId: supplierInvoiceNo,
        periodId,
        date: new Date(),
        memo: `Purchase GRN ${grnId || ''} from ${supplierId} (Inv #${supplierInvoiceNo})`,
        lines: journalLines,
        createdBy
    });

    // 5. Store Supplier Invoice in Firestore
    const invoiceDocId = `${supplierId}_${supplierInvoiceNo}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const invoiceRecord = {
        invoiceDocId,
        supplierId,
        supplierInvoiceNo,
        supplierGstin: supplierGstin || null,
        supplierPan: supplierPan || null,
        entityType,
        grnId: grnId || null,
        periodId,
        financialYear: getCurrentFinancialYear(),
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax,
        grandTotal,
        tdsAmount,
        tdsSection: applyTds194Q ? (tdsDeduction.section || "SEC_194Q") : null,
        netPayable: netSupplierPayable,
        paidAmount: 0,
        outstandingBalance: netSupplierPayable,
        journalEntryId: journalResult.entryId,
        status: "POSTED",
        items: taxCalculation.items,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy
    };

    await db.collection("supplier_invoices").doc(invoiceDocId).set(invoiceRecord);

    return {
        success: true,
        invoiceDocId,
        supplierInvoiceNo,
        grandTotal,
        tdsAmount,
        netSupplierPayable,
        journalEntryId: journalResult.entryId,
        invoiceRecord
    };
}

/**
 * Records a bank payment to a supplier, settling the Accounts Payable balance,
 * and passing the settlement double-entry journal entry.
 * 
 * @param {object} param0
 * @param {string} param0.supplierId
 * @param {string} param0.invoiceId (Document ID in supplier_invoices)
 * @param {number} param0.paymentAmount
 * @param {string} [param0.bankAccountCode] Defaults to "1030_BANK_CURRENT_HDFC"
 * @param {string} param0.utrRef Bank transaction / UTR reference number
 * @param {string} [param0.periodId]
 * @param {string} [param0.paidBy]
 * @returns {Promise<object>}
 */
async function recordSupplierPayment({
    supplierId,
    invoiceId,
    paymentAmount,
    bankAccountCode = "1030_BANK_CURRENT_HDFC",
    utrRef,
    periodId = getFiscalPeriodId(),
    paidBy = "FINANCE_CONTROLLER"
}) {
    if (!supplierId) throw new Error("MISSING_SUPPLIER_ID: supplierId is required.");
    if (!invoiceId) throw new Error("MISSING_INVOICE_ID: invoiceId is required.");
    if (!utrRef) throw new Error("MISSING_UTR_REF: Bank UTR reference is mandatory for statutory bank reconciliation.");

    const payAmt = roundCurrency(Number(paymentAmount || 0));
    if (payAmt <= 0) {
        throw new Error("INVALID_PAYMENT_AMOUNT: Payment amount must be greater than zero.");
    }

    const invoiceRef = db.collection("supplier_invoices").doc(invoiceId);

    const settlementResult = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(invoiceRef);
        if (!docSnap.exists) {
            throw new Error(`INVOICE_NOT_FOUND: Supplier invoice '${invoiceId}' does not exist.`);
        }

        const inv = docSnap.data();
        const currentOutstanding = roundCurrency(inv.outstandingBalance || 0);

        if (payAmt > currentOutstanding) {
            throw new Error(`OVERPAYMENT_BLOCKED: Payment amount (₹${payAmt}) exceeds outstanding payable balance (₹${currentOutstanding}).`);
        }

        const newPaidAmount = roundCurrency((inv.paidAmount || 0) + payAmt);
        const newOutstanding = roundCurrency(currentOutstanding - payAmt);
        const newStatus = newOutstanding === 0 ? "PAID" : "PARTIALLY_PAID";

        transaction.update(invoiceRef, {
            paidAmount: newPaidAmount,
            outstandingBalance: newOutstanding,
            status: newStatus,
            lastUtrRef: utrRef,
            lastPaidAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPaidBy: paidBy
        });

        return {
            supplierInvoiceNo: inv.supplierInvoiceNo,
            newPaidAmount,
            newOutstanding,
            newStatus
        };
    });

    // Double-Entry Payment Settlement:
    // Dr 2010_ACCOUNTS_PAYABLE_SUPPLIERS | Cr 1030_BANK_CURRENT_HDFC
    const journalResult = await postJournalEntry({
        refType: "EXPENSE",
        refId: utrRef,
        periodId,
        date: new Date(),
        memo: `Bank settlement for Supplier ${supplierId} (Inv #${settlementResult.supplierInvoiceNo}) UTR: ${utrRef}`,
        lines: [
            {
                accountCode: "2010_ACCOUNTS_PAYABLE_SUPPLIERS",
                debit: payAmt,
                credit: 0,
                description: `Payment to ${supplierId} Inv ${settlementResult.supplierInvoiceNo}`
            },
            {
                accountCode: bankAccountCode || "1030_BANK_CURRENT_HDFC",
                debit: 0,
                credit: payAmt,
                description: `HDFC Bank settlement UTR: ${utrRef}`
            }
        ],
        createdBy: paidBy
    });

    return {
        success: true,
        invoiceId,
        paidAmount: payAmt,
        remainingOutstanding: settlementResult.newOutstanding,
        status: settlementResult.newStatus,
        utrRef,
        journalEntryId: journalResult.entryId
    };
}

module.exports = {
    getFiscalPeriodId,
    recordSupplierPurchaseInvoice,
    recordSupplierPayment
};

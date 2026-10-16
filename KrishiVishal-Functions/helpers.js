/**
 * KrishiVishal Internal Business Logic & Helper Exports
 * Extracted from index.js FUNCTION_MAP to decouple internal service functions
 * from Cloud Function triggers and callables.
 */

module.exports = {
    // --- FINANCE LEDGER HELPERS ---
    get postJournalEntry() {
        return require('./finance/generalLedger').postJournalEntry;
    },
    get recordSupplierPurchaseInvoice() {
        return require('./finance/supplierLedger').recordSupplierPurchaseInvoice;
    },
    get recordSupplierPayment() {
        return require('./finance/supplierLedger').recordSupplierPayment;
    },
    get recognizeOrderDeliveryFinancials() {
        return require('./finance/salesLedger').recognizeOrderDeliveryFinancials;
    },

    // --- INVOICE & CREDIT NOTE HELPERS ---
    get getNextInvoiceNumber() {
        return require('./invoices/sequentialInvoiceEngine').getNextInvoiceNumber;
    },
    get generateCreditNoteForReturn() {
        return require('./invoices/creditNoteEngine').generateCreditNoteForReturn;
    },
    get generateAndUploadCreditNotePdf() {
        return require('./invoices/invoiceService').generateAndUploadCreditNotePdf;
    },
    get buildCreditNotePdfBuffer() {
        return require('./invoices/invoiceService').buildCreditNotePdfBuffer;
    },

    // --- STATUTORY TAX & TDS HELPERS ---
    get calculateTaxForOrder() {
        return require('./tax/gstEngine').calculateTaxForOrder;
    },
    get calculateTdsDeduction() {
        return require('./tax/tdsEngine').calculateTdsDeduction;
    }
};

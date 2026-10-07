/**
 * Rule 53 CGST Compliant Credit Note Engine (RTO & Sales Returns)
 * Conforming to Section 34 of the CGST Act, 2017 & Rule 53.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 2).
 */

const { db, admin } = require("../core/admin");
const { getCurrentFinancialYear } = require("./sequentialInvoiceEngine");
const { postJournalEntry } = require("../finance/generalLedger");
const { calculateTaxForOrder, roundCurrency } = require("../tax/gstEngine");

/**
 * Concurrency-safe consecutive credit note number generator.
 * Format: KV/CN/{FY}/{SEQUENCE_5_DIGITS} (e.g. KV/CN/26-27/00001)
 * Statutory limit: <= 16 characters.
 * 
 * @param {string} [financialYear] e.g. "26-27"
 * @param {string} [prefix] defaults to "KV/CN"
 * @returns {Promise<{ creditNoteNumber: string, sequence: number, financialYear: string }>}
 */
async function getNextCreditNoteNumber(financialYear = null, prefix = "KV/CN") {
    const fy = financialYear || getCurrentFinancialYear();
    const counterRef = db.collection("credit_note_counters").doc(fy);

    const result = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const paddedSequence = String(nextSequence).padStart(5, "0");
        const creditNoteNumber = `${prefix}/${fy}/${paddedSequence}`;

        if (creditNoteNumber.length > 18) {
            throw new Error(`GST_RULE_53_VIOLATION: Credit note number '${creditNoteNumber}' exceeds maximum allowed length.`);
        }

        transaction.set(counterRef, {
            financialYear: fy,
            prefix,
            currentSequence: nextSequence,
            lastGeneratedCreditNoteNumber: creditNoteNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            creditNoteNumber,
            sequence: nextSequence,
            financialYear: fy
        };
    });

    return result;
}

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
 * Generates a Rule 53 statutory Credit Note for an RTO or customer sales return,
 * writing to `credit_notes/{creditNoteId}` and posting a double-entry reversal journal entry.
 * 
 * @param {object} param0
 * @param {string} param0.orderId
 * @param {string} param0.originalInvoiceNo
 * @param {string} param0.returnReason "RTO_FAILED_DELIVERY" | "CUSTOMER_REJECTED" | "DAMAGED_TRANSIT" etc.
 * @param {Array<object>} param0.returnedItems [{ skuId, name, quantity, unitPrice, taxablePrice, hsn, costPrice }]
 * @param {boolean} [param0.restockable] If true, restocks to saleable inventory (Dr Inventory | Cr COGS)
 * @param {string} [param0.shippingState] e.g. "Bihar"
 * @param {string} [param0.createdBy]
 * @returns {Promise<object>} Credit note record & Journal Entry reference
 */
async function generateCreditNoteForReturn({
    orderId,
    originalInvoiceNo,
    returnReason = "CUSTOMER_RETURN",
    returnedItems = [],
    restockable = true,
    shippingState = "Bihar",
    createdBy = "SYSTEM"
}) {
    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");
    if (!originalInvoiceNo) throw new Error("MISSING_INVOICE_NO: originalInvoiceNo is required.");
    if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
        throw new Error("EMPTY_RETURN_ITEMS: At least one returned item is required.");
    }

    // 1. Calculate dynamic tax reversal amounts based on returned items
    const taxCalculation = calculateTaxForOrder({
        shippingState,
        items: returnedItems
    });

    const { taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, grandTotal } = taxCalculation;

    // 2. Generate consecutive Credit Note Number
    const { creditNoteNumber } = await getNextCreditNoteNumber();
    const creditNoteId = creditNoteNumber.replace(/\//g, "_");

    // 3. Construct Double-Entry Reversal Journal Entry Lines
    const journalLines = [
        // Dr 4010_SALES_AGRI_INPUTS (Contra Revenue for base taxable value)
        { accountCode: "4010_SALES_AGRI_INPUTS", debit: taxableAmount, credit: 0, description: `Sales Return: ${originalInvoiceNo}` }
    ];

    // Reversal of Output GST liabilities
    if (cgstAmount > 0) {
        journalLines.push({ accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: cgstAmount, credit: 0, description: `CGST Reversal CN ${creditNoteNumber}` });
    }
    if (sgstAmount > 0) {
        journalLines.push({ accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: sgstAmount, credit: 0, description: `SGST Reversal CN ${creditNoteNumber}` });
    }
    if (igstAmount > 0) {
        journalLines.push({ accountCode: "2040_OUTPUT_IGST_PAYABLE", debit: igstAmount, credit: 0, description: `IGST Reversal CN ${creditNoteNumber}` });
    }

    // Credit Customer Refund Payable / Cash for grand refund amount
    journalLines.push({
        accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE",
        debit: 0,
        credit: grandTotal,
        description: `Refund Payable to Customer CN ${creditNoteNumber}`
    });

    // 4. Calculate Restockable Inventory / COGS Reversal if goods are undamaged
    let totalCostOfReturnedGoods = 0;
    if (restockable) {
        returnedItems.forEach(item => {
            const cost = Number(item.costPrice || (item.taxablePrice || item.price || 0) * 0.7); // 70% standard cost if not specified
            const qty = Number(item.quantity || 1);
            totalCostOfReturnedGoods += roundCurrency(cost * qty);
        });
        totalCostOfReturnedGoods = roundCurrency(totalCostOfReturnedGoods);

        if (totalCostOfReturnedGoods > 0) {
            journalLines.push({
                accountCode: "1040_INVENTORY_MAIN_HUB",
                debit: totalCostOfReturnedGoods,
                credit: 0,
                description: `Restock returned inventory CN ${creditNoteNumber}`
            });
            journalLines.push({
                accountCode: "5010_COGS_AGRI_INPUTS",
                debit: 0,
                credit: totalCostOfReturnedGoods,
                description: `COGS reversal on return restock CN ${creditNoteNumber}`
            });
        }
    }

    const periodId = getFiscalPeriodId();

    // 5. Post atomic journal entry
    const journalResult = await postJournalEntry({
        refType: "SALES_RETURN",
        refId: creditNoteNumber,
        periodId,
        date: new Date(),
        memo: `Credit Note ${creditNoteNumber} for Invoice ${originalInvoiceNo} (${returnReason})`,
        lines: journalLines,
        createdBy
    });

    // 6. Persist Credit Note document in Firestore
    const creditNoteDoc = {
        creditNoteId,
        creditNoteNo: creditNoteNumber,
        originalInvoiceNo,
        orderId,
        returnReason,
        shippingState,
        taxableAmount,
        cgstReversal: cgstAmount,
        sgstReversal: sgstAmount,
        igstReversal: igstAmount,
        totalTaxReversal: totalTax,
        totalRefundAmount: grandTotal,
        restockable: !!restockable,
        restockedCostAmount: totalCostOfReturnedGoods,
        journalEntryId: journalResult.entryId,
        items: taxCalculation.items,
        status: "ISSUED",
        issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        issuedBy: createdBy
    };

    await db.collection("credit_notes").doc(creditNoteId).set(creditNoteDoc);

    return {
        success: true,
        creditNoteNumber,
        creditNoteId,
        totalRefundAmount: grandTotal,
        journalEntryId: journalResult.entryId,
        creditNote: creditNoteDoc
    };
}

module.exports = {
    getNextCreditNoteNumber,
    getFiscalPeriodId,
    generateCreditNoteForReturn
};

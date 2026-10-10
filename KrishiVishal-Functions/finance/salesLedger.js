/**
 * KrishiVishal Sales Ledger & Order Delivery Revenue Recognition Engine
 * Conforming to Ind AS 115 (Revenue from Contracts with Customers), Matching Principle, & Rule 46 CGST.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 4).
 */

const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");
const { calculateTaxForOrder, roundCurrency } = require("../tax/gstEngine");
const { getNextInvoiceNumber, getOrCreateInvoiceNumberForOrder, getCurrentFinancialYear } = require("../invoices/sequentialInvoiceEngine");

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
 * Recognizes revenue and COGS matching for a delivered customer order.
 * 
 * 1. Calculates dynamic tax breakdown via gstEngine.
 * 2. Assigns consecutive tax invoice number (KV/26-27/00001).
 * 3. Computes COGS from delivered item unit costs.
 * 4. Posts atomic balanced double-entry journal entry.
 * 5. Updates order with invoice number, financialStatus: 'RECOGNIZED'.
 * 
 * @param {object} orderData
 * @returns {Promise<object>}
 */
async function recognizeOrderDeliveryFinancials(orderData) {
    const {
        orderId,
        periodId = getFiscalPeriodId(),
        paymentMethod = "COD",
        shippingState = "Bihar",
        items = [],
        financialYear = getCurrentFinancialYear(),
        createdBy = "SYSTEM_DELIVERY_TRIGGER"
    } = orderData;

    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("EMPTY_ORDER_ITEMS: Order must contain at least one line item to recognize revenue.");
    }

    // 0. Idempotency Check: Guard against duplicate delivery recognition
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    const existingOrder = orderSnap.exists ? (orderSnap.data() || {}) : {};

    if (existingOrder.financialStatus === "RECOGNIZED") {
        console.log(`[salesLedger] Order ${orderId} already financially recognized with Invoice #${existingOrder.invoiceNumber}. Returning existing record.`);
        return {
            success: true,
            alreadyRecognized: true,
            orderId,
            invoiceNumber: existingOrder.invoiceNumber,
            totalSales: existingOrder.totalSales,
            taxableAmount: existingOrder.taxableAmount,
            totalTax: existingOrder.totalTax,
            totalCogs: existingOrder.totalCogs,
            journalEntryId: existingOrder.journalEntryId
        };
    }

    // 1. Calculate statutory GST breakdown (Intra-State vs Inter-State)
    const taxCalculation = calculateTaxForOrder({
        shippingState,
        items: items.map(item => ({
            skuId: item.skuCode || item.skuId,
            name: item.name || item.skuCode,
            hsn: item.hsnCode || item.hsn,
            quantity: item.quantity || 1,
            taxablePrice: item.sellingPrice !== undefined ? item.sellingPrice : (item.taxablePrice || item.price || 0),
            category: item.category
        }))
    });

    const { taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, grandTotal } = taxCalculation;

    // 2. Obtain Official Consecutive Tax Invoice Number (Rule 46 CGST)
    // Reuse existing official invoiceNumber if already allocated (e.g. at dispatch/packaging)
    let invoiceNumber = existingOrder.invoiceNumber || (existingOrder.invoice && existingOrder.invoice.invoiceNumber);
    if (!invoiceNumber || String(invoiceNumber).startsWith("KV/SAM/")) {
        const alloc = await getOrCreateInvoiceNumberForOrder(orderId, financialYear);
        invoiceNumber = alloc.invoiceNumber;
    }

    // 3. Compute Cost of Goods Sold (COGS) matching
    let totalCogs = 0;
    items.forEach(item => {
        const qty = Number(item.quantity || 1);
        const unitCost = Number(item.unitCost !== undefined ? item.unitCost : (item.costPrice !== undefined ? item.costPrice : (item.sellingPrice || item.price || 0) * 0.7));
        totalCogs += roundCurrency(unitCost * qty);
    });
    totalCogs = roundCurrency(totalCogs);

    // 4. Construct Balanced Double-Entry Journal Lines
    const isCod = String(paymentMethod).toUpperCase() === "COD";
    const debitAccount = isCod ? "1010_CASH_IN_HAND_RIDERS" : "1050_GATEWAY_RECEIVABLE";

    const journalLines = [
        // Debit Asset: Rider Cash or Gateway Receivable for total order amount
        {
            accountCode: debitAccount,
            debit: grandTotal,
            credit: 0,
            description: `${isCod ? 'COD collected by Rider' : 'Gateway Receivable'} for Order ${orderId}`
        },
        // Credit Operating Revenue for taxable base value
        {
            accountCode: "4010_SALES_AGRI_INPUTS",
            debit: 0,
            credit: taxableAmount,
            description: `Sales Revenue on Order ${orderId} (Inv #${invoiceNumber})`
        }
    ];

    // Output GST Liabilities
    if (cgstAmount > 0) {
        journalLines.push({
            accountCode: "2020_OUTPUT_CGST_PAYABLE",
            debit: 0,
            credit: cgstAmount,
            description: `Output CGST on Order ${orderId}`
        });
    }
    if (sgstAmount > 0) {
        journalLines.push({
            accountCode: "2030_OUTPUT_SGST_PAYABLE",
            debit: 0,
            credit: sgstAmount,
            description: `Output SGST on Order ${orderId}`
        });
    }
    if (igstAmount > 0) {
        journalLines.push({
            accountCode: "2040_OUTPUT_IGST_PAYABLE",
            debit: 0,
            credit: igstAmount,
            description: `Output IGST on Order ${orderId}`
        });
    }

    // Matching Principle: COGS Recognition (Dr COGS | Cr Inventory)
    if (totalCogs > 0) {
        journalLines.push({
            accountCode: "5010_COGS_AGRI_INPUTS",
            debit: totalCogs,
            credit: 0,
            description: `COGS recognized for Order ${orderId}`
        });
        journalLines.push({
            accountCode: "1040_INVENTORY_MAIN_HUB",
            debit: 0,
            credit: totalCogs,
            description: `Inventory reduction on sale for Order ${orderId}`
        });
    }

    // 5. Post atomic journal entry (Asserts Debits === Credits)
    const journalResult = await postJournalEntry({
        refType: "ORDER_DELIVERY",
        refId: orderId,
        periodId,
        date: new Date(),
        memo: `Sales & COGS recognition for Order #${orderId} (Invoice #${invoiceNumber})`,
        lines: journalLines,
        createdBy
    });

    // 6. Update order document with recognized financial metadata
    await orderRef.set({
        invoiceNumber,
        financialStatus: "RECOGNIZED",
        financialPeriodId: periodId,
        journalEntryId: journalResult.entryId,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax,
        totalSales: grandTotal,
        totalCogs,
        recognizedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
        success: true,
        orderId,
        invoiceNumber,
        totalSales: grandTotal,
        taxableAmount,
        totalTax,
        totalCogs,
        journalEntryId: journalResult.entryId
    };
}

module.exports = {
    getFiscalPeriodId,
    recognizeOrderDeliveryFinancials
};

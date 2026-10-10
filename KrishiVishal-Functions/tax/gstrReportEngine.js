/**
 * KrishiVishal Statutory GSTR-1 Aggregator Engine
 * Generates Table 7 (B2C Small), Table 12 (HSN-wise Summary), and Table 13 (Documents Issued)
 * for direct upload/verification on the GST portal or ClearTax GSP.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 5).
 */

const { db } = require("../core/admin");
const { roundCurrency } = require("../finance/financialReports");

/**
 * Aggregates GSTR-1 tables for a specific fiscal period.
 * 
 * @param {object} param0
 * @param {string} param0.periodId e.g. "2026-10"
 * @param {string} [param0.financialYear] e.g. "26-27"
 * @returns {Promise<object>}
 */
async function generateGstr1Summary({ periodId, financialYear = "26-27" }) {
    if (!periodId) throw new Error("MISSING_PERIOD_ID: periodId is required (e.g. '2026-10')");

    // 1. Fetch all recognized orders (Invoices) for this period
    const ordersSnap = await db.collection("orders")
        .where("financialPeriodId", "==", periodId)
        .where("financialStatus", "==", "RECOGNIZED")
        .get();

    // 2. Fetch all credit notes for this period strictly
    // Credit notes are stored with financialPeriodId (or periodId fallback) and status: "ISSUED"
    let creditNotesSnap = await db.collection("credit_notes")
        .where("financialPeriodId", "==", periodId)
        .where("status", "==", "ISSUED")
        .get();

    // Fallback if records were indexed under legacy periodId field
    if (creditNotesSnap.empty) {
        creditNotesSnap = await db.collection("credit_notes")
            .where("periodId", "==", periodId)
            .where("status", "==", "ISSUED")
            .get();
    }

    // Data structures for Tables 7, 12, 13
    const table7Map = new Map(); // key: `${state}_${rate}`
    const table12Map = new Map(); // key: hsnCode
    const invoiceSerials = [];
    const creditNoteSerials = [];

    let totalTaxableValue = 0;
    let totalTaxLiability = 0;

    // Process Orders (Tax Invoices)
    for (const doc of ordersSnap.docs) {
        const order = doc.data() || {};
        const invoiceNo = order.invoiceNumber;
        if (invoiceNo) invoiceSerials.push(invoiceNo);

        const state = order.shippingState || order.shippingAddress?.state || "Bihar";
        const items = order.items || [];

        for (const item of items) {
            const hsn = String(item.hsn || item.hsnCode || "3808").slice(0, 4);
            const qty = Number(item.quantity || 1);
            const taxable = roundCurrency(Number(item.taxablePrice !== undefined ? item.taxablePrice : (item.sellingPrice || item.price || 0)) * qty);
            const rate = Number(item.taxRate !== undefined ? item.taxRate : 0.18); // default fallback
            const cgst = roundCurrency(Number(item.cgstAmount || 0));
            const sgst = roundCurrency(Number(item.sgstAmount || 0));
            const igst = roundCurrency(Number(item.igstAmount || 0));
            const totalTax = roundCurrency(cgst + sgst + igst);

            totalTaxableValue += taxable;
            totalTaxLiability += totalTax;

            // Table 7 aggregation (State + Rate)
            const t7Key = `${state}_${rate}`;
            if (!table7Map.has(t7Key)) {
                table7Map.set(t7Key, {
                    placeOfSupply: state,
                    rate: rate * 100,
                    taxableValue: 0,
                    cgstAmount: 0,
                    sgstAmount: 0,
                    igstAmount: 0,
                    totalTax: 0
                });
            }
            const t7Entry = table7Map.get(t7Key);
            t7Entry.taxableValue += taxable;
            t7Entry.cgstAmount += cgst;
            t7Entry.sgstAmount += sgst;
            t7Entry.igstAmount += igst;
            t7Entry.totalTax += totalTax;

            // Table 12 aggregation (HSN Summary)
            if (!table12Map.has(hsn)) {
                table12Map.set(hsn, {
                    hsnCode: hsn,
                    description: item.name || item.title || `HSN ${hsn}`,
                    totalQuantity: 0,
                    totalTaxableValue: 0,
                    cgstAmount: 0,
                    sgstAmount: 0,
                    igstAmount: 0,
                    totalTax: 0
                });
            }
            const t12Entry = table12Map.get(hsn);
            t12Entry.totalQuantity += qty;
            t12Entry.totalTaxableValue += taxable;
            t12Entry.cgstAmount += cgst;
            t12Entry.sgstAmount += sgst;
            t12Entry.igstAmount += igst;
            t12Entry.totalTax += totalTax;
        }
    }

    // Process Credit Notes for Table 7 netting, Table 12 reduction, Table 13 serials, and totals
    for (const doc of creditNotesSnap.docs) {
        const cn = doc.data() || {};
        if (cn.creditNoteNo) creditNoteSerials.push(cn.creditNoteNo);

        const cnState = cn.shippingState || "Bihar";
        const cnItems = cn.items || [];

        // If line items are present on credit note, net per-line
        if (Array.isArray(cnItems) && cnItems.length > 0) {
            for (const item of cnItems) {
                const hsn = String(item.hsn || item.hsnCode || "3808").slice(0, 4);
                const qty = Number(item.quantity || 1);
                const taxable = roundCurrency(Number(item.taxableAmount !== undefined ? item.taxableAmount : (item.taxablePrice ? item.taxablePrice * qty : 0)));
                const rate = Number(item.taxRate !== undefined ? item.taxRate : 0.18);
                const cgst = roundCurrency(Number(item.cgstAmount || 0));
                const sgst = roundCurrency(Number(item.sgstAmount || 0));
                const igst = roundCurrency(Number(item.igstAmount || 0));
                const totalTax = roundCurrency(cgst + sgst + igst);

                totalTaxableValue -= taxable;
                totalTaxLiability -= totalTax;

                // Table 7 netting (subtract from respective state + rate bucket)
                const t7Key = `${cnState}_${rate}`;
                if (table7Map.has(t7Key)) {
                    const t7Entry = table7Map.get(t7Key);
                    t7Entry.taxableValue -= taxable;
                    t7Entry.cgstAmount -= cgst;
                    t7Entry.sgstAmount -= sgst;
                    t7Entry.igstAmount -= igst;
                    t7Entry.totalTax -= totalTax;
                }

                // Table 12 netting (subtract returned line item quantities and taxable amounts per HSN)
                if (table12Map.has(hsn)) {
                    const t12Entry = table12Map.get(hsn);
                    t12Entry.totalQuantity -= qty;
                    t12Entry.totalTaxableValue -= taxable;
                    t12Entry.cgstAmount -= cgst;
                    t12Entry.sgstAmount -= sgst;
                    t12Entry.igstAmount -= igst;
                    t12Entry.totalTax -= totalTax;
                }
            }
        } else {
            // Document-level fallback if item breakdown not present (e.g. mock or summary-only credit notes)
            const cnTaxable = roundCurrency(Number(cn.taxableAmount || 0));
            const cnCgst = roundCurrency(Number(cn.cgstReversal || cn.cgstAmount || 0));
            const cnSgst = roundCurrency(Number(cn.sgstReversal || cn.sgstAmount || 0));
            const cnIgst = roundCurrency(Number(cn.igstReversal || cn.igstAmount || 0));
            const cnTotalTax = roundCurrency(cnCgst + cnSgst + cnIgst || Number(cn.totalTaxReversal || 0));

            totalTaxableValue -= cnTaxable;
            totalTaxLiability -= cnTotalTax;

            // Net from first matching state bucket or dominant bucket
            for (const [key, t7Entry] of table7Map.entries()) {
                if (key.startsWith(`${cnState}_`)) {
                    t7Entry.taxableValue -= cnTaxable;
                    t7Entry.cgstAmount -= cnCgst;
                    t7Entry.sgstAmount -= cnSgst;
                    t7Entry.igstAmount -= cnIgst;
                    t7Entry.totalTax -= cnTotalTax;
                    break;
                }
            }
        }
    }

    // Format Table 7 with non-negative lower bounds
    const table7B2C = Array.from(table7Map.values()).map(row => ({
        ...row,
        taxableValue: Math.max(0, roundCurrency(row.taxableValue)),
        cgstAmount: Math.max(0, roundCurrency(row.cgstAmount)),
        sgstAmount: Math.max(0, roundCurrency(row.sgstAmount)),
        igstAmount: Math.max(0, roundCurrency(row.igstAmount)),
        totalTax: Math.max(0, roundCurrency(row.totalTax))
    }));

    // Format Table 12 with non-negative lower bounds
    const table12Hsn = Array.from(table12Map.values()).map(row => ({
        ...row,
        totalQuantity: Math.max(0, row.totalQuantity),
        totalTaxableValue: Math.max(0, roundCurrency(row.totalTaxableValue)),
        cgstAmount: Math.max(0, roundCurrency(row.cgstAmount)),
        sgstAmount: Math.max(0, roundCurrency(row.sgstAmount)),
        igstAmount: Math.max(0, roundCurrency(row.igstAmount)),
        totalTax: Math.max(0, roundCurrency(row.totalTax))
    }));

    // Format Table 13 (Documents Issued)
    invoiceSerials.sort();
    creditNoteSerials.sort();

    const table13Documents = {
        invoices: {
            natureOfDocument: "Tax Invoices for B2C Supply of Goods",
            fromSerial: invoiceSerials.length > 0 ? invoiceSerials[0] : null,
            toSerial: invoiceSerials.length > 0 ? invoiceSerials[invoiceSerials.length - 1] : null,
            totalIssued: invoiceSerials.length,
            cancelledCount: 0
        },
        creditNotes: {
            natureOfDocument: "Credit Notes for Returns & RTO",
            fromSerial: creditNoteSerials.length > 0 ? creditNoteSerials[0] : null,
            toSerial: creditNoteSerials.length > 0 ? creditNoteSerials[creditNoteSerials.length - 1] : null,
            totalIssued: creditNoteSerials.length,
            cancelledCount: 0
        }
    };

    return {
        periodId,
        financialYear,
        table7B2C,
        table12Hsn,
        table13Documents,
        totalTaxableValue: Math.max(0, roundCurrency(totalTaxableValue)),
        totalTaxLiability: Math.max(0, roundCurrency(totalTaxLiability))
    };
}

module.exports = {
    generateGstr1Summary
};

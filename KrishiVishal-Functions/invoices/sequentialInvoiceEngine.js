/**
 * Consecutive Tax Invoice Number Generator
 * Compliant with Rule 46 of the CGST Rules, 2017:
 * - Consecutive serial number, not exceeding 16 characters in one or multiple series,
 *   containing alphabets, numerals, and special characters (- or /).
 * - Format: KV/{FY}/{SEQUENCE_5_DIGITS} (e.g. KV/26-27/00001).
 * 
 * Part 2 of CA-Ready Financial Architecture.
 */

const { db, admin } = require("../core/admin");

/**
 * Derives current Indian Financial Year string (e.g. "26-27" for FY 2026-2027).
 * Indian FY starts 1st April and ends 31st March.
 * 
 * @param {Date} [date] Optional date object (defaults to current date)
 * @returns {string} e.g. "26-27"
 */
function getCurrentFinancialYear(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth() + 1; // 1 to 12
    const fullYear = d.getFullYear(); // e.g. 2026

    let startYear;
    let endYear;

    if (month >= 4) {
        startYear = fullYear;
        endYear = fullYear + 1;
    } else {
        startYear = fullYear - 1;
        endYear = fullYear;
    }

    const startShort = String(startYear).slice(-2);
    const endShort = String(endYear).slice(-2);
    return `${startShort}-${endShort}`;
}

/**
 * Concurrency-safe atomic generation of the next consecutive tax invoice number.
 * Uses Firestore transaction on `invoice_counters/{financialYear}`.
 * 
 * @param {string} [financialYear] Optional FY string (e.g. "26-27"). Defaults to current FY.
 * @param {string} [prefix] Optional prefix (defaults to "KV").
 * @returns {Promise<{ invoiceNumber: string, sequence: number, financialYear: string }>}
 */
async function getNextInvoiceNumber(financialYear = null, prefix = "KV") {
    const fy = financialYear || getCurrentFinancialYear();
    const counterDocId = fy;
    const counterRef = db.collection("invoice_counters").doc(counterDocId);

    const result = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const paddedSequence = String(nextSequence).padStart(5, '0');
        const invoiceNumber = `${prefix}/${fy}/${paddedSequence}`;

        // Ensure total length complies with GST Rule 46 (<= 16 characters)
        if (invoiceNumber.length > 16) {
            throw new Error(`GST_RULE_46_VIOLATION: Generated invoice number '${invoiceNumber}' exceeds maximum statutory limit of 16 characters.`);
        }

        transaction.set(counterRef, {
            financialYear: fy,
            prefix: prefix,
            currentSequence: nextSequence,
            lastGeneratedInvoiceNumber: invoiceNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            invoiceNumber,
            sequence: nextSequence,
            financialYear: fy
        };
    });

    return result;
}

/**
 * Concurrency-safe atomic invoice number retrieval or generation for an order.
 * Ensures strict Rule 46 compliance and 1-to-1 bijection: exactly ONE official invoice number per order.
 *
 * If order already has an official invoiceNumber (or nested invoice.invoiceNumber),
 * returns it immediately without incrementing the sequence counter.
 * Otherwise, increments the sequence counter atomically in a Firestore transaction,
 * attaches invoiceNumber to the order doc, and returns the newly generated number.
 *
 * @param {string} orderId
 * @param {string} [financialYear]
 * @param {string} [prefix]
 * @returns {Promise<{ invoiceNumber: string, sequence: number|null, financialYear: string, isExisting: boolean }>}
 */
async function getOrCreateInvoiceNumberForOrder(orderId, financialYear = null, prefix = "KV") {
    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");

    const fy = financialYear || getCurrentFinancialYear();
    const counterRef = db.collection("invoice_counters").doc(fy);
    const orderRef = db.collection("orders").doc(orderId);

    const result = await db.runTransaction(async (transaction) => {
        // Read order first
        const orderDoc = await transaction.get(orderRef);
        const orderData = orderDoc.exists ? (orderDoc.data() || {}) : {};

        // Check if an official sequential invoiceNumber already exists on order or nested invoice
        const existingInvoiceNumber = orderData.invoiceNumber || (orderData.invoice && orderData.invoice.invoiceNumber);

        // If an official invoice number already exists (not fallback KV/SAM/), return it immediately!
        if (existingInvoiceNumber && !String(existingInvoiceNumber).startsWith("KV/SAM/")) {
            return {
                invoiceNumber: existingInvoiceNumber,
                sequence: null,
                financialYear: fy,
                isExisting: true
            };
        }

        // Read and increment counter
        const counterDoc = await transaction.get(counterRef);
        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const paddedSequence = String(nextSequence).padStart(5, '0');
        const invoiceNumber = `${prefix}/${fy}/${paddedSequence}`;

        if (invoiceNumber.length > 16) {
            throw new Error(`GST_RULE_46_VIOLATION: Generated invoice number '${invoiceNumber}' exceeds maximum statutory limit of 16 characters.`);
        }

        // Update counter atomically
        transaction.set(counterRef, {
            financialYear: fy,
            prefix: prefix,
            currentSequence: nextSequence,
            lastGeneratedInvoiceNumber: invoiceNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Update order doc with official invoiceNumber atomically
        transaction.set(orderRef, {
            invoiceNumber: invoiceNumber,
            invoiceAllocatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            invoiceNumber,
            sequence: nextSequence,
            financialYear: fy,
            isExisting: false
        };
    });

    return result;
}

module.exports = {
    getCurrentFinancialYear,
    getNextInvoiceNumber,
    getOrCreateInvoiceNumberForOrder
};

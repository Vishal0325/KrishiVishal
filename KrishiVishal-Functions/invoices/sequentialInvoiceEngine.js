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
/**
 * Derives current Indian Financial Year 2-digit starting year string (e.g. "26" for FY 2026-2027).
 * Indian FY starts 1st April and ends 31st March.
 *
 * @param {Date} [date] Optional date object (defaults to current date)
 * @returns {string} e.g. "26"
 */
function getShortFinancialYear(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth() + 1; // 1 to 12
    const fullYear = d.getFullYear(); // e.g. 2026
    const startYear = month >= 4 ? fullYear : fullYear - 1;
    return String(startYear).slice(-2);
}

/**
 * Normalizes hub identifier to clean 3-character uppercase Hub prefix.
 * e.g. "HUB-SAM-001" -> "SAM", "REG-TAJ-004" -> "TAJ", "KHA" -> "KHA", fallback "SAM".
 */
function extractHubCode(hubIdOrCode = "SAM") {
    if (!hubIdOrCode) return "SAM";
    const str = String(hubIdOrCode).trim().toUpperCase();
    if (str.includes("-")) {
        const parts = str.split("-");
        // Look for 3-character code that is not a generic prefix ('HUB', 'REG', 'WHS', 'LOC')
        const specificCode = parts.find(p => p.length === 3 && isNaN(Number(p)) && !['HUB', 'REG', 'WHS', 'LOC'].includes(p));
        if (specificCode) return specificCode.slice(0, 3);
        const code = parts.find(p => p.length === 3 && isNaN(Number(p)));
        if (code) return code.slice(0, 3);
    }
    const alphanumeric = str.replace(/[^A-Z]/g, '');
    return (alphanumeric.slice(0, 3) || "SAM").padEnd(3, 'X');
}

/**
 * Backwards compatible full Financial Year string (e.g. "2026-2027" or "26-27").
 */
function getCurrentFinancialYear(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth() + 1;
    const fullYear = d.getFullYear();
    const startYear = month >= 4 ? fullYear : fullYear - 1;
    return `${startYear}-${startYear + 1}`;
}

/**
 * Formats and validates GST Rule 46 compliant 16-character invoice number.
 * Format: [HUB_CODE_3]-[SHORT_FY_2]-[9_DIGIT_SEQUENCE] (e.g. SAM-26-000000001)
 */
function formatInvoiceNumber(hubCode, shortFy, sequence) {
    const hub = extractHubCode(hubCode);
    const fy = String(shortFy).slice(-2);
    const paddedSequence = String(sequence).padStart(9, '0');
    const invoiceNumber = `${hub}-${fy}-${paddedSequence}`;

    if (invoiceNumber.length > 16) {
        throw new Error(`GST_RULE_46_VIOLATION: Generated invoice number '${invoiceNumber}' exceeds maximum allowed length of 16 characters.`);
    }
    return invoiceNumber;
}

/**
 * Concurrency-safe atomic generation of the next consecutive tax invoice number for a specific hub.
 * Format: [HUB]-[FY]-[9_DIGITS] (e.g. SAM-26-000000001) -> Exactly 16 characters!
 *
 * @param {string} [hubCode] Hub prefix (e.g. "SAM")
 * @param {string} [financialYear] Optional 2-digit FY string (e.g. "26")
 * @param {object} [customDb] Optional custom Firestore instance for testing
 * @returns {Promise<{ invoiceNumber: string, sequence: number, financialYear: string, hubCode: string }>}
 */
async function getNextInvoiceNumber(hubCode = "SAM", financialYear = null, customDb = null) {
    const firestore = customDb || db;
    const hub = extractHubCode(hubCode);
    const fy = financialYear || getShortFinancialYear();
    const counterDocId = `${hub}_${fy}`;
    const counterRef = firestore.collection("invoice_counters").doc(counterDocId);

    const result = await firestore.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const invoiceNumber = formatInvoiceNumber(hub, fy, nextSequence);

        transaction.set(counterRef, {
            hubCode: hub,
            financialYear: fy,
            currentSequence: nextSequence,
            lastGeneratedInvoiceNumber: invoiceNumber,
            updatedAt: admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        }, { merge: true });

        return {
            invoiceNumber,
            sequence: nextSequence,
            financialYear: fy,
            hubCode: hub
        };
    });

    return result;
}

/**
 * Concurrency-safe atomic invoice number retrieval or generation for an order.
 * Ensures strict Rule 46 compliance and 1-to-1 bijection: exactly ONE official invoice number per order.
 * Format: SAM-26-000000001 (16 chars max, 100 crore capacity per hub per year).
 *
 * @param {string} orderId
 * @param {string} [hubCode]
 * @param {string} [financialYear]
 * @param {object} [customDb] Optional custom Firestore instance for testing
 * @returns {Promise<{ invoiceNumber: string, sequence: number|null, financialYear: string, hubCode: string, isExisting: boolean }>}
 */
async function getOrCreateInvoiceNumberForOrder(orderId, hubCode = null, financialYear = null, customDb = null) {
    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");

    const firestore = customDb || db;
    const orderRef = firestore.collection("orders").doc(orderId);

    const result = await firestore.runTransaction(async (transaction) => {
        // Read order first
        const orderDoc = await transaction.get(orderRef);
        const orderData = orderDoc.exists ? (orderDoc.data() || {}) : {};

        // Check if an official sequential invoiceNumber already exists on order or nested invoice
        const existingInvoiceNumber = orderData.invoiceNumber || (orderData.invoice && orderData.invoice.invoiceNumber);

        // If an official invoice number already exists (not fallback KV/SAM/), return it immediately!
        if (existingInvoiceNumber && !String(existingInvoiceNumber).startsWith("KV/SAM/") && !String(existingInvoiceNumber).startsWith("CHALLAN/")) {
            return {
                invoiceNumber: existingInvoiceNumber,
                sequence: null,
                financialYear: financialYear || getShortFinancialYear(),
                hubCode: hubCode || "SAM",
                isExisting: true
            };
        }

        const resolvedHubRaw = hubCode || orderData.hubCode || orderData.fulfillmentWarehouseId || orderData.warehouseId || "SAM";
        const hub = extractHubCode(resolvedHubRaw);
        const fy = financialYear || getShortFinancialYear();
        const counterDocId = `${hub}_${fy}`;
        const counterRef = firestore.collection("invoice_counters").doc(counterDocId);

        // Read and increment counter
        const counterDoc = await transaction.get(counterRef);
        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const invoiceNumber = formatInvoiceNumber(hub, fy, nextSequence);

        // Update counter atomically
        transaction.set(counterRef, {
            hubCode: hub,
            financialYear: fy,
            currentSequence: nextSequence,
            lastGeneratedInvoiceNumber: invoiceNumber,
            updatedAt: admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        }, { merge: true });

        // Update order doc with official invoiceNumber atomically
        transaction.set(orderRef, {
            invoiceNumber: invoiceNumber,
            invoiceAllocatedAt: admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        }, { merge: true });

        return {
            invoiceNumber,
            sequence: nextSequence,
            financialYear: fy,
            hubCode: hub,
            isExisting: false
        };
    });

    return result;
}

module.exports = {
    getShortFinancialYear,
    getCurrentFinancialYear,
    extractHubCode,
    formatInvoiceNumber,
    getNextInvoiceNumber,
    getOrCreateInvoiceNumberForOrder
};

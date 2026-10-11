/**
 * Shared Simulation & Mock Audit Classifier
 * KrishiVishal Platform
 * 
 * Provides centralized, deterministic classification of test fixtures and simulation records
 * to isolate them from statutory P&L, Trial Balance, General Ledger, and GST filings.
 */

// Explicit canonical registry of known CA Mock Audit Fixtures (April 2026 Simulation Pack)
const KNOWN_CA_AUDIT_ORDER_IDS = new Set([
    "ORD-TEST-001",
    "ORD-TEST-002",
    "ORD-TEST-003"
]);

const KNOWN_CA_AUDIT_INVOICE_NUMBERS = new Set([
    "KV/26-27/00001",
    "KV/26-27/00002",
    "KV/26-27/00003"
]);

const KNOWN_CA_AUDIT_CREDIT_NOTE_IDS = new Set([
    "KV_CN_26-27_00001",
    "KV/CN/26-27/00001"
]);

const KNOWN_CA_AUDIT_GRN_IDS = new Set([
    "GRN-TEST-001"
]);

const KNOWN_CA_AUDIT_JOURNAL_IDS = new Set([
    "JE-2026-04-ORD-001",
    "JE-2026-04-ORD-002",
    "JE-2026-04-ORD-003",
    "JE-2026-04-CN-001",
    "JE-2026-04-GRN-001"
]);

/**
 * Determines whether a journal entry belongs to a simulation/test fixture.
 * 
 * @param {object} entryData - Header data of the journal entry
 * @param {string} [docId] - Firestore document ID
 * @returns {boolean}
 */
function isSimulationJournalEntry(entryData = {}, docId = null) {
    if (!entryData && !docId) return false;

    // 1. Explicit metadata flags
    if (entryData.isSimulation === true || entryData.isTest === true || entryData.isMock === true) {
        return true;
    }
    if (entryData.environment === "MOCK_AUDIT" || entryData.environment === "SIMULATION") {
        return true;
    }

    // 2. Direct document ID match against known fixtures
    const entryId = docId || entryData.id || entryData.entryId;
    if (entryId && KNOWN_CA_AUDIT_JOURNAL_IDS.has(String(entryId))) {
        return true;
    }

    // 3. Document reference ID matches (orderId, refId, refNumber)
    const orderId = entryData.orderId || entryData.refId;
    if (orderId && KNOWN_CA_AUDIT_ORDER_IDS.has(String(orderId))) {
        return true;
    }

    const refNumber = entryData.refNumber;
    if (refNumber) {
        if (KNOWN_CA_AUDIT_INVOICE_NUMBERS.has(String(refNumber)) ||
            KNOWN_CA_AUDIT_CREDIT_NOTE_IDS.has(String(refNumber)) ||
            KNOWN_CA_AUDIT_GRN_IDS.has(String(refNumber))) {
            return true;
        }
    }

    // 4. Safe prefix checks for structured mock fixtures (ORD-TEST-*, GRN-TEST-*)
    if (orderId && String(orderId).startsWith("ORD-TEST-")) {
        return true;
    }
    if (refNumber && String(refNumber).startsWith("GRN-TEST-")) {
        return true;
    }

    return false;
}

/**
 * Determines whether an order is a simulation/test order.
 * 
 * @param {object} orderData
 * @param {string} [docId]
 * @returns {boolean}
 */
function isSimulationOrder(orderData = {}, docId = null) {
    if (!orderData && !docId) return false;

    // 1. Explicit metadata flags
    if (orderData.isSimulation === true || orderData.isTest === true || orderData.isMock === true) {
        return true;
    }
    if (orderData.environment === "MOCK_AUDIT" || orderData.environment === "SIMULATION") {
        return true;
    }

    // 2. Direct ID or orderNumber match against known CA audit simulation fixtures
    const id = docId || orderData.orderId || orderData.id;
    if (id && KNOWN_CA_AUDIT_ORDER_IDS.has(String(id))) {
        return true;
    }

    const orderNumber = orderData.orderNumber;
    if (orderNumber && KNOWN_CA_AUDIT_ORDER_IDS.has(String(orderNumber))) {
        return true;
    }

    // 3. Structured test prefix
    if (id && String(id).startsWith("ORD-TEST-")) {
        return true;
    }
    if (orderNumber && String(orderNumber).startsWith("ORD-TEST-")) {
        return true;
    }

    return false;
}

/**
 * Determines whether a credit note is a simulation/test document.
 * 
 * @param {object} creditNoteData
 * @param {string} [docId]
 * @returns {boolean}
 */
function isSimulationCreditNote(creditNoteData = {}, docId = null) {
    if (!creditNoteData && !docId) return false;

    // 1. Explicit metadata flags
    if (creditNoteData.isSimulation === true || creditNoteData.isTest === true || creditNoteData.isMock === true) {
        return true;
    }

    // 2. Direct ID or creditNoteNumber match
    const id = docId || creditNoteData.id || creditNoteData.creditNoteId;
    if (id && KNOWN_CA_AUDIT_CREDIT_NOTE_IDS.has(String(id))) {
        return true;
    }

    const cnNumber = creditNoteData.creditNoteNumber || creditNoteData.creditNoteNo;
    if (cnNumber && KNOWN_CA_AUDIT_CREDIT_NOTE_IDS.has(String(cnNumber))) {
        return true;
    }

    // 3. Linked orderId or invoiceNumber match
    const orderId = creditNoteData.orderId;
    if (orderId && (KNOWN_CA_AUDIT_ORDER_IDS.has(String(orderId)) || String(orderId).startsWith("ORD-TEST-"))) {
        return true;
    }

    const inv = creditNoteData.originalInvoiceNumber || creditNoteData.invoiceNumber;
    if (inv && KNOWN_CA_AUDIT_INVOICE_NUMBERS.has(String(inv))) {
        return true;
    }

    return false;
}

module.exports = {
    KNOWN_CA_AUDIT_ORDER_IDS,
    KNOWN_CA_AUDIT_INVOICE_NUMBERS,
    KNOWN_CA_AUDIT_CREDIT_NOTE_IDS,
    KNOWN_CA_AUDIT_GRN_IDS,
    KNOWN_CA_AUDIT_JOURNAL_IDS,
    isSimulationJournalEntry,
    isSimulationOrder,
    isSimulationCreditNote
};

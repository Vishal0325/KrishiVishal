/**
 * KrishiVishal TallyPrime / ERP XML Export Engine
 * 
 * Generates official TallyPrime-compliant XML for:
 * 1. Part A: Ledger Masters Auto-Creation (<LEDGER>) mapped to canonical Chart of Accounts
 * 2. Part B: Accounting Vouchers (<VOUCHER>) covering Sales, Purchase, Receipt, Payment, Journal
 * 
 * Strict Statutory Compliance:
 * - Envelope Structure: <ENVELOPE> -> <HEADER> -> <TALLYREQUEST>Import Data</TALLYREQUEST>
 * - Company Header: <SVCURRENTCOMPANY>KrishiVishal Private Limited</SVCURRENTCOMPANY>
 * - Date Format: YYYYMMDD (e.g. 20261009)
 * - Sign Conventions: Debits = <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE> and amount < 0 (-Amount)
 *                     Credits = <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE> and amount > 0 (+Amount)
 * - XML Character Sanitization: Escapes &, <, >, ", '
 * - Mathematical Balance Guarantee: Total Debits == Total Credits per voucher
 */

const { db, admin } = require("../core/admin");
const { CHART_OF_ACCOUNTS } = require("./generalLedger");

const COMPANY_NAME = "KrishiVishal Private Limited";

// Standard Tally Group Parent Mappings for KrishiVishal Chart of Accounts
const TALLY_PARENT_GROUP_MAPPING = {
    // Current Assets & Cash / Bank
    "1010_CASH_IN_HAND_RIDERS": "Cash-in-Hand",
    "1020_HUB_CASH_VAULT": "Cash-in-Hand",
    "1030_BANK_CURRENT_HDFC": "Bank Accounts",
    "1040_INVENTORY_MAIN_HUB": "Stock-in-Hand",
    "1050_GATEWAY_RECEIVABLE": "Sundry Debtors",
    "1060_INPUT_CGST": "Duties & Taxes",
    "1070_INPUT_SGST": "Duties & Taxes",
    "1080_INPUT_IGST": "Duties & Taxes",

    // Liabilities
    "2010_ACCOUNTS_PAYABLE_SUPPLIERS": "Sundry Creditors",
    "2020_OUTPUT_CGST_PAYABLE": "Duties & Taxes",
    "2030_OUTPUT_SGST_PAYABLE": "Duties & Taxes",
    "2040_OUTPUT_IGST_PAYABLE": "Duties & Taxes",
    "2050_TDS_PAYABLE_194C": "Duties & Taxes",
    "2050_TDS_PAYABLE_194Q": "Duties & Taxes",
    "2050_TDS_PAYABLE_194H": "Duties & Taxes",
    "2060_CUSTOMER_REFUNDS_PAYABLE": "Current Liabilities",

    // Equity
    "3010_SHARE_CAPITAL": "Capital Account",
    "3020_RETAINED_EARNINGS": "Reserves & Surplus",

    // Revenue
    "4010_SALES_AGRI_INPUTS": "Sales Accounts",
    "4020_DELIVERY_INCOME": "Direct Incomes",

    // COGS & Direct Expense
    "5010_COGS_AGRI_INPUTS": "Direct Expenses",
    "5020_INVENTORY_SHRINKAGE_LOSS": "Direct Expenses",

    // Operating & Financial Expenses
    "6010_RIDER_DELIVERY_PAYOUTS": "Direct Expenses",
    "6020_PAYMENT_GATEWAY_FEES": "Indirect Expenses"
};

/**
 * Escapes reserved XML characters (&, <, >, ", ') to avoid parse failures in TallyPrime.
 * @param {string|any} str 
 * @returns {string}
 */
function escapeXml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Converts Firestore Timestamp, Date, or Date string to Tally YYYYMMDD format.
 * @param {any} dateVal 
 * @returns {string} e.g. "20261009"
 */
function formatTallyDate(dateVal) {
    let d = new Date();
    if (dateVal) {
        if (typeof dateVal.toDate === "function") {
            d = dateVal.toDate();
        } else if (dateVal._seconds) {
            d = new Date(dateVal._seconds * 1000);
        } else if (dateVal instanceof Date) {
            d = dateVal;
        } else {
            d = new Date(dateVal);
        }
    }
    if (isNaN(d.getTime())) d = new Date();

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

/**
 * Maps KrishiVishal journal entry refType to official Tally Voucher Type.
 * @param {string} refType 
 * @returns {"Sales" | "Purchase" | "Receipt" | "Payment" | "Journal"}
 */
function mapToTallyVoucherType(refType) {
    const type = String(refType || "").toUpperCase();
    if (type === "ORDER_DELIVERY" || type === "CUSTOMER_ORDER" || type === "SALES") {
        return "Sales";
    }
    if (type === "PURCHASE_GRN" || type === "PURCHASE" || type === "GRN") {
        return "Purchase";
    }
    if (type === "RIDER_SETTLEMENT" || type === "GATEWAY_SETTLEMENT" || type === "RECEIPT" || type === "CASH_DEPOSIT") {
        return "Receipt";
    }
    if (type === "SUPPLIER_PAYMENT" || type === "VENDOR_PAYMENT" || type === "PAYMENT" || type === "EXPENSE") {
        return "Payment";
    }
    // COGS matching, depreciation, provisions, adjustments
    return "Journal";
}

/**
 * Renders Part A: Ledger Masters XML
 * @returns {string} XML string containing all Master Ledgers
 */
function renderLedgerMastersXml() {
    let xml = "";
    for (const groupKey of Object.keys(CHART_OF_ACCOUNTS)) {
        const group = CHART_OF_ACCOUNTS[groupKey];
        for (const [code, info] of Object.entries(group)) {
            const ledgerName = escapeXml(info.name || code);
            const parentGroup = escapeXml(TALLY_PARENT_GROUP_MAPPING[code] || "Current Assets");
            const isDeemedPositive = info.normalBalance === "DEBIT" ? "Yes" : "No";

            xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
            xml += `          <LEDGER NAME="${ledgerName}" ACTION="Create">\n`;
            xml += `            <NAME.LIST>\n`;
            xml += `              <NAME>${ledgerName}</NAME>\n`;
            xml += `            </NAME.LIST>\n`;
            xml += `            <PARENT>${parentGroup}</PARENT>\n`;
            xml += `            <ISDEEMEDPOSITIVE>${isDeemedPositive}</ISDEEMEDPOSITIVE>\n`;
            xml += `            <ISBILLWISEON>No</ISBILLWISEON>\n`;
            xml += `            <ISCOSTCENTRESON>No</ISCOSTCENTRESON>\n`;
            xml += `          </LEDGER>\n`;
            xml += `        </TALLYMESSAGE>\n`;
        }
    }
    return xml;
}

/**
 * Formats monetary amounts rounded to 2 decimals.
 * @param {number} num 
 * @returns {number}
 */
function roundCurrency(num) {
    return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Builds a single <VOUCHER> XML node for a journal entry with all its lines.
 * Strictly verifies mathematical debit == credit balance (net == 0).
 * 
 * @param {object} entry 
 * @param {Array<object>} lines 
 * @returns {{ xml: string, isBalanced: boolean, totalDebit: number, totalCredit: number }}
 */
function renderVoucherXml(entry, lines) {
    if (!lines || lines.length === 0) {
        return { xml: "", isBalanced: false, totalDebit: 0, totalCredit: 0 };
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
        totalDebit += roundCurrency(line.debit || 0);
        totalCredit += roundCurrency(line.credit || 0);
    }

    totalDebit = roundCurrency(totalDebit);
    totalCredit = roundCurrency(totalCredit);

    // Verify mathematical balance (tolerance: 0.01)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { xml: "", isBalanced: false, totalDebit, totalCredit };
    }

    const tallyDate = formatTallyDate(entry.date || entry.createdAt);
    const voucherType = mapToTallyVoucherType(entry.refType);
    const voucherNumber = escapeXml(entry.invoiceNumber || entry.referenceId || entry.entryId || entry.id);
    const narration = escapeXml(entry.description || `Journal Entry ${voucherNumber} ref ${entry.refType || 'GENERAL'}`);

    let vXml = `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    vXml += `          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">\n`;
    vXml += `            <DATE>${tallyDate}</DATE>\n`;
    vXml += `            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>\n`;
    vXml += `            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>\n`;
    vXml += `            <NARRATION>${narration}</NARRATION>\n`;

    for (const line of lines) {
        const dAmt = roundCurrency(line.debit || 0);
        const cAmt = roundCurrency(line.credit || 0);
        const code = line.accountCode;
        const ledgerName = escapeXml(line.accountName || (CHART_OF_ACCOUNTS.ASSETS[code]?.name || CHART_OF_ACCOUNTS.LIABILITIES[code]?.name || CHART_OF_ACCOUNTS.REVENUE[code]?.name || CHART_OF_ACCOUNTS.COGS[code]?.name || CHART_OF_ACCOUNTS.EXPENSES[code]?.name || CHART_OF_ACCOUNTS.EQUITY[code]?.name || code));

        if (dAmt > 0) {
            // DEBIT RULE: ISDEEMEDPOSITIVE = Yes, Amount = -dAmt
            vXml += `            <ALLLEDGERENTRIES.LIST>\n`;
            vXml += `              <LEDGERNAME>${ledgerName}</LEDGERNAME>\n`;
            vXml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
            vXml += `              <AMOUNT>-${dAmt.toFixed(2)}</AMOUNT>\n`;
            vXml += `            </ALLLEDGERENTRIES.LIST>\n`;
        } else if (cAmt > 0) {
            // CREDIT RULE: ISDEEMEDPOSITIVE = No, Amount = +cAmt
            vXml += `            <ALLLEDGERENTRIES.LIST>\n`;
            vXml += `              <LEDGERNAME>${ledgerName}</LEDGERNAME>\n`;
            vXml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
            vXml += `              <AMOUNT>${cAmt.toFixed(2)}</AMOUNT>\n`;
            vXml += `            </ALLLEDGERENTRIES.LIST>\n`;
        }
    }

    vXml += `          </VOUCHER>\n`;
    vXml += `        </TALLYMESSAGE>\n`;

    return { xml: vXml, isBalanced: true, totalDebit, totalCredit };
}

/**
 * Generates the full TallyPrime XML Envelope from journal entries and their lines.
 * 
 * @param {object} param0
 * @param {Array<{ entry: object, lines: Array<object> }>} param0.records
 * @param {string} [param0.voucherTypeFilter="ALL"]
 * @returns {{ xml: string, exportedVouchersCount: number, skippedVouchersCount: number, totalDebit: number, totalCredit: number }}
 */
function generateTallyPrimeEnvelope({ records = [], voucherTypeFilter = "ALL" }) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<ENVELOPE>\n`;
    xml += `  <HEADER>\n`;
    xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
    xml += `  </HEADER>\n`;
    xml += `  <BODY>\n`;
    xml += `    <IMPORTDATA>\n`;
    xml += `      <REQUESTDESC>\n`;
    xml += `        <REPORTNAME>All Masters and Vouchers</REPORTNAME>\n`;
    xml += `        <STATICVARIABLES>\n`;
    xml += `          <SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>\n`;
    xml += `        </STATICVARIABLES>\n`;
    xml += `      </REQUESTDESC>\n`;
    xml += `      <REQUESTDATA>\n`;

    // PART A: LEDGER MASTERS
    xml += renderLedgerMastersXml();

    // PART B: ACCOUNTING VOUCHERS
    let exportedCount = 0;
    let skippedCount = 0;
    let totalDebitSum = 0;
    let totalCreditSum = 0;

    for (const rec of records) {
        const entry = rec.entry;
        const lines = rec.lines || [];
        const vchType = mapToTallyVoucherType(entry.refType);

        if (voucherTypeFilter && voucherTypeFilter !== "ALL" && vchType.toUpperCase() !== voucherTypeFilter.toUpperCase()) {
            continue;
        }

        const renderRes = renderVoucherXml(entry, lines);
        if (renderRes.isBalanced && renderRes.xml) {
            xml += renderRes.xml;
            exportedCount++;
            totalDebitSum = roundCurrency(totalDebitSum + renderRes.totalDebit);
            totalCreditSum = roundCurrency(totalCreditSum + renderRes.totalCredit);
        } else {
            skippedCount++;
        }
    }

    xml += `      </REQUESTDATA>\n`;
    xml += `    </IMPORTDATA>\n`;
    xml += `  </BODY>\n`;
    xml += `</ENVELOPE>\n`;

    return {
        xml,
        exportedVouchersCount: exportedCount,
        skippedVouchersCount: skippedCount,
        totalDebit: totalDebitSum,
        totalCredit: totalCreditSum
    };
}

/**
 * Fetches journal entries from Firestore and generates Tally XML export payload.
 * 
 * @param {object} param0
 * @param {string} [param0.periodId] e.g. "2026-10"
 * @param {string|Date} [param0.startDate]
 * @param {string|Date} [param0.endDate]
 * @param {string} [param0.voucherTypeFilter="ALL"]
 * @returns {Promise<object>}
 */
async function exportTallyXml({ periodId = null, startDate = null, endDate = null, voucherTypeFilter = "ALL" } = {}) {
    let q = db.collection("journal_entries");

    if (periodId) {
        q = q.where("periodId", "==", periodId);
    }

    const snap = await q.get();
    const records = [];

    const sDate = startDate ? new Date(startDate) : null;
    const eDate = endDate ? new Date(endDate) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);

    for (const doc of snap.docs) {
        const entry = { id: doc.id, ...doc.data() };

        // Date range filtering
        let entryDate = entry.date?.toDate ? entry.date.toDate() : (entry.date ? new Date(entry.date) : (entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date()));
        if (sDate && entryDate < sDate) continue;
        if (eDate && entryDate > eDate) continue;

        // Fetch lines subcollection
        const linesSnap = await doc.ref.collection("lines").get();
        const lines = linesSnap.docs.map(ld => ld.data());

        records.push({ entry, lines });
    }

    // Sort ascending by date
    records.sort((a, b) => {
        const dA = a.entry.date?.toMillis ? a.entry.date.toMillis() : new Date(a.entry.date || a.entry.createdAt || 0).getTime();
        const dB = b.entry.date?.toMillis ? b.entry.date.toMillis() : new Date(b.entry.date || b.entry.createdAt || 0).getTime();
        return dA - dB;
    });

    const result = generateTallyPrimeEnvelope({ records, voucherTypeFilter });

    return {
        success: true,
        companyName: COMPANY_NAME,
        periodId: periodId || "CUSTOM_RANGE",
        exportedVouchersCount: result.exportedVouchersCount,
        skippedVouchersCount: result.skippedVouchersCount,
        totalDebit: result.totalDebit,
        totalCredit: result.totalCredit,
        xmlContent: result.xml,
        byteLength: Buffer.byteLength(result.xml, "utf8")
    };
}

module.exports = {
    COMPANY_NAME,
    TALLY_PARENT_GROUP_MAPPING,
    escapeXml,
    formatTallyDate,
    mapToTallyVoucherType,
    renderLedgerMastersXml,
    renderVoucherXml,
    generateTallyPrimeEnvelope,
    exportTallyXml
};

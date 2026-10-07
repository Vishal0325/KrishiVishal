/**
 * KrishiVishal General Ledger & Chart of Accounts Engine
 * Statutory Double-Entry Accounting System conforming to Indian Accounting Standards (Ind AS / AS).
 * 
 * Part 1 of CA-Ready Financial Architecture.
 */

const { db, admin } = require("../core/admin");

// 1. STANDARD CHART OF ACCOUNTS (CoA) MASTER SEED DEFINITION
const CHART_OF_ACCOUNTS = {
    // ASSETS (1000 - 1999)
    ASSETS: {
        "1010_CASH_IN_HAND_RIDERS": { name: "Cash in Hand - Riders", category: "CURRENT_ASSET", normalBalance: "DEBIT" },
        "1020_HUB_CASH_VAULT": { name: "Hub Cash Vault / Safe", category: "CURRENT_ASSET", normalBalance: "DEBIT" },
        "1030_BANK_CURRENT_HDFC": { name: "HDFC Current Account (Main Op)", category: "BANK_ACCOUNT", normalBalance: "DEBIT" },
        "1040_INVENTORY_MAIN_HUB": { name: "Inventory Stock - Main Hub", category: "INVENTORY", normalBalance: "DEBIT" },
        "1050_GATEWAY_RECEIVABLE": { name: "Payment Gateway Receivable (Razorpay)", category: "CURRENT_ASSET", normalBalance: "DEBIT" },
        "1060_INPUT_CGST": { name: "Input Tax Credit - CGST", category: "TAX_ASSET", normalBalance: "DEBIT" },
        "1070_INPUT_SGST": { name: "Input Tax Credit - SGST", category: "TAX_ASSET", normalBalance: "DEBIT" },
        "1080_INPUT_IGST": { name: "Input Tax Credit - IGST", category: "TAX_ASSET", normalBalance: "DEBIT" }
    },
    // LIABILITIES (2000 - 2999)
    LIABILITIES: {
        "2010_ACCOUNTS_PAYABLE_SUPPLIERS": { name: "Accounts Payable - Suppliers & Vendors", category: "CURRENT_LIABILITY", normalBalance: "CREDIT" },
        "2020_OUTPUT_CGST_PAYABLE": { name: "Output CGST Payable", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2030_OUTPUT_SGST_PAYABLE": { name: "Output SGST Payable", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2040_OUTPUT_IGST_PAYABLE": { name: "Output IGST Payable", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2050_TDS_PAYABLE_194C": { name: "TDS Payable (Sec 194C / Contractor)", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2050_TDS_PAYABLE_194Q": { name: "TDS Payable (Sec 194Q / Purchase of Goods)", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2050_TDS_PAYABLE_194H": { name: "TDS Payable (Sec 194H / Commission)", category: "DUTIES_AND_TAXES", normalBalance: "CREDIT" },
        "2060_CUSTOMER_REFUNDS_PAYABLE": { name: "Customer Refunds & Wallets Payable", category: "CURRENT_LIABILITY", normalBalance: "CREDIT" }
    },
    // EQUITY (3000 - 3999)
    EQUITY: {
        "3010_SHARE_CAPITAL": { name: "Paid-up Share Capital", category: "SHARE_CAPITAL", normalBalance: "CREDIT" },
        "3020_RETAINED_EARNINGS": { name: "Retained Earnings / Reserves", category: "RESERVES_AND_SURPLUS", normalBalance: "CREDIT" }
    },
    // REVENUE (4000 - 4999)
    REVENUE: {
        "4010_SALES_AGRI_INPUTS": { name: "Sales of Agri-Inputs (Seeds, Fertilizers, Chem)", category: "OPERATING_REVENUE", normalBalance: "CREDIT" },
        "4020_DELIVERY_INCOME": { name: "Delivery / Shipping Charges Income", category: "OPERATING_REVENUE", normalBalance: "CREDIT" }
    },
    // COGS (5000 - 5999)
    COGS: {
        "5010_COGS_AGRI_INPUTS": { name: "Cost of Goods Sold - Agri-Inputs", category: "DIRECT_EXPENSE", normalBalance: "DEBIT" },
        "5020_INVENTORY_SHRINKAGE_LOSS": { name: "Inventory Shrinkage & Damage Loss", category: "DIRECT_EXPENSE", normalBalance: "DEBIT" }
    },
    // EXPENSES (6000 - 6999)
    EXPENSES: {
        "6010_RIDER_DELIVERY_PAYOUTS": { name: "Rider Delivery Trip Payouts", category: "OPERATING_EXPENSE", normalBalance: "DEBIT" },
        "6020_PAYMENT_GATEWAY_FEES": { name: "Payment Gateway Merchant Fees", category: "FINANCIAL_EXPENSE", normalBalance: "DEBIT" }
    }
};

// Flattened list of canonical valid account codes
const VALID_ACCOUNT_CODES = Object.values(CHART_OF_ACCOUNTS)
    .flatMap(group => Object.keys(group));

/**
 * Validates if a period is unlocked.
 * @param {string} periodId Format "YYYY-MM"
 * @param {FirebaseFirestore.Transaction} [transaction] Optional Firestore transaction
 */
async function assertFiscalPeriodUnlocked(periodId, transaction = null) {
    if (!periodId || !/^\d{4}-\d{2}$/.test(periodId)) {
        throw new Error(`INVALID_PERIOD_ID: Fiscal periodId must be in 'YYYY-MM' format (received: ${periodId})`);
    }

    const periodRef = db.collection("fiscal_periods").doc(periodId);
    const periodDoc = transaction ? await transaction.get(periodRef) : await periodRef.get();

    if (periodDoc.exists) {
        const periodData = periodDoc.data() || {};
        if (periodData.status === "LOCKED") {
            const err = new Error(`FISCAL_PERIOD_LOCKED: Fiscal period ${periodId} is locked for CA statutory audit.`);
            err.code = "FISCAL_PERIOD_LOCKED";
            throw err;
        }
    }
    return true;
}

/**
 * Validates the arithmetic and semantic integrity of a proposed journal entry.
 * @param {object} entryData 
 */
function validateJournalEntry(entryData) {
    if (!entryData || typeof entryData !== "object") {
        throw new Error("INVALID_JOURNAL_ENTRY: Entry payload is missing or empty.");
    }

    const { refType, refId, periodId, lines } = entryData;

    const ALLOWED_REF_TYPES = [
        "ORDER_DELIVERY",
        "PURCHASE_GRN",
        "COD_SETTLEMENT",
        "EXPENSE",
        "SALES_RETURN",
        "INVENTORY_ADJUSTMENT",
        "GATEWAY_SETTLEMENT",
        "BANK_RECONCILIATION",
        "CAPITAL"
    ];

    if (!refType || !ALLOWED_REF_TYPES.includes(refType)) {
        throw new Error(`INVALID_REF_TYPE: Must be one of ${ALLOWED_REF_TYPES.join(", ")}`);
    }

    if (!refId || typeof refId !== "string") {
        throw new Error("INVALID_REF_ID: Missing reference ID.");
    }

    if (!periodId || !/^\d{4}-\d{2}$/.test(periodId)) {
        throw new Error("INVALID_PERIOD_ID: periodId must be formatted as 'YYYY-MM'");
    }

    if (!Array.isArray(lines) || lines.length < 2) {
        throw new Error("INVALID_JOURNAL_LINES: Entry must have at least 2 lines (Double-Entry requirement).");
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const [index, line] of lines.entries()) {
        if (!line.accountCode || !VALID_ACCOUNT_CODES.includes(line.accountCode)) {
            throw new Error(`INVALID_ACCOUNT_CODE: Line ${index} references invalid code '${line.accountCode}'`);
        }

        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);

        if (isNaN(debit) || isNaN(credit) || debit < 0 || credit < 0) {
            throw new Error(`INVALID_LINE_AMOUNT: Line ${index} contains negative or non-numeric amount.`);
        }

        if (debit === 0 && credit === 0) {
            throw new Error(`ZERO_AMOUNT_LINE: Line ${index} must have either debit > 0 or credit > 0.`);
        }

        if (debit > 0 && credit > 0) {
            throw new Error(`DUAL_AMOUNT_LINE: Line ${index} cannot have both debit and credit amounts.`);
        }

        totalDebit += debit;
        totalCredit += credit;
    }

    // CA Audit Guard: Total Debits must exactly equal Total Credits (Tolerance < 0.001 for precision rounding)
    const difference = Math.abs(totalDebit - totalCredit);
    if (difference > 0.001) {
        const err = new Error(`UNBALANCED_JOURNAL_ENTRY: Total Debits (₹${totalDebit.toFixed(2)}) must equal Total Credits (₹${totalCredit.toFixed(2)}). Diff: ₹${difference.toFixed(4)}`);
        err.code = "UNBALANCED_JOURNAL_ENTRY";
        err.totalDebit = totalDebit;
        err.totalCredit = totalCredit;
        throw err;
    }

    return {
        isValid: true,
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100
    };
}

/**
 * Posts an immutable double-entry journal entry to Firestore atomically.
 * 
 * @param {object} entryData
 * @returns {Promise<{ success: boolean, entryId: string, totalAmount: number }>}
 */
async function postJournalEntry(entryData) {
    // 1. Semantic and double-entry arithmetic validation
    const { totalDebit } = validateJournalEntry(entryData);

    const periodId = entryData.periodId;
    const entryId = entryData.entryId || `JE_${periodId.replace('-', '')}_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // 2. Atomic Firestore transaction execution
    const result = await db.runTransaction(async (transaction) => {
        // Guard 1: Assert Fiscal Period is open (unlocked)
        await assertFiscalPeriodUnlocked(periodId, transaction);

        const entryRef = db.collection("journal_entries").doc(entryId);
        const existingDoc = await transaction.get(entryRef);
        if (existingDoc.exists) {
            throw new Error(`DUPLICATE_JOURNAL_ENTRY: Journal entry ${entryId} already exists.`);
        }

        const timestamp = entryData.date instanceof Date ? entryData.date : (entryData.date ? new Date(entryData.date) : new Date());

        const journalDocPayload = {
            entryId,
            refType: entryData.refType,
            refId: entryData.refId,
            periodId,
            date: admin.firestore.Timestamp.fromDate(timestamp),
            memo: entryData.memo || "",
            totalAmount: totalDebit,
            lineCount: entryData.lines.length,
            createdBy: entryData.createdBy || "SYSTEM",
            status: "POSTED",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Write header
        transaction.set(entryRef, journalDocPayload);

        // Write atomic lines in journal_lines subcollection
        entryData.lines.forEach((line, idx) => {
            const lineRef = entryRef.collection("lines").doc(`L_${String(idx + 1).padStart(3, '0')}`);
            transaction.set(lineRef, {
                lineIndex: idx + 1,
                accountCode: line.accountCode,
                accountName: findAccountName(line.accountCode),
                debit: Number(line.debit || 0),
                credit: Number(line.credit || 0),
                description: line.description || entryData.memo || "",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return {
            success: true,
            entryId,
            totalAmount: totalDebit
        };
    });

    return result;
}

/**
 * Helper to fetch human-readable account name from CoA
 */
function findAccountName(accountCode) {
    for (const group of Object.values(CHART_OF_ACCOUNTS)) {
        if (group[accountCode]) {
            return group[accountCode].name;
        }
    }
    return accountCode;
}

module.exports = {
    CHART_OF_ACCOUNTS,
    VALID_ACCOUNT_CODES,
    assertFiscalPeriodUnlocked,
    validateJournalEntry,
    postJournalEntry,
    findAccountName
};

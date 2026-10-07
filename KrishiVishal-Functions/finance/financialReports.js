/**
 * KrishiVishal Financial Reporting Engine
 * Generates Statutory Trial Balance, Profit & Loss (P&L), and Balance Sheet
 * aggregated from immutable double-entry journal lines.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 5).
 */

const { db } = require("../core/admin");
const { CHART_OF_ACCOUNTS, findAccountName } = require("./generalLedger");

/**
 * Rounds monetary amounts cleanly to 2 decimal places with half-up rounding.
 * @param {number} num 
 * @returns {number}
 */
function roundCurrency(num) {
    return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Categorizes an account code into Asset, Liability, Equity, Revenue, COGS, Expense.
 * @param {string} accountCode 
 * @returns {string} ASSET | LIABILITY | EQUITY | REVENUE | COGS | EXPENSE
 */
function getAccountType(accountCode) {
    if (accountCode.startsWith("1")) return "ASSET";
    if (accountCode.startsWith("2")) return "LIABILITY";
    if (accountCode.startsWith("3")) return "EQUITY";
    if (accountCode.startsWith("4")) return "REVENUE";
    if (accountCode.startsWith("5")) return "COGS";
    if (accountCode.startsWith("6")) return "EXPENSE";
    return "UNKNOWN";
}

/**
 * Aggregates all journal entries for a given period or date range into a verified Trial Balance.
 * 
 * @param {object} param0
 * @param {string} [param0.periodId] e.g. "2026-10"
 * @param {Date} [param0.startDate]
 * @param {Date} [param0.endDate]
 * @returns {Promise<object>}
 */
async function generateTrialBalance({ periodId = null, startDate = null, endDate = null } = {}) {
    let query = db.collection("journal_entries");

    if (periodId) {
        query = query.where("periodId", "==", periodId);
    }

    const entriesSnapshot = await query.get();
    const accountMap = new Map();

    // Loop through journal entry docs and read their line items
    for (const entryDoc of entriesSnapshot.docs) {
        const entryData = entryDoc.data() || {};
        
        // Date range filtering if specified
        if (startDate && entryData.date && entryData.date.toDate() < startDate) continue;
        if (endDate && entryData.date && entryData.date.toDate() > endDate) continue;

        // Fetch subcollection lines
        const linesSnapshot = await entryDoc.ref.collection("lines").get();
        for (const lineDoc of linesSnapshot.docs) {
            const line = lineDoc.data() || {};
            const code = line.accountCode;
            if (!code) continue;

            if (!accountMap.has(code)) {
                accountMap.set(code, {
                    accountCode: code,
                    accountName: line.accountName || findAccountName(code),
                    totalDebit: 0,
                    totalCredit: 0,
                    type: getAccountType(code)
                });
            }

            const acc = accountMap.get(code);
            acc.totalDebit += Number(line.debit || 0);
            acc.totalCredit += Number(line.credit || 0);
        }
    }

    let grandTotalDebit = 0;
    let grandTotalCredit = 0;
    const accounts = [];

    for (const acc of accountMap.values()) {
        const roundedDebit = roundCurrency(acc.totalDebit);
        const roundedCredit = roundCurrency(acc.totalCredit);
        const netBalance = roundCurrency(roundedDebit - roundedCredit);

        grandTotalDebit += roundedDebit;
        grandTotalCredit += roundedCredit;

        accounts.push({
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            type: acc.type,
            totalDebit: roundedDebit,
            totalCredit: roundedCredit,
            netBalance
        });
    }

    grandTotalDebit = roundCurrency(grandTotalDebit);
    grandTotalCredit = roundCurrency(grandTotalCredit);
    const diff = Math.abs(grandTotalDebit - grandTotalCredit);
    const isBalanced = diff < 0.01;

    return {
        periodId: periodId || "ALL",
        accounts,
        totalDebits: grandTotalDebit,
        totalCredits: grandTotalCredit,
        difference: diff,
        isBalanced
    };
}

/**
 * Computes Profit & Loss (P&L) Statement for a given fiscal period.
 * 
 * @param {object} param0
 * @param {string} [param0.periodId]
 * @returns {Promise<object>}
 */
async function generateProfitAndLoss({ periodId = null, startDate = null, endDate = null } = {}) {
    const trialBalance = await generateTrialBalance({ periodId, startDate, endDate });

    let grossRevenue = 0;
    let cogs = 0;
    let operatingExpenses = 0;

    for (const acc of trialBalance.accounts) {
        if (acc.type === "REVENUE") {
            // Normal balance is Credit -> net balance is (Credit - Debit)
            grossRevenue += roundCurrency(acc.totalCredit - acc.totalDebit);
        } else if (acc.type === "COGS") {
            // Normal balance is Debit -> net balance is (Debit - Credit)
            cogs += roundCurrency(acc.totalDebit - acc.totalCredit);
        } else if (acc.type === "EXPENSE") {
            // Normal balance is Debit -> net balance is (Debit - Credit)
            operatingExpenses += roundCurrency(acc.totalDebit - acc.totalCredit);
        }
    }

    grossRevenue = roundCurrency(grossRevenue);
    cogs = roundCurrency(cogs);
    operatingExpenses = roundCurrency(operatingExpenses);

    const grossProfit = roundCurrency(grossRevenue - cogs);
    const grossMarginPercentage = grossRevenue > 0 ? roundCurrency((grossProfit / grossRevenue) * 100) : 0;
    const netProfit = roundCurrency(grossProfit - operatingExpenses);

    return {
        periodId: periodId || "ALL",
        grossRevenue,
        cogs,
        grossProfit,
        grossMarginPercentage,
        operatingExpenses,
        netProfit,
        isTrialBalanceBalanced: trialBalance.isBalanced
    };
}

/**
 * Generates Statutory Balance Sheet conforming to Indian Accounting Equation:
 * Total Assets === Total Liabilities + Equity + Current Period Net Profit.
 * 
 * @param {object} param0
 * @param {string} [param0.periodId]
 * @param {Date} [param0.asOfDate]
 * @returns {Promise<object>}
 */
async function generateBalanceSheet({ periodId = null, asOfDate = new Date() } = {}) {
    const trialBalance = await generateTrialBalance({ periodId });
    const pnl = await generateProfitAndLoss({ periodId });

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    const assets = [];
    const liabilities = [];
    const equity = [];

    for (const acc of trialBalance.accounts) {
        if (acc.type === "ASSET") {
            const net = roundCurrency(acc.totalDebit - acc.totalCredit);
            totalAssets += net;
            assets.push({ ...acc, netValue: net });
        } else if (acc.type === "LIABILITY") {
            const net = roundCurrency(acc.totalCredit - acc.totalDebit);
            totalLiabilities += net;
            liabilities.push({ ...acc, netValue: net });
        } else if (acc.type === "EQUITY") {
            const net = roundCurrency(acc.totalCredit - acc.totalDebit);
            totalEquity += net;
            equity.push({ ...acc, netValue: net });
        }
    }

    totalAssets = roundCurrency(totalAssets);
    totalLiabilities = roundCurrency(totalLiabilities);
    totalEquity = roundCurrency(totalEquity);

    const currentPeriodEarnings = roundCurrency(pnl.netProfit);
    const totalEquityAndLiabilities = roundCurrency(totalLiabilities + totalEquity + currentPeriodEarnings);

    const diff = Math.abs(totalAssets - totalEquityAndLiabilities);
    const isBalanced = diff < 0.01;

    return {
        asOfDate,
        periodId: periodId || "ALL",
        assets,
        liabilities,
        equity,
        currentPeriodEarnings,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalEquityAndLiabilities,
        difference: diff,
        isBalanced
    };
}

module.exports = {
    roundCurrency,
    getAccountType,
    generateTrialBalance,
    generateProfitAndLoss,
    generateBalanceSheet
};

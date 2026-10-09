/**
 * KrishiVishal Cloud Functions - Finance & Statutory Callable API Endpoints
 * Region: asia-south1 (Mumbai)
 * 
 * Exposes onCall handlers for:
 * 1. Financial Reports (generateTrialBalance, generateProfitAndLoss, generateBalanceSheet, generateGstr1Summary)
 * 2. Reconciliation (reconcileGatewaySettlement, reconcileRiderCashBankDeposit)
 * 3. Fiscal Period Lifecycle (runMonthEndChecklist, lockFiscalPeriod, unlockFiscalPeriod, getFiscalPeriodsList)
 * 4. Maker-Checker Workflows (submitApprovalRequest, reviewApprovalRequest, getApprovalRequests)
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { generateTrialBalance, generateProfitAndLoss, generateBalanceSheet } = require("./financialReports");
const { generateGstr1Summary } = require("../tax/gstrReportEngine");
const { reconcileGatewaySettlement, reconcileRiderCashBankDeposit } = require("./reconciliationEngine");
const { runMonthEndChecklist, lockFiscalPeriod, unlockFiscalPeriod, getFiscalPeriodsList } = require("./fiscalPeriodEngine");
const { submitApprovalRequest, reviewApprovalRequest, getApprovalRequests } = require("./makerCheckerEngine");

const REGION = "asia-south1";

function assertAuth(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required to access financial operations.");
    }
}

// 1. FINANCIAL REPORTING
exports.generateTrialBalance = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await generateTrialBalance({
            periodId: data.periodId || null,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null
        });
    } catch (err) {
        console.error("[generateTrialBalance] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

exports.generateProfitAndLoss = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await generateProfitAndLoss({
            periodId: data.periodId || null,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null
        });
    } catch (err) {
        console.error("[generateProfitAndLoss] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

exports.generateBalanceSheet = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await generateBalanceSheet({
            periodId: data.periodId || null,
            asOfDate: data.asOfDate ? new Date(data.asOfDate) : new Date()
        });
    } catch (err) {
        console.error("[generateBalanceSheet] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

exports.generateGstr1Summary = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await generateGstr1Summary({
            periodId: data.periodId || "2026-10",
            financialYear: data.financialYear || "26-27"
        });
    } catch (err) {
        console.error("[generateGstr1Summary] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

// 2. RECONCILIATION
exports.reconcileGatewaySettlement = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await reconcileGatewaySettlement(data);
    } catch (err) {
        console.error("[reconcileGatewaySettlement] Error:", err);
        throw new HttpsError("invalid-argument", err.message);
    }
});

exports.reconcileRiderCashBankDeposit = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await reconcileRiderCashBankDeposit(data);
    } catch (err) {
        console.error("[reconcileRiderCashBankDeposit] Error:", err);
        throw new HttpsError("invalid-argument", err.message);
    }
});

// 3. FISCAL PERIOD LIFECYCLE
exports.runMonthEndChecklist = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await runMonthEndChecklist(data.periodId || "2026-10");
    } catch (err) {
        console.error("[runMonthEndChecklist] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

exports.lockFiscalPeriod = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await lockFiscalPeriod({
            periodId: data.periodId,
            lockedBy: request.auth.token.email || data.lockedBy || "FinanceAdmin",
            lockNotes: data.lockNotes,
            forceOverride: data.forceOverride
        });
    } catch (err) {
        console.error("[lockFiscalPeriod] Error:", err);
        throw new HttpsError("failed-precondition", err.message);
    }
});

exports.unlockFiscalPeriod = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await unlockFiscalPeriod({
            periodId: data.periodId,
            unlockedBy: request.auth.token.email || data.unlockedBy || "SuperAdmin",
            unlockReason: data.unlockReason
        });
    } catch (err) {
        console.error("[unlockFiscalPeriod] Error:", err);
        throw new HttpsError("permission-denied", err.message);
    }
});

exports.getFiscalPeriodsList = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await getFiscalPeriodsList(data.count || 12);
    } catch (err) {
        console.error("[getFiscalPeriodsList] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

// 4. MAKER-CHECKER
exports.submitApprovalRequest = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await submitApprovalRequest({
            ...data,
            maker: {
                uid: request.auth.uid,
                email: request.auth.token.email || "accountant@krishivishal.com",
                role: request.auth.token.role || "Accountant"
            }
        });
    } catch (err) {
        console.error("[submitApprovalRequest] Error:", err);
        throw new HttpsError("invalid-argument", err.message);
    }
});

exports.reviewApprovalRequest = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await reviewApprovalRequest({
            requestId: data.requestId,
            checker: {
                uid: request.auth.uid,
                email: request.auth.token.email || "cfo@krishivishal.com",
                role: request.auth.token.role || "CFO"
            },
            action: data.action,
            remarks: data.remarks
        });
    } catch (err) {
        console.error("[reviewApprovalRequest] Error:", err);
        throw new HttpsError("failed-precondition", err.message);
    }
});

exports.getApprovalRequests = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    try {
        const data = request.data || {};
        return await getApprovalRequests(data.status || "PENDING");
    } catch (err) {
        console.error("[getApprovalRequests] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});

// 5. TALLYPRIME / ERP XML EXPORT ENGINE
const { exportTallyXml } = require("./tallyExportEngine");

exports.exportTallyXml = onCall({ region: REGION }, async (request) => {
    assertAuth(request);
    // Role verification: SuperAdmin, FinanceAdmin, Director, Auditor, CFO
    const userRole = (request.auth.token && (request.auth.token.role || request.auth.token.adminRole)) || "Viewer";
    const allowedRoles = ["SuperAdmin", "FinanceAdmin", "FinanceManager", "CFO", "Director", "Auditor", "admin", "super_admin"];
    const isAuthorized = allowedRoles.some(r => r.toLowerCase() === userRole.toLowerCase()) || Boolean(request.auth.token?.isAdmin);

    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "UNAUTHORIZED: Only Finance Controllers, CFOs, or Statutory Auditors can export Tally XML.");
    }

    try {
        const data = request.data || {};
        return await exportTallyXml({
            periodId: data.periodId || null,
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            voucherTypeFilter: data.voucherTypeFilter || "ALL"
        });
    } catch (err) {
        console.error("[exportTallyXml] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});


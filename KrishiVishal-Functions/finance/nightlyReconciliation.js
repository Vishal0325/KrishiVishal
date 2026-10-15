/**
 * KrishiVishal Nightly Financial Reconciliation Engine
 * Statutory Double-Entry Accounting System conforming to Indian Accounting Standards (Ind AS / AS).
 * 
 * Scheduled Daily at 02:00 IST:
 * 1. Customer Wallet Invariant: Sum(users.walletBalance) === 2065_CUSTOMER_WALLET_LIABILITY net balance
 * 2. Rider Cash Invariant: Sum(riders.cash_in_hand) === 1010_CASH_IN_HAND_RIDERS net balance
 * 3. General Ledger Invariant: Total Debits === Total Credits across all journal lines in journal_entries
 * 
 * Generates reconciliation_alerts on discrepancy (> ₹0.01) with P0_CRITICAL severity.
 * Generates reconciliation_logs on zero discrepancy.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = "asia-south1";

/**
 * Core engine for running daily financial reconciliation.
 * Exportable for direct invocation in automated tests and administrative triggers.
 * 
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {string} [options.triggeredBy]
 * @returns {Promise<object>} Reconciliation outcome
 */
async function reconcileDailyLedgerCore(options = {}) {
    const { getLedgerExtractCore } = require("./generalLedger");
    const isDryRun = options.dryRun === true;
    const triggeredBy = options.triggeredBy || "SYSTEM_CRON";

    // -------------------------------------------------------------
    // CHECK 1: Customer Wallet Invariant
    // Sum of all non-test users.walletBalance === Account 2065_CUSTOMER_WALLET_LIABILITY
    // -------------------------------------------------------------
    const usersSnapshot = await db.collection("users").get();
    let userWalletSum = 0;
    let nonTestUserCount = 0;

    for (const doc of usersSnapshot.docs) {
        const u = doc.data() || {};
        // Exclude test records based on isTestRecord flag and common test heuristics
        if (u.isTestRecord === true) continue;
        if (doc.id.startsWith("TEST_") || doc.id.startsWith("test_")) continue;
        if (u.phone && (u.phone.includes("0000000000") || u.phone.includes("9999999999"))) continue;

        const bal = Number(u.walletBalance || 0);
        userWalletSum += bal;
        nonTestUserCount++;
    }
    userWalletSum = Math.round((userWalletSum + Number.EPSILON) * 100) / 100;

    // Get 2065_CUSTOMER_WALLET_LIABILITY net balance from General Ledger
    const walletExtract = await getLedgerExtractCore({ accountCode: "2065_CUSTOMER_WALLET_LIABILITY" });
    const glWalletLiability = Math.round((walletExtract.closingBalance + Number.EPSILON) * 100) / 100;
    const walletDiff = Math.round((userWalletSum - glWalletLiability + Number.EPSILON) * 100) / 100;
    const isWalletBalanced = Math.abs(walletDiff) <= 0.01;

    // -------------------------------------------------------------
    // CHECK 2: Rider Cash Invariant
    // Sum of all non-test riders.cash_in_hand === Account 1010_CASH_IN_HAND_RIDERS
    // -------------------------------------------------------------
    const ridersSnapshot = await db.collection("riders").get();
    let riderCashSum = 0;
    let nonTestRiderCount = 0;

    for (const doc of ridersSnapshot.docs) {
        const r = doc.data() || {};
        // Exclude test records
        if (r.isTestRecord === true) continue;
        if (doc.id.startsWith("TEST_") || doc.id.startsWith("test_")) continue;
        if (r.phone && (r.phone.includes("0000000000") || r.phone.includes("9999999999"))) continue;

        const cash = Number(r.cash_in_hand !== undefined ? r.cash_in_hand : (r.cashInHand || 0));
        riderCashSum += cash;
        nonTestRiderCount++;
    }
    riderCashSum = Math.round((riderCashSum + Number.EPSILON) * 100) / 100;

    // Get 1010_CASH_IN_HAND_RIDERS net balance from General Ledger
    const riderCashExtract = await getLedgerExtractCore({ accountCode: "1010_CASH_IN_HAND_RIDERS" });
    const glRiderCash = Math.round((riderCashExtract.closingBalance + Number.EPSILON) * 100) / 100;
    const riderCashDiff = Math.round((riderCashSum - glRiderCash + Number.EPSILON) * 100) / 100;
    const isRiderCashBalanced = Math.abs(riderCashDiff) <= 0.01;

    // -------------------------------------------------------------
    // CHECK 3: General Ledger Double-Entry Invariant
    // Total Debits === Total Credits across all journal lines in journal_entries
    // -------------------------------------------------------------
    const entriesSnapshot = await db.collection("journal_entries").get();
    let totalDebits = 0;
    let totalCredits = 0;
    let entryCount = 0;

    for (const entryDoc of entriesSnapshot.docs) {
        const entryData = entryDoc.data() || {};
        // Exclude non-posted or draft entries if any
        if (entryData.status && entryData.status !== "POSTED") continue;

        let lines = [];
        if (Array.isArray(entryData.lines) && entryData.lines.length > 0) {
            lines = entryData.lines;
        } else {
            const linesSnap = await entryDoc.ref.collection("lines").get();
            lines = linesSnap.docs.map(d => d.data());
        }

        for (const line of lines) {
            totalDebits += Number(line.debit || 0);
            totalCredits += Number(line.credit || 0);
        }
        entryCount++;
    }

    totalDebits = Math.round((totalDebits + Number.EPSILON) * 100) / 100;
    totalCredits = Math.round((totalCredits + Number.EPSILON) * 100) / 100;
    const glDiff = Math.round((totalDebits - totalCredits + Number.EPSILON) * 100) / 100;
    const isGLBalanced = Math.abs(glDiff) <= 0.01;

    // -------------------------------------------------------------
    // CONSOLIDATED RECONCILIATION RESULT
    // -------------------------------------------------------------
    const isAllBalanced = isWalletBalanced && isRiderCashBalanced && isGLBalanced;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timestampStr = now.getTime();

    const checkDetails = {
        wallet: {
            userWalletSum,
            glWalletLiability,
            diff: walletDiff,
            balanced: isWalletBalanced,
            userCount: nonTestUserCount
        },
        riderCash: {
            riderCashSum,
            glRiderCash,
            diff: riderCashDiff,
            balanced: isRiderCashBalanced,
            riderCount: nonTestRiderCount
        },
        generalLedger: {
            totalDebits,
            totalCredits,
            diff: glDiff,
            balanced: isGLBalanced,
            entryCount
        }
    };

    let alertId = null;
    let logId = null;

    if (!isAllBalanced) {
        // Discrepancy detected -> Create P0 Alert
        alertId = `RECON_ALERT_${dateStr.replace(/-/g, '')}_${timestampStr}`;
        const alertPayload = {
            alertId,
            status: "UNRESOLVED",
            severity: "P0_CRITICAL",
            date: admin.firestore.Timestamp.fromDate(now),
            triggeredBy,
            checks: checkDetails,
            discrepancies: {
                walletDiscrepancy: !isWalletBalanced ? walletDiff : 0,
                riderCashDiscrepancy: !isRiderCashBalanced ? riderCashDiff : 0,
                glDiscrepancy: !isGLBalanced ? glDiff : 0
            },
            message: `CRITICAL: Nightly financial reconciliation detected discrepancy: ` +
                `[Wallet: ₹${walletDiff.toFixed(2)}] [Rider Cash: ₹${riderCashDiff.toFixed(2)}] [GL: ₹${glDiff.toFixed(2)}]`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!isDryRun) {
            await db.collection("reconciliation_alerts").doc(alertId).set(alertPayload);
        }
    } else {
        // All invariants balanced -> Create Audit Log
        logId = `RECON_LOG_${dateStr.replace(/-/g, '')}_${timestampStr}`;
        const logPayload = {
            logId,
            status: "BALANCED",
            date: admin.firestore.Timestamp.fromDate(now),
            triggeredBy,
            checks: checkDetails,
            message: "All financial invariants verified successfully. Zero discrepancy.",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!isDryRun) {
            await db.collection("reconciliation_logs").doc(logId).set(logPayload);
        }
    }

    return {
        success: true,
        balanced: isAllBalanced,
        alertId,
        logId,
        checks: checkDetails,
        reconciledAt: now.toISOString()
    };
}

/**
 * Cloud Scheduler Scheduled Function
 * Runs daily at 02:00 IST (Asia/Kolkata).
 */
const reconcileDailyLedgerSchedule = onSchedule({
    schedule: "0 2 * * *",
    timeZone: "Asia/Kolkata",
    region: REGION
}, async (event) => {
    console.log("[reconcileDailyLedgerSchedule] Starting automated nightly financial reconciliation at 02:00 IST...");
    const result = await reconcileDailyLedgerCore({ triggeredBy: "CLOUD_SCHEDULER" });
    if (!result.balanced) {
        console.error("[reconcileDailyLedgerSchedule] CRITICAL RECONCILIATION DISCREPANCY DETECTED:", JSON.stringify(result));
    } else {
        console.log("[reconcileDailyLedgerSchedule] Reconciliation successful with zero discrepancy:", result.logId);
    }
    return result;
});

/**
 * Callable HTTPS Function for Admin / Finance Dashboard manual on-demand reconciliation.
 */
const reconcileDailyLedger = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError("permission-denied", "Admin or Finance role required to trigger reconciliation.");
    }

    const payload = (request && request.data) ? request.data : {};
    return await reconcileDailyLedgerCore({
        ...payload,
        triggeredBy: context.auth ? context.auth.uid : "ADMIN_MANUAL"
    });
});

reconcileDailyLedger.core = reconcileDailyLedgerCore;

module.exports = {
    reconcileDailyLedgerCore,
    reconcileDailyLedgerSchedule,
    reconcileDailyLedger
};

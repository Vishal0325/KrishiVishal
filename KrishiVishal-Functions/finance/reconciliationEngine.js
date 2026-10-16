/**
 * KrishiVishal Payment Gateway & Bank Reconciliation Engine
 * Conforming to Indian Accounting Standards, Internal Financial Controls (IFC), & Double-Entry Bookkeeping.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 6).
 */

const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");

/**
 * Rounds monetary amounts cleanly to 2 decimal places with half-up rounding.
 * @param {number} num 
 * @returns {number}
 */
function roundCurrency(num) {
    return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Derives current fiscal period in 'YYYY-MM' format.
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit'
    }).format(d);
}

/**
 * Reconciles a Payment Gateway settlement batch (Razorpay / UPI / Cards).
 * 
 * Mathematical Invariant:
 * Gross Order Amount === Net Bank Payout + Merchant Gateway Fee + GST on Gateway Fee.
 * 
 * Double-Entry Posting:
 * Dr 1030_BANK_CURRENT_HDFC (Net Payout deposited in HDFC Bank account)
 * Dr 6020_PAYMENT_GATEWAY_FEES (MDR Fee + 18% GST charged by gateway)
 * Cr 1050_GATEWAY_RECEIVABLE (Clears full gross order receivable)
 * 
 * @param {object} param0
 * @returns {Promise<object>}
 */
async function reconcileGatewaySettlement({
    settlementId,
    gatewayName = "RAZORPAY",
    grossOrderAmount,
    feeAmount = 0,
    taxOnFee = 0,
    netPayout,
    periodId = getFiscalPeriodId(),
    bankUtr,
    settlementDate = new Date(),
    createdBy = "FINANCE_RECON_MANAGER"
}) {
    if (!settlementId) throw new Error("MISSING_SETTLEMENT_ID: settlementId is required.");
    if (!bankUtr) throw new Error("MISSING_BANK_UTR: Bank UTR reference is mandatory for statutory bank reconciliation.");

    const gross = roundCurrency(Number(grossOrderAmount || 0));
    const fee = roundCurrency(Number(feeAmount || 0));
    const tax = roundCurrency(Number(taxOnFee || 0));
    const net = roundCurrency(Number(netPayout || 0));
    const totalFeeAndTax = roundCurrency(fee + tax);

    // Validation Guard: Discrepancy Check
    const calculatedSum = roundCurrency(net + totalFeeAndTax);
    const discrepancy = Math.abs(gross - calculatedSum);
    if (discrepancy > 0.01) {
        const err = new Error(`SETTLEMENT_DISCREPANCY_ERROR: Gross order amount (₹${gross}) does not match Net Payout (₹${net}) + Fee/Tax (₹${totalFeeAndTax}). Diff: ₹${discrepancy.toFixed(4)}`);
        err.code = "SETTLEMENT_DISCREPANCY";
        err.discrepancy = discrepancy;
        throw err;
    }

    // Double-Entry Journal Lines
    const journalLines = [
        // Dr 1030_BANK_CURRENT_HDFC for net amount received in bank
        {
            accountCode: "1030_BANK_CURRENT_HDFC",
            debit: net,
            credit: 0,
            description: `Gateway Net Payout (${gatewayName}) Settlement ${settlementId} UTR: ${bankUtr}`
        },
        // Dr 6020_PAYMENT_GATEWAY_FEES for merchant gateway charges + GST
        {
            accountCode: "6020_PAYMENT_GATEWAY_FEES",
            debit: totalFeeAndTax,
            credit: 0,
            description: `MDR Fee & GST for Gateway Settlement ${settlementId}`
        },
        // Cr 1050_GATEWAY_RECEIVABLE to clear the outstanding order receivable
        {
            accountCode: "1050_GATEWAY_RECEIVABLE",
            debit: 0,
            credit: gross,
            description: `Clearing Gateway Receivable for Settlement ${settlementId}`
        }
    ];

    // Post atomic journal entry
    const journalResult = await postJournalEntry({
        entryId: `JE_GATEWAY_SETTLEMENT_${settlementId}`,
        refType: "GATEWAY_SETTLEMENT",
        refId: settlementId,
        periodId,
        date: settlementDate,
        memo: `Reconciliation of ${gatewayName} Settlement #${settlementId} (UTR: ${bankUtr})`,
        lines: journalLines,
        createdBy
    });

    // Record in Firestore gateway_settlements
    const settlementDoc = {
        settlementId,
        gatewayName,
        grossOrderAmount: gross,
        feeAmount: fee,
        taxOnFee: tax,
        totalFeeCharged: totalFeeAndTax,
        netPayout: net,
        bankUtr,
        periodId,
        journalEntryId: journalResult.entryId,
        status: "RECONCILED",
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        reconciledBy: createdBy
    };

    await db.collection("gateway_settlements").doc(settlementId).set(settlementDoc);

    return {
        success: true,
        settlementId,
        netPayout: net,
        totalFeeCharged: totalFeeAndTax,
        bankUtr,
        journalEntryId: journalResult.entryId,
        settlementDoc
    };
}

/**
 * Reconciles Hub Cash Vault deposit into company Current Bank Account.
 * Triggered when Hub / Depot Manager physically deposits cash collected from riders into the bank.
 * 
 * Double-Entry Posting:
 * Dr 1030_BANK_CURRENT_HDFC (Cash successfully credited in bank)
 * Cr 1020_HUB_CASH_VAULT (Vault cash balance reduced)
 * 
 * @param {object} param0
 * @returns {Promise<object>}
 */
async function reconcileRiderCashBankDeposit({
    depositSlipId,
    amount,
    depositedBy,
    bankUtr,
    periodId = getFiscalPeriodId(),
    depositDate = new Date(),
    hubId = "HUB_SAMASTIPUR"
}) {
    if (!depositSlipId) throw new Error("MISSING_DEPOSIT_SLIP_ID: depositSlipId is required.");
    if (!bankUtr) throw new Error("MISSING_BANK_UTR: Bank UTR / deposit acknowledgement number is required.");

    const depositAmount = roundCurrency(Number(amount || 0));
    if (depositAmount <= 0) {
        throw new Error("INVALID_DEPOSIT_AMOUNT: Deposit amount must be greater than zero.");
    }

    const journalLines = [
        // Dr 1030_BANK_CURRENT_HDFC
        {
            accountCode: "1030_BANK_CURRENT_HDFC",
            debit: depositAmount,
            credit: 0,
            description: `Hub Cash Vault Bank Deposit slip ${depositSlipId} UTR: ${bankUtr}`
        },
        // Cr 1020_HUB_CASH_VAULT
        {
            accountCode: "1020_HUB_CASH_VAULT",
            debit: 0,
            credit: depositAmount,
            description: `Reduction of Hub Cash Vault on bank deposit slip ${depositSlipId}`
        }
    ];

    const journalResult = await postJournalEntry({
        entryId: `JE_BANK_DEPOSIT_${depositSlipId}`,
        refType: "BANK_RECONCILIATION",
        refId: depositSlipId,
        periodId,
        date: depositDate,
        memo: `Bank deposit of hub cash collections (Slip #${depositSlipId}, UTR: ${bankUtr})`,
        lines: journalLines,
        createdBy: depositedBy || "HUB_MANAGER"
    });

    const depositRecord = {
        depositSlipId,
        hubId,
        amount: depositAmount,
        depositedBy: depositedBy || "HUB_MANAGER",
        bankUtr,
        periodId,
        journalEntryId: journalResult.entryId,
        status: "DEPOSITED",
        depositedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("cash_deposits").doc(depositSlipId).set(depositRecord);

    return {
        success: true,
        depositSlipId,
        amount: depositAmount,
        bankUtr,
        journalEntryId: journalResult.entryId,
        depositRecord
    };
}

/**
 * Records physical cash deposit from Hub Cash Vault to company Bank Account.
 * Double-Entry Posting:
 * Dr 1030_BANK_CURRENT_HDFC
 * Cr 1020_HUB_CASH_VAULT
 * 
 * Saves record into `vault_deposits` collection.
 */
async function recordVaultBankDepositCore({
    amount,
    depositDate = new Date(),
    bankName = "HDFC",
    depositSlipNumber,
    cmsAgency = "Manual",
    remarks = "",
    hubCode = "MAIN_HUB",
    userRef = null,
    bankAccountCode = "1030_BANK_CURRENT_HDFC"
}) {
    const depositAmount = roundCurrency(Number(amount || 0));
    if (depositAmount <= 0) {
        throw new Error("INVALID_AMOUNT: Deposit amount must be greater than zero.");
    }
    if (!depositSlipNumber) {
        throw new Error("MISSING_DEPOSIT_SLIP: Deposit slip number is required.");
    }

    const slipId = String(depositSlipNumber).trim();
    const periodId = getFiscalPeriodId(depositDate);

    const journalLines = [
        {
            accountCode: bankAccountCode || "1030_BANK_CURRENT_HDFC",
            debit: depositAmount,
            credit: 0,
            description: `Vault Cash Bank Deposit to ${bankName} (${slipId})`
        },
        {
            accountCode: "1020_HUB_CASH_VAULT",
            debit: 0,
            credit: depositAmount,
            description: `Vault Cash Reduction on Bank Deposit to ${bankName} by ${hubCode}`
        }
    ];

    const journalResult = await postJournalEntry({
        entryId: `JE_VAULT_DEPOSIT_${slipId}`,
        refType: "BANK_RECONCILIATION",
        refId: slipId,
        periodId,
        date: depositDate instanceof Date ? depositDate : new Date(depositDate),
        memo: remarks || `EOD Vault Deposit of ₹${depositAmount} to ${bankName} (Slip #${slipId})`,
        lines: journalLines,
        createdBy: userRef || "HUB_MANAGER"
    });

    const depositDoc = {
        amount: depositAmount,
        depositDate: admin.firestore.Timestamp.fromDate(depositDate instanceof Date ? depositDate : new Date(depositDate)),
        bankName: bankName || "HDFC",
        depositSlipNumber: slipId,
        cmsAgency: cmsAgency || "Manual",
        remarks: remarks || "",
        hubCode: hubCode || "MAIN_HUB",
        journalEntryId: journalResult.entryId,
        status: "RECORDED",
        depositedBy: userRef || "HUB_MANAGER",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("vault_deposits").add(depositDoc);

    return {
        success: true,
        id: docRef.id,
        amount: depositAmount,
        journalEntryId: journalResult.entryId,
        ...depositDoc
    };
}

const { onCall, HttpsError } = require("firebase-functions/v2/https");

const recordVaultBankDeposit = onCall({ region: "asia-south1" }, async (request) => {
    try {
        const data = (request && request.data) ? request.data : request;
        const userRef = request?.auth?.uid || data?.userRef || "HUB_MANAGER";
        return await recordVaultBankDepositCore({ ...data, userRef });
    } catch (err) {
        console.error("[recordVaultBankDeposit] Error:", err);
        throw new HttpsError("internal", err.message);
    }
});
recordVaultBankDeposit.core = recordVaultBankDepositCore;

module.exports = {
    roundCurrency,
    reconcileGatewaySettlement,
    reconcileRiderCashBankDeposit,
    recordVaultBankDeposit,
    recordVaultBankDepositCore
};

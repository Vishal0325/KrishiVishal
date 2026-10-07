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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
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

module.exports = {
    roundCurrency,
    reconcileGatewaySettlement,
    reconcileRiderCashBankDeposit
};

/**
 * KrishiVishal Unified Wallet Service
 * Single source of truth for customer wallet balance mutations and System 2 General Ledger synchronization.
 * 
 * Strict Transaction Contract:
 * - Rule 1: Caller reads first (users/{uid}, wallet_transactions/{txId})
 * - Rule 2: Zero writes before postJournalEntry
 * - Rule 3: Replay skip on alreadyProcessed
 * - Rule 4: Deterministic entryId (JE_WALLET_${eventType}_${entityId})
 * - Rule 5: Exactly one postJournalEntry call per transaction
 */

const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");

/**
 * Standard Fiscal Period Helper ('YYYY-MM')
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
}

/**
 * Round to 2 decimal places to guarantee strict currency precision
 */
function round2(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Canonical Event Types and Accounting Mappings
 */
const WALLET_EVENT_TYPES = {
    TOPUP: "TOPUP",
    ORDER_PAYMENT: "ORDER_PAYMENT",
    ORDER_REFUND: "ORDER_REFUND",
    REFERRAL_REWARD: "REFERRAL_REWARD",
    REFERRAL_REVERSAL: "REFERRAL_REVERSAL",
    ADMIN_CREDIT: "ADMIN_CREDIT",
    ADMIN_DEBIT: "ADMIN_DEBIT"
};

const EVENT_ACCOUNTS = {
    TOPUP: {
        debitAccount: "1050_GATEWAY_RECEIVABLE",
        creditAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        direction: "CREDIT"
    },
    ORDER_PAYMENT: {
        debitAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        creditAccount: "2070_DEFERRED_REVENUE",
        direction: "DEBIT"
    },
    ORDER_REFUND: {
        debitAccount: "2060_CUSTOMER_REFUNDS_PAYABLE",
        creditAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        direction: "CREDIT"
    },
    REFERRAL_REWARD: {
        debitAccount: "6030_REFERRAL_PROMOTION_EXPENSE",
        creditAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        direction: "CREDIT"
    },
    REFERRAL_REVERSAL: {
        debitAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        creditAccount: "6030_REFERRAL_PROMOTION_EXPENSE",
        direction: "DEBIT"
    },
    ADMIN_CREDIT: {
        debitAccount: "6035_CUSTOMER_GOODWILL_EXPENSE",
        creditAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        direction: "CREDIT"
    },
    ADMIN_DEBIT: {
        debitAccount: "2065_CUSTOMER_WALLET_LIABILITY",
        creditAccount: "6035_CUSTOMER_GOODWILL_EXPENSE",
        direction: "DEBIT"
    }
};

/**
 * Core transactional wallet executor adhering to the 5 rules.
 */
async function executeWalletOperation({
    uid,
    amount,
    eventType,
    entityId,
    description = "",
    metadata = {},
    idempotencyKey = null
}, expectedDirection, options = {}) {
    if (!uid || typeof uid !== "string") {
        throw new Error("INVALID_UID: uid is strictly required.");
    }

    const roundedAmount = round2(amount);
    if (typeof roundedAmount !== "number" || isNaN(roundedAmount) || roundedAmount <= 0) {
        throw new Error(`INVALID_AMOUNT: Amount must be a positive number, got: ${amount}`);
    }

    const eventConfig = EVENT_ACCOUNTS[eventType];
    if (!eventConfig) {
        throw new Error(`INVALID_EVENT_TYPE: Unknown wallet event type '${eventType}'. Must be one of: ${Object.keys(EVENT_ACCOUNTS).join(", ")}`);
    }

    if (eventConfig.direction !== expectedDirection) {
        throw new Error(`DIRECTION_MISMATCH: Event type '${eventType}' requires direction '${eventConfig.direction}', got: '${expectedDirection}'`);
    }

    if (!entityId || typeof entityId !== "string") {
        throw new Error("INVALID_ENTITY_ID: entityId is required for deterministic idempotency.");
    }

    const deterministicJournalId = idempotencyKey || `JE_WALLET_${eventType}_${entityId}`;
    const hash = crypto.createHash("sha256").update(deterministicJournalId).digest("hex").slice(0, 24);
    const txId = `WTX_${hash}`;

    const userRef = db.collection("users").doc(uid);
    const txRef = db.collection("wallet_transactions").doc(txId);

    // Operational logic inside the transaction
    const runInTransaction = async (transaction) => {
        // -------------------------------------------------------------
        // RULE 1: All caller reads must occur first before any writes
        // -------------------------------------------------------------
        const [userSnap, existingTxSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(txRef)
        ]);

        if (!userSnap.exists) {
            const err = new Error(`USER_NOT_FOUND: User document 'users/${uid}' does not exist.`);
            err.code = "USER_NOT_FOUND";
            throw err;
        }

        const currentBalance = round2(userSnap.data().walletBalance || 0);

        // RULE 3 & 4: If transaction record already exists, replay idempotently
        if (existingTxSnap.exists) {
            const existingData = existingTxSnap.data();
            return {
                success: true,
                alreadyProcessed: true,
                balanceBefore: existingData.balanceBefore,
                balanceAfter: existingData.balanceAfter,
                amount: existingData.amount,
                txId: existingData.txId,
                journalEntryId: existingData.journalEntryId
            };
        }

        // Floor check on debit
        if (expectedDirection === "DEBIT" && currentBalance < roundedAmount) {
            const err = new Error(`INSUFFICIENT_WALLET_BALANCE: Current wallet balance is ₹${currentBalance}, requested debit ₹${roundedAmount}.`);
            err.code = "INSUFFICIENT_WALLET_BALANCE";
            throw err;
        }

        const newBalance = expectedDirection === "CREDIT"
            ? round2(currentBalance + roundedAmount)
            : round2(currentBalance - roundedAmount);

        // -------------------------------------------------------------
        // RULE 2: Zero writes before postJournalEntry
        // postJournalEntry reads fiscal period & idempotency lock,
        // so no writes (tx.set, tx.update) are allowed before it.
        // -------------------------------------------------------------
        const jePayload = {
            entryId: deterministicJournalId,
            periodId: getFiscalPeriodId(options.date || new Date()),
            date: options.date || new Date(),
            refType: "WALLET_TRANSACTION",
            refId: String(entityId),
            memo: description || `Customer Wallet ${eventType} (User: ${uid})`,
            lines: [
                {
                    accountCode: eventConfig.debitAccount,
                    debit: roundedAmount,
                    credit: 0,
                    description: `${eventType} Debit [${uid}]`
                },
                {
                    accountCode: eventConfig.creditAccount,
                    debit: 0,
                    credit: roundedAmount,
                    description: `${eventType} Credit [${uid}]`
                }
            ]
        };

        const jeResult = await postJournalEntry(jePayload, {
            tx: transaction,
            auth: options.auth
        });

        if (jeResult.alreadyProcessed) {
            return {
                success: true,
                alreadyProcessed: true,
                balanceBefore: currentBalance,
                balanceAfter: currentBalance,
                amount: roundedAmount,
                txId: txId,
                journalEntryId: deterministicJournalId
            };
        }

        // -------------------------------------------------------------
        // RULE 5: Stage writes strictly AFTER postJournalEntry
        // -------------------------------------------------------------
        transaction.update(userRef, {
            walletBalance: newBalance,
            lastWalletTransactionAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const txRecord = {
            txId,
            uid,
            amount: roundedAmount,
            type: expectedDirection,
            eventType,
            entityId: String(entityId),
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            journalEntryId: deterministicJournalId,
            referenceId: String(entityId),
            description: description || `Customer Wallet ${eventType}`,
            metadata: metadata || {},
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            timestampMs: Date.now()
        };

        transaction.set(txRef, txRecord);

        return {
            success: true,
            alreadyProcessed: false,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            amount: roundedAmount,
            txId,
            journalEntryId: deterministicJournalId
        };
    };

    if (options.tx) {
        return await runInTransaction(options.tx);
    } else {
        return await db.runTransaction(runInTransaction);
    }
}

/**
 * Credits a customer wallet and posts double-entry System 2 journal entry.
 */
async function creditWallet(params, options = {}) {
    return await executeWalletOperation(params, "CREDIT", options);
}

/**
 * Debits a customer wallet with strict balance >= 0 floor check and posts System 2 journal entry.
 */
async function debitWallet(params, options = {}) {
    return await executeWalletOperation(params, "DEBIT", options);
}

module.exports = {
    creditWallet,
    debitWallet,
    WALLET_EVENT_TYPES,
    EVENT_ACCOUNTS,
    getFiscalPeriodId,
    round2
};

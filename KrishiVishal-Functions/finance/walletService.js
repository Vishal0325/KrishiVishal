/**
 * KrishiVishal Unified Wallet Service
 * Single source of truth for customer wallet balance mutations and System 2 General Ledger synchronization.
 * 
 * Strict Transaction Contract:
 * - Rule 1: Caller reads first (users/{uid}, wallet_transactions/{txId})
 * - Rule 2: Zero writes before postJournalEntry
 * - Rule 3: Replay skip on alreadyProcessed (with IDEMPOTENCY_CONFLICT check)
 * - Rule 4: Deterministic entryId (JE_WALLET_${eventType}_${entityId})
 * - Rule 5: Exactly one postJournalEntry call per transaction
 */

const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { postJournalEntry } = require("./generalLedger");

/**
 * Kill-switch helper for customer wallet top-ups
 */
function isWalletTopUpEnabled() {
    return process.env.ENABLE_WALLET_TOPUP === "true";
}

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
 * Validates currency amounts strictly:
 * - Number type, non-NaN, finite
 * - Strictly > 0
 * - Maximum 2 decimal places (paise precision)
 */
function validateWalletAmount(amount) {
    if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
        const err = new Error(`INVALID_AMOUNT: Amount must be a valid finite number, got: ${typeof amount === "string" ? `"${amount}"` : amount}`);
        err.code = "INVALID_AMOUNT";
        throw err;
    }
    if (amount <= 0) {
        const err = new Error(`INVALID_AMOUNT: Amount must be strictly greater than 0, got: ${amount}`);
        err.code = "INVALID_AMOUNT";
        throw err;
    }
    const str = String(amount);
    if (str.includes(".")) {
        const decimals = str.split(".")[1];
        if (decimals.length > 2) {
            const err = new Error(`INVALID_AMOUNT_PRECISION: Amount cannot have more than 2 decimal places (paise precision), got: ${amount}`);
            err.code = "INVALID_AMOUNT_PRECISION";
            throw err;
        }
    }
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
 * Validates entity identifiers according to event business domain
 */
function validateEventEntityId(eventType, entityId, metadata = {}) {
    if (!entityId || typeof entityId !== "string" || !entityId.trim()) {
        const err = new Error(`MISSING_ENTITY_ID: entityId is strictly required for event '${eventType}'.`);
        err.code = "MISSING_ENTITY_ID";
        throw err;
    }

    if (eventType === WALLET_EVENT_TYPES.ORDER_PAYMENT) {
        const orderId = metadata.orderId || entityId;
        if (!orderId || !String(orderId).trim()) {
            const err = new Error("MISSING_ENTITY_ID: Event 'ORDER_PAYMENT' strictly requires a valid orderId.");
            err.code = "MISSING_ENTITY_ID";
            throw err;
        }
    } else if (eventType === WALLET_EVENT_TYPES.ORDER_REFUND) {
        const ref = metadata.returnId || metadata.creditNoteNumber || entityId;
        if (!ref || !String(ref).trim()) {
            const err = new Error("MISSING_ENTITY_ID: Event 'ORDER_REFUND' strictly requires returnId or creditNoteNumber.");
            err.code = "MISSING_ENTITY_ID";
            throw err;
        }
    } else if (eventType === WALLET_EVENT_TYPES.REFERRAL_REWARD || eventType === WALLET_EVENT_TYPES.REFERRAL_REVERSAL) {
        const referrerUid = metadata.referrerUid;
        const refereeUid = metadata.refereeUid;
        const orderId = metadata.orderId;
        if (!referrerUid || !refereeUid || !orderId) {
            const err = new Error(`MISSING_ENTITY_ID: Event '${eventType}' strictly requires metadata fields: referrerUid, refereeUid, orderId.`);
            err.code = "MISSING_ENTITY_ID";
            throw err;
        }
    } else if (eventType === WALLET_EVENT_TYPES.TOPUP) {
        const topUpId = metadata.topUpId || entityId;
        if (!topUpId || !String(topUpId).trim()) {
            const err = new Error("MISSING_ENTITY_ID: Event 'TOPUP' strictly requires topUpId.");
            err.code = "MISSING_ENTITY_ID";
            throw err;
        }
    }
}

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
    idempotencyKey = null,
    periodId = null
}, expectedDirection, options = {}) {
    if (!uid || typeof uid !== "string" || !uid.trim()) {
        const err = new Error("INVALID_UID: uid is strictly required.");
        err.code = "INVALID_UID";
        throw err;
    }

    // Validate amount format and precision
    validateWalletAmount(amount);
    const roundedAmount = round2(amount);

    const eventConfig = EVENT_ACCOUNTS[eventType];
    if (!eventConfig) {
        const err = new Error(`INVALID_EVENT_TYPE: Unknown wallet event type '${eventType}'. Must be one of: ${Object.keys(EVENT_ACCOUNTS).join(", ")}`);
        err.code = "INVALID_EVENT_TYPE";
        throw err;
    }

    if (eventConfig.direction !== expectedDirection) {
        const err = new Error(`DIRECTION_MISMATCH: Event type '${eventType}' requires direction '${eventConfig.direction}', got: '${expectedDirection}'`);
        err.code = "DIRECTION_MISMATCH";
        throw err;
    }

    // Validate top-up kill-switch
    if (eventType === WALLET_EVENT_TYPES.TOPUP && !isWalletTopUpEnabled()) {
        const err = new Error("WALLET_TOPUP_DISABLED: Customer wallet top-up is temporarily disabled (ENABLE_WALLET_TOPUP is OFF).");
        err.code = "WALLET_TOPUP_DISABLED";
        throw err;
    }

    // Enforce required entity IDs per event type
    validateEventEntityId(eventType, entityId, metadata);

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

        // -------------------------------------------------------------
        // RULE 3 & 4: Replay Safety & IDEMPOTENCY_CONFLICT Detection
        // -------------------------------------------------------------
        if (existingTxSnap.exists) {
            const existingData = existingTxSnap.data() || {};
            const existingUid = existingData.uid;
            const existingType = existingData.type;
            const recordedRequested = Number(existingData.requestedAmount !== undefined ? existingData.requestedAmount : existingData.amount) || 0;

            const uidMismatch = existingUid !== uid;
            const typeMismatch = existingType !== expectedDirection;
            const amountMismatch = Math.abs(recordedRequested - roundedAmount) > 0.001;

            if (uidMismatch || typeMismatch || amountMismatch) {
                const err = new Error(`IDEMPOTENCY_CONFLICT: Existing transaction '${txId}' exists with conflicting parameters. Recorded: [uid: ${existingUid}, amount: ${recordedRequested}, type: ${existingType}], Attempted: [uid: ${uid}, amount: ${roundedAmount}, type: ${expectedDirection}].`);
                err.code = "IDEMPOTENCY_CONFLICT";
                throw err;
            }

            return {
                success: true,
                alreadyProcessed: true,
                balanceBefore: existingData.balanceBefore,
                balanceAfter: existingData.balanceAfter,
                amount: existingData.amount,
                requestedAmount: recordedRequested,
                reversedAmount: existingData.reversedAmount,
                txId: existingData.txId,
                journalEntryId: existingData.journalEntryId
            };
        }

        // -------------------------------------------------------------
        // Floor Check vs Partial Reversal Mode
        // -------------------------------------------------------------
        let debitAmount = roundedAmount;
        let newBalance = currentBalance;
        let skipJournalEntry = false;

        if (expectedDirection === "DEBIT") {
            if (eventType === WALLET_EVENT_TYPES.REFERRAL_REVERSAL) {
                // Partial Reversal Mode: claw back min(requested, available balance)
                const actualReversal = Math.min(roundedAmount, currentBalance);
                debitAmount = round2(actualReversal);
                newBalance = round2(currentBalance - debitAmount);

                if (debitAmount <= 0) {
                    // Balance is 0 -> No Journal Entry posted (avoids zero amount GL error)
                    skipJournalEntry = true;
                }
            } else {
                // Strict Floor Check for ORDER_PAYMENT and ADMIN_DEBIT
                if (currentBalance < roundedAmount) {
                    const err = new Error(`INSUFFICIENT_WALLET_BALANCE: Current wallet balance is ₹${currentBalance}, requested debit ₹${roundedAmount}.`);
                    err.code = "INSUFFICIENT_WALLET_BALANCE";
                    throw err;
                }
                newBalance = round2(currentBalance - roundedAmount);
            }
        } else {
            newBalance = round2(currentBalance + roundedAmount);
        }

        // -------------------------------------------------------------
        // RULE 2: Zero writes before postJournalEntry
        // postJournalEntry reads fiscal period & idempotency lock,
        // so no writes (tx.set, tx.update) are allowed before it.
        // -------------------------------------------------------------
        let effectiveJournalEntryId = null;

        if (!skipJournalEntry) {
            const entryAmount = expectedDirection === "DEBIT" ? debitAmount : roundedAmount;
            const effectivePeriodId = periodId || options.periodId || getFiscalPeriodId(options.date || new Date());
            const jePayload = {
                entryId: deterministicJournalId,
                periodId: effectivePeriodId,
                date: options.date || new Date(),
                refType: "WALLET_TRANSACTION",
                refId: String(entityId),
                memo: description || `Customer Wallet ${eventType} (User: ${uid})`,
                lines: [
                    {
                        accountCode: eventConfig.debitAccount,
                        debit: entryAmount,
                        credit: 0,
                        description: `${eventType} Debit [${uid}]`
                    },
                    {
                        accountCode: eventConfig.creditAccount,
                        debit: 0,
                        credit: entryAmount,
                        description: `${eventType} Credit [${uid}]`
                    }
                ]
            };

            const jeResult = await postJournalEntry(jePayload, {
                tx: transaction,
                auth: options.auth
            });

            effectiveJournalEntryId = deterministicJournalId;

            if (jeResult.alreadyProcessed) {
                return {
                    success: true,
                    alreadyProcessed: true,
                    balanceBefore: currentBalance,
                    balanceAfter: currentBalance,
                    amount: entryAmount,
                    txId: txId,
                    journalEntryId: deterministicJournalId
                };
            }
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
            amount: expectedDirection === "DEBIT" ? debitAmount : roundedAmount,
            type: expectedDirection,
            eventType,
            entityId: String(entityId),
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            journalEntryId: effectiveJournalEntryId,
            referenceId: String(entityId),
            description: description || `Customer Wallet ${eventType}`,
            metadata: metadata || {},
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            timestampMs: Date.now()
        };

        if (eventType === WALLET_EVENT_TYPES.REFERRAL_REVERSAL) {
            txRecord.requestedAmount = roundedAmount;
            txRecord.reversedAmount = debitAmount;
            if (debitAmount <= 0) {
                txRecord.note = "Referral clawback skipped: customer wallet balance is 0";
            }
        }

        transaction.set(txRef, txRecord);

        return {
            success: true,
            alreadyProcessed: false,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            amount: expectedDirection === "DEBIT" ? debitAmount : roundedAmount,
            requestedAmount: eventType === WALLET_EVENT_TYPES.REFERRAL_REVERSAL ? roundedAmount : undefined,
            reversedAmount: eventType === WALLET_EVENT_TYPES.REFERRAL_REVERSAL ? debitAmount : undefined,
            txId,
            journalEntryId: effectiveJournalEntryId
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
 * Debits a customer wallet with strict balance >= 0 floor check (or partial referral clawback) and posts System 2 journal entry.
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
    round2,
    validateWalletAmount,
    validateEventEntityId,
    isWalletTopUpEnabled
};

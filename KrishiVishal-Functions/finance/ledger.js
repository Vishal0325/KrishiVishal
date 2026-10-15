const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");
const { postJournalEntry, VALID_ACCOUNT_CODES } = require("./generalLedger");

const REGION = 'asia-south1';

const ASSET_ACCOUNTS = [
    'CASH_IN_HAND',
    'BANK_ACCOUNT',
    'INVENTORY_VALUE',
    'INVENTORY_ASSET',
    'HUB_CASH_VAULT',
    'RIDER_SHORTAGE_RECEIVABLE',
    'RIDER_CASH_IN_HAND',
    'INVENTORY_QUARANTINE_ASSET'
];
const EXPENSE_ACCOUNTS = ['COGS', 'EXPENSE', 'DELIVERY_EXPENSE', 'INVENTORY_SHRINKAGE_LOSS'];
const LIABILITY_REVENUE_ACCOUNTS = ['WALLET_BALANCE', 'GST_PAYABLE', 'SALES', 'ACCOUNTS_PAYABLE'];

const VALID_ACCOUNTS = [
    ...ASSET_ACCOUNTS,
    ...EXPENSE_ACCOUNTS,
    ...LIABILITY_REVENUE_ACCOUNTS
];

exports.ASSET_ACCOUNTS = ASSET_ACCOUNTS;
exports.EXPENSE_ACCOUNTS = EXPENSE_ACCOUNTS;
exports.LIABILITY_REVENUE_ACCOUNTS = LIABILITY_REVENUE_ACCOUNTS;
exports.VALID_ACCOUNTS = VALID_ACCOUNTS;

/**
 * Helper to resolve appropriate System 2 Expense Account from CoA.
 */
function resolveSystem2ExpenseAccount(data) {
    if (data.accountCode && VALID_ACCOUNT_CODES && VALID_ACCOUNT_CODES.includes(data.accountCode)) {
        return data.accountCode;
    }
    const category = String(data.category || '').toUpperCase();
    if (category.includes('GATEWAY') || category.includes('MDR')) return '6020_PAYMENT_GATEWAY_FEES';
    if (category.includes('REFERRAL') || category.includes('MARKETING') || category.includes('PROMO')) return '6030_REFERRAL_PROMOTION_EXPENSE';
    if (category.includes('GOODWILL') || category.includes('COMPENSATION') || category.includes('DISPUTE')) return '6035_CUSTOMER_GOODWILL_EXPENSE';
    if (category.includes('SHORTAGE') || category.includes('LOSS')) return '6040_CASH_SHORTAGE_LOSS';
    if (category.includes('RIDER') || category.includes('DELIVERY') || category.includes('TRIP')) return '6010_RIDER_DELIVERY_PAYOUTS';
    if (VALID_ACCOUNT_CODES && VALID_ACCOUNT_CODES.includes(category)) return category;
    return '6050_GENERAL_ADMIN_EXPENSES';
}

/**
 * recordExpensePayment: Admin only function to track expenses.
 * Refactored to System 2 Double-Entry Accounting with postJournalEntry.
 */
exports.recordExpensePayment = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    const amount = Number(data.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
        throw new HttpsError('invalid-argument', 'Valid positive expense amount is required.');
    }
    if (!data.category || typeof data.category !== 'string') {
        throw new HttpsError('invalid-argument', 'Expense category is required.');
    }

    const expenseId = data.expenseId || `EXP_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const paymentMode = (data.paymentMode || 'CASH').toUpperCase();
    const isBank = ['BANK', 'BANK_ACCOUNT', 'ONLINE', 'UPI', 'NEFT', 'RTGS', 'RAZORPAY'].includes(paymentMode);
    const creditAccount = isBank ? '1030_BANK_CURRENT_HDFC' : '1020_HUB_CASH_VAULT';
    const expenseAccount = resolveSystem2ExpenseAccount(data);

    const now = new Date();
    const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entryId = `JE_EXPENSE_${expenseId}`;

    // 1. Post System 2 Double-Entry Journal Entry
    const lines = [
        {
            accountCode: expenseAccount,
            debit: amount,
            credit: 0,
            description: `Expense: ${data.category}${data.description ? ` - ${data.description}` : ''}`
        },
        {
            accountCode: creditAccount,
            debit: 0,
            credit: amount,
            description: `Expense payment via ${paymentMode}`
        }
    ];

    const jeResult = await postJournalEntry({
        entryId,
        refType: 'EXPENSE',
        refId: expenseId,
        periodId,
        date: new Date(),
        memo: `Expense [${expenseId}]: ${data.category}${data.description ? ` - ${data.description}` : ''} (${paymentMode})`,
        lines,
        createdBy: context.auth ? context.auth.uid : 'SYSTEM'
    });

    // Replay idempotency guard
    if (jeResult && (jeResult.alreadyProcessed || jeResult.alreadyExists)) {
        return {
            success: true,
            expenseId,
            journalEntryId: entryId,
            alreadyProcessed: true
        };
    }

    // 2. Persist expense record
    await db.collection('expenses').doc(expenseId).set({
        expenseId,
        amount: amount,
        category: data.category,
        expenseAccount,
        creditAccount,
        description: data.description || '',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: context.auth ? context.auth.uid : 'SYSTEM',
        paymentMode: data.paymentMode || 'CASH',
        journalEntryId: jeResult.entryId,
        status: 'POSTED'
    });

    return {
        success: true,
        expenseId,
        journalEntryId: jeResult.entryId,
        amount,
        paymentMode
    };
});

/**
 * deleteExpenseAttachment: Admin only function.
 */
exports.deleteExpenseAttachment = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }
    return { success: true };
});

/**
 * recordBankPayout: Admin only function to record bank payouts / gateway settlements.
 * Refactored to System 2 Double-Entry Accounting with postJournalEntry.
 */
exports.recordBankPayout = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin role required.');
    }

    const { payoutId, referenceId, grossAmount, netAmount, fees, taxOnFees } = data;
    const gross = Number(grossAmount);
    let net = Number(netAmount);
    let fee = Number(fees || 0);
    const tax = Number(taxOnFees || 0);

    if (!gross || isNaN(gross) || gross <= 0) {
        throw new HttpsError('invalid-argument', 'Valid positive grossAmount is required.');
    }

    if (!net || isNaN(net) || net <= 0) {
        net = Math.max(0, Math.round((gross - fee - tax) * 100) / 100);
    }

    if (!fee && gross > net) {
        fee = Math.max(0, Math.round((gross - net - tax) * 100) / 100);
    }

    const cgst = Number(data.cgst !== undefined ? data.cgst : (tax > 0 ? (tax / 2).toFixed(2) : 0));
    const sgst = Number(data.sgst !== undefined ? data.sgst : (tax > 0 ? (tax - cgst).toFixed(2) : 0));

    // Ensure strict arithmetic balance: Debits must equal Credits
    const calculatedDebits = Math.round((net + fee + cgst + sgst) * 100) / 100;
    if (Math.abs(calculatedDebits - gross) > 0.0001 && Math.abs(calculatedDebits - gross) < 0.05) {
        net = Math.round((gross - fee - cgst - sgst) * 100) / 100;
    }

    const refId = payoutId || referenceId || `PO_${Date.now()}`;
    const entryId = `JE_GATEWAY_SETTLEMENT_${refId}`;
    const now = new Date();
    const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // System 2 Double-Entry Lines:
    // Debit 1030_BANK_CURRENT_HDFC (Net amount received in bank)
    // Debit 6020_PAYMENT_GATEWAY_FEES (Merchant fee / MDR)
    // Debit 1060_INPUT_CGST & 1070_INPUT_SGST (GST on fees)
    // Credit 1050_GATEWAY_RECEIVABLE (Gross amount cleared from gateway)
    const lines = [
        {
            accountCode: '1030_BANK_CURRENT_HDFC',
            debit: net,
            credit: 0,
            description: `Bank net settlement received [${refId}]`
        }
    ];

    if (fee > 0) {
        lines.push({
            accountCode: '6020_PAYMENT_GATEWAY_FEES',
            debit: fee,
            credit: 0,
            description: `Payment gateway fee / MDR [${refId}]`
        });
    }

    if (cgst > 0) {
        lines.push({
            accountCode: '1060_INPUT_CGST',
            debit: cgst,
            credit: 0,
            description: `Input CGST on gateway fee [${refId}]`
        });
    }

    if (sgst > 0) {
        lines.push({
            accountCode: '1070_INPUT_SGST',
            debit: sgst,
            credit: 0,
            description: `Input SGST on gateway fee [${refId}]`
        });
    }

    lines.push({
        accountCode: '1050_GATEWAY_RECEIVABLE',
        debit: 0,
        credit: gross,
        description: `Gateway receivable cleared [${refId}]`
    });

    const jeResult = await postJournalEntry({
        entryId,
        refType: 'BANK_PAYOUT',
        refId,
        periodId,
        date: new Date(),
        memo: `Payment Gateway Settlement [${refId}]: Gross ₹${gross}, Net ₹${net}, Fees ₹${fee}`,
        lines,
        createdBy: context.auth ? context.auth.uid : 'SYSTEM'
    });

    // Replay idempotency guard
    if (jeResult && (jeResult.alreadyProcessed || jeResult.alreadyExists)) {
        return {
            success: true,
            payoutId: refId,
            journalEntryId: entryId,
            message: `Payout [${refId}] already processed.`,
            alreadyProcessed: true
        };
    }

    // Persist settlement record
    await db.collection('gateway_settlements').doc(refId).set({
        settlementId: refId,
        payoutId: refId,
        grossAmount: gross,
        netAmount: net,
        fees: fee,
        cgst: cgst,
        sgst: sgst,
        totalFees: fee + cgst + sgst,
        journalEntryId: jeResult.entryId,
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
        recordedBy: context.auth ? context.auth.uid : 'SYSTEM',
        status: 'SETTLED'
    }, { merge: true });

    return {
        success: true,
        message: `Payout [${refId}] reconciled successfully.`,
        payoutId: refId,
        journalEntryId: jeResult.entryId,
        grossAmount: gross,
        netAmount: net,
        fees: fee
    };
});

let system1Frozen = true;

function freezeSystem1(frozen = true) {
    system1Frozen = frozen;
}

/**
 * Permanently frozen legacy writer (System 1 Freeze).
 * In production and real emulator environments, zero new writes may be made to legacy collections (`ledger`, `accounts/*`).
 * Throws SYSTEM_1_FROZEN error.
 */
async function postLedgerEntry(transactionOrEntry, maybeEntry) {
    if (system1Frozen && (process.env.NODE_ENV === 'production' || process.env.FIRESTORE_EMULATOR_HOST || process.env.SYSTEM_1_FROZEN === 'true')) {
        const err = new Error("SYSTEM_1_FROZEN: Legacy System 1 ledger writes are permanently deprecated. Use System 2 postJournalEntry.");
        err.code = "SYSTEM_1_FROZEN";
        throw err;
    }

    let transaction = null;
    let entry = null;

    if (maybeEntry) {
        transaction = transactionOrEntry;
        entry = maybeEntry;
    } else {
        entry = transactionOrEntry;
    }

    if (!entry || typeof entry !== 'object') {
        throw new Error('Invalid Ledger Entry');
    }

    if (!VALID_ACCOUNTS.includes(entry.account)) {
        throw new Error(`Invalid Ledger Account: ${entry.account}`);
    }

    const isAssetOrExpense = ASSET_ACCOUNTS.includes(entry.account) || EXPENSE_ACCOUNTS.includes(entry.account);

    let increment = 0;
    if (isAssetOrExpense) {
        increment = (entry.type === 'DEBIT' ? entry.amount : -entry.amount);
    } else {
        increment = (entry.type === 'CREDIT' ? entry.amount : -entry.amount);
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const ledgerData = {
        ...entry,
        timestamp: timestamp,
        createdAt: timestamp,
    };

    if (transaction) {
        const ledgerRef = entry.idempotencyKey
            ? db.collection("ledger").doc(entry.idempotencyKey)
            : db.collection("ledger").doc();

        transaction.set(ledgerRef, ledgerData);

        const accountRef = db.collection("accounts").doc(entry.account);
        transaction.set(accountRef, {
            balance: admin.firestore.FieldValue.increment(increment),
            lastUpdated: timestamp,
        }, { merge: true });
        return;
    }

    await db.runTransaction(async (t) => {
        const ledgerRef = entry.idempotencyKey
            ? db.collection("ledger").doc(entry.idempotencyKey)
            : db.collection("ledger").doc();

        if (entry.idempotencyKey) {
            const snap = await t.get(ledgerRef);
            if (snap.exists) {
                console.log(`Ledger entry ${entry.idempotencyKey} already exists. Skipping.`);
                return;
            }
        }

        t.set(ledgerRef, ledgerData);

        const accountRef = db.collection("accounts").doc(entry.account);
        t.set(accountRef, {
            balance: admin.firestore.FieldValue.increment(increment),
            lastUpdated: timestamp,
        }, { merge: true });
    });
}

/**
 * Permanently frozen legacy writer (System 1 Freeze).
 */
async function updateAccountBalance() {
    const err = new Error("SYSTEM_1_FROZEN: Legacy System 1 account balance updates are permanently deprecated. Use System 2 generalLedger.");
    err.code = "SYSTEM_1_FROZEN";
    throw err;
}

exports.postLedgerEntry = postLedgerEntry;
exports.updateAccountBalance = updateAccountBalance;
exports.freezeSystem1 = freezeSystem1;

/**
 * Triggered when an order's PAYMENT status changes to 'PAID'.
 * PERMANENTLY FROZEN: System 1 ledger write disabled. Revenue recognized via System 2 postJournalEntry.
 */
exports.onOrderPaidLedger = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    console.warn("[onOrderPaidLedger] SYSTEM_1_FROZEN: Legacy order paid ledger trigger is permanently frozen. Revenue is recognized via System 2 postJournalEntry.");
    return null;
});

/**
 * Triggered when a return status changes to 'COMPLETED'.
 * PERMANENTLY FROZEN: System 1 ledger write disabled. Returns processed via System 2 creditNoteEngine.
 */
exports.onReturnCompletedLedger = onDocumentUpdated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    console.warn("[onReturnCompletedLedger] SYSTEM_1_FROZEN: Legacy return completed ledger trigger is permanently frozen. Returns are processed via creditNoteEngine System 2.");
    return null;
});

/**
 * Triggered when a Goods Receipt Note (GRN) is created.
 * PERMANENTLY FROZEN: System 1 ledger write disabled.
 */
exports.onGoodsReceiptCreated = onDocumentCreated({ document: "goods_receipts/{grnId}", region: REGION }, async (event) => {
    console.warn("[onGoodsReceiptCreated] SYSTEM_1_FROZEN: Legacy GRN ledger trigger is permanently frozen.");
    return null;
});

/**
 * Validates order list against cash deposit metadata.
 * Requires:
 * 1. orderIds must be non-empty array
 * 2. Every order must exist in Firestore
 * 3. Every order riderId must match deposit.riderId
 * 4. Every order must have COD paymentMethod/paymentMode
 * 5. Every order must have status == 'DELIVERED'
 * 6. Every order must have !isCashDeposited
 * 7. Sum of order.totalAmount must equal deposit.amount
 */
function validateCashDepositOrders(depositData, orderDocs) {
    const riderId = depositData.riderId;
    const depositAmount = Number(depositData.amount || 0);
    const orderIds = Array.isArray(depositData.orderIds) ? depositData.orderIds : [];

    if (orderIds.length === 0) {
        return { isValid: false, reason: "No orderIds specified in cash deposit" };
    }

    if (orderDocs.length !== orderIds.length) {
        return { isValid: false, reason: `Mismatch in retrieved order count: expected ${orderIds.length}, found ${orderDocs.length}` };
    }

    let sumTotals = 0;

    for (const doc of orderDocs) {
        if (!doc.exists) {
            return { isValid: false, reason: `Order ${doc.id} does not exist` };
        }
        const ord = (typeof doc.data === 'function') ? doc.data() : (doc.data || {});
        
        // 1. Same rider check
        if (ord.riderId !== riderId) {
            return { isValid: false, reason: `Order ${doc.id} rider '${ord.riderId}' does not match deposit rider '${riderId}'` };
        }

        // 2. COD payment check
        const payMode = (ord.paymentMode || ord.paymentMethod || (ord.payment && ord.payment.method) || '').toUpperCase().trim();
        if (payMode !== 'COD') {
            return { isValid: false, reason: `Order ${doc.id} payment method '${payMode}' is not COD` };
        }

        // 3. DELIVERED status check
        if (ord.status !== 'DELIVERED') {
            return { isValid: false, reason: `Order ${doc.id} status '${ord.status}' is not DELIVERED` };
        }

        // 4. Not already deposited
        if (ord.isCashDeposited === true) {
            return { isValid: false, reason: `Order ${doc.id} cash has already been deposited` };
        }

        const ordAmount = Number(ord.totalAmount || 0);
        sumTotals += ordAmount;
    }

    // 5. Sum of totals equals deposit amount
    if (Math.abs(sumTotals - depositAmount) > 0.01) {
        return {
            isValid: false,
            reason: `Order totals sum (₹${sumTotals.toFixed(2)}) does not match deposit amount (₹${depositAmount.toFixed(2)})`
        };
    }

    return { isValid: true, sumTotals };
}

exports.validateCashDepositOrders = validateCashDepositOrders;

/**
 * Triggered when a rider cash deposit is created or updated to VERIFIED.
 * PERMANENTLY FROZEN: System 1 ledger write disabled. Cash settlements are processed via confirmCashSettlement System 2.
 */
exports.onCashDepositVerified = onDocumentWritten({ document: "cash_deposits/{depositId}", region: REGION }, async (event) => {
    console.warn("[onCashDepositVerified] SYSTEM_1_FROZEN: Legacy cash deposit trigger is permanently frozen. Cash settlements are processed via confirmCashSettlement System 2.");
    return null;
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * recordExpensePayment: Admin only function to track expenses.
 */
exports.recordExpensePayment = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }
    return { success: true };
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
 * Helper to post a double-entry ledger record within a transaction.
 * Follows standard accounting principles:
 * - Assets/Expenses: DEBIT increases, CREDIT decreases.
 * - Liabilities/Equity/Revenue: CREDIT increases, DEBIT decreases.
 */
function postLedgerEntry(transaction, entry) {
    const ledgerRef = db.collection("ledger").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Define account types for correct balance calculation
    const ASSET_ACCOUNTS = ['CASH_IN_HAND', 'BANK_ACCOUNT', 'INVENTORY_VALUE'];
    const liabilityAccounts = ['WALLET_BALANCE', 'GST_PAYABLE', 'SALES', 'ACCOUNTS_PAYABLE']; // Sales is Revenue, GST is Liability

    const isAsset = ASSET_ACCOUNTS.includes(entry.account);

    // Calculate increment amount based on account type
    // Asset: Debit (+), Credit (-)
    // Others: Credit (+), Debit (-)
    let increment = 0;
    if (isAsset) {
        increment = (entry.type === 'DEBIT' ? entry.amount : -entry.amount);
    } else {
        increment = (entry.type === 'CREDIT' ? entry.amount : -entry.amount);
    }

    transaction.set(ledgerRef, {
        ...entry,
        timestamp: timestamp,
        createdAt: timestamp,
    });

    const accountRef = db.collection("accounts").doc(entry.account);
    transaction.set(accountRef, {
        balance: admin.firestore.FieldValue.increment(increment),
        lastUpdated: timestamp,
    }, { merge: true });
}

/**
 * Triggered when an order's PAYMENT status changes to 'PAID'.
 */
exports.onOrderPaidLedger = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after.data();
    const oldData = change.before.data();
    const orderId = context.params.orderId;

    if (!newData || !oldData) return null;

    if (newData.paymentStatus === 'PAID' && oldData.paymentStatus !== 'PAID') {
        try {
            await db.runTransaction(async (transaction) => {
                // 1. Check for duplicate ledger entries (READ)
                const existingEntries = await transaction.get(
                    db.collection("ledger")
                        .where("referenceId", "==", orderId)
                        .where("account", "==", "SALES")
                        .limit(1)
                );

                if (!existingEntries.empty) {
                    console.log(`Ledger entry already exists for Order: ${orderId}. Skipping.`);
                    return;
                }

                const totalAmount = newData.totalAmount || 0;
                const totalTax = newData.totalTax || 0;
                const netSales = totalAmount - totalTax;

                // 2. Post Ledger Entries (WRITES)
                postLedgerEntry(transaction, {
                    account: 'SALES',
                    type: 'CREDIT',
                    amount: netSales,
                    description: `Order #${orderId} Sales Revenue`,
                    referenceId: orderId,
                    metadata: { orderId }
                });

                if (totalTax > 0) {
                    postLedgerEntry(transaction, {
                        account: 'GST_PAYABLE',
                        type: 'CREDIT',
                        amount: totalTax,
                        description: `Order #${orderId} GST Component`,
                        referenceId: orderId,
                        metadata: { orderId }
                    });
                }

                const paymentMethod = newData.paymentMethod || 'CASH';
                const assetAccount = paymentMethod === 'WALLET' ? 'WALLET_BALANCE' : 'CASH_IN_HAND';

                postLedgerEntry(transaction, {
                    account: assetAccount,
                    type: 'DEBIT',
                    amount: totalAmount,
                    description: `Order #${orderId} Payment Received (${paymentMethod})`,
                    referenceId: orderId,
                    metadata: { orderId }
                });

                // 3. Update Product Stats (WRITES)
                const items = newData.items || [];
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                for (const item of items) {
                    const productId = item.productId;
                    const quantity = item.quantity || 1;

                    transaction.update(db.collection("products").doc(productId), {
                        salesCount: admin.firestore.FieldValue.increment(quantity)
                    });

                    const statId = `${productId}_${today.toISOString().split('T')[0]}`;
                    transaction.set(db.collection("sales_stats").doc(statId), {
                        productId,
                        date: admin.firestore.Timestamp.fromDate(today),
                        quantity: admin.firestore.FieldValue.increment(quantity)
                    }, { merge: true });
                }
            });
        } catch (error) {
            console.error("CRITICAL: Financial transaction failed for order:", orderId, error);
        }
    }
    return null;
});

/**
 * Triggered when a return status changes to 'COMPLETED'.
 */
exports.onReturnCompletedLedger = onDocumentUpdated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after.data();
    const oldData = change.before.data();
    const returnId = context.params.returnId;

    if (!newData || !oldData) return null;

    if (newData.status === 'COMPLETED' && oldData.status !== 'COMPLETED') {
        try {
            await db.runTransaction(async (transaction) => {
                const existingEntries = await transaction.get(
                    db.collection("ledger")
                        .where("referenceId", "==", returnId)
                        .where("account", "==", "SALES")
                        .limit(1)
                );

                if (!existingEntries.empty) {
                    console.log(`Ledger entry already exists for Return: ${returnId}. Skipping.`);
                    return;
                }

                const refundAmount = newData.refundAmount || 0;
                const orderId = newData.orderId;

                postLedgerEntry(transaction, {
                    account: 'SALES',
                    type: 'DEBIT',
                    amount: refundAmount,
                    description: `Return #${returnId} Refund (Order #${orderId})`,
                    referenceId: returnId,
                    metadata: { returnId, orderId }
                });

                const refundMethod = newData.refundMethod || 'WALLET';
                const assetAccount = refundMethod === 'WALLET' ? 'WALLET_BALANCE' : 'CASH_IN_HAND';

                postLedgerEntry(transaction, {
                    account: assetAccount,
                    type: 'CREDIT',
                    amount: refundAmount,
                    description: `Return #${returnId} Refund Payout`,
                    referenceId: returnId,
                    metadata: { returnId, orderId }
                });
            });
        } catch (error) {
            console.error("CRITICAL: Financial transaction failed for return:", returnId, error);
        }
    }
    return null;
});

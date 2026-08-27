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
 * Helper to post a double-entry ledger record.
 */
async function postLedgerEntry(entry) {
    const ledgerRef = db.collection("ledger").doc();
    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    batch.set(ledgerRef, {
        ...entry,
        timestamp: timestamp,
        createdAt: timestamp,
    });

    const accountRef = db.collection("accounts").doc(entry.account);
    batch.set(accountRef, {
        balance: admin.firestore.FieldValue.increment(entry.type === 'CREDIT' ? entry.amount : -entry.amount),
        lastUpdated: timestamp,
    }, { merge: true });

    return batch.commit();
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
        const existingEntries = await db.collection("ledger")
            .where("referenceId", "==", orderId)
            .where("account", "==", "SALES")
            .limit(1)
            .get();

        if (!existingEntries.empty) {
            console.log(`Ledger entry already exists for Order: ${orderId}. Skipping.`);
            return null;
        }

        const totalAmount = newData.totalAmount || 0;
        const totalTax = newData.totalTax || 0;
        const netSales = totalAmount - totalTax;

        try {
            await postLedgerEntry({
                account: 'SALES',
                type: 'CREDIT',
                amount: netSales,
                description: `Order #${orderId} Sales Revenue`,
                referenceId: orderId,
                metadata: { orderId }
            });

            if (totalTax > 0) {
                await postLedgerEntry({
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

            await postLedgerEntry({
                account: assetAccount,
                type: 'DEBIT',
                amount: totalAmount,
                description: `Order #${orderId} Payment Received (${paymentMethod})`,
                referenceId: orderId,
                metadata: { orderId }
            });

            const items = newData.items || [];
            const bulkWriter = db.bulkWriter();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const item of items) {
                const productId = item.productId;
                const quantity = item.quantity || 1;

                bulkWriter.update(db.collection("products").doc(productId), {
                    salesCount: admin.firestore.FieldValue.increment(quantity)
                });

                const statId = `${productId}_${today.toISOString().split('T')[0]}`;
                bulkWriter.set(db.collection("sales_stats").doc(statId), {
                    productId,
                    date: admin.firestore.Timestamp.fromDate(today),
                    quantity: admin.firestore.FieldValue.increment(quantity)
                }, { merge: true });
            }
            await bulkWriter.close();
        } catch (error) {
            console.error("Error posting ledger/stats for order:", error);
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
        const existingEntries = await db.collection("ledger")
            .where("referenceId", "==", returnId)
            .where("account", "==", "SALES")
            .limit(1)
            .get();

        if (!existingEntries.empty) {
            console.log(`Ledger entry already exists for Return: ${returnId}. Skipping.`);
            return null;
        }

        const refundAmount = newData.refundAmount || 0;
        const orderId = newData.orderId;

        try {
            await postLedgerEntry({
                account: 'SALES',
                type: 'DEBIT',
                amount: refundAmount,
                description: `Return #${returnId} Refund (Order #${orderId})`,
                referenceId: returnId,
                metadata: { returnId, orderId }
            });

            const refundMethod = newData.refundMethod || 'WALLET';
            const assetAccount = refundMethod === 'WALLET' ? 'WALLET_BALANCE' : 'CASH_IN_HAND';

            await postLedgerEntry({
                account: assetAccount,
                type: 'CREDIT',
                amount: refundAmount,
                description: `Return #${returnId} Refund Payout`,
                referenceId: returnId,
                metadata: { returnId, orderId }
            });
        } catch (error) {
            console.error("Error posting ledger for return:", error);
        }
    }
    return null;
});

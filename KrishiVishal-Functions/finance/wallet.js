const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { checkFeatureFlag } = require("../core/utils");

const walletService = require("./walletService");

const REGION = 'asia-south1';

/**
 * Rewired Standalone Wallet Payment Engine (System 2 GL Integrated)
 * Conforms to Rules 1-5:
 * - Reads before writes across multi-document transaction.
 * - Single atomic double-entry Journal Entry (Dr 2065 / Cr 2070).
 * - Full idempotent replay deduplication.
 * - Root `wallet_transactions` recording.
 */
async function payWithWalletHandler(data = {}, context = {}) {
    if (!context || !context.auth || !context.auth.uid) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }

    const { orderId } = data;
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
        throw new HttpsError('invalid-argument', 'Invalid orderId.');
    }

    const cleanOrderId = orderId.trim();
    const uid = context.auth.uid;

    try {
        const result = await db.runTransaction(async (transaction) => {
            // --- 1. ALL READS (Order validation must happen strictly before any writes) ---
            const orderRef = db.collection("orders").doc(cleanOrderId);
            const orderSnap = await transaction.get(orderRef);

            if (!orderSnap.exists) {
                const err = new Error("Order not found.");
                err.code = "ORDER_NOT_FOUND";
                throw err;
            }

            const orderData = orderSnap.data() || {};
            const orderTotal = Math.round(Number(orderData.totalAmount || 0) * 100) / 100;

            // 1. Authorization: Verify order ownership
            if (orderData.userId !== uid) {
                const err = new Error("You do not have permission to pay for this order.");
                err.code = "PERMISSION_DENIED";
                throw err;
            }

            // 2. Idempotency: Check if order already recorded as PAID
            if (orderData.paymentStatus === 'PAID') {
                return {
                    success: true,
                    alreadyProcessed: true,
                    orderId: cleanOrderId,
                    totalAmount: orderTotal,
                    walletTransactionId: orderData.walletTransactionId || null,
                    journalEntryId: orderData.journalEntryId || `JE_WALLET_ORDER_PAYMENT_${cleanOrderId}`,
                    message: "Order has already been paid (Idempotent replay)."
                };
            }

            // 3. Validation: Verify order status allows payment
            const payableStatuses = ['PLACED', 'PENDING', 'PAYMENT_PENDING', 'CONFIRMED'];
            if (!payableStatuses.includes(orderData.status)) {
                const err = new Error(`Order in ${orderData.status} status cannot be paid.`);
                err.code = "INVALID_ORDER_STATUS";
                throw err;
            }

            if (orderTotal <= 0) {
                const err = new Error(`Invalid order total amount: ₹${orderTotal}`);
                err.code = "INVALID_ORDER_AMOUNT";
                throw err;
            }

            // --- 2. DELEGATE TO WALLET SERVICE (System 2 GL + Balance Debit) ---
            // Contract Rules 1-5: Passes caller transaction `tx`.
            // Performs reads-before-writes, locked period check, balance floor check,
            // posts balanced Dr 2065 / Cr 2070 JE, and stages wallet balance & tx writes.
            const debitResult = await walletService.debitWallet({
                uid,
                amount: orderTotal,
                eventType: "ORDER_PAYMENT",
                entityId: cleanOrderId,
                description: `Order Payment for #${cleanOrderId}`,
                metadata: { orderId: cleanOrderId },
                idempotencyKey: `JE_WALLET_ORDER_PAYMENT_${cleanOrderId}`
            }, {
                tx: transaction,
                auth: context.auth
            });

            // --- 3. STAGE ORDER WRITES (Strictly after walletService reads & GL validation) ---
            transaction.update(orderRef, {
                paymentStatus: "PAID",
                paymentMethod: "WALLET",
                status: "CONFIRMED",
                walletTransactionId: debitResult.txId,
                journalEntryId: debitResult.journalEntryId,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                success: true,
                alreadyProcessed: Boolean(debitResult.alreadyProcessed),
                orderId: cleanOrderId,
                amount: orderTotal,
                balanceBefore: debitResult.balanceBefore,
                balanceAfter: debitResult.balanceAfter,
                txId: debitResult.txId,
                journalEntryId: debitResult.journalEntryId,
                message: debitResult.alreadyProcessed
                    ? "Order payment was previously processed (Idempotent replay)."
                    : "Payment successful via wallet."
            };
        });

        return result;
    } catch (error) {
        console.error("Wallet payment failed:", error);
        if (error.code === 'INSUFFICIENT_WALLET_BALANCE') {
            throw new HttpsError('failed-precondition', error.message);
        }
        if (error.code === 'FISCAL_PERIOD_LOCKED') {
            throw new HttpsError('failed-precondition', error.message);
        }
        if (error.code === 'PERMISSION_DENIED') {
            throw new HttpsError('permission-denied', error.message);
        }
        if (error.code === 'ORDER_NOT_FOUND' || error.message === 'Order not found.') {
            throw new HttpsError('not-found', error.message);
        }
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('failed-precondition', error.message || 'Wallet payment failed.');
    }
}

exports.payWithWallet = onCall({ region: REGION }, async (request) => {
    return await payWithWalletHandler(request.data || {}, { auth: request.auth });
});

exports.payWithWalletHandler = payWithWalletHandler;

exports.redeemWalletAtCheckout = onCall({ region: REGION }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { orderId, amountToRedeem } = request.data || {};
    const uid = request.auth.uid;

    if (!orderId || !amountToRedeem || amountToRedeem <= 0) {
        throw new HttpsError('invalid-argument', 'Invalid orderId or amountToRedeem.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection("users").doc(uid);
            const userSnap = await transaction.get(userRef);
            
            if (!userSnap.exists) throw new Error("User not found.");
            
            const walletBalance = userSnap.data().walletBalance || 0;
            if (amountToRedeem > walletBalance) {
                throw new Error("Insufficient wallet balance.");
            }

            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            
            if (!orderSnap.exists) throw new Error("Order not found.");
            
            const orderData = orderSnap.data();
            
            if (orderData.userId !== uid) throw new Error("Unauthorized.");
            
            if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(orderData.status)) {
                throw new Error("Cannot redeem wallet for this order status.");
            }

            // Deduct from wallet
            transaction.update(userRef, {
                walletBalance: admin.firestore.FieldValue.increment(-amountToRedeem)
            });

            // Adjust order amount (Assuming COD here, deducting from codAmount or totalAmount depending on schema)
            // For safety, we track walletRedeemed amount on the order
            transaction.update(orderRef, {
                walletRedeemed: admin.firestore.FieldValue.increment(amountToRedeem),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log transaction
            const txnRef = db.collection("wallet_transactions").doc();
            transaction.set(txnRef, {
                uid: uid,
                type: "REDEEMED_AT_CHECKOUT",
                amount: amountToRedeem,
                referenceOrderId: orderId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true };
    } catch (error) {
        console.error("Wallet redemption failed:", error);
        throw new HttpsError('failed-precondition', error.message);
    }
});

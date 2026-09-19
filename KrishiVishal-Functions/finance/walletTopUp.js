const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { razorpayKeySecret, razorpayKeyId, getSecretVal } = require("../core/secrets");

const REGION = 'asia-south1';

// ─────────────────────────────────────────────────────────────────────────────
// createWalletTopUpOrder
//   Step 1: Customer requests a top-up. We create a Razorpay Order
//   and return the orderId to the app so the SDK can open the payment sheet.
// ─────────────────────────────────────────────────────────────────────────────
exports.createWalletTopUpOrder = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { amount } = data; // Amount in INR (e.g. 500)
    if (typeof amount !== 'number' || amount < 10 || amount > 100000) {
        throw new HttpsError('invalid-argument', 'Amount must be between ₹10 and ₹1,00,000.');
    }

    const keyId = getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID');
    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new HttpsError('internal', 'Payment gateway not configured.');

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    // Create a pending top-up record for idempotency tracking
    const topUpRef = db.collection('wallet_topups').doc();
    const topUpId = topUpRef.id;

    const rzpOrder = await rzp.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        receipt: `wt_${topUpId}`,
        notes: {
            userId: context.auth.uid,
            topUpId: topUpId,
            type: 'WALLET_TOP_UP'
        }
    });

    // Persist pending top-up
    await topUpRef.set({
        id: topUpId,
        userId: context.auth.uid,
        amount: amount,
        razorpayOrderId: rzpOrder.id,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        razorpayOrderId: rzpOrder.id,
        topUpId: topUpId,
        amount: amount,
        keyId: keyId,
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyWalletTopUp
//   Step 2: After Razorpay payment, verify signature + atomically credit wallet.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyWalletTopUp = onCall({ region: REGION, secrets: [razorpayKeySecret] }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { topUpId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    if (!topUpId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new HttpsError('invalid-argument', 'Missing payment verification details.');
    }

    const keySecret = getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET');
    if (!keySecret) throw new HttpsError('internal', 'Payment gateway not configured.');

    // 1. Verify HMAC Signature
    const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(razorpaySignature))) {
        throw new HttpsError('invalid-argument', 'Payment signature verification failed.');
    }

    // 2. Fetch top-up doc
    const topUpRef = db.collection('wallet_topups').doc(topUpId);
    const topUpSnap = await topUpRef.get();

    if (!topUpSnap.exists) throw new HttpsError('not-found', 'Top-up record not found.');
    const topUpData = topUpSnap.data();

    // 3. Ownership check
    if (topUpData.userId !== context.auth.uid) {
        throw new HttpsError('permission-denied', 'Unauthorized top-up verification.');
    }

    // 4. Idempotency check
    if (topUpData.status === 'COMPLETED') {
        return { success: true, alreadyProcessed: true };
    }

    // 5. Verify Razorpay Order ID matches
    if (topUpData.razorpayOrderId !== razorpayOrderId) {
        throw new HttpsError('invalid-argument', 'Razorpay Order ID mismatch.');
    }

    const amount = topUpData.amount;

    // 6. Atomic wallet credit
    await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(context.auth.uid);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists) throw new Error('User not found.');

        // Credit wallet
        transaction.update(userRef, {
            walletBalance: admin.firestore.FieldValue.increment(amount),
            lastWalletTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Mark top-up as completed
        transaction.update(topUpRef, {
            status: 'COMPLETED',
            razorpayPaymentId: razorpayPaymentId,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Wallet history entry
        const historyRef = db.collection('users').doc(context.auth.uid)
            .collection('wallet_history').doc();
        transaction.set(historyRef, {
            id: historyRef.id,
            type: 'TOP_UP',
            amount: amount,
            razorpayPaymentId: razorpayPaymentId,
            razorpayOrderId: razorpayOrderId,
            description: 'Wallet recharge via Razorpay',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    console.log(`[verifyWalletTopUp] ₹${amount} credited to user: ${context.auth.uid}`);
    return { success: true, creditedAmount: amount };
});

// ─────────────────────────────────────────────────────────────────────────────
// adminAdjustWallet  (Admin-only)
//   Allows admin to manually credit/debit a customer's wallet (for goodwill,
//   corrections, etc.). Accessible from Admin Panel Customers > Wallet tab.
// ─────────────────────────────────────────────────────────────────────────────
exports.adminAdjustWallet = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    const { isAdminRequest } = require('../core/utils');
    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { userId, amount, type, reason } = data;
    // type: 'CREDIT' | 'DEBIT'
    if (!userId || typeof amount !== 'number' || amount <= 0) {
        throw new HttpsError('invalid-argument', 'userId and positive amount are required.');
    }
    if (!['CREDIT', 'DEBIT'].includes(type)) {
        throw new HttpsError('invalid-argument', 'type must be CREDIT or DEBIT.');
    }

    const delta = type === 'CREDIT' ? amount : -amount;

    await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new Error('User not found.');

        const currentBalance = userSnap.data().walletBalance || 0;
        if (type === 'DEBIT' && currentBalance < amount) {
            throw new Error(`Insufficient balance. Current: ₹${currentBalance}`);
        }

        transaction.update(userRef, {
            walletBalance: admin.firestore.FieldValue.increment(delta),
            lastWalletTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const historyRef = db.collection('users').doc(userId)
            .collection('wallet_history').doc();
        transaction.set(historyRef, {
            id: historyRef.id,
            type: type === 'CREDIT' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
            amount: amount,
            reason: reason || 'Admin adjustment',
            adjustedBy: context.auth.uid,
            description: `Admin ${type.toLowerCase()}: ${reason || ''}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    return { success: true, message: `Wallet ${type} of ₹${amount} completed.` };
});

// ─────────────────────────────────────────────────────────────────────────────
// getWalletHistory  (User-callable)
//   Paginated wallet transaction history for the customer app Wallet screen.
// ─────────────────────────────────────────────────────────────────────────────
exports.getWalletHistory = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = context.auth.uid;

    const [historySnap, txnSnap] = await Promise.all([
        db.collection('users').doc(uid).collection('wallet_history')
          .orderBy('timestamp', 'desc').limit(50).get(),
        db.collection('wallet_transactions')
          .where('uid', '==', uid)
          .orderBy('createdAt', 'desc').limit(50).get()
    ]);

    let transactions = [];
    
    historySnap.docs.forEach(doc => {
        const d = doc.data();
        transactions.push({
            id: doc.id,
            type: d.type,
            amount: d.amount,
            description: d.description || '',
            orderId: d.orderId || null,
            timestamp: d.timestamp?.toDate?.()?.getTime() || 0,
            isoString: d.timestamp?.toDate?.()?.toISOString() || null
        });
    });

    txnSnap.docs.forEach(doc => {
        const d = doc.data();
        let description = "";
        if (d.type === "REFERRAL_CREDIT" || d.type === "REFERRAL_SIGNUP_CREDIT") description = "Referral Reward";
        else if (d.type === "REFERRAL_REVERSAL") description = "Referral Reversal";
        else if (d.type === "REDEEMED_AT_CHECKOUT") description = "Wallet Redeemed at Checkout";

        transactions.push({
            id: doc.id,
            type: d.type,
            amount: d.amount,
            description: description,
            orderId: d.referenceOrderId || null,
            timestamp: d.createdAt?.toDate?.()?.getTime() || 0,
            isoString: d.createdAt?.toDate?.()?.toISOString() || null
        });
    });

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    transactions = transactions.slice(0, 50).map(t => {
        return {
            id: t.id,
            type: t.type,
            amount: t.amount,
            description: t.description,
            orderId: t.orderId,
            timestamp: t.isoString
        };
    });

    return { success: true, transactions };
});

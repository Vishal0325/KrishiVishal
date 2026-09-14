const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #94 & #103: Secure Finance Metrics aggregator.
 * Computes revenue, profit, and taxes on the server to ensure financial
 * data integrity and scalability for large order volumes.
 */
exports.getFinanceSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const db = admin.firestore();
  
  let isFinanceAuthorized = (
    context.auth.token.role === 'SuperAdmin' ||
    context.auth.token.role === 'FinanceAdmin' ||
    context.auth.token.isSuperAdmin === true
  );

  if (!isFinanceAuthorized) {
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data.role === 'SuperAdmin' || data.role === 'FinanceAdmin' || data.isAdmin === true || data.admin === true) {
        isFinanceAuthorized = true;
      }
    }
  }

  if (!isFinanceAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Only Finance Admin or SuperAdmin can access financial metrics.');
  }

  const { startDate, endDate } = data;

  try {
    let q = db.collection("orders");
    if (startDate) q = q.where("createdAt", ">=", new Date(startDate));
    if (endDate) q = q.where("createdAt", "<=", new Date(endDate));

    const ordersSnap = await q.get();

    let totalRevenue = 0;
    let grossProfit = 0;
    let gstCollected = 0;
    let orderCount = 0;

    ordersSnap.forEach(doc => {
      const o = doc.data();
      if (o.status !== 'CANCELLED') {
         totalRevenue += Number(o.totalAmount || 0);
         // Accurate profit from order metadata (Landing Cost vs Selling Price)
         grossProfit += Number(o.grossProfit || 0);
         gstCollected += (Number(o.cgst || 0) + Number(o.sgst || 0) + Number(o.igst || 0));
         orderCount++;
      }
    });

    // Fetch Expenses from ledger
    let lQ = db.collection("ledger").where("type", "==", "DEBIT");
    if (startDate) lQ = lQ.where("timestamp", ">=", new Date(startDate));
    if (endDate) lQ = lQ.where("timestamp", "<=", new Date(endDate));

    const ledgerSnap = await lQ.get();
    let totalExpenses = 0;
    ledgerSnap.forEach(doc => {
      totalExpenses += Number(doc.data().amount || 0);
    });

    return {
      success: true,
      summary: {
        totalRevenue: Math.round(totalRevenue),
        grossProfit: Math.round(grossProfit),
        netProfit: Math.round(grossProfit - totalExpenses),
        expenses: Math.round(totalExpenses),
        gstCollected: Math.round(gstCollected),
        orderCount,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    };
  } catch (error) {
    console.error("Finance Sync Error:", error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

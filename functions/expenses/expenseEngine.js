const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #120: Secure expense creation with server-side cross-verification of totals.
 * This prevents client-side manipulation of financial data.
 */
exports.saveExpense = functions.https.onCall(async (data, context) => {
  const isFinanceAuthorized = context.auth && (
    context.auth.token.role === 'SuperAdmin' ||
    context.auth.token.role === 'FinanceAdmin' ||
    context.auth.token.isSuperAdmin === true
  );

  if (!context.auth || !isFinanceAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Only Finance Admin or SuperAdmin can create or modify expenses.');
  }

  const { id, formData } = data;
  if (!formData.categoryId || !formData.subtotal) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  const db = admin.firestore();

  // 1. Cross-verify calculations on server
  const sub = parseFloat(formData.subtotal) || 0;
  const disc = parseFloat(formData.discount) || 0;
  const taxable = Math.max(0, sub - disc);

  let cgst = 0; let sgst = 0; let igst = 0;
  if (formData.taxType === 'GST') {
    cgst = (taxable * (parseFloat(formData.cgstRate) || 0)) / 100;
    sgst = (taxable * (parseFloat(formData.sgstRate) || 0)) / 100;
  } else if (formData.taxType === 'IGST') {
    igst = (taxable * (parseFloat(formData.igstRate) || 0)) / 100;
  }

  const other = parseFloat(formData.otherCharges) || 0;
  const off = parseFloat(formData.roundOff) || 0;
  const total = taxable + cgst + sgst + igst + other + off;

  const payload = {
    ...formData,
    // Store precise minor units (Paise)
    subtotalMinor: Math.round(sub * 100),
    discountMinor: Math.round(disc * 100),
    taxableAmountMinor: Math.round(taxable * 100),
    cgstMinor: Math.round(cgst * 100),
    sgstMinor: Math.round(sgst * 100),
    igstMinor: Math.round(igst * 100),
    otherChargesMinor: Math.round(other * 100),
    roundOffMinor: Math.round(off * 100),
    totalAmountMinor: Math.round(total * 100),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: context.auth.uid
  };

  try {
    if (id) {
      await db.collection('expenses').doc(id).update(payload);
      return { success: true, id };
    } else {
      // Handle atomic expense number generation for new records
      return await db.runTransaction(async (transaction) => {
        const counterRef = db.collection('counters').doc('expenses');
        const counterSnap = await transaction.get(counterRef);
        const year = new Date().getFullYear();
        let nextNumber = 1;

        if (counterSnap.exists()) {
          const cData = counterSnap.data();
          if (cData.year === year) nextNumber = (cData.count || 0) + 1;
        }

        transaction.set(counterRef, { year, count: nextNumber }, { merge: true });
        const expenseNumber = `EXP-${year}-${nextNumber.toString().padStart(5, '0')}`;

        const newDocRef = db.collection('expenses').doc();
        transaction.set(newDocRef, {
          ...payload,
          expenseNumber,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: context.auth.uid,
          approvalStatus: 'PENDING',
          paymentStatus: 'UNPAID',
          deleted: false
        });

        return { success: true, id: newDocRef.id, expenseNumber };
      });
    }
  } catch (error) {
    console.error('Save Expense Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

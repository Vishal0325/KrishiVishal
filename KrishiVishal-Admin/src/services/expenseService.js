import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase/config';

/**
 * Service for managing KrishiVishal Expenses
 */
export const expenseService = {
  // ... existing collections ...
  COLLECTIONS: {
    EXPENSES: 'expenses',
    CATEGORIES: 'expenseCategories',
    VENDORS: 'expenseVendors',
    PAYMENTS: 'expensePayments',
    AUDIT: 'expenseAuditLogs',
    BUDGETS: 'expenseBudgets'
  },

  // ... other methods ...

  // 3. Secure Payment Workflow via Cloud Function
  async recordPayment(id, paymentData, actorId) {
    const recordExpensePayment = httpsCallable(functions, 'recordExpensePayment');

    return await recordExpensePayment({
      type: 'GENERAL_EXPENSE',
      targetId: id,
      amount: paymentData.amountMinor / 100, // Function expects decimal amount
      method: paymentData.method,
      referenceId: paymentData.transactionId,
      description: paymentData.notes
    });
  },

  // ... rest of the code ...

  // 4. Attachments (Storage)
  async uploadAttachment(expenseId, file, documentType, actorId) {
    const fileId = `${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
    const storagePath = `expenses/${expenseId}/${fileId}`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      customMetadata: {
        uploadedBy: actorId,
        documentType
      }
    };

    await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(storageRef);

    const attachmentData = {
      id: fileId,
      fileName: file.name,
      storagePath,
      url,
      mimeType: file.type,
      size: file.size,
      documentType,
      uploadedBy: actorId,
      uploadedAt: new Date().toISOString()
    };

    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, expenseId);
    const snap = await getDoc(expenseRef);
    const attachments = snap.data().attachments || [];

    await updateDoc(expenseRef, {
      attachments: [...attachments, attachmentData],
      updatedAt: serverTimestamp()
    });

    return attachmentData;
  },

  async deleteAttachment(expenseId, attachmentId, actorId) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, expenseId);
    const snap = await getDoc(expenseRef);
    const attachments = snap.data().attachments || [];
    const attachment = attachments.find(a => a.id === attachmentId);

    if (!attachment) return;

    // Delete from Storage
    const storageRef = ref(storage, attachment.storagePath);
    await deleteObject(storageRef);

    // Remove from Firestore list
    await updateDoc(expenseRef, {
      attachments: attachments.filter(a => a.id !== attachmentId),
      updatedAt: serverTimestamp()
    });
  },

  // 5. Category/Vendor/Budget helpers
  async getCategories() {
    const q = query(collection(db, this.COLLECTIONS.CATEGORIES), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getVendors() {
    const q = query(collection(db, this.COLLECTIONS.VENDORS), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // 6. Budget Tracking
  async getCategoryBudget(categoryId, month, year) {
    const budgetId = `${categoryId}_${month}_${year}`;
    const snap = await getDoc(doc(db, this.COLLECTIONS.BUDGETS, budgetId));
    if (!snap.exists()) return null;

    const budget = snap.data();

    // Calculate spent
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const q = query(
      collection(db, this.COLLECTIONS.EXPENSES),
      where('categoryId', '==', categoryId),
      where('expenseDate', '>=', startOfMonth),
      where('expenseDate', '<=', endOfMonth),
      where('deleted', '==', false)
    );

    const expensesSnap = await getDocs(q);
    const totalSpentMinor = expensesSnap.docs.reduce((sum, d) => sum + (d.data().totalAmountMinor || 0), 0);

    return {
      ...budget,
      spentMinor: totalSpentMinor,
      remainingMinor: (budget.amountMinor || 0) - totalSpentMinor
    };
  },

  // Private helpers
  async _generateExpenseNumber() {
    const year = new Date().getFullYear();
    const q = query(
      collection(db, this.COLLECTIONS.EXPENSES),
      where('createdAt', '>=', Timestamp.fromDate(new Date(year, 0, 1))),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    let count = 1;
    if (!snap.empty) {
      const lastNum = snap.docs[0].data().expenseNumber;
      if (lastNum && lastNum.startsWith(`EXP-${year}`)) {
        count = parseInt(lastNum.split('-')[2]) + 1;
      }
    }
    return `EXP-${year}-${count.toString().padStart(5, '0')}`;
  }
};

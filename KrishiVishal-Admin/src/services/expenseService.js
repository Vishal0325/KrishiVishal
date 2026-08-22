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
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase/config';

/**
 * Service for managing KrishiVishal Expenses
 */
export const expenseService = {
  // Collections
  COLLECTIONS: {
    EXPENSES: 'expenses',
    CATEGORIES: 'expenseCategories',
    VENDORS: 'expenseVendors',
    PAYMENTS: 'expensePayments',
    AUDIT: 'audit_logs', // Standardized snake_case
    BUDGETS: 'expenseBudgets',
    COUNTERS: 'counters'
  },

  // 1. Core Expense CRUD with Race-Condition Protection (Atomic Counters)
  async createExpense(expenseData, actorId) {
    const year = new Date().getFullYear();
    const counterRef = doc(db, this.COLLECTIONS.COUNTERS, `expenses_${year}`);

    return await runTransaction(db, async (transaction) => {
      // 1a. Locking Read of sequential counter
      const counterSnap = await transaction.get(counterRef);
      let nextId = 1;
      if (counterSnap.exists()) {
        nextId = (counterSnap.data().lastNumber || 0) + 1;
      }

      const expenseNumber = `EXP-${year}-${nextId.toString().padStart(5, '0')}`;
      const expenseRef = doc(collection(db, this.COLLECTIONS.EXPENSES));

      const data = {
        ...expenseData,
        expenseNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actorId,
        approvalStatus: expenseData.approvalStatus || 'PENDING',
        paymentStatus: expenseData.paymentStatus || 'UNPAID',
        deleted: false
      };

      // 1b. Atomic set of both data and counter
      transaction.set(expenseRef, data);
      transaction.set(counterRef, { lastNumber: nextId }, { merge: true });

      // 1c. Initial Audit Log
      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'CREATE_EXPENSE',
        actorId,
        targetId: expenseRef.id,
        targetType: 'EXPENSE',
        timestamp: serverTimestamp(),
        after: data
      });

      return expenseRef.id;
    });
  },

  async updateExpense(id, updates, actorId) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, id);
    const snap = await getDoc(expenseRef);
    if (!snap.exists()) throw new Error("Record not found");
    const before = snap.data();

    await runTransaction(db, async (transaction) => {
      transaction.update(expenseRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'UPDATE_EXPENSE',
        actorId,
        targetId: id,
        targetType: 'EXPENSE',
        timestamp: serverTimestamp(),
        before,
        after: { ...before, ...updates }
      });
    });
  },

  async deleteExpense(id, actorId) {
    // Soft delete implementation
    await this.updateExpense(id, {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: actorId
    }, actorId);
  },

  // 2. Approval Workflow
  async approveExpense(id, actorId, comment = "") {
    await this.updateExpense(id, {
      approvalStatus: 'APPROVED',
      approvedBy: actorId,
      approvedAt: serverTimestamp(),
      approvalComment: comment
    }, actorId);
  },

  async rejectExpense(id, actorId, reason) {
    if (!reason) throw new Error("Rejection reason is required");
    await this.updateExpense(id, {
      approvalStatus: 'REJECTED',
      rejectedBy: actorId,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason
    }, actorId);
  },

  // 3. Secure Payment Workflow via Cloud Function
  async recordPayment(id, paymentData, actorId) {
    const recordExpensePayment = httpsCallable(functions, 'recordExpensePayment');

    return await recordExpensePayment({
      type: 'GENERAL_EXPENSE',
      targetId: id,
      amount: paymentData.amountMinor / 100,
      method: paymentData.method,
      referenceId: paymentData.transactionId,
      description: paymentData.notes
    });
  },

  // 4. Attachments (Storage)
  async uploadAttachment(expenseId, file, documentType, actorId) {
    const fileId = `${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
    const storagePath = `expenses/${expenseId}/${fileId}`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      customMetadata: { uploadedBy: actorId, documentType }
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

    await updateDoc(expenseRef, {
      attachments: arrayUnion(attachmentData),
      updatedAt: serverTimestamp()
    });

    return attachmentData;
  },

  async deleteAttachment(expenseId, attachmentId, actorId) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, expenseId);

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(expenseRef);
      if (!snap.exists()) return;

      const attachments = snap.data().attachments || [];
      const attachment = attachments.find(a => a.id === attachmentId);
      if (!attachment) return;

      // 1. Delete from Storage (Outside transaction logic but inside this method)
      // Note: If storage delete fails, transaction shouldn't commit or vice versa?
      // Usually better to delete storage first, then firestore.
      const storageRef = ref(storage, attachment.storagePath);
      await deleteObject(storageRef);

      // 2. Atomic removal from array
      transaction.update(expenseRef, {
        attachments: attachments.filter(a => a.id !== attachmentId),
        updatedAt: serverTimestamp()
      });
    });
  },

  // 5. Helpers
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
  }
};

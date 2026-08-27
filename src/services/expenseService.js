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
import { db, storage } from '../firebase/config';

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
    AUDIT: 'expenseAuditLogs',
    BUDGETS: 'expenseBudgets'
  },

  // 1. Core Expense CRUD
  async createExpense(expenseData, actorId) {
    const nextNumber = await this._generateExpenseNumber();

    return await runTransaction(db, async (transaction) => {
      const expenseRef = doc(collection(db, this.COLLECTIONS.EXPENSES));
      const data = {
        ...expenseData,
        expenseNumber: nextNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actorId,
        approvalStatus: expenseData.approvalStatus || 'PENDING',
        paymentStatus: expenseData.paymentStatus || 'UNPAID',
        deleted: false
      };

      transaction.set(expenseRef, data);

      // Initial Audit Log
      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'CREATE_EXPENSE',
        entityId: expenseRef.id,
        entityType: 'EXPENSE',
        performedBy: actorId,
        performedAt: serverTimestamp(),
        after: data
      });

      return expenseRef.id;
    });
  },

  async updateExpense(id, updates, actorId) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, id);
    const snap = await getDoc(expenseRef);
    const before = snap.data();

    await runTransaction(db, async (transaction) => {
      transaction.update(expenseRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'UPDATE_EXPENSE',
        entityId: id,
        entityType: 'EXPENSE',
        performedBy: actorId,
        performedAt: serverTimestamp(),
        before,
        after: { ...before, ...updates }
      });
    });
  },

  async deleteExpense(id, actorId) {
    // Soft delete
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

  // 3. Payment Workflow
  async recordPayment(id, paymentData, actorId) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, id);

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(expenseRef);
      if (!snap.exists()) throw new Error("Expense not found");
      const expense = snap.data();

      const newPaidAmount = (expense.paidAmountMinor || 0) + (paymentData.amountMinor || 0);
      if (newPaidAmount > expense.totalAmountMinor) {
        throw new Error("Payment exceeds total expense amount");
      }

      const status = newPaidAmount === expense.totalAmountMinor ? 'PAID' : 'PARTIALLY_PAID';

      transaction.update(expenseRef, {
        paidAmountMinor: newPaidAmount,
        paymentStatus: status,
        updatedAt: serverTimestamp()
      });

      const paymentRef = doc(collection(db, this.COLLECTIONS.PAYMENTS));
      transaction.set(paymentRef, {
        ...paymentData,
        expenseId: id,
        createdBy: actorId,
        createdAt: serverTimestamp()
      });

      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'ADD_PAYMENT',
        entityId: id,
        entityType: 'EXPENSE',
        performedBy: actorId,
        performedAt: serverTimestamp(),
        metadata: { paymentId: paymentRef.id, amount: paymentData.amountMinor }
      });
    });
  },

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

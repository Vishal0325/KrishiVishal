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
    // [FIXED] Point #146: Basic schema validation before writing to Firestore
    if (!expenseData.categoryId || !expenseData.description || !expenseData.subtotalMinor) {
      throw new Error("Invalid expense data: Missing required fields (category, description, amount).");
    }

    return await runTransaction(db, async (transaction) => {
      // 1. Get next expense number atomically
      const counterRef = doc(db, 'counters', 'expenses');
      const counterSnap = await transaction.get(counterRef);
      const year = new Date().getFullYear();
      let nextNumber = 1;

      if (counterSnap.exists()) {
        const data = counterSnap.data();
        if (data.year === year) {
          nextNumber = (data.count || 0) + 1;
        }
      }

      transaction.set(counterRef, { year, count: nextNumber }, { merge: true });
      const expenseNumber = `EXP-${year}-${nextNumber.toString().padStart(5, '0')}`;

      const expenseRef = doc(collection(db, this.COLLECTIONS.EXPENSES));
      const data = {
        ...expenseData,
        expenseNumber: expenseNumber,
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
  async recordPayment(id, paymentData, actorContext) {
    const expenseRef = doc(db, this.COLLECTIONS.EXPENSES, id);
    const actorId = typeof actorContext === 'object' ? actorContext.uid : actorContext;
    const actorEmail = typeof actorContext === 'object' ? actorContext.email : 'unknown';
    const actorName = typeof actorContext === 'object' ? actorContext.name : 'Admin';
    const actorRole = typeof actorContext === 'object' ? actorContext.role : 'Admin';

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(expenseRef);
      if (!snap.exists()) throw new Error("Expense not found");
      const expense = snap.data();

      // [FIXED] Point #163: Validate expense amount exists and is positive
      if (!expense.totalAmountMinor || expense.totalAmountMinor <= 0) {
        throw new Error("Invalid expense total amount: must be greater than 0");
      }
      if (!paymentData.amountMinor || paymentData.amountMinor <= 0) {
        throw new Error("Invalid payment amount: must be greater than 0");
      }

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
        actorEmail: actorEmail,
        actorName: actorName,
        actorRole: actorRole,
        createdAt: serverTimestamp()
      });

      // [FEATURE: SYNC WITH FINANCE LEDGER]
      // Any payment made towards an expense must be reflected in the central ledger
      const ledgerRef = doc(collection(db, 'ledger'));
      transaction.set(ledgerRef, {
        account: expense.categoryName || expense.categoryId || 'GENERAL_EXPENSE',
        type: 'DEBIT',
        amount: Number(paymentData.amountMinor) / 100, // Assuming amountMinor is in paise/cents
        description: `Expense Payment: ${expense.expenseNumber || ''} - ${expense.description || ''}`,
        timestamp: serverTimestamp(),
        actorId: actorId,
        actorEmail: actorEmail,
        actorName: actorName,
        actorRole: actorRole,
        referenceId: id // Link to expense
      });

      const auditRef = doc(collection(db, this.COLLECTIONS.AUDIT));
      transaction.set(auditRef, {
        action: 'ADD_PAYMENT',
        entityId: id,
        entityType: 'EXPENSE',
        performedBy: actorId,
        performedByName: actorName,
        performedByRole: actorRole,
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
  // (Removed _generateExpenseNumber to prevent race conditions. Counter logic moved inside runTransaction)
};

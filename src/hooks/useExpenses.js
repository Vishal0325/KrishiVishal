import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  startAt,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Hook for fetching KrishiVishal Expenses with filters
 */
export function useExpenses(filters = {}) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    let q = query(collection(db, 'expenses'), where('deleted', '==', false));

    // Apply Approval Status Filter
    if (filters.approvalStatus && filters.approvalStatus !== 'ALL') {
      q = query(q, where('approvalStatus', '==', filters.approvalStatus));
    }

    // Apply Payment Status Filter
    if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
      q = query(q, where('paymentStatus', '==', filters.paymentStatus));
    }

    // Apply Category Filter
    if (filters.categoryId && filters.categoryId !== 'ALL') {
      q = query(q, where('categoryId', '==', filters.categoryId));
    }

    // Apply Vendor Filter
    if (filters.vendorId && filters.vendorId !== 'ALL') {
      q = query(q, where('vendorId', '==', filters.vendorId));
    }

    // Apply Date Range Filter
    if (filters.dateRange && filters.dateRange.start && filters.dateRange.end) {
      const start = Timestamp.fromDate(new Date(filters.dateRange.start));
      const end = Timestamp.fromDate(new Date(filters.dateRange.end));
      q = query(q, where('expenseDate', '>=', start), where('expenseDate', '<=', end));
    }

    // Default Sorting
    q = query(q, orderBy(filters.sortBy || 'createdAt', filters.sortOrder || 'desc'));

    // Apply Limit (Pagination logic would use startAfter/endBefore)
    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExpenses(data);
        setLoading(false);
      },
      (err) => {
        console.error("useExpenses Error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [JSON.stringify(filters)]);

  return { expenses, loading, error };
}

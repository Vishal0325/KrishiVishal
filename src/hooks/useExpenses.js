import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
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
    let q = query(collection(db, 'expenses'));

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
    try {
      q = query(q, orderBy(filters.sortBy || 'createdAt', filters.sortOrder || 'desc'));
    } catch (e) {
      console.warn("orderBy query failed, sorting client-side:", e);
    }

    // Apply Limit (Pagination logic would use startAfter/endBefore)
    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const processDocs = (docs) => {
      let data = docs
        .map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            approvalStatus: d.approvalStatus || 'PENDING',
            paymentStatus: d.paymentStatus || 'UNPAID',
            ...d
          };
        })
        .filter(e => e.deleted !== true);

      // In-memory sort by createdAt desc if not already sorted
      data.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt || 0).getTime());
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt || 0).getTime());
        return tB - tA;
      });

      return data;
    };

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        setExpenses(processDocs(snapshot.docs));
        setLoading(false);
      },
      (err) => {
        console.warn("useExpenses query error (falling back to simple fetch):", err.message);
        // Fallback for missing composite indexes: fetch collection directly
        getDocs(collection(db, 'expenses')).then(snap => {
          setExpenses(processDocs(snap.docs));
          setLoading(false);
        }).catch(fallbackErr => {
          console.error("useExpenses Fallback Error:", fallbackErr);
          setError(err.message);
          setLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, [JSON.stringify(filters)]);

  return { expenses, loading, error };
}

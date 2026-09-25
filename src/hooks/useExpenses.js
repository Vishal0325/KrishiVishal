import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs
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
    setError(null);

    // Primary query ordered by createdAt
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Exclude soft-deleted items safely
        data = data.filter((e) => e.deleted !== true);

        // Apply In-Memory Filters
        if (filters.approvalStatus && filters.approvalStatus !== 'ALL') {
          data = data.filter((e) => (e.approvalStatus || 'PENDING') === filters.approvalStatus);
        }

        if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
          data = data.filter((e) => (e.paymentStatus || 'UNPAID') === filters.paymentStatus);
        }

        if (filters.categoryId && filters.categoryId !== 'ALL') {
          data = data.filter((e) => e.categoryId === filters.categoryId || e.category === filters.categoryId);
        }

        if (filters.vendorId && filters.vendorId !== 'ALL') {
          data = data.filter((e) => e.vendorId === filters.vendorId || e.vendorName === filters.vendorId);
        }

        if (filters.dateRange && filters.dateRange.start && filters.dateRange.end) {
          const start = new Date(filters.dateRange.start).getTime();
          const end = new Date(filters.dateRange.end).getTime();
          data = data.filter((e) => {
            const d = e.expenseDate?.toDate ? e.expenseDate.toDate().getTime() : (e.createdAt?.toDate ? e.createdAt.toDate().getTime() : 0);
            return d >= start && d <= end;
          });
        }

        setExpenses(data);
        setLoading(false);
      },
      (err) => {
        console.warn("useExpenses orderBy query fallback:", err.message);
        // Fallback fetch all expenses without orderBy
        getDocs(collection(db, 'expenses'))
          .then((snap) => {
            let data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            data = data.filter((e) => e.deleted !== true);
            data.sort((a, b) => {
              const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return db - da;
            });
            setExpenses(data);
          })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false));
      }
    );

    return () => unsubscribe();
  }, [JSON.stringify(filters)]);

  return { expenses, loading, error };
}


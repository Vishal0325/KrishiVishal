import { useState, useEffect } from 'react';
import { expenseService } from '../services/expenseService';

/**
 * Hook for fetching Categories and Vendors for Expense Form
 */
export function useExpenseData() {
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [catData, vendData] = await Promise.all([
          expenseService.getCategories(),
          expenseService.getVendors()
        ]);
        setCategories(catData);
        setVendors(vendData);
      } catch (err) {
        console.error("useExpenseData Error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return { categories, vendors, loading };
}

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useProducts(pageSize = 50) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(pageSize));

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const productList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productList);
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMore(snapshot.docs.length === pageSize);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching products:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [pageSize]);

  const fetchMore = async () => {
    if (!lastDoc || !hasMore) return;
    try {
      const q = query(
        collection(db, 'products'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
      const snapshot = await getDocs(q);
      const moreProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(prev => [...prev, ...moreProducts]);
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(snapshot.docs.length === pageSize);
    } catch (err) {
      console.error("Error fetching more products:", err);
    }
  };

  return { products, loading, error, fetchMore, hasMore };
}

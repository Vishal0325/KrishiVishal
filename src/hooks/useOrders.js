import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useOrders(status = 'All', pageSize = 50) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(pageSize));

    if (status !== 'All') {
      q = query(collection(db, 'orders'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(pageSize));
    }

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMore(snapshot.docs.length === pageSize);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [status, pageSize]);

  const fetchMore = async () => {
    if (!lastDoc || !hasMore) return;
    try {
      let q = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
      if (status !== 'All') {
        q = query(collection(db, 'orders'), where('status', '==', status), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
      }
      
      const snapshot = await getDocs(q);
      const moreOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(prev => [...prev, ...moreOrders]);
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(snapshot.docs.length === pageSize);
    } catch (err) {
      console.error("Error fetching more orders:", err);
    }
  };

  return { orders, loading, error, fetchMore, hasMore };
}

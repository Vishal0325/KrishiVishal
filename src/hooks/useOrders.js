import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useOrders(status = 'All') {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

    if (status !== 'All') {
      q = query(collection(db, 'orders'), where('status', '==', status), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [status]);

  return { orders, loading, error };
}

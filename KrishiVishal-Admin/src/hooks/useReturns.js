import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';

export function useReturns(status = 'All') {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, 'returns'), orderBy('createdAt', 'desc'));
    if (status !== 'All') {
      q = query(collection(db, 'returns'), where('status', '==', status), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReturns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, [status]);

  const updateReturnStatus = async (returnId, newStatus, notes = '', riderId = null, qcStatus = null) => {
    try {
      const updates = {
        status: newStatus,
        adminNotes: notes,
        updatedAt: Timestamp.now()
      };

      if (riderId) {
        updates.riderId = riderId;
      }
      if (qcStatus) {
        updates.qcStatus = qcStatus;
      }

      await updateDoc(doc(db, 'returns', returnId), updates);
      toast.success(`Return updated successfully`);
    } catch (error) {
      toast.error('Failed to update return');
    }
  };

  return { returns, loading, updateReturnStatus };
}

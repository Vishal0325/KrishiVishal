import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthContext } from './useAuthContext';
import toast from 'react-hot-toast';

export function useReturns(status = 'All', hubFilter = null) {
  const { isHubScoped, hubId } = useAuthContext();
  const effectiveHub = hubFilter || (isHubScoped ? hubId : null);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (effectiveHub) {
      if (status !== 'All') {
        q = query(collection(db, 'returns'), where('warehouseId', '==', effectiveHub), where('status', '==', status));
      } else {
        q = query(collection(db, 'returns'), where('warehouseId', '==', effectiveHub));
      }
    } else {
      if (status !== 'All') {
        q = query(collection(db, 'returns'), where('status', '==', status), orderBy('createdAt', 'desc'));
      } else {
        q = query(collection(db, 'returns'), orderBy('createdAt', 'desc'));
      }
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (effectiveHub) {
        list.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return timeB - timeA;
        });
      }
      setReturns(list);
      setLoading(false);
    }, (err) => {
      console.error("Returns query error:", err);
      setLoading(false);
    });
    return unsubscribe;
  }, [status, effectiveHub]);

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

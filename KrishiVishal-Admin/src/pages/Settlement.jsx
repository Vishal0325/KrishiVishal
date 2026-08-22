import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Wallet, CheckCircle, TrendingUp, AlertTriangle, Users, Truck, Clock, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/common/DataTable';

const Settlement = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState({});

  useEffect(() => {
    // Listen to all orders assigned to riders
    const q = query(
      collection(db, 'orders'),
      where('riderId', '!=', '')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubRiders = onSnapshot(collection(db, 'riders'), (snapshot) => {
      const riderMap = {};
      snapshot.forEach(doc => {
        riderMap[doc.id] = doc.data().name || doc.id;
      });
      setRiders(riderMap);
    });

    return () => { unsubscribe(); unsubRiders(); };
  }, []);

  const ledgers = useMemo(() => {
    const map = new Map();

    orders.forEach(order => {
      if (!order.riderId) return;

      if (!map.has(order.riderId)) {
        map.set(order.riderId, {
          riderId: order.riderId,
          totalCashCollected: 0,
          settledCash: 0,
          pendingCash: 0,
          pendingOrderIds: [],
          activeOrders: 0,
          deliveredToday: 0
        });
      }

      const ledger = map.get(order.riderId);

      if (order.status === 'DELIVERED') {
        ledger.deliveredToday += 1;
        if (order.isCOD) {
          const amt = (order.codAmount || order.totalAmount || 0);
          ledger.totalCashCollected += amt;
          if (order.isSettledByAdmin) {
            ledger.settledCash += amt;
          } else {
            ledger.pendingCash += amt;
            ledger.pendingOrderIds.push(order.id);
          }
        }
      } else if (['ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
        ledger.activeOrders += 1;
      }
    });

    return Array.from(map.values());
  }, [orders]);

  const handleSettle = async (riderId, pendingOrderIds) => {
    if (pendingOrderIds.length === 0) return;
    if (!window.confirm('Settle this amount with rider?')) return;

    try {
      const batch = writeBatch(db);
      pendingOrderIds.forEach(orderId => {
        batch.update(doc(db, 'orders', orderId), { isSettledByAdmin: true });
      });
      await batch.commit();
      toast.success('Cash settled successfully');
    } catch (error) {
      toast.error('Settlement failed');
    }
  };

  const columns = [
    { header: 'Rider Info', render: (l) => (
      <div className="flex flex-col">
        <span className="font-black text-gray-900 tracking-tight">{riders[l.riderId] || l.riderId}</span>
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">ID: {l.riderId.slice(0, 8)}</span>
      </div>
    )},
    { header: 'Current Trip', render: (l) => (
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1" title="Delivered Today">
          <CheckCircle size={14} className="text-green-500" />
          <span className="font-bold text-gray-700 text-xs">{l.deliveredToday}</span>
        </div>
        <div className="flex items-center space-x-1" title="Pending Delivery">
          <Truck size={14} className="text-blue-500" />
          <span className="font-bold text-gray-700 text-xs">{l.activeOrders}</span>
        </div>
      </div>
    )},
    { header: 'Cash Collected', render: (l) => (
      <div className="flex flex-col">
        <span className="font-bold text-gray-900">₹{l.totalCashCollected}</span>
        <span className="text-[9px] text-gray-400 font-medium uppercase tracking-tighter italic">Lifetime</span>
      </div>
    )},
    { header: 'Cash in Hand', render: (l) => (
      <div className="flex items-center space-x-2 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100 w-fit">
        <IndianRupee size={12} className="text-orange-600" />
        <span className="text-orange-700 font-black tracking-tight">₹{l.pendingCash}</span>
      </div>
    )},
    { header: 'Action', render: (l) => (
      <button
        disabled={l.pendingCash === 0}
        onClick={() => handleSettle(l.riderId, l.pendingOrderIds)}
        className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
          l.pendingCash === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary text-white shadow-xl shadow-green-100 hover:bg-primary-dark hover:-translate-y-0.5'
        }`}
      >
        {l.pendingCash === 0 ? 'Settled' : 'Collect Cash'}
      </button>
    )}
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Wallet className="mr-3 text-primary" size={28} />
          COD Settlement Desk
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Manage rider cash collections</p>
      </div>

      <DataTable columns={columns} data={ledgers} loading={loading} />
    </div>
  );
};

export default Settlement;

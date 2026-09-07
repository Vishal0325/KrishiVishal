import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, where, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Wallet, Search, CheckCircle, Clock, User, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';

const CashRecon = () => {
  const [riders, setRiders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const ridersSnap = await getDocs(collection(db, 'riders'));
      const ordersSnap = await getDocs(query(collection(db, 'orders'), where('isCOD', '==', true)));

      const ridersData = ridersSnap.docs.map(riderDoc => {
        const riderId = riderDoc.id;
        const rider = riderDoc.data();
        const riderOrders = ordersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(o => o.riderId === riderId && o.status === 'DELIVERED');

        const collected = riderOrders.reduce((sum, o) => sum + (o.codAmount || o.totalAmount || 0), 0);
        const verified = riderOrders
          .filter(o => o.verifiedByAdmin === true || o.isCashDeposited === true)
          .reduce((sum, o) => sum + (o.codAmount || o.totalAmount || 0), 0);

        return {
          id: riderId,
          name: rider.name || 'Unknown Rider',
          warehouseId: rider.warehouseId || null,
          collectedCash: collected,
          verifiedCash: verified,
          pendingDeposit: collected - verified,
        };
      });

      setRiders(ridersData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Listen to cash deposits
    const qDeposits = query(collection(db, 'cash_deposits'), orderBy('timestamp', 'desc'));
    const unsubDeposits = onSnapshot(qDeposits, (snapshot) => {
      setDeposits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    fetchSummaries();
    return () => unsubDeposits();
  }, []);

  const handleVerify = async (deposit) => {
    try {
      await updateDoc(doc(db, 'cash_deposits', deposit.id), {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: 'Super Admin'
      });

      // Update associated orders
      const q = query(collection(db, 'orders'),
        where('riderId', '==', deposit.riderId),
        where('status', '==', 'DELIVERED')
      );
      const ordersSnap = await getDocs(q);
      const batchPromises = ordersSnap.docs.map(d =>
        updateDoc(doc(db, 'orders', d.id), { verifiedByAdmin: true, isCashDeposited: true, verifiedAt: new Date() })
      );
      await Promise.all(batchPromises);

      toast.success("Deposit verified & orders cleared");
      fetchSummaries();
    } catch (error) {
      toast.error("Verification failed");
    }
  };

  const handleSettleCash = async (rider) => {
    if (rider.pendingDeposit <= 0) return;
    if (!window.confirm(`Are you sure you want to manually settle ₹${rider.pendingDeposit.toLocaleString()} for ${rider.name}?`)) return;

    try {
      const batch = writeBatch(db);

      // 1. Create a VERIFIED deposit
      const depositRef = doc(collection(db, 'cash_deposits'));
      batch.set(depositRef, {
        riderId: rider.id,
        warehouseId: rider.warehouseId || 'WH-PURNEA-01',
        amount: rider.pendingDeposit,
        status: 'VERIFIED',
        timestamp: new Date().getTime(),
        verifiedAt: new Date(),
        verifiedBy: 'Super Admin',
        source: 'ADMIN_MANUAL_SETTLEMENT'
      });

      // 2. Update all associated pending COD orders
      const q = query(collection(db, 'orders'),
        where('riderId', '==', rider.id),
        where('status', '==', 'DELIVERED'),
        where('isCOD', '==', true)
      );
      
      const ordersSnap = await getDocs(q);
      let updatedCount = 0;
      
      ordersSnap.docs.forEach(d => {
        const order = d.data();
        if (!order.verifiedByAdmin && !order.isCashDeposited) {
           batch.update(doc(db, 'orders', d.id), { 
             verifiedByAdmin: true, 
             isCashDeposited: true,
             verifiedAt: new Date() 
           });
           updatedCount++;
        }
      });

      if (updatedCount === 0) {
          toast.error("No pending COD orders found for this rider to settle.");
          return;
      }

      await batch.commit();

      toast.success(`Successfully settled ₹${rider.pendingDeposit.toLocaleString()} for ${rider.name}`);
      fetchSummaries(); 
    } catch (error) {
      console.error(error);
      toast.error("Cash settlement failed");
    }
  };

  const columns = [
    { header: 'Rider', render: (r) => <span className="font-bold text-gray-900">{r.name}</span> },
    { header: 'Collected', render: (r) => <span className="text-gray-500 font-bold">₹{r.collectedCash.toLocaleString()}</span> },
    { header: 'Verified', render: (r) => <span className="text-green-600 font-black">₹{r.verifiedCash.toLocaleString()}</span> },
    { header: 'Due Amount', render: (r) => (
        <span className={`font-black ${r.pendingDeposit > 0 ? 'text-orange-600 animate-pulse' : 'text-gray-300'}`}>
            ₹{r.pendingDeposit.toLocaleString()}
        </span>
    )},
    { header: 'Status / Action', render: (r) => (
      <div className="flex items-center space-x-3">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${r.pendingDeposit <= 0 ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
          {r.pendingDeposit <= 0 ? 'CLEARED' : 'DUE'}
        </span>
        {r.pendingDeposit > 0 && (
          <button
            onClick={() => handleSettleCash(r)}
            className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-black shadow hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            Settle Cash
          </button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="COD Cash Reconciliation ERP"
        subtitle="Track collected COD cash, verify rider bank/office deposit slips, and clear outstanding fleet balances."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Fleet Balances</h3>
                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="pl-11 pr-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold w-48 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <DataTable columns={columns} data={riders.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))} loading={loading} />
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center">
                    <Clock size={18} className="mr-2 text-orange-500" />
                    Incoming Slips
                </h3>
                <div className="space-y-4">
                    {deposits.length === 0 ? (
                        <div className="text-center py-10 text-gray-300 font-bold uppercase text-[10px]">No recent activity</div>
                    ) : deposits.slice(0, 5).map(d => (
                        <div key={d.id} className={`p-5 rounded-3xl border-2 transition-all ${d.status === 'VERIFIED' ? 'border-green-100 bg-green-50/20' : 'border-orange-100 bg-orange-50/20'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                                    {new Date(d.timestamp).toLocaleDateString()}
                                </span>
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${d.status === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {d.status}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-2xl font-black text-gray-900">₹{d.amount}</p>
                                    <p className="text-[10px] font-bold text-gray-500 flex items-center mt-1">
                                        <User size={10} className="mr-1" /> {riders.find(r => r.id === d.riderId)?.name || 'Rider'}
                                    </p>
                                </div>
                                {d.status !== 'VERIFIED' && (
                                    <button
                                        onClick={() => handleVerify(d)}
                                        className="bg-primary text-white p-3 rounded-2xl hover:bg-primary-dark shadow-lg shadow-green-100 transition-all"
                                    >
                                        <CheckCircle size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CashRecon;

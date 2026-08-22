import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Wallet, Search, CheckCircle, Clock, User, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/common/DataTable';

const CashRecon = () => {
  const [riders, setRiders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Listen to cash deposits
    const qDeposits = query(collection(db, 'cash_deposits'), orderBy('timestamp', 'desc'));
    const unsubDeposits = onSnapshot(qDeposits, (snapshot) => {
      setDeposits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch summaries
    const fetchSummaries = async () => {
      setLoading(true);
      try {
        const ridersSnap = await getDocs(collection(db, 'riders'));
        const ordersSnap = await getDocs(query(collection(db, 'orders'), where('isCOD', '==', true)));

        const ridersData = ridersSnap.docs.map(riderDoc => {
          const riderId = riderDoc.id;
          const rider = riderDoc.data();
          const riderOrders = ordersSnap.docs
            .map(d => d.data())
            .filter(o => o.riderId === riderId && o.status === 'DELIVERED');

          const collected = riderOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);
          const verified = riderOrders
            .filter(o => o.verifiedByAdmin === true)
            .reduce((sum, o) => sum + (o.codAmount || 0), 0);

          return {
            id: riderId,
            name: rider.name || 'Unknown Rider',
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
        where('status', '==', 'DELIVERED'),
        where('isCashDeposited', '==', true)
      );
      const ordersSnap = await getDocs(q);
      const batchPromises = ordersSnap.docs.map(d =>
        updateDoc(doc(db, 'orders', d.id), { verifiedByAdmin: true, verifiedAt: new Date() })
      );
      await Promise.all(batchPromises);

      toast.success("Deposit verified & orders cleared");
    } catch (error) {
      toast.error("Verification failed");
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
    { header: 'Status', render: (r) => (
      <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${r.pendingDeposit === 0 ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
        {r.pendingDeposit === 0 ? 'CLEARED' : 'DUE'}
      </span>
    )}
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Wallet className="mr-3 text-primary" size={28} />
          Cash Reconciliation
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Verify rider cash deposits and clear balances</p>
      </div>

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

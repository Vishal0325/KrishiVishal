import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, where, orderBy } from 'firebase/firestore';
import { Wallet, Search, CheckCircle, Clock, ArrowRight, User, FileText } from 'lucide-react';

interface RiderCashSummary {
  id: string;
  name: string;
  collectedCash: number;
  depositedCash: number;
  pendingDeposit: number;
  verifiedCash: number;
  lastDepositAt?: any;
}

const CashReconciliation: React.FC = () => {
  const [riders, setRiders] = useState<RiderCashSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deposits, setDeposits] = useState<any[]>([]);

  useEffect(() => {
    // 1. Listen to cash deposits
    const q = query(collection(db, 'cash_deposits'), orderBy('timestamp', 'desc'));
    const unsubDeposits = onSnapshot(q, (snapshot) => {
      const depositsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDeposits(depositsData);
    });

    // 2. Fetch riders and cross-reference orders for collected cash
    const fetchRidersData = async () => {
      setLoading(true);
      try {
        const ridersSnap = await getDocs(collection(db, 'riders'));
        const ordersSnap = await getDocs(query(collection(db, 'orders'), where('isCOD', '==', true)));

        const ridersData: RiderCashSummary[] = ridersSnap.docs.map(riderDoc => {
          const riderId = riderDoc.id;
          const rider = riderDoc.data();

          // Calculate total collected cash from orders for this rider
          const riderOrders = ordersSnap.docs
            .map(d => d.data())
            .filter(o => o.riderId === riderId && o.status === 'DELIVERED');

          const collected = riderOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);

          // Calculate verified cash (admin confirmed)
          const verified = riderOrders
            .filter(o => o.verifiedByAdmin === true)
            .reduce((sum, o) => sum + (o.codAmount || 0), 0);

          return {
            id: riderId,
            name: rider.name || 'Unknown Rider',
            collectedCash: collected,
            verifiedCash: verified,
            depositedCash: 0, // Will update from deposits
            pendingDeposit: collected - verified,
          };
        });

        setRiders(ridersData);
      } catch (err) {
        console.error("Error fetching reconciliation data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRidersData();
    return () => unsubDeposits();
  }, []);

  const handleVerifyDeposit = async (depositId: string, riderId: string, amount: number) => {
    try {
      // Mark deposit as verified in cash_deposits collection
      await updateDoc(doc(db, 'cash_deposits', depositId), {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: 'Admin (Web)'
      });

      // Update associated orders as verified
      // Note: In a real app, you'd link deposits to specific orders.
      // For this MVP, we'll mark all 'DELIVERED' & 'UNVERIFIED' orders for this rider as verified.
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef,
        where('riderId', '==', riderId),
        where('status', '==', 'DELIVERED'),
        where('isCashDeposited', '==', true)
      );
      const ordersSnap = await getDocs(q);

      const batchPromises = ordersSnap.docs.map(d =>
        updateDoc(doc(db, 'orders', d.id), {
          verifiedByAdmin: true,
          verifiedAt: new Date()
        })
      );
      await Promise.all(batchPromises);

      alert("Deposit verified successfully!");
    } catch (error) {
      console.error("Error verifying deposit:", error);
    }
  };

  const filteredRiders = riders.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCollected = riders.reduce((sum, r) => sum + r.collectedCash, 0);
  const totalVerified = riders.reduce((sum, r) => sum + r.verifiedCash, 0);
  const totalPending = totalCollected - totalVerified;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Wallet className="text-primary-color" />
          COD Cash Reconciliation
        </h2>
        <p>Confirm cash deposits and track rider COD collections.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon purple">
            <Wallet size={24} />
          </div>
          <div className="stat-info">
            <h4>Total Collected Today</h4>
            <div className="stat-value">₹{totalCollected.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <h4>Verified & Safe</h4>
            <div className="stat-value">₹{totalVerified.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <h4>Pending Verification</h4>
            <div className="stat-value text-amber-500">₹{totalPending.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Rider Summary List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Rider Cash Balances</h3>
              <div className="search-input-wrapper" style={{ maxWidth: '300px' }}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search rider name or ID..."
                  className="search-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th>Collected</th>
                    <th>Verified</th>
                    <th>Pending</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-8">Loading reconciliation data...</td></tr>
                  ) : filteredRiders.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8">No riders found.</td></tr>
                  ) : filteredRiders.map(rider => (
                    <tr key={rider.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="rider-avatar">{rider.name.charAt(0)}</div>
                          <div>
                            <div className="font-semibold">{rider.name}</div>
                            <div className="text-xs text-slate-400">ID: {rider.id.slice(-6)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="font-medium">₹{rider.collectedCash.toLocaleString()}</td>
                      <td className="text-emerald-400">₹{rider.verifiedCash.toLocaleString()}</td>
                      <td className="text-amber-400 font-bold">₹{rider.pendingDeposit.toLocaleString()}</td>
                      <td>
                        {rider.pendingDeposit === 0 ? (
                          <span className="badge badge-success">CLEARED</span>
                        ) : (
                          <span className="badge badge-warning">DUE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Pending Verification Feed */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Clock size={20} className="text-amber-500" />
              Recent Deposits
            </h3>

            <div className="flex flex-col gap-3">
              {deposits.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No deposit activity recorded.</div>
              ) : deposits.slice(0, 8).map((deposit: any) => (
                <div key={deposit.id} className={`p-4 rounded-xl border ${deposit.status === 'VERIFIED' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {new Date(deposit.timestamp).toLocaleDateString()} at {new Date(deposit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {deposit.status === 'VERIFIED' ? (
                      <span className="badge badge-success btn-sm">VERIFIED</span>
                    ) : (
                      <span className="badge badge-warning btn-sm">PENDING</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-2xl font-bold">₹{deposit.amount.toLocaleString()}</div>
                      <div className="text-sm text-slate-300 flex items-center gap-1">
                        <User size={12} /> {riders.find(r => r.id === deposit.riderId)?.name || 'Unknown'}
                      </div>
                    </div>
                    {deposit.status !== 'VERIFIED' && (
                      <button
                        onClick={() => handleVerifyDeposit(deposit.id, deposit.riderId, deposit.amount)}
                        className="btn btn-primary btn-sm rounded-full"
                        title="Confirm Receipt"
                      >
                        Verify
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

export default CashReconciliation;

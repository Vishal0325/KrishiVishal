import React, { useState, useEffect } from 'react';
import { useReturns } from '../hooks/useReturns';
import DataTable from '../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { RefreshCcw, Search, Filter, Eye, X, CheckCircle2, Ban, Truck, ShieldAlert, MapPin, User } from 'lucide-react';
import StatusBadge from '../components/common/StatusBadge';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';

const getDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const Returns = () => {
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearch] = useState('');
  const { returns, loading, updateReturnStatus } = useReturns(statusFilter);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [riders, setRiders] = useState([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [orderDetails, setSelectedOrderDetails] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (selectedReturn) {
      getDoc(doc(db, 'orders', selectedReturn.orderId)).then(snap => {
        if (snap.exists()) setSelectedOrderDetails(snap.data());
      });
    } else {
      setSelectedOrderDetails(null);
      setSelectedRiderId('');
    }
  }, [selectedReturn]);

  const sortedRiders = [...riders].map(rider => {
    const distance = orderDetails ? getDistance(
      orderDetails.targetLat, orderDetails.targetLng,
      rider.currentLat, rider.currentLng
    ) : Infinity;
    return { ...rider, distance };
  }).sort((a, b) => a.distance - b.distance);

  const handleRefund = async () => {
    if (!refundAmount || isNaN(refundAmount) || Number(refundAmount) <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }
    setIsRefunding(true);
    try {
      const functions = getFunctions();
      const initiateRefund = httpsCallable(functions, 'initiateRefund');
      await initiateRefund({ returnId: selectedReturn.id, refundAmount: Number(refundAmount) });
      toast.success('Refund initiated successfully');
      setSelectedReturn(null);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to initiate refund');
    } finally {
      setIsRefunding(false);
    }
  };

  const filteredReturns = returns.filter(r =>
    r.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.productName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'ID', render: (r) => <span className="font-mono text-[10px] font-black">{r.id}</span> },
    { header: 'Product', render: (r) => (
      <div className="flex flex-col">
        <span className="font-bold text-gray-900 leading-none mb-1">{r.productName}</span>
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Order: {r.orderId.substring(0,8)}</span>
      </div>
    )},
    { header: 'Reason', key: 'reason', render: (r) => <span className="text-xs font-medium text-gray-600 italic">"{r.reason}"</span> },
    { header: 'Status', render: (r) => (
      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
        r.status === 'REQUESTED' ? 'bg-orange-50 text-orange-600 border-orange-100' :
        r.status === 'APPROVED' ? 'bg-green-50 text-green-600 border-green-100' :
        r.status === 'REJECTED' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'
      }`}>
        {r.status.replace('_', ' ')}
      </span>
    )},
    { header: 'Date', render: (r) => <span className="text-gray-400 font-bold text-[10px]">{formatDateTime(r.createdAt)}</span> },
    { header: 'Action', render: (r) => (
      <button onClick={() => setSelectedReturn(r)} className="p-2 bg-gray-50 text-gray-400 hover:text-primary transition-colors rounded-xl border border-gray-100 shadow-sm">
        <Eye size={18} />
      </button>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <RefreshCcw className="mr-3 text-orange-500" size={28} />
          Returns & Refunds
        </h1>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
          <input
            type="text" placeholder="Search by Return ID or Product..."
            value={searchTerm} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 outline-none text-sm transition-all font-medium"
          />
        </div>
        <select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-500 outline-none"
        >
          <option value="All">All Status</option>
          <option value="REQUESTED">Requested</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="PICKED_UP">Picked Up</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <DataTable columns={columns} data={filteredReturns} loading={loading} />

      {/* Detail Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-xl h-screen bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-20">
               <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tighter uppercase">Return Details</h2>
                <p className="text-[10px] font-black text-orange-500 tracking-widest">{selectedReturn.id}</p>
               </div>
               <button onClick={() => setSelectedReturn(null)} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-all">
                <X size={24} />
               </button>
            </div>

            <div className="p-10 space-y-12 pb-32">
              {/* Product Info */}
              <section className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 flex items-center space-x-6">
                 <div className="h-24 w-24 bg-white rounded-3xl overflow-hidden border border-gray-100 p-1 shadow-inner">
                   <img src={selectedReturn.proofUrls?.[0] || 'https://placehold.co/200x200?text=No+Proof'} className="w-full h-full object-cover rounded-2xl" alt="" />
                 </div>
                 <div className="space-y-1">
                   <h3 className="font-black text-gray-900 text-lg tracking-tight leading-none">{selectedReturn.productName}</h3>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">Reason: {selectedReturn.reason}</p>
                 </div>
              </section>

              {/* Business Rules Warning */}
              <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100 flex items-start space-x-4 shadow-inner">
                <ShieldAlert className="text-orange-500 shrink-0 mt-1" size={20} />
                <div>
                  <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest mb-1 leading-none">Policy Alert</h4>
                  <p className="text-[10px] font-bold text-orange-700/60 leading-relaxed italic">
                    Fertilizers: Check if seal is broken. Pesticides: Only damage/expiry allowed.
                  </p>
                </div>
              </div>

              {/* Actions & Notes */}
              <section className="space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-xs font-black text-primary-dark uppercase tracking-widest border-b border-gray-50 pb-2 mb-4">QC Status</h3>
                    <div className={`p-4 rounded-2xl border font-black text-xs uppercase tracking-widest text-center ${
                      selectedReturn.qcStatus === 'PASSED' ? 'bg-green-50 text-green-600 border-green-100' :
                      selectedReturn.qcStatus === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                      'bg-gray-50 text-gray-400 border-gray-100'
                    }`}>
                      {selectedReturn.qcStatus || 'PENDING'}
                    </div>
                    {(selectedReturn.qcStatus === 'PENDING' || !selectedReturn.qcStatus) && selectedReturn.status !== 'PENDING' ? (
                      <div className="flex space-x-2 mt-3">
                        <button onClick={() => updateReturnStatus(selectedReturn.id, selectedReturn.status, adminNote, null, 'PASSED')} className="flex-1 py-2 bg-green-50 text-green-600 rounded-xl text-xs font-bold border border-green-100 hover:bg-green-100">PASS QC</button>
                        <button onClick={() => updateReturnStatus(selectedReturn.id, selectedReturn.status, adminNote, null, 'FAILED')} className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 hover:bg-red-100">FAIL QC</button>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-primary-dark uppercase tracking-widest border-b border-gray-50 pb-2 mb-4">Refund Status</h3>
                    <div className={`p-4 rounded-2xl border font-black text-xs uppercase tracking-widest text-center ${
                      selectedReturn.refundStatus === 'COMPLETED' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      selectedReturn.refundStatus === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                      'bg-orange-50 text-orange-600 border-orange-100'
                    }`}>
                      {selectedReturn.refundStatus || 'PENDING'}
                    </div>
                    {selectedReturn.refundStatus !== 'COMPLETED' && (selectedReturn.qcStatus === 'PASSED' || selectedReturn.status === 'COMPLETED') ? (
                      <div className="mt-3 space-y-2">
                        <input
                          type="number"
                          placeholder="Amount (₹)"
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button 
                          onClick={handleRefund}
                          disabled={isRefunding}
                          className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isRefunding ? 'PROCESSING...' : 'INITIATE REFUND'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <h3 className="text-xs font-black text-primary-dark uppercase tracking-widest border-b border-gray-50 pb-2">Admin Resolution</h3>
                <textarea
                  placeholder="Enter notes for the customer..."
                  className="w-full p-6 bg-gray-50 border border-gray-100 rounded-3xl focus:ring-4 focus:ring-primary/5 outline-none font-medium text-sm text-gray-700 shadow-inner"
                  rows="4"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-4">
                   <button
                    onClick={() => updateReturnStatus(selectedReturn.id, 'REJECTED', adminNote)}
                    className="flex items-center justify-center space-x-2 py-4 rounded-2xl border-2 border-red-100 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-all active:scale-95"
                   >
                     <Ban size={18} />
                     <span>Reject</span>
                   </button>
                   <button
                    onClick={() => updateReturnStatus(selectedReturn.id, 'APPROVED', adminNote)}
                    className="flex items-center justify-center space-x-2 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-primary-dark transition-all active:scale-95"
                   >
                     <CheckCircle2 size={18} />
                     <span>Approve</span>
                   </button>
                </div>
              </section>

              {/* Proof Images */}
              <section className="space-y-4">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Proof Uploads</h3>
                 <div className="grid grid-cols-3 gap-4">
                   {selectedReturn.proofUrls?.map((url, i) => (
                     <a href={url} target="_blank" key={i} className="aspect-square bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 group relative">
                       <img src={url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="" />
                       <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <Eye className="text-white" size={20} />
                       </div>
                     </a>
                   ))}
                 </div>
              </section>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/95 backdrop-blur border-t border-gray-100 space-y-4">
               {selectedReturn.status === 'APPROVED' && (
                 <div className="flex flex-col space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Assign Nearest Rider</label>
                   <select
                     value={selectedRiderId}
                     onChange={(e) => setSelectedRiderId(e.target.value)}
                     className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-4 focus:ring-primary/5"
                   >
                     <option value="">Select a Rider</option>
                     {sortedRiders.filter(r => r.online).map(r => (
                       <option key={r.id} value={r.id}>
                         {r.name} ({r.distance === Infinity ? 'Unknown dist' : `${r.distance.toFixed(1)} km away`})
                       </option>
                     ))}
                   </select>
                 </div>
               )}
               <button
                 onClick={() => updateReturnStatus(selectedReturn.id, 'PICKUP_SCHEDULED', adminNote, selectedRiderId)}
                 disabled={selectedReturn.status === 'APPROVED' && !selectedRiderId}
                 className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:grayscale"
               >
                 <Truck size={18} />
                 <span>Schedule Pickup</span>
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;

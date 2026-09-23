import React, { useState, useEffect, useMemo } from 'react';
import { useReturns } from '../hooks/useReturns';
import DataTable from '../components/common/DataTable';
import DetailDrawer from '../components/common/DetailDrawer';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { 
  RefreshCcw, 
  Search, 
  Filter, 
  Eye, 
  CheckCircle2, 
  Ban, 
  Truck, 
  ShieldAlert, 
  Package, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Wallet,
  CreditCard
} from 'lucide-react';
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
  const [refundDestination, setRefundDestination] = useState('WALLET');
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
      setAdminNote(selectedReturn.adminNote || selectedReturn.adminNotes || '');
      setRefundAmount(selectedReturn.refundAmount || '');
    } else {
      setSelectedOrderDetails(null);
      setSelectedRiderId('');
      setAdminNote('');
      setRefundAmount('');
    }
  }, [selectedReturn]);

  const sortedRiders = useMemo(() => {
    return [...riders].map(rider => {
      const distance = orderDetails ? getDistance(
        orderDetails.targetLat, orderDetails.targetLng,
        rider.currentLat, rider.currentLng
      ) : Infinity;
      return { ...rider, distance };
    }).sort((a, b) => a.distance - b.distance);
  }, [riders, orderDetails]);

  const handleRefund = async () => {
    if (!refundAmount || isNaN(refundAmount) || Number(refundAmount) <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }
    setIsRefunding(true);
    try {
      const functions = getFunctions();
      const initiateRefund = httpsCallable(functions, 'initiateRefund');
      await initiateRefund({
        returnId: selectedReturn.id,
        refundAmount: Number(refundAmount),
        refundDestination: refundDestination,
      });
      toast.success(`Refund initiated via ${refundDestination === 'WALLET' ? 'Customer Wallet' : 'Razorpay Gateway'}`);
      setSelectedReturn(null);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to initiate refund');
    } finally {
      setIsRefunding(false);
    }
  };

  const filteredReturns = useMemo(() => {
    return returns.filter(r =>
      r.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reason?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [returns, searchTerm]);

  // KPI Metrics calculation
  const metrics = useMemo(() => {
    const requested = returns.filter(r => r.status === 'REQUESTED').length;
    const approved = returns.filter(r => r.status === 'APPROVED' || r.status === 'PICKUP_SCHEDULED').length;
    const completed = returns.filter(r => r.status === 'COMPLETED').length;
    const rejected = returns.filter(r => r.status === 'REJECTED').length;
    return { total: returns.length, requested, approved, completed, rejected };
  }, [returns]);

  const columns = [
    { 
      header: 'Return ID', 
      render: (r) => (
        <span className="font-mono text-xs font-bold text-[#0B4D31]">
          #{r.id?.slice(-8) || r.id}
        </span>
      )
    },
    { 
      header: 'Product & Order', 
      render: (r) => (
        <div className="flex flex-col max-w-[220px]">
          <span className="font-bold text-xs text-gray-900 truncate leading-snug">{r.productName || 'Ordered Item'}</span>
          <span className="text-[10px] text-gray-400 font-semibold font-mono">
            Order #{r.orderId ? r.orderId.slice(-8).toUpperCase() : 'N/A'}
          </span>
        </div>
      )
    },
    { 
      header: 'Reason', 
      render: (r) => (
        <span className="text-xs text-gray-600 italic line-clamp-1 max-w-[200px]" title={r.reason}>
          "{r.reason || 'No reason provided'}"
        </span>
      )
    },
    { 
      header: 'QC Status', 
      render: (r) => {
        const qc = r.qcStatus || 'PENDING';
        const styles = {
          PASSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          FAILED: 'bg-red-50 text-red-700 border-red-200',
          PENDING: 'bg-amber-50 text-amber-700 border-amber-200'
        };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${styles[qc] || styles.PENDING}`}>
            {qc}
          </span>
        );
      }
    },
    { 
      header: 'Status', 
      render: (r) => {
        const statusMap = {
          REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200',
          APPROVED: 'bg-blue-50 text-blue-700 border-blue-200',
          PICKUP_SCHEDULED: 'bg-purple-50 text-purple-700 border-purple-200',
          PICKED_UP: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          REJECTED: 'bg-rose-50 text-rose-700 border-rose-200'
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusMap[r.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {r.status?.replace('_', ' ') || 'UNKNOWN'}
          </span>
        );
      }
    },
    { 
      header: 'Date', 
      render: (r) => (
        <span className="text-gray-500 font-medium text-xs whitespace-nowrap">
          {formatDateTime(r.createdAt)}
        </span>
      )
    },
    { 
      header: 'Action', 
      render: (r) => (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setSelectedReturn(r);
          }} 
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 hover:bg-[#0B4D31] text-gray-700 hover:text-white rounded-lg border border-gray-200 hover:border-[#0B4D31] text-xs font-bold transition-all shadow-2xs cursor-pointer"
        >
          <Eye size={13} />
          <span>Review</span>
        </button>
      )
    }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Compact KPI Metric Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Returns</p>
            <h4 className="text-xl font-black text-gray-900 tracking-tight mt-0.5">{metrics.total}</h4>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Pending Review</p>
            <h4 className="text-xl font-black text-amber-600 tracking-tight mt-0.5">{metrics.requested}</h4>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Approved / Pickup</p>
            <h4 className="text-xl font-black text-emerald-600 tracking-tight mt-0.5">{metrics.approved}</h4>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Completed</p>
            <h4 className="text-xl font-black text-indigo-600 tracking-tight mt-0.5">{metrics.completed}</h4>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle size={18} />
          </div>
        </div>
      </div>

      {/* Compact Search & Filter Toolbar */}
      <div className="bg-white p-2.5 rounded-xl shadow-2xs border border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[220px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Search by Return ID, Order ID, Product..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0B4D31]/10 focus:border-[#0B4D31] outline-none text-xs font-medium transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[#0B4D31]/10"
          >
            <option value="All">All Statuses ({returns.length})</option>
            <option value="REQUESTED">Requested ({metrics.requested})</option>
            <option value="APPROVED">Approved</option>
            <option value="PICKUP_SCHEDULED">Pickup Scheduled</option>
            <option value="PICKED_UP">Picked Up</option>
            <option value="COMPLETED">Completed ({metrics.completed})</option>
            <option value="REJECTED">Rejected ({metrics.rejected})</option>
          </select>

          <span className="text-xs text-gray-400 font-semibold px-2">
            Showing {filteredReturns.length} of {returns.length}
          </span>
        </div>
      </div>

      {/* Main Table */}
      <DataTable 
        columns={columns} 
        data={filteredReturns} 
        loading={loading}
        onRowClick={(r) => setSelectedReturn(r)}
      />

      {/* Compact Standard Detail Drawer */}
      <DetailDrawer
        isOpen={Boolean(selectedReturn)}
        onClose={() => setSelectedReturn(null)}
        title={selectedReturn ? `Return #${selectedReturn.id?.slice(-8) || selectedReturn.id}` : ''}
        size="lg"
      >
        {selectedReturn && (
          <div className="space-y-6 text-sm">
            {/* Header Status Strip */}
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                <span className="text-xs font-extrabold uppercase text-gray-800 tracking-wider">
                  {selectedReturn.status?.replace('_', ' ')}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created</p>
                <span className="text-xs font-semibold text-gray-600">
                  {formatDateTime(selectedReturn.createdAt)}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Linked Order</p>
                <span className="text-xs font-mono font-bold text-[#0B4D31]">
                  #{selectedReturn.orderId?.slice(-8).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Product Summary */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-2xs">
              <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                <img 
                  src={selectedReturn.proofUrls?.[0] || 'https://placehold.co/100x100?text=Item'} 
                  alt="" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 text-sm truncate">{selectedReturn.productName}</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-semibold text-gray-700">Reason:</span> "{selectedReturn.reason}"
                </p>
                {selectedReturn.customerComment && (
                  <p className="text-xs text-gray-400 italic mt-0.5 truncate">
                    Comment: {selectedReturn.customerComment}
                  </p>
                )}
              </div>
            </div>

            {/* Policy Info Box */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-start gap-2.5">
              <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                <span className="font-bold">Inspection Policy:</span> Check container seal, original packaging & expiry. Pesticides/Chemicals are eligible only for damage or expiry.
              </p>
            </div>

            {/* QC & Refund Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QC Verification Card */}
              <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-600">QC Status</span>
                  <span className={`text-[11px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                    selectedReturn.qcStatus === 'PASSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    selectedReturn.qcStatus === 'FAILED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {selectedReturn.qcStatus || 'PENDING'}
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => updateReturnStatus(selectedReturn.id, selectedReturn.status, adminNote, null, 'PASSED')}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    ✓ Pass QC
                  </button>
                  <button
                    onClick={() => updateReturnStatus(selectedReturn.id, selectedReturn.status, adminNote, null, 'FAILED')}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    ✗ Fail QC
                  </button>
                </div>
              </div>

              {/* Refund Card */}
              <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-600">Refund Status</span>
                  <span className={`text-[11px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                    selectedReturn.refundStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    selectedReturn.refundStatus === 'FAILED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {selectedReturn.refundStatus || 'PENDING'}
                  </span>
                </div>

                {selectedReturn.refundStatus !== 'COMPLETED' ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="₹ Amount"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-[#0B4D31]/10"
                      />
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setRefundDestination('WALLET')}
                          className={`px-2 py-1 font-bold transition-colors cursor-pointer ${
                            refundDestination === 'WALLET'
                              ? 'bg-[#0B4D31] text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Wallet
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefundDestination('GATEWAY')}
                          className={`px-2 py-1 font-bold transition-colors cursor-pointer ${
                            refundDestination === 'GATEWAY'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Gateway
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleRefund}
                      disabled={isRefunding}
                      className="w-full py-1.5 bg-[#0B4D31] hover:bg-[#073622] text-white rounded-lg text-xs font-bold transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                    >
                      {isRefunding ? 'Processing Refund...' : `Refund to ${refundDestination === 'WALLET' ? 'Customer Wallet' : 'Payment Gateway'}`}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 font-semibold pt-2">
                    ✓ Refund completed successfully
                  </p>
                )}
              </div>
            </div>

            {/* Rider Dispatch & Schedule Pickup */}
            {selectedReturn.status === 'APPROVED' && (
              <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-100 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-900">
                  Assign Rider for Pickup
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedRiderId}
                    onChange={(e) => setSelectedRiderId(e.target.value)}
                    className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">Choose nearest online rider</option>
                    {sortedRiders.filter(r => r.online !== false).map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.riderName || 'Rider'} ({r.distance === Infinity ? 'Near Hub' : `${r.distance.toFixed(1)} km away`})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => updateReturnStatus(selectedReturn.id, 'PICKUP_SCHEDULED', adminNote, selectedRiderId)}
                    disabled={!selectedRiderId}
                    className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Truck size={14} />
                    <span>Dispatch</span>
                  </button>
                </div>
              </div>
            )}

            {/* Proof Photos Grid */}
            {selectedReturn.proofUrls?.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">Customer Proof Photos</span>
                <div className="grid grid-cols-4 gap-2">
                  {selectedReturn.proofUrls.map((url, i) => (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      key={i}
                      className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity block"
                    >
                      <img src={url} alt={`Proof ${i+1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Resolution & Notes */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                Resolution Note (Customer Visible)
              </label>
              <textarea
                placeholder="Enter explanation, rejection reason or return instructions..."
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-[#0B4D31]/10 focus:border-[#0B4D31]"
              />
            </div>

            {/* Approval / Rejection Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => updateReturnStatus(selectedReturn.id, 'REJECTED', adminNote)}
                className="flex-1 py-2 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Ban size={15} />
                <span>Reject Return</span>
              </button>
              <button
                onClick={() => updateReturnStatus(selectedReturn.id, 'APPROVED', adminNote)}
                className="flex-1 py-2 rounded-lg bg-[#0B4D31] hover:bg-[#083824] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <CheckCircle2 size={15} />
                <span>Approve Return</span>
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
};

export default Returns;

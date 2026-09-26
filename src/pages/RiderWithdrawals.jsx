import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import DataTable from '../components/common/DataTable';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Clock, Search, Filter } from 'lucide-react';

export default function RiderWithdrawals() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING'); // PENDING, TRANSFERRED, REJECTED, ALL

  // Action Modals
  const [approveModal, setApproveModal] = useState({ open: false, req: null, utr: '' });
  const [rejectModal, setRejectModal] = useState({ open: false, req: null, reason: '' });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'payout_requests'), orderBy('requestedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching withdrawal requests:", error);
      toast.error("Failed to load withdrawal requests");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleApprove = async () => {
    if (!approveModal.req || !approveModal.utr.trim()) {
      toast.error("Please enter UTR / Transaction Reference");
      return;
    }
    setProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const reqRef = doc(db, 'payout_requests', approveModal.req.id);
        const riderRef = doc(db, 'riders', approveModal.req.riderId);
        
        const reqDoc = await transaction.get(reqRef);
        if (!reqDoc.exists() || reqDoc.data().status !== 'PENDING') {
          throw new Error("Request is no longer pending.");
        }

        // Deduct from rider's wallet
        const riderDoc = await transaction.get(riderRef);
        if (riderDoc.exists()) {
          const currentBal = riderDoc.data().pendingSettlement || 0;
          const newBal = currentBal - approveModal.req.amount;
          transaction.update(riderRef, { pendingSettlement: newBal });
        }

        // Update request status
        transaction.update(reqRef, {
          status: 'TRANSFERRED',
          transactionRef: approveModal.utr,
          processedAt: serverTimestamp(),
        });
      });

      toast.success("Request approved and wallet balance deducted");
      setApproveModal({ open: false, req: null, utr: '' });
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Error approving request");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.req || !rejectModal.reason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'payout_requests', rejectModal.req.id), {
        status: 'REJECTED',
        rejectionReason: rejectModal.reason,
        processedAt: serverTimestamp(),
      });
      toast.success("Request rejected");
      setRejectModal({ open: false, req: null, reason: '' });
    } catch (error) {
      console.error(error);
      toast.error("Error rejecting request");
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    const matchesSearch = 
      (req.riderName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.riderPhone || '').includes(searchTerm) ||
      (req.id || '').includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  const columns = [
    {
      header: 'Date',
      render: (req) => (
        <div>
          <div className="font-medium text-gray-900">{formatDateTime(req.requestedAt)}</div>
          <div className="text-xs text-gray-500">ID: {req.id ? req.id.slice(-6) : ''}</div>
        </div>
      )
    },
    {
      header: 'Rider Info',
      render: (req) => (
        <div>
          <div className="font-bold text-gray-900">{req.riderName}</div>
          <div className="text-sm text-gray-500">{req.riderPhone}</div>
        </div>
      )
    },
    {
      header: 'Amount',
      render: (req) => (
        <div className="font-black text-[#0B4D31]">{formatCurrency(req.amount)}</div>
      )
    },
    {
      header: 'Payment Method',
      render: (req) => (
        <div>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs font-bold uppercase">
            {req.paymentMethod}
          </span>
          <div className="mt-1 text-sm text-gray-600">
            {req.paymentMethod === 'UPI' ? (
              <span>{req.upiId}</span>
            ) : (
              <div>
                <div>{req.bankDetails?.bankName}</div>
                <div className="text-xs">Acct: {req.bankDetails?.bankAccount}</div>
                <div className="text-xs">IFSC: {req.bankDetails?.ifscCode}</div>
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      render: (req) => (
        <div>
          {req.status === 'PENDING' && (
            <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
              <Clock size={14} /> Pending
            </span>
          )}
          {req.status === 'TRANSFERRED' && (
            <div>
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                <CheckCircle size={14} /> Transferred
              </span>
              <div className="text-xs text-gray-500 mt-1">UTR: {req.transactionRef}</div>
            </div>
          )}
          {req.status === 'REJECTED' && (
            <div>
              <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                <XCircle size={14} /> Rejected
              </span>
              <div className="text-xs text-red-500 mt-1">{req.rejectionReason}</div>
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Actions',
      render: (req) => (
        <div className="flex gap-2">
          {req.status === 'PENDING' && (
            <>
              <button
                onClick={() => setApproveModal({ open: true, req, utr: '' })}
                className="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Approve
              </button>
              <button
                onClick={() => setRejectModal({ open: true, req, reason: '' })}
                className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Reject
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by rider name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B4D31] outline-none transition-all"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="text-gray-400" size={20} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#0B4D31] outline-none bg-gray-50 font-medium"
          >
            <option value="ALL">All Requests</option>
            <option value="PENDING">Pending</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredRequests}
          loading={loading}
          emptyMessage="No withdrawal requests found."
        />
      </div>

      {/* Approve Modal */}
      {approveModal.open && approveModal.req && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Approve Withdrawal</h3>
            <p className="text-gray-500 mb-6">
              You are about to approve a withdrawal of <strong className="text-gray-900">{formatCurrency(approveModal.req.amount)}</strong> for <strong className="text-gray-900">{approveModal.req.riderName}</strong>.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-1">Transaction UTR / Ref No.</label>
              <input
                type="text"
                value={approveModal.utr}
                onChange={(e) => setApproveModal({ ...approveModal, utr: e.target.value })}
                placeholder="Enter bank transaction ID..."
                className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#0B4D31] outline-none"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setApproveModal({ open: false, req: null, utr: '' })}
                className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={processing || !approveModal.utr.trim()}
                className="px-4 py-2 bg-[#0B4D31] text-white font-bold rounded-xl hover:bg-[#0B4D31]/90 transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Mark as Transferred'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && rejectModal.req && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reject Withdrawal</h3>
            <p className="text-gray-500 mb-6">
              You are rejecting the withdrawal request for <strong className="text-gray-900">{rejectModal.req.riderName}</strong>.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-1">Reason for Rejection</label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="E.g., Invalid UPI ID, Amount mismatch..."
                className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-red-500 outline-none h-24 resize-none"
              ></textarea>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModal({ open: false, req: null, reason: '' })}
                className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processing || !rejectModal.reason.trim()}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

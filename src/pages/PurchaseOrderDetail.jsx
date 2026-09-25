import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import {
  ArrowLeft,
  FileText,
  Building2,
  Calendar,
  Phone,
  Printer,
  CheckCircle2,
  Clock,
  Truck,
  AlertCircle,
  XCircle,
  Loader2,
  ShieldCheck,
  MapPin,
  FileSpreadsheet,
  Package,
  Hash,
  Send,
  AlertTriangle,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_ORDER = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ISSUED_TO_SUPPLIER',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'COMPLETED'
];

const PurchaseOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [po, setPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Approval / Rejection modal state
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState('APPROVE'); // 'APPROVE' | 'REJECT'
  const [approvalNotes, setApprovalNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'purchase_orders', id), (docSnap) => {
      if (docSnap.exists()) {
        setPO({ id: docSnap.id, ...docSnap.data() });
      } else {
        toast.error('Purchase Order not found');
        navigate('/procurement');
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching PO:', error);
      toast.error('Failed to load PO details');
      setLoading(false);
    });

    return unsub;
  }, [id, navigate]);

  const updatePOStatus = async (newStatus, note = '', extraData = {}) => {
    if (!po) return;
    setUpdatingStatus(true);
    try {
      const historyEntry = {
        status: newStatus,
        timestamp: new Date().toISOString(),
        performedBy: user?.displayName || user?.email || 'Admin',
        role: role || 'Admin',
        note: note || `Status updated to ${newStatus}`
      };

      await updateDoc(doc(db, 'purchase_orders', po.id), {
        status: newStatus,
        statusHistory: [...(po.statusHistory || []), historyEntry],
        ...extraData,
        updatedAt: Timestamp.now()
      });

      await addAuditLog('UPDATE_PO_STATUS', 'PurchaseOrder', po.id, {
        poNumber: po.poNumber,
        oldStatus: po.status,
        newStatus,
        note
      });

      toast.success(`PO status changed to ${newStatus.replace(/_/g, ' ')}`);
    } catch (error) {
      console.error('Status update failed:', error);
      toast.error('Failed to update status: ' + error.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Maker: Submit PO for Approval
  const handleSubmitForApproval = () => {
    updatePOStatus('PENDING_APPROVAL', 'Submitted for Corporate Finance Maker-Checker Approval');
  };

  // Checker: Process Approval / Rejection
  const handleProcessApproval = async () => {
    if (!approvalNotes.trim() && approvalAction === 'REJECT') {
      toast.error('Please enter a rejection reason');
      return;
    }

    const isApprove = approvalAction === 'APPROVE';
    const newStatus = isApprove ? 'APPROVED' : 'REJECTED';
    const note = isApprove 
      ? `Authorized & Approved by ${user?.displayName || 'Finance'}: ${approvalNotes || 'Meets procurement budget'}`
      : `Rejected by ${user?.displayName || 'Finance'}: ${approvalNotes}`;

    const approvalMeta = isApprove ? {
      approvedBy: user?.displayName || user?.email || 'Finance Manager',
      approvedByUid: user?.uid || null,
      approvedByRole: role || 'FinanceHead',
      approvedAt: new Date().toISOString()
    } : {
      rejectedBy: user?.displayName || user?.email || 'Finance Manager',
      rejectedByUid: user?.uid || null,
      rejectedAt: new Date().toISOString()
    };

    await updatePOStatus(newStatus, note, approvalMeta);
    setIsApprovalModalOpen(false);
    setApprovalNotes('');
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#0B4D31]" size={40} />
      </div>
    );
  }

  if (!po) return null;

  const currentStatusIndex = STATUS_ORDER.indexOf(po.status);
  const isCancelled = po.status === 'CANCELLED' || po.status === 'REJECTED';
  const totalItems = (po.items || []).reduce((acc, i) => acc + (i.quantity || 0), 0);
  const totalValue = po.totalEstimatedAmount || (po.items || []).reduce((acc, i) => acc + ((i.quantity || 0) * (i.estimatedCostPrice || 0)), 0);

  // Maker-Checker Check: Anti-self-approval rule for corporate governance
  const isCreator = po.createdBy && user?.uid && po.createdBy === user.uid;
  const isHighValue = totalValue >= 25000;
  const canApprove = !isCreator || !isHighValue || ['SuperAdmin', 'FinanceHead', 'MD'].includes(role);

  // Build PageHeader actions
  const headerActions = [
    { label: 'Print PO', icon: Printer, onClick: handlePrint, variant: 'secondary' }
  ];

  if (po.status === 'DRAFT') {
    headerActions.push({
      label: 'Submit for Approval',
      icon: Send,
      onClick: handleSubmitForApproval,
      variant: 'primary',
      disabled: updatingStatus
    });
  }

  if (po.status === 'PENDING_APPROVAL') {
    headerActions.push({
      label: 'Review & Authorize',
      icon: ShieldCheck,
      onClick: () => {
        setApprovalAction('APPROVE');
        setIsApprovalModalOpen(true);
      },
      variant: 'primary',
      disabled: updatingStatus || !canApprove
    });
  }

  if (po.status === 'APPROVED') {
    headerActions.push({
      label: 'Issue to Supplier',
      icon: Truck,
      onClick: () => updatePOStatus('ISSUED_TO_SUPPLIER', 'Purchase Order officially issued to supplier'),
      variant: 'primary',
      disabled: updatingStatus
    });
  }

  if (po.status === 'ISSUED_TO_SUPPLIER') {
    headerActions.push({
      label: 'Confirm Supplier Order',
      icon: CheckCircle2,
      onClick: () => updatePOStatus('CONFIRMED', 'Supplier accepted and confirmed order'),
      variant: 'primary',
      disabled: updatingStatus
    });
  }

  if (['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    headerActions.push({
      label: 'Mark All Received',
      icon: ShieldCheck,
      onClick: () => updatePOStatus('COMPLETED', 'All items received at central hub'),
      variant: 'primary',
      disabled: updatingStatus
    });
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 animate-in fade-in duration-300">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <button
          onClick={() => navigate('/procurement')}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Procurement
        </button>
      </div>

      <PageHeader
        title={`Purchase Order — ${po.poNumber}`}
        subtitle={`Supplier: ${po.supplierName || 'N/A'} • ${totalItems} items • ${formatCurrency(totalValue)} total`}
        actions={headerActions}
      />

      {/* Corporate Governance / Anti-Self-Approval Alert */}
      {po.status === 'PENDING_APPROVAL' && isCreator && !canApprove && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800 text-xs font-bold print:hidden">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Maker-Checker Governance:</strong> You created this PO. Under KrishiVishal corporate governance rules, a separate Finance Checker or SuperAdmin must authorize orders exceeding ₹25,000.
          </span>
        </div>
      )}

      {/* Quick Metric Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
          <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider mt-1 ${
            po.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
            po.status === 'CONFIRMED' ? 'bg-indigo-100 text-indigo-800' :
            po.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
            po.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800 animate-pulse' :
            po.status === 'ISSUED_TO_SUPPLIER' ? 'bg-blue-100 text-blue-800' :
            po.status === 'CANCELLED' || po.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-700'
          }`}>
            {po.status?.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Line Items</p>
          <p className="text-xl font-black text-gray-900 mt-1">{po.items?.length || 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Quantity</p>
          <p className="text-xl font-black text-gray-900 mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Est. Order Value</p>
          <p className="text-xl font-black text-[#0B4D31] mt-1">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      {/* Cancel Button */}
      {!isCancelled && po.status !== 'COMPLETED' && (
        <div className="print:hidden flex justify-end">
          <button
            onClick={() => {
              if (window.confirm('Cancel this purchase order?')) {
                updatePOStatus('CANCELLED', 'PO cancelled by admin');
              }
            }}
            disabled={updatingStatus}
            className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all"
          >
            Cancel PO
          </button>
        </div>
      )}

      {/* Printable PO Sheet */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-8 print:border-none print:shadow-none print:p-0">
        
        {/* PO Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-gray-100 pb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 text-[#0B4D31] rounded-2xl">
                <FileText size={28} />
              </div>
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">KrishiVishal Enterprise PO</span>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight font-mono">{po.poNumber}</h1>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-2">
              <Calendar size={13} className="text-gray-400" />
              Issued Date: <span className="font-bold text-gray-800">
                {po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
              </span>
            </p>
            {po.approvedBy && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1.5 font-bold">
                <ShieldCheck size={14} />
                Corporate Approved by: {po.approvedBy} ({new Date(po.approvedAt).toLocaleDateString()})
              </p>
            )}
          </div>

          <div className="sm:text-right">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider ${
              po.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
              po.status === 'CONFIRMED' ? 'bg-indigo-100 text-indigo-800' :
              po.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
              po.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800' :
              po.status === 'ISSUED_TO_SUPPLIER' ? 'bg-blue-100 text-blue-800' :
              po.status === 'CANCELLED' || po.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-700'
            }`}>
              {po.status?.replace(/_/g, ' ')}
            </span>
            <p className="text-xs text-gray-500 mt-2">
              Expected Delivery: <span className="font-bold text-gray-800">{po.expectedDeliveryDate || 'N/A'}</span>
            </p>
          </div>
        </div>

        {/* Status Lifecycle Stepper (Hidden on Print) */}
        {!isCancelled && (
          <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100 print:hidden">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Lifecycle Progress</p>
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
              {STATUS_ORDER.map((step, idx) => {
                const isPassed = currentStatusIndex >= idx;
                const isCurrent = currentStatusIndex === idx;

                return (
                  <div key={step} className="flex flex-col items-center text-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mb-1.5 transition-all ${
                      isPassed ? 'bg-[#0B4D31] text-white shadow-md shadow-green-100' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <span className={`text-[9px] font-bold tracking-tight uppercase ${
                      isCurrent ? 'text-[#0B4D31] font-black' : isPassed ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {step.replace(/_/g, ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Supplier & Delivery Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Supplier Card */}
          <div className="p-6 bg-gray-50/60 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Building2 size={13} className="text-[#0B4D31]" />
              Supplier / Vendor Master
            </p>
            <h3 className="font-black text-base text-gray-900">{po.supplierName}</h3>
            {po.supplierGstin && (
              <p className="text-xs text-gray-600 mt-1 font-mono">
                GSTIN: <span className="font-bold">{po.supplierGstin}</span>
              </p>
            )}
            {po.supplierPhone && (
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                <Phone size={12} className="text-gray-400" />
                {po.supplierPhone}
              </p>
            )}
          </div>

          {/* Delivery Hub Card */}
          <div className="p-6 bg-gray-50/60 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <MapPin size={13} className="text-[#0B4D31]" />
              Delivery Destination Depot
            </p>
            <p className="text-xs font-bold text-gray-800 leading-relaxed">
              {po.deliveryAddress || 'Regional Hub Delivery Location'}
            </p>
            {po.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Instructions / Remarks</p>
                <p className="text-xs text-gray-600 italic mt-0.5">{po.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* PO Line Items Table */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Purchase Items & Line Pricing</h3>
            <span className="text-xs text-gray-500 font-bold">{po.items?.length || 0} Products</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-black uppercase text-[10px] tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4 text-center">Batch / Ref</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Est. Unit Cost</th>
                  <th className="py-3 px-4 text-right">Total (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold text-gray-900">
                {(po.items || []).map((item, idx) => {
                  const lineTotal = item.totalPrice || (item.quantity * item.estimatedCostPrice) || 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="py-3 px-4 font-black">{item.productName}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {item.orderId ? `#${item.orderId.slice(0, 8)}` : 'STOCK_PROC'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-800">{item.quantity} units</td>
                      <td className="py-3 px-4 text-right text-gray-600 font-mono">
                        {formatCurrency(item.estimatedCostPrice || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-gray-900 font-mono">
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/80 font-black border-t border-gray-200 text-gray-900">
                <tr>
                  <td colSpan={3} className="py-4 px-4 uppercase text-[11px] tracking-wider text-gray-500">
                    Total Estimated Order Value
                  </td>
                  <td className="py-4 px-4 text-right font-black text-gray-900">
                    {po.totalItemsCount || totalItems} units
                  </td>
                  <td></td>
                  <td className="py-4 px-4 text-right text-base font-black text-[#0B4D31] font-mono">
                    {formatCurrency(totalValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Audit History Timeline */}
        {po.statusHistory && po.statusHistory.length > 0 && (
          <div className="pt-6 border-t border-gray-100 print:hidden">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Corporate Audit History</p>
            <div className="space-y-3">
              {po.statusHistory.map((hist, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="p-1 rounded bg-green-50 text-[#0B4D31] mt-0.5">
                    <Clock size={12} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">
                      <span className="uppercase text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-100 mr-2">
                        {hist.status}
                      </span>
                      {hist.note}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      By: {hist.performedBy || 'System'} • {new Date(hist.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Maker-Checker Review Modal */}
      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#0B4D31]" />
                Finance Approval Authorization
              </h3>
              <button onClick={() => setIsApprovalModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">PO Number:</span>
                  <span className="font-mono font-bold text-gray-900">{po.poNumber}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Supplier:</span>
                  <span className="font-bold text-gray-900">{po.supplierName}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Total Amount:</span>
                  <span className="font-black text-green-700 font-mono text-sm">{formatCurrency(totalValue)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalAction('APPROVE')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    approvalAction === 'APPROVE' ? 'bg-[#0B4D31] text-white shadow-sm' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  ✓ Approve Order
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalAction('REJECT')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    approvalAction === 'REJECT' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  ✕ Reject Order
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">
                  {approvalAction === 'APPROVE' ? 'Approval Remarks (Optional)' : 'Rejection Reason (Required) *'}
                </label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                  placeholder={approvalAction === 'APPROVE' ? 'Budget verified, approved for issue...' : 'Reason for rejecting this procurement request...'}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setIsApprovalModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessApproval}
                disabled={updatingStatus}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition-all ${
                  approvalAction === 'APPROVE' ? 'bg-[#0B4D31] hover:bg-[#146c43]' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirm {approvalAction === 'APPROVE' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderDetail;

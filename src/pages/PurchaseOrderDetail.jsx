import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
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
  FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_ORDER = [
  'DRAFT',
  'ISSUED_TO_SUPPLIER',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'COMPLETED'
];

const PurchaseOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [po, setPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const updatePOStatus = async (newStatus, note = '') => {
    if (!po) return;
    setUpdatingStatus(true);
    try {
      const historyEntry = {
        status: newStatus,
        timestamp: new Date().toISOString(),
        note: note || `Status updated to ${newStatus}`
      };

      await updateDoc(doc(db, 'purchase_orders', po.id), {
        status: newStatus,
        statusHistory: [...(po.statusHistory || []), historyEntry],
        updatedAt: Timestamp.now()
      });

      await addAuditLog('UPDATE_PO_STATUS', 'PurchaseOrder', po.id, {
        poNumber: po.poNumber,
        oldStatus: po.status,
        newStatus
      });

      toast.success(`PO status changed to ${newStatus.replace(/_/g, ' ')}`);
    } catch (error) {
      console.error('Status update failed:', error);
      toast.error('Failed to update status: ' + error.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#1b5e20]" size={40} />
      </div>
    );
  }

  if (!po) return null;

  const currentStatusIndex = STATUS_ORDER.indexOf(po.status);
  const isCancelled = po.status === 'CANCELLED';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <button
          onClick={() => navigate('/procurement')}
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Procurement
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Printer size={16} />
            Print PO
          </button>

          {po.status === 'ISSUED_TO_SUPPLIER' && (
            <button
              onClick={() => updatePOStatus('CONFIRMED', 'Supplier accepted and confirmed order')}
              disabled={updatingStatus}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-100"
            >
              <CheckCircle2 size={16} />
              Confirm Supplier Order
            </button>
          )}

          {['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
            <button
              onClick={() => updatePOStatus('COMPLETED', 'All items received at central hub')}
              disabled={updatingStatus}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1b5e20] hover:bg-[#2e7d32] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-green-100"
            >
              <ShieldCheck size={16} />
              Mark All Received (Completed)
            </button>
          )}

          {!isCancelled && po.status !== 'COMPLETED' && (
            <button
              onClick={() => {
                if (window.confirm('Cancel this purchase order?')) {
                  updatePOStatus('CANCELLED', 'PO cancelled by admin');
                }
              }}
              disabled={updatingStatus}
              className="px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all"
            >
              Cancel PO
            </button>
          )}
        </div>
      </div>

      {/* Printable PO Sheet */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-8 print:border-none print:shadow-none print:p-0">
        
        {/* PO Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-gray-100 pb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 text-[#1b5e20] rounded-2xl">
                <FileText size={28} />
              </div>
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Purchase Order</span>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight font-mono">{po.poNumber}</h1>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-2">
              <Calendar size={13} className="text-gray-400" />
              Issued Date: <span className="font-bold text-gray-800">
                {po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
              </span>
            </p>
          </div>

          <div className="sm:text-right">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider ${
              po.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
              po.status === 'CONFIRMED' ? 'bg-indigo-100 text-indigo-800' :
              po.status === 'ISSUED_TO_SUPPLIER' ? 'bg-blue-100 text-blue-800' :
              po.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STATUS_ORDER.map((step, idx) => {
                const isPassed = currentStatusIndex >= idx;
                const isCurrent = currentStatusIndex === idx;

                return (
                  <div key={step} className="flex flex-col items-center text-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black mb-1.5 transition-all ${
                      isPassed ? 'bg-[#1b5e20] text-white shadow-md shadow-green-100' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <span className={`text-[10px] font-bold tracking-tight uppercase ${
                      isCurrent ? 'text-[#1b5e20] font-black' : isPassed ? 'text-gray-900' : 'text-gray-400'
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
              <Building2 size={13} className="text-[#1b5e20]" />
              Supplier / Vendor
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
              <MapPin size={13} className="text-[#1b5e20]" />
              Delivery Destination
            </p>
            <p className="text-xs font-bold text-gray-800 leading-relaxed">
              {po.deliveryAddress || 'KrishiVishal Central Hub, Agro Market Road, Purnea, Bihar - 854301'}
            </p>
            {po.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Instructions</p>
                <p className="text-xs text-gray-600 italic mt-0.5">{po.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* PO Line Items Table */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Purchase Items</h3>
            <span className="text-xs text-gray-500 font-bold">{po.items?.length || 0} Products</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-black uppercase text-[10px] tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4 text-center">Order Reference</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Est. Unit Cost</th>
                  <th className="py-3 px-4 text-right">Total (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold text-gray-900">
                {(po.items || []).map((item, idx) => (
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
                      {formatCurrency(item.totalPrice || (item.quantity * item.estimatedCostPrice) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/80 font-black border-t border-gray-200 text-gray-900">
                <tr>
                  <td colSpan={3} className="py-4 px-4 uppercase text-[11px] tracking-wider text-gray-500">
                    Total Estimated Order Value
                  </td>
                  <td className="py-4 px-4 text-right font-black text-gray-900">
                    {po.totalItemsCount || (po.items || []).reduce((acc, i) => acc + (i.quantity || 0), 0)} units
                  </td>
                  <td></td>
                  <td className="py-4 px-4 text-right text-base font-black text-[#1b5e20] font-mono">
                    {formatCurrency(po.totalEstimatedAmount || 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Audit History Timeline (Hidden on Print) */}
        {po.statusHistory && po.statusHistory.length > 0 && (
          <div className="pt-6 border-t border-gray-100 print:hidden">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Audit History</p>
            <div className="space-y-3">
              {po.statusHistory.map((hist, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="p-1 rounded bg-green-50 text-[#1b5e20] mt-0.5">
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
                      {new Date(hist.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PurchaseOrderDetail;

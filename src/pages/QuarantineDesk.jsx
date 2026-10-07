import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { useAuthContext } from '../hooks/useAuthContext';
import { useReadOnly } from '../hooks/useReadOnly';
import ReadOnlyBanner from '../components/common/ReadOnlyBanner';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import {
  AlertOctagon,
  ArrowRightLeft,
  Trash2,
  Search,
  Filter,
  Layers,
  MapPin,
  Calendar,
  X,
  Loader2,
  FileText,
  Building2,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function QuarantineDesk() {
  const { user } = useAuth();
  const { isHubScoped, hubId } = useAuthContext();
  const { isReadOnly } = useReadOnly();

  const [quarantineItems, setQuarantineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  // Modal States
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(null); // 'RETURN_TO_VENDOR' | 'WRITE_OFF'
  const [actionQty, setActionQty] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [debitNoteRef, setDebitNoteRef] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let q;
    if (isHubScoped && hubId) {
      q = query(
        collection(db, 'inventory_quarantine'),
        where('hubId', '==', hubId)
      );
    } else {
      q = query(
        collection(db, 'inventory_quarantine'),
        orderBy('createdAt', 'desc')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (isHubScoped) {
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
      }
      setQuarantineItems(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load quarantine list:', err);
      toast.error('Failed to load quarantined inventory');
      setLoading(false);
    });

    return unsub;
  }, [isHubScoped, hubId]);

  const openActionModal = (item, type) => {
    const remaining = (Number(item.damagedQty) || 0) - (Number(item.resolvedQty) || 0);
    setSelectedItem(item);
    setActionType(type);
    setActionQty(remaining > 0 ? remaining.toString() : '1');
    setVendorName(item.vendorName || item.supplierName || '');
    setVendorId(item.vendorId || item.supplierId || '');
    setDebitNoteRef(`DN-${Date.now().toString().slice(-6)}`);
    setWriteOffReason('Damaged / Broken packaging in transit');
  };

  const closeActionModal = () => {
    setSelectedItem(null);
    setActionType(null);
    setActionQty('');
    setVendorName('');
    setVendorId('');
    setDebitNoteRef('');
    setWriteOffReason('');
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem || !actionType) return;

    const qty = Number(actionQty);
    const remaining = (Number(selectedItem.damagedQty) || 0) - (Number(selectedItem.resolvedQty) || 0);

    if (!qty || qty <= 0) {
      return toast.error('Please enter a valid positive quantity');
    }
    if (qty > remaining) {
      return toast.error(`Quantity cannot exceed remaining damaged stock (${remaining})`);
    }

    setSubmitting(true);
    try {
      const resolveFn = httpsCallable(functions, 'resolveQuarantinedStock');
      const payload = {
        quarantineId: selectedItem.id,
        action: actionType,
        quantity: qty,
        vendorId: vendorId || selectedItem.vendorId || selectedItem.supplierId || '',
        vendorName: vendorName || selectedItem.vendorName || selectedItem.supplierName || '',
        debitNoteRef: actionType === 'RETURN_TO_VENDOR' ? debitNoteRef : '',
        writeOffReason: actionType === 'WRITE_OFF' ? writeOffReason : ''
      };

      const result = await resolveFn(payload);
      toast.success(
        actionType === 'RETURN_TO_VENDOR'
          ? `Returned ${qty} units to vendor! Debit note posted.`
          : `Scrapped / Written-off ${qty} units. Expense recorded.`
      );
      closeActionModal();
    } catch (err) {
      console.error('Quarantine resolution error:', err);
      toast.error(err.message || 'Failed to resolve quarantined stock');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = quarantineItems.filter(item => {
    const currentStatus = item.status || 'PENDING';
    if (statusFilter !== 'ALL' && currentStatus !== statusFilter) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.skuCode?.toLowerCase().includes(term) ||
      item.batchId?.toLowerCase().includes(term) ||
      item.batchNumber?.toLowerCase().includes(term) ||
      item.damageReason?.toLowerCase().includes(term) ||
      item.hubId?.toLowerCase().includes(term)
    );
  });

  const columns = [
    {
      header: 'SKU & Batch Details',
      key: 'skuCode',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{item.skuCode}</span>
          <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
            Batch: <span className="font-mono text-gray-800">{item.batchId || item.batchNumber || '—'}</span>
          </p>
          {item.grnId && (
            <p className="text-[9px] text-gray-400 font-medium">Ref GRN: {item.grnId}</p>
          )}
        </div>
      )
    },
    {
      header: 'Warehouse Hub',
      key: 'hubId',
      render: (item) => (
        <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
          <MapPin size={12} className="text-gray-400" />
          {item.hubId || 'HUB_SAMASTIPUR'}
        </span>
      )
    },
    {
      header: 'Quarantine Quantity',
      key: 'damagedQty',
      render: (item) => {
        const total = Number(item.damagedQty) || 0;
        const resolved = Number(item.resolvedQty) || 0;
        const remaining = total - resolved;
        return (
          <div>
            <span className="font-black text-sm text-red-700">{total} units</span>
            {resolved > 0 && (
              <p className="text-[10px] text-gray-500 font-medium">
                Resolved: {resolved} | <span className="text-amber-700 font-bold">Remaining: {remaining}</span>
              </p>
            )}
          </div>
        );
      }
    },
    {
      header: 'Damage Reason',
      key: 'damageReason',
      render: (item) => (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
            {item.damageReason || 'DAMAGED_IN_TRANSIT'}
          </span>
          {item.writeOffReason && (
            <p className="text-[10px] text-gray-500 mt-1 italic">Note: {item.writeOffReason}</p>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      key: 'status',
      render: (item) => {
        const s = item.status || 'PENDING';
        const colorMap = {
          PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
          PARTIALLY_RESOLVED: 'bg-blue-50 text-blue-800 border-blue-200',
          RETURNED_TO_VENDOR: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          WRITTEN_OFF: 'bg-gray-100 text-gray-700 border-gray-300'
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${colorMap[s] || 'bg-gray-50 text-gray-600'}`}>
            {s.replace(/_/g, ' ')}
          </span>
        );
      }
    },
    {
      header: 'Inward Date',
      key: 'createdAt',
      render: (item) => (
        <span className="text-xs text-gray-500 font-medium">
          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('en-IN') : '—'}
        </span>
      )
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (item) => {
        const remaining = (Number(item.damagedQty) || 0) - (Number(item.resolvedQty) || 0);
        const isSettled = remaining <= 0 || ['RETURNED_TO_VENDOR', 'WRITTEN_OFF'].includes(item.status);

        if (isReadOnly || isSettled) {
          return (
            <span className="text-[11px] text-gray-400 font-bold flex items-center gap-1">
              <CheckCircle2 size={13} className="text-emerald-600" /> Resolved
            </span>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openActionModal(item, 'RETURN_TO_VENDOR')}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black flex items-center gap-1 border border-emerald-200 transition-colors"
              title="Return defective stock to vendor with debit note"
            >
              <ArrowRightLeft size={12} /> RTV
            </button>
            <button
              onClick={() => openActionModal(item, 'WRITE_OFF')}
              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 rounded-lg text-xs font-black flex items-center gap-1 border border-red-200 transition-colors"
              title="Scrap stock and book inventory shrinkage loss"
            >
              <Trash2 size={12} /> Write-Off
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Quarantine & Defective Stock Desk"
        subtitle="Review damaged items isolated during Goods Receipt (GRN), issue Vendor Debit Notes (RTV), or authorize shrinkage write-offs."
      />

      {isReadOnly && <ReadOnlyBanner />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Quarantine Batches</p>
          <p className="text-3xl font-black text-amber-700 mt-1">
            {quarantineItems.filter(i => (i.status || 'PENDING') === 'PENDING').length}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Damaged Units</p>
          <p className="text-3xl font-black text-red-600 mt-1">
            {quarantineItems.reduce((acc, i) => acc + (Number(i.damagedQty) || 0), 0)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Returned to Vendor</p>
          <p className="text-3xl font-black text-emerald-700 mt-1">
            {quarantineItems.filter(i => i.status === 'RETURNED_TO_VENDOR').length}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scrapped / Written Off</p>
          <p className="text-3xl font-black text-gray-800 mt-1">
            {quarantineItems.filter(i => i.status === 'WRITTEN_OFF').length}
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by SKU, Batch, Reason, or Hub..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-xs text-gray-700 outline-none"
          >
            <option value="PENDING">Pending Action Only</option>
            <option value="ALL">All Statuses</option>
            <option value="PARTIALLY_RESOLVED">Partially Resolved</option>
            <option value="RETURNED_TO_VENDOR">Returned to Vendor</option>
            <option value="WRITTEN_OFF">Written Off</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filteredItems} loading={loading} />

      {/* RESOLUTION MODAL */}
      {selectedItem && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in duration-300">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  {actionType === 'RETURN_TO_VENDOR' ? (
                    <>
                      <ArrowRightLeft className="text-emerald-700" size={20} />
                      Return Defective Stock to Vendor (RTV)
                    </>
                  ) : (
                    <>
                      <Trash2 className="text-red-700" size={20} />
                      Write-Off / Scrap Damaged Stock
                    </>
                  )}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  SKU: <span className="font-mono font-bold text-gray-900">{selectedItem.skuCode}</span> | Batch: <span className="font-mono font-bold">{selectedItem.batchId}</span>
                </p>
              </div>
              <button onClick={closeActionModal} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-red-50/70 rounded-xl border border-red-100 text-xs text-red-900">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Reported Damage Reason:
                </p>
                <p className="mt-0.5 font-medium">{selectedItem.damageReason || 'Torn packaging / damaged on receipt'}</p>
                <p className="text-[10px] text-red-600 mt-1">
                  Remaining Damaged Stock: {(Number(selectedItem.damagedQty) || 0) - (Number(selectedItem.resolvedQty) || 0)} units
                </p>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">
                  {actionType === 'RETURN_TO_VENDOR' ? 'Return Quantity *' : 'Scrap / Write-Off Quantity *'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={(Number(selectedItem.damagedQty) || 0) - (Number(selectedItem.resolvedQty) || 0)}
                  value={actionQty}
                  onChange={(e) => setActionQty(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:bg-white focus:border-primary"
                />
              </div>

              {/* RTV Branch */}
              {actionType === 'RETURN_TO_VENDOR' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Vendor / Supplier Name *</label>
                    <input
                      type="text"
                      required
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g. IFFCO Bihar Agro Supply"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Debit Note Reference # *</label>
                    <input
                      type="text"
                      required
                      value={debitNoteRef}
                      onChange={(e) => setDebitNoteRef(e.target.value)}
                      placeholder="e.g. DN-2026-0042"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm font-bold text-gray-900 outline-none focus:bg-white focus:border-primary"
                    />
                    <p className="text-[10px] text-gray-400">
                      Double-entry: Debits ACCOUNTS_PAYABLE and credits INVENTORY_QUARANTINE_ASSET.
                    </p>
                  </div>
                </>
              )}

              {/* Write-off Branch */}
              {actionType === 'WRITE_OFF' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Write-Off Justification *</label>
                  <textarea
                    required
                    rows={3}
                    value={writeOffReason}
                    onChange={(e) => setWriteOffReason(e.target.value)}
                    placeholder="Enter inspection note explaining why stock cannot be salvaged or returned..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-xs text-gray-900 outline-none focus:bg-white focus:border-primary"
                  />
                  <p className="text-[10px] text-gray-400">
                    Double-entry: Debits INVENTORY_SHRINKAGE_LOSS and credits INVENTORY_QUARANTINE_ASSET.
                  </p>
                </div>
              )}

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white shadow-md transition-all flex items-center justify-center gap-2 ${
                    actionType === 'RETURN_TO_VENDOR'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-red-700 hover:bg-red-800'
                  } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {actionType === 'RETURN_TO_VENDOR' ? 'Authorize Vendor Return (RTV)' : 'Authorize Write-Off & Scrap'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

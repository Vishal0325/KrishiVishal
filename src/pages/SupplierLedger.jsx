import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  Timestamp,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  BookOpen,
  Plus,
  Search,
  Building2,
  Calendar,
  CreditCard,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Wallet,
  Landmark,
  X,
  Loader2,
  Printer
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAYMENT_MODES = [
  'NEFT / RTGS',
  'IMPS',
  'UPI / QR Transfer',
  'Cheque',
  'Cash Payment',
  'Direct Bank Transfer'
];

const SupplierLedger = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Payment Form State
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT / RTGS');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Listen to Suppliers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return unsub;
  }, []);

  // Listen to Supplier Ledger Entries
  useEffect(() => {
    const q = query(collection(db, 'supplier_ledger'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setLedgerEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Ledger load error:', err);
      toast.error('Failed to load supplier ledger');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Goods Receipts to auto-correlate bills
  useEffect(() => {
    const q = query(collection(db, 'goods_receipts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setGoodsReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Record Manual Payment to Supplier
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentSupplierId || !paymentAmount || Number(paymentAmount) <= 0) {
      toast.error('Please select supplier and enter a valid payment amount');
      return;
    }

    const supplier = suppliers.find(s => s.id === paymentSupplierId);
    if (!supplier) return;

    setRecordingPayment(true);
    try {
      const entryRef = doc(collection(db, 'supplier_ledger'));
      const refId = utrNumber.trim() ? utrNumber.trim() : `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${entryRef.id.slice(0, 5).toUpperCase()}`;

      const amountNum = Number(paymentAmount);

      await setDoc(entryRef, {
        id: entryRef.id,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierGstin: supplier.gstin || '',
        type: 'BANK_PAYMENT',
        entryType: 'DEBIT', // Debit lowers liability to supplier
        debit: amountNum,
        credit: 0,
        amount: amountNum,
        paymentMode,
        referenceId: refId,
        remarks: paymentRemarks || `Payment to ${supplier.name} via ${paymentMode}`,
        recordedBy: user?.uid || 'ADMIN',
        recordedByEmail: user?.email || 'admin@krishivishal.com',
        timestamp: Timestamp.now(),
        paymentDate: paymentDate || new Date().toISOString().split('T')[0]
      });

      await addAuditLog('RECORD_SUPPLIER_PAYMENT', 'Supplier', supplier.id, {
        supplierName: supplier.name,
        amount: amountNum,
        paymentMode,
        referenceId: refId
      });

      toast.success(`Payment of ${formatCurrency(amountNum)} recorded for ${supplier.name}`);
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setUtrNumber('');
      setPaymentRemarks('');
    } catch (error) {
      console.error('Payment record failed:', error);
      toast.error('Failed to record payment: ' + error.message);
    } finally {
      setRecordingPayment(false);
    }
  };

  // Build Unified Ledger (Combining recorded payments + GRN invoices)
  const unifiedEntries = [
    // 1. GRN Invoices (Credits - Increases liability)
    ...goodsReceipts.map(grn => ({
      id: `grn-${grn.id}`,
      supplierId: grn.supplierId,
      supplierName: grn.supplierName,
      type: 'INVOICE_BILL',
      entryType: 'CREDIT',
      debit: 0,
      credit: grn.totalGRNAmount || 0,
      amount: grn.totalGRNAmount || 0,
      referenceId: grn.invoiceNumber || grn.grnNumber,
      grnNumber: grn.grnNumber,
      remarks: `Goods Receipt: ${grn.totalReceivedUnits || 0} units (${grn.items?.length || 0} items)`,
      timestamp: grn.createdAt,
      recordedByEmail: grn.recordedByEmail
    })),
    // 2. Direct Ledger Payments (Debits - Decreases liability)
    ...ledgerEntries
  ].sort((a, b) => {
    const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
    const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
    return tB - tA; // latest first
  });

  // Filter entries
  const filteredEntries = unifiedEntries.filter(entry => {
    const matchSupplier = selectedSupplierId === 'ALL' || entry.supplierId === selectedSupplierId;
    const matchSearch = !searchTerm ||
      entry.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.referenceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.remarks?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSupplier && matchSearch;
  });

  // Compute Balances
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  const totalBilled = (selectedSupplierId === 'ALL' ? unifiedEntries : unifiedEntries.filter(e => e.supplierId === selectedSupplierId))
    .reduce((sum, e) => sum + (e.credit || 0), 0);

  const totalPaid = (selectedSupplierId === 'ALL' ? unifiedEntries : unifiedEntries.filter(e => e.supplierId === selectedSupplierId))
    .reduce((sum, e) => sum + (e.debit || 0), 0);

  const netPayable = totalBilled - totalPaid;

  // Table Columns
  const columns = [
    {
      header: 'Date',
      key: 'timestamp',
      render: (e) => (
        <div>
          <p className="font-bold text-xs text-gray-800">
            {e.timestamp?.toDate ? e.timestamp.toDate().toLocaleDateString('en-IN') : '—'}
          </p>
          <p className="text-[10px] text-gray-400 font-mono">
            {e.timestamp?.toDate ? e.timestamp.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </p>
        </div>
      )
    },
    {
      header: 'Supplier',
      key: 'supplierName',
      render: (e) => (
        <div>
          <p className="font-black text-sm text-gray-900">{e.supplierName}</p>
          <span className="text-[10px] font-mono text-gray-400">Ref: {e.referenceId || '—'}</span>
        </div>
      )
    },
    {
      header: 'Transaction Type',
      key: 'type',
      render: (e) => {
        if (e.type === 'INVOICE_BILL') {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-blue-100 text-blue-800">
              <FileText size={11} /> Invoice (Bill)
            </span>
          );
        } else if (e.type === 'BANK_PAYMENT') {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-green-100 text-green-800">
              <CheckCircle2 size={11} /> Bank Payment
            </span>
          );
        } else {
          return (
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-purple-100 text-purple-800">
              {e.type}
            </span>
          );
        }
      }
    },
    {
      header: 'Debit (Paid ₹)',
      key: 'debit',
      render: (e) => (
        e.debit > 0 ? (
          <span className="font-black text-sm text-green-700 font-mono flex items-center gap-0.5">
            <ArrowDownLeft size={14} />
            {formatCurrency(e.debit)}
          </span>
        ) : (
          <span className="text-gray-300 font-mono text-xs">—</span>
        )
      )
    },
    {
      header: 'Credit (Billed ₹)',
      key: 'credit',
      render: (e) => (
        e.credit > 0 ? (
          <span className="font-black text-sm text-blue-700 font-mono flex items-center gap-0.5">
            <ArrowUpRight size={14} />
            {formatCurrency(e.credit)}
          </span>
        ) : (
          <span className="text-gray-300 font-mono text-xs">—</span>
        )
      )
    },
    {
      header: 'Description / Remarks',
      key: 'remarks',
      render: (e) => (
        <span className="text-xs text-gray-600 font-medium">
          {e.remarks || e.paymentMode || '—'}
        </span>
      )
    },
    {
      header: 'Recorded By',
      key: 'recordedByEmail',
      render: (e) => (
        <span className="text-[11px] text-gray-400">
          {e.recordedByEmail ? e.recordedByEmail.split('@')[0] : 'System'}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <BookOpen className="mr-3 text-[#1b5e20]" size={28} />
            Supplier Ledger & Accounts Payable (A/P)
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Track vendor billing, bank settlement transfers, and real-time outstanding supplier liabilities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPaymentSupplierId(selectedSupplierId !== 'ALL' ? selectedSupplierId : '');
              setIsPaymentModalOpen(true);
            }}
            className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
          >
            <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
            Record Supplier Payment
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Invoiced (Billed)</p>
          <p className="text-3xl font-black text-blue-700 mt-1 font-mono">{formatCurrency(totalBilled)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Payments Made</p>
          <p className="text-3xl font-black text-green-700 mt-1 font-mono">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Outstanding Payable</p>
          <p className={`text-3xl font-black mt-1 font-mono ${netPayable > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(netPayable)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Supplier Info</p>
          <p className="text-sm font-black text-gray-800 mt-1 truncate">
            {selectedSupplier ? selectedSupplier.name : 'All Vendors Combined'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {selectedSupplier ? `Terms: ${selectedSupplier.paymentTerms || 'NET_15'}` : `${suppliers.length} Registered Vendors`}
          </p>
        </div>
      </div>

      {/* Search & Supplier Selector Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by vendor, reference (UTR / Invoice), or remarks..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>

        <select
          value={selectedSupplierId}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none max-w-sm"
        >
          <option value="ALL">🏢 All Suppliers (Consolidated)</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.paymentTerms || 'NET_15'})</option>
          ))}
        </select>
      </div>

      {/* DataTable */}
      <DataTable columns={columns} data={filteredEntries} loading={loading} />

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <CreditCard size={20} className="text-[#1b5e20]" />
                  Record Supplier Bank Settlement
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Post a debit payment entry to reduce outstanding accounts payable.
                </p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              {/* Supplier Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Supplier / Vendor *</label>
                <select
                  required
                  value={paymentSupplierId}
                  onChange={(e) => setPaymentSupplierId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.bankDetails?.accountNo ? `(A/c: ${s.bankDetails.accountNo})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="1"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  >
                    {PAYMENT_MODES.map(mode => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* UTR & Payment Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">UTR / Ref Number</label>
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UTR123456789"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-mono text-xs font-bold text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Remarks</label>
                <textarea
                  rows={2}
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  placeholder="e.g. Settled against GRN invoice batch #2026-08"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-medium text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={recordingPayment}
                className="w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {recordingPayment && <Loader2 size={18} className="animate-spin" />}
                Post Debit Payment Entry
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierLedger;

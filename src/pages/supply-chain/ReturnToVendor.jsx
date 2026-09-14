import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  RotateCcw,
  FileText,
  Plus,
  Truck,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Download,
  Search,
  X,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReturnToVendor() {
  const { user } = useAuth();
  const [rtvList, setRtvList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRtvForPrint, setSelectedRtvForPrint] = useState(null);

  // New RTV Form State
  const [form, setForm] = useState({
    supplierId: '',
    supplierName: '',
    warehouseId: '',
    warehouseName: '',
    productName: '',
    batchNumber: '',
    returnQuantity: '',
    unitPrice: '',
    taxRate: 5,
    reason: 'EXPIRED_STOCK', // EXPIRED_STOCK | DAMAGED_PACKAGING | QUALITY_REJECT | SLOW_MOVING
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    notes: ''
  });

  // Fetch Suppliers, Products, Warehouses, and RTVs
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(query(collection(db, 'rtv_returns'), orderBy('createdAt', 'desc')), (snap) => {
        setRtvList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'suppliers'), (snap) => {
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'products'), (snap) => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'warehouses'), (snap) => {
        setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Handle Supplier Selection
  const handleSupplierChange = (e) => {
    const sId = e.target.value;
    const s = suppliers.find(sup => sup.id === sId);
    setForm(prev => ({
      ...prev,
      supplierId: sId,
      supplierName: s?.name || s?.companyName || ''
    }));
  };

  // Handle Warehouse Selection
  const handleWarehouseChange = (e) => {
    const wId = e.target.value;
    const w = warehouses.find(wh => wh.id === wId);
    setForm(prev => ({
      ...prev,
      warehouseId: wId,
      warehouseName: w?.name || ''
    }));
  };

  // Create RTV Gatepass & Debit Note
  const handleCreateRTV = async (e) => {
    e.preventDefault();
    const qty = Number(form.returnQuantity || 0);
    const price = Number(form.unitPrice || 0);
    const tax = Number(form.taxRate || 0);
    const taxableAmount = qty * price;
    const taxAmount = (taxableAmount * tax) / 100;
    const totalDebitAmount = taxableAmount + taxAmount;

    if (qty <= 0 || price <= 0) {
      toast.error('Quantity and Unit Price must be greater than zero.');
      return;
    }

    const rtvNumber = `RTV-${Date.now().toString().slice(-6)}`;
    const debitNoteNumber = `DN-${Date.now().toString().slice(-6)}`;

    try {
      // 1. Save RTV Record
      await addDoc(collection(db, 'rtv_returns'), {
        ...form,
        rtvNumber,
        debitNoteNumber,
        returnQuantity: qty,
        unitPrice: price,
        taxableAmount,
        taxAmount,
        totalDebitAmount,
        status: 'DISPATCHED_TO_VENDOR', // DISPATCHED_TO_VENDOR | SETTLED_CREDIT_ADJUSTED
        createdAt: Timestamp.now(),
        createdBy: user?.email || 'Admin'
      });

      // 2. Post Debit Note Entry into Journal Vouchers / Ledger
      await addDoc(collection(db, 'journal_vouchers'), {
        voucherNumber: `JV-${debitNoteNumber}`,
        date: new Date().toISOString().slice(0, 10),
        reference: debitNoteNumber,
        narration: `Debit Note for Return to Vendor: ${form.supplierName} (${form.productName} ${qty} Units - Reason: ${form.reason})`,
        debitAccount: `${form.supplierName} (Sundry Creditor)`,
        creditAccount: 'Agri Purchase Returns & Stock Reversal',
        amount: totalDebitAmount,
        createdAt: Timestamp.now(),
        createdBy: user?.email || 'Admin'
      });

      toast.success(`RTV Gatepass ${rtvNumber} and Debit Note ${debitNoteNumber} generated!`);
      setIsModalOpen(false);
      setForm({
        supplierId: '',
        supplierName: '',
        warehouseId: '',
        warehouseName: '',
        productName: '',
        batchNumber: '',
        returnQuantity: '',
        unitPrice: '',
        taxRate: 5,
        reason: 'EXPIRED_STOCK',
        vehicleNumber: '',
        driverName: '',
        driverPhone: '',
        notes: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to create RTV.');
    }
  };

  // Print Gatepass Modal
  const handlePrint = (rtv) => {
    setSelectedRtvForPrint(rtv);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#991B1B] to-[#B91C1C] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <RotateCcw size={14} className="text-rose-200" />
              Vendor Return Gatepass & Debit Note Engine
            </div>
            <h2 className="text-2xl font-black">Return to Vendor (RTV) & Debit Notes</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Dispatch expired, damaged, or quality-rejected fertilizer/seed batches back to manufacturers, generate official dispatch gatepasses, and automatically post accounting Debit Notes.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-rose-50 text-rose-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Create RTV & Debit Note
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total RTV Dispatches</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{rtvList.length}</h3>
            <div className="h-10 w-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 font-bold">
              <RotateCcw size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Recorded return gatepasses</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Debit Note Value</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-rose-700">
              {formatCurrency(rtvList.reduce((acc, r) => acc + Number(r.totalDebitAmount || 0), 0))}
            </h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <FileText size={20} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-600 mt-2 font-medium">Debited to supplier accounts</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Returned Units / Quantity</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {rtvList.reduce((acc, r) => acc + Number(r.returnQuantity || 0), 0)} Units
            </h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <Truck size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Stock deducted from inventory</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Settlement Status</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-lg font-black text-emerald-700">100% JV Synced</h3>
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Auto-posted to general ledger</p>
        </div>
      </div>

      {/* Main RTV Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="text-[#991B1B]" size={18} />
            Vendor Return Shipments & Active Debit Notes
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {rtvList.length} RTV Records
          </span>
        </div>

        <DataTable
          data={rtvList}
          columns={[
            {
              header: 'RTV & Debit Note #',
              accessor: 'rtvNumber',
              render: (row) => (
                <div>
                  <span className="font-mono font-bold text-gray-900 block">{row.rtvNumber}</span>
                  <span className="font-mono text-xs font-bold text-rose-700">DN: {row.debitNoteNumber}</span>
                </div>
              )
            },
            {
              header: 'Supplier Name',
              accessor: 'supplierName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.supplierName}</span>
                  <span className="text-[11px] text-gray-500 font-medium">Hub: {row.warehouseName || 'Central Depot'}</span>
                </div>
              )
            },
            {
              header: 'Item & Batch',
              accessor: 'productName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-800 block">{row.productName}</span>
                  <span className="text-xs font-mono text-gray-500">Batch: {row.batchNumber || 'N/A'} • {row.returnQuantity} Qty</span>
                </div>
              )
            },
            {
              header: 'Return Reason',
              accessor: 'reason',
              render: (row) => {
                const labels = {
                  EXPIRED_STOCK: 'Expired Batch (समाप्त तिथि)',
                  DAMAGED_PACKAGING: 'Damaged Packaging (पैकेट खराब)',
                  QUALITY_REJECT: 'Lab / QC Quality Reject',
                  SLOW_MOVING: 'Seasonal Return / Excess'
                };
                return (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-xs font-bold border border-amber-200">
                    {labels[row.reason] || row.reason}
                  </span>
                );
              }
            },
            {
              header: 'Debit Amount (₹)',
              accessor: 'totalDebitAmount',
              render: (row) => (
                <div>
                  <span className="font-black text-rose-700 block">{formatCurrency(row.totalDebitAmount)}</span>
                  <span className="text-[10px] text-gray-400">Incl. {row.taxRate}% GST</span>
                </div>
              )
            },
            {
              header: 'Dispatch Vehicle',
              accessor: 'vehicleNumber',
              render: (row) => (
                <div>
                  <span className="font-mono text-xs font-bold text-gray-800 block">{row.vehicleNumber || 'Self-Pickup'}</span>
                  <span className="text-[11px] text-gray-500">{row.driverName ? `${row.driverName} (${row.driverPhone || ''})` : '-'}</span>
                </div>
              )
            },
            {
              header: 'Actions',
              accessor: 'id',
              render: (row) => (
                <button
                  onClick={() => handlePrint(row)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Printer size={13} />
                  Print Gatepass
                </button>
              )
            }
          ]}
        />
      </div>

      {/* Create RTV Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <RotateCcw className="text-[#991B1B]" size={20} />
                Create Return to Vendor (RTV) & Debit Note
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRTV} className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Select Supplier / Manufacturer</label>
                  <select
                    required
                    value={form.supplierId}
                    onChange={handleSupplierChange}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Origin Warehouse / Hub</label>
                  <select
                    required
                    value={form.warehouseId}
                    onChange={handleWarehouseChange}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  >
                    <option value="">Select Hub...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Product / SKU Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DAP Fertilizer 50kg"
                    value={form.productName}
                    onChange={(e) => setForm({ ...form, productName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Batch Number (लॉट / बैच)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-2026-X8"
                    value={form.batchNumber}
                    onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Return Qty (मात्रा)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 50"
                    value={form.returnQuantity}
                    onChange={(e) => setForm({ ...form, returnQuantity: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-black text-gray-900 outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Unit Rate (दर ₹)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    placeholder="₹ Rate"
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-black text-gray-900 outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">GST Tax %</label>
                  <select
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5% (Fertilizers/Seeds)</option>
                    <option value="12">12% (Micronutrients)</option>
                    <option value="18">18% (Pesticides)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Return Reason (वापसी का कारण)</label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                >
                  <option value="EXPIRED_STOCK">Expired Batch (समाप्त तिथि)</option>
                  <option value="DAMAGED_PACKAGING">Damaged Packaging / Leakage (पैकेट खराब)</option>
                  <option value="QUALITY_REJECT">Lab / QC Quality Rejection (गुणवत्ता फेल)</option>
                  <option value="SLOW_MOVING">Seasonal Return / Excess Stock</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Transport Vehicle #</label>
                  <input
                    type="text"
                    placeholder="e.g. BR-11-GA-4521"
                    value={form.vehicleNumber}
                    onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Driver Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={form.driverName}
                    onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Driver Phone</label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={form.driverPhone}
                    onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#991B1B]"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900">
                <span className="font-bold">Estimated Debit Note Total:</span>
                <span className="font-black text-base">
                  {formatCurrency(
                    Number(form.returnQuantity || 0) * Number(form.unitPrice || 0) * (1 + Number(form.taxRate || 0) / 100)
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#991B1B] hover:bg-[#7f1d1d] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Generate RTV & Debit Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

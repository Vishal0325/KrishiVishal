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
  ClipboardCheck,
  ScanBarcode,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRightLeft,
  X,
  Printer
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PhysicalStockAudit() {
  const { user } = useAuth();
  const [audits, setAudits] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Barcode / Audit Form
  const [form, setForm] = useState({
    warehouseId: '',
    warehouseName: '',
    productId: '',
    productName: '',
    skuCode: '',
    systemStock: 0,
    physicalCount: '',
    unitPrice: 0,
    varianceReason: 'DAMAGED_LEAKAGE', // DAMAGED_LEAKAGE | PILFERAGE_THEFT | PACKAGING_LOSS | EXCESS_UNRECORDED | SYSTEM_ERROR
    auditorNotes: ''
  });

  // Fetch Audits, Products, Warehouses
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(query(collection(db, 'physical_stock_audits'), orderBy('createdAt', 'desc')), (snap) => {
        setAudits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'products'), (snap) => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'warehouses'), (snap) => {
        const whList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWarehouses(whList);
        if (whList.length > 0 && !selectedWarehouse) {
          setSelectedWarehouse(whList[0].id);
        }
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Handle Product Selection
  const handleProductSelect = (e) => {
    const pId = e.target.value;
    const p = products.find(prod => prod.id === pId);
    setForm(prev => ({
      ...prev,
      productId: pId,
      productName: p?.title || '',
      skuCode: p?.sku || p?.id?.slice(0, 8) || 'SKU-001',
      systemStock: Number(p?.stock || p?.totalStock || 50),
      unitPrice: Number(p?.price || p?.basePrice || 500)
    }));
  };

  // Handle Warehouse Selection
  const handleWarehouseSelect = (e) => {
    const wId = e.target.value;
    const w = warehouses.find(wh => wh.id === wId);
    setForm(prev => ({
      ...prev,
      warehouseId: wId,
      warehouseName: w?.name || ''
    }));
  };

  // Submit Stock Audit & Post Write-off Journal Entry
  const handleSaveAudit = async (e) => {
    e.preventDefault();
    const system = Number(form.systemStock || 0);
    const physical = Number(form.physicalCount || 0);
    const variance = physical - system; // negative = shortage, positive = excess
    const unitPrice = Number(form.unitPrice || 0);
    const varianceValue = Math.abs(variance) * unitPrice;

    const auditNumber = `AUDIT-${Date.now().toString().slice(-6)}`;

    try {
      // 1. Save Audit Record
      await addDoc(collection(db, 'physical_stock_audits'), {
        ...form,
        auditNumber,
        systemStock: system,
        physicalCount: physical,
        variance,
        varianceValue,
        status: variance === 0 ? 'MATCHED' : (variance < 0 ? 'STOCK_SHORTAGE_WRITTEN_OFF' : 'STOCK_EXCESS_ADJUSTED'),
        createdAt: Timestamp.now(),
        auditedBy: user?.email || 'Warehouse Supervisor'
      });

      // 2. If Shortage, post Write-off Expense & Reversal Journal Entry
      if (variance < 0) {
        await addDoc(collection(db, 'journal_vouchers'), {
          voucherNumber: `JV-${auditNumber}`,
          date: new Date().toISOString().slice(0, 10),
          reference: auditNumber,
          narration: `Physical Stock Shortage Write-off (${Math.abs(variance)} Units of ${form.productName} - Reason: ${form.varianceReason})`,
          debitAccount: 'Inventory Shrinkage & Damaged Stock Write-off',
          creditAccount: 'Agri Stock-in-Trade (Current Asset)',
          amount: varianceValue,
          createdAt: Timestamp.now(),
          createdBy: user?.email || 'Admin'
        });
      }

      toast.success(`Physical Stock Audit ${auditNumber} recorded & variance adjusted!`);
      setIsModalOpen(false);
      setForm({
        warehouseId: '',
        warehouseName: '',
        productId: '',
        productName: '',
        skuCode: '',
        systemStock: 0,
        physicalCount: '',
        unitPrice: 0,
        varianceReason: 'DAMAGED_LEAKAGE',
        auditorNotes: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to post audit record.');
    }
  };

  // Metrics
  const totalVarianceShortageValue = useMemo(() => {
    return audits
      .filter(a => a.variance < 0)
      .reduce((acc, a) => acc + Number(a.varianceValue || 0), 0);
  }, [audits]);

  const auditAccuracyRate = useMemo(() => {
    if (audits.length === 0) return 100;
    const matched = audits.filter(a => a.variance === 0).length;
    return Math.round((matched / audits.length) * 100);
  }, [audits]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#14532D] to-[#166534] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <ScanBarcode size={14} className="text-lime-300" />
              Warehouse Cycle Count & Stock Variance Engine
            </div>
            <h2 className="text-2xl font-black">Physical Stock Audit & Cycle Counting</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Conduct barcode-assisted physical inventory counts at central depots, detect bag/bottle shrinkage or transit damages, and post automated Write-off adjustment vouchers.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-lime-400 hover:bg-lime-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Start New Cycle Count Audit
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Items Audited</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{audits.length}</h3>
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 font-bold">
              <ClipboardCheck size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Across all regional depots</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Inventory Accuracy Rate</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-emerald-700">{auditAccuracyRate}%</h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-600 mt-2 font-medium">Physical matching system</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Shortage Write-off</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-rose-600">{formatCurrency(totalVarianceShortageValue)}</h3>
            <div className="h-10 w-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 font-bold">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-[11px] text-rose-600 mt-2 font-medium">Debited to shrinkage expense</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Barcode Scanner Sync</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-lg font-black text-gray-900">Active Scanner</h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <ScanBarcode size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Handheld 2D/1D Gun Support</p>
        </div>
      </div>

      {/* Audits Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="text-[#14532D]" size={18} />
            Cycle Count Audit Log & Variance Adjustments
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {audits.length} Audited Batches
          </span>
        </div>

        <DataTable
          data={audits}
          columns={[
            {
              header: 'Audit ID & Date',
              accessor: 'auditNumber',
              render: (row) => (
                <div>
                  <span className="font-mono font-bold text-gray-900 block">{row.auditNumber}</span>
                  <span className="text-xs text-gray-500">{formatDateTime(row.createdAt)}</span>
                </div>
              )
            },
            {
              header: 'Depot / Warehouse',
              accessor: 'warehouseName',
              render: (row) => <span className="font-bold text-gray-800">{row.warehouseName || 'Central Depot'}</span>
            },
            {
              header: 'SKU / Product Name',
              accessor: 'productName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.productName}</span>
                  <span className="font-mono text-xs text-gray-500">SKU: {row.skuCode}</span>
                </div>
              )
            },
            {
              header: 'System Stock',
              accessor: 'systemStock',
              render: (row) => <span className="font-bold text-gray-700">{row.systemStock} Units</span>
            },
            {
              header: 'Physical Count',
              accessor: 'physicalCount',
              render: (row) => <span className="font-black text-gray-900">{row.physicalCount} Units</span>
            },
            {
              header: 'Variance (+/-)',
              accessor: 'variance',
              render: (row) => {
                if (row.variance === 0) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                      <CheckCircle2 size={12} /> 0 (Match)
                    </span>
                  );
                }
                if (row.variance < 0) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-black border border-rose-200">
                      {row.variance} Shortage ({formatCurrency(row.varianceValue)})
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black border border-blue-200">
                    +{row.variance} Excess ({formatCurrency(row.varianceValue)})
                  </span>
                );
              }
            },
            {
              header: 'Auditor / Reason',
              accessor: 'auditedBy',
              render: (row) => (
                <div>
                  <span className="text-xs font-semibold text-gray-700 block">{row.varianceReason?.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-gray-400">By: {row.auditedBy}</span>
                </div>
              )
            }
          ]}
        />
      </div>

      {/* Add Cycle Count Audit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="text-[#14532D]" size={20} />
                Conduct Physical Cycle Count
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAudit} className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Select Warehouse / Depot</label>
                  <select
                    required
                    value={form.warehouseId}
                    onChange={handleWarehouseSelect}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#14532D]"
                  >
                    <option value="">Select Hub...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Select Product / Item</label>
                  <select
                    required
                    value={form.productId}
                    onChange={handleProductSelect}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#14532D]"
                  >
                    <option value="">Select Product...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-gray-400 uppercase text-[10px] font-bold">System Recorded Stock</span>
                  <p className="text-lg font-black text-gray-900">{form.systemStock} Units</p>
                </div>
                <div>
                  <span className="text-gray-400 uppercase text-[10px] font-bold">Unit Valuation Price</span>
                  <p className="text-lg font-black text-emerald-700">{formatCurrency(form.unitPrice)}</p>
                </div>
              </div>

              <div>
                <label className="block text-gray-800 mb-1">Physical Counted Quantity (असल में मौजूद गिनती)</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="Enter counted quantity..."
                  value={form.physicalCount}
                  onChange={(e) => setForm({ ...form, physicalCount: e.target.value })}
                  className="w-full bg-emerald-50/50 border-2 border-emerald-300 rounded-xl p-3 font-black text-xl text-gray-900 outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Reason for Variance (अंतर का कारण)</label>
                <select
                  value={form.varianceReason}
                  onChange={(e) => setForm({ ...form, varianceReason: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#14532D]"
                >
                  <option value="DAMAGED_LEAKAGE">Damaged / Bag Leakage (बोरी फटी / रिसाव)</option>
                  <option value="PILFERAGE_THEFT">Pilferage / Transit Shrinkage</option>
                  <option value="EXCESS_UNRECORDED">Unrecorded Surplus from Supplier</option>
                  <option value="SYSTEM_ERROR">System Dispatch Logging Error</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Auditor Verification Notes</label>
                <textarea
                  rows="2"
                  placeholder="Additional audit notes or barcode scanner remarks..."
                  value={form.auditorNotes}
                  onChange={(e) => setForm({ ...form, auditorNotes: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-medium text-gray-800 outline-none focus:border-[#14532D]"
                />
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
                  className="w-1/2 py-3 bg-[#14532D] hover:bg-[#166534] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Submit & Write-off Variance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

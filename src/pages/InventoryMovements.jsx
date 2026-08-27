import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  increment,
  Timestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
import {
  History,
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Package,
  Layers,
  Calendar,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  SlidersHorizontal,
  X,
  Loader2,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

const MOVEMENT_TYPES = [
  { value: 'ALL', label: 'All Movements' },
  { value: 'PURCHASE_RECEIPT', label: 'Purchase Receipt (GRN)' },
  { value: 'ORDER_RESERVE', label: 'Order Reserve' },
  { value: 'DISPATCH_SALE', label: 'Dispatch / Sale' },
  { value: 'RETURN_RESTOCK', label: 'Return Restock' },
  { value: 'DAMAGE_ADJUSTMENT', label: 'Damage / Expiry' },
  { value: 'MANUAL_AUDIT', label: 'Manual Cycle Count' },
];

const InventoryMovements = () => {
  const { user } = useAuth();
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // Adjustment Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustType, setAdjustType] = useState('MANUAL_AUDIT');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustDirection, setAdjustDirection] = useState('ADD'); // 'ADD' | 'REMOVE'
  const [unitCost, setUnitCost] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [rackBin, setRackBin] = useState('RACK_A1_BIN_01');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Listen to Inventory Movements
  useEffect(() => {
    const q = query(
      collection(db, 'inventory_movements'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Movement log error:', err);
      toast.error('Failed to load inventory movements');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return unsub;
  }, []);

  // Handle Product Select in Adjustment Modal
  const handleProductSelect = (productId) => {
    setSelectedProductId(productId);
    const p = products.find(prod => prod.id === productId);
    if (p) {
      setUnitCost(p.costPrice || p.estimatedCostPrice || p.price || '');
    }
  };

  // Submit Manual Stock Adjustment
  const handleManualAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !adjustQuantity || Number(adjustQuantity) <= 0) {
      toast.error('Please enter a valid product and quantity');
      return;
    }

    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    setSubmittingAdjust(true);
    try {
      const qtyNumber = Number(adjustQuantity);
      const finalQty = adjustDirection === 'ADD' ? qtyNumber : -qtyNumber;
      const refId = `ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Write Immutable Movement Record
      const movementRef = doc(collection(db, 'inventory_movements'));
      await setDoc(movementRef, {
        movementId: movementRef.id,
        productId: prod.id,
        productName: prod.name,
        type: adjustType,
        quantity: finalQty,
        costBasisPerUnit: Number(unitCost) || 0,
        totalCost: Math.abs(finalQty) * (Number(unitCost) || 0),
        referenceId: refId,
        reason: adjustReason,
        warehouseId: 'WH_PURNEA_MAIN',
        rackBin,
        recordedBy: user?.uid || 'ADMIN',
        recordedByEmail: user?.email || 'admin@krishivishal.com',
        timestamp: Timestamp.now()
      });

      // 2. Update Product Stock
      await updateDoc(doc(db, 'products', prod.id), {
        stockQuantity: increment(finalQty),
        stock: increment(finalQty),
        updatedAt: Timestamp.now()
      });

      // 3. Audit Log
      await addAuditLog('MANUAL_STOCK_ADJUSTMENT', 'Product', prod.id, {
        productName: prod.name,
        type: adjustType,
        quantity: finalQty,
        reason: adjustReason,
        referenceId: refId
      });

      toast.success(`Stock adjusted by ${finalQty > 0 ? '+' : ''}${finalQty} units`);
      setIsAdjustModalOpen(false);
      setSelectedProductId('');
      setAdjustQuantity('');
      setAdjustReason('');
    } catch (error) {
      console.error('Adjustment failed:', error);
      toast.error('Failed to adjust stock: ' + error.message);
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // Filter Movements
  const filtered = movements.filter(m => {
    const matchSearch = !searchTerm ||
      m.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.referenceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.recordedByEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = typeFilter === 'ALL' || m.type === typeFilter;
    const matchProduct = productFilter === 'ALL' || m.productId === productFilter;
    return matchSearch && matchType && matchProduct;
  });

  // Calculate Cumulative Metrics
  const totalInbound = movements.filter(m => (m.quantity || 0) > 0).reduce((sum, m) => sum + m.quantity, 0);
  const totalOutbound = movements.filter(m => (m.quantity || 0) < 0).reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const totalValuation = products.reduce((sum, p) => sum + ((p.stockQuantity || p.stock || 0) * (p.costPrice || p.estimatedCostPrice || p.price || 0)), 0);

  // Type Badges
  const renderTypeBadge = (type) => {
    const config = {
      PURCHASE_RECEIPT: { bg: 'bg-green-100 text-green-800', label: 'Purchase Receipt' },
      ORDER_RESERVE: { bg: 'bg-blue-100 text-blue-800', label: 'Order Reserve' },
      DISPATCH_SALE: { bg: 'bg-indigo-100 text-indigo-800', label: 'Dispatch Sale' },
      RETURN_RESTOCK: { bg: 'bg-purple-100 text-purple-800', label: 'Return Restock' },
      DAMAGE_ADJUSTMENT: { bg: 'bg-red-100 text-red-800', label: 'Damage / Loss' },
      MANUAL_AUDIT: { bg: 'bg-amber-100 text-amber-800', label: 'Cycle Count' },
    };
    const c = config[type] || { bg: 'bg-gray-100 text-gray-700', label: type };
    return (
      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${c.bg}`}>
        {c.label}
      </span>
    );
  };

  const columns = [
    {
      header: 'Timestamp',
      key: 'timestamp',
      render: (m) => (
        <div>
          <p className="font-bold text-xs text-gray-800">
            {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('en-IN') : '—'}
          </p>
          <p className="text-[10px] text-gray-400 font-mono">
            {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString('en-IN') : ''}
          </p>
        </div>
      )
    },
    {
      header: 'Product',
      key: 'productName',
      render: (m) => (
        <div>
          <p className="font-black text-sm text-gray-900">{m.productName}</p>
          {m.batchNumber && (
            <p className="text-[10px] font-mono text-gray-400">Batch: {m.batchNumber}</p>
          )}
        </div>
      )
    },
    {
      header: 'Movement Type',
      key: 'type',
      render: (m) => renderTypeBadge(m.type)
    },
    {
      header: 'Quantity',
      key: 'quantity',
      render: (m) => {
        const isPositive = (m.quantity || 0) > 0;
        return (
          <div className="flex items-center gap-1">
            {isPositive ? (
              <ArrowDownLeft size={16} className="text-green-600 shrink-0" />
            ) : (
              <ArrowUpRight size={16} className="text-red-600 shrink-0" />
            )}
            <span className={`font-black text-sm font-mono ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
              {isPositive ? `+${m.quantity}` : m.quantity} units
            </span>
          </div>
        );
      }
    },
    {
      header: 'Cost Basis',
      key: 'costBasisPerUnit',
      render: (m) => (
        <span className="font-mono text-xs font-bold text-gray-700">
          {formatCurrency(m.costBasisPerUnit || 0)}/u
        </span>
      )
    },
    {
      header: 'Reference ID',
      key: 'referenceId',
      render: (m) => (
        <div>
          <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
            {m.referenceId || 'MANUAL'}
          </span>
          {m.reason && <p className="text-[10px] text-gray-500 italic mt-0.5">{m.reason}</p>}
        </div>
      )
    },
    {
      header: 'Bin Location',
      key: 'rackBin',
      render: (m) => (
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1 font-mono">
          <MapPin size={12} className="text-gray-400" />
          {m.rackBin || 'DEFAULT'}
        </span>
      )
    },
    {
      header: 'Recorded By',
      key: 'recordedByEmail',
      render: (m) => (
        <span className="text-[11px] text-gray-500">
          {m.recordedByEmail ? m.recordedByEmail.split('@')[0] : 'System'}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <History className="mr-3 text-[#1b5e20]" size={28} />
            Stock Movements Journal
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Immutable audit trail of all warehouse inventory movements, receipts, sales, and adjustments.
          </p>
        </div>

        <button
          onClick={() => setIsAdjustModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <SlidersHorizontal size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Manual Stock Adjustment
        </button>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Movements Logged</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{movements.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Total Inbound (Receipts)</p>
          <p className="text-3xl font-black text-green-700 mt-1">+{totalInbound} <span className="text-xs font-normal">units</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Total Outbound (Sales/Loss)</p>
          <p className="text-3xl font-black text-red-600 mt-1">-{totalOutbound} <span className="text-xs font-normal">units</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Inventory Valuation</p>
          <p className="text-3xl font-black text-[#1b5e20] mt-1 font-mono">{formatCurrency(totalValuation)}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product, reference ID (GRN / PO / Order)..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-700 outline-none"
        >
          {MOVEMENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-700 outline-none max-w-xs truncate"
        >
          <option value="ALL">All Products</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* DataTable */}
      <DataTable columns={columns} data={filtered} loading={loading} />

      {/* MANUAL STOCK ADJUSTMENT MODAL */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <SlidersHorizontal size={20} className="text-[#1b5e20]" />
                  Manual Inventory Adjustment
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Record physical cycle count discrepancies, damages, or returns.
                </p>
              </div>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleManualAdjustment} className="p-6 space-y-4">
              {/* Product Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Product *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.stockQuantity || p.stock || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type & Direction */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Adjustment Type</label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  >
                    <option value="MANUAL_AUDIT">Manual Cycle Count</option>
                    <option value="DAMAGE_ADJUSTMENT">Damage / Expiry Loss</option>
                    <option value="RETURN_RESTOCK">Customer Return Restock</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Direction</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('ADD')}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                        adjustDirection === 'ADD'
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      + Add Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('REMOVE')}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                        adjustDirection === 'REMOVE'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      - Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Quantity & Unit Cost */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity (Units) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit Cost Basis (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                </div>
              </div>

              {/* Rack / Bin */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Rack / Storage Bin</label>
                <input
                  type="text"
                  value={rackBin}
                  onChange={(e) => setRackBin(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                />
              </div>

              {/* Reason / Note */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reason / Explanation *</label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical inventory count correction during weekly audit"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-medium text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submittingAdjust}
                className="w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {submittingAdjust && <Loader2 size={18} className="animate-spin" />}
                Confirm & Record Stock Movement
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryMovements;

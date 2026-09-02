import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { subscribeToSkus, fetchSkuBatches, getLowStockSkus } from '../services/skuService';
import { callUpsertSku, callAdjustInventory, callWriteOffStock, callGetInventoryReport } from '../services/inventory';
import { validateSku, VALID_CATEGORIES, VALID_UNITS, generateSkuCode } from '../utils/skuGenerator';
import { formatCurrency } from '../utils/formatters';
import DataTable from '../components/common/DataTable';
import {
  Package,
  Search,
  Plus,
  Upload,
  Download,
  AlertTriangle,
  TrendingDown,
  Clock,
  Box,
  Filter,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Layers,
  ShieldCheck,
  Tag,
  Eye,
  Edit3,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

const SkuDashboard = () => {
  const { user } = useAuth();
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL, LOW, OUT, HEALTHY
  const [expandedSku, setExpandedSku] = useState(null);
  const [batchData, setBatchData] = useState({});
  const [loadingBatches, setLoadingBatches] = useState(null);

  // Add SKU Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    categoryCode: '', itemCode: '', varietyCode: '', gradeCode: 'A1',
    size: '', unit: '', brandCode: '',
    name: '', mrp: '', consumerPrice: '', landingCost: '', dealerPrice: '',
    hsnCode: '31021010', gstRate: '5', barcode: '', reorderLevel: '50'
  });
  const [addLoading, setAddLoading] = useState(false);

  // Adjust Stock Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ skuCode: '', adjustment: '', reason: '' });
  const [adjustLoading, setAdjustLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSkus((data) => {
      setSkus(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch batches when expanding a SKU row
  const toggleExpand = async (skuCode) => {
    if (expandedSku === skuCode) {
      setExpandedSku(null);
      return;
    }
    setExpandedSku(skuCode);
    if (!batchData[skuCode]) {
      setLoadingBatches(skuCode);
      try {
        const batches = await fetchSkuBatches(skuCode);
        setBatchData(prev => ({ ...prev, [skuCode]: batches }));
      } catch (err) {
        toast.error(`Failed to load batches: ${err.message}`);
      }
      setLoadingBatches(null);
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = skus.length;
    const lowStock = skus.filter(s => {
      const avail = s.inventory?.availableStock || 0;
      return avail > 0 && avail <= (s.reorderLevel || 50);
    }).length;
    const outOfStock = skus.filter(s => (s.inventory?.availableStock || 0) === 0).length;
    const totalValue = skus.reduce((sum, s) => {
      return sum + (s.inventory?.availableStock || 0) * (s.pricing?.landingCost || s.pricing?.consumerPrice || 0);
    }, 0);
    return { total, lowStock, outOfStock, totalValue };
  }, [skus]);

  // Filtered list
  const filteredSkus = useMemo(() => {
    return skus.filter(sku => {
      const matchSearch = !searchTerm ||
        sku.skuCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sku.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sku.barcode?.ean13?.includes(searchTerm);

      const matchCategory = categoryFilter === 'ALL' ||
        sku.segments?.category === categoryFilter;

      const avail = sku.inventory?.availableStock || 0;
      const reorder = sku.reorderLevel || 50;
      let matchStock = true;
      if (stockFilter === 'LOW') matchStock = avail > 0 && avail <= reorder;
      else if (stockFilter === 'OUT') matchStock = avail === 0;
      else if (stockFilter === 'HEALTHY') matchStock = avail > reorder;

      return matchSearch && matchCategory && matchStock;
    });
  }, [skus, searchTerm, categoryFilter, stockFilter]);

  // Add SKU handler
  const handleAddSku = async () => {
    const generatedCode = generateSkuCode({
      categoryCode: addForm.categoryCode,
      itemCode: addForm.itemCode,
      varietyCode: addForm.varietyCode,
      gradeCode: addForm.gradeCode,
      size: addForm.size,
      unit: addForm.unit,
      brandCode: addForm.brandCode
    });

    const validation = validateSku(generatedCode);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }

    setAddLoading(true);
    try {
      await callUpsertSku(generatedCode, {
        name: addForm.name,
        pricing: {
          mrp: Number(addForm.mrp || 0),
          consumerPrice: Number(addForm.consumerPrice || 0),
          landingCost: Number(addForm.landingCost || 0),
          dealerPrice: Number(addForm.dealerPrice || 0)
        },
        barcode: addForm.barcode,
        hsnCode: addForm.hsnCode,
        gstRate: Number(addForm.gstRate || 5),
        reorderLevel: Number(addForm.reorderLevel || 50)
      });
      toast.success(`SKU ${generatedCode} created successfully!`);
      setShowAddModal(false);
      setAddForm({
        categoryCode: '', itemCode: '', varietyCode: '', gradeCode: 'A1',
        size: '', unit: '', brandCode: '',
        name: '', mrp: '', consumerPrice: '', landingCost: '', dealerPrice: '',
        hsnCode: '31021010', gstRate: '5', barcode: '', reorderLevel: '50'
      });
    } catch (err) {
      toast.error(err.message || 'Failed to create SKU');
    }
    setAddLoading(false);
  };

  // Adjust Stock handler
  const handleAdjustStock = async () => {
    if (!adjustForm.skuCode || !adjustForm.adjustment) {
      toast.error('SKU Code and Adjustment quantity required');
      return;
    }
    setAdjustLoading(true);
    try {
      await callAdjustInventory({
        skuCode: adjustForm.skuCode,
        adjustment: Number(adjustForm.adjustment),
        reason: adjustForm.reason || 'Manual adjustment from Admin'
      });
      toast.success(`Stock adjusted for ${adjustForm.skuCode}`);
      setShowAdjustModal(false);
      setAdjustForm({ skuCode: '', adjustment: '', reason: '' });
    } catch (err) {
      toast.error(err.message || 'Adjustment failed');
    }
    setAdjustLoading(false);
  };

  const getStockBadge = (sku) => {
    const avail = sku.inventory?.availableStock || 0;
    const reorder = sku.reorderLevel || 50;
    if (avail === 0) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">OUT OF STOCK</span>;
    if (avail <= reorder) return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">LOW STOCK</span>;
    return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">HEALTHY</span>;
  };

  const getCategoryLabel = (code) => {
    const cat = VALID_CATEGORIES.find(c => c.code === code);
    return cat ? cat.label : code;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <span className="ml-3 text-gray-500 font-medium">Loading SKU Master...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="text-emerald-600" size={28} />
            SKU Master & Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Central SKU catalog • Standard: CC-III-VVV-GG-SSSUU-BBB
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setAdjustForm({ skuCode: '', adjustment: '', reason: '' });
              setShowAdjustModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors"
          >
            <Edit3 size={14} /> Adjust Stock
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-md"
          >
            <Plus size={14} /> Add SKU
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Box className="text-emerald-600" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Total SKUs</p>
              <p className="text-2xl font-black text-gray-900">{kpis.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-amber-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="text-amber-600" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Low Stock</p>
              <p className="text-2xl font-black text-amber-600">{kpis.lowStock}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-red-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="text-red-600" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Out of Stock</p>
              <p className="text-2xl font-black text-red-600">{kpis.outOfStock}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Inventory Value</p>
              <p className="text-2xl font-black text-gray-900">{formatCurrency(kpis.totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by SKU code, name, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700"
        >
          <option value="ALL">All Categories</option>
          {VALID_CATEGORIES.map(c => (
            <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700"
        >
          <option value="ALL">All Stock</option>
          <option value="LOW">⚠️ Low Stock</option>
          <option value="OUT">🔴 Out of Stock</option>
          <option value="HEALTHY">✅ Healthy</option>
        </select>
        <div className="text-xs text-gray-400 font-medium">
          {filteredSkus.length} of {skus.length} SKUs
        </div>
      </div>

      {/* SKU Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase"></th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">SKU Code</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Product Name</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Category</th>
              <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">MRP</th>
              <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Price</th>
              <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Available</th>
              <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Committed</th>
              <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkus.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-4 py-16 text-center text-gray-400 text-sm">
                  <Package className="mx-auto mb-2 text-gray-300" size={32} />
                  No SKUs found
                </td>
              </tr>
            ) : (
              filteredSkus.map(sku => (
                <React.Fragment key={sku.id}>
                  <tr
                    className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(sku.skuCode || sku.id)}
                  >
                    <td className="px-4 py-3">
                      {expandedSku === (sku.skuCode || sku.id) ?
                        <ChevronDown size={14} className="text-gray-400" /> :
                        <ChevronRight size={14} className="text-gray-400" />
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                        {sku.skuCode || sku.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 text-xs">{sku.name || '—'}</p>
                      {sku.barcode?.ean13 && (
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">EAN: {sku.barcode.ean13}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">
                        {sku.segments?.category || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                      {formatCurrency(sku.pricing?.mrp || 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">
                      {formatCurrency(sku.pricing?.consumerPrice || 0)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-black text-gray-900">
                      {sku.inventory?.availableStock ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                      {sku.inventory?.committedStock ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStockBadge(sku)}
                    </td>
                  </tr>
                  {/* Expanded Batch Details */}
                  {expandedSku === (sku.skuCode || sku.id) && (
                    <tr className="bg-gray-50/50">
                      <td colSpan="9" className="px-8 py-4">
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div className="bg-white p-3 rounded-xl border border-gray-100">
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Product ID</p>
                            <p className="font-mono text-[10px] font-bold text-gray-700">{sku.productId || '—'}</p>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-gray-100">
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">HSN Code</p>
                            <p className="text-xs font-bold text-gray-700">{sku.tax?.hsnCode || '—'}</p>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-gray-100">
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Reorder Level</p>
                            <p className="text-xs font-bold text-gray-700">{sku.reorderLevel || 50}</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-2 flex items-center gap-1">
                          <Layers size={12} /> Active Batches (FEFO Order)
                        </p>
                        {loadingBatches === (sku.skuCode || sku.id) ? (
                          <div className="text-xs text-gray-400 py-3 flex items-center gap-2">
                            <Loader2 className="animate-spin" size={14} /> Loading batches...
                          </div>
                        ) : batchData[sku.skuCode || sku.id]?.length > 0 ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[9px] font-black text-gray-400 uppercase">
                                <th className="text-left py-1 pr-4">Batch No</th>
                                <th className="text-left py-1 pr-4">Mfg Date</th>
                                <th className="text-left py-1 pr-4">Expiry Date</th>
                                <th className="text-right py-1 pr-4">Stock</th>
                                <th className="text-left py-1">QC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchData[sku.skuCode || sku.id].map(batch => (
                                <tr key={batch.id} className="border-t border-gray-100">
                                  <td className="py-2 pr-4 font-mono font-bold">{batch.batchNumber || batch.id}</td>
                                  <td className="py-2 pr-4 text-gray-500">
                                    {batch.mfgDate?.toDate ? batch.mfgDate.toDate().toLocaleDateString('en-IN') : '—'}
                                  </td>
                                  <td className="py-2 pr-4">
                                    {batch.expiryDate?.toDate ? (
                                      <span className={
                                        batch.expiryDate.toDate() < new Date() ? 'text-red-600 font-bold' :
                                        batch.expiryDate.toDate() < new Date(Date.now() + 30 * 86400000) ? 'text-amber-600 font-bold' :
                                        'text-gray-600'
                                      }>
                                        {batch.expiryDate.toDate().toLocaleDateString('en-IN')}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="py-2 pr-4 text-right font-black">{batch.stock ?? 0}</td>
                                  <td className="py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      batch.qualityStatus === 'PASSED' ? 'bg-emerald-100 text-emerald-700' :
                                      batch.qualityStatus === 'DAMAGED' ? 'bg-red-100 text-red-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {batch.qualityStatus || 'N/A'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-gray-400 py-2">No active batches found for this SKU.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Add SKU Modal ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus size={20} className="text-emerald-600" /> Create New SKU
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* SKU Segments */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">SKU Code Segments</p>
                <div className="grid grid-cols-7 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Category</label>
                    <select value={addForm.categoryCode} onChange={e => setAddForm({ ...addForm, categoryCode: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold">
                      <option value="">CC</option>
                      {VALID_CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Item</label>
                    <input value={addForm.itemCode} onChange={e => setAddForm({ ...addForm, itemCode: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold" placeholder="III" maxLength={3} />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Variety</label>
                    <input value={addForm.varietyCode} onChange={e => setAddForm({ ...addForm, varietyCode: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold" placeholder="VVV" maxLength={3} />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Grade</label>
                    <input value={addForm.gradeCode} onChange={e => setAddForm({ ...addForm, gradeCode: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold" placeholder="GG" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Size</label>
                    <input type="number" value={addForm.size} onChange={e => setAddForm({ ...addForm, size: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold" placeholder="000" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Unit</label>
                    <select value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold">
                      <option value="">UU</option>
                      {VALID_UNITS.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Brand</label>
                    <input value={addForm.brandCode} onChange={e => setAddForm({ ...addForm, brandCode: e.target.value })}
                      className="w-full px-2 py-2 bg-gray-50 border rounded-xl text-[10px] font-bold" placeholder="BBB" maxLength={3} />
                  </div>
                </div>
                {/* Live Preview */}
                <div className="mt-2 bg-gray-100 px-4 py-2 rounded-xl text-center">
                  <span className="font-mono text-xs font-black text-gray-600">
                    {generateSkuCode({
                      categoryCode: addForm.categoryCode || 'XX',
                      itemCode: addForm.itemCode || 'XXX',
                      varietyCode: addForm.varietyCode || 'XXX',
                      gradeCode: addForm.gradeCode || 'A1',
                      size: addForm.size || '000',
                      unit: addForm.unit || 'XX',
                      brandCode: addForm.brandCode || 'XXX'
                    })}
                  </span>
                </div>
              </div>

              {/* Product Details */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Product Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Product Name</label>
                    <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" placeholder="e.g. Urea 50 KG IFFCO" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">MRP (₹)</label>
                    <input type="number" value={addForm.mrp} onChange={e => setAddForm({ ...addForm, mrp: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Consumer Price (₹)</label>
                    <input type="number" value={addForm.consumerPrice} onChange={e => setAddForm({ ...addForm, consumerPrice: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Landing Cost (₹)</label>
                    <input type="number" value={addForm.landingCost} onChange={e => setAddForm({ ...addForm, landingCost: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Dealer Price (₹)</label>
                    <input type="number" value={addForm.dealerPrice} onChange={e => setAddForm({ ...addForm, dealerPrice: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Barcode (EAN-13)</label>
                    <input value={addForm.barcode} onChange={e => setAddForm({ ...addForm, barcode: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" placeholder="8901234567890" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">HSN Code</label>
                    <input value={addForm.hsnCode} onChange={e => setAddForm({ ...addForm, hsnCode: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">GST %</label>
                    <input type="number" value={addForm.gstRate} onChange={e => setAddForm({ ...addForm, gstRate: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 block mb-1">Reorder Level</label>
                    <input type="number" value={addForm.reorderLevel} onChange={e => setAddForm({ ...addForm, reorderLevel: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs" />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleAddSku} disabled={addLoading}
                className="px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                {addLoading ? <Loader2 className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                Create SKU via Cloud Function
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Adjust Stock Modal ─── */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Edit3 size={20} className="text-amber-600" /> Adjust Stock
              </h2>
              <button onClick={() => setShowAdjustModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">SKU Code</label>
                <select
                  value={adjustForm.skuCode}
                  onChange={e => setAdjustForm({ ...adjustForm, skuCode: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                >
                  <option value="">Select SKU...</option>
                  {skus.map(s => (
                    <option key={s.id} value={s.skuCode || s.id}>
                      {s.skuCode || s.id} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Adjustment Qty (+ or −)</label>
                <input type="number" value={adjustForm.adjustment}
                  onChange={e => setAdjustForm({ ...adjustForm, adjustment: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                  placeholder="e.g. +10 or -5" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Reason</label>
                <textarea value={adjustForm.reason}
                  onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-xs"
                  rows={2} placeholder="Cycle count, damage, etc." />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAdjustModal(false)} className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleAdjustStock} disabled={adjustLoading}
                className="px-6 py-2.5 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">
                {adjustLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                Adjust via Cloud Function
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkuDashboard;

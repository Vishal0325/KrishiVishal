import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthContext } from '../hooks/useAuthContext';
import { useReadOnly } from '../hooks/useReadOnly';
import ReadOnlyBanner from '../components/common/ReadOnlyBanner';
import { 
  ShieldAlert, 
  RotateCcw, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  Search, 
  Download, 
  Building2, 
  Layers, 
  Calendar,
  X
} from 'lucide-react';
import MetricCard from '../components/common/MetricCard';
import DataTable from '../components/common/DataTable';
import { toast } from 'react-hot-toast';
import { callWriteOffStock } from '../services/inventory';

const ExpiryMonitor = () => {
  const { user, isHubScoped, hubId } = useAuthContext();
  const { isReadOnly } = useReadOnly();

  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState(isHubScoped && hubId ? hubId : 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL'); // ALL, CRITICAL, WARNING, EXPIRED

  // Action Modal State (Quarantine, Return to Vendor, Write-off)
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [actionType, setActionType] = useState(null); // 'QUARANTINE', 'RETURN_TO_VENDOR', 'SCRAP_WRITE_OFF'
  const [actionNotes, setActionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isHubScoped && hubId) {
      setSelectedHub(hubId);
    }
  }, [isHubScoped, hubId]);

  // Subscribe to Products & Warehouses
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Products subscription error:", err);
      toast.error("Failed to load inventory data");
      setLoading(false);
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Warehouses subscription error:", err);
    });

    return () => {
      unsubProducts();
      unsubWarehouses();
    };
  }, []);

  // Compute Batch FEFO Tracking List
  const batchList = useMemo(() => {
    const batches = [];
    const now = new Date();
    const defaultWarehouse = isHubScoped && hubId ? hubId : 'MAIN_HUB';

    products.forEach(p => {
      const pExp = p.expiryDate ? (p.expiryDate.toDate ? p.expiryDate.toDate() : new Date(p.expiryDate)) : null;
      const pMfg = p.mfgDate ? (p.mfgDate.toDate ? p.mfgDate.toDate() : new Date(p.mfgDate)) : null;

      const calculateHealth = (expDate, isQuarantined) => {
        if (isQuarantined) return { status: 'QUARANTINED', daysLeft: 0, color: 'purple' };
        if (!expDate) return { status: 'UNKNOWN', daysLeft: 9999, color: 'gray' };

        const diffTime = expDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { status: 'EXPIRED', daysLeft: diffDays, color: 'red' };
        if (diffDays <= 30) return { status: 'CRITICAL', daysLeft: diffDays, color: 'orange' };
        if (diffDays <= 90) return { status: 'WARNING', daysLeft: diffDays, color: 'amber' };
        return { status: 'HEALTHY', daysLeft: diffDays, color: 'green' };
      };

      if (p.batchNumber || pExp) {
        const health = calculateHealth(pExp, p.isQuarantined);
        batches.push({
          productId: p.id,
          skuCode: p.skuCode || p.id,
          productName: p.name,
          category: p.category || 'General',
          brand: p.brand || 'KrishiVishal',
          batchNumber: p.batchNumber || 'BATCH-MAIN',
          mfgDate: pMfg,
          expiryDate: pExp,
          stock: Number(p.stock) || 0,
          price: Number(p.price) || 0,
          costPrice: Number(p.costPrice) || Number(p.price) * 0.8,
          warehouseId: p.warehouseId || defaultWarehouse,
          isQuarantined: !!p.isQuarantined,
          quarantineReason: p.quarantineReason || null,
          ...health
        });
      }

      // Check product variants
      if (Array.isArray(p.variants)) {
        p.variants.forEach((v, vIdx) => {
          if (v.batchNumber || v.expiryDate) {
            const vExp = v.expiryDate ? (v.expiryDate.toDate ? v.expiryDate.toDate() : new Date(v.expiryDate)) : null;
            const vMfg = v.mfgDate ? (v.mfgDate.toDate ? v.mfgDate.toDate() : new Date(v.mfgDate)) : null;
            const vHealth = calculateHealth(vExp, v.isQuarantined);
            batches.push({
              productId: p.id,
              skuCode: v.skuCode || v.id || p.skuCode || p.id,
              variantIndex: vIdx,
              productName: `${p.name} (${v.label || 'Variant'})`,
              category: p.category || 'General',
              brand: p.brand || 'KrishiVishal',
              batchNumber: v.batchNumber || `BATCH-VAR-${vIdx + 1}`,
              mfgDate: vMfg,
              expiryDate: vExp,
              stock: Number(v.stock) || 0,
              price: Number(v.price) || Number(p.price) || 0,
              costPrice: Number(v.costPrice) || (Number(v.price) || 0) * 0.8,
              warehouseId: v.warehouseId || p.warehouseId || defaultWarehouse,
              isQuarantined: !!v.isQuarantined,
              quarantineReason: v.quarantineReason || null,
              ...vHealth
            });
          }
        });
      }
    });

    // Sort FEFO: Expired first, then closest to expiry
    return batches.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [products, isHubScoped, hubId]);

  // Filter batches
  const filteredBatches = useMemo(() => {
    return batchList.filter(b => {
      const matchesSearch = 
        b.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.skuCode && b.skuCode.toLowerCase().includes(searchTerm.toLowerCase()));

      const effectiveHub = isHubScoped && hubId ? hubId : selectedHub;
      const matchesHub = effectiveHub === 'ALL' || b.warehouseId === effectiveHub;
      const matchesUrgency = urgencyFilter === 'ALL' || b.status === urgencyFilter;

      return matchesSearch && matchesHub && matchesUrgency;
    });
  }, [batchList, searchTerm, selectedHub, urgencyFilter, isHubScoped, hubId]);

  // Metrics
  const metrics = useMemo(() => {
    const effectiveHub = isHubScoped && hubId ? hubId : selectedHub;
    const relevantBatches = effectiveHub === 'ALL' ? batchList : batchList.filter(b => b.warehouseId === effectiveHub);

    const expired = relevantBatches.filter(b => b.status === 'EXPIRED');
    const critical = relevantBatches.filter(b => b.status === 'CRITICAL');
    const warning = relevantBatches.filter(b => b.status === 'WARNING');
    const quarantined = relevantBatches.filter(b => b.isQuarantined);

    const expiredValue = expired.reduce((sum, b) => sum + (b.stock * b.costPrice), 0);
    const criticalValue = critical.reduce((sum, b) => sum + (b.stock * b.costPrice), 0);

    return {
      expiredCount: expired.length,
      expiredValue,
      criticalCount: critical.length,
      criticalValue,
      warningCount: warning.length,
      quarantinedCount: quarantined.length
    };
  }, [batchList, selectedHub, isHubScoped, hubId]);

  // Handle Quarantine / Return to Vendor / Scrap Write-off
  const handleProcessAction = async (e) => {
    e.preventDefault();
    if (!selectedBatchItem) return;
    if (isReadOnly) {
      toast.error("Read-only access: changes not permitted.");
      return;
    }
    setIsSubmitting(true);

    try {
      const prodRef = doc(db, 'products', selectedBatchItem.productId);
      const effectiveWarehouse = selectedBatchItem.warehouseId || (isHubScoped && hubId ? hubId : 'MAIN_HUB');
      const resolvedSkuCode = selectedBatchItem.skuCode || selectedBatchItem.productId;
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `WRITEOFF-${resolvedSkuCode}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      if (actionType === 'QUARANTINE') {
        // Mark product/variant as quarantined so it cannot be purchased in customer app
        await updateDoc(prodRef, {
          isQuarantined: true,
          quarantineReason: actionNotes || 'Expired / Near Expiry Quarantine',
          quarantinedAt: Timestamp.now(),
          quarantinedBy: user?.displayName || user?.email || 'Admin',
          isActive: false // Prevent ordering
        });
        toast.success(`Batch ${selectedBatchItem.batchNumber} moved to Quarantine Vault! Sales blocked.`);
      } else if (actionType === 'RETURN_TO_VENDOR') {
        // Generate Supplier Return Debit Note
        const debitNoteNo = `KV-RTV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        await addDoc(collection(db, 'supplier_debit_notes'), {
          debitNoteNumber: debitNoteNo,
          productId: selectedBatchItem.productId,
          skuCode: resolvedSkuCode,
          productName: selectedBatchItem.productName,
          batchNumber: selectedBatchItem.batchNumber,
          quantity: selectedBatchItem.stock,
          unitCost: selectedBatchItem.costPrice,
          totalClaimAmount: selectedBatchItem.stock * selectedBatchItem.costPrice,
          reason: actionNotes || 'Expired Stock Return to Manufacturer',
          warehouseId: effectiveWarehouse,
          status: 'PENDING_SETTLEMENT',
          createdAt: Timestamp.now(),
          createdBy: user?.displayName || user?.email || 'Admin'
        });

        // Write off inventory via backend Cloud Function (SSoT)
        await callWriteOffStock({
          skuCode: resolvedSkuCode,
          batchId: selectedBatchItem.batchNumber,
          quantity: selectedBatchItem.stock,
          type: 'EXPIRED',
          reason: actionNotes || `RTV Debit Note ${debitNoteNo}`,
          warehouseId: effectiveWarehouse,
          idempotencyKey
        });

        // Update product non-stock metadata only
        await updateDoc(prodRef, {
          isQuarantined: false,
          lastRtvRef: debitNoteNo
        });

        toast.success(`Debit Note ${debitNoteNo} generated for ₹${(selectedBatchItem.stock * selectedBatchItem.costPrice).toLocaleString('en-IN')}! Stock returned via Cloud Function.`);
      } else if (actionType === 'SCRAP_WRITE_OFF') {
        // Write off stock via backend Cloud Function (SSoT)
        await callWriteOffStock({
          skuCode: resolvedSkuCode,
          batchId: selectedBatchItem.batchNumber,
          quantity: selectedBatchItem.stock,
          type: 'EXPIRED',
          reason: actionNotes || 'Scrapped due to expiration',
          warehouseId: effectiveWarehouse,
          idempotencyKey
        });

        // Update non-stock metadata
        await updateDoc(prodRef, {
          isQuarantined: false,
          writeOffReason: actionNotes || 'Scrapped due to expiration',
          writtenOffAt: Timestamp.now(),
          writtenOffBy: user?.displayName || user?.email || 'Admin'
        });

        toast.success(`Stock written off via Cloud Function to Scrap Expense. Inventory cleared.`);
      }

      setSelectedBatchItem(null);
      setActionNotes('');
    } catch (err) {
      console.error("Quarantine action error:", err);
      toast.error("Failed to execute action: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredBatches.length === 0) {
      toast.error("No batches to export");
      return;
    }

    const headers = ["Product Name", "SKU Code", "Category", "Brand", "Batch Number", "Mfg Date", "Expiry Date", "Days Remaining", "Stock Qty", "Cost Value (INR)", "Health Status", "Quarantined", "Warehouse"];
    const rows = filteredBatches.map(b => [
      `"${b.productName}"`,
      `"${b.skuCode}"`,
      `"${b.category}"`,
      `"${b.brand}"`,
      `"${b.batchNumber}"`,
      b.mfgDate ? b.mfgDate.toISOString().split('T')[0] : 'N/A',
      b.expiryDate ? b.expiryDate.toISOString().split('T')[0] : 'N/A',
      b.daysLeft,
      b.stock,
      (b.stock * b.costPrice).toFixed(2),
      b.status,
      b.isQuarantined ? 'YES' : 'NO',
      b.warehouseId
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FEFO_Expiry_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    {
      header: 'Product & SKU Code',
      render: (b) => (
        <div>
          <span className="font-bold text-gray-900 block">{b.productName}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] bg-gray-100 text-gray-700 font-mono px-1.5 py-0.5 rounded">
              SKU: {b.skuCode}
            </span>
            <span className="text-xs text-gray-400">({b.brand})</span>
          </div>
        </div>
      )
    },
    {
      header: 'Batch Details',
      render: (b) => (
        <div>
          <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-800 block w-max">
            {b.batchNumber}
          </span>
          <span className="text-[10px] text-gray-400 mt-1 block">
            Mfg: {b.mfgDate ? b.mfgDate.toLocaleDateString() : 'N/A'}
          </span>
        </div>
      )
    },
    {
      header: 'Expiry & FEFO Urgency',
      render: (b) => (
        <div>
          <span className="font-bold text-gray-800 text-xs block">
            {b.expiryDate ? b.expiryDate.toLocaleDateString() : 'No Date'}
          </span>
          <span className={`text-[10px] font-black uppercase mt-0.5 block ${
            b.daysLeft < 0 ? 'text-red-600' :
            b.daysLeft <= 30 ? 'text-orange-600' :
            b.daysLeft <= 90 ? 'text-amber-600' : 'text-green-600'
          }`}>
            {b.daysLeft < 0 ? `Expired ${Math.abs(b.daysLeft)}d ago` : `${b.daysLeft} days left`}
          </span>
        </div>
      )
    },
    {
      header: 'Current Stock Value',
      render: (b) => (
        <div>
          <span className="font-bold text-gray-900 text-xs block">{b.stock} units</span>
          <span className="text-[10px] font-semibold text-gray-400">
            Val: ₹{(b.stock * b.costPrice).toLocaleString('en-IN')}
          </span>
        </div>
      )
    },
    {
      header: 'Status Tag',
      render: (b) => (
        <div>
          {b.isQuarantined ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-[10px] font-black">
              <ShieldAlert size={12} /> QUARANTINED
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
              b.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
              b.status === 'CRITICAL' ? 'bg-orange-100 text-orange-800' :
              b.status === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
            }`}>
              {b.status}
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Warehouse',
      render: (b) => (
        <span className="text-xs font-semibold text-gray-600">
          {warehouses.find(w => w.id === b.warehouseId)?.name || b.warehouseId}
        </span>
      )
    },
    {
      header: 'Actions / Protect Revenue',
      render: (b) => {
        if (isReadOnly) {
          return <span className="text-[11px] text-gray-400 font-semibold italic">View Only</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            {!b.isQuarantined && b.status === 'EXPIRED' && (
              <button
                onClick={() => {
                  setSelectedBatchItem(b);
                  setActionType('QUARANTINE');
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1"
              >
                <ShieldAlert size={12} />
                Quarantine Stock
              </button>
            )}

            {b.isQuarantined && (
              <button
                onClick={() => {
                  setSelectedBatchItem(b);
                  setActionType('RETURN_TO_VENDOR');
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Return to Vendor (RTV)
              </button>
            )}

            {!b.isQuarantined && (b.status === 'CRITICAL' || b.status === 'WARNING') && (
              <button
                onClick={() => {
                  setSelectedBatchItem(b);
                  setActionType('QUARANTINE');
                }}
                className="px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all border border-amber-200"
              >
                Quarantine / Inspect
              </button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Clock className="text-red-600" />
            FEFO Expiry Monitor & Quarantine Control
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            First-Expiry-First-Out automated auditing, risk mitigation & debit note generation
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm"
        >
          <Download size={14} />
          Export FEFO Report (CSV)
        </button>
      </div>

      {isReadOnly && <ReadOnlyBanner />}

      {/* 4 Health KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Expired Stock"
          value={metrics.expiredCount}
          subtext={`Loss at risk: ₹${metrics.expiredValue.toLocaleString('en-IN')}`}
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard
          label="Critical (≤30 Days)"
          value={metrics.criticalCount}
          subtext={`Value: ₹${metrics.criticalValue.toLocaleString('en-IN')}`}
          icon={Clock}
          color="orange"
        />
        <MetricCard
          label="Near Expiry (≤90 Days)"
          value={metrics.warningCount}
          subtext="Eligible for Flash Sale"
          icon={Calendar}
          color="amber"
        />
        <MetricCard
          label="In Quarantine Vault"
          value={metrics.quarantinedCount}
          subtext="Blocked from Dispatch"
          icon={ShieldAlert}
          color="purple"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search product, SKU or batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <select
              value={isHubScoped && hubId ? hubId : selectedHub}
              disabled={isHubScoped}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isHubScoped ? (
                <option value={hubId}>🏪 {warehouses.find(w => w.id === hubId)?.name || hubId} (Assigned Hub)</option>
              ) : (
                <>
                  <option value="ALL">🏢 All Regional Depots (Consolidated)</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>📍 {wh.name}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* Urgency Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {['ALL', 'EXPIRED', 'CRITICAL', 'WARNING', 'HEALTHY'].map((status) => (
            <button
              key={status}
              onClick={() => setUrgencyFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                urgencyFilter === status
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main FEFO Table */}
      <DataTable
        columns={columns}
        data={filteredBatches}
        loading={loading}
      />

      {/* Quarantine & Resolution Modal */}
      {selectedBatchItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                  {actionType === 'QUARANTINE' && <ShieldAlert className="text-red-600" size={16} />}
                  {actionType === 'RETURN_TO_VENDOR' && <RotateCcw className="text-purple-600" size={16} />}
                  {actionType === 'SCRAP_WRITE_OFF' && <Trash2 className="text-gray-600" size={16} />}
                  {actionType === 'QUARANTINE' ? 'Move Batch to Quarantine Vault' : 
                   actionType === 'RETURN_TO_VENDOR' ? 'Initiate Return to Vendor (RTV)' : 'Scrap & Write-off Stock'}
                </h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                  Action on batch: <span className="font-mono font-bold text-gray-800">{selectedBatchItem.batchNumber}</span> (SKU: {selectedBatchItem.skuCode})
                </p>
              </div>
              <button
                onClick={() => setSelectedBatchItem(null)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleProcessAction} className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">Product:</span>
                  <span className="font-bold text-gray-900">{selectedBatchItem.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">SKU Code:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedBatchItem.skuCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">Batch Stock:</span>
                  <span className="font-bold text-gray-900">{selectedBatchItem.stock} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold">Claim Value:</span>
                  <span className="font-black text-gray-900">₹{(selectedBatchItem.stock * selectedBatchItem.costPrice).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {actionType === 'RETURN_TO_VENDOR' && (
                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-[11px] font-semibold text-purple-900 leading-relaxed">
                  ✓ Automatically creates a <strong>Debit Note</strong> for the manufacturer.<br />
                  ✓ Executes <code>writeOffStock</code> via Cloud Function (SSoT ledger).<br />
                  ✓ Generates a distinct UUID idempotency key to prevent double write-offs.
                </div>
              )}

              {actionType === 'QUARANTINE' && (
                <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] font-semibold text-red-900 leading-relaxed">
                  ⚠️ This batch will be locked from customer orders, rider packing lists, and dispatch scans immediately.
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                  Operational Reason / Audit Notes
                </label>
                <textarea
                  rows="3"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g. Expired batch verified by warehouse inspector, returning for credit..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedBatchItem(null)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 py-3 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md disabled:opacity-50 ${
                    actionType === 'QUARANTINE' ? 'bg-red-600 hover:bg-red-700' :
                    actionType === 'RETURN_TO_VENDOR' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-800 hover:bg-black'
                  }`}
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpiryMonitor;

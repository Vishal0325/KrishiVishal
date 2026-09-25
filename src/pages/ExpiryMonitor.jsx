import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Calendar, 
  Package, 
  CheckCircle2, 
  Building2, 
  Search, 
  Download, 
  Printer, 
  RotateCcw, 
  Trash2, 
  X,
  FileText,
  Clock,
  Filter,
  Layers,
  ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

const ExpiryMonitor = () => {
  const { user, role } = useAuth();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL'); // 'ALL' | 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'QUARANTINED'

  // Action Modal State (Quarantine / RTV Debit Note)
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [actionType, setActionType] = useState('QUARANTINE'); // 'QUARANTINE' | 'RETURN_TO_VENDOR' | 'SCRAP_WRITE_OFF'
  const [actionNotes, setActionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Warehouses & Products
  useEffect(() => {
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubProd = onSnapshot(collection(db, 'products'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(list);
      setLoading(false);
    });

    return () => {
      unsubWh();
      unsubProd();
    };
  }, []);

  // Process FEFO Batches
  const batchList = useMemo(() => {
    const batches = [];
    const today = new Date();

    products.forEach(p => {
      // Main product batch
      const pExp = p.expiryDate ? (p.expiryDate.toDate ? p.expiryDate.toDate() : new Date(p.expiryDate)) : null;
      const pMfg = p.mfgDate ? (p.mfgDate.toDate ? p.mfgDate.toDate() : new Date(p.mfgDate)) : null;
      
      const calculateHealth = (expDate, isQuarantined) => {
        if (isQuarantined) return { status: 'QUARANTINED', daysLeft: -999, color: 'purple' };
        if (!expDate || isNaN(expDate.getTime())) return { status: 'UNKNOWN', daysLeft: 9999, color: 'gray' };
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return { status: 'EXPIRED', daysLeft: diffDays, color: 'red' };
        if (diffDays <= 30) return { status: 'CRITICAL', daysLeft: diffDays, color: 'orange' };
        if (diffDays <= 90) return { status: 'WARNING', daysLeft: diffDays, color: 'amber' };
        return { status: 'HEALTHY', daysLeft: diffDays, color: 'green' };
      };

      if (p.batchNumber || pExp) {
        const health = calculateHealth(pExp, p.isQuarantined);
        batches.push({
          productId: p.id,
          productName: p.name,
          category: p.category || 'General',
          brand: p.brand || 'KrishiVishal',
          batchNumber: p.batchNumber || 'BATCH-MAIN',
          mfgDate: pMfg,
          expiryDate: pExp,
          stock: Number(p.stock) || 0,
          price: Number(p.price) || 0,
          costPrice: Number(p.costPrice) || Number(p.price) * 0.8,
          warehouseId: p.warehouseId || 'MAIN_HUB',
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
              warehouseId: v.warehouseId || p.warehouseId || 'MAIN_HUB',
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
  }, [products]);

  // Filter batches
  const filteredBatches = useMemo(() => {
    return batchList.filter(b => {
      const matchesSearch = 
        b.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.brand.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesHub = selectedHub === 'ALL' || b.warehouseId === selectedHub;
      const matchesUrgency = urgencyFilter === 'ALL' || b.status === urgencyFilter;

      return matchesSearch && matchesHub && matchesUrgency;
    });
  }, [batchList, searchTerm, selectedHub, urgencyFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const expired = batchList.filter(b => b.status === 'EXPIRED');
    const critical = batchList.filter(b => b.status === 'CRITICAL');
    const warning = batchList.filter(b => b.status === 'WARNING');
    const quarantined = batchList.filter(b => b.isQuarantined);

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
  }, [batchList]);

  // Handle Quarantine / Return to Vendor / Scrap Write-off
  const handleProcessAction = async (e) => {
    e.preventDefault();
    if (!selectedBatchItem) return;
    setIsSubmitting(true);

    try {
      const prodRef = doc(db, 'products', selectedBatchItem.productId);

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
          productName: selectedBatchItem.productName,
          batchNumber: selectedBatchItem.batchNumber,
          quantity: selectedBatchItem.stock,
          unitCost: selectedBatchItem.costPrice,
          totalClaimAmount: selectedBatchItem.stock * selectedBatchItem.costPrice,
          reason: actionNotes || 'Expired Stock Return to Manufacturer',
          status: 'PENDING_SETTLEMENT',
          createdAt: Timestamp.now(),
          createdBy: user?.displayName || user?.email || 'Admin'
        });

        // Set stock to 0 as returned
        await updateDoc(prodRef, {
          stock: 0,
          isQuarantined: false,
          lastRtvRef: debitNoteNo
        });

        toast.success(`Debit Note ${debitNoteNo} generated for ₹${(selectedBatchItem.stock * selectedBatchItem.costPrice).toLocaleString('en-IN')}! Stock returned.`);
      } else if (actionType === 'SCRAP_WRITE_OFF') {
        // Write off stock to scrap
        await updateDoc(prodRef, {
          stock: 0,
          isQuarantined: false,
          writeOffReason: actionNotes || 'Scrapped due to expiration',
          writtenOffAt: Timestamp.now(),
          writtenOffBy: user?.displayName || user?.email || 'Admin'
        });

        toast.success(`Stock written off to Scrap Expense. Inventory cleared.`);
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

    const headers = ["Product Name", "Category", "Brand", "Batch Number", "Mfg Date", "Expiry Date", "Days Remaining", "Stock Qty", "Cost Value (INR)", "Health Status", "Quarantined"];
    const rows = filteredBatches.map(b => [
      `"${b.productName}"`,
      `"${b.category}"`,
      `"${b.brand}"`,
      `"${b.batchNumber}"`,
      b.mfgDate ? b.mfgDate.toLocaleDateString() : 'N/A',
      b.expiryDate ? b.expiryDate.toLocaleDateString() : 'N/A',
      b.daysLeft === -999 ? 'QUARANTINED' : b.daysLeft,
      b.stock,
      b.stock * b.costPrice,
      b.status,
      b.isQuarantined ? 'YES' : 'NO'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KrishiVishal_FEFO_Expiry_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("FEFO Expiry Report Exported!");
  };

  const columns = [
    {
      header: 'Product & Brand',
      render: (b) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-[#0B4D31] font-bold text-xs">
            <Package size={16} />
          </div>
          <div>
            <div className="font-black text-gray-900 text-xs">{b.productName}</div>
            <div className="text-[10px] text-gray-400 font-semibold">{b.brand} • {b.category}</div>
          </div>
        </div>
      )
    },
    {
      header: 'Batch Number',
      render: (b) => (
        <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 border border-gray-200">
          {b.batchNumber}
        </span>
      )
    },
    {
      header: 'Expiry Date',
      render: (b) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-gray-800">
            {b.expiryDate ? b.expiryDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No Date'}
          </span>
          <span className="text-[10px] text-gray-400">
            Mfg: {b.mfgDate ? b.mfgDate.toLocaleDateString() : 'N/A'}
          </span>
        </div>
      )
    },
    {
      header: 'FEFO Shelf Health',
      render: (b) => {
        if (b.isQuarantined) {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
              <ShieldAlert size={11} className="mr-1 text-purple-600" />
              Quarantined Vault
            </span>
          );
        }
        if (b.status === 'EXPIRED') {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200 animate-pulse">
              <AlertTriangle size={11} className="mr-1 text-red-600" />
              EXPIRED ({Math.abs(b.daysLeft)}d ago)
            </span>
          );
        }
        if (b.status === 'CRITICAL') {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
              <Clock size={11} className="mr-1 text-orange-600" />
              {b.daysLeft} Days Left (Critical)
            </span>
          );
        }
        if (b.status === 'WARNING') {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
              {b.daysLeft} Days Left (Warning)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={11} className="mr-1 text-green-600" />
            Healthy ({b.daysLeft}d)
          </span>
        );
      }
    },
    {
      header: 'Available Stock & At-Risk Value',
      render: (b) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-gray-900">{b.stock} units</span>
          <span className="text-[10px] font-mono text-gray-500 font-bold">
            At-Risk: ₹{(b.stock * b.costPrice).toLocaleString('en-IN')}
          </span>
        </div>
      )
    },
    {
      header: 'Actions / Protect Revenue',
      render: (b) => (
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
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="FEFO Batch Expiry & Quarantine Safety Vault"
          subtitle="Real-time shelf life monitoring for agro-chemicals, bio-fertilizers, and seeds. Automated First-Expiry-First-Out dispatch ranking."
        />
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-2xl text-xs font-bold hover:bg-gray-50 shadow-sm transition-all"
        >
          <Download size={14} className="text-gray-500" />
          Export FEFO Audit CSV
        </button>
      </div>

      {/* 4 Health KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Expired Stock Value (At Risk)"
          value={`₹${metrics.expiredValue.toLocaleString('en-IN')}`}
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard
          label="Critical Batches (<30 Days)"
          value={`${metrics.criticalCount} Batches (₹${metrics.criticalValue.toLocaleString('en-IN')})`}
          icon={Clock}
          color="amber"
        />
        <MetricCard
          label="Warning Batches (31-90 Days)"
          value={`${metrics.warningCount} Batches`}
          icon={Calendar}
          color="blue"
        />
        <MetricCard
          label="Quarantined in Safe Vault"
          value={`${metrics.quarantinedCount} Batches`}
          icon={ShieldAlert}
          color="purple"
        />
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Product Name, Batch Number, Brand..."
              className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 w-full outline-none focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none"
            >
              <option value="ALL">🏢 All Regional Depots (Consolidated)</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>📍 {wh.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Urgency Status Tabs */}
        <div className="flex items-center space-x-2 pt-2 border-t border-gray-100 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Batches' },
            { id: 'EXPIRED', label: '🔴 Expired (<0d)' },
            { id: 'CRITICAL', label: '🟠 Critical (<30d)' },
            { id: 'WARNING', label: '🟡 Warning (31-90d)' },
            { id: 'HEALTHY', label: '🟢 Healthy (>90d)' },
            { id: 'QUARANTINED', label: '🔒 Quarantined' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setUrgencyFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                urgencyFilter === tab.id
                  ? 'bg-[#0B4D31] text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto text-xs font-bold text-gray-400 whitespace-nowrap">
            Showing {filteredBatches.length} tracked batches
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
        <DataTable columns={columns} data={filteredBatches} loading={loading} />
      </div>

      {/* Quarantine / Action Modal */}
      {selectedBatchItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <ShieldAlert size={18} className="text-red-600" />
                Batch Inventory Protection Action
              </h3>
              <button onClick={() => setSelectedBatchItem(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleProcessAction} className="py-4 space-y-3">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Product:</span>
                  <span className="font-bold text-gray-900">{selectedBatchItem.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Batch Number:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedBatchItem.batchNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Quantity in Stock:</span>
                  <span className="font-black text-gray-900">{selectedBatchItem.stock} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cost Value Claim:</span>
                  <span className="font-black text-red-700 font-mono">₹{(selectedBatchItem.stock * selectedBatchItem.costPrice).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Choose Action *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType('QUARANTINE')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      actionType === 'QUARANTINE' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    🔒 Quarantine
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('RETURN_TO_VENDOR')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      actionType === 'RETURN_TO_VENDOR' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    ↩️ Return (RTV)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('SCRAP_WRITE_OFF')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      actionType === 'SCRAP_WRITE_OFF' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    🗑️ Write-Off
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Audit Remarks / Justification</label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none"
                  placeholder="e.g. Expired batch segregated from sellable inventory. Debit Note raised to Bayer CropScience."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedBatchItem(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
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

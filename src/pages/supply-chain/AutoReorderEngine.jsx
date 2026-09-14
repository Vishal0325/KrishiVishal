import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  RefreshCw,
  Sparkles,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  PackageCheck,
  Building2,
  Plus
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AutoReorderEngine() {
  const { user } = useAuth();
  const [season, setSeason] = useState('RABI'); // 'RABI' (Wheat/Mustard) | 'KHARIF' (Paddy/Maize) | 'ZAID' (Summer Vegetables)
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingForId, setGeneratingForId] = useState(null);

  // Fetch Products and Suppliers
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(collection(db, 'products'), (snap) => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'suppliers'), (snap) => {
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Compute Dynamic Reorder Point (ROP) & Safety Stock based on Season
  const productReorderStatus = useMemo(() => {
    // Seasonal Demand Multiplier
    const multipliers = {
      RABI: 2.2,   // High demand for Wheat/Mustard (DAP, Urea, Zinc, Hybrid Mustard Seeds)
      KHARIF: 2.5, // High demand for Paddy/Cotton
      ZAID: 1.2
    };
    const mult = multipliers[season] || 1.5;

    return products.map(prod => {
      const currentStock = Number(prod.stock || prod.totalStock || 0);
      const avgDailySales = Math.max(2, Math.round((Number(prod.basePrice || 1000) > 1000 ? 5 : 15) * (mult / 2)));
      const leadTimeDays = 7; // Average supplier dispatch time
      const safetyStock = Math.round(avgDailySales * 4); // 4 days safety buffer
      const reorderPoint = Math.round((avgDailySales * leadTimeDays) + safetyStock);
      const isCritical = currentStock <= reorderPoint;
      const recommendedOrderQty = Math.max(50, Math.round((reorderPoint * 2) - currentStock));
      const estCost = recommendedOrderQty * Number(prod.price || prod.basePrice || 500);

      return {
        id: prod.id,
        title: prod.title,
        category: prod.category || 'Fertilizers',
        currentStock,
        reorderPoint,
        safetyStock,
        avgDailySales,
        isCritical,
        recommendedOrderQty,
        estCost,
        unit: prod.unit || 'Bag'
      };
    });
  }, [products, season]);

  // Critical Low Stock Items
  const criticalItems = useMemo(() => {
    return productReorderStatus.filter(p => p.isCritical);
  }, [productReorderStatus]);

  // Generate Automated Purchase Order (PO Draft)
  const handleGeneratePO = async (item) => {
    setGeneratingForId(item.id);
    const poNumber = `PO-AUTO-${Date.now().toString().slice(-6)}`;
    const matchedSupplier = suppliers[0] || { name: 'IFFCO / Coromandel Agri Corp', id: 'SUP-001' };

    try {
      await addDoc(collection(db, 'purchase_orders'), {
        poNumber,
        supplierId: matchedSupplier.id || 'SUP-001',
        supplierName: matchedSupplier.name || matchedSupplier.companyName || 'Agri Manufacturer',
        items: [
          {
            productId: item.id,
            productName: item.title,
            quantity: item.recommendedOrderQty,
            unit: item.unit,
            estimatedRate: Math.round(item.estCost / item.recommendedOrderQty),
            totalAmount: item.estCost
          }
        ],
        totalAmount: item.estCost,
        season,
        triggerType: 'AUTOMATIC_REORDER_ENGINE',
        status: 'PENDING_APPROVAL', // PENDING_APPROVAL | APPROVED | DISPATCHED
        createdAt: Timestamp.now(),
        createdBy: user?.email || 'AI Inventory Engine'
      });

      toast.success(`Generated Draft Purchase Order ${poNumber} for ${item.title}!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PO.');
    } finally {
      setGeneratingForId(null);
    }
  };

  // Bulk Auto-Generate PO for All Critical Items
  const handleBulkGeneratePO = async () => {
    if (criticalItems.length === 0) {
      toast.error('No items currently below reorder threshold.');
      return;
    }

    try {
      for (const item of criticalItems.slice(0, 5)) {
        await handleGeneratePO(item);
      }
      toast.success(`Generated ${Math.min(5, criticalItems.length)} Purchase Orders for critical stock!`);
    } catch (err) {
      console.error(err);
      toast.error('Bulk generation error.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles size={14} className="text-yellow-300" />
              Season-Aware Predictive Procurement Engine
            </div>
            <h2 className="text-2xl font-black">Automated Re-Order Level (ROL) & PO Generator</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Dynamically calculates safety stock and re-order points based on agricultural seasons (Rabi / Kharif) and automatically generates supplier Purchase Orders before stockouts occur.
            </p>
          </div>
          <button
            onClick={handleBulkGeneratePO}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <ClipboardList size={20} />
            Bulk Create POs ({criticalItems.length})
          </button>
        </div>
      </div>

      {/* Season Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          {[
            { id: 'RABI', label: '🌾 Rabi Season (Winter / Wheat & Mustard)' },
            { id: 'KHARIF', label: '🌱 Kharif Season (Monsoon / Paddy & Maize)' },
            { id: 'ZAID', label: '☀️ Zaid Season (Summer Vegetables)' }
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSeason(s.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                season === s.id ? 'bg-[#1E3A8A] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">
          Season Demand Multiplier: <strong className="text-blue-700">{season === 'KHARIF' ? '2.5x' : (season === 'RABI' ? '2.2x' : '1.2x')}</strong>
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Critical Low Stock Items</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-rose-600">{criticalItems.length}</h3>
            <div className="h-10 w-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 font-bold">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-[11px] text-rose-600 mt-2 font-medium">Stock below dynamic ROL</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Reorder Valuation</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(criticalItems.reduce((acc, c) => acc + c.estCost, 0))}
            </h3>
            <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Estimated PO investment</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Monitored Catalog SKUs</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{products.length}</h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <Layers size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Auto-safety buffer mapped</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">PO Auto-Draft Status</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-lg font-black text-emerald-700">1-Click Ready</h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <PackageCheck size={20} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-600 mt-2 font-medium">Direct to procurement queue</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <RefreshCw className="text-[#1E3A8A]" size={18} />
            Catalog Re-Order Threshold & Predictive Safety Stock
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {productReorderStatus.length} Products Monitored
          </span>
        </div>

        <DataTable
          data={productReorderStatus}
          columns={[
            {
              header: 'Product / Agri Item',
              accessor: 'title',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.title}</span>
                  <span className="text-xs text-gray-500 font-semibold">{row.category}</span>
                </div>
              )
            },
            {
              header: 'Current Stock',
              accessor: 'currentStock',
              render: (row) => (
                <span
                  className={`font-black text-sm ${
                    row.isCritical ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {row.currentStock} {row.unit}s
                </span>
              )
            },
            {
              header: 'Dynamic ROL Threshold',
              accessor: 'reorderPoint',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-800 block">{row.reorderPoint} {row.unit}s</span>
                  <span className="text-[10px] text-gray-400">Safety Buffer: {row.safetyStock}</span>
                </div>
              )
            },
            {
              header: 'Stock Status',
              accessor: 'isCritical',
              render: (row) => (
                row.isCritical ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-black border border-rose-200">
                    <AlertTriangle size={12} /> REORDER REQUIRED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> HEALTHY STOCK
                  </span>
                )
              )
            },
            {
              header: 'Suggested Order Qty',
              accessor: 'recommendedOrderQty',
              render: (row) => (
                <div>
                  <span className="font-black text-blue-800 block">{row.recommendedOrderQty} {row.unit}s</span>
                  <span className="text-[10px] text-gray-500 font-medium">{formatCurrency(row.estCost)}</span>
                </div>
              )
            },
            {
              header: 'Action',
              accessor: 'id',
              render: (row) => (
                <button
                  onClick={() => handleGeneratePO(row)}
                  disabled={generatingForId === row.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E3A8A] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Plus size={12} />
                  <span>Generate PO Draft</span>
                </button>
              )
            }
          ]}
        />
      </div>
    </div>
  );
}

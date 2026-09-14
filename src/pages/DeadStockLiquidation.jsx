import React, { useState, useEffect, useMemo } from "react";
import {
  Package,
  AlertTriangle,
  Flame,
  ArrowRightLeft,
  RotateCcw,
  Tag,
  Search,
  Download,
  IndianRupee,
  Layers,
  Building2,
  TrendingDown,
  Clock,
  Sparkles,
  CheckCircle2,
  X,
  Loader2,
  Coins,
  Store,
  ChevronRight
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, addDoc, Timestamp } from "firebase/firestore";
import { db, auth } from "../firebase/config";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import { formatCurrency } from "../utils/formatters";
import { useAuth } from "../hooks/useAuth";

export default function DeadStockLiquidation() {
  const { user, role } = useAuth();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [agingFilter, setAgingFilter] = useState("ALL"); // ALL, CRITICAL (>90d), SLOW (45-90d), MODERATE (20-45d), FAST (<20d)
  const [hubFilter, setHubFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Liquidation Action Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [actionType, setActionType] = useState(null); // "FLASH_SALE" | "B2B_LOT" | "HUB_TRANSFER" | "SUPPLIER_RTV"
  const [actionProcessing, setActionProcessing] = useState(false);

  // Form states for modals
  const [flashDiscountPercent, setFlashDiscountPercent] = useState(25);
  const [b2bPrice, setB2bPrice] = useState("");
  const [b2bMinQty, setB2bMinQty] = useState(20);
  const [b2bDealerName, setB2bDealerName] = useState("");
  const [targetHubId, setTargetHubId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [rtvReason, setRtvReason] = useState("Slow sales & pre-expiry stock clearance");

  useEffect(() => {
    // 1. Fetch Warehouses
    const unsubWh = onSnapshot(collection(db, "warehouses"), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch Products & SKUs
    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        // Calculate inventory aging days based on lastSoldAt or createdAt
        const lastSoldDate = data.lastSoldAt?.toDate ? data.lastSoldAt.toDate() : (data.createdAt?.toDate ? data.createdAt.toDate() : new Date(Date.now() - 65 * 86400000));
        const daysSinceLastSale = Math.max(0, Math.floor((Date.now() - lastSoldDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        const availableStock = Number(data.stock ?? data.inventory?.availableStock ?? 0);
        const landingCost = Number(data.landingCost ?? data.pricing?.landingCost ?? (data.price ? data.price * 0.8 : 0));
        const price = Number(data.price ?? data.pricing?.consumerPrice ?? 0);

        return {
          id: d.id,
          ...data,
          daysSinceLastSale,
          availableStock,
          landingCost,
          price,
          totalCapitalLocked: availableStock * landingCost
        };
      });
      setProducts(list);
      setLoading(false);
    }, () => setLoading(false));

    return () => {
      unsubWh();
      unsubProd();
    };
  }, []);

  // Classify products into aging buckets
  const classifiedProducts = useMemo(() => {
    return products.map(p => {
      let bucket = "FAST";
      let badgeColor = "bg-green-100 text-green-800 border-green-200";
      let severity = "LOW";

      if (p.daysSinceLastSale > 90) {
        bucket = "CRITICAL";
        badgeColor = "bg-red-100 text-red-800 border-red-200";
        severity = "HIGH";
      } else if (p.daysSinceLastSale >= 45) {
        bucket = "SLOW";
        badgeColor = "bg-amber-100 text-amber-800 border-amber-200";
        severity = "MEDIUM";
      } else if (p.daysSinceLastSale >= 20) {
        bucket = "MODERATE";
        badgeColor = "bg-blue-100 text-blue-800 border-blue-200";
        severity = "NORMAL";
      }

      return {
        ...p,
        agingBucket: bucket,
        badgeColor,
        severity
      };
    });
  }, [products]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const critical = classifiedProducts.filter(p => p.agingBucket === "CRITICAL" && p.availableStock > 0);
    const slow = classifiedProducts.filter(p => p.agingBucket === "SLOW" && p.availableStock > 0);
    const moderate = classifiedProducts.filter(p => p.agingBucket === "MODERATE" && p.availableStock > 0);

    const criticalCapital = critical.reduce((sum, p) => sum + p.totalCapitalLocked, 0);
    const slowCapital = slow.reduce((sum, p) => sum + p.totalCapitalLocked, 0);
    const totalLockedCapital = criticalCapital + slowCapital;
    const totalStagnantUnits = critical.reduce((sum, p) => sum + p.availableStock, 0) + slow.reduce((sum, p) => sum + p.availableStock, 0);

    return {
      criticalCount: critical.length,
      slowCount: slow.length,
      moderateCount: moderate.length,
      criticalCapital,
      slowCapital,
      totalLockedCapital,
      totalStagnantUnits
    };
  }, [classifiedProducts]);

  // Filtered List
  const filteredProducts = useMemo(() => {
    return classifiedProducts.filter(p => {
      const matchSearch = !searchTerm ||
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.brand || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.id || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchAging = agingFilter === "ALL" || p.agingBucket === agingFilter;
      const matchHub = hubFilter === "ALL" || p.warehouseId === hubFilter || p.warehouseCode === hubFilter;
      const matchCat = categoryFilter === "ALL" || (p.category || "").toUpperCase() === categoryFilter.toUpperCase();

      return matchSearch && matchAging && matchHub && matchCat && p.availableStock > 0;
    }).sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
  }, [classifiedProducts, searchTerm, agingFilter, hubFilter, categoryFilter]);

  // Available unique categories
  const categories = useMemo(() => {
    const set = new Set();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // ==========================================
  // ACTION HANDLERS
  // ==========================================

  // 1. Flash Clearance Sale on Customer App
  const handleLaunchFlashSale = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setActionProcessing(true);
    try {
      const discount = Number(flashDiscountPercent);
      const discountedPrice = Math.round(selectedProduct.price * (1 - discount / 100));

      await updateDoc(doc(db, "products", selectedProduct.id), {
        isFlashSale: true,
        flashDiscountPercent: discount,
        flashDiscountedPrice: discountedPrice,
        originalPrice: selectedProduct.price,
        price: discountedPrice,
        clearanceBadge: `⚡ ${discount}% Clearance Deal`,
        flashSaleStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      toast.success(`⚡ Flash Clearance Sale activated! Price updated to ₹${discountedPrice} (${discount}% OFF) on Customer App`);
      closeActionModal();
    } catch (err) {
      toast.error("Failed to launch flash sale: " + err.message);
    } finally {
      setActionProcessing(false);
    }
  };

  // 2. B2B Mandi Dealer Bulk Lot Offer
  const handleCreateB2BLot = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setActionProcessing(true);
    try {
      const lotId = `B2B-LOT-${Date.now().toString().slice(-6)}`;
      await addDoc(collection(db, "b2bOffers"), {
        lotId,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        category: selectedProduct.category || "FERTILIZER",
        offeredRate: Number(b2bPrice),
        minOrderQuantity: Number(b2bMinQty),
        totalUnitsAvailable: selectedProduct.availableStock,
        dealerTarget: b2bDealerName || "All Local Mandi Dealers",
        status: "ACTIVE_OFFER",
        createdAt: Timestamp.now(),
        actorId: user?.uid || "admin",
        actorName: user?.displayName || "Admin"
      });

      toast.success(`🚜 B2B Mandi Bulk Lot ${lotId} generated at ₹${b2bPrice}/unit!`);
      closeActionModal();
    } catch (err) {
      toast.error("Failed to create B2B lot: " + err.message);
    } finally {
      setActionProcessing(false);
    }
  };

  // 3. Demand-Driven Inter-Hub Stock Transfer
  const handleDispatchHubTransfer = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !targetHubId) {
      toast.error("Please select a target hub");
      return;
    }
    const qty = Number(transferQty);
    if (!qty || qty <= 0 || qty > selectedProduct.availableStock) {
      toast.error(`Transfer quantity must be between 1 and ${selectedProduct.availableStock}`);
      return;
    }

    setActionProcessing(true);
    try {
      const challanNumber = `KV-TRF-${Date.now().toString().slice(-6)}`;
      const sourceHubName = selectedProduct.warehouseId ? (warehouses.find(w => w.id === selectedProduct.warehouseId)?.name || selectedProduct.warehouseId) : "Purnea Central Hub";
      const targetHubName = warehouses.find(w => w.id === targetHubId)?.name || targetHubId;

      await addDoc(collection(db, "interHubTransfers"), {
        challanNumber,
        sourceHub: sourceHubName,
        destinationHub: targetHubName,
        sourceHubId: selectedProduct.warehouseId || "CENTRAL",
        destinationHubId: targetHubId,
        items: [
          {
            productId: selectedProduct.id,
            name: selectedProduct.name,
            quantity: qty,
            unitCost: selectedProduct.landingCost
          }
        ],
        totalUnits: qty,
        totalValue: qty * selectedProduct.landingCost,
        status: "IN_TRANSIT",
        createdAt: Timestamp.now(),
        creatorName: user?.displayName || "Operations Admin"
      });

      toast.success(`🚛 Transfer Challan ${challanNumber} dispatched to ${targetHubName}!`);
      closeActionModal();
    } catch (err) {
      toast.error("Failed to dispatch transfer: " + err.message);
    } finally {
      setActionProcessing(false);
    }
  };

  // 4. Supplier Return (RTV) Debit Note
  const handleSupplierRTV = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setActionProcessing(true);
    try {
      const debitNoteId = `KV-RTV-${Date.now().toString().slice(-6)}`;
      const rtvQty = selectedProduct.availableStock;
      const totalDebit = rtvQty * selectedProduct.landingCost;

      await addDoc(collection(db, "supplierDebitNotes"), {
        debitNoteId,
        type: "SLOW_MOVING_LIQUIDATION_RETURN",
        supplierName: selectedProduct.brand || "IFFCO / Bayer Agri",
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: rtvQty,
        unitCost: selectedProduct.landingCost,
        totalDebitAmount: totalDebit,
        reason: rtvReason,
        status: "ISSUED_TO_SUPPLIER",
        createdAt: Timestamp.now(),
        actorName: user?.displayName || "Finance / Sourcing Head"
      });

      toast.success(`↩️ Supplier Debit Note ${debitNoteId} (₹${totalDebit.toLocaleString("en-IN")}) generated!`);
      closeActionModal();
    } catch (err) {
      toast.error("Failed to create RTV debit note: " + err.message);
    } finally {
      setActionProcessing(false);
    }
  };

  const openActionModal = (product, type) => {
    setSelectedProduct(product);
    setActionType(type);
    setFlashDiscountPercent(25);
    setB2bPrice(Math.round(product.landingCost * 1.03)); // Cost + 3% default
    setB2bMinQty(Math.min(20, product.availableStock));
    setTransferQty(Math.min(50, product.availableStock));
    setTargetHubId(warehouses.length > 0 ? warehouses[0].id : "");
  };

  const closeActionModal = () => {
    setSelectedProduct(null);
    setActionType(null);
  };

  // Export Master Dead Stock CSV
  const handleExportCSV = () => {
    const headers = ["Product ID", "Product Name", "Category", "Brand", "Days Zero Movement", "Aging Bucket", "Stock Units", "Landing Cost (INR)", "Total Capital Locked (INR)"];
    const rows = filteredProducts.map(p => [
      `"${p.id}"`,
      `"${p.name || ''}"`,
      `"${p.category || ''}"`,
      `"${p.brand || ''}"`,
      p.daysSinceLastSale,
      p.agingBucket,
      p.availableStock,
      p.landingCost,
      p.totalCapitalLocked
    ]);

    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = `Dead_Stock_Liquidation_Register_${new Date().toLocaleDateString("en-IN")}.csv`;
    link.click();
    toast.success("Dead Stock Master CSV Downloaded!");
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-gray-400 font-bold flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#0B4D31] mb-3" size={36} />
        <span>Scanning stock turnover velocity & trapped working capital...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Slow-Moving & Dead Stock Liquidation Engine"
        subtitle="Detect stagnant agricultural inventory (> 45 & > 90 days), unlock trapped working capital, and trigger automated liquidation workflows."
        actions={[
          {
            label: 'Export Capital Register',
            icon: Download,
            onClick: handleExportCSV,
            variant: 'secondary'
          }
        ]}
      />

      {/* Trapped Capital Hero Banner */}
      <div className="bg-gradient-to-r from-red-950 via-gray-900 to-red-950 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-red-900/40 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 relative z-10 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={12} /> Trapped Working Capital Alert
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            {formatCurrency(metrics.totalLockedCapital)}
          </h2>
          <p className="text-xs text-gray-300 font-medium leading-relaxed">
            Total working capital locked across <strong>{metrics.totalStagnantUnits.toLocaleString("en-IN")} stagnant units</strong> in Purnea, Katihar, and Araria depots. Use 1-click liquidation tools below to recover cash flow.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 relative z-10 shrink-0">
          <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase text-red-300">Critical Dead Stock (&gt;90d)</p>
            <p className="text-xl font-black text-white mt-1">{metrics.criticalCount} SKUs</p>
            <p className="text-[10px] text-red-200 font-bold mt-0.5">{formatCurrency(metrics.criticalCapital)} locked</p>
          </div>
          <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase text-amber-300">Slow Moving (45-90d)</p>
            <p className="text-xl font-black text-white mt-1">{metrics.slowCount} SKUs</p>
            <p className="text-[10px] text-amber-200 font-bold mt-0.5">{formatCurrency(metrics.slowCapital)} locked</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by product name, brand, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0B4D31]"
            />
          </div>

          {/* Aging Filter */}
          <select
            value={agingFilter}
            onChange={(e) => setAgingFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          >
            <option value="ALL">All Aging Categories</option>
            <option value="CRITICAL">🔴 Critical Dead Stock (&gt; 90d)</option>
            <option value="SLOW">🟠 Slow Moving (45 - 90d)</option>
            <option value="MODERATE">🟡 Moderate Moving (20 - 45d)</option>
            <option value="FAST">🟢 Fast Moving (&lt; 20d)</option>
          </select>

          {/* Depot Filter */}
          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          >
            <option value="ALL">All Regional Depots</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>🏢 {w.name}</option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-gray-400 font-bold shrink-0">
          Showing {filteredProducts.length} Stagnant SKUs
        </div>
      </div>

      {/* Inventory Liquidation Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
              <th className="py-3.5 px-4">Product & Brand</th>
              <th className="py-3.5 px-4">Category</th>
              <th className="py-3.5 px-4 text-center">Zero Movement Days</th>
              <th className="py-3.5 px-4 text-center">Aging Status</th>
              <th className="py-3.5 px-4 text-center">Available Stock</th>
              <th className="py-3.5 px-4 text-right">Landing Cost</th>
              <th className="py-3.5 px-4 text-right">Capital Locked (₹)</th>
              <th className="py-3.5 px-4 text-center">1-Click Liquidation Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-16 text-center text-gray-400">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-bold text-gray-800 text-sm">No Critical Dead Stock Found</p>
                  <p className="text-xs text-gray-400 mt-1">All agricultural inventory is circulating within healthy velocity thresholds.</p>
                </td>
              </tr>
            ) : (
              filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-gray-900 text-xs">{p.name || "Agri Product"}</div>
                    <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5 mt-0.5">
                      <span>Brand: <strong>{p.brand || "General"}</strong></span>
                      <span>•</span>
                      <span className="font-mono">ID: {p.id.slice(0, 8)}...</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-bold text-[10px]">
                      {p.category || "FERTILIZER"}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    <span className="font-mono font-black text-gray-900 text-xs">
                      {p.daysSinceLastSale} Days
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${p.badgeColor}`}>
                      {p.agingBucket === "CRITICAL" ? "🔴 Dead (>90d)" : p.agingBucket === "SLOW" ? "🟠 Slow (45-90d)" : "🟡 Moderate"}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center font-mono font-black text-gray-900 text-sm">
                    {p.availableStock}
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono text-gray-600">
                    ₹{p.landingCost.toLocaleString("en-IN")}
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono font-black text-red-600 text-sm">
                    ₹{p.totalCapitalLocked.toLocaleString("en-IN")}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {/* 1. Flash Sale */}
                      <button
                        onClick={() => openActionModal(p, "FLASH_SALE")}
                        className="px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        title="Launch Flash Clearance Sale on Customer App"
                      >
                        <Flame size={11} className="text-amber-600" />
                        <span>Flash Sale</span>
                      </button>

                      {/* 2. B2B Lot */}
                      <button
                        onClick={() => openActionModal(p, "B2B_LOT")}
                        className="px-2.5 py-1 bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        title="Offer Wholesale Lot to Mandi Dealers"
                      >
                        <Store size={11} className="text-blue-600" />
                        <span>Mandi Lot</span>
                      </button>

                      {/* 3. Inter-Hub Transfer */}
                      <button
                        onClick={() => openActionModal(p, "HUB_TRANSFER")}
                        className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        title="Transfer to High-Demand Depot"
                      >
                        <ArrowRightLeft size={11} className="text-emerald-600" />
                        <span>Shift Hub</span>
                      </button>

                      {/* 4. Supplier RTV */}
                      <button
                        onClick={() => openActionModal(p, "SUPPLIER_RTV")}
                        className="px-2.5 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        title="Issue Supplier Return (RTV) Debit Note"
                      >
                        <RotateCcw size={11} className="text-purple-600" />
                        <span>RTV Note</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================== */}
      {/* 4-WAY LIQUIDATION ACTION MODALS            */}
      {/* ========================================== */}
      {selectedProduct && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  {actionType === "FLASH_SALE" && <><Flame className="text-amber-500" size={18} /> Launch Flash Clearance Sale</>}
                  {actionType === "B2B_LOT" && <><Store className="text-blue-500" size={18} /> Create B2B Mandi Wholesale Lot</>}
                  {actionType === "HUB_TRANSFER" && <><ArrowRightLeft className="text-emerald-500" size={18} /> Inter-Hub Stock Balancing</>}
                  {actionType === "SUPPLIER_RTV" && <><RotateCcw className="text-purple-500" size={18} /> Supplier Return (RTV) Debit Note</>}
                </h3>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  {selectedProduct.name} ({selectedProduct.availableStock} units in stock)
                </p>
              </div>
              <button onClick={closeActionModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* ACTION 1: Flash Sale Form */}
            {actionType === "FLASH_SALE" && (
              <form onSubmit={handleLaunchFlashSale} className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Original Consumer Price: ₹{selectedProduct.price}</p>
                  <p className="font-bold">Unit Landing Cost: ₹{selectedProduct.landingCost}</p>
                  <p className="text-[11px] text-amber-700">This item will be promoted on the KrishiVishal App banner as a clearance deal.</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Discount Percentage (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={flashDiscountPercent}
                    onChange={(e) => setFlashDiscountPercent(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-amber-600"
                  />
                </div>

                <div className="p-3 bg-gray-100 rounded-xl text-xs font-bold text-gray-700 flex justify-between">
                  <span>New Discounted Selling Price:</span>
                  <span className="font-mono text-amber-700 font-black">
                    ₹{Math.round(selectedProduct.price * (1 - Number(flashDiscountPercent) / 100))}
                  </span>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeActionModal} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">Cancel</button>
                  <button type="submit" disabled={actionProcessing} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50">
                    {actionProcessing ? "Publishing..." : "Publish Flash Sale"}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION 2: B2B Wholesale Lot Form */}
            {actionType === "B2B_LOT" && (
              <form onSubmit={handleCreateB2BLot} className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-1">
                  <p className="font-bold">Total Stagnant Stock: {selectedProduct.availableStock} Units</p>
                  <p className="font-bold">Cost Price: ₹{selectedProduct.landingCost}/unit</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">B2B Wholesale Price per Unit (₹)</label>
                  <input
                    required
                    type="number"
                    value={b2bPrice}
                    onChange={(e) => setB2bPrice(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Minimum Order Quantity (MOQ)</label>
                  <input
                    type="number"
                    value={b2bMinQty}
                    onChange={(e) => setB2bMinQty(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Target Mandi Distributor / Dealer</label>
                  <input
                    type="text"
                    placeholder="e.g. Gulabbagh Mandi Wholesalers"
                    value={b2bDealerName}
                    onChange={(e) => setB2bDealerName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeActionModal} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">Cancel</button>
                  <button type="submit" disabled={actionProcessing} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50">
                    {actionProcessing ? "Creating..." : "Generate B2B Lot"}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION 3: Inter-Hub Transfer Form */}
            {actionType === "HUB_TRANSFER" && (
              <form onSubmit={handleDispatchHubTransfer} className="space-y-4">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold">Source Stock: {selectedProduct.availableStock} Units</p>
                  <p className="text-[11px] text-emerald-700">Transfer inventory to another depot where sowing demand is higher.</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Destination Hub *</label>
                  <select
                    required
                    value={targetHubId}
                    onChange={(e) => setTargetHubId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-[#0B4D31]"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>🏢 {w.name} ({w.district})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Transfer Quantity (Units) *</label>
                  <input
                    required
                    type="number"
                    max={selectedProduct.availableStock}
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-[#0B4D31]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeActionModal} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">Cancel</button>
                  <button type="submit" disabled={actionProcessing} className="flex-1 py-2.5 bg-[#0B4D31] hover:bg-[#083a25] text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50">
                    {actionProcessing ? "Dispatching..." : "Dispatch Transfer"}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION 4: Supplier Return (RTV) Form */}
            {actionType === "SUPPLIER_RTV" && (
              <form onSubmit={handleSupplierRTV} className="space-y-4">
                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 text-xs text-purple-900 space-y-1">
                  <p className="font-bold">Total Return Value: ₹{(selectedProduct.availableStock * selectedProduct.landingCost).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-purple-700">Manufacturer/Distributor: <strong>{selectedProduct.brand || "IFFCO Agri"}</strong></p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Return Reason / Justification</label>
                  <textarea
                    rows={2}
                    value={rtvReason}
                    onChange={(e) => setRtvReason(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-purple-600"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeActionModal} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">Cancel</button>
                  <button type="submit" disabled={actionProcessing} className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50">
                    {actionProcessing ? "Generating..." : "Issue RTV Debit Note"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

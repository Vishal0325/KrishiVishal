import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Building2,
  Package,
  Landmark,
  Bike,
  ArrowRightLeft,
  Search,
  Plus,
  Download,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  Coins,
  ShieldCheck,
  Clock,
  Calendar,
  Layers,
  MapPin,
  Phone,
  User,
  Loader2
} from "lucide-react";
import { collection, query, where, onSnapshot, addDoc, Timestamp } from "firebase/firestore";
import { db, auth } from "../../firebase/config";
import toast from "react-hot-toast";
import DataTable from "../common/DataTable";
import MetricCard from "../common/MetricCard";
import { formatCurrency } from "../../utils/formatters";
import { useAuth } from "../../hooks/useAuth";

export default function HubConsoleModal({ hub, onClose }) {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState("stock"); // "stock" | "financials" | "fleet" | "transfers"

  // Data states
  const [skus, setSkus] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [riders, setRiders] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter states
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL"); // ALL, LOW, OUT, HEALTHY
  const [datePeriod, setDatePeriod] = useState("All Time");

  // Record Hub Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "OFFICE_RENT",
    amount: "",
    description: ""
  });

  useEffect(() => {
    if (!hub?.id) return;
    setLoading(true);

    // 1. Subscribe to SKUs/Products for this Hub
    const unsubSkus = onSnapshot(collection(db, "skus"), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter items located in or associated with this hub
      const hubSkus = all.filter(s => !s.warehouseId || s.warehouseId === hub.id || s.warehouseId === hub.code);
      setSkus(hubSkus.length > 0 ? hubSkus : all);
    }, (err) => console.warn("SKU fetch error:", err));

    // 2. Subscribe to Orders for this Hub
    const ordersQuery = query(
      collection(db, "orders"),
      where("warehouseId", "==", hub.id)
    );
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {
      // Fallback: match by district or code if warehouseId field is empty
      const unsubFallback = onSnapshot(collection(db, "orders"), (allSnap) => {
        const matched = allSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(o => o.warehouseId === hub.id || o.hubCode === hub.code || (o.shippingAddress?.district || "").toLowerCase() === (hub.district || "").toLowerCase());
        setOrders(matched);
      });
      return () => unsubFallback();
    });

    // 3. Subscribe to Ledger Expenses for this Hub
    const ledgerQuery = query(
      collection(db, "ledger"),
      where("type", "==", "DEBIT")
    );
    const unsubLedger = onSnapshot(ledgerQuery, (snap) => {
      const allDebit = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const hubDebit = allDebit.filter(e => !e.warehouseId || e.warehouseId === hub.id || e.warehouseId === hub.code);
      setExpenses(hubDebit);
    });

    // 4. Subscribe to Riders for this Hub
    const ridersQuery = query(collection(db, "riders"));
    const unsubRiders = onSnapshot(ridersQuery, (snap) => {
      const allRiders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const hubRiders = allRiders.filter(r => !r.warehouseId || r.warehouseId === hub.id || r.hubCode === hub.code || (r.district || "").toLowerCase() === (hub.district || "").toLowerCase());
      setRiders(hubRiders);
    });

    // 5. Subscribe to Inter-Hub Transfers
    const transfersQuery = query(collection(db, "interHubTransfers"));
    const unsubTransfers = onSnapshot(transfersQuery, (snap) => {
      const allTransfers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const hubTransfers = allTransfers.filter(t => t.sourceHub === hub.id || t.destinationHub === hub.id || t.sourceHub === hub.code || t.destinationHub === hub.code);
      setTransfers(hubTransfers);
      setLoading(false);
    }, () => setLoading(false));

    return () => {
      unsubSkus();
      unsubOrders();
      unsubLedger();
      unsubRiders();
      unsubTransfers();
    };
  }, [hub]);

  // ==========================================
  // TAB 1: Hub Stock & Valuation KPI Calculations
  // ==========================================
  const stockKpis = useMemo(() => {
    let totalItems = skus.length;
    let totalUnits = 0;
    let totalValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    skus.forEach(s => {
      const qty = Number(s.inventory?.availableStock ?? s.stock ?? 0);
      const cost = Number(s.pricing?.landingCost || s.pricing?.consumerPrice || s.price || 0);
      const reorder = Number(s.reorderLevel || 30);

      totalUnits += qty;
      totalValuation += (qty * cost);

      if (qty === 0) outOfStockCount++;
      else if (qty <= reorder) lowStockCount++;
    });

    return { totalItems, totalUnits, totalValuation, lowStockCount, outOfStockCount };
  }, [skus]);

  const filteredSkus = useMemo(() => {
    return skus.filter(s => {
      const nameMatch = !stockSearch ||
        (s.name || "").toLowerCase().includes(stockSearch.toLowerCase()) ||
        (s.skuCode || s.id || "").toLowerCase().includes(stockSearch.toLowerCase()) ||
        (s.segments?.category || "").toLowerCase().includes(stockSearch.toLowerCase());

      const qty = Number(s.inventory?.availableStock ?? s.stock ?? 0);
      const reorder = Number(s.reorderLevel || 30);

      let stockMatch = true;
      if (stockFilter === "LOW") stockMatch = qty > 0 && qty <= reorder;
      else if (stockFilter === "OUT") stockMatch = qty === 0;
      else if (stockFilter === "HEALTHY") stockMatch = qty > reorder;

      return nameMatch && stockMatch;
    });
  }, [skus, stockSearch, stockFilter]);

  // ==========================================
  // TAB 2: Hub Financials & Depot P&L Calculations
  // ==========================================
  const financialMetrics = useMemo(() => {
    // 1. Delivered Orders Revenue
    const deliveredOrders = orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED");
    const grossRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.totalAmount || o.orderTotal || 0), 0);
    
    // 2. GST Collected (Estimated 5% on agri fertilizers/seeds average)
    const gstCollected = deliveredOrders.reduce((sum, o) => {
      if (o.taxAmount) return sum + Number(o.taxAmount);
      const amt = Number(o.totalAmount || 0);
      return sum + Math.round(amt * 0.05);
    }, 0);

    // 3. Operating Expenses for this Hub
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 4. Estimated COGS (Cost of goods sold approx 78% of revenue for agri retail)
    const estimatedCOGS = Math.round(grossRevenue * 0.78);
    const grossProfit = grossRevenue - estimatedCOGS;
    const netProfit = grossProfit - totalExpenses;

    // 5. COD Cash in hand / In Locker
    const codOrders = deliveredOrders.filter(o => (o.paymentMethod || "COD").toUpperCase() === "COD");
    const codCollected = codOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    return {
      totalOrders: orders.length,
      deliveredOrdersCount: deliveredOrders.length,
      grossRevenue,
      gstCollected,
      totalExpenses,
      estimatedCOGS,
      grossProfit,
      netProfit,
      codCollected
    };
  }, [orders, expenses]);

  // Record Local Hub Expense Handler
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSavingExpense(true);
    try {
      await addDoc(collection(db, "ledger"), {
        account: expenseForm.category,
        type: "DEBIT",
        amount: Number(expenseForm.amount),
        description: `[${hub.name}] ${expenseForm.description || expenseForm.category}`,
        warehouseId: hub.id,
        hubCode: hub.code,
        timestamp: Timestamp.now(),
        actorId: user?.uid || auth.currentUser?.uid || "admin",
        actorEmail: user?.email || auth.currentUser?.email || "admin@krishivishal.com",
        actorName: user?.displayName || user?.email?.split("@")[0] || "Hub Manager",
        actorRole: role || "HubManager"
      });
      toast.success(`Expense ₹${expenseForm.amount} recorded for ${hub.name}!`);
      setIsExpenseModalOpen(false);
      setExpenseForm({ category: "OFFICE_RENT", amount: "", description: "" });
    } catch (err) {
      toast.error("Failed to record expense: " + err.message);
    } finally {
      setSavingExpense(false);
    }
  };

  // Export Hub Stock to CSV
  const handleExportStockCSV = () => {
    const headers = ["SKU Code", "Product Name", "Category", "Available Stock (Units)", "Landing Cost (INR)", "Total Valuation (INR)", "Reorder Level", "Status"];
    const rows = filteredSkus.map(s => {
      const qty = Number(s.inventory?.availableStock ?? s.stock ?? 0);
      const cost = Number(s.pricing?.landingCost || s.pricing?.consumerPrice || s.price || 0);
      const reorder = Number(s.reorderLevel || 30);
      const status = qty === 0 ? "OUT_OF_STOCK" : qty <= reorder ? "LOW_STOCK" : "HEALTHY";
      return [
        `"${s.skuCode || s.id}"`,
        `"${s.name || ''}"`,
        `"${s.segments?.category || ''}"`,
        qty,
        cost,
        qty * cost,
        reorder,
        status
      ];
    });

    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = `Stock_Valuation_${hub.code}_${new Date().toLocaleDateString("en-IN")}.csv`;
    link.click();
    toast.success("Hub Stock Report downloaded!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-gray-100 my-auto">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-gray-900 via-emerald-950 to-gray-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">{hub.name}</h2>
                <span className="font-mono text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                  {hub.code}
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-md">
                  {hub.type === "CENTRAL_DEPOT" ? "सेंट्रल डिपो" : "रीजनल हब"}
                </span>
              </div>
              <p className="text-xs text-gray-300 font-medium mt-0.5 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-emerald-400" />
                  {hub.district} (PIN: {hub.pincode || "854301"})
                </span>
                <span>•</span>
                <span>प्रबंधक: <strong>{hub.managerName || "Assigned Manager"}</strong> ({hub.phone || "—"})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus size={14} /> Record Hub Expense
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 pt-4 border-b border-gray-100 bg-white flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 cursor-pointer ${
              activeTab === "stock"
                ? "border-[#0B4D31] text-[#0B4D31] bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Package size={15} />
            <span>Hub Inventory & Total Valuation (₹)</span>
          </button>

          <button
            onClick={() => setActiveTab("financials")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 cursor-pointer ${
              activeTab === "financials"
                ? "border-[#0B4D31] text-[#0B4D31] bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Landmark size={15} />
            <span>Depot P&L, Expenses & GST</span>
          </button>

          <button
            onClick={() => setActiveTab("fleet")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 cursor-pointer ${
              activeTab === "fleet"
                ? "border-[#0B4D31] text-[#0B4D31] bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Bike size={15} />
            <span>Hub Fleet & Riders ({riders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("transfers")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 cursor-pointer ${
              activeTab === "transfers"
                ? "border-[#0B4D31] text-[#0B4D31] bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <ArrowRightLeft size={15} />
            <span>Inter-Hub Stock Transfers ({transfers.length})</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar bg-gray-50/40">
          {/* ========================================== */}
          {/* TAB 1: Hub Stock & Valuation Console       */}
          {/* ========================================== */}
          {activeTab === "stock" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Hub Valuation</p>
                  <h3 className="text-2xl font-black text-[#0B4D31] mt-1">{formatCurrency(stockKpis.totalValuation)}</h3>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">{stockKpis.totalUnits.toLocaleString("en-IN")} Physical Units</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active SKUs / Products</p>
                  <h3 className="text-2xl font-black text-gray-900 mt-1">{stockKpis.totalItems}</h3>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Staged in {hub.name}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Low Stock Alerts</p>
                  <h3 className="text-2xl font-black text-amber-700 mt-1">{stockKpis.lowStockCount}</h3>
                  <p className="text-[10px] text-amber-600 font-bold mt-1">Below Reorder Level</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Out of Stock Items</p>
                  <h3 className="text-2xl font-black text-red-700 mt-1">{stockKpis.outOfStockCount}</h3>
                  <p className="text-[10px] text-red-600 font-bold mt-1">Immediate Inward Required</p>
                </div>
              </div>

              {/* Filter Toolbar */}
              <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center flex-1">
                  <Search size={16} className="text-gray-400 mr-2 ml-2" />
                  <input
                    type="text"
                    placeholder="Search SKU code, product name, or category..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs font-bold text-gray-800 w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
                  >
                    <option value="ALL">All Stock Status</option>
                    <option value="LOW">⚠️ Low Stock</option>
                    <option value="OUT">🔴 Out of Stock</option>
                    <option value="HEALTHY">✅ Healthy Stock</option>
                  </select>

                  <button
                    onClick={handleExportStockCSV}
                    className="px-4 py-1.5 bg-[#0B4D31] text-white rounded-xl text-xs font-bold hover:bg-[#083a25] transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>
              </div>

              {/* Stock Table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="py-3 px-4">SKU / Item Code</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Landing Cost (₹)</th>
                      <th className="py-3 px-4 text-center">Available Units</th>
                      <th className="py-3 px-4 text-right">Total Valuation (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                    {filteredSkus.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-gray-400">
                          <Package size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="font-bold text-gray-700">No SKUs matching filters</p>
                        </td>
                      </tr>
                    ) : (
                      filteredSkus.map(s => {
                        const qty = Number(s.inventory?.availableStock ?? s.stock ?? 0);
                        const cost = Number(s.pricing?.landingCost || s.pricing?.consumerPrice || s.price || 0);
                        const reorder = Number(s.reorderLevel || 30);
                        const totalVal = qty * cost;

                        return (
                          <tr key={s.id} className="hover:bg-emerald-50/30 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-mono font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {s.skuCode || s.id}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-gray-900">{s.name || "Agri Product"}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-bold text-[10px]">
                                {s.segments?.category || "FERTILIZER"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-gray-700">
                              ₹{cost.toLocaleString("en-IN")}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-black text-gray-900 text-sm">
                              {qty}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-[#0B4D31]">
                              ₹{totalVal.toLocaleString("en-IN")}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {qty === 0 ? (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-black text-[9px]">OUT OF STOCK</span>
                              ) : qty <= reorder ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-black text-[9px]">LOW STOCK</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-black text-[9px]">HEALTHY</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 2: Depot P&L, Expenses & GST Console   */}
          {/* ========================================== */}
          {activeTab === "financials" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hub Gross Revenue</p>
                  <h3 className="text-2xl font-black text-emerald-800 mt-1">{formatCurrency(financialMetrics.grossRevenue)}</h3>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">{financialMetrics.deliveredOrdersCount} Delivered Orders</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Hub Operating Expenses</p>
                  <h3 className="text-2xl font-black text-red-700 mt-1">{formatCurrency(financialMetrics.totalExpenses)}</h3>
                  <p className="text-[10px] text-red-500 font-bold mt-1">Rent, Fuel, Electricity & Tea</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Hub Net Profit (P&L)</p>
                  <h3 className={`text-2xl font-black mt-1 ${financialMetrics.netProfit >= 0 ? 'text-blue-800' : 'text-red-600'}`}>
                    {formatCurrency(financialMetrics.netProfit)}
                  </h3>
                  <p className="text-[10px] text-blue-600 font-bold mt-1">After Hub Operational Costs</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm">
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">GST Collected (Output Tax)</p>
                  <h3 className="text-2xl font-black text-purple-800 mt-1">{formatCurrency(financialMetrics.gstCollected)}</h3>
                  <p className="text-[10px] text-purple-600 font-bold mt-1">CGST + SGST (Bihar State)</p>
                </div>
              </div>

              {/* Cash in Locker & COD Status Banner */}
              <div className="bg-gradient-to-r from-emerald-900 to-[#0B4D31] text-white p-6 rounded-3xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Hub Locker Cash & COD Collection</p>
                  <h3 className="text-3xl font-black tracking-tight">{formatCurrency(financialMetrics.codCollected)}</h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Total physical cash collected by {hub.name} riders. Reconciled daily via 3-Way COD Desk.
                  </p>
                </div>
                <button
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="px-5 py-3 bg-white text-emerald-900 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-50 transition-all shadow-md shrink-0"
                >
                  + Add Hub Expense
                </button>
              </div>

              {/* Hub Expenses Table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Recent Hub Operational Expenses</h4>
                  <span className="text-xs text-gray-400 font-bold">{expenses.length} Records</span>
                </div>

                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Expense Category</th>
                      <th className="py-2.5 px-3">Description / Reason</th>
                      <th className="py-2.5 px-3">Recorded By</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-gray-400">
                          No operating expenses recorded yet for {hub.name}.
                        </td>
                      </tr>
                    ) : (
                      expenses.map(e => {
                        const d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date();
                        return (
                          <tr key={e.id} className="hover:bg-gray-50/50">
                            <td className="py-2.5 px-3 text-gray-500 font-mono">
                              {d.toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-bold text-[10px]">
                                {e.account || "EXPENSE"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-900 font-bold">{e.description}</td>
                            <td className="py-2.5 px-3 text-gray-500 text-[11px]">{e.actorName || "Hub Manager"}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-red-600">
                              - ₹{Number(e.amount || 0).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 3: Hub Fleet & Rider Operations        */}
          {/* ========================================== */}
          {activeTab === "fleet" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-gray-900 uppercase">Assigned Delivery Riders</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Active delivery fleet linked to {hub.name} catchment area</p>
                </div>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-bold">
                  {riders.length} Riders Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {riders.length === 0 ? (
                  <div className="col-span-3 bg-white p-12 text-center text-gray-400 rounded-2xl border border-dashed border-gray-200">
                    <Bike size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="font-bold text-gray-700">No riders assigned to this hub</p>
                  </div>
                ) : (
                  riders.map(r => (
                    <div key={r.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900 text-xs">{r.name || r.phone}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          r.status === 'ONLINE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {r.status || 'OFFLINE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-mono">{r.phone || '—'}</p>
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                        <span>Vehicle: <strong>{r.vehicleNumber || 'Bike'}</strong></span>
                        <span className="text-emerald-700 font-bold">Cash in Hand: ₹{r.pendingCash || 0}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 4: Inter-Hub Stock Transfers           */}
          {/* ========================================== */}
          {activeTab === "transfers" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-gray-900 uppercase">Inter-Hub Inward & Outward Challans</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Form GST ITC-04 Delivery Challans & Transporter Notes</p>
                </div>
                <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl text-xs font-bold">
                  {transfers.length} Movements Logged
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="py-3 px-4">Challan No</th>
                      <th className="py-3 px-4">Movement Route</th>
                      <th className="py-3 px-4">E-Way Bill</th>
                      <th className="py-3 px-4">Vehicle No</th>
                      <th className="py-3 px-4 text-right">Units</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                    {transfers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-gray-400">
                          No stock transfers recorded for {hub.name}.
                        </td>
                      </tr>
                    ) : (
                      transfers.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50/50">
                          <td className="py-3 px-4 font-mono font-bold text-gray-900">{t.challanNumber || t.id}</td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#0B4D31]">{t.sourceHub}</span>
                            <span className="mx-1 text-gray-400">→</span>
                            <span className="font-bold text-blue-700">{t.destinationHub}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-gray-500">{t.ewayBillNumber || "N/A (< ₹50k)"}</td>
                          <td className="py-3 px-4 font-mono text-gray-800">{t.vehicleNumber || "—"}</td>
                          <td className="py-3 px-4 text-right font-mono font-black">{t.totalUnits || 0}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              t.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {t.status || 'IN_TRANSIT'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            KrishiVishal Enterprise Multi-Depot Valuation & Accounting Console
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all cursor-pointer"
          >
            Close Console
          </button>
        </div>
      </div>

      {/* Record Hub Expense Sub-Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-black text-gray-900">Record Local Hub Expense</h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Target Depot</label>
                <input
                  disabled
                  value={`${hub.name} (${hub.code})`}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Expense Category</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none"
                >
                  <option value="OFFICE_RENT">Warehouse Depot Rent</option>
                  <option value="ELECTRICITY">Electricity & Diesel GenSet</option>
                  <option value="LOGISTICS_FUEL">Rider Fuel & Vehicle Maintenance</option>
                  <option value="CHAI_SNACKS">Tea, Snacks & Staff Refreshment</option>
                  <option value="WAREHOUSE_SUPPLIES">Packing Boxes, Tape & Stationery</option>
                  <option value="MISC">Miscellaneous Repairs</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Amount (₹) *</label>
                <input
                  required
                  type="number"
                  placeholder="0.00"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Description / Note</label>
                <textarea
                  rows={2}
                  placeholder="Vendor name, bill number, details..."
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold mt-1 outline-none focus:border-red-600"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50"
                >
                  {savingExpense ? "Saving..." : "Record Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

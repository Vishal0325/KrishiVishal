import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  IndianRupee,
  Package,
  Truck,
  Wallet,
  AlertTriangle,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  PackageCheck,
  ClipboardList,
  UserPlus,
  RefreshCcw,
  Building2,
  BarChart3,
  Tag,
  ShieldAlert,
  Sprout,
  FlaskConical,
  Wrench,
  Droplets,
  Layers,
  ArrowUpRight,
  Warehouse
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';
import { formatCurrency } from '../utils/formatters';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-400 text-xs rounded-lg">Chart data unavailable</div>;
    }
    return this.props.children; 
  }
}

const getStatusBadgeStyle = (status) => {
  switch (status?.toLowerCase()) {
    case 'delivered': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'packed': return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'ready for pickup':
    case 'ready_for_pickup': return 'bg-orange-50 text-orange-700 border border-orange-200';
    case 'processing':
    case 'placed':
    case 'confirmed': return 'bg-purple-50 text-purple-700 border border-purple-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border border-red-200';
    default: return 'bg-gray-50 text-gray-700 border border-gray-200';
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { orders: allOrders } = useOrders();
  const { products } = useProducts();
  const [salesFilter, setSalesFilter] = useState('This Week');
  const [categoryFilter, setCategoryFilter] = useState('This Month');
  const [hubFilter, setHubFilter] = useState('All');
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  // 1. Dynamic Metrics Calculation via Web Worker
  const [dynamicMetrics, setDynamicMetrics] = useState({
    totalOrders: 0, totalRevenue: 0, pendingDelivery: 0,
    inventoryValue: 0, lowStockCount: 0, codCollection: 0
  });

  useEffect(() => {
    if (!allOrders && !products) return;
    const worker = new Worker(new URL('../workers/dashboardMetricsWorker.js', import.meta.url));
    worker.postMessage({ allOrders, products });
    worker.onmessage = (e) => {
      setDynamicMetrics(e.data);
    };
    return () => worker.terminate();
  }, [allOrders, products]);

  // 2. Dynamic Sales Trend (Last 7 Days)
  const salesTrendData = useMemo(() => {
    const days = 7;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      result.push({
        date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        dateStr: d.toDateString(),
        revenue: 0,
        orders: 0
      });
    }
    if (allOrders) {
      allOrders.forEach(o => {
        if (!o.createdAt) return;
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        const match = result.find(r => r.dateStr === d.toDateString());
        if (match) {
          match.orders++;
          match.revenue += Number(o.totalAmount || 0);
        }
      });
    }
    return result.map(r => ({ date: r.date, revenue: r.revenue, orders: r.orders }));
  }, [allOrders]);

  // 3. Dynamic Status Distribution
  const statusDistributionData = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return [];
    const counts = {};
    allOrders.forEach(o => {
      let s = o.status;
      if (s === 'ready_for_pickup') s = 'Ready for Pickup';
      else if (s) s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      else s = 'Processing';
      counts[s] = (counts[s] || 0) + 1;
    });

    const colors = { 'Delivered': '#22c55e', 'Packed': '#3b82f6', 'Ready for Pickup': '#f97316', 'Processing': '#a855f7', 'Cancelled': '#ef4444' };
    return Object.keys(counts).map(key => ({
      name: key,
      count: counts[key],
      percentage: ((counts[key] / allOrders.length) * 100).toFixed(1) + '%',
      color: colors[key] || '#94a3b8'
    }));
  }, [allOrders]);

  // 4. Dynamic Pipeline Counts
  const pipelineCounts = useMemo(() => {
    const counts = { processing: 0, packing: 0, packed: 0, pickup: 0, delivery: 0, delivered: 0 };
    if (allOrders) {
      allOrders.forEach(o => {
        const s = o.status?.toLowerCase() || 'processing';
        if (['placed', 'confirmed', 'processing'].includes(s)) counts.processing++;
        else if (s === 'ready for packing' || s === 'packing') counts.packing++;
        else if (s === 'packed') counts.packed++;
        else if (s === 'ready for pickup' || s === 'ready_for_pickup') counts.pickup++;
        else if (s === 'out for delivery' || s === 'dispatched') counts.delivery++;
        else if (s === 'delivered') counts.delivered++;
      });
    }
    return counts;
  }, [allOrders]);

  // 5. Dynamic Warehouse Overview
  const warehouseOverviewData = useMemo(() => {
    if (!warehouses || warehouses.length === 0) return [];
    return warehouses.map(w => ({
      id: w.id,
      code: w.code || w.name,
      stockValue: 'N/A',
      orders: 0,
      lowStock: 0,
      status: w.isActive === false ? 'Warning' : 'Healthy'
    }));
  }, [warehouses]);

  // Display orders (Recent 5)
  const displayOrders = useMemo(() => {
    if (allOrders && allOrders.length > 0) {
      return allOrders.slice(0, 5).map(o => ({
        id: o.id.length > 6 ? o.id.substring(0, 6).toUpperCase() : o.id,
        customer: o.address?.name || o.customerName || 'Farmer Partner',
        amount: Number(o.totalAmount) || 0,
        status: o.status || 'Processing',
        date: o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'
      }));
    }
    return [];
  }, [allOrders]);

  // KPI Metric Cards Data
  const metricCards = [
    {
      title: "Total Orders",
      value: dynamicMetrics.totalOrders.toLocaleString(),
      change: "Lifetime Orders",
      trend: "up",
      icon: ShoppingCart,
      iconBg: "bg-emerald-600",
      waveColor: "#10b981",
      path: "/orders"
    },
    {
      title: "Total Revenue",
      value: formatCurrency(dynamicMetrics.totalRevenue),
      change: "Lifetime Revenue",
      trend: "up",
      icon: IndianRupee,
      iconBg: "bg-blue-600",
      waveColor: "#3b82f6",
      path: "/finance"
    },
    {
      title: "Inventory Value",
      value: formatCurrency(dynamicMetrics.inventoryValue),
      change: "Based on active products",
      trend: "up",
      icon: Package,
      iconBg: "bg-purple-600",
      waveColor: "#a855f7",
      path: "/products"
    },
    {
      title: "Pending Delivery",
      value: dynamicMetrics.pendingDelivery.toString(),
      change: "Orders in pipeline",
      trend: "down",
      icon: Truck,
      iconBg: "bg-orange-500",
      waveColor: "#f97316",
      path: "/trips"
    },
    {
      title: "COD Collection",
      value: formatCurrency(dynamicMetrics.codCollection),
      change: "Pending to deposit",
      trend: "subtext",
      icon: Wallet,
      iconBg: "bg-teal-600",
      waveColor: "#14b8a6",
      path: "/cash-recon"
    },
    {
      title: "Low Stock SKUs",
      value: dynamicMetrics.lowStockCount.toString(),
      change: "Below threshold (10)",
      trend: "subtext",
      icon: AlertTriangle,
      iconBg: "bg-amber-500",
      waveColor: "#f59e0b",
      path: "/products?filter=low-stock"
    }
  ];

  // Dynamic Top Categories from real orders & products
  const topCategories = useMemo(() => {
    const categoryTotals = {};
    const categoryOrders = {};

    if (allOrders && allOrders.length > 0) {
      allOrders.forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(item => {
            const cat = item.category || 'Agri Inputs';
            const price = Number(item.price || 0);
            const qty = Number(item.quantity || 1);
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (price * qty);
            categoryOrders[cat] = (categoryOrders[cat] || 0) + qty;
          });
        }
      });
    }

    if (Object.keys(categoryTotals).length === 0 && products && products.length > 0) {
      products.forEach(p => {
        const cat = p.category || 'Agri Inputs';
        const val = Number(p.price || 0) * Number(p.stockQuantity || p.stock || 1);
        categoryTotals[cat] = (categoryTotals[cat] || 0) + val;
        categoryOrders[cat] = (categoryOrders[cat] || 0) + 1;
      });
    }

    const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxVal = sorted.length > 0 && sorted[0][1] > 0 ? sorted[0][1] : 1;

    const styles = [
      { color: 'bg-emerald-500', iconColor: 'text-emerald-600 bg-emerald-50', icon: Sprout },
      { color: 'bg-blue-500', iconColor: 'text-blue-600 bg-blue-50', icon: Droplets },
      { color: 'bg-purple-500', iconColor: 'text-purple-600 bg-purple-50', icon: Layers },
      { color: 'bg-amber-500', iconColor: 'text-amber-600 bg-amber-50', icon: FlaskConical },
      { color: 'bg-gray-500', iconColor: 'text-gray-600 bg-gray-50', icon: Wrench },
    ];

    return sorted.map(([name, totalSales], idx) => {
      const st = styles[idx % styles.length];
      const ordersCount = categoryOrders[name] || 0;
      const progress = Math.min(100, Math.max(12, Math.round((totalSales / maxVal) * 100)));
      return {
        name,
        icon: st.icon,
        color: st.color,
        iconColor: st.iconColor,
        progress,
        sales: formatCurrency(totalSales),
        orders: ordersCount
      };
    });
  }, [allOrders, products]);

  // Dynamic AI Alerts based strictly on live store state
  const aiAlerts = useMemo(() => {
    const list = [];
    if (dynamicMetrics.lowStockCount > 0) {
      list.push({
        icon: AlertTriangle,
        color: 'text-red-500 bg-red-50',
        title: `${dynamicMetrics.lowStockCount} SKUs are running low on stock`,
        sub: 'Reorder recommended',
        path: '/skus'
      });
    }
    if (dynamicMetrics.codCollection > 0) {
      list.push({
        icon: IndianRupee,
        color: 'text-blue-500 bg-blue-50',
        title: `COD collection of ${formatCurrency(dynamicMetrics.codCollection)} pending`,
        sub: 'Deposit to bank / reconcile',
        path: '/cash-recon'
      });
    }
    if (dynamicMetrics.pendingDelivery > 0) {
      list.push({
        icon: Truck,
        color: 'text-emerald-600 bg-emerald-50',
        title: `${dynamicMetrics.pendingDelivery} Orders in delivery pipeline`,
        sub: 'Check fulfillment status',
        path: '/orders'
      });
    }
    if (dynamicMetrics.totalRevenue > 0) {
      list.push({
        icon: TrendingUp,
        color: 'text-purple-600 bg-purple-50',
        title: `Total Sales: ${formatCurrency(dynamicMetrics.totalRevenue)}`,
        sub: `${dynamicMetrics.totalOrders} total orders processed`,
        path: '/finance'
      });
    }
    if (list.length < 4 && warehouses.length > 0) {
      list.push({
        icon: PackageCheck,
        color: 'text-orange-500 bg-orange-50',
        title: `${warehouses.length} Active Fulfillment Warehouses`,
        sub: 'Network nodes operating normally',
        path: '/warehouses'
      });
    }
    return list;
  }, [dynamicMetrics, warehouses]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Active Hub Selector - Only displayed if warehouses exist */}
      {warehouses.length > 0 && (
        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Active Hub:</label>
            <select
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-1.5 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="All">All Hubs (Network View)</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
            Viewing metrics for: <span className="text-gray-700">{hubFilter === 'All' ? 'Entire Network' : warehouses.find(w => w.id === hubFilter)?.name}</span>
          </div>
        </div>
      )}

      {/* 1. KPI Cards Row (6 horizontal cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {metricCards.map((card, idx) => (
          <div 
            key={idx} 
            onClick={() => navigate(card.path)} 
            className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-gray-200 transition-all min-h-[110px]"
          >
            <div className="flex items-start gap-2 mb-2 z-10">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0 ${card.iconBg}`}>
                <card.icon size={16} strokeWidth={2.2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-semibold text-gray-500 tracking-tight leading-tight truncate">{card.title}</span>
                <span className="text-lg lg:text-xl font-black text-gray-900 tracking-tight leading-tight mt-0.5">{card.value}</span>
              </div>
            </div>

            <div className="flex items-center text-[10px] font-bold z-10 mt-auto">
              <span className={
                card.trend === 'up' ? 'text-emerald-600' : 
                card.trend === 'down' ? 'text-red-500' : 
                'text-amber-500 font-medium'
              }>
                {card.change}
              </span>
            </div>

            {/* Smooth Wavy Line SVG Graph at Bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none opacity-80 z-0">
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-full">
                <path 
                  d="M0,18 C20,12 35,22 50,15 C65,8 80,18 100,10" 
                  fill="none" 
                  stroke={card.waveColor} 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Middle Row: Sales Overview (40%) | Order Status Donut (30%) | AI Alerts (30%) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 sm:gap-3.5">
        
        {/* Sales Overview */}
        <div className="md:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-gray-900">Sales Overview</h2>
            <div className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 cursor-pointer text-gray-600 transition-colors">
              <span className="text-[11px] font-bold">{salesFilter}</span>
              <ChevronDown size={12} className="text-gray-400" />
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-5">
              <div>
                <span className="text-[10px] font-semibold text-gray-400 block uppercase">Total Sales</span>
                <span className="text-lg font-black text-gray-900 block">{formatCurrency(dynamicMetrics.totalRevenue)}</span>
                <span className="text-[9px] font-bold text-emerald-600">Lifetime Revenue</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 block uppercase">Total Orders</span>
                <span className="text-lg font-black text-gray-900 block">{dynamicMetrics.totalOrders.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-emerald-600">Lifetime Orders</span>
              </div>
            </div>

            {/* Top Right Chart Legend */}
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-emerald-600 inline-block"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block"></span>
                <span className="text-gray-600">Revenue (₹)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-blue-600 inline-block"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                <span className="text-gray-600">Orders</span>
              </div>
            </div>
          </div>

          {/* Double Line Chart */}
          <div className="h-[175px] w-full">
            <ChartErrorBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrendData || []} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} 
                  />
                  <YAxis 
                    yAxisId="left" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} 
                    tickFormatter={(val) => val === 0 ? '0' : val >= 100000 ? `${val/100000}L` : `${val/1000}K`}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }} 
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#16a34a" 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: "#16a34a" }} 
                    activeDot={{ r: 5 }} 
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: "#2563eb" }} 
                    activeDot={{ r: 5 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartErrorBoundary>
          </div>
        </div>

        {/* Order Status Distribution (Donut Chart) */}
        <div className="md:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-black text-gray-900">Order Status Distribution</h2>
          </div>

          <div className="flex items-center justify-between gap-2 flex-1">
            {/* Donut Chart with Center Text */}
            <div className="relative w-[140px] h-[140px] flex-shrink-0 flex items-center justify-center">
              <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDistributionData || []}
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {(statusDistributionData || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartErrorBoundary>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-black text-gray-900 leading-tight">{dynamicMetrics.totalOrders.toLocaleString()}</span>
                <span className="text-[9px] font-semibold text-gray-400 leading-tight">Total Orders</span>
              </div>
            </div>

            {/* Donut Legend */}
            <div className="space-y-1.5 flex-1 pr-1">
              {statusDistributionData.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }}></span>
                    <span className="font-bold text-gray-700">{s.name}</span>
                  </div>
                  <span className="font-semibold text-gray-500 text-[10px]">{s.count} ({s.percentage})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Insights & Alerts */}
        <div className="md:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-gray-900">AI Insights {'&'} Alerts</h2>
            <button onClick={() => navigate('/ai-control')} className="text-[11px] font-bold text-gray-500 hover:text-gray-900 cursor-pointer">View All</button>
          </div>
          
          <div className="space-y-2.5">
            {aiAlerts.map((alert, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${alert.color}`}>
                    <alert.icon size={13} />
                  </div>
                  <div className="min-w-0 truncate">
                    <p className="text-[11px] font-bold text-gray-900 truncate leading-tight">{alert.title}</p>
                    <p className="text-[9px] text-gray-500 font-medium leading-tight">{alert.sub}</p>
                  </div>
                </div>
                <button onClick={() => navigate(alert.path)} className="text-[10px] font-bold text-emerald-600 hover:underline shrink-0">View</button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 3. Third Row: Recent Orders (33%) | Top Selling Categories (33%) | Warehouse Overview (33%) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3.5">
        
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-900">Recent Orders</h2>
            <button onClick={() => navigate('/orders')} className="text-[11px] font-bold text-gray-500 hover:text-gray-900 cursor-pointer">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 border-b border-gray-100">
                  <th className="pb-2">Order ID</th>
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayOrders.map((o, i) => (
                  <tr key={i} onClick={() => navigate('/orders')} className="hover:bg-gray-50/80 cursor-pointer transition-colors">
                    <td className="py-2.5 font-bold text-emerald-600">#KV{o.id}</td>
                    <td className="py-2.5 font-bold text-gray-800">{o.customer}</td>
                    <td className="py-2.5 font-black text-gray-900">{formatCurrency(o.amount)}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold inline-block ${getStatusBadgeStyle(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[10px] text-gray-400 font-semibold">{o.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Selling Categories */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-900">Top Selling Categories</h2>
            <div className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 cursor-pointer text-gray-600 transition-colors">
              <span className="text-[10px] font-bold">{categoryFilter}</span>
              <ChevronDown size={11} className="text-gray-400" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 px-1">
              <span>Category</span>
              <div className="flex items-center gap-6">
                <span>Sales</span>
                <span>Orders</span>
              </div>
            </div>

            {topCategories.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-xs font-semibold">
                No category sales recorded yet
              </div>
            ) : (
              topCategories.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${cat.iconColor}`}>
                        <cat.icon size={13} />
                      </div>
                      <span className="font-bold text-gray-800 text-[11px]">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-6 text-[11px]">
                      <span className="font-black text-gray-900 w-12 text-right">{cat.sales}</span>
                      <span className="font-semibold text-gray-600 w-8 text-right">{cat.orders}</span>
                    </div>
                  </div>
                  {/* Colored Progress Bar */}
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden ml-8 max-w-[calc(100%-32px)]">
                    <div className={`h-full rounded-full ${cat.color}`} style={{ width: `${cat.progress}%` }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warehouse Overview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-900">Warehouse Overview</h2>
            <button onClick={() => navigate('/warehouses')} className="text-[11px] font-bold text-gray-500 hover:text-gray-900 cursor-pointer">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 border-b border-gray-100">
                  <th className="pb-2">Warehouse</th>
                  <th className="pb-2">Stock Value</th>
                  <th className="pb-2">Orders</th>
                  <th className="pb-2">Low Stock</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {warehouseOverviewData.map((wh, i) => (
                  <tr key={i} onClick={() => navigate('/warehouses')} className="hover:bg-gray-50/80 cursor-pointer transition-colors">
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-emerald-600" />
                        <span className="font-bold text-gray-800 text-[11px]">{wh.code}</span>
                      </div>
                    </td>
                    <td className="py-2.5 font-bold text-gray-700 text-[11px]">{wh.stockValue}</td>
                    <td className="py-2.5 font-bold text-gray-700 text-[11px]">{wh.orders}</td>
                    <td className="py-2.5 font-bold text-red-500 text-[11px]">{wh.lowStock}</td>
                    <td className="py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-block ${
                        wh.status === 'Healthy' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {wh.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 4. Fourth Row: Order Fulfillment Pipeline (65%) | Quick Actions (35%) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 sm:gap-3.5">
        
        {/* Order Fulfillment Pipeline (7 cols) */}
        <div className="md:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 overflow-hidden">
          <div className="mb-4">
            <h2 className="text-sm font-black text-gray-900">
              Order Fulfillment Pipeline <span className="text-[10px] font-medium text-gray-400 ml-1">Real-time Order Flow</span>
            </h2>
          </div>

          <div className="flex items-center justify-between px-2 relative my-2">
            {/* Dashed Connecting Line behind the steps */}
            <div className="absolute top-5 left-8 right-8 h-px border-t-2 border-dashed border-gray-200 z-0"></div>

            {[
              { label: 'Processing', count: `${pipelineCounts.processing} Orders`, icon: ClipboardList, color: 'border-emerald-500 text-emerald-600 bg-white' },
              { label: 'Ready for Packing', count: `${pipelineCounts.packing} Orders`, icon: Package, color: 'border-purple-500 text-purple-600 bg-white' },
              { label: 'Packed', count: `${pipelineCounts.packed} Orders`, icon: PackageCheck, color: 'border-blue-500 text-blue-600 bg-white' },
              { label: 'Ready for Pickup', count: `${pipelineCounts.pickup} Orders`, icon: Warehouse, color: 'border-orange-500 text-orange-600 bg-white' },
              { label: 'Out for Delivery', count: `${pipelineCounts.delivery} Orders`, icon: Truck, color: 'border-teal-500 text-teal-600 bg-white' },
              { label: 'Delivered', count: `${pipelineCounts.delivered} Orders`, icon: CheckCircle, color: 'border-emerald-700 bg-emerald-700 text-white' }
            ].map((step, i) => (
              <div key={i} onClick={() => navigate('/orders')} className="flex flex-col items-center group cursor-pointer z-10 w-20">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center mb-1.5 shadow-sm transition-transform group-hover:scale-110 ${step.color}`}>
                  <step.icon size={17} />
                </div>
                <span className="text-[10px] font-bold text-gray-800 text-center leading-tight">{step.label}</span>
                <span className="text-[9px] text-gray-400 font-semibold">{step.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions (5 cols) */}
        <div className="md:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col justify-between">
          <h2 className="text-sm font-black text-gray-900 mb-2">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Create Order', icon: ShoppingCart, path: '/orders' },
              { label: 'Add GRN', icon: PackageCheck, path: '/grn' },
              { label: 'Stock Transfer', icon: RefreshCcw, path: '/transfers' },
              { label: 'Add Product', icon: Tag, path: '/products' },
              { label: 'View Reports', icon: BarChart3, path: '/reports' },
              { label: 'Add User', icon: UserPlus, path: '/staff' }
            ].map((action, i) => (
              <button 
                key={i}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-1.5 p-2 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all text-gray-700 shadow-sm group bg-white cursor-pointer"
              >
                <action.icon size={14} className="text-gray-500 group-hover:text-emerald-600 flex-shrink-0" />
                <span className="text-[10px] font-bold truncate">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;

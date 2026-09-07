import React, { useState, useMemo } from 'react';
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
  Factory,
  BarChart3
} from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';
import { formatCurrency } from '../utils/formatters';
import StatusBadge from '../components/common/StatusBadge';
import SalesChart from '../components/charts/SalesChart';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useEffect } from 'react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { orders: allOrders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const [salesFilter, setSalesFilter] = useState('This Week');
  const [hubFilter, setHubFilter] = useState('All');
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  const orders = useMemo(() => {
    if (hubFilter === 'All') return allOrders;
    return allOrders.filter(o => o.fulfillmentWarehouseId === hubFilter);
  }, [allOrders, hubFilter]);

  // Metrics calculations
  const totalOrders = orders.length;
  const todayRevenue = useMemo(() => {
    return orders
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => {
        const amount = Number(o.totalAmount) || 0;
        const refund = o.returnApproved ? (Number(o.refundAmount) || amount) : 0;
        return sum + (amount - refund);
      }, 0);
  }, [orders]);

  const inventoryValue = useMemo(() => {
    return products.reduce((sum, p) => sum + ((p.stockQuantity || p.stock || 0) * (p.price || 0)), 0);
  }, [products]);

  const pendingDeliveryCount = useMemo(() => orders.filter(o => ['READY_FOR_PACKING', 'CONFIRMED', 'OUT_FOR_DELIVERY'].includes(o.status)).length, [orders]);
  
  // Dummy COD Collection
  const codCollection = useMemo(() => {
    return orders.filter(o => o.paymentMethod === 'COD' && o.status === 'DELIVERED' && !o.codRemitted).reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  }, [orders]);

  const lowStockProducts = useMemo(() => products.filter(p => (p.stockQuantity || p.stock || 0) < 10), [products]);

  const isLoading = ordersLoading || productsLoading;

  if (isLoading) return <LoadingSkeleton rows={10} />;

  const metricCards = [
    {
      title: "Total Orders",
      value: totalOrders,
      change: "+12.4% vs yesterday",
      trend: "up",
      icon: ShoppingCart,
      color: "text-green-600",
      bg: "bg-green-100",
      lineColor: "border-green-500",
      path: "/orders"
    },
    {
      title: "Total Revenue",
      value: formatCurrency(todayRevenue),
      change: "+8.2% vs yesterday",
      trend: "up",
      icon: IndianRupee,
      color: "text-blue-600",
      bg: "bg-blue-100",
      lineColor: "border-blue-500",
      path: "/finance"
    },
    {
      title: "Inventory Value",
      value: formatCurrency(inventoryValue),
      change: "+6.7% vs yesterday",
      trend: "up",
      icon: Package,
      color: "text-purple-600",
      bg: "bg-purple-100",
      lineColor: "border-purple-500",
      path: "/inventory"
    },
    {
      title: "Pending Delivery",
      value: pendingDeliveryCount,
      change: "-4.2% vs yesterday",
      trend: "down",
      icon: Truck,
      color: "text-orange-500",
      bg: "bg-orange-100",
      lineColor: "border-orange-400",
      path: "/orders"
    },
    {
      title: "COD Collection",
      value: formatCurrency(codCollection || 42560),
      change: "Pending to deposit",
      trend: "warning",
      icon: Wallet,
      color: "text-teal-600",
      bg: "bg-teal-100",
      lineColor: "border-teal-400",
      path: "/reconciliation"
    },
    {
      title: "Low Stock SKUs",
      value: lowStockProducts.length,
      change: "Requires attention",
      trend: "danger",
      icon: AlertTriangle,
      color: "text-yellow-500",
      bg: "bg-yellow-100",
      lineColor: "border-yellow-400",
      path: "/skus"
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Global Dashboard Filters */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Active Hub:</label>
          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary/20"
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

      {/* 1. KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {metricCards.map((card, idx) => (
          <div key={idx} onClick={() => navigate(card.path)} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col relative overflow-hidden group cursor-pointer hover:border-green-500 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.bg} ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">{card.title}</p>
            <h3 className="text-xl font-black text-gray-900 mb-2">{card.value}</h3>
            
            <div className="flex items-center gap-1 text-[10px] font-bold mt-auto z-10">
              {card.trend === "up" && <TrendingUp size={12} className="text-green-500" />}
              {card.trend === "down" && <TrendingDown size={12} className="text-red-500" />}
              <span className={
                card.trend === 'up' ? 'text-green-600' : 
                card.trend === 'down' ? 'text-red-500' : 
                card.trend === 'warning' ? 'text-orange-500' : 'text-red-500'
              }>
                {card.change}
              </span>
            </div>

            {/* Decorative mini line chart representation */}
            <div className="absolute -bottom-2 -right-2 opacity-20 pointer-events-none z-0">
              <svg width="80" height="40" viewBox="0 0 80 40" fill="none" stroke="currentColor" strokeWidth="3" className={card.color}>
                <path d={card.trend === 'up' ? "M0,40 Q20,30 40,35 T80,10" : "M0,10 Q20,20 40,15 T80,40"} />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Middle Row: Charts & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Overview */}
        <div className="lg:col-span-1 xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-gray-800">Sales Overview</h2>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">
              <span className="text-[11px] font-bold text-gray-600">{salesFilter}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="h-[250px] w-full">
            <SalesChart />
          </div>
        </div>

        {/* AI Alerts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-gray-800">AI Insights & Alerts</h2>
            <button onClick={() => navigate('/ai-control')} className="text-[11px] font-bold text-green-600 hover:text-green-700 bg-green-50 px-3 py-1 rounded-full cursor-pointer transition-colors">View All</button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-gray-900 leading-tight mb-0.5">12 SKUs are running low on stock</h4>
                <p className="text-[10px] text-gray-500 font-medium">Reorder recommended</p>
              </div>
              <button onClick={() => navigate('/inventory')} className="text-[10px] font-bold text-green-600 hover:underline cursor-pointer">View</button>
            </div>
            
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                <PackageCheck size={14} />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-gray-900 leading-tight mb-0.5">5 Procurement orders awaiting GRN</h4>
                <p className="text-[10px] text-gray-500 font-medium">Expected within 2 days</p>
              </div>
              <button onClick={() => navigate('/grn')} className="text-[10px] font-bold text-green-600 hover:underline cursor-pointer">View</button>
            </div>

            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                <Wallet size={14} />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-gray-900 leading-tight mb-0.5">COD collection of ₹42,560 pending</h4>
                <p className="text-[10px] text-gray-500 font-medium">Deposit to bank</p>
              </div>
              <button onClick={() => navigate('/reconciliation')} className="text-[10px] font-bold text-green-600 hover:underline cursor-pointer">View</button>
            </div>

            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                <Truck size={14} />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-gray-900 leading-tight mb-0.5">3 Stock transfers are in transit</h4>
                <p className="text-[10px] text-gray-500 font-medium">Check delivery status</p>
              </div>
              <button onClick={() => navigate('/transfers')} className="text-[10px] font-bold text-green-600 hover:underline cursor-pointer">View</button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Row: Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Recent Orders</h2>
            <button onClick={() => navigate('/orders')} className="text-[11px] font-bold text-gray-500 hover:text-gray-900 bg-gray-50 px-3 py-1 rounded-full border border-gray-200 cursor-pointer transition-colors">View All</button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.slice(0, 5).map(o => (
                  <tr key={o.id} onClick={() => navigate('/orders')} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-xs font-bold text-green-700">#KV{o.id.substring(0,6).toUpperCase()}</td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-900">{o.address?.name || 'Farmer'}</td>
                    <td className="px-4 py-3 text-xs font-black text-gray-900">{formatCurrency(o.totalAmount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warehouse Overview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Warehouse Overview</h2>
            <button onClick={() => navigate('/warehouses')} className="text-[11px] font-bold text-gray-500 hover:text-gray-900 bg-gray-50 px-3 py-1 rounded-full border border-gray-200 cursor-pointer transition-colors">View All</button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Warehouse</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Low Stock</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr onClick={() => navigate('/warehouses')} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3"><span className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Factory size={12} className="text-green-600"/> WH-PATNA-01</span></td>
                  <td className="px-4 py-3 text-xs font-bold text-red-500">4</td>
                  <td className="px-4 py-3"><span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Healthy</span></td>
                </tr>
                <tr onClick={() => navigate('/warehouses')} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3"><span className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Factory size={12} className="text-green-600"/> WH-PURNEA-01</span></td>
                  <td className="px-4 py-3 text-xs font-bold text-red-500">8</td>
                  <td className="px-4 py-3"><span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Healthy</span></td>
                </tr>
                <tr onClick={() => navigate('/warehouses')} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3"><span className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Factory size={12} className="text-green-600"/> WH-KISHANGANJ-01</span></td>
                  <td className="px-4 py-3 text-xs font-bold text-red-500">7</td>
                  <td className="px-4 py-3"><span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Warning</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Order Fulfillment Pipeline & Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Pipeline */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden">
          <h2 className="text-sm font-black text-gray-800 mb-8">Order Fulfillment Pipeline <span className="text-[10px] font-semibold text-gray-400 ml-2">Real-time Order Flow</span></h2>
          <div className="flex items-center justify-between px-2 relative">
            {/* Connecting line */}
            <div className="absolute top-6 left-10 right-10 h-px border-t-2 border-dashed border-gray-200 z-0"></div>
            
            {[
              { label: 'Processing', count: orders.filter(o => o.status === 'PLACED').length, icon: ClipboardList, color: 'border-green-500 bg-white text-green-600', fill: 'bg-green-50' },
              { label: 'Ready for Packing', count: orders.filter(o => o.status === 'CONFIRMED').length, icon: Package, color: 'border-purple-500 bg-white text-purple-600', fill: 'bg-purple-50' },
              { label: 'Packed', count: orders.filter(o => o.status === 'READY_FOR_PACKING').length, icon: PackageCheck, color: 'border-blue-500 bg-white text-blue-600', fill: 'bg-blue-50' },
              { label: 'Out for Delivery', count: orders.filter(o => o.status === 'OUT_FOR_DELIVERY').length, icon: Truck, color: 'border-teal-500 bg-white text-teal-600', fill: 'bg-teal-50' },
              { label: 'Delivered', count: orders.filter(o => o.status === 'DELIVERED').length, icon: CheckCircle, color: 'border-green-600 bg-green-600 text-white', fill: 'bg-green-600' }
            ].map((step, i) => (
              <div key={i} onClick={() => navigate('/orders')} className="flex flex-col items-center group cursor-pointer z-10 w-24">
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center mb-3 shadow-sm transition-transform group-hover:scale-110 ${step.color} ${i === 4 ? step.fill : ''}`}>
                  <step.icon size={20} className={i === 4 ? 'text-white' : ''} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 text-center leading-tight mb-0.5">{step.label}</span>
                <span className="text-[10px] text-gray-500 font-semibold">{step.count} Orders</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-black text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Create Order', icon: ShoppingCart, path: '/orders' },
              { label: 'Add GRN', icon: PackageCheck, path: '/grn' },
              { label: 'Stock Transfer', icon: RefreshCcw, path: '/transfers' },
              { label: 'Add Product', icon: Package, path: '/products' },
              { label: 'View Reports', icon: BarChart3, path: '/reports' },
              { label: 'Add User', icon: UserPlus, path: '/staff' }
            ].map((action, i) => (
              <button 
                key={i}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-green-500 hover:bg-green-50 hover:text-green-700 transition-all text-gray-700 shadow-sm group"
              >
                <action.icon size={16} className="text-gray-400 group-hover:text-green-600" />
                <span className="text-[10px] font-bold whitespace-nowrap">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;

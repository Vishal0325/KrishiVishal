import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Search,
  Download,
  Filter,
  PieChart,
  BarChart3,
  Percent,
  Truck,
  Package,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';

const UnitEconomics = () => {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [marginFilter, setMarginFilter] = useState('ALL'); // 'ALL' | 'POSITIVE' | 'NEGATIVE' | 'HIGH'
  const [dateRange, setDateRange] = useState('ALL');

  // Standard Unit Economics Parameters
  const PACKAGING_COST_PER_ORDER = 20; // ₹20 flat standard box + seal + tape
  const DELIVERY_COST_PER_ORDER = 40;  // ₹40 flat rider payout per delivered order
  const GATEWAY_PERCENTAGE = 0.02;     // 2% for Razorpay online payments, 0 for COD

  // Listen to Orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Products to map current cost basis
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Map product cost basis lookup
  const getProductCostBasis = (productId, fallbackEstimated = 0) => {
    const p = products.find(prod => prod.id === productId);
    if (!p) return fallbackEstimated || 0;
    return Number(p.costPrice || p.estimatedCostPrice || (p.price ? p.price * 0.7 : 0));
  };

  // Compute Order Unit Economics
  const analyzedOrders = orders.map(order => {
    const sellingPrice = Number(order.totalAmount || 0);

    // Calculate total product purchase cost (COGS)
    let cogs = 0;
    (order.items || []).forEach(item => {
      const unitCost = Number(item.estimatedCostPrice) || getProductCostBasis(item.productId, item.price * 0.7);
      const qty = Number(item.quantity || 1);
      cogs += unitCost * qty;
    });

    const isOnline = order.paymentMethod === 'ONLINE';
    const gatewayFee = isOnline ? (sellingPrice * GATEWAY_PERCENTAGE) : 0;
    const packagingCost = sellingPrice > 0 ? PACKAGING_COST_PER_ORDER : 0;
    const deliveryCost = order.status !== 'CANCELLED' && sellingPrice > 0 ? DELIVERY_COST_PER_ORDER : 0;

    const totalOperationalCost = cogs + packagingCost + deliveryCost + gatewayFee;
    const netProfit = sellingPrice - totalOperationalCost;
    const grossMargin = sellingPrice > 0 ? ((sellingPrice - cogs) / sellingPrice) * 100 : 0;
    const netMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

    return {
      id: order.id,
      orderNumber: `#${order.id.slice(0, 8).toUpperCase()}`,
      userName: order.userName || 'Customer',
      userPhone: order.userPhone || '',
      paymentMethod: order.paymentMethod || 'COD',
      status: order.status || 'PLACED',
      sellingPrice,
      cogs,
      packagingCost,
      deliveryCost,
      gatewayFee,
      totalOperationalCost,
      netProfit,
      grossMargin,
      netMargin,
      createdAt: order.createdAt,
      itemCount: (order.items || []).reduce((acc, cur) => acc + (cur.quantity || 1), 0)
    };
  });

  // Filter Orders
  const filtered = analyzedOrders.filter(o => {
    const matchSearch = !searchTerm ||
      o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.userName.toLowerCase().includes(searchTerm.toLowerCase());

    let matchMargin = true;
    if (marginFilter === 'POSITIVE') matchMargin = o.netProfit > 0;
    else if (marginFilter === 'NEGATIVE') matchMargin = o.netProfit <= 0;
    else if (marginFilter === 'HIGH') matchMargin = o.netMargin >= 20;

    return matchSearch && matchMargin;
  });

  // Cumulative Metrics
  const activeAnalyzed = analyzedOrders.filter(o => o.status !== 'CANCELLED');
  const totalRevenue = activeAnalyzed.reduce((sum, o) => sum + o.sellingPrice, 0);
  const totalCOGS = activeAnalyzed.reduce((sum, o) => sum + o.cogs, 0);
  const totalPackaging = activeAnalyzed.reduce((sum, o) => sum + o.packagingCost, 0);
  const totalDelivery = activeAnalyzed.reduce((sum, o) => sum + o.deliveryCost, 0);
  const totalGateway = activeAnalyzed.reduce((sum, o) => sum + o.gatewayFee, 0);
  const totalNetProfit = activeAnalyzed.reduce((sum, o) => sum + o.netProfit, 0);
  const overallNetMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  // Chart Data for Top 8 Recent Orders
  const chartData = activeAnalyzed.slice(0, 8).reverse().map(o => ({
    name: o.orderNumber,
    Revenue: Math.round(o.sellingPrice),
    COGS: Math.round(o.cogs),
    Overheads: Math.round(o.packagingCost + o.deliveryCost + o.gatewayFee),
    NetProfit: Math.round(o.netProfit)
  }));

  // Table Columns
  const columns = [
    {
      header: 'Order',
      key: 'orderNumber',
      render: (o) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{o.orderNumber}</span>
          <p className="text-[10px] text-gray-400">{o.userName}</p>
        </div>
      )
    },
    {
      header: 'Selling Price (GMV)',
      key: 'sellingPrice',
      render: (o) => (
        <span className="font-black text-xs font-mono text-gray-900">
          {formatCurrency(o.sellingPrice)}
        </span>
      )
    },
    {
      header: 'Material COGS (₹)',
      key: 'cogs',
      render: (o) => (
        <span className="font-mono text-xs font-bold text-gray-700">
          {formatCurrency(o.cogs)}
        </span>
      )
    },
    {
      header: 'Pack & Delivery',
      render: (o) => (
        <span className="text-[11px] text-gray-600 font-mono">
          ₹{o.packagingCost} + ₹{o.deliveryCost}
        </span>
      )
    },
    {
      header: 'Gateway Fee',
      key: 'gatewayFee',
      render: (o) => (
        <span className="text-[11px] text-gray-600 font-mono">
          {o.gatewayFee > 0 ? formatCurrency(o.gatewayFee) : '₹0 (COD)'}
        </span>
      )
    },
    {
      header: 'Net Profit (₹)',
      key: 'netProfit',
      render: (o) => {
        const isProfitable = o.netProfit > 0;
        return (
          <span className={`font-black text-xs font-mono flex items-center gap-1 ${
            isProfitable ? 'text-green-700' : 'text-red-600'
          }`}>
            {isProfitable ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
            {formatCurrency(o.netProfit)}
          </span>
        );
      }
    },
    {
      header: 'Net Margin (%)',
      key: 'netMargin',
      render: (o) => {
        const isProfitable = o.netMargin > 0;
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
            o.netMargin >= 20 ? 'bg-green-100 text-green-800' :
            o.netMargin > 0 ? 'bg-blue-100 text-blue-800' :
            'bg-red-100 text-red-800'
          }`}>
            {o.netMargin.toFixed(1)}%
          </span>
        );
      }
    },
    {
      header: 'Status',
      key: 'status',
      render: (o) => (
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
          {o.status.replace(/_/g, ' ')}
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
            <TrendingUp className="mr-3 text-[#1b5e20]" size={28} />
            Unit Economics & True P&L Intelligence
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Order-level profitability engine calculating true net margins after purchase costs, delivery payouts, packaging, and gateway fees.
          </p>
        </div>
      </div>

      {/* Executive Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Revenue (GMV)</p>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Material Costs (COGS)</p>
          <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{formatCurrency(totalCOGS)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery & Logistics</p>
          <p className="text-2xl font-black text-amber-700 mt-1 font-mono">{formatCurrency(totalDelivery)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Packaging & Gateway</p>
          <p className="text-2xl font-black text-purple-700 mt-1 font-mono">{formatCurrency(totalPackaging + totalGateway)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-gradient-to-br from-green-50/50 to-white">
          <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Total True Net Profit</p>
          <p className="text-2xl font-black text-[#1b5e20] mt-1 font-mono">{formatCurrency(totalNetProfit)}</p>
          <p className="text-[11px] font-bold text-green-700 mt-0.5">Net Margin: {overallNetMargin.toFixed(1)}%</p>
        </div>
      </div>

      {/* Visual Chart Card */}
      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 size={16} className="text-[#1b5e20]" />
              Recent Order Economics Breakdown (Revenue vs COGS vs Overheads vs Net Profit)
            </h3>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Live Calculations</span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #eee', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Revenue" fill="#1b5e20" name="Revenue (₹)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="COGS" fill="#3b82f6" name="Material Cost (₹)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Overheads" fill="#f59e0b" name="Packaging + Delivery (₹)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="NetProfit" fill="#10b981" name="Net Profit (₹)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by order ID or customer name..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>

        <select
          value={marginFilter}
          onChange={(e) => setMarginFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-700 outline-none"
        >
          <option value="ALL">All Margin Profiles</option>
          <option value="HIGH">High Margin (&gt;= 20%)</option>
          <option value="POSITIVE">Profitable Orders</option>
          <option value="NEGATIVE">Loss / Negative Orders</option>
        </select>
      </div>

      {/* DataTable */}
      <DataTable columns={columns} data={filtered} loading={loading} />
    </div>
  );
};

export default UnitEconomics;

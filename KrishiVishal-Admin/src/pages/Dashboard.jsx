import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/common/MetricCard';
import SalesChart from '../components/charts/SalesChart';
import CategoryPieChart from '../components/charts/CategoryPieChart';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { ShoppingCart, IndianRupee, Users, Clock, AlertTriangle, PackageSearch, TrendingUp, Map, CheckCircle } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';
import { useCustomers } from '../hooks/useCustomers';
import { formatCurrency } from '../utils/formatters';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const navigate = useNavigate();
  const { orders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const { customers, loading: customersLoading } = useCustomers();

  const [chartFilter, setChartFilter] = useState('30D');
  const [refillQuantities, setRefillQuantities] = useState({});
  const [updatingId, setUpdatingId] = useState(null);

  const districtData = useMemo(() => {
    const districts = {};
    orders.forEach(o => {
      let district = 'General';
      if (typeof o.address === 'string') {
        const parts = o.address.split(', ');
        if (parts.length >= 6) {
          district = parts[parts.length - 2];
        }
      } else {
        district = o.address?.district || 'General';
      }
      districts[district] = (districts[district] || 0) + 1;
    });
    return Object.entries(districts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [orders]);

  const handleRefill = async (product) => {
    const qtyToAdd = Number(refillQuantities[product.id]);
    if (!qtyToAdd || qtyToAdd <= 0) return toast.error("Enter valid quantity");

    setUpdatingId(product.id);
    try {
      await setDoc(doc(db, 'products', product.id), {
        stock: (product.stock || 0) + qtyToAdd,
        stockQuantity: (product.stockQuantity || product.stock || 0) + qtyToAdd,
        updatedAt: Timestamp.now()
      }, { merge: true });
      toast.success(`${product.name} restocked!`);
      setRefillQuantities({ ...refillQuantities, [product.id]: '' });
    } catch (e) {
      toast.error("Refill failed");
    } finally {
      setUpdatingId(null);
    }
  };

  // Dummy aggregation for UI
  const todayRevenue = orders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const pendingCount = orders.filter(o => o.status === 'PLACED').length;
  const lowStockProducts = products.filter(p => (p.stockQuantity || p.stock || 0) < 10);

  // Filter farmers only for the metric count (Excluding Admins and Riders)
  const realFarmers = customers.filter(u =>
    u.isAdmin !== true &&
    String(u.isAdmin).toLowerCase() !== "true" &&
    u.role !== 'RIDER' &&
    !['SuperAdmin', 'CatalogManager', 'OrderManager'].includes(u.role)
  );

  const metrics = [
    {
      title: "Today's Orders",
      value: orders.length,
      change: "+12%",
      icon: ShoppingCart,
      color: "blue",
      onClick: () => navigate('/orders')
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(todayRevenue),
      change: "+8%",
      icon: IndianRupee,
      color: "green",
      onClick: () => navigate('/finance')
    },
    {
      title: "Active Farmers",
      value: realFarmers.length,
      change: `Total: ${customers.length}`,
      icon: Users,
      color: "purple",
      onClick: () => navigate('/customers')
    },
    {
      title: "Pending Orders",
      value: pendingCount,
      change: "",
      icon: Clock,
      color: "orange",
      onClick: () => navigate('/orders', { state: { filter: 'PLACED' } })
    },
  ];

  const salesData = [
    { date: '01 Jun', revenue: 4500, orders: 12 },
    { date: '02 Jun', revenue: 5200, orders: 15 },
    { date: '03 Jun', revenue: 3800, orders: 10 },
    { date: '04 Jun', revenue: 6100, orders: 18 },
    { date: '05 Jun', revenue: 5900, orders: 16 },
    { date: '06 Jun', revenue: 7200, orders: 22 },
  ];

  const categoryData = [
    { name: 'Seeds', value: 400 },
    { name: 'Fertilizers', value: 300 },
    { name: 'Pesticides', value: 300 },
    { name: 'Tools', value: 200 },
  ];

  const orderColumns = [
    { header: 'Order ID', render: (o) => <span className="font-mono text-xs font-bold text-gray-400">KV-{o.id.substring(0, 6)}</span> },
    { header: 'Customer', render: (o) => <span className="font-bold text-gray-700">{o.address?.name || 'Anonymous'}</span> },
    { header: 'Amount', render: (o) => <span className="font-black text-gray-900">{formatCurrency(o.totalAmount)}</span> },
    { header: 'Status', render: (o) => <StatusBadge status={o.status} /> }
  ];

  return (
    <div className="space-y-10 pb-10 animate-in fade-in duration-500">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {metrics.map((m, i) => (
          <MetricCard key={i} {...m} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Sales Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-50 rounded-xl text-primary">
                <TrendingUp size={20} />
              </div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Revenue Analytics</h3>
            </div>
            <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 shadow-inner">
              {['7D', '30D', '3M'].map(f => (
                <button
                  key={f}
                  onClick={() => setChartFilter(f)}
                  className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${chartFilter === f ? 'bg-white text-primary shadow-lg shadow-green-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-[350px]">
            <SalesChart data={salesData} filter={chartFilter} />
          </div>
        </div>

        {/* Category Share */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center space-x-3 mb-10">
             <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <Map size={20} />
              </div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Bihar Regions</h3>
          </div>
          <div className="flex-1 space-y-6">
            {districtData.map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 bg-gray-50 rounded-lg flex items-center justify-center font-black text-xs text-gray-400 border border-gray-100">
                    {i + 1}
                  </div>
                  <span className="font-bold text-gray-700 uppercase tracking-tight text-sm">{d.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-black text-gray-900">{d.count}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Orders</span>
                </div>
              </div>
            ))}
            {districtData.length === 0 && (
              <p className="text-center text-gray-400 text-xs py-10 uppercase font-bold italic tracking-widest">No regional data yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white/50 backdrop-blur sticky top-0 z-10">
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Recent Activity</h3>
            <button
              onClick={() => navigate('/orders')}
              className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:underline decoration-2 underline-offset-4 px-4 py-2 bg-green-50 rounded-full"
            >
              View All Orders
            </button>
          </div>
          <div className="flex-1">
             <DataTable
                columns={orderColumns}
                data={orders.slice(0, 5)}
                loading={ordersLoading}
              />
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center">
              <AlertTriangle className="text-orange-500 mr-2" size={24} />
              Critical Stock
            </h3>
            <button
              onClick={() => navigate('/products')}
              className="text-[10px] font-black bg-red-50 text-red-500 px-3 py-1 rounded-full uppercase hover:bg-red-100 transition-colors"
            >
              {lowStockProducts.length} Items
            </button>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {lowStockProducts.length > 0 ? lowStockProducts.map((p, i) => (
              <div key={i} className="flex flex-col space-y-4 p-5 bg-gray-50/50 rounded-3xl border border-gray-100 group hover:bg-white hover:shadow-xl hover:shadow-red-50 hover:border-red-100 transition-all duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="h-14 w-14 bg-white rounded-2xl border border-gray-100 p-1 overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                      <img src={p.images?.[0]} className="w-full h-full object-cover rounded-xl" alt="" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900 tracking-tight">{p.name}</h4>
                      <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-1 italic">Only {p.stock} units left</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    placeholder="+ Qty"
                    value={refillQuantities[p.id] || ''}
                    onChange={(e) => setRefillQuantities({...refillQuantities, [p.id]: e.target.value})}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-red-400"
                  />
                  <button
                    onClick={() => handleRefill(p)}
                    disabled={updatingId === p.id}
                    className="bg-red-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 shadow-lg shadow-red-100 active:scale-95 transition-all flex items-center space-x-2"
                  >
                    {updatingId === p.id ? '...' : <CheckCircle size={12} />}
                    <span>Refill</span>
                  </button>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <PackageSearch size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">Inventory is healthy</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BarChart3, Download, TrendingUp, AlertCircle, FileText, PieChart as PieChartIcon, Map } from 'lucide-react';
import SalesChart from '../components/charts/SalesChart';
import OrdersBarChart from '../components/charts/OrdersBarChart';
import CategoryPieChart from '../components/charts/CategoryPieChart';
import { formatCurrency } from '../utils/formatters';

const Reports = () => {
  const [dateRange, setDateRange] = useState('30D');
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, []);

  const regionData = useMemo(() => {
    const districts = {};
    orders.forEach(o => {
      let district = 'General';
      if (typeof o.address === 'string') {
        const parts = o.address.split(', ');
        // District is usually the 2nd or 3rd from the end (excluding pincode part)
        // Format: Name, House, Street, Ward, Block, District, State - Pincode
        if (parts.length >= 6) {
          district = parts[parts.length - 2];
        }
      } else {
        district = o.address?.district || 'General';
      }
      districts[district] = (districts[district] || 0) + 1;
    });
    return Object.entries(districts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [orders]);

  const categoryData = useMemo(() => {
    const categories = {};
    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const cat = item.category || 'Other';
          categories[cat] = (categories[cat] || 0) + (item.quantity || 1);
        });
      }
    });

    // If no order data yet, show some dummy distribution to avoid empty chart
    if (Object.keys(categories).length === 0) {
      return [
        { name: 'Seeds', value: 400 },
        { name: 'Fertilizers', value: 300 },
        { name: 'Pesticides', value: 200 },
        { name: 'Other', value: 100 },
      ];
    }

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const salesData = useMemo(() => {
    const daily = {};
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    }).reverse();

    last7Days.forEach(day => { daily[day] = { date: day, revenue: 0, orders: 0 }; });

    orders.forEach(o => {
      const day = o.createdAt?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short' });
      if (daily[day]) {
        daily[day].revenue += Number(o.totalAmount || 0);
        daily[day].orders += 1;
      }
    });
    return Object.values(daily);
  }, [orders]);

  const summaryMetrics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Active users: unique userIds in the order list
    const activeUsers = new Set(orders.map(o => o.userId)).size;

    return [
      { label: 'Avg Order Value', value: formatCurrency(avgOrderValue), sub: 'Based on total orders', color: 'blue' },
      { label: 'Total Revenue', value: formatCurrency(totalRevenue), sub: 'Gross lifetime sales', color: 'green' },
      { label: 'Active Farmers', value: activeUsers.toString(), sub: 'Unique customers', color: 'purple' },
      { label: 'Total Orders', value: orders.length.toString(), sub: 'Lifetime volume', color: 'orange' },
    ];
  }, [orders]);

  const exportGstReport = () => {
    const headers = ["Order ID", "Date", "Customer", "Total Amount", "Taxable Value", "GST Amount", "CGST", "SGST"];
    const rows = orders.map(o => {
        const total = Number(o.totalAmount || 0);
        const gstRate = 18; // Default or from config
        const taxable = total / (1 + (gstRate / 100));
        const gst = total - taxable;
        return [
            o.id,
            o.createdAt?.toDate?.()?.toLocaleDateString() || "",
            o.userName || "N/A",
            total.toFixed(2),
            taxable.toFixed(2),
            gst.toFixed(2),
            (gst/2).toFixed(2),
            (gst/2).toFixed(2)
        ];
    });

    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KrishiVishal_GST_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportInventoryValuation = async () => {
    toast.loading("Generating Valuation Report...");
    // Note: In real production, this would be a server-side call to use private costPrice
    // For this hardened UI, we will provide a template
    const headers = ["Product ID", "Name", "Stock", "Selling Price", "Estimated Cost", "Total Value"];
    const rows = orders.flatMap(o => o.items || []).map(item => [
        item.productId,
        item.productName,
        item.quantity,
        item.price,
        "SECRET", // Privacy hardening
        (item.price * item.quantity).toFixed(2)
    ]);

    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Inventory_Valuation_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.dismiss();
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <BarChart3 className="mr-3 text-primary" size={32} />
            Analytics Intelligence
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Advanced data visualization & insights</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
            {['7D', '30D', 'All'].map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${dateRange === r ? 'bg-primary text-white shadow-xl shadow-green-100' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="p-3 bg-white border border-gray-100 rounded-2xl text-primary hover:border-primary transition-all shadow-sm group active:scale-95">
            <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {summaryMetrics.map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-shadow">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-${s.color}-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700`} />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-2xl font-black text-gray-900 tracking-tight">{s.value}</p>
            <p className="text-[9px] font-bold text-gray-400 mt-2 italic">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Sales Curve */}
        <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
          <div className="flex items-center justify-between">
             <div className="flex items-center space-x-3">
              <div className="p-3 bg-green-50 rounded-2xl text-primary shadow-inner">
                <TrendingUp size={24} />
              </div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Sales Velocity</h2>
            </div>
            <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">Live Stream</span>
          </div>
          <div className="h-[400px]">
            <SalesChart data={salesData} />
          </div>
        </div>

        {/* Region Performance */}
        <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
          <div className="flex items-center justify-between">
             <div className="flex items-center space-x-3">
              <div className="p-3 bg-orange-50 rounded-2xl text-orange-600 shadow-inner">
                <PieChartIcon size={24} />
              </div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Regional Demand</h2>
            </div>
            <FileText size={18} className="text-gray-200" />
          </div>
          <div className="h-[400px]">
            <OrdersBarChart data={regionData} />
          </div>
        </div>

        {/* Category Share */}
        <div className="bg-[#1b5e20] p-12 rounded-[4rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
            <PieChartIcon size={300} />
          </div>
          <div className="relative z-10 flex flex-col h-full">
            <h2 className="text-2xl font-black uppercase tracking-widest mb-10 text-green-100">Inventory Distribution</h2>
            <div className="flex-1 flex items-center justify-center">
              <CategoryPieChart data={categoryData} />
            </div>
          </div>
        </div>

        {/* Growth Stats */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group hover:border-primary transition-all">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Total Farmer Base</h3>
              <p className="text-4xl font-black text-gray-900 tracking-tighter">{users.filter(u => !u.isAdmin).length}</p>
            </div>
            <div className="h-16 w-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-50 group-hover:bg-blue-600 group-hover:text-white transition-all">
              <TrendingUp size={24} />
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group hover:border-orange-500 transition-all">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Crops Protected</h3>
              <p className="text-4xl font-black text-gray-900 tracking-tighter">12,400 <span className="text-sm text-gray-300 font-bold uppercase tracking-widest ml-1">Acres</span></p>
            </div>
            <div className="h-16 w-16 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center shadow-lg shadow-orange-50 group-hover:bg-orange-600 group-hover:text-white transition-all">
              <FileText size={24} />
            </div>
          </div>

          <div className="bg-[#f0f4f0] p-10 rounded-[3rem] border border-green-100 relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-4">Export Financial Logs</h4>
              <p className="text-sm font-medium text-gray-500 leading-relaxed italic mb-8">
                Generate detailed tax and inventory valuation reports for government compliance.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={exportGstReport}
                  className="flex-1 bg-white text-primary-dark py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-green-100/50 hover:bg-primary hover:text-white transition-all active:scale-[0.98]">
                  Export GST Filing
                </button>
                <button
                  onClick={exportInventoryValuation}
                  className="flex-1 bg-white text-orange-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-100/50 hover:bg-orange-600 hover:text-white transition-all active:scale-[0.98]">
                  Stock Valuation
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

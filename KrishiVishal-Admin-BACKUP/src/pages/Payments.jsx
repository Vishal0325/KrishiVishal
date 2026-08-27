import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { CreditCard, Search, ExternalLink, Filter, AlertCircle } from 'lucide-react';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const pendingRefunds = useMemo(() => {
    return payments.filter(p =>
      p.status === 'CANCELLED' &&
      ['ONLINE', 'Online', 'razorpay'].includes(p.paymentMethod) &&
      !p.isRefunded // Assuming we might add this flag later or just track cancelled orders
    );
  }, [payments]);

  useEffect(() => {
    // We fetch orders where paymentMethod is ONLINE
    // Note: Adjust the where clause if your payment method string is different (e.g. 'Online')
    const q = query(
      collection(db, 'orders'),
      where('paymentMethod', 'in', ['ONLINE', 'Online', 'razorpay']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredPayments = payments.filter(p => {
    const matchesSearch =
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.razorpayPaymentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || p.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      header: 'Transaction ID',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-mono font-black text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
            {p.razorpayPaymentId || 'N/A'}
          </span>
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-1">Order: #{p.id.slice(0,8).toUpperCase()}</span>
        </div>
      )
    },
    {
      header: 'Customer',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900">{p.address?.name || 'Anonymous'}</span>
          <span className="text-[10px] text-gray-400 font-medium">{p.address?.phone || '-'}</span>
        </div>
      )
    },
    {
      header: 'Amount',
      render: (p) => <span className="font-black text-gray-900">{formatCurrency(p.totalAmount)}</span>
    },
    {
      header: 'Method',
      render: (p) => (
        <span className="text-[10px] font-black bg-gray-100 text-gray-600 px-2 py-1 rounded-full uppercase tracking-widest border border-gray-200 shadow-sm">
          UPI / Online
        </span>
      )
    },
    {
      header: 'Status',
      render: (p) => <StatusBadge status={p.paymentStatus || 'PENDING'} />
    },
    {
      header: 'Date',
      render: (p) => <span className="text-gray-500 font-medium text-xs">{formatDateTime(p.createdAt)}</span>
    },
    {
      header: 'Action',
      render: (p) => (
        <a
          href={`https://dashboard.razorpay.com/app/payments/${p.razorpayPaymentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-all border border-transparent hover:border-primary/20 block w-fit"
          title="Verify on Razorpay Dashboard"
        >
          <ExternalLink size={16} />
        </a>
      )
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <CreditCard className="mr-3 text-primary" size={28} />
            Online Payments Tracking
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-11">Verify UPI & Card Transactions</p>
        </div>
      </div>

      {pendingRefunds.length > 0 && (
        <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-6 space-y-4 animate-in slide-in-from-top duration-500 shadow-xl shadow-red-100/20">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertCircle size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Action Required: {pendingRefunds.length} Pending Refunds</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingRefunds.map(r => (
              <div key={r.id} className="bg-white p-4 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Order #{r.id.slice(-6).toUpperCase()}</p>
                  <p className="font-black text-gray-900 leading-none mt-1">₹{r.totalAmount}</p>
                </div>
                <a
                  href={`https://dashboard.razorpay.com/app/payments/${r.razorpayPaymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-600 transition-all active:scale-95 flex items-center space-x-1"
                >
                  <span>Refund</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search Payment ID, Order ID or Name..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none text-sm transition-all font-medium"
          />
        </div>

        <div className="flex items-center space-x-3 bg-gray-50 p-1.5 rounded-xl border border-gray-100 shadow-inner">
          <Filter size={16} className="text-gray-400 ml-2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent border-none px-3 py-1.5 text-xs font-black uppercase text-gray-600 outline-none cursor-pointer"
          >
            <option value="All">All Status</option>
            <option value="PAID">Paid / Captured</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-green-100/20 border border-gray-50 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredPayments}
          loading={loading}
        />
      </div>

      <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-start space-x-4 shadow-inner">
        <div className="p-3 bg-white rounded-2xl text-blue-600 shadow-sm">
          <ExternalLink size={20} />
        </div>
        <div>
          <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-1">Financial Reconciliation</h4>
          <p className="text-[10px] font-bold text-blue-700/60 leading-relaxed max-w-2xl italic">
            Note: Payment IDs shown here are recorded by the app. For final confirmation of funds settlement, please cross-reference these IDs with your Razorpay Settlement Reports.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Payments;

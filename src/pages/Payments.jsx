import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  CreditCard,
  Search,
  ExternalLink,
  Filter,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  Wallet,
  Coins,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

const Payments = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.warn("Firestore indexed order query fallback:", error);
        // Direct fallback query without orderBy in case of indexing delay
        getDocs(collection(db, 'orders'))
          .then((snap) => {
            const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            list.sort((a, b) => {
              const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return db - da;
            });
            setOrders(list);
          })
          .catch((err) => console.error("Orders fetch error:", err))
          .finally(() => setLoading(false));
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute KPI Metrics
  const metrics = useMemo(() => {
    let totalInflow = 0;
    let onlineAmount = 0;
    let codAmount = 0;
    let walletAmount = 0;
    let onlineCount = 0;
    let codCount = 0;

    orders.forEach((o) => {
      const amt = Number(o.totalAmount || 0);
      const method = (o.paymentMethod || 'COD').toUpperCase();
      if (o.status !== 'CANCELLED') {
        totalInflow += amt;
        if (['ONLINE', 'RAZORPAY', 'UPI', 'CARD', 'NETBANKING'].includes(method)) {
          onlineAmount += amt;
          onlineCount++;
        } else if (['WALLET', 'KRISHI_WALLET'].includes(method)) {
          walletAmount += amt;
        } else {
          codAmount += amt;
          codCount++;
        }
      }
    });

    return {
      totalInflow,
      onlineAmount,
      codAmount,
      walletAmount,
      onlineCount,
      codCount,
      totalCount: orders.length
    };
  }, [orders]);

  const pendingRefunds = useMemo(() => {
    return orders.filter((p) => {
      const method = (p.paymentMethod || '').toUpperCase();
      return (
        p.status === 'CANCELLED' &&
        ['ONLINE', 'RAZORPAY', 'UPI', 'ONLINE_PAYMENT'].includes(method) &&
        !p.isRefunded
      );
    });
  }, [orders]);

  const filteredPayments = useMemo(() => {
    return orders.filter((p) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        (p.razorpayPaymentId && p.razorpayPaymentId.toLowerCase().includes(q)) ||
        (p.address?.name && p.address.name.toLowerCase().includes(q)) ||
        (p.address?.phone && p.address.phone.toLowerCase().includes(q)) ||
        (p.userName && p.userName.toLowerCase().includes(q));

      const rawStatus = (p.paymentStatus || (p.status === 'DELIVERED' ? 'PAID' : 'PENDING')).toUpperCase();
      const matchesStatus =
        statusFilter === 'All' ||
        rawStatus === statusFilter.toUpperCase() ||
        (statusFilter === 'PAID' && (rawStatus === 'PAID' || rawStatus === 'CAPTURED' || p.status === 'DELIVERED'));

      const method = (p.paymentMethod || 'COD').toUpperCase();
      let matchesMethod = true;
      if (methodFilter === 'ONLINE') {
        matchesMethod = ['ONLINE', 'RAZORPAY', 'UPI', 'CARD', 'NETBANKING'].includes(method);
      } else if (methodFilter === 'COD') {
        matchesMethod = ['COD', 'CASH', 'PAY ON DELIVERY', 'CASH ON DELIVERY'].includes(method);
      } else if (methodFilter === 'WALLET') {
        matchesMethod = ['WALLET', 'KRISHI_WALLET'].includes(method);
      }

      return matchesSearch && matchesStatus && matchesMethod;
    });
  }, [orders, searchTerm, statusFilter, methodFilter]);

  const getMethodBadge = (methodRaw) => {
    const method = (methodRaw || 'COD').toUpperCase();
    if (['ONLINE', 'RAZORPAY', 'UPI', 'CARD'].includes(method)) {
      return (
        <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg uppercase tracking-wider border border-blue-200 shadow-sm flex items-center gap-1 w-fit">
          <CreditCard size={11} />
          UPI / Razorpay
        </span>
      );
    }
    if (['WALLET', 'KRISHI_WALLET'].includes(method)) {
      return (
        <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg uppercase tracking-wider border border-purple-200 shadow-sm flex items-center gap-1 w-fit">
          <Wallet size={11} />
          Wallet Credit
        </span>
      );
    }
    return (
      <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg uppercase tracking-wider border border-emerald-200 shadow-sm flex items-center gap-1 w-fit">
        <Coins size={11} />
        Cash on Delivery (COD)
      </span>
    );
  };

  const columns = [
    {
      header: 'Payment Reference',
      render: (p) => (
        <div className="flex flex-col">
          {p.razorpayPaymentId ? (
            <span className="font-mono font-black text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit">
              {p.razorpayPaymentId}
            </span>
          ) : (
            <span className="font-mono font-bold text-[10px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 w-fit">
              COD-{(p.id || '').slice(0, 8).toUpperCase()}
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mt-1">
            Order #{p.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      )
    },
    {
      header: 'Customer',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-xs">{p.address?.name || p.userName || 'Customer'}</span>
          <span className="text-[10px] text-gray-400 font-medium font-mono">{p.address?.phone || p.userPhone || '—'}</span>
        </div>
      )
    },
    {
      header: 'Amount',
      render: (p) => (
        <span className="font-mono font-black text-xs text-gray-900">
          {formatCurrency(Number(p.totalAmount || 0))}
        </span>
      )
    },
    {
      header: 'Payment Method',
      render: (p) => getMethodBadge(p.paymentMethod)
    },
    {
      header: 'Payment Status',
      render: (p) => {
        const isDelivered = p.status === 'DELIVERED';
        const rawStatus = p.paymentStatus || (isDelivered ? 'PAID' : 'PENDING');
        return <StatusBadge status={rawStatus} />;
      }
    },
    {
      header: 'Transaction Date',
      render: (p) => (
        <span className="text-gray-500 font-medium text-xs">
          {formatDateTime(p.createdAt)}
        </span>
      )
    },
    {
      header: 'Verification',
      render: (p) => {
        if (p.razorpayPaymentId) {
          return (
            <a
              href={`https://dashboard.razorpay.com/app/payments/${p.razorpayPaymentId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-all border border-blue-200 flex items-center gap-1 text-[10px] font-bold w-fit"
              title="Verify on Razorpay Gateway"
            >
              <span>Verify</span>
              <ExternalLink size={12} />
            </a>
          );
        }
        return (
          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
            Hub Verified
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Payments & Inflow Tracking"
        subtitle="Live payment gateway feeds, Razorpay settlements, Cash-on-Delivery (COD) cash inflow, and refund reconciliation"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Payment Inflow</p>
            <h3 className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(metrics.totalInflow)}</h3>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">{metrics.totalCount} Total Recorded Orders</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Online / UPI Inflow</p>
            <h3 className="text-2xl font-black text-blue-900 mt-1">{formatCurrency(metrics.onlineAmount)}</h3>
            <p className="text-[10px] text-blue-600 font-medium mt-0.5">{metrics.onlineCount} Digital Gateway Orders</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl">
            <CreditCard size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">COD Cash Collections</p>
            <h3 className="text-2xl font-black text-amber-900 mt-1">{formatCurrency(metrics.codAmount)}</h3>
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">{metrics.codCount} Delivery Cash Payments</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl">
            <Coins size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Wallet Settlements</p>
            <h3 className="text-2xl font-black text-purple-900 mt-1">{formatCurrency(metrics.walletAmount)}</h3>
            <p className="text-[10px] text-purple-600 font-medium mt-0.5">Krishi Wallet Balance Debits</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl">
            <Wallet size={24} />
          </div>
        </div>
      </div>

      {pendingRefunds.length > 0 && (
        <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-6 space-y-4 animate-in slide-in-from-top duration-500 shadow-xl shadow-red-100/20">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertCircle size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Action Required: {pendingRefunds.length} Pending Refunds</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingRefunds.map((r) => (
              <div key={r.id} className="bg-white p-4 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Order #{r.id.slice(-6).toUpperCase()}</p>
                  <p className="font-black text-gray-900 leading-none mt-1">₹{r.totalAmount}</p>
                </div>
                {r.razorpayPaymentId ? (
                  <a
                    href={`https://dashboard.razorpay.com/app/payments/${r.razorpayPaymentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-600 transition-all active:scale-95 flex items-center space-x-1"
                  >
                    <span>Refund</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-[10px] text-gray-500 font-bold">Manual COD Return</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[280px] relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search by Payment ID, Order ID, Customer Name, or Phone..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none text-xs transition-all font-medium"
          />
        </div>

        {/* Method Filter */}
        <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
          <span className="text-[10px] font-bold text-gray-400 uppercase px-2">Method:</span>
          {['All', 'ONLINE', 'COD', 'WALLET'].map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                methodFilter === m
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {m === 'All' ? 'All Methods' : m === 'ONLINE' ? 'UPI / Online' : m}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
          <Filter size={14} className="text-gray-400 ml-2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent border-none px-2 py-1.5 text-xs font-black uppercase text-gray-600 outline-none cursor-pointer"
          >
            <option value="All">All Status</option>
            <option value="PAID">Paid / Settled</option>
            <option value="PENDING">Pending Settlement</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredPayments}
          loading={loading}
        />
      </div>

      <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex items-start space-x-4">
        <div className="p-2.5 bg-white rounded-xl text-blue-700 shadow-sm shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider mb-0.5">Automated Reconciliation Engine</h4>
          <p className="text-xs text-blue-800/80 leading-relaxed max-w-3xl">
            Orders placed via Razorpay (UPI, Cards, NetBanking) are auto-tagged with gateway reference numbers. Cash on Delivery payments are matched against driver delivery completion manifests.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Payments;


import React, { useState, useEffect, useMemo } from "react";
import {
  IndianRupee,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  Wallet,
  Landmark,
  FileText,
  Download,
  Calendar,
  ChevronRight,
  AlertCircle,
  XCircle,
  Activity,
  CheckCircle,
  Plus,
  User,
  Shield,
  Layers,
  Tag,
  Eye,
  CreditCard,
  Building,
  Clock,
  Sparkles,
  ArrowUpDown,
  RotateCcw
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, limit, addDoc, Timestamp, getDocs, where } from "firebase/firestore";
import { db, functions, auth } from "../firebase/config";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../hooks/useAuth";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import toast from "react-hot-toast";

const Finance = () => {
  const { user, role } = useAuth();
  const [ledger, setLedger] = useState([]);
  const [totalWalletLiability, setTotalWalletLiability] = useState(0);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    grossProfit: 0,
    netProfit: 0,
    expenses: 0,
    gstCollected: 0,
    refunds: 0,
    returnsCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState('All Time');

  // Modals state
  const [isReconModalOpen, setIsReconModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isExpenseBreakdownOpen, setIsExpenseBreakdownOpen] = useState(false);

  // Breakdown Filter States
  const [breakdownCategoryFilter, setBreakdownCategoryFilter] = useState('ALL');
  const [breakdownRoleFilter, setBreakdownRoleFilter] = useState('ALL');
  const [breakdownAdminFilter, setBreakdownAdminFilter] = useState('ALL');
  const [breakdownSearch, setBreakdownSearch] = useState('');
  const [breakdownSort, setBreakdownSort] = useState('NEWEST'); // NEWEST, OLDEST, HIGH_AMOUNT, LOW_AMOUNT
  const [breakdownDateRange, setBreakdownDateRange] = useState('All Time');

  const [reconData, setReconData] = useState({
    payoutId: '',
    grossAmount: '',
    netAmount: '',
    fees: '',
    taxOnFees: ''
  });
  const [expenseForm, setExpenseForm] = useState({ category: 'OFFICE_RENT', amount: '', note: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      let start = null;
      let end = new Date();

      switch (dateRange) {
        case 'Today': start = new Date(); start.setHours(0, 0, 0, 0); break;
        case 'Yesterday':
          start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0,0,0,0);
          end.setDate(end.getDate() - 1); end.setHours(23,59,59,999);
          break;
        case 'Last 7 Days': start = new Date(); start.setDate(start.getDate() - 7); break;
        case 'Last 30 Days': start = new Date(); start.setDate(start.getDate() - 30); break;
        case 'Current Month': start = new Date(); start.setDate(1); start.setHours(0,0,0,0); break;
        default: start = null;
      }

      // Fetch financial summary from Cloud Function
      const getSummary = httpsCallable(functions, 'getFinanceSummary');
      const res = await getSummary({
        startDate: start?.toISOString(),
        endDate: end.toISOString()
      });

      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch finance summary from server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
    const q = query(collection(db, "ledger"), orderBy("timestamp", "desc"), limit(200));
    const unsubscribeLedger = onSnapshot(q, (snapshot) => {
      setLedger(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      let total = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.walletBalance && Number(data.walletBalance) > 0) {
          total += Number(data.walletBalance);
        }
      });
      setTotalWalletLiability(total);
    });

    return () => {
      unsubscribeLedger();
      unsubscribeUsers();
    };
  }, [dateRange]);

  const handleReconcile = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const recordPayout = httpsCallable(functions, 'recordBankPayout');
      await recordPayout(reconData);
      toast.success("Bank Payout reconciled successfully!");
      setIsReconModalOpen(false);
      setReconData({ payoutId: '', grossAmount: '', netAmount: '', fees: '', taxOnFees: '' });
      fetchFinanceData();
    } catch (error) {
      toast.error(error.message || "Reconciliation failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) return toast.error("Enter valid amount");

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'ledger'), {
        account: expenseForm.category,
        type: 'DEBIT',
        amount: Number(expenseForm.amount),
        description: expenseForm.note || `Manual Expense: ${expenseForm.category}`,
        timestamp: Timestamp.now(),
        actorId: user?.uid || auth.currentUser?.uid || "unknown",
        actorEmail: user?.email || auth.currentUser?.email || "unknown",
        actorName: user?.displayName || user?.email?.split('@')[0] || "Admin",
        actorRole: role || "SuperAdmin"
      });
      toast.success("Expense recorded successfully!");
      setIsExpenseModalOpen(false);
      setExpenseForm({ category: 'OFFICE_RENT', amount: '', note: '' });
      fetchFinanceData();
    } catch (e) {
      toast.error("Failed to save expense: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToCsv = () => {
    const headers = ["Date", "Account", "Type", "Description", "Performed By", "Role", "Amount"];
    const rows = ledger.map(entry => [
      entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : "",
      entry.account || "",
      entry.type || "",
      entry.description || "",
      entry.actorName || entry.actorEmail || "System",
      entry.actorRole || "Admin",
      entry.amount || 0
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `Finance_Report_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const chartData = [
    { name: 'Revenue', value: summary.totalRevenue || 0, color: '#166534' },
    { name: 'G.Profit', value: summary.grossProfit || 0, color: '#1e40af' },
    { name: 'Expenses', value: summary.expenses || 0, color: '#991b1b' },
    { name: 'GST', value: summary.gstCollected || 0, color: '#92400e' },
  ];

  // Helper for role badge colors
  const getRoleBadge = (roleName) => {
    const r = (roleName || 'Admin').toUpperCase();
    if (r.includes('SUPER')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (r.includes('FINANCE')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (r.includes('ORDER') || r.includes('OPERATION')) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  };

  const columns = [
    {
      header: "Date & Time",
      render: (entry) => {
        const d = entry.timestamp?.toDate ? entry.timestamp.toDate() : (entry.timestamp ? new Date(entry.timestamp) : new Date());
        return (
          <div className="text-xs">
            <span className="font-bold text-gray-900 block">{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="text-[10px] text-gray-400 font-mono font-medium">{d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        );
      },
    },
    {
      header: "Account / Category",
      render: (entry) => (
        <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-black text-gray-700 uppercase tracking-tight border border-gray-200">
          {entry.account || 'GENERAL'}
        </span>
      ),
    },
    {
      header: "Description",
      render: (entry) => (
        <div className="max-w-xs">
          <div className="text-xs font-bold text-gray-800 line-clamp-1">{entry.description}</div>
          {entry.referenceId && (
            <div className="text-[9px] text-gray-400 font-mono uppercase mt-0.5">Ref: {entry.referenceId}</div>
          )}
        </div>
      ),
    },
    {
      header: "Performed By (Admin & Role)",
      render: (entry) => (
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-600 uppercase">
            {(entry.actorName || entry.actorEmail || 'A').charAt(0)}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 leading-tight">
              {entry.actorName || entry.actorEmail?.split('@')[0] || 'System Admin'}
            </div>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className={`px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider rounded border ${getRoleBadge(entry.actorRole)}`}>
                {entry.actorRole || 'SuperAdmin'}
              </span>
              {entry.actorEmail && (
                <span className="text-[9px] text-gray-400 truncate max-w-[120px] font-mono">
                  {entry.actorEmail}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Amount",
      render: (entry) => (
        <div className="flex flex-col items-end">
          <span className={`text-sm font-black ${entry.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
            {entry.type === 'CREDIT' ? '+' : '-'} ₹{Number(entry.amount || 0).toLocaleString('en-IN')}
          </span>
          <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">{entry.type}</span>
        </div>
      ),
    },
  ];

  // All DEBIT expenses from ledger
  const debitExpenses = useMemo(() => {
    return ledger.filter(e => e.type === 'DEBIT');
  }, [ledger]);

  // Aggregate total by category from debitExpenses
  const categoryTotals = useMemo(() => {
    const map = {};
    debitExpenses.forEach(e => {
      const cat = (e.account || 'GENERAL').toUpperCase();
      map[cat] = (map[cat] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [debitExpenses]);

  // Available unique roles and admin names
  const availableRoles = useMemo(() => {
    const set = new Set();
    debitExpenses.forEach(e => {
      set.add((e.actorRole || 'SuperAdmin').toUpperCase());
    });
    return Array.from(set);
  }, [debitExpenses]);

  const availableAdmins = useMemo(() => {
    const set = new Set();
    debitExpenses.forEach(e => {
      const name = e.actorName || e.actorEmail || 'System Admin';
      set.add(name);
    });
    return Array.from(set);
  }, [debitExpenses]);

  // Date filtering helper
  const filterByDateRange = (itemDate, range) => {
    if (!itemDate || range === 'All Time') return true;
    const d = itemDate.toDate ? itemDate.toDate() : new Date(itemDate);
    const now = new Date();
    
    if (range === 'Today') {
      return d.toDateString() === now.toDateString();
    }
    if (range === 'Yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (range === 'Last 7 Days') {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 7);
      return d >= past7;
    }
    if (range === 'Last 30 Days') {
      const past30 = new Date();
      past30.setDate(past30.getDate() - 30);
      return d >= past30;
    }
    if (range === 'Current Month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  // Filtered breakdown expenses
  const filteredBreakdownExpenses = useMemo(() => {
    return debitExpenses.filter(e => {
      // 1. Category Filter
      const cat = (e.account || 'GENERAL').toUpperCase();
      const matchesCategory = breakdownCategoryFilter === 'ALL' || cat === breakdownCategoryFilter.toUpperCase();

      // 2. Role Filter
      const roleUpper = (e.actorRole || 'SuperAdmin').toUpperCase();
      const matchesRole = breakdownRoleFilter === 'ALL' || roleUpper === breakdownRoleFilter.toUpperCase();

      // 3. Admin Name/Email Filter
      const nameUpper = (e.actorName || e.actorEmail || 'System Admin').toUpperCase();
      const matchesAdmin = breakdownAdminFilter === 'ALL' || nameUpper === breakdownAdminFilter.toUpperCase();

      // 4. Search Query Filter
      const q = breakdownSearch.trim().toLowerCase();
      const matchesSearch = !q || 
        (e.description || '').toLowerCase().includes(q) ||
        (e.account || '').toLowerCase().includes(q) ||
        (e.actorName || '').toLowerCase().includes(q) ||
        (e.actorEmail || '').toLowerCase().includes(q) ||
        (e.actorRole || '').toLowerCase().includes(q) ||
        String(e.amount || '').includes(q);

      // 5. Date Range Filter inside Modal
      const matchesDate = filterByDateRange(e.timestamp, breakdownDateRange);

      return matchesCategory && matchesRole && matchesAdmin && matchesSearch && matchesDate;
    }).sort((a, b) => {
      const da = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const db = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      const amta = Number(a.amount || 0);
      const amtb = Number(b.amount || 0);

      if (breakdownSort === 'NEWEST') return db - da;
      if (breakdownSort === 'OLDEST') return da - db;
      if (breakdownSort === 'HIGH_AMOUNT') return amtb - amta;
      if (breakdownSort === 'LOW_AMOUNT') return amta - amtb;
      return db - da;
    });
  }, [debitExpenses, breakdownSearch, breakdownCategoryFilter, breakdownRoleFilter, breakdownAdminFilter, breakdownDateRange, breakdownSort]);

  // Real-time calculated total for filtered expenses
  const filteredTotalAmount = useMemo(() => {
    return filteredBreakdownExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredBreakdownExpenses]);

  // Reset filters helper
  const resetFilters = () => {
    setBreakdownCategoryFilter('ALL');
    setBreakdownRoleFilter('ALL');
    setBreakdownAdminFilter('ALL');
    setBreakdownSearch('');
    setBreakdownSort('NEWEST');
    setBreakdownDateRange('All Time');
  };

  const isFilterActive = breakdownCategoryFilter !== 'ALL' || 
    breakdownRoleFilter !== 'ALL' || 
    breakdownAdminFilter !== 'ALL' || 
    breakdownSearch !== '' || 
    breakdownDateRange !== 'All Time' || 
    breakdownSort !== 'NEWEST';

  const MetricCard = ({ title, value, icon: Icon, color, onClick, subtitle }) => (
    <div 
      onClick={onClick}
      className={`bg-white p-6 rounded-[2rem] border border-gray-50 shadow-xl shadow-green-100/20 ${onClick ? 'cursor-pointer hover:border-primary/30 transition-all hover:scale-[1.01]' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-gray-900`}>
          <Icon size={20} className="text-current" />
        </div>
        {onClick && (
          <span className="text-[9px] font-black text-primary uppercase tracking-wider bg-green-50 px-2 py-0.5 rounded-full border border-green-100 flex items-center gap-1">
            <Eye size={10} /> View Details
          </span>
        )}
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
      <h3 className="text-2xl font-black text-gray-900 tracking-tighter">₹{Number(value || 0).toLocaleString('en-IN')}</h3>
      {subtitle && <p className="text-[10px] text-gray-400 font-bold mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-10">
      <PageHeader
        title="Finance Intelligence & Ledger"
        subtitle="Immutable ledger, revenue analytics, expense tracking, GST compliance, and reconciliation"
        actions={[
          { label: 'Export CSV', icon: Download, onClick: exportToCsv, variant: 'secondary' },
          { label: 'Reconcile Payout', icon: Plus, onClick: () => setIsReconModalOpen(true), variant: 'primary' }
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-white p-1 rounded-3xl border border-gray-100 shadow-sm">
          {['All Time', 'Today', 'Last 7 Days', 'Last 30 Days', 'Current Month'].map(range => (
            <button
              key={range}
              onClick={() => { setDateRange(range); setBreakdownDateRange(range); }}
              className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${
                dateRange === range ? 'bg-primary text-white shadow-lg shadow-green-100' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        <div className="flex items-center bg-white p-1 rounded-3xl border border-gray-100 shadow-sm">
           <button
             onClick={() => { setBreakdownDateRange(dateRange); setIsExpenseBreakdownOpen(true); }}
             className="px-5 py-2 bg-gray-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center gap-1.5"
           >
             <Eye size={12} />
             Expense Audit
           </button>
           <div className="h-4 w-px bg-gray-100 mx-2" />
           <button
             onClick={() => setIsExpenseModalOpen(true)}
             className="px-5 py-2 bg-red-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100"
           >
             Record Expense
           </button>
           <div className="h-4 w-px bg-gray-100 mx-2" />
           <button
             onClick={() => setIsReconModalOpen(true)}
             className="px-5 py-2 bg-blue-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
           >
             Reconcile
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Revenue" value={summary.totalRevenue} icon={TrendingUp} color="bg-green-600" />
        <MetricCard title="Gross Profit" value={summary.grossProfit} icon={ArrowUpRight} color="bg-blue-600" />
        <MetricCard title="Net Profit" value={summary.netProfit} icon={IndianRupee} color="bg-purple-600" />
        <MetricCard 
          title="Operational Expenses" 
          value={summary.expenses} 
          icon={CreditCard} 
          color="bg-red-600" 
          onClick={() => { setBreakdownDateRange(dateRange); setIsExpenseBreakdownOpen(true); }}
          subtitle="Click to view breakdown by Admin & Category"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-50 shadow-xl shadow-green-100/20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Profitability Snapshot</h2>
            <button
              onClick={() => { setBreakdownDateRange(dateRange); setIsExpenseBreakdownOpen(true); }}
              className="text-xs font-black text-red-600 hover:text-red-700 uppercase tracking-wider flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100"
            >
              <Eye size={12} /> View Detailed Expenses
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <YAxis hide />
                <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={50}>
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-primary p-10 rounded-[3rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden flex flex-col justify-between">
           <Landmark size={200} className="absolute -right-10 -top-10 opacity-10" />
           <div className="relative z-10 space-y-8">
              <div>
                <p className="text-[10px] font-black text-green-200 uppercase tracking-widest mb-1">Available Liquidity</p>
                <h3 className="text-4xl font-black tracking-tighter">₹{((summary.totalRevenue || 0) - (summary.expenses || 0) - (summary.refunds || 0)).toLocaleString('en-IN')}</h3>
              </div>
              <div className="space-y-4">
                <div 
                  onClick={() => { setBreakdownDateRange(dateRange); setIsExpenseBreakdownOpen(true); }}
                  className="flex justify-between items-center text-xs font-bold border-b border-white/10 pb-3 cursor-pointer group hover:bg-white/10 p-2 rounded-2xl transition-all"
                  title="Click to view detailed audit breakdown"
                >
                  <div>
                    <span className="text-green-200 uppercase flex items-center gap-1.5">
                      <CreditCard size={13} /> Operational Expenses
                    </span>
                    <span className="text-[9px] text-green-300 font-normal flex items-center gap-1 mt-0.5 group-hover:text-white transition-colors">
                      <Eye size={10} /> Click to audit breakdown ↗
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black">₹{(summary.expenses || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="flex justify-between text-xs font-bold border-b border-white/10 pb-3">
                  <span className="text-green-200 uppercase">Refunds Processed</span>
                  <span>₹{(summary.refunds || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs font-bold border-b border-white/10 pb-3">
                  <span className="text-amber-200 uppercase flex items-center gap-1">
                    <Wallet size={12} /> Customer Wallet Balance
                  </span>
                  <span className="text-amber-300">₹{(totalWalletLiability || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-green-200 uppercase">GST Collected</span>
                  <span>₹{(summary.gstCollected || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
           </div>
           <div className="bg-white/10 p-5 rounded-2xl relative z-10 border border-white/10 mt-10">
              <p className="text-[9px] font-bold text-green-50/80 leading-relaxed uppercase tracking-tighter">
                Figures aggregated from immutable server-side ledger.
              </p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-gray-50 shadow-xl shadow-green-100/20 overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Recent Ledger Transactions</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Live audit trail with Admin roles, timestamps and accounting categories</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
              <Search size={16} className="text-gray-400 mr-2" />
              <input
                placeholder="Search description, admin..."
                className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DataTable 
          columns={columns} 
          data={ledger.filter(e => 
            (e.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.account || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.actorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.actorRole || '').toLowerCase().includes(searchTerm.toLowerCase())
          )} 
          loading={loading} 
        />
      </div>

      {/* OPERATIONAL EXPENSES DEEP-DIVE MODAL WITH ROBUST FILTERS */}
      {isExpenseBreakdownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col my-auto border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 sm:p-8 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <span className="p-2.5 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30">
                    <IndianRupee size={22} />
                  </span>
                  <div>
                    <h2 className="text-xl font-black tracking-tight uppercase">Operational Expenses Audit Breakdown</h2>
                    <p className="text-xs text-gray-300 font-medium mt-0.5">
                      Kis admin role ne, kab, kahan aur kitna kharcha kiya — Live Smart Filter System
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    const headers = ["Date", "Time", "Category/Account", "Description", "Admin Name", "Admin Role", "Admin Email", "Amount (INR)"];
                    const rows = filteredBreakdownExpenses.map(e => {
                      const d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date();
                      return [
                        d.toLocaleDateString(),
                        d.toLocaleTimeString(),
                        `"${e.account || ''}"`,
                        `"${e.description || ''}"`,
                        `"${e.actorName || 'Admin'}"`,
                        `"${e.actorRole || 'SuperAdmin'}"`,
                        `"${e.actorEmail || ''}"`,
                        e.amount || 0
                      ];
                    });
                    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const link = document.createElement('a');
                    link.href = window.URL.createObjectURL(blob);
                    link.download = `Operational_Expenses_Audit_${new Date().toLocaleDateString()}.csv`;
                    link.click();
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border border-white/10 shadow-sm"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => setIsExpenseBreakdownOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Dynamic Real-Time Summary Cards based on active filter */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">
                      {isFilterActive ? 'Filtered Spent Total' : `Total Expenses (${breakdownDateRange})`}
                    </p>
                    {isFilterActive && (
                      <span className="text-[8px] font-black bg-red-200 text-red-800 px-1.5 py-0.5 rounded uppercase">Filtered</span>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-red-950 mt-1">
                    ₹{filteredTotalAmount.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-[10px] text-red-500 font-bold mt-1">{filteredBreakdownExpenses.length} Records Showing</p>
                </div>

                <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Active Category Filter</p>
                  <h3 className="text-xl font-black text-purple-950 mt-1 truncate">
                    {breakdownCategoryFilter === 'ALL' ? 'All Categories' : breakdownCategoryFilter}
                  </h3>
                  <p className="text-[10px] text-purple-600 font-bold mt-1">
                    {breakdownCategoryFilter === 'ALL' ? `${categoryTotals.length} categories active` : `Filtered view`}
                  </p>
                </div>

                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Active Admin / Role</p>
                  <h3 className="text-xl font-black text-blue-950 mt-1 truncate">
                    {breakdownAdminFilter !== 'ALL' ? breakdownAdminFilter : (breakdownRoleFilter !== 'ALL' ? breakdownRoleFilter : 'All Admins & Roles')}
                  </h3>
                  <p className="text-[10px] text-blue-600 font-bold mt-1">
                    {breakdownRoleFilter === 'ALL' && breakdownAdminFilter === 'ALL' ? `${availableAdmins.length} Admins recorded` : 'Filtered view'}
                  </p>
                </div>
              </div>

              {/* Date Range Tabs inside Modal */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Date Period:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Current Month'].map(range => (
                    <button
                      key={range}
                      onClick={() => setBreakdownDateRange(range)}
                      className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        breakdownDateRange === range ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200/60'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Quick Filter Pills */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <Layers size={12} /> Filter By Category:
                  </div>
                  {isFilterActive && (
                    <button
                      onClick={resetFilters}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 uppercase tracking-wider"
                    >
                      <RotateCcw size={10} /> Reset All Filters
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setBreakdownCategoryFilter('ALL')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      breakdownCategoryFilter === 'ALL'
                        ? 'bg-gray-900 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All Categories ({debitExpenses.length})
                  </button>
                  {categoryTotals.map(([cat, amt]) => {
                    const isSelected = breakdownCategoryFilter.toUpperCase() === cat.toUpperCase();
                    return (
                      <button
                        key={cat}
                        onClick={() => setBreakdownCategoryFilter(isSelected ? 'ALL' : cat)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                          isSelected
                            ? 'bg-red-600 text-white shadow-md scale-105'
                            : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-red-700 text-white' : 'bg-red-100 text-red-800'}`}>
                          ₹{amt.toLocaleString('en-IN')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Filter Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
                {/* Search */}
                <div className="sm:col-span-4 relative">
                  <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search by note, category, admin..."
                    value={breakdownSearch}
                    onChange={(e) => setBreakdownSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Role Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={breakdownRoleFilter}
                    onChange={(e) => setBreakdownRoleFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="ALL">All Admin Roles</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                    <option value="FinanceAdmin">FinanceAdmin</option>
                    <option value="OrderManager">OrderManager</option>
                    {availableRoles.filter(r => !['SUPERADMIN', 'FINANCEADMIN', 'ORDERMANAGER'].includes(r)).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Specific Admin Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={breakdownAdminFilter}
                    onChange={(e) => setBreakdownAdminFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="ALL">All Admin Users</option>
                    {availableAdmins.map(adminName => (
                      <option key={adminName} value={adminName}>{adminName}</option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div className="sm:col-span-2">
                  <select
                    value={breakdownSort}
                    onChange={(e) => setBreakdownSort(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="NEWEST">Newest First</option>
                    <option value="OLDEST">Oldest First</option>
                    <option value="HIGH_AMOUNT">Highest (₹)</option>
                    <option value="LOW_AMOUNT">Lowest (₹)</option>
                  </select>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                <DataTable columns={columns} data={filteredBreakdownExpenses} loading={loading} />
              </div>

              {filteredBreakdownExpenses.length === 0 && (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <AlertCircle size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-black text-gray-600 uppercase">No matching expenses found</p>
                  <p className="text-xs text-gray-400 mt-1">Aapke chune hue filter criteria ke mutabik koi record nahi mila.</p>
                  <button
                    onClick={resetFilters}
                    className="mt-3 px-4 py-1.5 bg-primary text-white text-xs font-bold rounded-xl shadow"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Record Expense</h2>
                <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <XCircle size={24} />
                </button>
             </div>
             <form onSubmit={handleAddExpense} className="p-8 space-y-6">
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
                   <select
                     value={expenseForm.category}
                     onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                     className="w-full mt-2 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-red-900"
                   >
                      <option value="OFFICE_RENT">Office Rent</option>
                      <option value="ELECTRICITY">Electricity</option>
                      <option value="INTERNET">Internet/Phone</option>
                      <option value="OFFICE_SALARY">Staff Salary</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="CHAI_SNACKS">Tea & Snacks</option>
                      <option value="LOGISTICS_FUEL">Logistics & Fuel</option>
                      <option value="WAREHOUSE_SUPPLIES">Warehouse Supplies</option>
                      <option value="MARKETING">Marketing</option>
                      <option value="MISC">Miscellaneous</option>
                   </select>
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Amount (₹)</label>
                   <input
                     type="number" required placeholder="0.00"
                     value={expenseForm.amount}
                     onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                     className="w-full mt-2 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-red-900"
                   />
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description / Note</label>
                   <textarea
                     placeholder="Payment details, reason..."
                     value={expenseForm.note}
                     onChange={(e) => setExpenseForm({...expenseForm, note: e.target.value})}
                     className="w-full mt-2 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none h-24 resize-none"
                   />
                </div>
                <button
                  disabled={isProcessing}
                  className="w-full bg-red-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-800 active:scale-95 transition-all shadow-xl shadow-red-100 flex justify-center"
                >
                  {isProcessing ? <Activity className="animate-spin" size={16} /> : "SAVE EXPENSE"}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Recon Modal */}
      {isReconModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Reconcile Bank Payout</h2>
                <button onClick={() => setIsReconModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <XCircle size={24} />
                </button>
             </div>
             <form onSubmit={handleReconcile} className="p-8 space-y-4">
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payout Reference / ID</label>
                   <input
                     required
                     value={reconData.payoutId}
                     onChange={(e) => setReconData({...reconData, payoutId: e.target.value})}
                     className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none"
                     placeholder="e.g. payout_12345"
                   />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Gross Amount</label>
                     <input
                       type="number" required
                       value={reconData.grossAmount}
                       onChange={(e) => setReconData({...reconData, grossAmount: e.target.value})}
                       className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Net Settled</label>
                     <input
                       type="number" required
                       value={reconData.netAmount}
                       onChange={(e) => setReconData({...reconData, netAmount: e.target.value})}
                       className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none"
                     />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">PG Fees</label>
                     <input
                       type="number"
                       value={reconData.fees}
                       onChange={(e) => setReconData({...reconData, fees: e.target.value})}
                       className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tax on Fees</label>
                     <input
                       type="number"
                       value={reconData.taxOnFees}
                       onChange={(e) => setReconData({...reconData, taxOnFees: e.target.value})}
                       className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm text-gray-800 outline-none"
                     />
                  </div>
                </div>
                <button
                  disabled={isProcessing}
                  className="w-full mt-4 bg-blue-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-800 transition-all shadow-xl shadow-blue-100 flex justify-center"
                >
                  {isProcessing ? <Activity className="animate-spin" size={16} /> : "CONFIRM RECONCILIATION"}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;

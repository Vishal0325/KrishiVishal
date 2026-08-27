import React, { useState, useEffect } from "react";
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
  Plus
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, limit, addDoc, Timestamp } from "firebase/firestore";
import { db, functions } from "../firebase/config";
import { httpsCallable } from "firebase/functions";
import DataTable from "../components/common/DataTable";
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
  const [ledger, setLedger] = useState([]);
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
  const [dateRange, setDateRange] = useState('Last 7 Days');

  // Modals state
  const [isReconModalOpen, setIsReconModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

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
      const getSummary = httpsCallable(functions, 'getFinanceSummary');
      let start = new Date();
      const end = new Date();

      switch (dateRange) {
        case 'Today': start.setHours(0, 0, 0, 0); break;
        case 'Yesterday':
          start.setDate(start.getDate() - 1); start.setHours(0,0,0,0);
          end.setDate(end.getDate() - 1); end.setHours(23,59,59,999);
          break;
        case 'Last 7 Days': start.setDate(start.getDate() - 7); break;
        case 'Last 30 Days': start.setDate(start.getDate() - 30); break;
        case 'Current Month': start.setDate(1); start.setHours(0,0,0,0); break;
        default: start.setDate(start.getDate() - 7);
      }

      const result = await getSummary({
        startDate: start.toISOString(),
        endDate: end.toISOString()
      });

      if (result.data) setSummary(result.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch finance summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
    const q = query(collection(db, "ledger"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribeLedger = onSnapshot(q, (snapshot) => {
      setLedger(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribeLedger();
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
        timestamp: Timestamp.now()
      });
      toast.success("Expense recorded successfully!");
      setIsExpenseModalOpen(false);
      setExpenseForm({ category: 'OFFICE_RENT', amount: '', note: '' });
      fetchFinanceData();
    } catch (e) {
      toast.error("Failed to save expense");
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToCsv = () => {
    const headers = ["Date", "Account", "Type", "Description", "Amount"];
    const rows = ledger.map(entry => [
      entry.timestamp?.toDate().toLocaleString() || "",
      entry.account,
      entry.type,
      entry.description,
      entry.amount
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `Finance_Report_${new Date().toLocaleDateString()}.csv`;
    link.click();
    window.URL.revokeObjectURL(link.href);
  };

  const chartData = [
    { name: 'Revenue', value: summary.totalRevenue, color: '#166534' },
    { name: 'G.Profit', value: summary.grossProfit, color: '#1e40af' },
    { name: 'Expenses', value: summary.expenses, color: '#991b1b' },
    { name: 'GST', value: summary.gstCollected, color: '#92400e' },
  ];

  const columns = [
    {
      header: "Date",
      render: (entry) => {
        const d = entry.timestamp?.toDate() || new Date();
        return (
          <div className="text-xs">
            <span className="font-bold text-gray-900">{d.toLocaleDateString()}</span>
            <div className="text-gray-400">{d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
        );
      },
    },
    {
      header: "Account",
      render: (entry) => (
        <span className="px-2 py-1 bg-gray-100 rounded text-[9px] font-black text-gray-600 uppercase tracking-tighter">
          {entry.account}
        </span>
      ),
    },
    {
      header: "Description",
      render: (entry) => (
        <div className="max-w-xs truncate">
          <div className="text-sm font-bold text-gray-800 truncate">{entry.description}</div>
          <div className="text-[9px] text-gray-400 font-mono uppercase">Ref: {entry.referenceId || 'N/A'}</div>
        </div>
      ),
    },
    {
      header: "Amount",
      render: (entry) => (
        <div className="flex flex-col items-end">
          <span className={`text-sm font-black ${entry.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
            {entry.type === 'CREDIT' ? '+' : '-'} ₹{Number(entry.amount).toLocaleString('en-IN')}
          </span>
          <span className="text-[8px] font-black uppercase text-gray-300 tracking-widest">{entry.type}</span>
        </div>
      ),
    },
  ];

  const MetricCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-xl shadow-green-100/20">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-gray-900`}>
          <Icon size={20} className="text-current" />
        </div>
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
      <h3 className="text-2xl font-black text-gray-900 tracking-tighter">₹{Number(value || 0).toLocaleString('en-IN')}</h3>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <IndianRupee className="mr-3 text-primary" size={32} />
            Finance Intelligence
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Immutable Ledger V4</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white p-1 rounded-3xl border border-gray-100 shadow-sm">
            {['Today', 'Last 7 Days', 'Last 30 Days', 'Current Month'].map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
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
               onClick={() => setIsExpenseModalOpen(true)}
               className="px-5 py-2 bg-red-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-red-800 transition-all shadow-lg shadow-red-100"
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
             <button onClick={exportToCsv} className="p-2 text-gray-400 hover:text-primary transition-colors ml-1">
               <Download size={18} />
             </button>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Revenue" value={summary.totalRevenue} icon={TrendingUp} color="bg-green-600" />
        <MetricCard title="Gross Profit" value={summary.grossProfit} icon={ArrowUpRight} color="bg-blue-600" />
        <MetricCard title="Net Profit" value={summary.netProfit} icon={IndianRupee} color="bg-purple-600" />
        <MetricCard title="GST Collected" value={summary.gstCollected} icon={FileText} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-50 shadow-xl shadow-green-100/20">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter mb-10">Profitability Snapshot</h2>
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

        {/* Liquidity */}
        <div className="bg-primary p-10 rounded-[3rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden flex flex-col justify-between">
           <Landmark size={200} className="absolute -right-10 -top-10 opacity-10" />
           <div className="relative z-10 space-y-8">
              <div>
                <p className="text-[10px] font-black text-green-200 uppercase tracking-widest mb-1">Available Liquidity</p>
                <h3 className="text-4xl font-black tracking-tighter">₹{(summary.totalRevenue - summary.expenses - summary.refunds).toLocaleString('en-IN')}</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-bold border-b border-white/10 pb-3">
                  <span className="text-green-200 uppercase">Operational Expenses</span>
                  <span>₹{summary.expenses.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs font-bold border-b border-white/10 pb-3">
                  <span className="text-green-200 uppercase">Refunds Processed</span>
                  <span>₹{summary.refunds.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-green-200 uppercase">Returns Count</span>
                  <span>{summary.returnsCount} Units</span>
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

      {/* Ledger Table */}
      <div className="bg-white rounded-[3rem] border border-gray-50 shadow-xl shadow-green-100/20 overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Recent Ledger Transactions</h2>
          <div className="flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
            <Search size={16} className="text-gray-400 mr-2" />
            <input
              placeholder="Search Ledger..."
              className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 w-40"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <DataTable columns={columns} data={ledger.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()))} loading={loading} />
      </div>

      {/* MODALS */}
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
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description</label>
                   <textarea
                     placeholder="Payment details..."
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
                <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Bank Settlement</h2>
                <button onClick={() => setIsReconModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <XCircle size={24} />
                </button>
             </div>
             <form onSubmit={handleReconcile} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payout ID</label>
                    <input required value={reconData.payoutId} onChange={(e) => setReconData({...reconData, payoutId: e.target.value})} className="w-full mt-2 px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Net Received (₹)</label>
                    <input required type="number" value={reconData.netAmount} onChange={(e) => setReconData({...reconData, netAmount: e.target.value})} className="w-full mt-2 px-5 py-3 bg-blue-50 border border-blue-100 rounded-2xl font-black text-blue-700" />
                  </div>
                </div>
                <button
                  disabled={isProcessing}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-100 flex justify-center"
                >
                  {isProcessing ? <Activity className="animate-spin" size={16} /> : "FINALIZE RECONCILIATION"}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;

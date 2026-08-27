import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  FileText,
  ChevronRight,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  IndianRupee,
  FileDown,
  AlertCircle
} from 'lucide-react';
import { useExpenses } from '../../hooks/useExpenses';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { APPROVAL_STATUS, PAYMENT_STATUS, STATUS_COLORS } from '../../utils/expenses/constants';
import DataTable from '../../components/common/DataTable';
import MetricCard from '../../components/common/MetricCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { generateExpenseReportPDF } from '../../utils/expenses/pdfGenerator';
import toast from 'react-hot-toast';

const Expenses = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    approvalStatus: 'ALL',
    paymentStatus: 'ALL',
    categoryId: 'ALL',
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  const { expenses, loading } = useExpenses(filters);

  // 1. Dashboard Metrics
  const metrics = useMemo(() => {
    const totalAmount = expenses.reduce((sum, e) => sum + (e.totalAmountMinor || 0), 0) / 100;
    const pending = expenses.filter(e => e.approvalStatus === APPROVAL_STATUS.PENDING).length;
    const approved = expenses.filter(e => e.approvalStatus === APPROVAL_STATUS.APPROVED).length;
    const unpaid = expenses.filter(e => e.paymentStatus === PAYMENT_STATUS.UNPAID).length;

    return [
      { title: 'Total Expenses', value: formatCurrency(totalAmount), count: expenses.length, icon: Receipt, color: 'blue' },
      { title: 'Pending Approval', value: pending, icon: Clock, color: 'orange' },
      { title: 'Approved', value: approved, icon: CheckCircle, color: 'green' },
      { title: 'Unpaid / Partial', value: unpaid, icon: AlertCircle, color: 'red' },
    ];
  }, [expenses]);

  const categoryChartData = useMemo(() => {
     const cats = {};
     expenses.forEach(e => {
        cats[e.categoryName] = (cats[e.categoryName] || 0) + (e.totalAmountMinor / 100);
     });
     return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const COLORS = ['#1b5e20', '#2e7d32', '#388e3c', '#43a047', '#4caf50'];

  // 2. Search Logic (Debounced in real use, but simple filter for now)
  const filteredData = useMemo(() => {
    if (!searchTerm) return expenses;
    const s = searchTerm.toLowerCase();
    return expenses.filter(e =>
      e.expenseNumber?.toLowerCase().includes(s) ||
      e.vendorName?.toLowerCase().includes(s) ||
      e.description?.toLowerCase().includes(s) ||
      e.invoiceNumber?.toLowerCase().includes(s)
    );
  }, [expenses, searchTerm]);

  // 3. Table Columns
  const columns = [
    {
      header: 'Expense ID',
      render: (e) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-gray-900 text-xs tracking-tighter uppercase">{e.expenseNumber}</span>
          <span className="text-[10px] text-gray-400 font-medium">{formatDate(e.expenseDate)}</span>
        </div>
      )
    },
    {
      header: 'Category / Vendor',
      render: (e) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-800 text-sm">{e.categoryName}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{e.vendorName || 'Self'}</span>
        </div>
      )
    },
    {
      header: 'Total Amount',
      render: (e) => (
        <div className="flex flex-col">
          <span className="font-black text-gray-900">{formatCurrency(e.totalAmountMinor / 100)}</span>
          {e.paidAmountMinor > 0 && (
            <span className="text-[9px] text-green-600 font-bold">Paid: {formatCurrency(e.paidAmountMinor / 100)}</span>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      render: (e) => (
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${STATUS_COLORS[e.approvalStatus]}`}>
            {e.approvalStatus}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${STATUS_COLORS[e.paymentStatus]}`}>
            {e.paymentStatus}
          </span>
        </div>
      )
    },
    {
      header: 'Attachments',
      render: (e) => (
        <div className="flex -space-x-2">
          {(e.attachments || []).slice(0, 3).map((a, i) => (
            <div key={i} className="h-6 w-6 rounded-lg bg-gray-100 border border-white flex items-center justify-center overflow-hidden shadow-sm">
              <FileText size={12} className="text-gray-400" />
            </div>
          ))}
          {(e.attachments?.length > 3) && (
            <div className="h-6 w-6 rounded-lg bg-gray-50 border border-white flex items-center justify-center text-[8px] font-black text-gray-400 shadow-sm">
              +{e.attachments.length - 3}
            </div>
          )}
          {(!e.attachments || e.attachments.length === 0) && (
            <span className="text-[10px] text-gray-300 italic">None</span>
          )}
        </div>
      )
    },
    {
      header: 'Actions',
      render: (e) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(ev) => { ev.stopPropagation(); navigate(`/expenses/${e.id}`); }}
            className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={(ev) => { ev.stopPropagation(); navigate(`/expenses/edit/${e.id}`); }}
            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(ev) => { ev.stopPropagation(); /* Handle Delete */ }}
            className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  const exportCSV = () => {
    const headers = ["Expense No", "Date", "Category", "Vendor", "Amount", "Status", "Payment"];
    const rows = filteredData.map(e => [
      e.expenseNumber,
      formatDate(e.expenseDate),
      e.categoryName,
      e.vendorName,
      e.totalAmountMinor / 100,
      e.approvalStatus,
      e.paymentStatus
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `KrishiVishal_Expenses_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  return (
    <div className="space-y-10 pb-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Receipt className="mr-3 text-primary" size={32} />
            Expense Management
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11 italic">Production Operational Expenditure</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => generateExpenseReportPDF(filteredData, `Expense Report (${filters.approvalStatus})`)}
            className="flex items-center px-6 py-3 bg-white border border-gray-100 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm group"
          >
            <FileDown size={16} className="mr-2 group-hover:-translate-y-1 transition-transform" />
            Export PDF
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center px-6 py-3 bg-white border border-gray-100 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm group"
          >
            <Download size={16} className="mr-2 group-hover:-translate-y-1 transition-transform" />
            Export CSV
          </button>
          <button
            onClick={() => navigate('/expenses/new')}
            className="flex items-center px-6 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-800 transition-all shadow-lg shadow-green-100 group"
          >
            <Plus size={18} className="mr-2 group-hover:rotate-90 transition-transform" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <MetricCard key={i} {...m} value={m.value} />
        ))}
      </div>

      {/* Analytics Snapshot */}
      {expenses.length > 0 && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col">
               <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-8">Expense Distribution</h3>
               <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={categoryChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <YAxis hide />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={40}>
                           {categoryChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-[#1b5e20] p-10 rounded-[3rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden flex flex-col justify-center">
               <Receipt size={200} className="absolute -right-20 -bottom-20 opacity-5 rotate-12" />
               <div className="relative z-10 space-y-2">
                  <p className="text-[10px] font-black text-green-200 uppercase tracking-[0.3em]">Operational Health</p>
                  <h3 className="text-3xl font-black tracking-tighter">100% Verified</h3>
                  <p className="text-xs font-medium text-green-100/60 leading-relaxed uppercase">
                     All expenses are tracked with immutable audit logs and require multi-step approval for disbursement.
                  </p>
               </div>
            </div>
         </div>
      )}

      {/* Main List Section */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-green-100/10 overflow-hidden flex flex-col">
        {/* Filter Bar */}
        <div className="p-8 border-b border-gray-50 bg-white/50 backdrop-blur sticky top-0 z-10 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-3.5 text-gray-300" size={18} />
              <input
                type="text"
                placeholder="Search expense, vendor, invoice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none text-sm transition-all font-bold text-gray-700"
              />
            </div>

            <div className="flex items-center space-x-3 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
              <div className="flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100 space-x-2 shrink-0">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={filters.approvalStatus}
                  onChange={(e) => setFilters({...filters, approvalStatus: e.target.value})}
                  className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-gray-600"
                >
                  <option value="ALL">All Status</option>
                  {Object.values(APPROVAL_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100 space-x-2 shrink-0">
                <IndianRupee size={14} className="text-gray-400" />
                <select
                  value={filters.paymentStatus}
                  onChange={(e) => setFilters({...filters, paymentStatus: e.target.value})}
                  className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-gray-600"
                >
                  <option value="ALL">All Payment</option>
                  {Object.values(PAYMENT_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          onRowClick={(row) => navigate(`/expenses/${row.id}`)}
        />

        {/* Pagination Placeholder */}
        {!loading && filteredData.length > 0 && (
          <div className="p-6 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">
              Showing {filteredData.length} records
            </span>
            <div className="flex items-center space-x-2">
               <button className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-400 disabled:opacity-30" disabled>Previous</button>
               <button className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-700 shadow-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Expenses;

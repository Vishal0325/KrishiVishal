import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Scale,
  Plus,
  BookOpen,
  ArrowRightLeft,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  TrendingDown,
  X,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChartOfAccounts() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('ACCOUNTS'); // 'ACCOUNTS' | 'JOURNAL_VOUCHERS'
  const [accounts, setAccounts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Journal Voucher Form State
  const [jvForm, setJvForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reference: '',
    narration: '',
    debitAccount: '',
    creditAccount: '',
    amount: ''
  });

  // Default Standard Indian Chart of Accounts Master
  const defaultAccounts = [
    { code: '1001', name: 'HDFC Current Bank A/c', group: 'Current Assets (Bank)', type: 'ASSET', balance: 1450000 },
    { code: '1002', name: 'Cash in Hand (Hub Vault)', group: 'Current Assets (Cash)', type: 'ASSET', balance: 185000 },
    { code: '1003', name: 'Farmer Debtors Ledger', group: 'Sundry Debtors', type: 'ASSET', balance: 320000 },
    { code: '1004', name: 'Agri Stock-in-Trade', group: 'Closing Stock Inventory', type: 'ASSET', balance: 2840000 },
    { code: '2001', name: 'Fertilizer & Seed Suppliers', group: 'Sundry Creditors', type: 'LIABILITY', balance: 1980000 },
    { code: '2002', name: 'Output GST Payable (CGST+SGST)', group: 'Duties & Taxes', type: 'LIABILITY', balance: 142000 },
    { code: '2003', name: 'TDS Payable (Section 194Q/194C)', group: 'Duties & Taxes', type: 'LIABILITY', balance: 28500 },
    { code: '3001', name: 'Agricultural Direct Sales', group: 'Sales Accounts (Revenue)', type: 'INCOME', balance: 5400000 },
    { code: '4001', name: 'Cost of Goods Sold (Purchase)', group: 'Direct Expenses', type: 'EXPENSE', balance: 3950000 },
    { code: '4002', name: 'Fleet Delivery & Fuel Logistics', group: 'Direct Expenses', type: 'EXPENSE', balance: 285000 },
    { code: '4003', name: 'Hub Rent & Electricity Utilities', group: 'Indirect Expenses', type: 'EXPENSE', balance: 165000 },
    { code: '4004', name: 'Staff Salary & Workforce', group: 'Indirect Expenses', type: 'EXPENSE', balance: 340000 }
  ];

  // Fetch Journal Vouchers from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'journal_vouchers'), orderBy('createdAt', 'desc')),
      (snap) => {
        setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Post Balanced Journal Voucher
  const handleCreateVoucher = async (e) => {
    e.preventDefault();
    if (!jvForm.debitAccount || !jvForm.creditAccount || !jvForm.amount) {
      toast.error('Please select both Debit/Credit accounts and specify amount.');
      return;
    }
    if (jvForm.debitAccount === jvForm.creditAccount) {
      toast.error('Debit and Credit accounts must be different for double-entry.');
      return;
    }
    if (Number(jvForm.amount) <= 0) {
      toast.error('Voucher amount must be greater than zero.');
      return;
    }

    try {
      await addDoc(collection(db, 'journal_vouchers'), {
        voucherNumber: `JV-${Date.now().toString().slice(-6)}`,
        date: jvForm.date,
        reference: jvForm.reference || 'GENERAL-JV',
        narration: jvForm.narration || 'Balanced journal voucher posting',
        debitAccount: jvForm.debitAccount,
        creditAccount: jvForm.creditAccount,
        amount: Number(jvForm.amount),
        createdBy: user?.email || 'Admin',
        createdAt: Timestamp.now()
      });

      toast.success('Double-entry Journal Voucher posted successfully!');
      setIsModalOpen(false);
      setJvForm({
        date: new Date().toISOString().slice(0, 10),
        reference: '',
        narration: '',
        debitAccount: '',
        creditAccount: '',
        amount: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to post voucher.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1B365D] to-[#2E5B88] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Scale size={14} className="text-cyan-300" />
              Double-Entry General Ledger
            </div>
            <h2 className="text-2xl font-black">Chart of Accounts & Journal Vouchers</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Hierarchical Indian GAAP Ledger Tree, Balanced Debit-Credit Journal Vouchers (JV), and Contra transfers compliant with MCA requirements.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Post Journal Voucher (JV)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setActiveTab('ACCOUNTS')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'ACCOUNTS' ? 'bg-[#1B365D] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <BookOpen size={16} />
          <span>Chart of Accounts (COA Tree)</span>
        </button>
        <button
          onClick={() => setActiveTab('JOURNAL_VOUCHERS')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'JOURNAL_VOUCHERS' ? 'bg-[#1B365D] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <ArrowRightLeft size={16} />
          <span>Journal Vouchers ({vouchers.length})</span>
        </button>
      </div>

      {/* Account Tree View */}
      {activeTab === 'ACCOUNTS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-emerald-800 uppercase">Total Current Assets</span>
              <h4 className="text-2xl font-black text-emerald-950 mt-1">
                {formatCurrency(
                  defaultAccounts.filter(a => a.type === 'ASSET').reduce((acc, a) => acc + a.balance, 0)
                )}
              </h4>
              <p className="text-[11px] text-emerald-700 mt-1">Bank + Cash + Inventory + Debtors</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-rose-800 uppercase">Current Liabilities</span>
              <h4 className="text-2xl font-black text-rose-950 mt-1">
                {formatCurrency(
                  defaultAccounts.filter(a => a.type === 'LIABILITY').reduce((acc, a) => acc + a.balance, 0)
                )}
              </h4>
              <p className="text-[11px] text-rose-700 mt-1">Creditors + Taxes + TDS Payable</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-blue-800 uppercase">Revenue / Sales</span>
              <h4 className="text-2xl font-black text-blue-950 mt-1">
                {formatCurrency(
                  defaultAccounts.filter(a => a.type === 'INCOME').reduce((acc, a) => acc + a.balance, 0)
                )}
              </h4>
              <p className="text-[11px] text-blue-700 mt-1">Agri Direct Sales Turnover</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-amber-800 uppercase">Operating Expenses</span>
              <h4 className="text-2xl font-black text-amber-950 mt-1">
                {formatCurrency(
                  defaultAccounts.filter(a => a.type === 'EXPENSE').reduce((acc, a) => acc + a.balance, 0)
                )}
              </h4>
              <p className="text-[11px] text-amber-700 mt-1">COGS + Logistics + Salaries + Hub Rent</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Layers className="text-[#1B365D]" size={18} />
              Hierarchical Account Grouping
            </h3>
            <DataTable
              data={defaultAccounts}
              columns={[
                {
                  header: 'Account Code',
                  accessor: 'code',
                  render: (row) => <span className="font-mono font-bold text-gray-800">{row.code}</span>
                },
                {
                  header: 'Ledger Account Name',
                  accessor: 'name',
                  render: (row) => <span className="font-bold text-gray-900">{row.name}</span>
                },
                {
                  header: 'Primary Parent Group',
                  accessor: 'group',
                  render: (row) => (
                    <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-semibold text-gray-700">
                      {row.group}
                    </span>
                  )
                },
                {
                  header: 'Accounting Nature',
                  accessor: 'type',
                  render: (row) => {
                    const colors = {
                      ASSET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      LIABILITY: 'bg-rose-50 text-rose-700 border-rose-200',
                      INCOME: 'bg-blue-50 text-blue-700 border-blue-200',
                      EXPENSE: 'bg-amber-50 text-amber-700 border-amber-200'
                    };
                    return (
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${colors[row.type]}`}>
                        {row.type}
                      </span>
                    );
                  }
                },
                {
                  header: 'Current Ledger Balance',
                  accessor: 'balance',
                  render: (row) => (
                    <span className="font-black text-gray-900">{formatCurrency(row.balance)}</span>
                  )
                }
              ]}
            />
          </div>
        </div>
      )}

      {/* Journal Vouchers View */}
      {activeTab === 'JOURNAL_VOUCHERS' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <ArrowRightLeft className="text-[#1B365D]" size={18} />
              Manual & System Journal Vouchers (Double-Entry)
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {vouchers.length} Vouchers Recorded
            </span>
          </div>

          <DataTable
            data={vouchers}
            columns={[
              {
                header: 'Voucher Number',
                accessor: 'voucherNumber',
                render: (row) => <span className="font-mono font-bold text-gray-900">{row.voucherNumber}</span>
              },
              {
                header: 'Date',
                accessor: 'date',
                render: (row) => row.date || formatDateTime(row.createdAt)
              },
              {
                header: 'Debit Ledger (Dr)',
                accessor: 'debitAccount',
                render: (row) => (
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md text-xs border border-emerald-200">
                    Dr: {row.debitAccount}
                  </span>
                )
              },
              {
                header: 'Credit Ledger (Cr)',
                accessor: 'creditAccount',
                render: (row) => (
                  <span className="font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md text-xs border border-rose-200">
                    Cr: {row.creditAccount}
                  </span>
                )
              },
              {
                header: 'Amount',
                accessor: 'amount',
                render: (row) => <span className="font-black text-gray-900">{formatCurrency(row.amount)}</span>
              },
              {
                header: 'Narration',
                accessor: 'narration',
                render: (row) => <span className="text-xs text-gray-600 italic">{row.narration || '-'}</span>
              },
              {
                header: 'Posted By',
                accessor: 'createdBy',
                render: (row) => <span className="text-xs font-medium text-gray-500">{row.createdBy}</span>
              }
            ]}
          />
        </div>
      )}

      {/* Post JV Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Scale className="text-[#1B365D]" size={20} />
                Post Double-Entry Journal Voucher (JV)
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Voucher Date</label>
                  <input
                    type="date"
                    required
                    value={jvForm.date}
                    onChange={(e) => setJvForm({ ...jvForm, date: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1B365D]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Reference No / Bill #</label>
                  <input
                    type="text"
                    placeholder="e.g. ADJ-2026-09"
                    value={jvForm.reference}
                    onChange={(e) => setJvForm({ ...jvForm, reference: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1B365D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-emerald-800 mb-1">Debit Account (Dr - Receiver / Expense / Asset Increase)</label>
                <select
                  required
                  value={jvForm.debitAccount}
                  onChange={(e) => setJvForm({ ...jvForm, debitAccount: e.target.value })}
                  className="w-full bg-emerald-50/50 border border-emerald-200 rounded-xl p-2.5 font-bold text-gray-900 outline-none focus:border-emerald-600"
                >
                  <option value="">Select Debit Ledger...</option>
                  {defaultAccounts.map(a => (
                    <option key={a.code} value={a.name}>
                      [{a.code}] {a.name} ({a.group})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-rose-800 mb-1">Credit Account (Cr - Giver / Income / Asset Decrease)</label>
                <select
                  required
                  value={jvForm.creditAccount}
                  onChange={(e) => setJvForm({ ...jvForm, creditAccount: e.target.value })}
                  className="w-full bg-rose-50/50 border border-rose-200 rounded-xl p-2.5 font-bold text-gray-900 outline-none focus:border-rose-600"
                >
                  <option value="">Select Credit Ledger...</option>
                  {defaultAccounts.map(a => (
                    <option key={a.code} value={a.name}>
                      [{a.code}] {a.name} ({a.group})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Voucher Amount (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  placeholder="₹ 0.00"
                  value={jvForm.amount}
                  onChange={(e) => setJvForm({ ...jvForm, amount: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-black text-base text-gray-900 outline-none focus:border-[#1B365D]"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Narration (Detailed Note)</label>
                <textarea
                  rows="2"
                  placeholder="State the reason for this journal entry..."
                  value={jvForm.narration}
                  onChange={(e) => setJvForm({ ...jvForm, narration: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-medium text-gray-800 outline-none focus:border-[#1B365D]"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#1B365D] hover:bg-[#25497c] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Post Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

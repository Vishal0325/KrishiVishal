import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  updateDoc,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import {
  Gift,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Settings,
  ShieldCheck,
  Copy,
  ExternalLink,
  X,
  IndianRupee,
  Save,
  RefreshCw,
  UserCheck,
  Ban,
  Sliders,
  History,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  ALL: { label: 'All Referrals', color: 'bg-gray-100 text-gray-700' },
  SIGNED_UP: { label: 'Pending Order', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  REWARDED: { label: 'Rewarded', color: 'bg-green-50 text-green-700 border-green-200' },
  VOIDED: { label: 'Voided / Cancelled', color: 'bg-red-50 text-red-700 border-red-200' }
};

const Referrals = () => {
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'fraud', 'settings', 'transactions'
  const [referrals, setReferrals] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Referral for Drawer/Modal
  const [selectedReferral, setSelectedReferral] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    isEnabled: true,
    referrerRewardAmount: 50,
    refereeRewardAmount: 50,
    minOrderValue: 0,
    notes: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // 1. Subscribe to referrals collection
  useEffect(() => {
    const q = query(collection(db, 'referrals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReferrals(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching referrals:', error);
        toast.error('Failed to load referrals data');
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // 2. Subscribe to users collection (to enrich referrer & referee names/phones)
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setUsersMap(map);
      },
      (error) => {
        console.error('Error fetching users map:', error);
      }
    );
    return unsub;
  }, []);

  // 3. Subscribe to config/referralSettings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'referralSettings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            isEnabled: data.isEnabled !== false,
            referrerRewardAmount: data.referrerRewardAmount ?? 50,
            refereeRewardAmount: data.refereeRewardAmount ?? 50,
            minOrderValue: data.minOrderValue ?? 0,
            notes: data.notes || ''
          });
        }
        setSettingsLoading(false);
      },
      (error) => {
        console.error('Error fetching settings:', error);
        setSettingsLoading(false);
      }
    );
    return unsub;
  }, []);

  // 4. Subscribe to wallet_transactions for referral audit trail
  useEffect(() => {
    const q = query(collection(db, 'wallet_transactions'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const txList = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((tx) =>
            ['REFERRAL_SIGNUP_CREDIT', 'REFERRAL_CREDIT', 'REFERRAL_REVERSAL'].includes(tx.type)
          );
        setTransactions(txList);
        setTxLoading(false);
      },
      (error) => {
        console.error('Error fetching wallet transactions:', error);
        setTxLoading(false);
      }
    );
    return unsub;
  }, []);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = referrals.length;
    const rewarded = referrals.filter((r) => r.status === 'REWARDED');
    const signedUp = referrals.filter((r) => r.status === 'SIGNED_UP');
    const voided = referrals.filter((r) => r.status === 'VOIDED');

    // Total disbursed = referee rewards for all non-voided + referrer rewards for rewarded
    const totalDisbursed = referrals.reduce((acc, r) => {
      let sum = acc;
      if (r.status !== 'VOIDED') {
        sum += (r.refereeRewardAmount || 50);
      }
      if (r.status === 'REWARDED') {
        sum += (r.referrerRewardAmount || 50);
      }
      return sum;
    }, 0);

    // Total liability in wallets across all users
    const totalWalletLiability = Object.values(usersMap).reduce((acc, u) => {
      return acc + (typeof u.walletBalance === 'number' ? u.walletBalance : 0);
    }, 0);

    return {
      total,
      rewardedCount: rewarded.length,
      signedUpCount: signedUp.length,
      voidedCount: voided.length,
      totalDisbursed,
      totalWalletLiability
    };
  }, [referrals, usersMap]);

  // Filtered referrals list
  const filteredReferrals = useMemo(() => {
    return referrals.filter((item) => {
      // Status filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const code = (item.referralCode || '').toLowerCase();
        const referrerUser = usersMap[item.referrerUid];
        const refereeUser = usersMap[item.refereeUid];

        const referrerName = (referrerUser?.name || referrerUser?.displayName || '').toLowerCase();
        const referrerPhone = (referrerUser?.phone || referrerUser?.phoneNumber || '').toLowerCase();
        const refereeName = (refereeUser?.name || refereeUser?.displayName || '').toLowerCase();
        const refereePhone = (refereeUser?.phone || refereeUser?.phoneNumber || '').toLowerCase();
        const orderId = (item.referenceOrderId || '').toLowerCase();

        return (
          code.includes(term) ||
          item.referrerUid?.toLowerCase().includes(term) ||
          item.refereeUid?.toLowerCase().includes(term) ||
          referrerName.includes(term) ||
          referrerPhone.includes(term) ||
          refereeName.includes(term) ||
          refereePhone.includes(term) ||
          orderId.includes(term)
        );
      }

      return true;
    });
  }, [referrals, statusFilter, searchTerm, usersMap]);

  // Fraud / Voided list
  const fraudFlaggedList = useMemo(() => {
    return referrals.filter((r) => r.status === 'VOIDED' || r.voidReason);
  }, [referrals]);

  // Save Settings handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const payload = {
        isEnabled: Boolean(settings.isEnabled),
        referrerRewardAmount: Number(settings.referrerRewardAmount) || 50,
        refereeRewardAmount: Number(settings.refereeRewardAmount) || 50,
        minOrderValue: Number(settings.minOrderValue) || 0,
        notes: settings.notes || '',
        updatedAt: new Date()
      };

      await setDoc(doc(db, 'config', 'referralSettings'), payload, { merge: true });

      await addAuditLog('UPDATE_SETTINGS', 'Config', 'referralSettings', {
        action: 'Update Referral Settings',
        settings: payload
      });

      toast.success('Referral settings updated successfully!');
    } catch (err) {
      console.error('Error updating settings:', err);
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Helper to render user pill
  const renderUserPill = (uid) => {
    if (!uid) return <span className="text-gray-400 text-xs">None</span>;
    const u = usersMap[uid];
    const name = u?.name || u?.displayName || 'Farmer / Customer';
    const phone = u?.phone || u?.phoneNumber || '';
    return (
      <div className="flex flex-col">
        <span className="font-semibold text-gray-900 text-xs">{name}</span>
        <span className="text-[11px] text-gray-500 font-mono">
          {phone ? phone : `${uid.substring(0, 8)}...`}
        </span>
      </div>
    );
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'REWARDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={13} />
            Rewarded
          </span>
        );
      case 'SIGNED_UP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={13} />
            Pending 1st Order
          </span>
        );
      case 'VOIDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <Ban size={13} />
            Voided / Reversed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  // Table Columns
  const columns = [
    {
      header: 'Date',
      key: 'createdAt',
      sortable: true,
      render: (row) => (
        <span className="text-xs text-gray-600 font-medium">
          {formatDate(row.createdAt)}
        </span>
      )
    },
    {
      header: 'Code Used',
      key: 'referralCode',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
            {row.referralCode || 'N/A'}
          </span>
          {row.referralCode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(row.referralCode, 'Referral code');
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
              title="Copy Code"
            >
              <Copy size={12} />
            </button>
          )}
        </div>
      )
    },
    {
      header: 'Referrer (Advocate)',
      key: 'referrerUid',
      render: (row) => renderUserPill(row.referrerUid)
    },
    {
      header: 'Referee (Invited)',
      key: 'refereeUid',
      render: (row) => renderUserPill(row.refereeUid)
    },
    {
      header: 'Status',
      key: 'status',
      sortable: true,
      render: (row) => renderStatusBadge(row.status)
    },
    {
      header: 'Referrer Reward',
      key: 'referrerRewardAmount',
      render: (row) => (
        <span className="text-xs font-bold text-gray-900">
          ₹{row.referrerRewardAmount ?? 50}
        </span>
      )
    },
    {
      header: 'Referee Reward',
      key: 'refereeRewardAmount',
      render: (row) => (
        <span className="text-xs font-bold text-gray-900">
          ₹{row.refereeRewardAmount ?? 50}
        </span>
      )
    },
    {
      header: 'Order Reference',
      key: 'referenceOrderId',
      render: (row) =>
        row.referenceOrderId ? (
          <span className="font-mono text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
            #{row.referenceOrderId.substring(0, 8)}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Refer & Earn Program"
        subtitle="Track multi-sided referral incentives (₹50 + ₹50), anti-fraud verification, and wallet liabilities."
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm text-xs font-medium">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                settings.isEnabled ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>Program Status:</span>
            <strong className={settings.isEnabled ? 'text-green-700' : 'text-amber-700'}>
              {settings.isEnabled ? 'ACTIVE' : 'PAUSED'}
            </strong>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-all shadow-sm"
          >
            <Sliders size={14} />
            Configure
          </button>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Referrals Initiated"
          value={metrics.total.toString()}
          change={`${metrics.signedUpCount} Pending First Order`}
          icon={Gift}
          color="blue"
        />
        <MetricCard
          title="Completed & Rewarded"
          value={metrics.rewardedCount.toString()}
          change={`₹${metrics.rewardedCount * (settings.referrerRewardAmount || 50)} Referrer Payouts`}
          icon={CheckCircle2}
          color="green"
        />
        <MetricCard
          title="Total Wallet Liability"
          value={formatCurrency(metrics.totalWalletLiability)}
          change={`All Active Customer Wallets`}
          icon={IndianRupee}
          color="purple"
        />
        <MetricCard
          title="Voided / Flagged"
          value={metrics.voidedCount.toString()}
          change={metrics.voidedCount > 0 ? "Cancelled/Fraud reversals" : "All clean"}
          icon={AlertTriangle}
          color={metrics.voidedCount > 0 ? "red" : "green"}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'all'
                ? 'border-[#2e7d32] text-[#2e7d32]'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Users size={16} />
            All Referrals ({referrals.length})
          </button>

          <button
            onClick={() => setActiveTab('fraud')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'fraud'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <ShieldCheck size={16} />
            Fraud & Reversals ({fraudFlaggedList.length})
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'transactions'
                ? 'border-[#2e7d32] text-[#2e7d32]'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <History size={16} />
            Wallet Credits Audit
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'settings'
                ? 'border-[#2e7d32] text-[#2e7d32]'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Settings size={16} />
            Program Settings
          </button>
        </div>
      </div>

      {/* TAB 1: ALL REFERRALS TABLE */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Controls Bar: Search & Status Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by code, customer name, phone, or order ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {['ALL', 'REWARDED', 'SIGNED_UP', 'VOIDED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter === st
                      ? 'bg-green-700 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {STATUS_CONFIG[st]?.label || st}
                </button>
              ))}
            </div>
          </div>

          {/* Referrals Data Table */}
          <DataTable
            columns={columns}
            data={filteredReferrals}
            loading={loading}
            onRowClick={(row) => setSelectedReferral(row)}
            emptyTitle="No Referrals Found"
            emptyDescription="No referrals matched your search or status criteria."
          />
        </div>
      )}

      {/* TAB 2: FRAUD & VOIDED LOGS */}
      {activeTab === 'fraud' && (
        <div className="space-y-6">
          {/* Anti-fraud Overview Card */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <ShieldCheck size={22} />
              </div>
              <div className="text-sm">
                <h4 className="font-bold text-amber-900 mb-1">
                  Active Anti-Fraud Security Protections
                </h4>
                <p className="text-amber-800 leading-relaxed">
                  The backend enforces multiple safeguards: (1) <strong>Self-Referral Prevention</strong> (users cannot enter their own code), (2) <strong>FCM Device Token Match Detection</strong> (blocks users on the same physical device/app installation), (3) <strong>Single-Referral Guard</strong> (referees cannot be referred twice), and (4) <strong>Order Cancellation Reversal</strong> (if a qualifying first order is cancelled after delivery, referrer credits are automatically revoked).
                </p>
              </div>
            </div>
          </div>

          {/* Voided Referrals Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Reversed & Voided Referrals</h3>
                <p className="text-xs text-gray-500">
                  Referrals that were revoked due to order cancellations or suspicious device signatures.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-700 rounded-full border border-red-200">
                {fraudFlaggedList.length} Flagged / Reversed
              </span>
            </div>

            {fraudFlaggedList.length === 0 ? (
              <div className="p-12 text-center">
                <ShieldCheck className="mx-auto text-green-500 mb-3" size={40} />
                <h4 className="text-sm font-bold text-gray-800">Clean Audit Trail</h4>
                <p className="text-xs text-gray-500 mt-1">
                  No fraudulent or reversed referral operations have been detected.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Referral Code</th>
                      <th className="px-6 py-3">Referrer</th>
                      <th className="px-6 py-3">Referee</th>
                      <th className="px-6 py-3">Order ID</th>
                      <th className="px-6 py-3">Void Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {fraudFlaggedList.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-500">{formatDate(item.createdAt)}</td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">{item.referralCode}</td>
                        <td className="px-6 py-4">{renderUserPill(item.referrerUid)}</td>
                        <td className="px-6 py-4">{renderUserPill(item.refereeUid)}</td>
                        <td className="px-6 py-4 font-mono text-gray-600">
                          {item.referenceOrderId ? `#${item.referenceOrderId.substring(0, 8)}` : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded border border-red-200">
                            {item.voidReason || 'Order Cancelled after delivery'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: WALLET CREDITS AUDIT */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Referral Wallet Transaction Logs</h3>
              <p className="text-xs text-gray-500">
                Direct immutable ledger records in <code className="text-gray-700">wallet_transactions</code> credited for signups & deliveries.
              </p>
            </div>
            <span className="text-xs text-gray-500 font-medium">
              Showing last {transactions.length} events
            </span>
          </div>

          {txLoading ? (
            <div className="p-12 text-center text-gray-400">Loading ledger logs...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <History className="mx-auto text-gray-300 mb-3" size={36} />
              <h4 className="text-sm font-bold text-gray-800">No Transactions Yet</h4>
              <p className="text-xs text-gray-500 mt-1">
                Referral wallet credits will appear here as users sign up and complete their first orders.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Recipient Customer</th>
                    <th className="px-6 py-3">Credit Type</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Referral Ref</th>
                    <th className="px-6 py-3">Order Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-500">{formatDateTime(tx.createdAt)}</td>
                      <td className="px-6 py-4">{renderUserPill(tx.uid)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                            tx.type === 'REFERRAL_REVERSAL'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : tx.type === 'REFERRAL_CREDIT'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">
                        {tx.type === 'REFERRAL_REVERSAL' ? `-₹${tx.amount}` : `+₹${tx.amount}`}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-500">
                        {tx.referenceReferralId ? tx.referenceReferralId.substring(0, 8) + '...' : '—'}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-500">
                        {tx.referenceOrderId ? '#' + tx.referenceOrderId.substring(0, 8) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PROGRAM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="max-w-3xl bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Referral Program Configuration</h2>
              <p className="text-xs text-gray-500 mt-1">
                Saved directly to <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">config/referralSettings</code> and read in real time by Cloud Functions.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <p className="font-bold text-sm text-gray-900">Refer & Earn Program Active</p>
                <p className="text-xs text-gray-500">
                  When paused, users cannot enter referral codes during signup.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isEnabled}
                  onChange={(e) => setSettings({ ...settings, isEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2e7d32]"></div>
              </label>
            </div>

            {/* Reward Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Referrer Reward (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={settings.referrerRewardAmount}
                    onChange={(e) =>
                      setSettings({ ...settings, referrerRewardAmount: Number(e.target.value) })
                    }
                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Credited to referrer's wallet after referee's 1st order is DELIVERED.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Referee Welcome Reward (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={settings.refereeRewardAmount}
                    onChange={(e) =>
                      setSettings({ ...settings, refereeRewardAmount: Number(e.target.value) })
                    }
                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Credited immediately to referee's wallet upon entering valid code.
                </p>
              </div>
            </div>

            {/* Program Notes */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Internal Admin Notes / Policy Version
              </label>
              <textarea
                rows={3}
                value={settings.notes}
                onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                placeholder="e.g. FY26 Q1 Promotion — Double-sided ₹50 wallet credit"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
              />
            </div>

            {/* Save Button */}
            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2e7d32] text-white font-bold text-sm hover:bg-[#1b5e20] transition-all shadow-md disabled:opacity-50"
              >
                {savingSettings ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DETAIL MODAL / SLIDEOVER */}
      {selectedReferral && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setSelectedReferral(null)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 bg-green-50 text-green-700 rounded-xl">
                <Gift size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Referral Record Details</h3>
                <span className="font-mono text-xs text-gray-400">ID: {selectedReferral.id}</span>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-gray-50 rounded-xl flex items-center justify-between">
                <span className="text-gray-500 font-medium">Status</span>
                <div>{renderStatusBadge(selectedReferral.status)}</div>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Referral Code Used:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedReferral.referralCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created At:</span>
                  <span className="font-medium text-gray-900">{formatDateTime(selectedReferral.createdAt)}</span>
                </div>
                {selectedReferral.rewardedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rewarded At:</span>
                    <span className="font-medium text-green-700">{formatDateTime(selectedReferral.rewardedAt)}</span>
                  </div>
                )}
                {selectedReferral.referenceOrderId && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Triggering Order ID:</span>
                    <span className="font-mono font-bold text-blue-700">#{selectedReferral.referenceOrderId}</span>
                  </div>
                )}
              </div>

              {/* Referrer Box */}
              <div className="p-3.5 border border-gray-200 rounded-xl">
                <span className="text-gray-400 uppercase font-bold text-[10px] block mb-2">Referrer Details</span>
                <div className="flex items-center justify-between">
                  <div>{renderUserPill(selectedReferral.referrerUid)}</div>
                  <span className="text-right font-bold text-green-700">
                    Reward: ₹{selectedReferral.referrerRewardAmount ?? 50}
                  </span>
                </div>
              </div>

              {/* Referee Box */}
              <div className="p-3.5 border border-gray-200 rounded-xl">
                <span className="text-gray-400 uppercase font-bold text-[10px] block mb-2">Referee Details</span>
                <div className="flex items-center justify-between">
                  <div>{renderUserPill(selectedReferral.refereeUid)}</div>
                  <span className="text-right font-bold text-blue-700">
                    Signup Bonus: ₹{selectedReferral.refereeRewardAmount ?? 50}
                  </span>
                </div>
              </div>

              {selectedReferral.voidReason && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-red-700 uppercase font-bold text-[10px] block mb-1">Revocation Reason</span>
                  <p className="text-red-800 font-medium">{selectedReferral.voidReason}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedReferral(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Referrals;

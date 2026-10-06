import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import {
  Users,
  Award,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  Search,
  Filter,
  Download,
  IndianRupee,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  MapPin,
  CreditCard,
  PhoneCall
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import toast from 'react-hot-toast';

const KYC_TABS = [
  { id: 'ALL', label: 'All Mitras' },
  { id: 'PENDING', label: 'Pending KYC' },
  { id: 'VERIFIED', label: 'Verified Mitras' },
  { id: 'REJECTED', label: 'Rejected KYC' }
];

export default function KisanMitraManagement() {
  const [mitras, setMitras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedHub, setSelectedHub] = useState('all');

  // KYC Modal State
  const [activeMitra, setActiveMitra] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingKyc, setProcessingKyc] = useState(false);

  // Subscribe to vle_profiles collection in real-time
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'vle_profiles'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setMitras(docs);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching VLE profiles:', error);
        toast.error('Failed to load Kisan Mitra records');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filtered VLE list
  const filteredMitras = useMemo(() => {
    return mitras.filter((m) => {
      const matchKyc = activeTab === 'ALL' || m.kycStatus === activeTab;
      const matchHub = selectedHub === 'all' || m.hubId === selectedHub;

      const name = m.name || '';
      const phone = m.phone || '';
      const code = m.vleCode || '';
      const village = m.village || '';
      const panchayat = m.panchayat || '';

      const matchSearch =
        searchTerm === '' ||
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        phone.includes(searchTerm) ||
        code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        village.toLowerCase().includes(searchTerm.toLowerCase()) ||
        panchayat.toLowerCase().includes(searchTerm.toLowerCase());

      return matchKyc && matchHub && matchSearch;
    });
  }, [mitras, activeTab, selectedHub, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = mitras.length;
    const active = mitras.filter((m) => m.status === 'ACTIVE').length;
    const pendingKyc = mitras.filter((m) => m.kycStatus === 'PENDING').length;
    const totalGmv = mitras.reduce((sum, m) => sum + (Number(m.totalGmvGenerated) || 0), 0);
    const totalCommission = mitras.reduce((sum, m) => sum + (Number(m.totalCommissionEarned) || 0), 0);

    return {
      total,
      active,
      pendingKyc,
      totalGmv,
      totalCommission
    };
  }, [mitras]);

  // Handle KYC verification
  const handleVerifyKyc = async (status) => {
    if (!activeMitra) return;
    try {
      setProcessingKyc(true);
      toast.loading(`Updating KYC to ${status}...`, { id: 'vle-kyc' });

      // Call Cloud Function or direct update with server timestamp
      try {
        const verifyFn = httpsCallable(functions, 'verifyVleKyc');
        await verifyFn({
          vleId: activeMitra.vleId || activeMitra.id,
          status: status,
          rejectionReason: status === 'REJECTED' ? rejectionReason : ''
        });
      } catch (fnErr) {
        // Fallback direct Firestore update if callable unavailable
        const docRef = doc(db, 'vle_profiles', activeMitra.vleId || activeMitra.id);
        await updateDoc(docRef, {
          kycStatus: status,
          rejectionReason: status === 'REJECTED' ? rejectionReason : null,
          verifiedAt: serverTimestamp()
        });
      }

      toast.success(`Kisan Mitra KYC marked as ${status}!`, { id: 'vle-kyc' });
      setActiveMitra(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Error updating VLE KYC:', err);
      toast.error(err.message || 'Failed to update KYC status', { id: 'vle-kyc' });
    } finally {
      setProcessingKyc(false);
    }
  };

  // Export CSV for NEFT / IMPS Bank Payout Batch
  const handleExportPayoutBatch = () => {
    const eligibleMitras = mitras.filter((m) => (Number(m.walletBalance) || 0) > 0);
    if (eligibleMitras.length === 0) {
      toast.error('No Kisan Mitras with positive matured payout balance.');
      return;
    }

    const headers = [
      'Beneficiary Name',
      'Account Number',
      'IFSC Code',
      'Bank Name',
      'Payout Amount (INR)',
      'VLE Code',
      'Mobile Number',
      'Narration'
    ];

    const rows = eligibleMitras.map((m) => {
      const b = m.bankDetails || {};
      return [
        `"${b.holderName || m.name || ''}"`,
        `"${b.accountNumber || ''}"`,
        `"${b.ifsc || ''}"`,
        `"${b.bankName || ''}"`,
        m.walletBalance || 0,
        `"${m.vleCode || ''}"`,
        `"${m.phone || ''}"`,
        `"KrishiVishal Mitra Commission ${m.vleCode || ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kisan_mitra_payout_batch.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${eligibleMitras.length} VLE payout entries to CSV!`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Kisan Mitra & VLE Commission Network"
        subtitle="Manage rural village entrepreneurs, assisted ordering, category commission slabs, and bank payouts"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPayoutBatch}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Download size={14} />
            Export NEFT Payout Batch
          </button>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Kisan Mitras"
          value={metrics.active.toString()}
          icon={<Users className="text-blue-500" size={22} />}
          subtext={`Total registered: ${metrics.total}`}
        />
        <MetricCard
          title="Village GMV Generated"
          value={`₹${metrics.totalGmv.toLocaleString('en-IN')}`}
          icon={<TrendingUp className="text-emerald-500" size={22} />}
          subtext="Assisted Orders Delivered"
        />
        <MetricCard
          title="Total Commission Earned"
          value={`₹${metrics.totalCommission.toLocaleString('en-IN')}`}
          icon={<Award className="text-amber-500" size={22} />}
          subtext="2% - 5% Rural Slab Cuts"
        />
        <MetricCard
          title="Pending KYC Approvals"
          value={metrics.pendingKyc.toString()}
          icon={<Clock className="text-purple-500" size={22} />}
          subtext="Aadhaar / Bank Verification"
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
            {KYC_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, VLE code, village..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mitras Directory Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold text-xs uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="py-3.5 px-4">Kisan Mitra Details</th>
                <th className="py-3.5 px-4">Location / Spoke Hub</th>
                <th className="py-3.5 px-4">Total GMV (Sales)</th>
                <th className="py-3.5 px-4">Commission Wallet</th>
                <th className="py-3.5 px-4 text-center">KYC Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                    Loading Kisan Mitra directory...
                  </td>
                </tr>
              ) : filteredMitras.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    <Users className="inline-block mb-2 text-gray-300" size={32} />
                    <p className="font-medium text-gray-600">No Kisan Mitras found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      New rural entrepreneur registrations will appear here automatically.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMitras.map((m) => {
                  const bank = m.bankDetails || {};
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Mitra Details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{m.name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold">
                            {m.vleCode || 'NO-CODE'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                          <span>{m.phone}</span>
                          {m.panNumber && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span className="text-gray-400">PAN: {m.panNumber}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 text-xs text-gray-800 font-medium">
                          <MapPin size={13} className="text-emerald-600 shrink-0" />
                          <span>{m.village}{m.panchayat ? `, ${m.panchayat}` : ''}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Hub: {m.hubId || 'hub_central_samastipur'}
                        </div>
                      </td>

                      {/* GMV */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-900 text-xs">
                          ₹{(Number(m.totalGmvGenerated) || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-gray-400">Assisted Purchases</div>
                      </td>

                      {/* Commission */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-emerald-700 text-xs">
                          ₹{(Number(m.walletBalance) || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Lifetime: ₹{(Number(m.totalCommissionEarned) || 0).toLocaleString('en-IN')}
                        </div>
                      </td>

                      {/* KYC Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            m.kycStatus === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : m.kycStatus === 'REJECTED'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {m.kycStatus || 'PENDING'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => setActiveMitra(m)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Review KYC
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KYC Verification & Details Modal */}
      {activeMitra && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Kisan Mitra KYC Verification
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mitra: {activeMitra.name} ({activeMitra.vleCode})
                </p>
              </div>
              <button
                onClick={() => setActiveMitra(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Profile Details */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">
                  Personal & Village Details
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-600">
                  <div><span className="text-gray-400">Mobile:</span> {activeMitra.phone}</div>
                  <div><span className="text-gray-400">Hub:</span> {activeMitra.hubId}</div>
                  <div><span className="text-gray-400">Village:</span> {activeMitra.village}</div>
                  <div><span className="text-gray-400">Panchayat:</span> {activeMitra.panchayat || 'N/A'}</div>
                  <div><span className="text-gray-400">PIN Code:</span> {activeMitra.pincode}</div>
                  <div><span className="text-gray-400">PAN:</span> {activeMitra.panNumber || 'Not provided'}</div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1.5">
                <div className="font-semibold text-emerald-800 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                  <CreditCard size={13} />
                  Bank Account for Commission Payout
                </div>
                <div className="grid grid-cols-2 gap-2 text-emerald-950 font-mono">
                  <div><span className="text-emerald-700 font-sans">A/C Holder:</span> {activeMitra.bankDetails?.holderName || activeMitra.name}</div>
                  <div><span className="text-emerald-700 font-sans">Bank:</span> {activeMitra.bankDetails?.bankName || 'Bank'}</div>
                  <div><span className="text-emerald-700 font-sans">Account No:</span> {activeMitra.bankDetails?.accountNumber || 'N/A'}</div>
                  <div><span className="text-emerald-700 font-sans">IFSC Code:</span> {activeMitra.bankDetails?.ifsc || 'N/A'}</div>
                </div>
              </div>

              {/* Commission Slabs Preview */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1">
                <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">
                  Configured Commission Rates
                </div>
                <div className="flex gap-4 text-gray-600 font-medium">
                  <span>Fertilizer: 1.5%</span>
                  <span>Seeds: 3.5%</span>
                  <span>Pesticide: 5.0%</span>
                  <span>Default: 2.5%</span>
                </div>
              </div>

              {/* Rejection Reason Input */}
              <div>
                <label className="text-gray-500 font-medium">Rejection Reason (If rejecting):</label>
                <input
                  type="text"
                  placeholder="e.g. Invalid IFSC Code or PAN mismatch"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleVerifyKyc('REJECTED')}
                disabled={processingKyc}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                Reject KYC
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveMitra(null)}
                  className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyKyc('VERIFIED')}
                  disabled={processingKyc}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {processingKyc ? 'Updating...' : 'Approve & Verify KYC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

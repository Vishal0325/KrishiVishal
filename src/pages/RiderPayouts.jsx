import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ArrowUpRight,
  Truck,
  Weight,
  Compass,
  AlertTriangle,
  UserCheck,
  ChevronRight,
  FileSpreadsheet
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import toast from 'react-hot-toast';

const HUBS = [
  { id: 'all', name: 'All 55 Regional Hubs' },
  { id: 'HUB-SAM-001', name: 'Samastipur Central Hub (Mother)' },
  { id: 'hub_central_samastipur', name: 'Samastipur Central Hub' },
  { id: 'REG-RAH-002', name: 'Rahika Spoke Hub (Madhubani)' },
  { id: 'REG-KHA-003', name: 'Kalyanpur Spoke Hub' },
  { id: 'REG-TAJ-004', name: 'Tajpur Spoke Hub' }
];

export default function RiderPayouts() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedPayout, setSelectedPayout] = useState(null);

  // Date range state (default to previous 7 days)
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Action loaders
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  // Subscribe to rider_payouts in real-time
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'rider_payouts'), orderBy('generatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setPayouts(docs);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to rider_payouts:', error);
        toast.error('Failed to load rider payouts');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered payouts
  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      const matchHub = selectedHub === 'all' || p.hubId === selectedHub;
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchSearch =
        searchTerm === '' ||
        (p.riderName && p.riderName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.riderId && p.riderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.payoutId && p.payoutId.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchHub && matchStatus && matchSearch;
    });
  }, [payouts, selectedHub, statusFilter, searchTerm]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let totalDisbursed = 0;
    let pendingApproval = 0;
    let onHoldMismatch = 0;
    let totalTrips = 0;

    filteredPayouts.forEach((p) => {
      const amount = Number(p.netPayable || 0);
      totalTrips += Number(p.deliveredOrdersCount || p.totalOrders || 0);
      if (p.status === 'PAID') {
        totalDisbursed += amount;
      } else if (p.status === 'ON_HOLD_CASH_MISMATCH') {
        onHoldMismatch += amount;
      } else {
        pendingApproval += amount;
      }
    });

    return {
      totalDisbursed,
      pendingApproval,
      onHoldMismatch,
      totalTrips,
      count: filteredPayouts.length
    };
  }, [filteredPayouts]);

  // Handler: Generate Weekly Batch via Cloud Function
  const handleGenerateWeeklyBatch = async () => {
    const targetHub = selectedHub === 'all' ? 'hub_central_samastipur' : selectedHub;
    try {
      setGenerating(true);
      toast.loading(`Calculating weekly payouts for ${targetHub}...`, { id: 'gen-payout' });
      const generateFn = httpsCallable(functions, 'generateWeeklyRiderPayouts');
      const res = await generateFn({
        hubId: targetHub,
        startDate,
        endDate
      });

      toast.success(
        `Batch generated: ${res.data?.totalRidersProcessed || 0} rider payouts computed!`,
        { id: 'gen-payout' }
      );
    } catch (err) {
      console.error('Error generating weekly payouts:', err);
      toast.error(err.message || 'Failed to generate payout batch', { id: 'gen-payout' });
    } finally {
      setGenerating(false);
    }
  };

  // Handler: Approve Payout via Cloud Function
  const handleApprovePayout = async (payout) => {
    if (payout.status === 'ON_HOLD_CASH_MISMATCH') {
      toast.error('Cannot approve payout: Cash reconciliation is blocked due to unverified cash!');
      return;
    }

    try {
      setApprovingId(payout.payoutId || payout.id);
      toast.loading('Processing approval & posting double-entry ledger...', { id: 'approve-payout' });
      const approveFn = httpsCallable(functions, 'approveRiderPayout');
      await approveFn({
        payoutId: payout.payoutId || payout.id,
        paymentMode: 'NEFT',
        referenceNo: `NEFT_${Date.now()}`
      });

      toast.success(`Payout approved and ledger debited for ₹${payout.netPayable}!`, {
        id: 'approve-payout'
      });
      if (selectedPayout && selectedPayout.id === payout.id) {
        setSelectedPayout(null);
      }
    } catch (err) {
      console.error('Error approving payout:', err);
      toast.error(err.message || 'Failed to approve payout', { id: 'approve-payout' });
    } finally {
      setApprovingId(null);
    }
  };

  // Handler: Export Bank NEFT/UPI CSV
  const handleExportBankCsv = () => {
    if (filteredPayouts.length === 0) {
      toast.error('No payout records to export');
      return;
    }

    const headers = [
      'Beneficiary Name',
      'Rider ID',
      'Hub ID',
      'Net Payable Amount (INR)',
      'Gross Earnings',
      'Penalties',
      'Status',
      'Settlement Verified',
      'Start Date',
      'End Date',
      'Payout ID'
    ];

    const rows = filteredPayouts.map((p) => [
      `"${p.riderName || 'Rider'}"`,
      `"${p.riderId}"`,
      `"${p.hubId}"`,
      p.netPayable || 0,
      p.grossEarnings || 0,
      p.penalties || 0,
      `"${p.status}"`,
      p.settlementVerified ? 'YES' : 'NO',
      `"${p.startDate || ''}"`,
      `"${p.endDate || ''}"`,
      `"${p.payoutId || p.id}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `KrishiVishal_Rider_Payouts_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('NEFT/UPI Bank Payout CSV downloaded successfully!');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Rider Payout & Commission Engine"
        subtitle="Automated weekly earnings calculation, COD cash settlement lock, and double-entry ledger integration"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportBankCsv}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            <Download size={16} />
            Export Bank CSV (NEFT/UPI)
          </button>
          <button
            onClick={handleGenerateWeeklyBatch}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Calculating Batch...' : 'Generate Weekly Batch'}
          </button>
        </div>
      </PageHeader>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Disbursed (Paid)"
          value={`₹${metrics.totalDisbursed.toLocaleString('en-IN')}`}
          icon={<CheckCircle2 className="text-emerald-500" size={24} />}
          subtext="Processed & Debited in Ledger"
        />
        <MetricCard
          title="Pending Approval"
          value={`₹${metrics.pendingApproval.toLocaleString('en-IN')}`}
          icon={<Banknote className="text-amber-500" size={24} />}
          subtext="Cash Settled & Ready for Release"
        />
        <MetricCard
          title="Blocked (Cash Mismatch)"
          value={`₹${metrics.onHoldMismatch.toLocaleString('en-IN')}`}
          icon={<ShieldAlert className="text-rose-500" size={24} />}
          subtext="Held until COD Handshake matches"
        />
        <MetricCard
          title="Total Trips Delivered"
          value={metrics.totalTrips.toString()}
          icon={<Truck className="text-blue-500" size={24} />}
          subtext="Base ₹30 + Heavy + Distance"
        />
      </div>

      {/* Filters & Range Picker */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Hub Selector */}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <Filter size={16} className="text-gray-400" />
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-700 outline-none"
            >
              {HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-700 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending Approval (Ready)</option>
              <option value="ON_HOLD_CASH_MISMATCH">On Hold (Cash Blocked)</option>
              <option value="PAID">Paid & Disbursed</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-xs text-gray-400 font-semibold uppercase">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent outline-none text-gray-700 text-sm"
            />
            <span className="text-xs text-gray-400 font-semibold uppercase ml-2">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent outline-none text-gray-700 text-sm"
            />
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search rider name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold text-xs uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="py-3.5 px-4">Rider Info</th>
                <th className="py-3.5 px-4">Hub / Date Range</th>
                <th className="py-3.5 px-4 text-center">Trips Delivered</th>
                <th className="py-3.5 px-4">Earnings Breakdown</th>
                <th className="py-3.5 px-4">Deductions</th>
                <th className="py-3.5 px-4 text-right">Net Payable</th>
                <th className="py-3.5 px-4 text-center">Cash Handshake</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-gray-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                    Loading rider payouts...
                  </td>
                </tr>
              ) : filteredPayouts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-gray-400">
                    <FileSpreadsheet className="inline-block mb-2 text-gray-300" size={32} />
                    <p className="font-medium text-gray-600">No payout records found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Click "Generate Weekly Batch" above to run automatic calculations.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPayouts.map((p) => {
                  const isBlocked = p.status === 'ON_HOLD_CASH_MISMATCH' || !p.settlementVerified;
                  const isPaid = p.status === 'PAID';
                  const isApproving = approvingId === (p.payoutId || p.id);

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Rider */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-900">{p.riderName || 'Rider'}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.riderId}</div>
                      </td>

                      {/* Hub & Dates */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-gray-800">{p.hubId}</div>
                        <div className="text-[11px] text-gray-400">
                          {p.startDate} to {p.endDate}
                        </div>
                      </td>

                      {/* Trips */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {p.deliveredOrdersCount ?? p.totalOrders ?? 0} Orders
                        </span>
                      </td>

                      {/* Earnings Breakdown */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs text-gray-700 space-y-0.5">
                          <div>Base: ₹{p.baseEarnings || 0}</div>
                          <div className="text-emerald-600 font-medium">
                            Heavy (+₹15): ₹{p.heavyAllowances || 0}
                          </div>
                          <div className="text-indigo-600 font-medium">
                            Distance (+₹5/km): ₹{p.distanceSurcharges || 0}
                          </div>
                        </div>
                      </td>

                      {/* Deductions / Penalties */}
                      <td className="py-3.5 px-4">
                        {p.penalties > 0 ? (
                          <div className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                            <AlertTriangle size={13} />
                            -₹{p.penalties} (Fake Attempt)
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">₹0</span>
                        )}
                      </td>

                      {/* Net Payable */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-gray-900 text-base">
                          ₹{Number(p.netPayable || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Gross: ₹{p.grossEarnings || 0}
                        </div>
                      </td>

                      {/* Cash Handshake Status */}
                      <td className="py-3.5 px-4 text-center">
                        {p.settlementVerified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <ShieldAlert size={12} />
                            Cash Pending
                          </span>
                        )}
                      </td>

                      {/* Payout Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Paid (Disbursed)
                          </span>
                        ) : isBlocked ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Blocked (Mismatch)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Approval
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => setSelectedPayout(p)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          Details
                        </button>
                        {!isPaid && (
                          <button
                            onClick={() => handleApprovePayout(p)}
                            disabled={isBlocked || isApproving}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              isBlocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-primary hover:bg-primary-dark text-white shadow-sm'
                            }`}
                          >
                            {isApproving ? 'Approving...' : 'Approve'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Slide-over Drawer / Modal */}
      {selectedPayout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">
                  Payout Breakdown: {selectedPayout.riderName}
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  {selectedPayout.payoutId || selectedPayout.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedPayout(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Financial Summary Grid */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl text-center">
                <div>
                  <div className="text-xs text-gray-400 uppercase font-semibold">Gross Earned</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    ₹{selectedPayout.grossEarnings || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase font-semibold">Penalties</div>
                  <div className="text-lg font-bold text-rose-600 mt-1">
                    -₹{selectedPayout.penalties || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase font-semibold">Net Payable</div>
                  <div className="text-lg font-bold text-primary mt-1">
                    ₹{selectedPayout.netPayable || 0}
                  </div>
                </div>
              </div>

              {/* Cash Settlement Status Notice */}
              {!selectedPayout.settlementVerified && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                  <ShieldAlert className="text-rose-600 mt-0.5 shrink-0" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-rose-800">
                      Cash Handshake Incomplete — Release Blocked
                    </h4>
                    <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                      This rider has pending COD orders or an unconfirmed physical cash settlement.
                      Payout release is strictly locked until the Hub Manager executes
                      confirmCashSettlement.
                    </p>
                  </div>
                </div>
              )}

              {/* Order Trips List */}
              <div>
                <h4 className="text-xs uppercase font-bold text-gray-400 mb-3 tracking-wider">
                  Delivered Consignments ({selectedPayout.orders?.length || 0})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedPayout.orders && selectedPayout.orders.length > 0 ? (
                    selectedPayout.orders.map((ord, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-gray-50/70 border border-gray-100 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold text-gray-800">
                            {ord.orderId || ord.id}
                          </span>
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px]">
                            {ord.status}
                          </span>
                          <div className="text-gray-400 text-[11px] mt-0.5">
                            Weight: {ord.totalWeight || ord.totalWeightKg || 0} kg | Distance:{' '}
                            {ord.distanceKm || 0} km | Mode:{' '}
                            {ord.isCod ? 'COD' : ord.paymentMethod || 'PREPAID'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900">
                            +₹{ord.grossEarning ?? (ord.baseEarning + (ord.heavyAllowance || 0) + (ord.distanceSurcharge || 0))}
                          </div>
                          {ord.penalty > 0 && (
                            <div className="text-rose-600 font-medium text-[11px]">
                              -₹{ord.penalty} penalty
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 italic">No detailed order log stored.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedPayout(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Close
              </button>
              {selectedPayout.status !== 'PAID' && (
                <button
                  onClick={() => handleApprovePayout(selectedPayout)}
                  disabled={!selectedPayout.settlementVerified}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
                >
                  Approve & Release ₹{selectedPayout.netPayable}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

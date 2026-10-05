import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import {
  ClipboardCheck,
  Barcode,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Download,
  Building2,
  Archive,
  EyeOff,
  Layers,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  XCircle,
  FileCheck
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import toast from 'react-hot-toast';

const HUBS = [
  { id: 'HUB-SAM-001', name: 'Samastipur Central Hub (Mother)' },
  { id: 'hub_central_samastipur', name: 'Samastipur Central Hub' },
  { id: 'REG-RAH-002', name: 'Rahika Spoke Hub (Madhubani)' },
  { id: 'REG-KHA-003', name: 'Kalyanpur Spoke Hub' },
  { id: 'REG-TAJ-004', name: 'Tajpur Spoke Hub' }
];

const CATEGORIES = [
  { id: 'ALL', name: 'All Categories' },
  { id: 'FERTILIZER', name: 'Fertilizers & Nutrition' },
  { id: 'SEEDS', name: 'Certified Crop Seeds' },
  { id: 'PESTICIDES', name: 'Agrochemicals & Crop Protection' },
  { id: 'HARDWARE', name: 'Agri Equipment & Tools' }
];

export default function InventoryAudit() {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSession, setActiveSession] = useState(null);

  // New Audit Modal State
  const [showStartModal, setShowStartModal] = useState(false);
  const [modalHub, setModalHub] = useState('hub_central_samastipur');
  const [modalCategory, setModalCategory] = useState('ALL');
  const [startingAudit, setStartingAudit] = useState(false);

  // Physical Count Entry State (Blind Audit)
  const [countedItems, setCountedItems] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualBatch, setManualBatch] = useState('DEFAULT');
  const [manualQty, setManualQty] = useState('');
  const [manualCondition, setManualCondition] = useState('GOOD');

  // Submitting / Reconciling loaders
  const [submittingCounts, setSubmittingCounts] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // Variance view
  const [varianceData, setVarianceData] = useState(null);

  // Listen to audit_sessions collection
  useEffect(() => {
    setLoadingSessions(true);
    const q = query(collection(db, 'audit_sessions'), orderBy('startedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setSessions(docs);
        setLoadingSessions(false);

        // If an active session is loaded, sync its latest doc
        if (activeSession) {
          const updated = docs.find((d) => d.id === activeSession.id);
          if (updated) {
            setActiveSession(updated);
            if (updated.status === 'COMPLETED' && updated.varianceReport) {
              setVarianceData({
                varianceReport: updated.varianceReport,
                totalShortageValue: updated.totalShortageValue || 0,
                totalSurplusValue: updated.totalSurplusValue || 0,
                requiresDebitNote: updated.requiresDebitNote || false,
                debitNoteId: updated.debitNoteId || null
              });
            }
          }
        }
      },
      (err) => {
        console.error('Error fetching audit_sessions:', err);
        toast.error('Failed to load audit sessions');
        setLoadingSessions(false);
      }
    );

    return () => unsubscribe();
  }, [activeSession?.id]);

  // Aggregate Metrics across sessions
  const metrics = useMemo(() => {
    let completedCount = 0;
    let totalShortage = 0;
    let criticalEscalations = 0;

    sessions.forEach((s) => {
      if (s.status === 'COMPLETED') completedCount++;
      totalShortage += Number(s.totalShortageValue || 0);
      if (s.requiresDebitNote) criticalEscalations++;
    });

    return {
      activeAudits: sessions.filter((s) => s.status === 'IN_PROGRESS').length,
      completedAudits: completedCount,
      totalShortageLoss: totalShortage,
      criticalEscalations
    };
  }, [sessions]);

  // Handler: Start New Blind Audit Session
  const handleStartAuditSession = async () => {
    try {
      setStartingAudit(true);
      toast.loading('Freezing system snapshot and initializing blind session...', {
        id: 'start-audit'
      });
      const startFn = httpsCallable(functions, 'startHubAuditSession');
      const res = await startFn({
        hubId: modalHub,
        category: modalCategory
      });

      const session = res.data;
      setActiveSession({
        id: session.sessionId,
        ...session
      });
      setCountedItems([]);
      setVarianceData(null);
      setShowStartModal(false);
      toast.success(
        `Blind Audit session ${session.sessionId} started! Live system quantities hidden.`,
        { id: 'start-audit' }
      );
    } catch (err) {
      console.error('Error starting audit session:', err);
      toast.error(err.message || 'Failed to start audit session', { id: 'start-audit' });
    } finally {
      setStartingAudit(false);
    }
  };

  // Handler: Add or update counted item
  const handleAddCountedItem = (e) => {
    if (e) e.preventDefault();
    const sku = (barcodeInput || manualSku).trim();
    if (!sku) {
      toast.error('Please enter or scan SKU code');
      return;
    }
    const qty = Number(manualQty);
    if (isNaN(qty) || qty < 0) {
      toast.error('Please enter valid physical quantity');
      return;
    }

    setCountedItems((prev) => {
      const existingIdx = prev.findIndex(
        (i) => i.skuCode === sku && i.batchNumber === manualBatch
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          countedQty: qty,
          condition: manualCondition
        };
        return updated;
      }
      return [
        ...prev,
        {
          skuCode: sku,
          batchNumber: manualBatch || 'DEFAULT',
          countedQty: qty,
          condition: manualCondition
        }
      ];
    });

    setBarcodeInput('');
    setManualSku('');
    setManualQty('');
    setManualCondition('GOOD');
    toast.success(`Recorded ${qty} units for SKU ${sku}`);
  };

  // Handler: Submit Counts & Trigger Reconciliation
  const handleSubmitAndReconcile = async () => {
    if (!activeSession) return;
    if (countedItems.length === 0) {
      toast.error('Please scan and enter at least one counted SKU.');
      return;
    }

    try {
      setSubmittingCounts(true);
      toast.loading('Submitting blind physical counts to backend...', { id: 'recon-audit' });

      // 1. Submit counts
      const submitFn = httpsCallable(functions, 'submitAuditCounts');
      await submitFn({
        sessionId: activeSession.id || activeSession.sessionId,
        items: countedItems
      });

      // 2. Reconcile
      toast.loading('Comparing with frozen snapshot & updating warehouse stock...', {
        id: 'recon-audit'
      });
      const reconcileFn = httpsCallable(functions, 'reconcileAuditSession');
      const reconRes = await reconcileFn({
        sessionId: activeSession.id || activeSession.sessionId
      });

      setVarianceData(reconRes.data);
      toast.success(
        `Audit reconciled successfully! Shortage: ₹${reconRes.data.totalShortageValue || 0}`,
        { id: 'recon-audit' }
      );
    } catch (err) {
      console.error('Error submitting/reconciling audit:', err);
      toast.error(err.message || 'Failed to reconcile audit', { id: 'recon-audit' });
    } finally {
      setSubmittingCounts(false);
    }
  };

  // Handler: Download Sign-off CSV / PDF Report
  const handleDownloadReport = () => {
    if (!varianceData || !varianceData.varianceReport) {
      toast.error('No reconciliation report available');
      return;
    }

    const headers = [
      'SKU Code',
      'Batch Number',
      'Product Name',
      'System Qty',
      'Physical Counted',
      'Variance',
      'Condition',
      'Landing Cost (INR)',
      'Financial Impact (INR)',
      'Audit Status'
    ];

    const rows = varianceData.varianceReport.map((r) => [
      `"${r.skuCode}"`,
      `"${r.batchNumber || 'DEFAULT'}"`,
      `"${r.productName || r.skuCode}"`,
      r.systemQty,
      r.countedQty,
      r.variance,
      `"${r.condition || 'GOOD'}"`,
      r.landingCost || 0,
      r.financialImpact || 0,
      `"${r.status}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        `# KrishiVishal WMS Spoke Cycle Count Sign-Off Report`,
        `# Session: ${activeSession?.id || activeSession?.sessionId} | Hub: ${activeSession?.hubId}`,
        `# Total Shortage: INR ${varianceData.totalShortageValue || 0} | Debit Note: ${varianceData.debitNoteId || 'NONE'}`,
        '',
        headers.join(','),
        ...rows.map((e) => e.join(','))
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Audit_Signoff_${activeSession?.hubId}_${activeSession?.id || 'session'}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Audit Sign-off report downloaded!');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Spoke Hub Cycle Counting & Inventory Audit"
        subtitle="Blind physical counts, variance reconciliation, damaged quarantine isolation, and hub liability debit notes"
      >
        <button
          onClick={() => setShowStartModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
        >
          <Plus size={16} />
          Start New Blind Audit
        </button>
      </PageHeader>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Blind Audits"
          value={metrics.activeAudits.toString()}
          icon={<ClipboardCheck className="text-amber-500" size={24} />}
          subtext="In progress across hubs"
        />
        <MetricCard
          title="Completed Audits"
          value={metrics.completedAudits.toString()}
          icon={<FileCheck className="text-emerald-500" size={24} />}
          subtext="Reconciled & digital stock synced"
        />
        <MetricCard
          title="Discrepancy Losses"
          value={`₹${metrics.totalShortageLoss.toLocaleString('en-IN')}`}
          icon={<TrendingDown className="text-rose-500" size={24} />}
          subtext="Shortage across audits"
        />
        <MetricCard
          title="Manager Debit Notes"
          value={metrics.criticalEscalations.toString()}
          icon={<ShieldAlert className="text-rose-600" size={24} />}
          subtext="Shortage > ₹1,000 threshold"
        />
      </div>

      {/* Active Audit Session Workspace */}
      {activeSession ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-lg">
                  Audit Session: {activeSession.id || activeSession.sessionId}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {activeSession.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Hub: <span className="font-semibold text-gray-700">{activeSession.hubId}</span> |
                Category: <span className="font-semibold text-gray-700">{activeSession.category}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setActiveSession(null);
                  setVarianceData(null);
                }}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back to Session List
              </button>
              {varianceData && (
                <button
                  onClick={handleDownloadReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  <Download size={14} />
                  Download Sign-off CSV
                </button>
              )}
            </div>
          </div>

          {/* Blind Audit Notice Banner */}
          {activeSession.status === 'IN_PROGRESS' && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <EyeOff className="text-blue-600 mt-0.5 shrink-0" size={20} />
              <div>
                <h4 className="text-sm font-bold text-blue-900">
                  Blind Physical Audit Active — Tamper-Proof Mode
                </h4>
                <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
                  System snapshot quantities are intentionally hidden from this screen to prevent
                  auditor bias. Scan barcodes or enter the physical inventory counted on warehouse racks.
                  System variances will be revealed once counts are submitted.
                </p>
              </div>
            </div>
          )}

          {/* Barcode & Physical Count Entry Bar (when IN_PROGRESS) */}
          {activeSession.status === 'IN_PROGRESS' && (
            <form
              onSubmit={handleAddCountedItem}
              className="bg-gray-50/80 border border-gray-200 rounded-xl p-4 space-y-3"
            >
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Barcode Scanner & Physical Count Entry
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {/* SKU Code */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    SKU Code / Barcode
                  </label>
                  <div className="relative mt-1">
                    <Barcode
                      size={16}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Scan SKU barcode..."
                      value={barcodeInput || manualSku}
                      onChange={(e) => {
                        setBarcodeInput(e.target.value);
                        setManualSku(e.target.value);
                      }}
                      className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-xl outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Batch Number */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    Batch Number
                  </label>
                  <input
                    type="text"
                    placeholder="BATCH_01"
                    value={manualBatch}
                    onChange={(e) => setManualBatch(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl outline-none focus:border-primary"
                  />
                </div>

                {/* Counted Quantity */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    Physical Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Units counted"
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl outline-none focus:border-primary"
                  />
                </div>

                {/* Condition */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    Physical Condition
                  </label>
                  <select
                    value={manualCondition}
                    onChange={(e) => setManualCondition(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl outline-none focus:border-primary"
                  >
                    <option value="GOOD">Good (Sellable)</option>
                    <option value="DAMAGED">Damaged / Leaked</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                </div>

                {/* Add Button */}
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm rounded-xl shadow-sm transition-all"
                  >
                    + Record Item
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Scanned Items List (Before reconciliation) */}
          {activeSession.status === 'IN_PROGRESS' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Physical Scans Recorded ({countedItems.length})
                </h4>
                <button
                  onClick={handleSubmitAndReconcile}
                  disabled={submittingCounts || countedItems.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {submittingCounts
                    ? 'Reconciling Stock...'
                    : 'Submit Physical Counts & Reconcile'}
                </button>
              </div>

              {countedItems.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400">
                  <Barcode className="mx-auto mb-2 text-gray-300" size={32} />
                  <p className="font-medium text-gray-600">No items recorded yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Scan items or use the form above to add physical counts.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">SKU Code</th>
                        <th className="py-2.5 px-4">Batch Number</th>
                        <th className="py-2.5 px-4 text-center">Physical Count</th>
                        <th className="py-2.5 px-4 text-center">Condition</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {countedItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-mono font-medium text-gray-900">
                            {item.skuCode}
                          </td>
                          <td className="py-2.5 px-4 text-gray-600 font-mono text-xs">
                            {item.batchNumber}
                          </td>
                          <td className="py-2.5 px-4 text-center font-bold text-gray-900">
                            {item.countedQty}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.condition === 'GOOD'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {item.condition}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() =>
                                setCountedItems((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Variance Report Section (Shown when COMPLETED or Reconciled) */}
          {varianceData && (
            <div className="space-y-6 pt-4">
              {/* Critical Alert & Debit Note Banner if Shortage > ₹1,000 */}
              {varianceData.requiresDebitNote ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="text-rose-600 mt-1 shrink-0" size={24} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-rose-900 text-sm">
                        Critical Shortage Alert: Hub Liability Debit Note Generated
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 font-mono text-xs font-bold">
                        {varianceData.debitNoteId}
                      </span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Inventory shortage of ₹
                      {Number(varianceData.totalShortageValue || 0).toLocaleString('en-IN')} exceeds
                      the ₹1,000 statutory liability threshold. A debit note has been issued to the
                      Hub Manager and escalated to the Admin Alert room.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      Audit Reconciled — Discrepancies within Allowable Limits
                    </h4>
                    <p className="text-xs text-emerald-700">
                      Digital stock has been synced with physical count. No debit notes required.
                    </p>
                  </div>
                </div>
              )}

              {/* Financial Variance Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-200">
                  <div className="text-xs text-gray-500 font-semibold uppercase">
                    Total Shortage Impact
                  </div>
                  <div className="text-xl font-bold text-rose-600 mt-1">
                    -₹{Number(varianceData.totalShortageValue || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-200">
                  <div className="text-xs text-gray-500 font-semibold uppercase">
                    Total Surplus Inward
                  </div>
                  <div className="text-xl font-bold text-blue-600 mt-1">
                    +₹{Number(varianceData.totalSurplusValue || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-200">
                  <div className="text-xs text-gray-500 font-semibold uppercase">
                    Digital Stock Sync Status
                  </div>
                  <div className="text-base font-bold text-emerald-600 mt-1">
                    100% Updated & Locked
                  </div>
                </div>
              </div>

              {/* Variance Detail Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">SKU / Product</th>
                      <th className="py-3 px-4">Batch</th>
                      <th className="py-3 px-4 text-center">System Qty</th>
                      <th className="py-3 px-4 text-center">Counted Qty</th>
                      <th className="py-3 px-4 text-center">Variance</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Financial Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {varianceData.varianceReport &&
                      varianceData.varianceReport.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">
                              {row.productName || row.skuCode}
                            </div>
                            <div className="text-xs text-gray-400 font-mono">{row.skuCode}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-gray-600">
                            {row.batchNumber || 'DEFAULT'}
                          </td>
                          <td className="py-3 px-4 text-center font-medium text-gray-700">
                            {row.systemQty}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-gray-900">
                            {row.countedQty}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`font-bold ${
                                row.variance < 0
                                  ? 'text-rose-600'
                                  : row.variance > 0
                                  ? 'text-blue-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {row.variance > 0 ? `+${row.variance}` : row.variance}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                row.status === 'PASSED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : row.status === 'QUARANTINED'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : row.status === 'SHORTAGE'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {row.financialImpact > 0 ? (
                              <span
                                className={
                                  row.status === 'SHORTAGE' ? 'text-rose-600' : 'text-blue-600'
                                }
                              >
                                {row.status === 'SHORTAGE' ? '-' : '+'}₹
                                {row.financialImpact.toLocaleString('en-IN')}
                              </span>
                            ) : (
                              <span className="text-gray-400">₹0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Sessions History Table */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">Audit Sessions History</h3>
            <span className="text-xs text-gray-400">{sessions.length} total sessions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-semibold text-xs uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-3.5 px-4">Session ID</th>
                  <th className="py-3.5 px-4">Hub ID</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Shortage Loss</th>
                  <th className="py-3.5 px-4 text-center">Manager Liability</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingSessions ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-gray-400">
                      <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                      Loading audit sessions...
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-gray-400">
                      <Archive className="inline-block mb-2 text-gray-300" size={32} />
                      <p className="font-medium text-gray-600">No audit sessions recorded</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Click "Start New Blind Audit" to freeze stock and begin physical counting.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-gray-900">
                        {s.id || s.sessionId}
                      </td>
                      <td className="py-3.5 px-4 text-gray-700 font-medium">{s.hubId}</td>
                      <td className="py-3.5 px-4 text-gray-600 text-xs">{s.category || 'ALL'}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            s.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium">
                        {s.totalShortageValue > 0 ? (
                          <span className="text-rose-600">
                            -₹{Number(s.totalShortageValue).toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-gray-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {s.requiresDebitNote ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <ShieldAlert size={12} />
                            Debit Note Issued
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Normal</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setActiveSession(s);
                            if (s.status === 'COMPLETED' && s.varianceReport) {
                              setVarianceData({
                                varianceReport: s.varianceReport,
                                totalShortageValue: s.totalShortageValue || 0,
                                totalSurplusValue: s.totalSurplusValue || 0,
                                requiresDebitNote: s.requiresDebitNote || false,
                                debitNoteId: s.debitNoteId || null
                              });
                            } else {
                              setVarianceData(null);
                            }
                          }}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          {s.status === 'COMPLETED' ? 'View Report' : 'Resume Audit'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Start New Audit Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Start New Spoke Blind Audit</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              This action will freeze live digital inventory for the selected hub and initiate a
              blind audit session. System counts will not be revealed until physical scans are
              submitted.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Select Hub</label>
                <select
                  value={modalHub}
                  onChange={(e) => setModalHub(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary"
                >
                  {HUBS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Product Category
                </label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => setShowStartModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleStartAuditSession}
                disabled={startingAudit}
                className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50 transition-all"
              >
                {startingAudit ? 'Freezing Snapshot...' : 'Confirm & Start Blind Audit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

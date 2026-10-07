import React, { useState, useEffect } from "react";
import { 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  FileText, 
  RefreshCw, 
  ArrowRight,
  TrendingUp,
  Receipt,
  Scale,
  Building2,
  DollarSign
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { 
  fetchFiscalPeriods, 
  runMonthEndChecklist, 
  lockFiscalPeriod, 
  unlockFiscalPeriod 
} from "../../services/financeService";
import { useAuth } from "../../hooks/useAuth";
import toast from "react-hot-toast";

export default function PeriodCloseDesk() {
  const { user, role } = useAuth();
  const isSuperAdminOrCfo = role === "SuperAdmin" || role === "FinanceAdmin";

  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(false);

  // Lock Wizard Modal States
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [lockNotes, setLockNotes] = useState("");
  const [locking, setLocking] = useState(false);

  // Unlock Modal States
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const data = await fetchFiscalPeriods(12);
      setPeriods(data || []);
    } catch (err) {
      console.error("Error loading fiscal periods:", err);
      toast.error("Failed to load fiscal periods");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  // Open Lock Wizard
  const handleOpenLockWizard = async (p) => {
    setSelectedPeriod(p);
    setLockNotes("");
    setLockModalOpen(true);
    setChecklistLoading(true);
    try {
      const res = await runMonthEndChecklist(p.periodId);
      setChecklist(res);
    } catch (err) {
      console.error("Error running checklist:", err);
      toast.error("Failed to execute month-end pre-lock checklist");
    } finally {
      setChecklistLoading(false);
    }
  };

  // Submit Lock
  const handleConfirmLock = async () => {
    if (!checklist?.canLock) {
      toast.error("All pre-lock checks must pass before freezing the period.");
      return;
    }

    setLocking(true);
    try {
      await lockFiscalPeriod({
        periodId: selectedPeriod.periodId,
        lockedBy: user?.email || user?.displayName || "FinanceAdmin",
        lockNotes: lockNotes.trim() || "Standard CA Month-End Close"
      });

      toast.success(`Period ${selectedPeriod.periodId} successfully LOCKED`);
      setLockModalOpen(false);
      setSelectedPeriod(null);
      loadPeriods();
    } catch (err) {
      console.error("Error locking period:", err);
      toast.error(`Lock failed: ${err.message}`);
    } finally {
      setLocking(false);
    }
  };

  // Open Unlock Modal
  const handleOpenUnlockModal = (p) => {
    setSelectedPeriod(p);
    setUnlockReason("");
    setUnlockModalOpen(true);
  };

  // Submit Unlock
  const handleConfirmUnlock = async () => {
    if (!unlockReason || unlockReason.trim().length < 5) {
      toast.error("Please enter a valid statutory reason (min 5 chars) for unlocking.");
      return;
    }

    setUnlocking(true);
    try {
      await unlockFiscalPeriod({
        periodId: selectedPeriod.periodId,
        unlockedBy: user?.email || user?.displayName || "SuperAdmin",
        unlockReason: unlockReason.trim()
      });

      toast.success(`Period ${selectedPeriod.periodId} UNLOCKED. Audit log registered.`);
      setUnlockModalOpen(false);
      setSelectedPeriod(null);
      loadPeriods();
    } catch (err) {
      console.error("Error unlocking period:", err);
      toast.error(`Unlock failed: ${err.message}`);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="Month-End Closing & Fiscal Period Lock Desk"
        subtitle="Companies Act 2013 & CA Statutory Audit freeze: Lock completed periods to prevent backdated invoices, credit notes, and ledger tampering."
      >
        <button
          onClick={loadPeriods}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-[#0B4D31]" : ""} />
          <span>Refresh</span>
        </button>
      </PageHeader>

      {/* Statutory Guidance Banner */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-emerald-950">
        <ShieldCheck className="text-emerald-700 shrink-0 mt-0.5" size={20} />
        <div className="text-xs">
          <span className="font-bold text-sm block mb-0.5">
            Statutory Period Lock Rules (Rule 46 CGST & Ind AS 115)
          </span>
          <span>
            Once a period is <strong>LOCKED</strong>, all accounting entries (Sales, Invoices, AP, TDS, COD Settlements, and Credit Notes) are permanently immutable. Any post-close adjustments must be booked in subsequent active periods via Credit Note or Adjustment Journal.
          </span>
        </div>
      </div>

      {/* Periods Register Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[#0B4D31]" />
            <h2 className="text-sm font-black text-gray-900">Fiscal Periods Master (Last 12 Months)</h2>
          </div>
          <span className="text-xs text-gray-400 font-medium">Auto-derived by General Ledger Engine</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Fiscal Period</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Invoiced Revenue (₹)</th>
                <th className="py-3 px-4 text-center">Total Orders</th>
                <th className="py-3 px-4">Locked / Sign-Off By</th>
                <th className="py-3 px-4">Audit Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {periods.map((p) => {
                const isLocked = p.status === "LOCKED";
                return (
                  <tr key={p.periodId} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-900 text-sm">
                      {p.periodId}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                          <Lock size={11} /> LOCKED 🔒
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          <Unlock size={11} /> ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900">
                      ₹{Number(p.closureMetrics?.totalRevenue || p.totalRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-gray-700">
                      {p.closureMetrics?.totalOrders || p.totalOrders || 48}
                    </td>
                    <td className="py-3.5 px-4 text-gray-700">
                      {isLocked ? (
                        <div>
                          <div className="font-bold text-gray-900">{p.lockedBy || "FinanceAdmin"}</div>
                          <div className="text-[10px] text-gray-400">
                            {p.lockedAt ? new Date(p.lockedAt?.seconds ? p.lockedAt.seconds * 1000 : p.lockedAt).toLocaleDateString() : "Close Verified"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Open for Postings</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 max-w-xs truncate" title={p.lockNotes || ""}>
                      {p.lockNotes || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isLocked ? (
                        isSuperAdminOrCfo && (
                          <button
                            onClick={() => handleOpenUnlockModal(p)}
                            className="px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Unlock (Emergency)
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleOpenLockWizard(p)}
                          className="px-3 py-1.5 bg-[#0B4D31] text-white hover:bg-[#083a25] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5 ml-auto"
                        >
                          <Lock size={12} />
                          <span>Close & Lock Month</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {periods.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-gray-400">
                    {loading ? "Loading fiscal periods..." : "No fiscal periods recorded."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: MONTH-END CLOSE & LOCK WIZARD */}
      {lockModalOpen && selectedPeriod && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Lock size={18} className="text-[#0B4D31]" />
                  Month-End Closing Wizard: {selectedPeriod.periodId}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automated Pre-Close Statutory Checklist (Ind AS / Companies Act 2013)
                </p>
              </div>
            </div>

            {/* Step 1: Automated Verification Checklist */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                1. Automated Statutory Audit Checks
              </span>

              {checklistLoading ? (
                <div className="p-6 text-center text-gray-500 text-xs font-bold flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-[#0B4D31]" />
                  Running automated general ledger audits...
                </div>
              ) : checklist?.checks ? (
                <div className="space-y-2">
                  {checklist.checks.map((chk) => (
                    <div 
                      key={chk.id} 
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                        chk.passed ? "bg-green-50/60 border-green-200" : "bg-red-50/60 border-red-200"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          {chk.passed ? (
                            <CheckCircle2 size={14} className="text-green-600" />
                          ) : (
                            <AlertTriangle size={14} className="text-red-600" />
                          )}
                          <span>{chk.name}</span>
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5 pl-5">
                          {chk.details}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        chk.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {chk.passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Step 2: Sign-Off Remarks */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                2. CA / Finance Sign-Off Notes
              </label>
              <textarea
                value={lockNotes}
                onChange={(e) => setLockNotes(e.target.value)}
                placeholder="e.g., Audited by CA Sharma & Co. - Final GSTR-1 reconciled and books locked."
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-[#0B4D31]"
              />
            </div>

            {/* Step 3: Statutory Warning Banner */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
              <span className="font-bold block mb-0.5">⚠️ Finality & Audit Warning:</span>
              Once locked, no user or script can post backdated invoices, credit notes, or entries into {selectedPeriod.periodId}.
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLockModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLock}
                disabled={locking || checklistLoading || !checklist?.canLock}
                className="px-4 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-bold hover:bg-[#083a25] shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Lock size={13} />
                <span>{locking ? "Locking..." : "Confirm & Freeze Period"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EMERGENCY UNLOCK MODAL */}
      {unlockModalOpen && selectedPeriod && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2 text-amber-900">
              <Unlock size={18} className="text-amber-600" />
              Emergency Unlock: {selectedPeriod.periodId}
            </h3>
            <p className="text-xs text-gray-500">
              Unlocking a locked financial period requires a documented statutory justification for the immutable audit trail.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Statutory Reason for Unlocking (Mandatory)
                </label>
                <textarea
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g., GST portal rectification order or CA audit query adjustment."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-amber-600"
                  required
                />
              </div>

              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-red-900 text-[11px]">
                An immutable audit entry will be recorded in <code className="font-bold">audit_logs</code> with your identity and reason.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnlockModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                disabled={unlocking}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {unlocking ? "Unlocking..." : "Confirm Emergency Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

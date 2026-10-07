import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Building2, 
  DollarSign, 
  UserCheck, 
  FileText, 
  RefreshCw, 
  ArrowRight,
  Scale,
  CreditCard,
  Eye,
  Check,
  X
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { fetchApprovalRequests, reviewApprovalRequest } from "../../services/financeService";
import { useAuth } from "../../hooks/useAuth";
import toast from "react-hot-toast";

export default function ApprovalsDesk() {
  const { user, role } = useAuth();
  const isCheckerAuthorized = ["SuperAdmin", "CFO", "Director"].includes(role);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Review Modal States
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await fetchApprovalRequests(statusFilter);
      setRequests(data || []);
    } catch (err) {
      console.error("Error loading approval requests:", err);
      toast.error("Failed to load approval requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const pendingCount = requests.filter(r => r.status === "PENDING").length;
  const approvedCount = requests.filter(r => r.status === "APPROVED").length;
  const rejectedCount = requests.filter(r => r.status === "REJECTED").length;

  const handleOpenReview = (req) => {
    // Check Segregation of Duties (SoD) locally as well
    if (user?.uid && user.uid === req.maker?.uid) {
      toast.error("SoD Restriction: You are the Maker of this request and cannot review it.");
      return;
    }
    setSelectedReq(req);
    setRemarks("");
    setReviewModalOpen(true);
  };

  const handleAction = async (action) => {
    if (action === "REJECT" && (!remarks || remarks.trim().length < 3)) {
      toast.error("A documented reason (remarks) is mandatory when rejecting a request.");
      return;
    }

    setSubmitting(true);
    try {
      await reviewApprovalRequest({
        requestId: selectedReq.requestId || selectedReq.id,
        checker: {
          uid: user?.uid || "CHECKER_UID",
          email: user?.email || "cfo@krishivishal.com",
          role: role || "CFO"
        },
        action,
        remarks: remarks.trim() || (action === "APPROVE" ? "Approved by CFO" : "Rejected")
      });

      toast.success(`Request ${selectedReq.requestId} ${action === "APPROVE" ? "APPROVED & EXECUTED" : "REJECTED"}`);
      setReviewModalOpen(false);
      setSelectedReq(null);
      loadRequests();
    } catch (err) {
      console.error("Error reviewing request:", err);
      toast.error(`Action failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (typeFilter === "ALL") return true;
    return r.requestType === typeFilter;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="Maker-Checker Dual Authorization Desk"
        subtitle="Four-Eyes Internal Financial Controls (IFC): Independent CFO / Director sign-off required for high-risk bank updates and large vendor payments."
      >
        <button
          onClick={loadRequests}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-[#0B4D31]" : ""} />
          <span>Refresh</span>
        </button>
      </PageHeader>

      {/* Segregation of Duties Guidance Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-950">
        <ShieldCheck className="text-amber-700 shrink-0 mt-0.5" size={20} />
        <div className="text-xs">
          <span className="font-bold text-sm block mb-0.5">
            Internal Financial Controls (SoD) Active
          </span>
          <span>
            Under Section 134(5)(e) of the Companies Act 2013, <strong>Makers cannot approve their own transactions</strong>. High-value disbursements (&gt; ₹50,000) and supplier bank beneficiary alterations are held in suspense until a designated Checker (CFO / Director) verifies source documentation.
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-gray-400 block">Pending Review</span>
            <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
            <span className="text-[11px] text-gray-500 font-medium mt-1 block">Awaiting Dual-Authorization</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-gray-400 block">Approved & Executed</span>
            <p className="text-2xl font-black text-emerald-800 mt-1">{approvedCount}</p>
            <span className="text-[11px] text-emerald-600 font-bold mt-1 block">Atomic Ledger Settled</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-gray-400 block">Rejected / Withheld</span>
            <p className="text-2xl font-black text-red-600 mt-1">{rejectedCount}</p>
            <span className="text-[11px] text-gray-500 font-medium mt-1 block">Audit Flagged</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center">
            <XCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter("PENDING")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "PENDING" ? "bg-[#0B4D31] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("APPROVED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "APPROVED" ? "bg-[#0B4D31] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "ALL" ? "bg-[#0B4D31] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Requests
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 bg-white outline-none cursor-pointer"
          >
            <option value="ALL">All Types</option>
            <option value="SUPPLIER_BANK_UPDATE">Supplier Bank Updates</option>
            <option value="HIGH_VALUE_PAYMENT">High-Value Payments (&gt; ₹50,000)</option>
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Request ID & Type</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Maker (Initiator)</th>
                <th className="py-3 px-4">Change Summary</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {filteredRequests.map((r) => {
                const isPending = r.status === "PENDING";
                const isBank = r.requestType === "SUPPLIER_BANK_UPDATE";
                return (
                  <tr key={r.id || r.requestId} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-emerald-900">{r.requestId || r.id}</div>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                        isBank ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                      }`}>
                        {isBank ? "Bank Detail Change" : "High-Value Payment"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{r.entityName || r.entityId}</div>
                      <div className="text-[10px] text-gray-400 font-mono">ID: {r.entityId}</div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-700">
                      <div className="font-bold text-gray-900">{r.maker?.email || "Accountant"}</div>
                      <div className="text-[10px] text-gray-400 font-mono">Role: {r.maker?.role || "Maker"}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {isBank ? (
                        <div className="text-xs">
                          <span className="text-gray-500 font-mono">A/c: </span>
                          <span className="font-bold font-mono text-gray-900">{r.payload?.accountNumber}</span>
                          <span className="text-gray-400 font-mono text-[10px] block">IFSC: {r.payload?.ifsc} ({r.payload?.beneficiaryName})</span>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <span className="font-black text-gray-900 font-mono">₹{Number(r.payload?.amount || 0).toLocaleString("en-IN")}</span>
                          <span className="text-gray-400 font-mono text-[10px] block">Ref: {r.payload?.invoiceId} (UTR: {r.payload?.utrRef || "Pending"})</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {r.status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle2 size={11} /> Approved
                        </span>
                      ) : r.status === "REJECTED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                          <XCircle size={11} /> Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={11} /> Pending Review
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isPending ? (
                        <button
                          onClick={() => handleOpenReview(r)}
                          className="px-3 py-1.5 bg-[#0B4D31] text-white hover:bg-[#083a25] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5 ml-auto"
                        >
                          <Eye size={13} />
                          <span>Review Request</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-mono">Resolved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-gray-400">
                    No approval requests found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIFF & REVIEW MODAL */}
      {reviewModalOpen && selectedReq && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#0B4D31]" />
                  Dual-Authorization Review: {selectedReq.requestId}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Initiated by {selectedReq.maker?.email} ({selectedReq.maker?.role})
                </p>
              </div>
            </div>

            {/* DIFF VIEW: CASE 1 (BANK UPDATE) */}
            {selectedReq.requestType === "SUPPLIER_BANK_UPDATE" && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  Proposed Bank Details Alteration (Before vs After)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Before */}
                  <div className="p-4 bg-red-50/60 rounded-xl border border-red-200 text-xs space-y-1.5">
                    <span className="font-bold text-red-800 uppercase text-[10px] block">Current Verified Account</span>
                    <div><span className="text-gray-500">A/c No:</span> <strong className="font-mono text-gray-900">{selectedReq.payload?.currentBank?.accountNumber || "XXXX1234"}</strong></div>
                    <div><span className="text-gray-500">IFSC:</span> <strong className="font-mono text-gray-900">{selectedReq.payload?.currentBank?.ifsc || "SBIN0001234"}</strong></div>
                    <div><span className="text-gray-500">Beneficiary:</span> <span className="text-gray-800">{selectedReq.payload?.currentBank?.beneficiaryName || "IFFCO OLD ACCOUNT"}</span></div>
                    <div><span className="text-gray-500">Bank:</span> <span className="text-gray-800">{selectedReq.payload?.currentBank?.bankName || "State Bank of India"}</span></div>
                  </div>

                  {/* After */}
                  <div className="p-4 bg-green-50/60 rounded-xl border border-green-200 text-xs space-y-1.5">
                    <span className="font-bold text-green-800 uppercase text-[10px] block">Proposed New Account</span>
                    <div><span className="text-gray-500">A/c No:</span> <strong className="font-mono text-green-950">{selectedReq.payload?.accountNumber}</strong></div>
                    <div><span className="text-gray-500">IFSC:</span> <strong className="font-mono text-green-950">{selectedReq.payload?.ifsc}</strong></div>
                    <div><span className="text-gray-500">Beneficiary:</span> <span className="text-gray-900 font-bold">{selectedReq.payload?.beneficiaryName}</span></div>
                    <div><span className="text-gray-500">Bank:</span> <span className="text-gray-800">{selectedReq.payload?.bankName || "HDFC Bank"}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* DIFF VIEW: CASE 2 (HIGH-VALUE PAYMENT) */}
            {selectedReq.requestType === "HIGH_VALUE_PAYMENT" && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  High-Value Supplier Payment Authorization (&gt; ₹50,000)
                </span>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Supplier Name:</span>
                    <strong className="text-gray-900">{selectedReq.entityName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice Reference:</span>
                    <strong className="font-mono text-gray-900">{selectedReq.payload?.invoiceId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gross Invoice Value:</span>
                    <span className="font-mono">₹{Number(selectedReq.payload?.grossAmount || selectedReq.payload?.amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TDS Withheld (Sec 194Q):</span>
                    <span className="font-mono text-orange-700">-₹{Number(selectedReq.payload?.tdsAmount || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 text-sm font-black text-gray-900">
                    <span>Net Disbursable Amount:</span>
                    <span className="font-mono text-emerald-800">₹{Number(selectedReq.payload?.amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                    <span>Debit Account:</span>
                    <span className="font-mono">2010_ACCOUNTS_PAYABLE_SUPPLIERS</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Credit Account:</span>
                    <span className="font-mono">1030_BANK_CURRENT_HDFC</span>
                  </div>
                </div>
              </div>
            )}

            {/* Remarks Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                Checker Review Notes / Statutory Justification
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter audit remarks (mandatory if rejecting)..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-[#0B4D31]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAction("REJECT")}
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X size={14} />
                  <span>Reject Request</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAction("APPROVE")}
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-bold hover:bg-[#083a25] shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{submitting ? "Executing..." : "Approve & Execute"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

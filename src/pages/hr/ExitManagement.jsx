import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import { 
  getExitRequests, 
  createExitRequest, 
  updateExitChecklist, 
  finalizeExit 
} from "../../services/hrExtendedService";
import { getEmployees } from "../../services/workforceService";
import {
  LogOut,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  User,
  DollarSign,
  X,
  FileText
} from "lucide-react";

const ExitManagement = () => {
  const [exits, setExits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [selectedExit, setSelectedExit] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [newExit, setNewExit] = useState({
    employeeId: "",
    employeeName: "",
    department: "",
    exitType: "Voluntary Resignation", // Voluntary Resignation, Termination, Absconding, Contract Expiry
    resignationDate: new Date().toISOString().split("T")[0],
    lastWorkingDay: "",
    reason: "",
  });

  const [checklist, setChecklist] = useState({
    assetsReturned: false,
    idBadgeReturned: false,
    financeNoDuesCleared: false,
    systemAccessRevoked: false,
    exitInterviewCompleted: false,
    knowledgeTransferDone: false,
  });

  const [settlementData, setSettlementData] = useState({
    settlementAmount: "",
    settlementDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [exitsData, employeesData] = await Promise.all([
        getExitRequests(),
        getEmployees(),
      ]);
      setExits(exitsData);
      setEmployees(employeesData);
    } catch (error) {
      console.error("Failed to load exit management data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEmployeeSelect = (empId) => {
    const emp = employees.find((e) => e.id === empId || e.employeeId === empId);
    if (emp) {
      setNewExit({
        ...newExit,
        employeeId: emp.employeeId || emp.id,
        employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name,
        department: emp.department || emp.departmentId || "Operations",
      });
    }
  };

  const handleInitiateExit = async (e) => {
    e.preventDefault();
    if (!newExit.employeeName) return;
    try {
      setSubmitting(true);
      await createExitRequest(newExit);
      setIsInitiateModalOpen(false);
      setNewExit({
        employeeId: "",
        employeeName: "",
        department: "",
        exitType: "Voluntary Resignation",
        resignationDate: new Date().toISOString().split("T")[0],
        lastWorkingDay: "",
        reason: "",
      });
      loadData();
    } catch (error) {
      console.error("Error initiating exit:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveChecklist = async () => {
    if (!selectedExit) return;
    try {
      setSubmitting(true);
      await updateExitChecklist(selectedExit.id, checklist);
      setIsChecklistModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error updating checklist:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (!selectedExit) return;
    try {
      setSubmitting(true);
      await finalizeExit(selectedExit.id, settlementData);
      setIsFinalizeModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error finalizing exit:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExits = exits.filter((exit) => {
    const matchesSearch =
      (exit.exitId && exit.exitId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (exit.employeeName && exit.employeeName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (exit.employeeId && exit.employeeId.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || exit.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Workforce Exit & Offboarding"
          subtitle="Manage resignations, department no-dues checklists, F&F settlements, and relieving letters"
        />
        <button
          onClick={() => setIsInitiateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Initiate Exit Workflow
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by exit ID, employee name, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">All Exits</option>
            <option value="INITIATED">Initiated</option>
            <option value="CLEARANCE_IN_PROGRESS">Clearance In Progress</option>
            <option value="COMPLETED">Completed (Settled)</option>
          </select>
        </div>
      </div>

      {/* Exits Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredExits.length === 0 ? (
          <div className="text-center py-12 px-4">
            <LogOut className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No exit records found</p>
            <p className="text-xs text-gray-400 mt-1">Initiate offboarding workflows for departing staff.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Exit ID</th>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Exit Type</th>
                  <th className="px-5 py-3.5">Last Working Day</th>
                  <th className="px-5 py-3.5">Clearance Status</th>
                  <th className="px-5 py-3.5">F&F Settlement</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredExits.map((exit) => {
                  const checklistCleared = exit.checklist
                    ? Object.values(exit.checklist).filter(Boolean).length
                    : 0;
                  const totalChecklist = exit.checklist
                    ? Object.keys(exit.checklist).length
                    : 6;

                  return (
                    <tr key={exit.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                        {exit.exitId || exit.id}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{exit.employeeName}</p>
                          <p className="text-xs text-gray-400">{exit.employeeId} • {exit.department}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md font-medium">
                          {exit.exitType}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-gray-700">
                        {exit.lastWorkingDay || "TBD"}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => {
                            setSelectedExit(exit);
                            setChecklist(exit.checklist || {});
                            setIsChecklistModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          {checklistCleared} of {totalChecklist} Cleared
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        {exit.status === "COMPLETED" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {exit.status !== "COMPLETED" ? (
                          <button
                            onClick={() => {
                              setSelectedExit(exit);
                              setIsFinalizeModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                          >
                            <DollarSign className="w-3 h-3" /> Final Settlement
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Initiate Exit Modal */}
      {isInitiateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Initiate Offboarding / Exit</h3>
              <button onClick={() => setIsInitiateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInitiateExit} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Employee *</label>
                <select
                  required
                  onChange={(e) => handleEmployeeSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Exit Type</label>
                  <select
                    value={newExit.exitType}
                    onChange={(e) => setNewExit({ ...newExit, exitType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Voluntary Resignation">Voluntary Resignation</option>
                    <option value="Termination">Termination</option>
                    <option value="Absconding">Absconding</option>
                    <option value="Contract Expiry">Contract Expiry</option>
                    <option value="Mutual Separation">Mutual Separation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={newExit.department}
                    readOnly
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Resignation Date</label>
                  <input
                    type="date"
                    value={newExit.resignationDate}
                    onChange={(e) => setNewExit({ ...newExit, resignationDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Last Working Day *</label>
                  <input
                    type="date"
                    required
                    value={newExit.lastWorkingDay}
                    onChange={(e) => setNewExit({ ...newExit, lastWorkingDay: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason / Handover Notes</label>
                <textarea
                  rows="2"
                  value={newExit.reason}
                  onChange={(e) => setNewExit({ ...newExit, reason: e.target.value })}
                  placeholder="Notes on reasons for departure and handover expectations..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsInitiateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-medium"
                >
                  {submitting ? "Initiating..." : "Initiate Exit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Clearance Checklist Modal */}
      {isChecklistModalOpen && selectedExit && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Offboarding Clearance</h3>
                <p className="text-xs text-gray-500">{selectedExit.employeeName} ({selectedExit.employeeId})</p>
              </div>
              <button onClick={() => setIsChecklistModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 pt-4 text-sm">
              {[
                { key: "assetsReturned", label: "Company Assets & Hardware Handed Over" },
                { key: "idBadgeReturned", label: "ID Badge, Access Cards & Uniform Returned" },
                { key: "financeNoDuesCleared", label: "Finance & Accounts No-Dues Cleared" },
                { key: "systemAccessRevoked", label: "Email, Admin Portal & VPN Access Revoked" },
                { key: "exitInterviewCompleted", label: "HR Exit Interview Conducted" },
                { key: "knowledgeTransferDone", label: "Project Handover & Knowledge Transfer Done" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist[item.key] || false}
                    onChange={(e) => setChecklist({ ...checklist, [item.key]: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs font-medium text-gray-800">{item.label}</span>
                </label>
              ))}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsChecklistModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveChecklist}
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
                >
                  {submitting ? "Saving..." : "Update Clearance"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Final Settlement & Closure Modal */}
      {isFinalizeModalOpen && selectedExit && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Full & Final Settlement</h3>
              <button onClick={() => setIsFinalizeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFinalize} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Finalizing exit for <strong className="text-gray-800">{selectedExit.employeeName}</strong>. This will transition employee status to Inactive and mark relieving documents ready.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Final Settlement Amount (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 45000"
                  value={settlementData.settlementAmount}
                  onChange={(e) => setSettlementData({ ...settlementData, settlementAmount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Settlement Disbursal Date</label>
                <input
                  type="date"
                  value={settlementData.settlementDate}
                  onChange={(e) => setSettlementData({ ...settlementData, settlementDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Settlement Notes</label>
                <textarea
                  rows="2"
                  value={settlementData.notes}
                  onChange={(e) => setSettlementData({ ...settlementData, notes: e.target.value })}
                  placeholder="Gratuity, leave encashment, notice period adjustments..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFinalizeModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Finalizing..." : "Complete Exit & Settle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExitManagement;

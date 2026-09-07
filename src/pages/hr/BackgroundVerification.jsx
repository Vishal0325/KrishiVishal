import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getBGVRecords,
  createBGVRecord,
  updateBGVRecord,
} from "../../services/hrExtendedService";
import { getEmployees, getRiderHRProfiles } from "../../services/workforceService";
import {
  ShieldCheck,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  User,
  X,
  Building,
  Check,
  Ban
} from "lucide-react";

const BackgroundVerification = () => {
  const [bgvList, setBgvList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedBGV, setSelectedBGV] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [newBGV, setNewBGV] = useState({
    candidateType: "Employee",
    candidateId: "",
    candidateName: "",
    agency: "Internal HR Team",
    checks: {
      addressCheck: "PENDING",
      criminalCheck: "PENDING",
      employmentCheck: "PENDING",
      educationCheck: "PENDING",
      drivingLicenseCheck: "PENDING",
    },
    notes: "",
  });

  const [updateData, setUpdateData] = useState({
    status: "CLEAR",
    checks: {},
    reportUrl: "",
    remarks: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [bgvData, empsData, ridersData] = await Promise.all([
        getBGVRecords(),
        getEmployees(),
        getRiderHRProfiles(),
      ]);
      setBgvList(bgvData);
      setEmployees(empsData);
      setRiders(ridersData);
    } catch (error) {
      console.error("Failed to load BGV data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCandidateSelect = (id) => {
    if (newBGV.candidateType === "Employee") {
      const emp = employees.find((e) => e.id === id || e.employeeId === id);
      if (emp) {
        setNewBGV({
          ...newBGV,
          candidateId: emp.employeeId || emp.id,
          candidateName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name,
        });
      }
    } else {
      const rdr = riders.find((r) => r.id === id || r.hrRiderId === id);
      if (rdr) {
        setNewBGV({
          ...newBGV,
          candidateId: rdr.hrRiderId || rdr.id,
          candidateName: `${rdr.firstName || ""} ${rdr.lastName || ""}`.trim() || rdr.name,
        });
      }
    }
  };

  const handleCreateBGV = async (e) => {
    e.preventDefault();
    if (!newBGV.candidateName) return;
    try {
      setSubmitting(true);
      await createBGVRecord(newBGV);
      setIsAddModalOpen(false);
      setNewBGV({
        candidateType: "Employee",
        candidateId: "",
        candidateName: "",
        agency: "Internal HR Team",
        checks: {
          addressCheck: "PENDING",
          criminalCheck: "PENDING",
          employmentCheck: "PENDING",
          educationCheck: "PENDING",
          drivingLicenseCheck: "PENDING",
        },
        notes: "",
      });
      loadData();
    } catch (error) {
      console.error("Error creating BGV record:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBGV = async (e) => {
    e.preventDefault();
    if (!selectedBGV) return;
    try {
      setSubmitting(true);
      await updateBGVRecord(selectedBGV.id, updateData);
      setIsUpdateModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error updating BGV:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredList = bgvList.filter((item) => {
    const matchesSearch =
      (item.bgvId && item.bgvId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.candidateName && item.candidateName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.candidateId && item.candidateId.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Background Verification & Due Diligence"
          subtitle="Screening workflows for identity, criminal background, address authenticity, and license verification"
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Initiate Background Check
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by BGV ID, candidate, agency..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="INITIATED">Initiated</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="CLEAR">Clear (Passed)</option>
            <option value="MINOR_DISCREPANCY">Minor Discrepancy</option>
            <option value="MAJOR_DISCREPANCY">Major Discrepancy (Failed)</option>
          </select>
        </div>
      </div>

      {/* BGV Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-12 px-4">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No background verification records</p>
            <p className="text-xs text-gray-400 mt-1">Initiate background checks for workforce onboarding.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">BGV ID</th>
                  <th className="px-5 py-3.5">Candidate / Staff</th>
                  <th className="px-5 py-3.5">Verification Agency</th>
                  <th className="px-5 py-3.5">Component Checks</th>
                  <th className="px-5 py-3.5">Overall Outcome</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredList.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                      {item.bgvId || item.id}
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.candidateName}</p>
                        <p className="text-xs text-gray-400">{item.candidateType} • {item.candidateId}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-gray-700">
                      {item.agency || "Internal HR"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {item.checks && Object.entries(item.checks).map(([key, val]) => (
                          <span
                            key={key}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              val === "CLEAR"
                                ? "bg-emerald-50 text-emerald-700"
                                : val === "FAILED"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {key.replace("Check", "")}: {val}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {item.status === "CLEAR" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3" /> Clear
                        </span>
                      ) : item.status === "MAJOR_DISCREPANCY" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                          <Ban className="w-3 h-3" /> Discrepancy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200/60">
                          <Clock className="w-3 h-3" /> {item.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedBGV(item);
                          setUpdateData({
                            status: item.status || "CLEAR",
                            checks: item.checks || {},
                            reportUrl: item.reportUrl || "",
                            remarks: item.remarks || "",
                          });
                          setIsUpdateModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        Update Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add BGV Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Initiate Background Check</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateBGV} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Candidate Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="candType"
                      checked={newBGV.candidateType === "Employee"}
                      onChange={() => setNewBGV({ ...newBGV, candidateType: "Employee", candidateId: "", candidateName: "" })}
                    />
                    Employee / Staff
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="candType"
                      checked={newBGV.candidateType === "Rider"}
                      onChange={() => setNewBGV({ ...newBGV, candidateType: "Rider", candidateId: "", candidateName: "" })}
                    />
                    Rider
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Candidate *</label>
                <select
                  required
                  onChange={(e) => handleCandidateSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Choose Person --</option>
                  {newBGV.candidateType === "Employee"
                    ? employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id})
                        </option>
                      ))
                    : riders.map((rdr) => (
                        <option key={rdr.id} value={rdr.id}>
                          {rdr.firstName} {rdr.lastName} ({rdr.hrRiderId || rdr.id})
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Verification Agency / Method</label>
                <select
                  value={newBGV.agency}
                  onChange={(e) => setNewBGV({ ...newBGV, agency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Internal HR Team">Internal HR Verification</option>
                  <option value="FirstAdvantage BGV">FirstAdvantage BGV</option>
                  <option value="AuthBridge Agency">AuthBridge Agency</option>
                  <option value="Local Police Verification">Local Police Verification</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Initial Notes</label>
                <textarea
                  rows="2"
                  value={newBGV.notes}
                  onChange={(e) => setNewBGV({ ...newBGV, notes: e.target.value })}
                  placeholder="Special instructions, priority checks..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium"
                >
                  {submitting ? "Initiating..." : "Initiate Verification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update BGV Outcome Modal */}
      {isUpdateModalOpen && selectedBGV && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Update BGV Status</h3>
              <button onClick={() => setIsUpdateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateBGV} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Updating checks for <strong className="text-gray-800">{selectedBGV.candidateName}</strong>
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Overall Outcome</label>
                <select
                  value={updateData.status}
                  onChange={(e) => setUpdateData({ ...updateData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                >
                  <option value="CLEAR">Clear (All Checks Passed)</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="MINOR_DISCREPANCY">Minor Discrepancy</option>
                  <option value="MAJOR_DISCREPANCY">Major Discrepancy (Failed)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">BGV Report Attachment URL</label>
                <input
                  type="url"
                  placeholder="https://storage.googleapis.com/..."
                  value={updateData.reportUrl}
                  onChange={(e) => setUpdateData({ ...updateData, reportUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Remarks & Details</label>
                <textarea
                  rows="2"
                  value={updateData.remarks}
                  onChange={(e) => setUpdateData({ ...updateData, remarks: e.target.value })}
                  placeholder="Summary of agency findings..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium"
                >
                  {submitting ? "Updating..." : "Save Outcome"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundVerification;

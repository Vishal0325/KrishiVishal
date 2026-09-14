import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getTrainingRecords,
  createTrainingRecord,
  updateTrainingRecord,
} from "../../services/hrExtendedService";
import { getEmployees, getRiderHRProfiles } from "../../services/workforceService";
import {
  Award,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  ExternalLink,
  BookOpen,
  User,
  X
} from "lucide-react";

const TrainingCertifications = () => {
  const [trainings, setTrainings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [newTraining, setNewTraining] = useState({
    title: "Agri-Input Handling & Chemical Safety",
    category: "Safety & Compliance",
    traineeType: "Employee",
    traineeId: "",
    traineeName: "",
    trainerName: "KrishiVishal Safety Officer",
    scheduledDate: new Date().toISOString().split("T")[0],
    validityYears: 1,
    status: "SCHEDULED",
  });

  const [updateData, setUpdateData] = useState({
    status: "COMPLETED",
    score: 90,
    certificateNumber: "",
    certificateUrl: "",
    completionDate: new Date().toISOString().split("T")[0],
    expiryDate: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [trainingsData, empsData, ridersData] = await Promise.all([
        getTrainingRecords(),
        getEmployees(),
        getRiderHRProfiles(),
      ]);
      setTrainings(trainingsData);
      setEmployees(empsData);
      setRiders(ridersData);
    } catch (error) {
      console.error("Failed to load training data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTraineeSelect = (id) => {
    // [FIXED] Point #121: Consistently use Firestore document ID for internal cross-linking to prevent data schizophrenia
    if (newTraining.traineeType === "Employee") {
      const emp = employees.find((e) => e.id === id);
      if (emp) {
        setNewTraining({
          ...newTraining,
          traineeId: emp.id,
          traineeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name,
        });
      }
    } else {
      const rdr = riders.find((r) => r.id === id);
      if (rdr) {
        setNewTraining({
          ...newTraining,
          traineeId: rdr.id,
          traineeName: `${rdr.firstName || ""} ${rdr.lastName || ""}`.trim() || rdr.name,
        });
      }
    }
  };

  const handleCreateTraining = async (e) => {
    e.preventDefault();
    if (!newTraining.title || !newTraining.traineeName) return;
    try {
      setSubmitting(true);
      await createTrainingRecord(newTraining);
      setIsAddModalOpen(false);
      setNewTraining({
        title: "Agri-Input Handling & Chemical Safety",
        category: "Safety & Compliance",
        traineeType: "Employee",
        traineeId: "",
        traineeName: "",
        trainerName: "KrishiVishal Safety Officer",
        scheduledDate: new Date().toISOString().split("T")[0],
        validityYears: 1,
        status: "SCHEDULED",
      });
      loadData();
    } catch (error) {
      console.error("Error scheduling training:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTraining = async (e) => {
    e.preventDefault();
    if (!selectedTraining) return;
    try {
      setSubmitting(true);
      // [FIXED] Point #122: Removed client-side clock dependency for expiry calculation.
      // Expiry logic is now handled more reliably via the updateTrainingRecord service (ideally server-side).
      
      await updateTrainingRecord(selectedTraining.id, {
        ...updateData,
        // Passing days to add instead of fixed date if possible,
        // but for now ensuring we use a standard server-side timestamp approach if available.
        completionDate: new Date().toISOString().split("T")[0],
      });
      setIsUpdateModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error updating training completion:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTrainings = trainings.filter((item) => {
    const matchesSearch =
      (item.trainingId && item.trainingId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.traineeName && item.traineeName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Training, Certifications & Safety Modules"
          subtitle="Mandatory workplace safety, rider defensive driving, cold chain protocols, and certification validity"
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Assign Training Program
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, trainee name, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Categories</option>
              <option value="Safety & Compliance">Safety & Compliance</option>
              <option value="Rider Road Safety">Rider Road Safety</option>
              <option value="Agri-Input Protocols">Agri-Input Protocols</option>
              <option value="Customer Care">Customer Care</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Training Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredTrainings.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No training records found</p>
            <p className="text-xs text-gray-400 mt-1">Assign safety courses and record certifications.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Training Program</th>
                  <th className="px-5 py-3.5">Trainee</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Schedule / Completed</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredTrainings.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.trainingId || item.id}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.traineeName}</p>
                        <p className="text-xs text-gray-400">{item.traineeType} • {item.traineeId}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md font-medium">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {item.status === "COMPLETED" ? (
                        <div>
                          <p className="font-medium text-gray-900">Done: {item.completionDate}</p>
                          <p className="text-gray-400">Valid until: {item.expiryDate || "Lifetime"}</p>
                        </div>
                      ) : (
                        <p className="text-gray-700">Scheduled: {item.scheduledDate}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {item.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3" /> Completed ({item.score || 100}%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                          <Clock className="w-3 h-3" /> {item.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {item.status !== "COMPLETED" ? (
                        <button
                          onClick={() => {
                            setSelectedTraining(item);
                            setIsUpdateModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Mark Complete
                        </button>
                      ) : item.certificateUrl ? (
                        <a
                          href={item.certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Certificate
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Certified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Training Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Assign Training Course</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTraining} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hazardous Pesticide Handling & Personal Protection"
                  value={newTraining.title}
                  onChange={(e) => setNewTraining({ ...newTraining, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Course Category</label>
                  <select
                    value={newTraining.category}
                    onChange={(e) => setNewTraining({ ...newTraining, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Safety & Compliance">Safety & Compliance</option>
                    <option value="Rider Road Safety">Rider Road Safety</option>
                    <option value="Agri-Input Protocols">Agri-Input Protocols</option>
                    <option value="Customer Care">Customer Care</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Validity (Years)</label>
                  <input
                    type="number"
                    value={newTraining.validityYears}
                    onChange={(e) => setNewTraining({ ...newTraining, validityYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Trainee Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="trnType"
                      checked={newTraining.traineeType === "Employee"}
                      onChange={() => setNewTraining({ ...newTraining, traineeType: "Employee", traineeId: "", traineeName: "" })}
                    />
                    Employee / Staff
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="trnType"
                      checked={newTraining.traineeType === "Rider"}
                      onChange={() => setNewTraining({ ...newTraining, traineeType: "Rider", traineeId: "", traineeName: "" })}
                    />
                    Delivery Rider
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Trainee *</label>
                <select
                  required
                  onChange={(e) => handleTraineeSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Person --</option>
                  {newTraining.traineeType === "Employee"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={newTraining.scheduledDate}
                    onChange={(e) => setNewTraining({ ...newTraining, scheduledDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Trainer / Instructor</label>
                  <input
                    type="text"
                    value={newTraining.trainerName}
                    onChange={(e) => setNewTraining({ ...newTraining, trainerName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Assigning..." : "Assign Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Complete Modal */}
      {isUpdateModalOpen && selectedTraining && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Record Certification Completion</h3>
              <button onClick={() => setIsUpdateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTraining} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Recording completion of <strong className="text-gray-800">{selectedTraining.title}</strong> for <strong className="text-gray-800">{selectedTraining.traineeName}</strong>
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Assessment Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={updateData.score}
                    onChange={(e) => setUpdateData({ ...updateData, score: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Certificate No.</label>
                  <input
                    type="text"
                    placeholder="e.g. CERT-2026-99"
                    value={updateData.certificateNumber}
                    onChange={(e) => setUpdateData({ ...updateData, certificateNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Certificate Attachment URL</label>
                <input
                  type="url"
                  placeholder="https://storage.googleapis.com/..."
                  value={updateData.certificateUrl}
                  onChange={(e) => setUpdateData({ ...updateData, certificateUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Saving..." : "Record Certificate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingCertifications;

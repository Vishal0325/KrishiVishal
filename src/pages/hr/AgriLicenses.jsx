import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getStatutoryLicenses,
  createStatutoryLicense,
  updateStatutoryLicense,
  deleteStatutoryLicense,
} from "../../services/licenseService";
import {
  Shield,
  Sprout,
  FileCheck,
  AlertTriangle,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Calendar,
  Building,
  DollarSign,
  X,
  Printer,
  Download,
  Trash2,
  Edit
} from "lucide-react";

const licensePresets = [
  {
    category: "Pesticides",
    title: "Insecticides & Pesticides Wholesale License",
    issuingAuthority: "District Agriculture Officer (DAO), Purnea, Bihar",
    licenseNumber: "DA/PUR/PEST/2026/044",
  },
  {
    category: "Fertilizers",
    title: "Fertilizer Retail & Wholesale Dealer Registration (Form A/O)",
    issuingAuthority: "Joint Director of Agriculture, Bihar",
    licenseNumber: "FERT/FCO/PUR-882",
  },
  {
    category: "Seeds",
    title: "Seed Trade & Distribution License (Seed Act 1966)",
    issuingAuthority: "Directorate of Seed Certification, Bihar",
    licenseNumber: "SEED/BR/2026/1029",
  },
  {
    category: "FSSAI",
    title: "FSSAI Food Business Operator License",
    issuingAuthority: "Food Safety and Standards Authority of India",
    licenseNumber: "10024001000998",
  },
  {
    category: "Warehouse_Fire_NOC",
    title: "Warehouse Fire Safety & Operating NOC",
    issuingAuthority: "Bihar Fire Services Department, Purnea",
    licenseNumber: "NOC/FIRE/PUR/2026/12",
  },
];

const AgriLicenses = () => {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [newLicense, setNewLicense] = useState({
    title: "",
    category: "Pesticides", // Pesticides, Fertilizers, Seeds, FSSAI, Warehouse_Fire_NOC, GST_Trade
    licenseNumber: "",
    issuingAuthority: "",
    issueDate: new Date().toISOString().split("T")[0],
    expiryDate: "",
    renewalFee: "",
    documentUrl: "",
    operatingPremises: "Central Warehouse, Purnea, Bihar",
    status: "ACTIVE",
    notes: "",
  });

  const [updateData, setUpdateData] = useState({
    status: "ACTIVE",
    expiryDate: "",
    renewalFee: "",
    documentUrl: "",
    notes: "",
  });

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const data = await getStatutoryLicenses();
      setLicenses(data);
    } catch (error) {
      console.error("Failed to load statutory licenses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, []);

  const handleApplyPreset = (preset) => {
    setNewLicense({
      ...newLicense,
      category: preset.category,
      title: preset.title,
      issuingAuthority: preset.issuingAuthority,
      licenseNumber: preset.licenseNumber,
    });
  };

  const handleCreateLicense = async (e) => {
    e.preventDefault();
    if (!newLicense.title || !newLicense.licenseNumber) return;
    try {
      setSubmitting(true);
      await createStatutoryLicense(newLicense);
      setIsAddModalOpen(false);
      setNewLicense({
        title: "",
        category: "Pesticides",
        licenseNumber: "",
        issuingAuthority: "",
        issueDate: new Date().toISOString().split("T")[0],
        expiryDate: "",
        renewalFee: "",
        documentUrl: "",
        operatingPremises: "Central Warehouse, Purnea, Bihar",
        status: "ACTIVE",
        notes: "",
      });
      loadLicenses();
    } catch (error) {
      console.error("Error creating statutory license:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLicense = async (e) => {
    e.preventDefault();
    if (!selectedLicense) return;
    try {
      setSubmitting(true);
      await updateStatutoryLicense(selectedLicense.id, updateData);
      setIsUpdateModalOpen(false);
      loadLicenses();
    } catch (error) {
      console.error("Error updating statutory license:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this statutory license record?")) return;
    try {
      await deleteStatutoryLicense(id);
      loadLicenses();
    } catch (error) {
      console.error("Error deleting license:", error);
    }
  };

  const now = new Date();

  const filteredLicenses = licenses.filter((lic) => {
    const matchesSearch =
      (lic.title && lic.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.licenseNumber && lic.licenseNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.issuingAuthority && lic.issuingAuthority.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === "ALL" || lic.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || lic.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const exportCSV = () => {
    if (filteredLicenses.length === 0) return;
    const headers = ["License ID", "Title", "Category", "License Number", "Authority", "Issue Date", "Expiry Date", "Status", "Premises"];
    const rows = filteredLicenses.map(l => [
      l.licenseId || l.id,
      `"${l.title || ""}"`,
      l.category,
      `"${l.licenseNumber || ""}"`,
      `"${l.issuingAuthority || ""}"`,
      l.issueDate || "",
      l.expiryDate || "",
      l.status || "",
      `"${l.operatingPremises || ""}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KrishiVishal_Agri_Statutory_Licenses_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Agri-Statutory Licenses & Regulatory Vault"
          subtitle="Manage official private limited licenses, Pesticide Form A/O, Seed, FSSAI, and Warehouse Fire NOCs"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            disabled={filteredLicenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Register Regulatory License
          </button>
        </div>
      </div>

      {/* Top Warning Banner if any license expires in 30 days */}
      {licenses.some(l => {
        if (!l.expiryDate) return false;
        const diff = (new Date(l.expiryDate) - now) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      }) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl flex items-center gap-3 text-sm animate-pulse">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">Attention Required:</span> One or more statutory operating licenses are due for renewal within 30 days. Please initiate renewal with the District Agriculture Office / Municipal Authority.
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by license name, number, authority..."
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
              <option value="ALL">All Statutory Categories</option>
              <option value="Pesticides">Pesticides & Chemicals</option>
              <option value="Fertilizers">Fertilizer (Form A/O)</option>
              <option value="Seeds">Seed Trading</option>
              <option value="FSSAI">FSSAI Food Business</option>
              <option value="Warehouse_Fire_NOC">Warehouse Fire NOC</option>
              <option value="GST_Trade">GST & Shop Act</option>
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
              <option value="ACTIVE">Active & Valid</option>
              <option value="RENEWAL_IN_PROGRESS">Renewal In Progress</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Licenses Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredLicenses.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No statutory licenses registered</p>
            <p className="text-xs text-gray-400 mt-1">Add Pesticide, Fertilizer, Seed or FSSAI licenses to monitor renewals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">License & Category</th>
                  <th className="px-5 py-3.5">Registration / Number</th>
                  <th className="px-5 py-3.5">Issuing Authority</th>
                  <th className="px-5 py-3.5">Validity Schedule</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredLicenses.map((lic) => {
                  const expDate = lic.expiryDate ? new Date(lic.expiryDate) : null;
                  const daysLeft = expDate ? Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={lic.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{lic.title}</p>
                          <span className="inline-block mt-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                            {lic.category}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs font-bold text-gray-800">
                        {lic.licenseNumber}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="flex items-start gap-1 text-gray-700">
                          <Building className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                          <span>{lic.issuingAuthority || "State Agriculture Dept"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {lic.expiryDate ? (
                          <div>
                            <p className="font-semibold text-gray-900">{lic.expiryDate}</p>
                            {daysLeft < 0 ? (
                              <span className="text-rose-600 font-bold">Expired ({Math.abs(daysLeft)}d ago)</span>
                            ) : daysLeft <= 30 ? (
                              <span className="text-amber-600 font-bold">Expires in {daysLeft} days</span>
                            ) : (
                              <span className="text-gray-400">{daysLeft} days remaining</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Permanent / No Expiry</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {lic.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : lic.status === "RENEWAL_IN_PROGRESS" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                            <Clock className="w-3 h-3" /> In Renewal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                            <AlertTriangle className="w-3 h-3" /> Expired
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {lic.documentUrl && (
                            <a
                              href={lic.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="View Certificate"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setSelectedLicense(lic);
                              setUpdateData({
                                status: lic.status || "ACTIVE",
                                expiryDate: lic.expiryDate || "",
                                renewalFee: lic.renewalFee || "",
                                documentUrl: lic.documentUrl || "",
                                notes: lic.notes || "",
                              });
                              setIsUpdateModalOpen(true);
                            }}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit / Renew License"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(lic.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add License Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Register Agri-Statutory License</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Standard Templates:</p>
              <div className="flex flex-wrap gap-2">
                {licensePresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 rounded-lg transition-colors"
                  >
                    + {preset.category}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateLicense} className="space-y-4 pt-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">License Category *</label>
                  <select
                    value={newLicense.category}
                    onChange={(e) => setNewLicense({ ...newLicense, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Pesticides">Pesticides & Insecticides</option>
                    <option value="Fertilizers">Fertilizers (Form A/O)</option>
                    <option value="Seeds">Seed Trading</option>
                    <option value="FSSAI">FSSAI Food Business</option>
                    <option value="Warehouse_Fire_NOC">Warehouse Fire NOC</option>
                    <option value="GST_Trade">GST & Municipal Trade</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">License / Reg Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BR/PUR/PEST/2026/01"
                    value={newLicense.licenseNumber}
                    onChange={(e) => setNewLicense({ ...newLicense, licenseNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">License Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Pesticide Sales License"
                  value={newLicense.title}
                  onChange={(e) => setNewLicense({ ...newLicense, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Issuing Authority / Department</label>
                <input
                  type="text"
                  placeholder="e.g. District Agriculture Office (DAO), Purnea"
                  value={newLicense.issuingAuthority}
                  onChange={(e) => setNewLicense({ ...newLicense, issuingAuthority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Issue / Effective Date</label>
                  <input
                    type="date"
                    value={newLicense.issueDate}
                    onChange={(e) => setNewLicense({ ...newLicense, issueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date (Renewal Due)</label>
                  <input
                    type="date"
                    value={newLicense.expiryDate}
                    onChange={(e) => setNewLicense({ ...newLicense, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Renewal Fee (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={newLicense.renewalFee}
                    onChange={(e) => setNewLicense({ ...newLicense, renewalFee: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Authorized Premises</label>
                  <input
                    type="text"
                    value={newLicense.operatingPremises}
                    onChange={(e) => setNewLicense({ ...newLicense, operatingPremises: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Digital Certificate URL / Cloud Link</label>
                <input
                  type="url"
                  placeholder="https://storage.googleapis.com/..."
                  value={newLicense.documentUrl}
                  onChange={(e) => setNewLicense({ ...newLicense, documentUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Inspection Notes & Conditions</label>
                <textarea
                  rows="2"
                  value={newLicense.notes}
                  onChange={(e) => setNewLicense({ ...newLicense, notes: e.target.value })}
                  placeholder="Storage safety requirements, temperature conditions, inspection history..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Saving..." : "Save License"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Renew Modal */}
      {isUpdateModalOpen && selectedLicense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Update / Renew License</h3>
              <button onClick={() => setIsUpdateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateLicense} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Updating <strong className="text-gray-800">{selectedLicense.title}</strong> ({selectedLicense.licenseNumber})
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={updateData.status}
                  onChange={(e) => setUpdateData({ ...updateData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ACTIVE">Active & Valid</option>
                  <option value="RENEWAL_IN_PROGRESS">Renewal In Progress</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Expiry Date (After Renewal)</label>
                <input
                  type="date"
                  value={updateData.expiryDate}
                  onChange={(e) => setUpdateData({ ...updateData, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Renewal Fee Paid (₹)</label>
                <input
                  type="number"
                  value={updateData.renewalFee}
                  onChange={(e) => setUpdateData({ ...updateData, renewalFee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Updated Certificate URL</label>
                <input
                  type="url"
                  value={updateData.documentUrl}
                  onChange={(e) => setUpdateData({ ...updateData, documentUrl: e.target.value })}
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
                  {submitting ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgriLicenses;

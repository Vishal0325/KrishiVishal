import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getContracts,
  createContract,
  updateContract,
} from "../../services/hrExtendedService";
import {
  FileText,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  Calendar,
  Building,
  User,
  X,
  ShieldCheck
} from "lucide-react";

const ContractsAgreements = () => {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [newContract, setNewContract] = useState({
    contractCode: "",
    title: "",
    contractType: "Employment Agreement", // Employment Agreement, Rider SLA, Vendor Agreement, NDA, Warehouse Lease
    partyAName: "KrishiVishal Agritech Pvt. Ltd.",
    partyBName: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    expiryDate: "",
    renewalNoticeDays: 30,
    documentUrl: "",
    status: "ACTIVE",
    notes: "",
  });

  const loadContracts = async () => {
    try {
      setLoading(true);
      const data = await getContracts();
      setContracts(data);
    } catch (error) {
      console.error("Failed to load contracts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (!newContract.title || !newContract.partyBName) return;
    try {
      setSubmitting(true);
      await createContract(newContract);
      setIsAddModalOpen(false);
      setNewContract({
        contractCode: "",
        title: "",
        contractType: "Employment Agreement",
        partyAName: "KrishiVishal Agritech Pvt. Ltd.",
        partyBName: "",
        effectiveDate: new Date().toISOString().split("T")[0],
        expiryDate: "",
        renewalNoticeDays: 30,
        documentUrl: "",
        status: "ACTIVE",
        notes: "",
      });
      loadContracts();
    } catch (error) {
      console.error("Error creating contract:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      (contract.contractId && contract.contractId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (contract.title && contract.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (contract.partyBName && contract.partyBName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = typeFilter === "ALL" || contract.contractType === typeFilter;
    const matchesStatus = statusFilter === "ALL" || contract.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Contracts, SLAs & Legal Agreements"
          subtitle="Manage workforce contracts, rider service level agreements, vendor terms, and renewal cycles"
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Agreement
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, title, signatory party..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Types</option>
              <option value="Employment Agreement">Employment Agreement</option>
              <option value="Rider SLA">Rider SLA</option>
              <option value="Vendor Agreement">Vendor Agreement</option>
              <option value="NDA">NDA</option>
              <option value="Warehouse Lease">Warehouse Lease</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING_SOON">Expiring Soon</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No contracts or agreements registered</p>
            <p className="text-xs text-gray-400 mt-1">Register legal agreements and track expiration schedules.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Agreement ID</th>
                  <th className="px-5 py-3.5">Title & Type</th>
                  <th className="px-5 py-3.5">Counterparty</th>
                  <th className="px-5 py-3.5">Validity Period</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Digital Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredContracts.map((contract) => (
                  <tr key={contract.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                      {contract.contractId || contract.contractCode || contract.id}
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{contract.title}</p>
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
                          {contract.contractType}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-gray-800">{contract.partyBName}</p>
                        <p className="text-xs text-gray-400">vs. {contract.partyAName}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <div className="flex items-center gap-1 text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{contract.effectiveDate || "N/A"} → {contract.expiryDate || "Ongoing"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {contract.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                          <AlertTriangle className="w-3 h-3" /> {contract.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {contract.documentUrl ? (
                        <a
                          href={contract.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View Copy
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">On Physical File</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contract Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Create Contract / Agreement</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateContract} className="space-y-4 pt-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contract Code</label>
                  <input
                    type="text"
                    placeholder="e.g. CNT-2026-001"
                    value={newContract.contractCode}
                    onChange={(e) => setNewContract({ ...newContract, contractCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contract Type</label>
                  <select
                    value={newContract.contractType}
                    onChange={(e) => setNewContract({ ...newContract, contractType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Employment Agreement">Employment Agreement</option>
                    <option value="Rider SLA">Rider SLA</option>
                    <option value="Vendor Agreement">Vendor Agreement</option>
                    <option value="NDA">NDA</option>
                    <option value="Warehouse Lease">Warehouse Lease</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agreement Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Full-Time Agronomist Employment Agreement"
                  value={newContract.title}
                  onChange={(e) => setNewContract({ ...newContract, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Primary Party (Entity)</label>
                  <input
                    type="text"
                    value={newContract.partyAName}
                    onChange={(e) => setNewContract({ ...newContract, partyAName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Counterparty (Person/Vendor) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Sharma"
                    value={newContract.partyBName}
                    onChange={(e) => setNewContract({ ...newContract, partyBName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={newContract.effectiveDate}
                    onChange={(e) => setNewContract({ ...newContract, effectiveDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date (Blank if ongoing)</label>
                  <input
                    type="date"
                    value={newContract.expiryDate}
                    onChange={(e) => setNewContract({ ...newContract, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Digital Signed Copy URL</label>
                <input
                  type="url"
                  placeholder="https://storage.googleapis.com/..."
                  value={newContract.documentUrl}
                  onChange={(e) => setNewContract({ ...newContract, documentUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
                >
                  {submitting ? "Saving..." : "Save Agreement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractsAgreements;

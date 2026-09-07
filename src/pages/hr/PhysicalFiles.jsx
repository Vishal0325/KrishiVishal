import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import { 
  getPhysicalFiles, 
  createPhysicalFile, 
  checkoutPhysicalFile, 
  returnPhysicalFile 
} from "../../services/hrExtendedService";
import {
  Archive,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  FileText,
  X
} from "lucide-react";

const PhysicalFiles = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [newFile, setNewFile] = useState({
    fileCode: "",
    ownerName: "",
    ownerType: "Employee",
    ownerId: "",
    warehouseLocation: "Purnea Central WH",
    cabinetNumber: "CAB-A1",
    shelfNumber: "S-02",
    boxNumber: "BX-09",
    documentDescription: "Original Aadhaar, Degree & Contract",
  });

  const [checkoutData, setCheckoutData] = useState({
    borrowerName: "",
    purpose: "",
    expectedReturnDate: "",
  });

  const [returnData, setReturnData] = useState({
    returnedBy: "",
    condition: "Good",
    notes: "",
  });

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await getPhysicalFiles();
      setFiles(data);
    } catch (error) {
      console.error("Failed to load physical files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleCreateFile = async (e) => {
    e.preventDefault();
    if (!newFile.ownerName) return;
    try {
      setSubmitting(true);
      await createPhysicalFile(newFile);
      setIsAddModalOpen(false);
      setNewFile({
        fileCode: "",
        ownerName: "",
        ownerType: "Employee",
        ownerId: "",
        warehouseLocation: "Purnea Central WH",
        cabinetNumber: "CAB-A1",
        shelfNumber: "S-02",
        boxNumber: "BX-09",
        documentDescription: "Original Aadhaar, Degree & Contract",
      });
      loadFiles();
    } catch (error) {
      console.error("Error creating physical file:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!selectedFile || !checkoutData.borrowerName) return;
    try {
      setSubmitting(true);
      await checkoutPhysicalFile(selectedFile.id, checkoutData);
      setIsCheckoutModalOpen(false);
      setCheckoutData({ borrowerName: "", purpose: "", expectedReturnDate: "" });
      loadFiles();
    } catch (error) {
      console.error("Error checking out file:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    try {
      setSubmitting(true);
      await returnPhysicalFile(selectedFile.id, returnData);
      setIsReturnModalOpen(false);
      setReturnData({ returnedBy: "", condition: "Good", notes: "" });
      loadFiles();
    } catch (error) {
      console.error("Error returning file:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = 
      (file.fileId && file.fileId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (file.ownerName && file.ownerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (file.cabinetNumber && file.cabinetNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === "ALL" || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Physical File & Vault Management"
          subtitle="Real-time physical file custody, archive location tracking, and checkout history"
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Register New Physical File
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by file code, person name, cabinet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_STORAGE">In Storage (Available)</option>
            <option value="CHECKED_OUT">Checked Out</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Physical Files Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No physical files found</p>
            <p className="text-xs text-gray-400 mt-1">Register new physical documents to track vault locations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">File Code</th>
                  <th className="px-5 py-3.5">Owner Details</th>
                  <th className="px-5 py-3.5">Storage Location</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Current Custody</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        {file.fileId || file.fileCode || file.id}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{file.ownerName}</p>
                        <p className="text-xs text-gray-400">{file.ownerType} • {file.ownerId || "ID N/A"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-800">{file.warehouseLocation || "Main Vault"}</p>
                          <p className="text-gray-400">Cab: {file.cabinetNumber} | Shelf: {file.shelfNumber} | Box: {file.boxNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {file.status === "IN_STORAGE" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3" /> In Storage
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                          <Clock className="w-3 h-3" /> Checked Out
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-600">
                      {file.currentBorrower ? (
                        <span className="font-medium text-amber-700">With {file.currentBorrower}</span>
                      ) : (
                        <span className="text-gray-400">In Secure Vault</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {file.status === "IN_STORAGE" ? (
                        <button
                          onClick={() => {
                            setSelectedFile(file);
                            setIsCheckoutModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          <ArrowUpRight className="w-3 h-3" /> Check Out
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedFile(file);
                            setIsReturnModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          <ArrowDownLeft className="w-3 h-3" /> Check In
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Physical File Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Register Physical File Archive</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFile} className="space-y-4 pt-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">File Code (Auto or Custom)</label>
                  <input
                    type="text"
                    placeholder="e.g. KV-PF-001"
                    value={newFile.fileCode}
                    onChange={(e) => setNewFile({ ...newFile, fileCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Owner Type</label>
                  <select
                    value={newFile.ownerType}
                    onChange={(e) => setNewFile({ ...newFile, ownerType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Employee">Employee</option>
                    <option value="Rider">Rider</option>
                    <option value="Vendor">Vendor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Owner Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amit Kumar"
                    value={newFile.ownerName}
                    onChange={(e) => setNewFile({ ...newFile, ownerName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Owner ID</label>
                  <input
                    type="text"
                    placeholder="e.g. KV-EMP-0001"
                    value={newFile.ownerId}
                    onChange={(e) => setNewFile({ ...newFile, ownerId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Warehouse / Vault Location</label>
                <input
                  type="text"
                  value={newFile.warehouseLocation}
                  onChange={(e) => setNewFile({ ...newFile, warehouseLocation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cabinet</label>
                  <input
                    type="text"
                    value={newFile.cabinetNumber}
                    onChange={(e) => setNewFile({ ...newFile, cabinetNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shelf</label>
                  <input
                    type="text"
                    value={newFile.shelfNumber}
                    onChange={(e) => setNewFile({ ...newFile, shelfNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Box</label>
                  <input
                    type="text"
                    value={newFile.boxNumber}
                    onChange={(e) => setNewFile({ ...newFile, boxNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contents Description</label>
                <textarea
                  rows="2"
                  value={newFile.documentDescription}
                  onChange={(e) => setNewFile({ ...newFile, documentDescription: e.target.value })}
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
                  {submitting ? "Saving..." : "Save File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check Out Modal */}
      {isCheckoutModalOpen && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Check Out Physical File</h3>
              <button onClick={() => setIsCheckoutModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCheckout} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Checking out file <strong className="text-gray-800">{selectedFile.fileId || selectedFile.fileCode}</strong> ({selectedFile.ownerName})
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Borrower Name / Officer *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Legal Counsel / Auditor"
                  value={checkoutData.borrowerName}
                  onChange={(e) => setCheckoutData({ ...checkoutData, borrowerName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Purpose of Access</label>
                <input
                  type="text"
                  placeholder="e.g. Annual Audit / Background Verification"
                  value={checkoutData.purpose}
                  onChange={(e) => setCheckoutData({ ...checkoutData, purpose: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Return Date</label>
                <input
                  type="date"
                  value={checkoutData.expectedReturnDate}
                  onChange={(e) => setCheckoutData({ ...checkoutData, expectedReturnDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCheckoutModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium"
                >
                  {submitting ? "Processing..." : "Confirm Checkout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {isReturnModalOpen && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Check In / Return to Vault</h3>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReturn} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Returning file <strong className="text-gray-800">{selectedFile.fileId || selectedFile.fileCode}</strong> to cabinet <strong className="text-gray-800">{selectedFile.cabinetNumber}</strong>
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Returned By</label>
                <input
                  type="text"
                  placeholder={selectedFile.currentBorrower || "Name"}
                  value={returnData.returnedBy}
                  onChange={(e) => setReturnData({ ...returnData, returnedBy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Condition on Return</label>
                <select
                  value={returnData.condition}
                  onChange={(e) => setReturnData({ ...returnData, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Good">Good / Intact</option>
                  <option value="Damaged">Slight Wear & Tear</option>
                  <option value="DocumentMissing">Document Missing</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Handover Notes</label>
                <textarea
                  rows="2"
                  value={returnData.notes}
                  onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Processing..." : "Confirm Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhysicalFiles;

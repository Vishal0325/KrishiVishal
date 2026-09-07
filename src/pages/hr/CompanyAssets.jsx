import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getCompanyAssets,
  createCompanyAsset,
  allocateCompanyAsset,
  returnCompanyAsset,
} from "../../services/hrExtendedService";
import { getEmployees, getRiderHRProfiles } from "../../services/workforceService";
import {
  Laptop,
  Smartphone,
  CreditCard,
  ShoppingBag,
  Shield,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  Wrench,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Tag,
  User
} from "lucide-react";

const categoryIcons = {
  Laptop: Laptop,
  Smartphone: Smartphone,
  POS_Device: CreditCard,
  Delivery_Bag: ShoppingBag,
  Uniform_TShirt: Shield,
  ID_Card: Tag,
  Vehicle: ShoppingBag,
};

const CompanyAssets = () => {
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [newAsset, setNewAsset] = useState({
    assetTag: "",
    name: "",
    category: "Laptop",
    serialNumber: "",
    modelNumber: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    purchaseCost: "",
    condition: "New",
  });

  const [allocationData, setAllocationData] = useState({
    assignedToType: "Employee",
    assignedToId: "",
    assignedToName: "",
    condition: "Good",
    notes: "",
  });

  const [returnData, setReturnData] = useState({
    condition: "Good",
    notes: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsData, empsData, ridersData] = await Promise.all([
        getCompanyAssets(),
        getEmployees(),
        getRiderHRProfiles(),
      ]);
      setAssets(assetsData);
      setEmployees(empsData);
      setRiders(ridersData);
    } catch (error) {
      console.error("Failed to load company assets data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    if (!newAsset.name) return;
    try {
      setSubmitting(true);
      await createCompanyAsset(newAsset);
      setIsAddModalOpen(false);
      setNewAsset({
        assetTag: "",
        name: "",
        category: "Laptop",
        serialNumber: "",
        modelNumber: "",
        purchaseDate: new Date().toISOString().split("T")[0],
        purchaseCost: "",
        condition: "New",
      });
      loadData();
    } catch (error) {
      console.error("Error creating asset:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssigneeSelect = (id) => {
    if (allocationData.assignedToType === "Employee") {
      const emp = employees.find((e) => e.id === id || e.employeeId === id);
      if (emp) {
        setAllocationData({
          ...allocationData,
          assignedToId: emp.employeeId || emp.id,
          assignedToName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name,
        });
      }
    } else {
      const rdr = riders.find((r) => r.id === id || r.hrRiderId === id);
      if (rdr) {
        setAllocationData({
          ...allocationData,
          assignedToId: rdr.hrRiderId || rdr.id,
          assignedToName: `${rdr.firstName || ""} ${rdr.lastName || ""}`.trim() || rdr.name,
        });
      }
    }
  };

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (!selectedAsset || !allocationData.assignedToId) return;
    try {
      setSubmitting(true);
      await allocateCompanyAsset(selectedAsset.id, allocationData);
      setIsAllocateModalOpen(false);
      setAllocationData({
        assignedToType: "Employee",
        assignedToId: "",
        assignedToName: "",
        condition: "Good",
        notes: "",
      });
      loadData();
    } catch (error) {
      console.error("Error allocating asset:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      setSubmitting(true);
      await returnCompanyAsset(selectedAsset.id, returnData);
      setIsReturnModalOpen(false);
      setReturnData({ condition: "Good", notes: "" });
      loadData();
    } catch (error) {
      console.error("Error returning asset:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      (asset.assetId && asset.assetId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (asset.name && asset.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (asset.serialNumber && asset.serialNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (asset.assignedToName && asset.assignedToName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === "ALL" || asset.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || asset.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Company Hardware & Asset Inventory"
          subtitle="Manage equipment, laptops, smartphones, POS terminals, uniforms, and custody allocation"
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Asset to Registry
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by tag, name, serial, holder..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="Laptop">Laptops</option>
              <option value="Smartphone">Smartphones</option>
              <option value="POS_Device">POS Terminals</option>
              <option value="Delivery_Bag">Delivery Bags</option>
              <option value="Uniform_TShirt">Uniforms & Merch</option>
              <option value="ID_Card">ID Badges</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_STOCK">In Stock (Available)</option>
              <option value="ALLOCATED">Allocated</option>
              <option value="UNDER_REPAIR">Under Repair</option>
              <option value="RETIRED">Retired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Laptop className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No assets found</p>
            <p className="text-xs text-gray-400 mt-1">Add devices and gear to track custody.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Asset Tag</th>
                  <th className="px-5 py-3.5">Asset Details</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Assigned Custody</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredAssets.map((asset) => {
                  const Icon = categoryIcons[asset.category] || Laptop;

                  return (
                    <tr key={asset.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                        {asset.assetId || asset.assetTag || asset.id}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{asset.name}</p>
                          <p className="text-xs text-gray-400">
                            SN: {asset.serialNumber || "N/A"} • Model: {asset.modelNumber || "N/A"}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md font-medium">
                          <Icon className="w-3.5 h-3.5 text-gray-500" />
                          {asset.category}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {asset.status === "ALLOCATED" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                            <CheckCircle2 className="w-3 h-3" /> Allocated
                          </span>
                        ) : asset.status === "UNDER_REPAIR" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                            <Wrench className="w-3 h-3" /> Repair
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <Clock className="w-3 h-3" /> In Stock
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {asset.assignedToName ? (
                          <div>
                            <p className="font-medium text-gray-900">{asset.assignedToName}</p>
                            <p className="text-gray-400">{asset.assignedToType} ({asset.assignedToId})</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not Assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {asset.status !== "ALLOCATED" ? (
                          <button
                            onClick={() => {
                              setSelectedAsset(asset);
                              setIsAllocateModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                          >
                            <ArrowUpRight className="w-3 h-3" /> Assign
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedAsset(asset);
                              setIsReturnModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            <ArrowDownLeft className="w-3 h-3" /> Return
                          </button>
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

      {/* Add Asset Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Add Company Asset</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="space-y-4 pt-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Asset Tag (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. AST-LAP-001"
                    value={newAsset.assetTag}
                    onChange={(e) => setNewAsset({ ...newAsset, assetTag: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={newAsset.category}
                    onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Smartphone">Smartphone</option>
                    <option value="POS_Device">POS Device</option>
                    <option value="Delivery_Bag">Delivery Bag</option>
                    <option value="Uniform_TShirt">Uniform / T-Shirt</option>
                    <option value="ID_Card">ID Badge</option>
                    <option value="Vehicle">Vehicle</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Asset Name / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ThinkPad E14 Gen 4"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    placeholder="e.g. PF3X8890"
                    value={newAsset.serialNumber}
                    onChange={(e) => setNewAsset({ ...newAsset, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 21E30067IN"
                    value={newAsset.modelNumber}
                    onChange={(e) => setNewAsset({ ...newAsset, modelNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={newAsset.purchaseDate}
                    onChange={(e) => setNewAsset({ ...newAsset, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 52000"
                    value={newAsset.purchaseCost}
                    onChange={(e) => setNewAsset({ ...newAsset, purchaseCost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
                >
                  {submitting ? "Saving..." : "Save Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Modal */}
      {isAllocateModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Assign Asset to Personnel</h3>
              <button onClick={() => setIsAllocateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAllocate} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Assigning <strong className="text-gray-800">{selectedAsset.name}</strong> ({selectedAsset.assetId || selectedAsset.assetTag})
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Personnel Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="personnelType"
                      checked={allocationData.assignedToType === "Employee"}
                      onChange={() => setAllocationData({ ...allocationData, assignedToType: "Employee", assignedToId: "", assignedToName: "" })}
                    />
                    Employee / Staff
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="personnelType"
                      checked={allocationData.assignedToType === "Rider"}
                      onChange={() => setAllocationData({ ...allocationData, assignedToType: "Rider", assignedToId: "", assignedToName: "" })}
                    />
                    Delivery Rider
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select {allocationData.assignedToType} *
                </label>
                <select
                  required
                  onChange={(e) => handleAssigneeSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Person --</option>
                  {allocationData.assignedToType === "Employee"
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Initial Condition</label>
                <select
                  value={allocationData.condition}
                  onChange={(e) => setAllocationData({ ...allocationData, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="New">Brand New / Sealed</option>
                  <option value="Good">Good Condition</option>
                  <option value="Fair">Fair / Slight Signs of Use</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Handover Notes</label>
                <textarea
                  rows="2"
                  value={allocationData.notes}
                  onChange={(e) => setAllocationData({ ...allocationData, notes: e.target.value })}
                  placeholder="Included charger, bag, mouse, serial verification..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
                >
                  {submitting ? "Assigning..." : "Confirm Handover"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {isReturnModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Receive Asset Return</h3>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReturn} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                Receiving <strong className="text-gray-800">{selectedAsset.name}</strong> from <strong className="text-gray-800">{selectedAsset.assignedToName}</strong>
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Return Condition</label>
                <select
                  value={returnData.condition}
                  onChange={(e) => setReturnData({ ...returnData, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Good">Good / Working</option>
                  <option value="Damaged">Damaged / Needs Repair</option>
                  <option value="Lost">Missing Accessories / Incomplete</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Inspection Notes</label>
                <textarea
                  rows="2"
                  value={returnData.notes}
                  onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                  placeholder="Physical inspection notes, screen condition, battery health..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
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

export default CompanyAssets;

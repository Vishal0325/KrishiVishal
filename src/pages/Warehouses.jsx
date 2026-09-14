import React, { useState, useEffect } from "react";
import { 
  Building2, 
  MapPin, 
  Phone, 
  User, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Truck, 
  Layers, 
  Edit3, 
  Trash2,
  PackageCheck,
  ArrowRightLeft,
  Loader2,
  X,
  Landmark,
  Package
} from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import HubConsoleModal from "../components/warehouses/HubConsoleModal";

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHub, setEditingHub] = useState(null);
  const [selectedConsoleHub, setSelectedConsoleHub] = useState(null);


  const initialForm = {
    code: "",
    name: "",
    type: "CENTRAL_DEPOT", // CENTRAL_DEPOT, REGIONAL_HUB, DARK_STORE
    address: "",
    district: "",
    pincode: "",
    managerName: "",
    phone: "",
    capacityMt: "",
    activeRiders: 0,
    serviceRadiusKm: "",
    isActive: true
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, "warehouses"), (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setWarehouses(list);
        } else {
          setWarehouses([]);
        }
        setLoading(false);
      }, (err) => {
        console.warn("Error fetching warehouses:", err);
        setWarehouses([]);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      setWarehouses([]);
      setLoading(false);
    }
  }, []);

  const handleSaveWarehouse = async (e) => {
    e.preventDefault();
    if (!formData.code && !editingHub) {
      toast.error("Warehouse Code is mandatory for new hubs.");
      return;
    }
    setSaving(true);
    try {
      const hubId = editingHub ? editingHub.id : formData.code.trim();
      await setDoc(doc(db, "warehouses", hubId), {
        ...formData,
        code: formData.code.trim(),
        capacityMt: Number(formData.capacityMt) || 0,
        activeRiders: Number(formData.activeRiders) || 0,
        serviceRadiusKm: Number(formData.serviceRadiusKm) || 0,
        id: hubId,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      toast.success(editingHub ? "Warehouse updated successfully!" : "New Regional Warehouse Hub created!");
      setIsModalOpen(false);
      setEditingHub(null);
      setFormData(initialForm);
    } catch (err) {
      toast.error("Failed to save warehouse: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWarehouse = async (hub) => {
    if (!window.confirm(`Are you sure you want to delete warehouse "${hub.name}" (${hub.code})? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "warehouses", hub.id));
      toast.success(`Warehouse "${hub.name}" deleted successfully`);
    } catch (err) {
      toast.error("Failed to delete warehouse: " + err.message);
    }
  };

  const handleToggleStatus = async (hub) => {
    try {
      await setDoc(doc(db, "warehouses", hub.id), {
        isActive: !hub.isActive
      }, { merge: true });
      toast.success(`${hub.name} status updated`);
    } catch (err) {
      setWarehouses(prev => prev.map(w => w.id === hub.id ? { ...w, isActive: !w.isActive } : w));
    }
  };

  const filtered = warehouses.filter(w => 
    (w.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.district || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.code || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Multi-Warehouse & Regional Hubs ERP"
        subtitle="Manage Purnea, Katihar, Araria regional depots, dark stores, and inter-hub stock allocations."
        actions={
          <button
            onClick={() => {
              setEditingHub(null);
              setFormData(initialForm);
              setIsModalOpen(true);
            }}
            className="bg-[#1b5e20] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95 cursor-pointer"
          >
            <Plus size={16} className="mr-2" />
            <span>Add Regional Hub</span>
          </button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Total Active Hubs
          </p>
          <h3 className="text-2xl font-black text-emerald-800 mt-1">
            {warehouses.filter(w => w.isActive).length} डिपो
          </h3>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            सक्रिय परिचालन क्षेत्र (Active Operating Zones)
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Total Storage Capacity
          </p>
          <h3 className="text-2xl font-black text-gray-900 mt-1">
            {warehouses.reduce((sum, w) => sum + Number(w.capacityMt || 0), 0)} MT
          </h3>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            मेट्रिक टन कुल खाद-बीज भंडारण क्षमता
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Total Fleet Riders
          </p>
          <h3 className="text-2xl font-black text-blue-600 mt-1">
            {warehouses.reduce((sum, w) => sum + Number(w.activeRiders || 0), 0)} राइडर्स
          </h3>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            सभी हब्स में तैनात डिलीवरी स्टाफ
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Stock Transfers (Inter-Hub)
          </p>
          <h3 className="text-2xl font-black text-amber-600 mt-1">
            Active
          </h3>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            हब-टू-हब माल ट्रांसफर की सुविधा
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search warehouses by name, district, or code..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900 shadow-sm"
        />
      </div>

      {/* Hub Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 text-center text-gray-400 font-bold">
          Loading regional hubs...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <Building2 size={28} className="text-emerald-600" />
          </div>
          <h3 className="text-lg font-black text-gray-900">कोई हब नहीं बनाया गया</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            अभी तक कोई Regional Hub / Warehouse नहीं बनाया गया है। पहला हब बनाने के लिए ऊपर <strong>"Add Regional Hub"</strong> बटन पर क्लिक करें।
          </p>
          <button
            onClick={() => {
              setEditingHub(null);
              setFormData(initialForm);
              setIsModalOpen(true);
            }}
            className="mt-6 bg-[#1b5e20] text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            पहला हब बनाएं
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((hub) => (
          <div 
            key={hub.id}
            className={`bg-white rounded-3xl border p-6 shadow-sm space-y-4 transition-all hover:shadow-md ${
              hub.isActive ? 'border-gray-100' : 'border-red-100 bg-red-50/20 opacity-75'
            }`}
          >
            {/* Top Badge & Type */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-black px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                {hub.code}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                  hub.type === 'CENTRAL_DEPOT' ? 'bg-purple-100 text-purple-800' :
                  hub.type === 'DARK_STORE' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {hub.type === 'CENTRAL_DEPOT' ? 'सेंट्रल डिपो' : hub.type === 'DARK_STORE' ? 'डार्क स्टोर' : 'रीजनल हब'}
                </span>
                <button
                  onClick={() => handleToggleStatus(hub)}
                  className={`h-2.5 w-2.5 rounded-full cursor-pointer transition-transform hover:scale-125 ${hub.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  title={hub.isActive ? 'Active Hub (Click to deactivate)' : 'Inactive Hub (Click to activate)'}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-black text-gray-900 leading-snug">
                {hub.name}
              </h3>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1 font-medium">
                <MapPin size={13} className="text-emerald-700 shrink-0" />
                <span>{hub.address || hub.district} (PIN: {hub.pincode || '—'})</span>
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50/75 rounded-2xl border border-gray-100 text-xs">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">प्रबंधक (Manager)</p>
                <p className="font-black text-gray-900 mt-0.5">{hub.managerName || '—'}</p>
                <p className="text-gray-500 text-[11px] font-mono">{hub.phone || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">डिलीवरी दायरा</p>
                <p className="font-black text-gray-900 mt-0.5">{hub.serviceRadiusKm || 0} km रेडियस</p>
                <p className="text-emerald-700 font-bold text-[11px]">{hub.activeRiders || 0} राइडर्स</p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-100">
              <span className="text-[11px] font-bold text-gray-500">
                भंडारण: <strong className="text-gray-900">{hub.capacityMt || 0} MT</strong>
              </span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedConsoleHub(hub)}
                  className="px-3.5 py-2 bg-[#0B4D31] text-white hover:bg-[#083a25] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  title="Open Hub 360° Stock Valuation & P&L Console"
                >
                  <Package size={14} />
                  <span>Hub 360° Console</span>
                </button>

                <button
                  onClick={() => {
                    setEditingHub(hub);
                    setFormData(hub);
                    setIsModalOpen(true);
                  }}
                  className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-all cursor-pointer"
                  title="Edit Warehouse"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => handleDeleteWarehouse(hub)}
                  className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                  title="Delete Warehouse"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Hub 360 Console Modal with Stock Valuation, Depot P&L, Fleet, and Transfers */}
      {selectedConsoleHub && (
        <HubConsoleModal
          hub={selectedConsoleHub}
          onClose={() => setSelectedConsoleHub(null)}
        />
      )}


      {/* Modal for Add / Edit Hub - Enhanced with full responsiveness & always-visible sticky footer */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200 my-auto max-h-[90vh] flex flex-col border border-gray-100">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">
                    {editingHub ? "Edit Regional Hub" : "Add New Warehouse Hub"}
                  </h3>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {editingHub ? "Update warehouse configuration" : "Provision a new regional depot or dark store"}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form with scrollable body */}
            <form onSubmit={handleSaveWarehouse} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Hub Code *</label>
                    <input
                      required
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. HUB-PUR-01"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold uppercase font-mono focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Hub Type</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    >
                      <option value="CENTRAL_DEPOT">सेंट्रल डिपो (Central Depot)</option>
                      <option value="REGIONAL_HUB">रीजनल डिपो (Regional Hub)</option>
                      <option value="DARK_STORE">क्विक डार्क स्टोर (Dark Store)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Hub Name *</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Purnea Central Agri Hub"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">District *</label>
                    <input
                      required
                      type="text"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      placeholder="e.g. Purnea"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pincode *</label>
                    <input
                      required
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      placeholder="e.g. 854301"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Storage (MT)</label>
                    <input
                      type="number"
                      value={formData.capacityMt}
                      onChange={(e) => setFormData({ ...formData, capacityMt: e.target.value })}
                      placeholder="e.g. 500"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Service Radius (km)</label>
                    <input
                      type="number"
                      value={formData.serviceRadiusKm}
                      onChange={(e) => setFormData({ ...formData, serviceRadiusKm: e.target.value })}
                      placeholder="e.g. 25"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Active Fleet Riders</label>
                    <input
                      type="number"
                      value={formData.activeRiders}
                      onChange={(e) => setFormData({ ...formData, activeRiders: e.target.value })}
                      placeholder="e.g. 8"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Manager Name</label>
                    <input
                      type="text"
                      value={formData.managerName}
                      onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Manager Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="e.g. +919876543210"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono focus:bg-white focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Full Address / Location Landmark</label>
                  <textarea
                    rows={2}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. Industrial Area, Phase 2, Near Gulabbagh Mandi"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-emerald-600 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="hubStatus"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 accent-[#1b5e20] cursor-pointer rounded"
                  />
                  <label htmlFor="hubStatus" className="text-xs font-bold text-gray-700 cursor-pointer">
                    हब को एक्टिव रखें (Mark as Active Operational Hub)
                  </label>
                </div>
              </div>

              {/* Sticky Footer: Always visible on all screens */}
              <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/90 rounded-b-3xl flex items-center gap-3 sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-[#1b5e20] hover:bg-[#2e7d32] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-green-900/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  <span>{editingHub ? "Save Changes" : "Confirm & Save Hub"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

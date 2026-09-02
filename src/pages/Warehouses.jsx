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
  ArrowRightLeft
} from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHub, setEditingHub] = useState(null);

  const initialForm = {
    code: "",
    name: "",
    type: "CENTRAL_DEPOT", // CENTRAL_DEPOT, REGIONAL_HUB, DARK_STORE
    address: "",
    district: "Purnea",
    pincode: "854301",
    managerName: "",
    phone: "",
    capacityMt: 500, // Metric Tonnes
    activeRiders: 12,
    serviceRadiusKm: 25,
    isActive: true
  };

  const [formData, setFormData] = useState(initialForm);

  // Standard Regional Hubs Defaults for Bihar Seemanchal Region
  const defaultHubs = [
    {
      id: "HUB-PUR-01",
      code: "HUB-PUR-01",
      name: "पूर्णिया सेंट्रल डिपो (Purnea Central Depot)",
      type: "CENTRAL_DEPOT",
      address: "गुलाबबाग एनएच-31 के पास, पूर्णिया",
      district: "Purnea",
      pincode: "854301",
      managerName: "आलोक कुमार (Alok Kumar)",
      phone: "9431200111",
      capacityMt: 1200,
      activeRiders: 18,
      serviceRadiusKm: 35,
      isActive: true,
      currentStockBags: 8400
    },
    {
      id: "HUB-GUL-02",
      code: "HUB-GUL-02",
      name: "गुलाबबाग मंडी क्विक डिपो (Gulabbagh Mandi Hub)",
      type: "DARK_STORE",
      address: "कृषि उपज मंडी प्रांगण, गुलाबबाग",
      district: "Purnea",
      pincode: "854302",
      managerName: "संजय वर्मा (Sanjay Verma)",
      phone: "9835122334",
      capacityMt: 400,
      activeRiders: 10,
      serviceRadiusKm: 15,
      isActive: true,
      currentStockBags: 3100
    },
    {
      id: "HUB-BAN-03",
      code: "HUB-BAN-03",
      name: "बनमनखी रीजनल डिपो (Banmankhi Hub)",
      type: "REGIONAL_HUB",
      address: "स्टेशन रोड, बनमनखी, पूर्णिया",
      district: "Purnea",
      pincode: "854303",
      managerName: "दीपक कुमार (Deepak Kumar)",
      phone: "7004188990",
      capacityMt: 600,
      activeRiders: 8,
      serviceRadiusKm: 25,
      isActive: true,
      currentStockBags: 4200
    },
    {
      id: "HUB-KAT-04",
      code: "HUB-KAT-04",
      name: "कटिहार डिपो (Katihar Regional Hub)",
      type: "REGIONAL_HUB",
      address: "मिरचाईबाड़ी, कटिहार",
      district: "Katihar",
      pincode: "854205",
      managerName: "राजीव रंजन (Rajiv Ranjan)",
      phone: "9430155667",
      capacityMt: 800,
      activeRiders: 14,
      serviceRadiusKm: 30,
      isActive: true,
      currentStockBags: 5900
    },
    {
      id: "HUB-ARA-05",
      code: "HUB-ARA-05",
      name: "अररिया डिपो (Araria Dark Store)",
      type: "DARK_STORE",
      address: "चांदनी चौक, अररिया कोर्ट",
      district: "Araria",
      pincode: "854315",
      managerName: "विकास झा (Vikas Jha)",
      phone: "9122344556",
      capacityMt: 350,
      activeRiders: 6,
      serviceRadiusKm: 20,
      isActive: true,
      currentStockBags: 2200
    }
  ];

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, "warehouses"), (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setWarehouses(list);
        } else {
          setWarehouses(defaultHubs);
        }
        setLoading(false);
      }, (err) => {
        console.warn("Using default warehouse list", err);
        setWarehouses(defaultHubs);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      setWarehouses(defaultHubs);
      setLoading(false);
    }
  }, []);

  const handleSaveWarehouse = async (e) => {
    e.preventDefault();
    try {
      const hubId = editingHub ? editingHub.id : (formData.code || `HUB-${Date.now()}`);
      await setDoc(doc(db, "warehouses", hubId), {
        ...formData,
        id: hubId,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      toast.success(editingHub ? "Warehouse updated!" : "New Regional Warehouse Hub created!");
      setIsModalOpen(false);
      setEditingHub(null);
      setFormData(initialForm);
    } catch (err) {
      toast.error("Failed to save warehouse: " + err.message);
    }
  };

  const handleToggleStatus = async (hub) => {
    try {
      await setDoc(doc(db, "warehouses", hub.id), {
        isActive: !hub.isActive
      }, { merge: true });
      toast.success(`${hub.name} status updated`);
    } catch (err) {
      // update local
      setWarehouses(prev => prev.map(w => w.id === hub.id ? { ...w, isActive: !w.isActive } : w));
    }
  };

  const filtered = warehouses.filter(w => 
    (w.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.district || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.code || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
            <Building2 size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Multi-Warehouse & Regional Hubs (मल्टी-वेयरहाउस प्रबंधन)
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              पूर्णिया, कटिहार, अररिया एवं अन्य क्षेत्रीय डिपो और डार्क स्टोर्स का प्रबंधन
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingHub(null);
            setFormData(initialForm);
            setIsModalOpen(true);
          }}
          className="flex items-center space-x-2 bg-emerald-800 hover:bg-emerald-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-800/20 active:scale-95 transition-all"
        >
          <Plus size={16} />
          <span>+ Add Regional Hub</span>
        </button>
      </div>

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
            पूर्णिया, कटिहार, अररिया जोन
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

      {/* Hub Cards Grid */}
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
                  className={`h-2.5 w-2.5 rounded-full ${hub.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  title={hub.isActive ? 'Active Hub' : 'Inactive'}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-black text-gray-900 leading-snug">
                {hub.name}
              </h3>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1 font-medium">
                <MapPin size={13} className="text-emerald-700 shrink-0" />
                <span>{hub.address} (PIN: {hub.pincode})</span>
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50/75 rounded-2xl border border-gray-100 text-xs">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">प्रबंधक (Manager)</p>
                <p className="font-black text-gray-900 mt-0.5">{hub.managerName}</p>
                <p className="text-gray-500 text-[11px] font-mono">{hub.phone}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">डिलीवरी दायरा</p>
                <p className="font-black text-gray-900 mt-0.5">{hub.serviceRadiusKm} km रेडियस</p>
                <p className="text-emerald-700 font-bold text-[11px]">{hub.activeRiders} राइडर्स</p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex items-center justify-between border-t border-gray-100">
              <span className="text-[11px] font-bold text-gray-500">
                भंडारण: <strong className="text-gray-900">{hub.capacityMt} MT</strong>
              </span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditingHub(hub);
                    setFormData(hub);
                    setIsModalOpen(true);
                  }}
                  className="p-2 bg-gray-100 text-gray-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-all"
                  title="Edit Warehouse"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Add / Edit Hub */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <h3 className="text-lg font-black text-gray-900">
                {editingHub ? "Edit Regional Hub" : "Add New Warehouse Hub"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Hub Code *</label>
                  <input
                    required
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. HUB-KTI-06"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold uppercase font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Hub Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  >
                    <option value="CENTRAL_DEPOT">सेंट्रल डिपो (Central Depot)</option>
                    <option value="REGIONAL_HUB">रीजनल डिपो (Regional Hub)</option>
                    <option value="DARK_STORE">क्विक डार्क स्टोर (Dark Store)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">Hub Name *</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. कसबा क्विक डिलीवरी डिपो"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">District *</label>
                  <input
                    required
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Pincode *</label>
                  <input
                    required
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Radius (km)</label>
                  <input
                    type="number"
                    value={formData.serviceRadiusKm}
                    onChange={(e) => setFormData({ ...formData, serviceRadiusKm: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Manager Name</label>
                  <input
                    type="text"
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Manager Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">Full Address</label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-800 text-white rounded-xl font-bold text-xs uppercase"
                >
                  Save Warehouse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

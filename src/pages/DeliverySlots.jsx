import React, { useState, useEffect } from "react";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Building2, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy 
} from "firebase/firestore";
import { db } from "../firebase/config";
import PageHeader from "../components/common/PageHeader";
import MetricCard from "../components/common/MetricCard";
import toast from "react-hot-toast";

export default function DeliverySlots() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterHub, setFilterHub] = useState("ALL");
  const [creating, setCreating] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "13:00",
    hubId: "HUB_PATNA_MAIN",
    maxCapacity: 30,
    isActive: true
  });

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "delivery_slots"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setSlots(items);
    } catch (err) {
      console.error("Error fetching delivery slots:", err);
      toast.error("Failed to load delivery slots: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.startTime || !formData.endTime || !formData.hubId) {
      toast.error("Please fill all required fields.");
      return;
    }

    setCreating(true);
    try {
      const slotId = `SLOT_${formData.date}_${formData.startTime.replace(":", "")}-${formData.endTime.replace(":", "")}_${formData.hubId}`;
      const slotRef = doc(db, "delivery_slots", slotId);

      await setDoc(slotRef, {
        slotId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        hubId: formData.hubId,
        maxCapacity: Number(formData.maxCapacity) || 30,
        currentBookings: 0,
        isActive: formData.isActive,
        createdAt: serverTimestamp()
      });

      toast.success("Delivery slot created successfully!");
      setShowModal(false);
      fetchSlots();
    } catch (err) {
      console.error("Failed to create slot:", err);
      toast.error("Failed to create slot: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleSlotStatus = async (slot) => {
    try {
      const slotRef = doc(db, "delivery_slots", slot.id);
      await updateDoc(slotRef, {
        isActive: !slot.isActive,
        updatedAt: serverTimestamp()
      });
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, isActive: !s.isActive } : s));
      toast.success(`Slot marked as ${!slot.isActive ? "Active" : "Inactive"}`);
    } catch (err) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleDeleteSlot = async (slot) => {
    const booked = Number(slot.currentBookings) || 0;
    if (booked > 0) {
      toast.error(`Cannot delete slot with ${booked} active booking(s) — deactivate the slot instead.`);
      return;
    }
    if (!window.confirm("Are you sure you want to delete this delivery slot?")) return;
    try {
      await deleteDoc(doc(db, "delivery_slots", slot.id));
      setSlots(prev => prev.filter(s => s.id !== slot.id));
      toast.success("Slot deleted.");
    } catch (err) {
      toast.error("Failed to delete: " + err.message);
    }
  };

  // Filtered List
  const filteredSlots = slots.filter(s => {
    const matchDate = !filterDate || s.date === filterDate;
    const matchHub = filterHub === "ALL" || s.hubId === filterHub;
    return matchDate && matchHub;
  });

  const totalCapacity = slots.reduce((sum, s) => sum + (Number(s.maxCapacity) || 0), 0);
  const totalBooked = slots.reduce((sum, s) => sum + (Number(s.currentBookings) || 0), 0);
  const activeCount = slots.filter(s => s.isActive).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Delivery Slot Management"
        description="Configure dispatch time-windows, capacity limits, and monitor booking utilization per hub."
        action={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B4D31] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#083b25] transition-all shadow-sm"
          >
            <Plus size={16} />
            <span>Create New Slot</span>
          </button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Configured Slots" value={slots.length} icon={Calendar} color="indigo" />
        <MetricCard label="Active Slots" value={activeCount} icon={CheckCircle2} color="green" />
        <MetricCard label="Total Capacity" value={totalCapacity} icon={Users} color="blue" />
        <MetricCard label="Total Booked Orders" value={totalBooked} icon={Clock} color="purple" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Calendar size={15} className="text-gray-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Building2 size={15} className="text-gray-400" />
            <select
              value={filterHub}
              onChange={(e) => setFilterHub(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="ALL">All Hubs</option>
              <option value="HUB_PATNA_MAIN">Patna Central Hub</option>
              <option value="HUB_PURNEA_MAIN">Purnea Depot Hub</option>
              <option value="HUB_GAYA_MAIN">Gaya Rural Hub</option>
            </select>
          </div>

          {(filterDate || filterHub !== "ALL") && (
            <button
              onClick={() => { setFilterDate(""); setFilterHub("ALL"); }}
              className="text-xs text-red-600 font-bold hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>

        <button
          onClick={fetchSlots}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all"
          title="Refresh Slots"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Slots Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 className="animate-spin text-[#0B4D31]" size={32} />
            <p className="text-xs font-bold">Loading delivery slots...</p>
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Calendar size={40} className="mx-auto mb-2 opacity-30" />
            <p className="font-bold text-sm">No delivery slots found for selected criteria.</p>
            <p className="text-xs text-gray-400 mt-1">Create a new slot to enable time-window dispatch.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-black uppercase text-gray-500 tracking-wider">
                  <th className="p-4">Date & Slot</th>
                  <th className="p-4">Hub Location</th>
                  <th className="p-4">Capacity Utilization</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredSlots.map(slot => {
                  const max = Number(slot.maxCapacity) || 0;
                  const booked = Number(slot.currentBookings) || 0;
                  const pct = max > 0 ? Math.min(100, Math.round((booked / max) * 100)) : 0;

                  return (
                    <tr key={slot.id} className="hover:bg-gray-50/80 transition-all">
                      <td className="p-4">
                        <div className="font-bold text-gray-900">{slot.date}</div>
                        <div className="text-gray-500 flex items-center gap-1 mt-0.5 font-medium">
                          <Clock size={12} />
                          {slot.startTime} – {slot.endTime}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-gray-800 flex items-center gap-1.5">
                          <Building2 size={13} className="text-[#0B4D31]" />
                          {slot.hubId}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="w-48">
                          <div className="flex justify-between text-[11px] font-bold mb-1">
                            <span>{booked} / {max} booked</span>
                            <span className={pct >= 90 ? "text-red-600" : "text-gray-600"}>{pct}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[#0B4D31]"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleSlotStatus(slot)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                            slot.isActive 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                              : "bg-gray-100 text-gray-600 border border-gray-200"
                          }`}
                        >
                          {slot.isActive ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {slot.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteSlot(slot)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
                          title="Delete slot"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Slot Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-black text-gray-900">Create New Delivery Slot</h3>
            <form onSubmit={handleCreateSlot} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Dispatch Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Dispatch Hub</label>
                <select
                  value={formData.hubId}
                  onChange={(e) => setFormData({ ...formData, hubId: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                >
                  <option value="HUB_PATNA_MAIN">Patna Central Hub</option>
                  <option value="HUB_PURNEA_MAIN">Purnea Depot Hub</option>
                  <option value="HUB_GAYA_MAIN">Gaya Rural Hub</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Max Capacity (Orders)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={formData.maxCapacity}
                  onChange={(e) => setFormData({ ...formData, maxCapacity: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded text-[#0B4D31]"
                />
                <label htmlFor="isActive" className="font-bold text-gray-700 cursor-pointer">
                  Activate slot immediately for booking
                </label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-[#0B4D31] text-white font-bold rounded-xl hover:bg-[#083b25] transition-all flex items-center gap-2"
                >
                  {creating && <Loader2 className="animate-spin" size={14} />}
                  <span>Save Slot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

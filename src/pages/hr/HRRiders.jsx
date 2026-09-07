import React, { useState, useEffect } from "react";
import {
  Bike, Plus, Search, Loader2, ShieldCheck, AlertTriangle
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import MetricCard from "../../components/common/MetricCard";
import StatusBadge from "../../components/common/StatusBadge";
import { getRiderHRProfiles, createRiderHRProfile } from "../../services/workforceService";

const HRRiders = () => {
  const navigate = useNavigate();
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    operationalRiderId: "",
    status: "Active"
  });

  useEffect(() => {
    fetchRiders();
  }, []);

  const fetchRiders = async () => {
    setLoading(true);
    try {
      const data = await getRiderHRProfiles();
      setRiders(data);
    } catch (err) {
      toast.error("Failed to load HR riders");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const newId = await createRiderHRProfile({
        ...formData,
        displayName: `${formData.firstName} ${formData.lastName}`,
      }, formData.operationalRiderId);
      
      toast.success(`Rider HR Profile ${newId} created successfully`);
      setIsModalOpen(false);
      setFormData({
        firstName: "", lastName: "", phone: "", operationalRiderId: "", status: "Active"
      });
      fetchRiders();
    } catch (error) {
      toast.error("Failed to create profile");
    } finally {
      setSaving(false);
    }
  };

  const filteredRiders = riders.filter(r =>
    (r.displayName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.hrRiderId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.riderId || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "HR ID",
      render: (r) => <span className="font-mono font-bold text-gray-700">{r.hrRiderId}</span>,
    },
    {
      header: "Operational ID",
      render: (r) => <span className="font-mono text-gray-500 text-xs">{r.riderId || 'Unlinked'}</span>,
    },
    {
      header: "Rider",
      render: (r) => (
        <div>
          <div className="font-bold text-gray-900">{r.displayName}</div>
          <div className="text-xs text-gray-500">{r.phone}</div>
        </div>
      ),
    },
    {
      header: "Status",
      render: (r) => {
        const type = r.status === "Active" ? "success" 
                   : r.status === "Exited" ? "error" : "warning";
        return <StatusBadge status={r.status} type={type} />;
      },
    },
    {
      header: "Actions",
      render: (r) => (
        <button
          onClick={() => navigate(`/hr/riders/${r.hrRiderId}`)}
          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
        >
          View Profile
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Rider HR Profiles"
        subtitle="Manage HR data and compliance records for the delivery fleet"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2e7d32] transition-colors"
          >
            <Plus size={18} /> Link Rider HR Profile
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Profiles"
          value={riders.length}
          icon={Bike}
          color="blue"
        />
        <MetricCard
          title="Compliant (Mock)"
          value={riders.filter(r => r.status === "Active").length}
          icon={ShieldCheck}
          color="green"
        />
        <MetricCard
          title="Non-Compliant (Mock)"
          value={0}
          icon={AlertTriangle}
          color="orange"
        />
      </div>

      <div className="flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
        <Search className="text-gray-400 mr-2" size={20} />
        <input
          type="text"
          placeholder="Search by ID or name..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={filteredRiders} loading={loading} />

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">Link HR Profile</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            
            <div className="p-6">
              <form id="add-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Operational Rider ID (users uid) *</label>
                  <input
                    required
                    type="text"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500"
                    value={formData.operationalRiderId}
                    onChange={(e) => setFormData({ ...formData, operationalRiderId: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">This links the HR profile to the active operational rider.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">First Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Last Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Phone *</label>
                  <input
                    required
                    type="tel"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-form"
                disabled={saving}
                className="bg-[#1b5e20] text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : "Create Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HRRiders;

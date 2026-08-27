import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Edit2,
  ShieldAlert,
  ShieldCheck,
  Search,
  AlertCircle,
  Loader2,
  UserX,
  UserCheck
} from "lucide-react";
import toast from "react-hot-toast";
import DataTable from "../components/common/DataTable";
import { getAllStaff, createStaffMember, updateStaffDetails } from "../services/staffManagement";
import { useAuth } from "../hooks/useAuth";

const ROLES = [
  { id: "SuperAdmin", label: "Super Admin", desc: "Full access to everything" },
  { id: "CatalogManager", label: "Catalog Manager", desc: "Can manage products and categories" },
  { id: "OrderManager", label: "Order Manager", desc: "Can manage orders and returns" },
  { id: "Viewer", label: "Viewer", desc: "Can only view data, no edit rights" }
];

const Staff = () => {
  const { user: currentUser } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "Viewer"
  });

  const [editingStaff, setEditingStaff] = useState(null);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const data = await getAllStaff();
      setStaffList(data);
    } catch (err) {
      toast.error("Failed to load staff list");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStaff) {
        // Update Role
        await updateStaffDetails(editingStaff.id, { role: formData.role });
        toast.success("Staff role updated successfully");
      } else {
        // Create new
        if (formData.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setSaving(false);
          return;
        }
        await createStaffMember(formData.email, formData.password, formData.name, formData.role);
        toast.success("New staff member created");
      }
      closeModal();
      fetchStaff();
    } catch (err) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (staff) => {
    if (staff.id === currentUser?.uid) {
      toast.error("You cannot block your own account!");
      return;
    }
    const newStatus = staff.isActive === false ? true : false;
    try {
      await updateStaffDetails(staff.id, { isActive: newStatus });
      toast.success(`Staff member ${newStatus ? 'unblocked' : 'blocked'}`);
      fetchStaff();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStaff(null);
    setFormData({ name: "", email: "", password: "", role: "Viewer" });
  };

  const openEdit = (staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name || "",
      email: staff.email || "",
      password: "", // Password cannot be edited here
      role: staff.role || "Viewer"
    });
    setIsModalOpen(true);
  };

  const filteredStaff = staffList.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Name",
      render: (s) => (
        <div>
          <div className="font-bold text-gray-900">{s.name || "N/A"}</div>
          <div className="text-xs text-gray-400">{s.email}</div>
        </div>
      )
    },
    {
      header: "Role",
      render: (s) => (
        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-blue-100">
          {s.role || "Viewer"}
        </span>
      )
    },
    {
      header: "Status",
      render: (s) => {
        const active = s.isActive !== false;
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${active ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {active ? "Active" : "Blocked"}
          </span>
        );
      }
    },
    {
      header: "Actions",
      render: (s) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openEdit(s)}
            className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all shadow-sm"
            title="Edit Role"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => toggleStatus(s)}
            disabled={s.id === currentUser?.uid}
            className={`p-2 rounded-lg transition-all shadow-sm ${s.isActive === false ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={s.isActive === false ? 'Unblock' : 'Block'}
          >
            {s.isActive === false ? <UserCheck size={16} /> : <UserX size={16} />}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Users className="mr-3 text-primary" size={28} />
          Staff Management
        </h1>
        <button
          onClick={() => {
            setFormData({ name: "", email: "", password: "", role: "Viewer" });
            setEditingStaff(null);
            setIsModalOpen(true);
          }}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:rotate-90 transition-transform" />
          Add New Staff
        </button>
      </div>

      <div className="flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
        <Search className="text-gray-400 mr-2" size={20} />
        <input
          type="text"
          placeholder="Search staff by name or email..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={filteredStaff} loading={loading} />

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
                {editingStaff ? "Edit Staff Role" : "Add New Staff"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar">
              <form id="staff-form" onSubmit={handleSubmit} className="space-y-6">
                {!editingStaff && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Temporary Password</label>
                      <input
                        required
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="Min 6 characters"
                      />
                    </div>
                  </>
                )}

                {editingStaff && (
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mb-6">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Editing User</p>
                    <p className="text-lg font-black text-gray-900">{formData.name}</p>
                    <p className="text-xs font-bold text-gray-500">{formData.email}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign Role</label>
                  <div className="grid grid-cols-1 gap-4">
                    {ROLES.map(role => (
                      <label
                        key={role.id}
                        className={`flex items-start p-5 rounded-2xl border-2 cursor-pointer transition-all ${formData.role === role.id ? 'border-primary bg-green-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={role.id}
                          checked={formData.role === role.id}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                          className="mt-1 w-4 h-4 text-primary bg-gray-100 border-gray-300 focus:ring-primary focus:ring-2"
                        />
                        <div className="ml-4">
                          <p className="text-sm font-black text-gray-900">{role.label}</p>
                          <p className="text-xs font-bold text-gray-500 mt-1">{role.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <div className="px-8 py-6 border-t border-gray-50 bg-gray-50/50 flex justify-end space-x-4">
              <button
                onClick={closeModal}
                className="px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="staff-form"
                disabled={saving}
                className="bg-[#1b5e20] text-white px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-95 disabled:opacity-70 flex items-center"
              >
                {saving ? <Loader2 className="animate-spin mr-2" size={20} /> : null}
                {saving ? "Saving..." : editingStaff ? "Update Role" : "Create Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staff;

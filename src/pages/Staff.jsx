import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Edit2,
  ShieldCheck,
  Search,
  AlertCircle,
  Loader2,
  UserX,
  UserCheck,
  Building2,
  Network,
  AlertTriangle,
  ArrowRight,
  Clock,
  Briefcase,
  Layers,
  Crown
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import MetricCard from "../components/common/MetricCard";
import OrgChart from "../components/staff/OrgChart";
import { getAllStaff, createStaffMember, updateStaffDetails } from "../services/staffManagement";
import { 
  HIERARCHY_LEVELS, 
  DEPARTMENTS, 
  DEFAULT_ESCALATION_RULES, 
  getDirectReportees 
} from "../services/hierarchyService";
import { useAuth } from "../hooks/useAuth";

const ROLES = [
  { id: "SuperAdmin", label: "Super Admin", desc: "Full access to everything" },
  { id: "HubManager", label: "Hub / Warehouse Manager", desc: "Manages regional hub orders, dispatch, packing, and local rider fleet" },
  { id: "CatalogManager", label: "Catalog Manager", desc: "Can manage products and categories" },
  { id: "OrderManager", label: "Order Manager", desc: "Can manage orders and returns" },
  { id: "HRAdmin", label: "HR Admin", desc: "Full HR and document management" },
  { id: "HRExecutive", label: "HR Executive", desc: "Upload and review documents" },
  { id: "FinanceAdmin", label: "Finance Admin", desc: "Payroll, bank, and tax documents" },
  { id: "OperationsAdmin", label: "Operations Admin", desc: "Operational data management" },
  { id: "RiderManager", label: "Rider Manager", desc: "Rider operations and compliance documents" },
  { id: "DepartmentManager", label: "Department Manager", desc: "Manage own department documents" },
  { id: "Auditor", label: "Auditor", desc: "Read-only access to authorized records" },
  { id: "Viewer", label: "Viewer", desc: "Can only view data, no edit rights" }
];

const Staff = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("staff"); // "staff" | "hierarchy" | "escalation"
  const [staffList, setStaffList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "Viewer",
    warehouseId: "",
    designation: "",
    department: "OPERATIONS",
    hierarchyLevel: 4,
    reportsTo: ""
  });

  const [editingStaff, setEditingStaff] = useState(null);

  useEffect(() => {
    fetchStaff();
    const unsubWh = onSnapshot(collection(db, "warehouses"), (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubWh();
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

  const getWarehouseName = (whId) => {
    if (!whId) return "All Hubs (Global)";
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? wh.name : whId;
  };

  const getManagerName = (managerId) => {
    if (!managerId) return "Direct to Board / MD";
    const mgr = staffList.find(s => s.id === managerId);
    return mgr ? `${mgr.name || mgr.email} (${mgr.designation || mgr.role})` : managerId;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStaff) {
        // Prevent setting reportsTo to self
        if (formData.reportsTo && formData.reportsTo === editingStaff.id) {
          toast.error("A staff member cannot report to themselves!");
          setSaving(false);
          return;
        }

        // Update Role, Warehouse & Hierarchy Details
        await updateStaffDetails(editingStaff.id, { 
          role: formData.role,
          warehouseId: formData.warehouseId || null,
          designation: formData.designation || "",
          department: formData.department || "OPERATIONS",
          hierarchyLevel: Number(formData.hierarchyLevel) || 4,
          reportsTo: formData.reportsTo || null
        });
        toast.success("Staff & hierarchy details updated successfully");
      } else {
        // Create new
        if (formData.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setSaving(false);
          return;
        }
        await createStaffMember(
          formData.email, 
          formData.password, 
          formData.name, 
          formData.role, 
          formData.warehouseId || null,
          {
            designation: formData.designation,
            department: formData.department,
            hierarchyLevel: formData.hierarchyLevel,
            reportsTo: formData.reportsTo
          }
        );
        toast.success("New staff member created with reporting line");
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
    setFormData({ 
      name: "", 
      email: "", 
      password: "", 
      role: "Viewer", 
      warehouseId: "",
      designation: "",
      department: "OPERATIONS",
      hierarchyLevel: 4,
      reportsTo: ""
    });
  };

  const openEdit = (staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name || "",
      email: staff.email || "",
      password: "", // Password cannot be edited here
      role: staff.role || "Viewer",
      warehouseId: staff.warehouseId || "",
      designation: staff.designation || "",
      department: staff.department || "OPERATIONS",
      hierarchyLevel: staff.hierarchyLevel || 4,
      reportsTo: staff.reportsTo || ""
    });
    setIsModalOpen(true);
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch = 
      (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.designation || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter === "ALL" || s.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const columns = [
    {
      header: "Staff & Designation",
      render: (s) => {
        const levelInfo = HIERARCHY_LEVELS.find(l => l.level === Number(s.hierarchyLevel || 4)) || HIERARCHY_LEVELS[3];
        const reportees = getDirectReportees(s.id, staffList);
        return (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-black text-xs text-gray-700 uppercase shrink-0">
              {(s.name || s.email || "A").charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-gray-900 text-xs">{s.name || "N/A"}</span>
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded border ${levelInfo.color}`}>
                  {levelInfo.code}
                </span>
              </div>
              <div className="text-[11px] font-bold text-[#0B4D31]">{s.designation || "Staff Member"}</div>
              <div className="text-[10px] text-gray-400 font-medium">{s.email}</div>
              {reportees.length > 0 && (
                <span className="inline-block mt-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                  👥 {reportees.length} Direct Reportees
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      header: "Department",
      render: (s) => {
        const deptObj = DEPARTMENTS.find(d => d.id === s.department);
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gray-50 text-gray-700 border border-gray-200">
            <Briefcase size={12} className="mr-1.5 text-gray-500" />
            {deptObj ? deptObj.name : (s.department || "General")}
          </span>
        );
      }
    },
    {
      header: "Reporting Manager (Reports To)",
      render: (s) => {
        if (!s.reportsTo) {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
              <Crown size={12} className="mr-1 text-purple-600" />
              Board / Managing Director
            </span>
          );
        }
        const manager = staffList.find(m => m.id === s.reportsTo);
        return (
          <div className="text-xs">
            <div className="font-bold text-gray-900 flex items-center gap-1">
              <ArrowRight size={11} className="text-[#0B4D31]" />
              {manager ? (manager.name || manager.email) : s.reportsTo}
            </div>
            {manager?.designation && (
              <div className="text-[10px] text-gray-400 font-medium pl-4">{manager.designation}</div>
            )}
          </div>
        );
      }
    },
    {
      header: "Assigned Hub",
      render: (s) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
          <Building2 size={12} className="mr-1.5 text-blue-500" />
          {getWarehouseName(s.warehouseId)}
        </span>
      )
    },
    {
      header: "System Role",
      render: (s) => {
        const r = ROLES.find((role) => role.id === s.role) || { label: s.role || "Viewer" };
        const isSuper = s.role === "SuperAdmin";
        const isHubMgr = s.role === "HubManager";
        return (
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              isSuper
                ? "bg-purple-50 text-purple-700 border border-purple-100"
                : isHubMgr
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {isSuper && <ShieldCheck size={12} className="mr-1 text-purple-600" />}
            {isHubMgr && <Building2 size={12} className="mr-1 text-emerald-600" />}
            {r.label}
          </span>
        );
      }
    },
    {
      header: "Status",
      render: (s) => {
        const active = s.isActive !== false;
        return (
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
              active
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
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
            className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-all shadow-sm"
            title="Edit Role, Hub & Reporting Line"
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

  // KPI Metrics
  const staffMetrics = {
    total: staffList.length,
    superAdmin: staffList.filter(s => s.role === 'SuperAdmin').length,
    hubManagers: staffList.filter(s => s.role === 'HubManager').length,
    active: staffList.filter(s => s.isActive !== false).length,
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Admin Staff, Reporting Hierarchy & Escalation"
        subtitle="Manage 50+ admins, assign reporting managers, inspect the corporate org chart, and configure SLA escalation matrix."
        actions={[
          {
            label: 'Add New Staff',
            icon: Plus,
            onClick: () => {
              setFormData({ 
                name: "", 
                email: "", 
                password: "", 
                role: "Viewer",
                warehouseId: "",
                designation: "",
                department: "OPERATIONS",
                hierarchyLevel: 4,
                reportsTo: ""
              });
              setEditingStaff(null);
              setIsModalOpen(true);
            },
            variant: 'primary'
          }
        ]}
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Admins & Staff" value={staffMetrics.total} icon={Users} color="blue" />
        <MetricCard label="Super Admins (L1)" value={staffMetrics.superAdmin} icon={Crown} color="purple" />
        <MetricCard label="Hub Managers (L3)" value={staffMetrics.hubManagers} icon={Building2} color="green" />
        <MetricCard label="Active Personnel" value={staffMetrics.active} icon={UserCheck} color="indigo" />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "staff"
              ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/20"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          <Users size={16} />
          <span>Staff & Reporting Directory</span>
        </button>

        <button
          onClick={() => setActiveTab("hierarchy")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "hierarchy"
              ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/20"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          <Network size={16} />
          <span>Interactive Visual Org Chart</span>
        </button>

        <button
          onClick={() => setActiveTab("escalation")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "escalation"
              ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/20"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          <AlertTriangle size={16} />
          <span>Escalation Matrix & SLA Governance</span>
        </button>
      </div>

      {/* TAB 1: Staff Directory */}
      {activeTab === "staff" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center flex-1">
              <Search className="text-gray-400 mr-2 ml-2" size={18} />
              <input
                type="text"
                placeholder="Search staff by name, email, or designation..."
                className="bg-transparent border-none outline-none w-full font-bold text-xs text-gray-700 placeholder:text-gray-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Dept:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
              >
                <option value="ALL">All Departments</option>
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DataTable columns={columns} data={filteredStaff} loading={loading} />
        </div>
      )}

      {/* TAB 2: Visual Org Chart */}
      {activeTab === "hierarchy" && (
        <OrgChart staffList={staffList} warehouses={warehouses} />
      )}

      {/* TAB 3: Escalation Matrix */}
      {activeTab === "escalation" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-gray-900">Enterprise SLA Escalation Matrix</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Automated breach notifications routed along the reporting hierarchy ladder (L1 $\rightarrow$ L2 $\rightarrow$ L3).
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-black uppercase">
                Active Governance
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4">Rule Code</th>
                    <th className="py-3 px-4">Operational Category</th>
                    <th className="py-3 px-4">Breach Condition</th>
                    <th className="py-3 px-4">Level 1 Responder</th>
                    <th className="py-3 px-4">Level 2 Escalation</th>
                    <th className="py-3 px-4">Level 3 Director/MD</th>
                    <th className="py-3 px-4">SLA Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-semibold text-gray-700">
                  {DEFAULT_ESCALATION_RULES.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-900">{rule.id}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-900 block">{rule.category}</span>
                        <span className="text-[10px] text-gray-400 uppercase">{rule.department}</span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 max-w-xs">{rule.condition}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-bold text-[11px] border border-blue-100">
                          {rule.level1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded font-bold text-[11px] border border-indigo-100">
                          {rule.level2}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-800 rounded font-bold text-[11px] border border-purple-100">
                          {rule.level3}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full font-black text-[10px] border border-green-200">
                          {rule.sla}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Staff & Hierarchy Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center">
                  {editingStaff ? "Edit Staff & Reporting Hierarchy" : "Add New Staff Member"}
                </h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  Configure role, regional depot, and direct reporting manager.
                </p>
              </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-xs text-gray-900"
                        placeholder="e.g. Ramesh Singh"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-xs text-gray-900"
                        placeholder="ramesh@krishivishal.com"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Temporary Password</label>
                      <input
                        required
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-xs text-gray-900"
                        placeholder="Min 6 characters"
                      />
                    </div>
                  </div>
                )}

                {editingStaff && (
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Editing Personnel</p>
                      <p className="text-base font-black text-gray-900 mt-0.5">{formData.name}</p>
                      <p className="text-xs font-bold text-gray-500">{formData.email}</p>
                    </div>
                    <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold">
                      {formData.role}
                    </span>
                  </div>
                )}

                {/* Hierarchy & Designation Fields */}
                <div className="p-5 bg-green-50/50 rounded-2xl border border-green-100 space-y-4">
                  <h4 className="text-xs font-black text-[#0B4D31] uppercase tracking-wider flex items-center gap-1.5">
                    <Network size={14} /> Reporting Line & Designation
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Official Designation / Title</label>
                      <input
                        type="text"
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B4D31] outline-none text-xs font-bold text-gray-900"
                        placeholder="e.g. Purnea Hub Inward Lead"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Department</label>
                      <select
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B4D31] outline-none text-xs font-bold text-gray-900"
                      >
                        {DEPARTMENTS.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hierarchy Level</label>
                      <select
                        value={formData.hierarchyLevel}
                        onChange={(e) => setFormData({ ...formData, hierarchyLevel: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B4D31] outline-none text-xs font-bold text-gray-900"
                      >
                        {HIERARCHY_LEVELS.map(lvl => (
                          <option key={lvl.level} value={lvl.level}>
                            {lvl.code} - {lvl.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Reports To (Direct Manager)</label>
                      <select
                        value={formData.reportsTo}
                        onChange={(e) => setFormData({ ...formData, reportsTo: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B4D31] outline-none text-xs font-bold text-gray-900"
                      >
                        <option value="">👑 Top Leadership / Managing Director</option>
                        {staffList
                          .filter(s => !editingStaff || s.id !== editingStaff.id)
                          .map(mgr => (
                            <option key={mgr.id} value={mgr.id}>
                              👤 {mgr.name || mgr.email} ({mgr.designation || mgr.role})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign Regional Hub / Warehouse</label>
                  <select
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-xs text-gray-900"
                  >
                    <option value="">🏢 All Hubs / Global Operations (SuperAdmin / Central)</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        📍 {wh.name} ({wh.code || wh.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign System Role</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto custom-scrollbar p-1">
                    {ROLES.map(role => (
                      <label
                        key={role.id}
                        className={`flex items-start p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${formData.role === role.id ? 'border-primary bg-green-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={role.id}
                          checked={formData.role === role.id}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                          className="mt-0.5 w-4 h-4 text-primary bg-gray-100 border-gray-300 focus:ring-primary focus:ring-2"
                        />
                        <div className="ml-3">
                          <p className="text-xs font-black text-gray-900">{role.label}</p>
                          <p className="text-[10px] font-bold text-gray-500 mt-0.5 line-clamp-1">{role.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <div className="px-8 py-5 border-t border-gray-50 bg-gray-50/50 flex justify-end space-x-4">
              <button
                onClick={closeModal}
                className="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="staff-form"
                disabled={saving}
                className="bg-[#0B4D31] text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-[#083a25] transition-all active:scale-95 disabled:opacity-70 flex items-center"
              >
                {saving ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                {saving ? "Saving..." : editingStaff ? "Update Staff Details" : "Create Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staff;


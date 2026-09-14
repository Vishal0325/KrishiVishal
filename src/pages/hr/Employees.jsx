import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  Loader2,
  Briefcase,
  UserCheck,
  UserX,
  FileText,
  Building2,
  Download,
  Filter,
  RefreshCw,
  Mail,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Award
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import MetricCard from "../../components/common/MetricCard";
import StatusBadge from "../../components/common/StatusBadge";
import { getEmployees, createEmployee } from "../../services/workforceService";
import { useAuth } from "../../hooks/useAuth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";

const DEPARTMENTS = [
  "All Departments",
  "Operations",
  "Supply Chain & Logistics",
  "Agronomy & Advisory",
  "Finance & Accounts",
  "Human Resources",
  "Technology & Product",
  "Sales & Marketing"
];

const Employees = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("All Departments");
  const [selectedHub, setSelectedHub] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, Active, Probation, Exited, Draft
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    departmentId: "Operations",
    designationId: "Executive",
    employmentType: "Full-Time",
    warehouseId: "",
    status: "Active"
  });

  // Fetch warehouses for multi-hub assignment
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "warehouses"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWarehouses(list);
      if (list.length > 0 && !formData.warehouseId) {
        setFormData(prev => ({ ...prev, warehouseId: list[0].id }));
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const newId = await createEmployee({
        ...formData,
        displayName: `${formData.firstName} ${formData.lastName}`.trim(),
        joiningDate: new Date().toISOString()
      });
      toast.success(`Employee ${newId} created successfully`);
      setIsModalOpen(false);
      setFormData({
        firstName: "", lastName: "", email: "", phone: "",
        departmentId: "Operations", designationId: "Executive",
        employmentType: "Full-Time", warehouseId: warehouses[0]?.id || "", status: "Active"
      });
      fetchEmployees();
    } catch (error) {
      toast.error("Failed to create employee");
    } finally {
      setSaving(false);
    }
  };

  const getWarehouseName = (whId) => {
    if (!whId) return "Head Office / Corporate";
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? wh.name : whId;
  };

  // Filtered dataset
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = 
        (emp.displayName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.employeeId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.phone || "").includes(searchTerm);

      const matchesDept = selectedDept === "All Departments" || emp.departmentId === selectedDept;
      const matchesHub = selectedHub === "ALL" || emp.warehouseId === selectedHub;
      const matchesStatus = statusFilter === "ALL" || emp.status === statusFilter;

      return matchesSearch && matchesDept && matchesHub && matchesStatus;
    });
  }, [employees, searchTerm, selectedDept, selectedHub, statusFilter]);

  // Paginated slice
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredEmployees.length / pageSize) || 1;

  // Stats calculation
  const stats = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter(e => e.status === "Active").length,
      probation: employees.filter(e => e.status === "Probation").length,
      exited: employees.filter(e => e.status === "Exited").length
    };
  }, [employees]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredEmployees.length === 0) {
      toast.error("No employee records to export");
      return;
    }

    const headers = ["Employee ID", "Full Name", "Email", "Phone", "Department", "Designation", "Hub/Branch", "Employment Type", "Status", "Joining Date"];
    const rows = filteredEmployees.map(e => [
      e.employeeId || e.id,
      `"${e.displayName || ''}"`,
      e.email || '',
      e.phone || '',
      `"${e.departmentId || ''}"`,
      `"${e.designationId || ''}"`,
      `"${getWarehouseName(e.warehouseId)}"`,
      e.employmentType || '',
      e.status || '',
      e.joiningDate ? new Date(e.joiningDate).toLocaleDateString() : ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KrishiVishal_Employees_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Employee master CSV exported");
  };

  const columns = [
    {
      header: "Employee ID",
      render: (emp) => (
        <span className="font-mono font-bold text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-lg border border-gray-200">
          {emp.employeeId || emp.id}
        </span>
      ),
    },
    {
      header: "Employee Name & Contact",
      render: (emp) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[#0B4D31] text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {(emp.displayName || "E").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm">{emp.displayName || `${emp.firstName || ''} ${emp.lastName || ''}`}</div>
            <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
              {emp.email && <span className="flex items-center gap-1"><Mail size={10} />{emp.email}</span>}
              {emp.phone && <span className="flex items-center gap-1"><Phone size={10} />{emp.phone}</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Department & Role",
      render: (emp) => (
        <div>
          <div className="font-semibold text-gray-800 text-xs">{emp.designationId || "Executive"}</div>
          <div className="text-[11px] text-gray-500 font-medium">{emp.departmentId || "Operations"}</div>
        </div>
      ),
    },
    {
      header: "Assigned Depot / Hub",
      render: (emp) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
          <Building2 size={11} className="mr-1 text-blue-500" />
          {getWarehouseName(emp.warehouseId)}
        </span>
      ),
    },
    {
      header: "Employment Type",
      render: (emp) => (
        <span className="text-xs font-semibold text-gray-700 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
          {emp.employmentType || "Full-Time"}
        </span>
      ),
    },
    {
      header: "Status",
      render: (emp) => {
        const type = emp.status === "Active" ? "success" 
                   : emp.status === "Exited" ? "error" 
                   : emp.status === "Draft" ? "default" : "warning";
        return <StatusBadge status={emp.status || "Active"} type={type} />;
      },
    },
    {
      header: "Actions",
      render: (emp) => (
        <button
          onClick={() => navigate(`/hr/employees/${emp.employeeId || emp.id}`)}
          className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-green-200/60"
        >
          <FileText size={13} /> View 360° Profile
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="Corporate Employee Directory (1,000+ Scalable ERP)"
          subtitle="Unified master records, depot assignments, multi-tier HR profiles, and statutory compliance."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-2xl text-xs font-bold hover:bg-gray-50 shadow-sm transition-all"
          >
            <Download size={14} className="text-gray-500" />
            Export CSV
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#0B4D31] text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43] transition-all active:scale-95"
          >
            <Plus size={16} /> Add New Employee
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Workforce"
          value={stats.total}
          icon={Users}
          color="blue"
        />
        <MetricCard
          label="Active Employees"
          value={stats.active}
          icon={UserCheck}
          color="green"
        />
        <MetricCard
          label="On Probation"
          value={stats.probation}
          icon={Briefcase}
          color="amber"
        />
        <MetricCard
          label="Exited / Resigned"
          value={stats.exited}
          icon={UserX}
          color="red"
        />
      </div>

      {/* Enterprise Filters & Search Bar */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Employee ID, Name, Email, Phone..."
              className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 w-full outline-none focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={selectedDept}
              onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Hub / Depot Filter */}
          <div>
            <select
              value={selectedHub}
              onChange={(e) => { setSelectedHub(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">🏢 All Regional Hubs / Depots</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>📍 {wh.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Tab Pills */}
        <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
          {["ALL", "Active", "Probation", "Draft", "Exited"].map(status => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === status 
                  ? "bg-[#0B4D31] text-white shadow-sm" 
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {status === "ALL" ? "All Status" : status}
            </button>
          ))}
          <div className="ml-auto text-xs font-bold text-gray-400">
            Showing {paginatedEmployees.length} of {filteredEmployees.length} records
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
        <DataTable columns={columns} data={paginatedEmployees} loading={loading} />

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-700 outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-[#0B4D31]" />
                Add New Enterprise Employee
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <form id="add-emp-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">First Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-600 focus:bg-white text-xs font-bold text-gray-800"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Last Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-600 focus:bg-white text-xs font-bold text-gray-800"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Official Email *</label>
                    <input
                      required
                      type="email"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-600 focus:bg-white text-xs font-bold text-gray-800"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Phone Number *</label>
                    <input
                      required
                      type="tel"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-600 focus:bg-white text-xs font-bold text-gray-800"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Department</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold text-gray-800"
                      value={formData.departmentId}
                      onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    >
                      <option value="Operations">Operations</option>
                      <option value="Supply Chain & Logistics">Supply Chain & Logistics</option>
                      <option value="Agronomy & Advisory">Agronomy & Advisory</option>
                      <option value="Finance & Accounts">Finance & Accounts</option>
                      <option value="Human Resources">Human Resources</option>
                      <option value="Technology & Product">Technology & Product</option>
                      <option value="Sales & Marketing">Sales & Marketing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Designation</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold text-gray-800"
                      value={formData.designationId}
                      onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    >
                      <option value="Executive">Executive</option>
                      <option value="Senior Executive">Senior Executive</option>
                      <option value="Assistant Manager">Assistant Manager</option>
                      <option value="Depot / Hub Manager">Depot / Hub Manager</option>
                      <option value="Operations Head">Operations Head</option>
                      <option value="Director">Director</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Assigned Depot / Hub</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold text-gray-800"
                      value={formData.warehouseId}
                      onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    >
                      <option value="">Head Office (Corporate)</option>
                      {warehouses.map(wh => (
                        <option key={wh.id} value={wh.id}>{wh.name} ({wh.code || wh.id})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Employment Type</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold text-gray-800"
                      value={formData.employmentType}
                      onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                    >
                      <option value="Full-Time">Full-Time (Regular)</option>
                      <option value="Probation">Probation (3-6 Months)</option>
                      <option value="Contract">Third-Party Contract</option>
                      <option value="Intern">Intern / Trainee</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-emp-form"
                disabled={saving}
                className="bg-[#0B4D31] text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-[#146c43] transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={15} className="animate-spin" /> Creating...</>
                ) : "Create Employee"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;

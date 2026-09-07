import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Search,
  Loader2,
  Briefcase,
  UserCheck,
  UserX,
  FileText
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import MetricCard from "../../components/common/MetricCard";
import StatusBadge from "../../components/common/StatusBadge";
import { getEmployees, createEmployee } from "../../services/workforceService";
import { useAuth } from "../../hooks/useAuth";

const Employees = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
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
    status: "Active"
  });

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
        displayName: `${formData.firstName} ${formData.lastName}`,
        joiningDate: new Date().toISOString()
      });
      toast.success(`Employee ${newId} created successfully`);
      setIsModalOpen(false);
      setFormData({
        firstName: "", lastName: "", email: "", phone: "",
        departmentId: "Operations", designationId: "Executive",
        employmentType: "Full-Time", status: "Active"
      });
      fetchEmployees();
    } catch (error) {
      toast.error("Failed to create employee");
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.displayName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.employeeId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.departmentId || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Employee ID",
      render: (emp) => <span className="font-mono font-bold text-gray-700">{emp.employeeId}</span>,
    },
    {
      header: "Employee",
      render: (emp) => (
        <div>
          <div className="font-bold text-gray-900">{emp.displayName}</div>
          <div className="text-xs text-gray-500">{emp.email} | {emp.phone}</div>
        </div>
      ),
    },
    {
      header: "Role",
      render: (emp) => (
        <div>
          <div className="font-semibold text-gray-700 text-sm">{emp.designationId}</div>
          <div className="text-xs text-gray-500">{emp.departmentId}</div>
        </div>
      ),
    },
    {
      header: "Type",
      render: (emp) => <span className="text-sm text-gray-600">{emp.employmentType}</span>,
    },
    {
      header: "Status",
      render: (emp) => {
        const type = emp.status === "Active" ? "success" 
                   : emp.status === "Exited" ? "error" 
                   : emp.status === "Draft" ? "default" : "warning";
        return <StatusBadge status={emp.status} type={type} />;
      },
    },
    {
      header: "Actions",
      render: (emp) => (
        <button
          onClick={() => navigate(`/hr/employees/${emp.employeeId}`)}
          className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors flex items-center gap-1"
        >
          <FileText size={14} /> Profile
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Employee Directory"
        subtitle="Manage HR master records and workforce profiles"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2e7d32] transition-colors"
          >
            <Plus size={18} /> Add Employee
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Employees"
          value={employees.length}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Active"
          value={employees.filter(e => e.status === "Active").length}
          icon={UserCheck}
          color="green"
        />
        <MetricCard
          title="Probation"
          value={employees.filter(e => e.status === "Probation").length}
          icon={Briefcase}
          color="orange"
        />
        <MetricCard
          title="Exited"
          value={employees.filter(e => e.status === "Exited").length}
          icon={UserX}
          color="red"
        />
      </div>

      {/* Search */}
      <div className="flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
        <Search className="text-gray-400 mr-2" size={20} />
        <input
          type="text"
          placeholder="Search by ID, name, or department..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={filteredEmployees} loading={loading} />

      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-green-700" />
                Add New Employee
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <form id="add-emp-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">First Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Last Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Email *</label>
                    <input
                      required
                      type="email"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Phone *</label>
                    <input
                      required
                      type="tel"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Department</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.departmentId}
                      onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    >
                      <option value="Operations">Operations</option>
                      <option value="Finance">Finance</option>
                      <option value="HR">HR</option>
                      <option value="Tech">Tech</option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Marketing">Marketing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Designation</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.designationId}
                      onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    >
                      <option value="Executive">Executive</option>
                      <option value="Manager">Manager</option>
                      <option value="Associate">Associate</option>
                      <option value="Director">Director</option>
                      <option value="Worker">Worker</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Employment Type</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.employmentType}
                      onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                    >
                      <option value="Full-Time">Full-Time</option>
                      <option value="Part-Time">Part-Time</option>
                      <option value="Contract">Contract</option>
                      <option value="Intern">Intern</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Initial Status</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-green-500 focus:bg-white transition-all text-sm font-semibold text-gray-800"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="Draft">Draft (Pre-Joining)</option>
                      <option value="Active">Active</option>
                      <option value="Probation">Probation</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-emp-form"
                disabled={saving}
                className="bg-[#1b5e20] text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-[#2e7d32] transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Saving...</>
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

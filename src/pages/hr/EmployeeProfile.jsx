import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User, Briefcase, FileText, Banknote, ShieldAlert, BookOpen,
  MonitorSmartphone, Clock, Calendar, TrendingUp, AlertTriangle, LogOut,
  History, ArrowLeft, Upload
} from "lucide-react";
import toast from "react-hot-toast";
import { getEmployeeById } from "../../services/workforceService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import StatusBadge from "../../components/common/StatusBadge";

const TABS = [
  { id: "Overview", icon: User },
  { id: "Personal", icon: User },
  { id: "Employment", icon: Briefcase },
  { id: "Documents", icon: FileText },
  { id: "Payroll", icon: Banknote },
  { id: "Statutory", icon: ShieldAlert },
  { id: "Training", icon: BookOpen },
  { id: "Assets", icon: MonitorSmartphone },
  { id: "Attendance", icon: Clock },
  { id: "Leave", icon: Calendar },
  { id: "Performance", icon: TrendingUp },
  { id: "Disciplinary", icon: AlertTriangle },
  { id: "Exit", icon: LogOut },
  { id: "Audit", icon: History }
];

const EmployeeProfile = () => {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Documents");

  useEffect(() => {
    fetchEmployee();
  }, [employeeId]);

  const fetchEmployee = async () => {
    try {
      const data = await getEmployeeById(employeeId);
      if (data) {
        setEmployee(data);
      } else {
        toast.error("Employee not found");
        navigate("/hr/employees");
      }
    } catch (err) {
      toast.error("Error loading profile");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!employee) return null;

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-16 h-16 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center font-black text-2xl">
            {employee.firstName?.charAt(0)}{employee.lastName?.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">{employee.displayName}</h1>
              <StatusBadge status={employee.status} type={employee.status === 'Active' ? 'success' : 'default'} />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {employee.employeeId} • {employee.designationId} • {employee.departmentId}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-gray-50 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-100 border border-gray-200">
            Edit Profile
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto custom-scrollbar bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                isActive 
                  ? "bg-[#1b5e20] text-white shadow-md" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={16} />
              {tab.id}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
        {activeTab === "Overview" && (
          <div className="text-gray-500 font-medium">Overview module coming soon. Select "Documents" to view the vault.</div>
        )}
        
        {activeTab === "Documents" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Document Vault</h2>
                <p className="text-sm text-gray-500">Manage all HR and compliance documents for this employee.</p>
              </div>
              <button className="bg-[#1b5e20] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#2e7d32]">
                <Upload size={16} /> Upload Document
              </button>
            </div>
            {/* Document categories tabs will go here */}
            <div className="flex gap-2 border-b border-gray-100 overflow-x-auto pb-2">
              {['Identity', 'Address', 'Education', 'Employment', 'Contracts', 'Payroll', 'Statutory', 'Training', 'HR', 'Other'].map(cat => (
                <button key={cat} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 whitespace-nowrap">
                  {cat}
                </button>
              ))}
            </div>
            <div className="py-10 text-center flex flex-col items-center">
               <FileText size={40} className="text-gray-300 mb-3" />
               <p className="text-gray-500 font-bold">No documents uploaded in this category yet.</p>
            </div>
          </div>
        )}
        
        {/* Placeholders for other tabs */}
        {activeTab !== "Overview" && activeTab !== "Documents" && (
          <div className="flex items-center justify-center h-40 text-gray-400 font-bold border-2 border-dashed border-gray-100 rounded-xl">
            {activeTab} module is part of the broader ERP and currently not in scope for Document Management phase.
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeProfile;

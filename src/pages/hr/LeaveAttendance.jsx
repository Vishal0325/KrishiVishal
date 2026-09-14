import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getLeaveRequests,
  applyLeave,
  updateLeaveStatus,
  getLeaveBalances,
  initializeLeaveBalance,
  getAttendanceByDate,
  markAttendance,
  getCompanyHolidays
} from "../../services/leaveService";
import { getEmployees } from "../../services/workforceService";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  Filter,
  Download,
  Users,
  Sun,
  FileText,
  UserCheck,
  UserX,
  X,
  ChevronRight,
  TrendingUp,
  Award
} from "lucide-react";

const LeaveAttendance = () => {
  const [activeTab, setActiveTab] = useState("attendance"); // attendance, requests, balances, holidays
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  // Data States
  const [employees, setEmployees] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState("APPROVED");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [newLeave, setNewLeave] = useState({
    employeeId: "",
    employeeName: "",
    department: "",
    leaveType: "CL", // CL, SL, PL, CompOff, LOP, Maternity
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    isHalfDay: false,
    reason: "",
  });

  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: "",
    employeeName: "",
    department: "",
    date: selectedDate,
    status: "PRESENT", // PRESENT, LATE, HALF_DAY, ON_LEAVE, ABSENT, WEEKLY_OFF
    punchIn: "09:00 AM",
    punchOut: "06:00 PM",
    workingHours: 9,
    overtimeHours: 0,
    notes: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [empsData, attData, reqsData, balsData, holsData] = await Promise.all([
        getEmployees(),
        getAttendanceByDate(selectedDate),
        getLeaveRequests(),
        getLeaveBalances(),
        getCompanyHolidays(),
      ]);

      setEmployees(empsData);
      setAttendanceRecords(attData);
      setLeaveRequests(reqsData);
      setLeaveBalances(balsData);
      setHolidays(holsData);
      // [FIXED] Point #114: Removed expensive initialization loop.
      // Leave balance is now initialized during employee creation.
    } catch (error) {
      console.error("Failed to load leave & attendance data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleEmployeeSelect = (empId, isAttendance = false) => {
    const emp = employees.find(e => e.id === empId || e.employeeId === empId);
    if (!emp) return;
    const name = `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name;
    const dept = emp.department || emp.departmentId || "Operations";

    if (isAttendance) {
      setAttendanceForm({
        ...attendanceForm,
        employeeId: emp.employeeId || emp.id,
        employeeName: name,
        department: dept,
      });
    } else {
      setNewLeave({
        ...newLeave,
        employeeId: emp.employeeId || emp.id,
        employeeName: name,
        department: dept,
      });
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!newLeave.employeeName) return;
    try {
      setSubmitting(true);
      await applyLeave(newLeave);
      setIsApplyModalOpen(false);
      setNewLeave({
        employeeId: "",
        employeeName: "",
        department: "",
        leaveType: "CL",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        isHalfDay: false,
        reason: "",
      });
      loadData();
    } catch (error) {
      console.error("Error applying leave:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    if (!attendanceForm.employeeId) return;
    try {
      setSubmitting(true);
      await markAttendance({ ...attendanceForm, date: selectedDate });
      setIsMarkModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error saving attendance:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRequest) return;
    try {
      setSubmitting(true);
      await updateLeaveStatus(selectedRequest.id, actionStatus, adminRemarks);
      setIsActionModalOpen(false);
      setAdminRemarks("");
      loadData();
    } catch (error) {
      console.error("Error taking action on leave:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Export Daily / Monthly Attendance Register to CSV
  const exportAttendanceCSV = () => {
    if (employees.length === 0) return;
    const headers = ["Employee ID", "Full Name", "Department", "Date", "Status", "Punch In", "Punch Out", "Working Hours", "Overtime (Hrs)"];
    const rows = employees.map(emp => {
      const empId = emp.employeeId || emp.id;
      const record = attendanceRecords.find(r => r.employeeId === empId);
      return [
        empId,
        `"${emp.firstName || ""} ${emp.lastName || ""}"`,
        `"${emp.department || "Operations"}"`,
        selectedDate,
        record ? record.status : "ABSENT / UNMARKED",
        record ? record.punchIn : "—",
        record ? record.punchOut : "—",
        record ? record.workingHours : 0,
        record ? record.overtimeHours : 0
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KrishiVishal_Attendance_Register_${selectedDate}.csv`;
    a.click();
  };

  // Stats calculation
  const totalStaff = employees.length;
  const presentCount = attendanceRecords.filter(r => r.status === "PRESENT" || r.status === "LATE").length;
  const leaveCount = attendanceRecords.filter(r => r.status === "ON_LEAVE").length;
  const pendingRequestsCount = leaveRequests.filter(r => r.status === "PENDING").length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Leave & Attendance Policy Governance"
          subtitle="Manage statutory leave quotas (CL/SL/PL), daily biometric attendance logs, approvals, and public holidays"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={exportAttendanceCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Register (CSV)
          </button>
          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Apply / Grant Leave
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Headcount</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{totalStaff}</h3>
            <p className="text-xs text-gray-500 mt-1">Active on roll</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Present Today</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{presentCount}</h3>
            <p className="text-xs text-gray-500 mt-1">{totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0}% Attendance rate</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On Approved Leave</p>
            <h3 className="text-2xl font-bold text-indigo-600 mt-1">{leaveCount}</h3>
            <p className="text-xs text-gray-500 mt-1">Paid / Statutory Leaves</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Sun className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Leave Approvals</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendingRequestsCount}</h3>
            <p className="text-xs text-gray-500 mt-1">Requires HR Approval</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Navigation Header */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {[
          { id: "attendance", label: "Daily Attendance Register", icon: Calendar },
          { id: "requests", label: `Leave Requests Queue (${pendingRequestsCount})`, icon: Clock },
          { id: "balances", label: "Employee Leave Balances (CL/SL/PL)", icon: Award },
          { id: "holidays", label: "Company Holiday Calendar", icon: Sun },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                isActive
                  ? "border-emerald-600 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: DAILY ATTENDANCE REGISTER */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-xs font-semibold text-gray-500">Attendance Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <button
                onClick={() => {
                  setAttendanceForm({
                    employeeId: "",
                    employeeName: "",
                    department: "",
                    date: selectedDate,
                    status: "PRESENT",
                    punchIn: "09:00 AM",
                    punchOut: "06:00 PM",
                    workingHours: 9,
                    overtimeHours: 0,
                    notes: "",
                  });
                  setIsMarkModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Manual Punch Adjustment
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Employee</th>
                    <th className="px-5 py-3.5">Department</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Punch In</th>
                    <th className="px-5 py-3.5">Punch Out</th>
                    <th className="px-5 py-3.5">Hours</th>
                    <th className="px-5 py-3.5">Overtime</th>
                    <th className="px-5 py-3.5 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {employees.map((emp) => {
                    const empId = emp.employeeId || emp.id;
                    const record = attendanceRecords.find((r) => r.employeeId === empId);
                    const isPresent = record?.status === "PRESENT";
                    const isLate = record?.status === "LATE";
                    const isOnLeave = record?.status === "ON_LEAVE";

                    return (
                      <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-semibold text-gray-900">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-gray-400 font-mono">{empId}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-gray-700">
                          {emp.department || "Operations"}
                        </td>
                        <td className="px-5 py-4">
                          {isPresent ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Present
                            </span>
                          ) : isLate ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                              <Clock className="w-3 h-3" /> Late Entry
                            </span>
                          ) : isOnLeave ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              <Sun className="w-3 h-3" /> On Leave
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                              Unmarked / Absent
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-800">
                          {record?.punchIn || "—"}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-800">
                          {record?.punchOut || "—"}
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-gray-700">
                          {record?.workingHours ? `${record.workingHours} hrs` : "—"}
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-purple-700">
                          {record?.overtimeHours ? `+${record.overtimeHours} hrs` : "0"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => {
                              setAttendanceForm({
                                employeeId: empId,
                                employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
                                department: emp.department || "Operations",
                                date: selectedDate,
                                status: record?.status || "PRESENT",
                                punchIn: record?.punchIn || "09:00 AM",
                                punchOut: record?.punchOut || "06:00 PM",
                                workingHours: record?.workingHours || 9,
                                overtimeHours: record?.overtimeHours || 0,
                                notes: record?.notes || "",
                              });
                              setIsMarkModalOpen(true);
                            }}
                            className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 border border-gray-200 rounded-lg transition-colors font-medium"
                          >
                            Edit Punch
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LEAVE REQUESTS & APPROVALS */}
      {activeTab === "requests" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {leaveRequests.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No leave applications found</p>
              <p className="text-xs text-gray-400 mt-1">Staff leave requests will appear here for HR approval.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Request ID</th>
                    <th className="px-5 py-3.5">Employee</th>
                    <th className="px-5 py-3.5">Leave Type</th>
                    <th className="px-5 py-3.5">Duration & Dates</th>
                    <th className="px-5 py-3.5">Reason</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {leaveRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">
                        {req.leaveId || req.id}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{req.employeeName}</p>
                          <p className="text-xs text-gray-400">{req.employeeId} • {req.department}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                          {req.leaveType}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-gray-800">
                        <div>
                          <p>{req.startDate} {req.endDate && req.endDate !== req.startDate ? `→ ${req.endDate}` : ""}</p>
                          <span className="text-gray-400">({req.daysCount} Day{req.daysCount > 1 ? "s" : ""})</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-600 max-w-xs truncate">
                        {req.reason || "Personal reason"}
                      </td>
                      <td className="px-5 py-4">
                        {req.status === "APPROVED" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        ) : req.status === "REJECTED" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full animate-pulse">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {req.status === "PENDING" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setActionStatus("APPROVED");
                                setIsActionModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setActionStatus("REJECTED");
                                setIsActionModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Actioned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EMPLOYEE LEAVE BALANCES (CL/SL/PL) */}
      {activeTab === "balances" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm">Annual Statutory Leave Quota & Utilisation Ledger</h3>
            <p className="text-xs text-gray-400">Statutory entitlements: Casual Leave (12d), Sick Leave (12d), Privilege Leave (15d)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-5 py-3.5">Casual Leave (CL)</th>
                  <th className="px-5 py-3.5">Sick Leave (SL)</th>
                  <th className="px-5 py-3.5">Privilege Leave (PL)</th>
                  <th className="px-5 py-3.5">Total Quota Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {leaveBalances.map((bal) => {
                  const clRemaining = (bal.clTotal || 12) - (bal.clUsed || 0);
                  const slRemaining = (bal.slTotal || 12) - (bal.slUsed || 0);
                  const plRemaining = (bal.plTotal || 15) - (bal.plUsed || 0);
                  const totalRemaining = clRemaining + slRemaining + plRemaining;

                  return (
                    <tr key={bal.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{bal.employeeName}</p>
                          <p className="text-xs text-gray-400">{bal.employeeId} • {bal.department}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="font-semibold text-gray-800">{clRemaining} / {bal.clTotal || 12} Left</div>
                        <span className="text-gray-400">Used: {bal.clUsed || 0}d</span>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="font-semibold text-gray-800">{slRemaining} / {bal.slTotal || 12} Left</div>
                        <span className="text-gray-400">Used: {bal.slUsed || 0}d</span>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="font-semibold text-gray-800">{plRemaining} / {bal.plTotal || 15} Left</div>
                        <span className="text-gray-400">Used: {bal.plUsed || 0}d</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {totalRemaining} Days Available
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COMPANY HOLIDAY CALENDAR */}
      {activeTab === "holidays" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {holidays.map((hol, idx) => (
            <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-sm">
                  {new Date(hol.date).getDate()}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">{hol.title}</h4>
                  <p className="text-xs text-gray-400">{hol.date} • {hol.type}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                Paid Holiday
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Apply / Record Leave</h3>
              <button onClick={() => setIsApplyModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApplyLeave} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Employee *</label>
                <select
                  required
                  onChange={(e) => handleEmployeeSelect(e.target.value, false)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Leave Category</label>
                  <select
                    value={newLeave.leaveType}
                    onChange={(e) => setNewLeave({ ...newLeave, leaveType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="CL">Casual Leave (CL)</option>
                    <option value="SL">Sick Leave (SL)</option>
                    <option value="PL">Privilege Leave (PL)</option>
                    <option value="CompOff">Compensatory Off (Comp-Off)</option>
                    <option value="LOP">Loss of Pay (Unpaid LOP)</option>
                    <option value="Maternity">Maternity / Paternity</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={newLeave.isHalfDay}
                      onChange={(e) => setNewLeave({ ...newLeave, isHalfDay: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    Half-Day Leave (0.5 Day)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newLeave.startDate}
                    onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newLeave.endDate}
                    onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason / Notes</label>
                <textarea
                  rows="2"
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  placeholder="Reason for leave request..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Submitting..." : "Submit Leave Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Punch / Attendance Regularization Modal */}
      {isMarkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Punch Regularization</h3>
              <button onClick={() => setIsMarkModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAttendance} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Employee</label>
                <input
                  type="text"
                  disabled
                  value={attendanceForm.employeeName}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={attendanceForm.status}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late Entry</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="ON_LEAVE">On Leave</option>
                    <option value="ABSENT">Absent</option>
                    <option value="WEEKLY_OFF">Weekly Off</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Working Hours</label>
                  <input
                    type="number"
                    value={attendanceForm.workingHours}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, workingHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Punch In Time</label>
                  <input
                    type="text"
                    value={attendanceForm.punchIn}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, punchIn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Punch Out Time</label>
                  <input
                    type="text"
                    value={attendanceForm.punchOut}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, punchOut: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Overtime Hours (OT)</label>
                <input
                  type="number"
                  value={attendanceForm.overtimeHours}
                  onChange={(e) => setAttendanceForm({ ...attendanceForm, overtimeHours: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsMarkModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Saving..." : "Save Attendance Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Approval Action Modal */}
      {isActionModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">
                {actionStatus === "APPROVED" ? "Approve Leave Request" : "Reject Leave Request"}
              </h3>
              <button onClick={() => setIsActionModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleActionSubmit} className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                {actionStatus === "APPROVED" ? "Approving" : "Rejecting"} {selectedRequest.leaveType} ({selectedRequest.daysCount} days) for <strong className="text-gray-800">{selectedRequest.employeeName}</strong>
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">HR Remarks / Reason</label>
                <textarea
                  rows="2"
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  placeholder="Official approval / rejection note..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-4 py-2 text-white rounded-xl font-medium ${
                    actionStatus === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {submitting ? "Processing..." : `Confirm ${actionStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveAttendance;

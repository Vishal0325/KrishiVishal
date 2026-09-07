import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getSalaryStructures,
  saveEmployeeSalaryStructure,
  calculateSalaryBreakdown,
  getPayrollRuns,
  generateMonthlyPayroll
} from "../../services/payrollService";
import { getEmployees } from "../../services/workforceService";
import {
  DollarSign,
  Calculator,
  FileText,
  Download,
  Printer,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Filter,
  Eye,
  Building,
  ShieldCheck,
  CreditCard,
  X,
  Users,
  Layers,
  ArrowRight
} from "lucide-react";

const StatutoryPayroll = () => {
  const [activeTab, setActiveTab] = useState("runs"); // runs, structures, challans
  const [currentMonth, setCurrentMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [loading, setLoading] = useState(true);

  // Data
  const [employees, setEmployees] = useState([]);
  const [salaryStructures, setSalaryStructures] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State for Salary Structure
  const [structureForm, setStructureForm] = useState({
    employeeId: "",
    employeeName: "",
    department: "",
    monthlyGross: 30000,
    uanNumber: "",
    esicNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: "PUNB0123456",
    bankName: "Punjab National Bank",
    enablePf: true,
    enableEsic: true,
    enablePt: true,
    capPfAt15k: true,
    monthlyTds: 0,
    taxRegime: "NEW",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [empsData, structsData, runsData] = await Promise.all([
        getEmployees(),
        getSalaryStructures(),
        getPayrollRuns(currentMonth),
      ]);

      setEmployees(empsData);
      setSalaryStructures(structsData);
      setCurrentRun(runsData.length > 0 ? runsData[0] : null);
    } catch (error) {
      console.error("Failed to load payroll data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const handleEmployeeSelect = (empId) => {
    const emp = employees.find(e => e.id === empId || e.employeeId === empId);
    if (!emp) return;
    const existing = salaryStructures.find(s => s.employeeId === (emp.employeeId || emp.id));

    setStructureForm({
      employeeId: emp.employeeId || emp.id,
      employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name,
      department: emp.department || emp.departmentId || "Operations",
      monthlyGross: existing?.monthlyGross || 25000,
      uanNumber: existing?.uanNumber || "",
      esicNumber: existing?.esicNumber || "",
      panNumber: existing?.panNumber || emp.panNumber || "",
      bankAccountNumber: existing?.bankAccountNumber || emp.bankAccountNumber || "",
      bankIfsc: existing?.bankIfsc || emp.bankIfsc || "PUNB0123456",
      bankName: existing?.bankName || emp.bankName || "State Bank of India",
      enablePf: existing ? existing.enablePf !== false : true,
      enableEsic: existing ? existing.enableEsic !== false : true,
      enablePt: existing ? existing.enablePt !== false : true,
      capPfAt15k: existing ? existing.capPfAt15k !== false : true,
      monthlyTds: existing?.monthlyTds || 0,
      taxRegime: existing?.taxRegime || "NEW",
    });
  };

  const handleSaveStructure = async (e) => {
    e.preventDefault();
    if (!structureForm.employeeId) return;
    try {
      setSubmitting(true);
      await saveEmployeeSalaryStructure(structureForm.employeeId, structureForm);
      setIsStructureModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Error saving salary structure:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunPayroll = async () => {
    if (salaryStructures.length === 0) {
      alert("Please configure salary structures for employees before running payroll.");
      return;
    }

    try {
      setSubmitting(true);
      const employeesWithSalaries = salaryStructures.map(struct => {
        const emp = employees.find(e => (e.employeeId || e.id) === struct.employeeId);
        return {
          ...struct,
          designation: emp?.designation || "Staff",
          lopDays: 0, // In future, integrate exact LOP from attendance
          daysInMonth: 30,
        };
      });

      const result = await generateMonthlyPayroll(currentMonth, employeesWithSalaries);
      setCurrentRun(result);
      loadData();
    } catch (error) {
      console.error("Error running payroll:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Live calculation for modal preview
  const liveBreakdown = calculateSalaryBreakdown(structureForm.monthlyGross, {
    enablePf: structureForm.enablePf,
    enableEsic: structureForm.enableEsic,
    enablePt: structureForm.enablePt,
    capPfAt15k: structureForm.capPfAt15k,
    monthlyTds: structureForm.monthlyTds,
  });

  // Export Bank NEFT Payout CSV
  const exportBankNEFT = () => {
    if (!currentRun || !currentRun.payslips || currentRun.payslips.length === 0) return;
    const headers = ["Beneficiary Name", "Account Number", "IFSC Code", "Net Amount (INR)", "Payment Reference", "Narration"];
    const rows = currentRun.payslips.map(p => [
      `"${p.employeeName}"`,
      `"${p.bankAccountNumber || "0000000000"}"`,
      `"${p.bankIfsc || "SBIN000001"}"`,
      p.netSalary,
      `"SAL-${currentMonth}-${p.employeeId}"`,
      `"Salary for ${currentMonth}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KrishiVishal_Bank_Salary_Disbursal_${currentMonth}.csv`;
    a.click();
  };

  // Export EPF ECR Sheet
  const exportEPF_ECR = () => {
    if (!currentRun || !currentRun.payslips || currentRun.payslips.length === 0) return;
    const headers = ["UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages", "EE Share (12%)", "ER Share EPF (3.67%)", "ER Share EPS (8.33%)", "NCP Days"];
    const rows = currentRun.payslips.map(p => {
      const basic = p.earnings.basic;
      const pfWage = Math.min(15000, basic);
      const eeShare = p.deductions.pf;
      const erEps = Math.round(pfWage * 0.0833);
      const erEpf = eeShare - erEps;
      return [
        `"${p.uanNumber || "101000000000"}"`,
        `"${p.employeeName}"`,
        p.earnings.gross,
        pfWage,
        pfWage,
        eeShare,
        erEpf,
        erEps,
        p.lopDays || 0
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KrishiVishal_EPF_ECR_Challan_${currentMonth}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Statutory Payroll & Compliance Engine"
          subtitle="Manage Indian statutory deductions (PF 12%, ESIC 0.75%, PT, TDS), batch payroll runs, and auto-generated salary slips"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsStructureModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Calculator className="w-4 h-4 text-emerald-600" />
            Set Salary Structure
          </button>
          <button
            onClick={handleRunPayroll}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <DollarSign className="w-4 h-4" />
            {submitting ? "Processing..." : `Execute Payroll for ${currentMonth}`}
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gross Payroll Cost</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            ₹{currentRun?.totalGross ? currentRun.totalGross.toLocaleString("en-IN") : "0"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{currentRun?.totalEmployees || 0} Employees processed</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Net Take-Home Payout</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">
            ₹{currentRun?.totalNet ? currentRun.totalNet.toLocaleString("en-IN") : "0"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Bank Disbursal Amount</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total PF Contribution</p>
          <h3 className="text-2xl font-bold text-indigo-600 mt-1">
            ₹{currentRun?.totalPf ? currentRun.totalPf.toLocaleString("en-IN") : "0"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Employee EPF (12%)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total ESIC Payout</p>
          <h3 className="text-2xl font-bold text-purple-600 mt-1">
            ₹{currentRun?.totalEsic ? currentRun.totalEsic.toLocaleString("en-IN") : "0"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Health Insurance (0.75%)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {[
          { id: "runs", label: "Monthly Payslips & Run", icon: FileText },
          { id: "structures", label: "Salary Master & CTC Structures", icon: Calculator },
          { id: "challans", label: "Statutory ECR & Bank NEFT Sheets", icon: Download },
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

      {/* TAB 1: MONTHLY RUN & PAYSLIPS */}
      {activeTab === "runs" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-xs font-semibold text-gray-500">Payroll Cycle Month:</span>
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {currentRun && (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Run Completed ({currentRun.status})
                </span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {!currentRun || !currentRun.payslips || currentRun.payslips.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No payroll executed for {currentMonth}</p>
                <p className="text-xs text-gray-400 mt-1">Click "Execute Payroll" above to generate monthly payslips.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5">Employee</th>
                      <th className="px-5 py-3.5">Gross Wages</th>
                      <th className="px-5 py-3.5">EPF (12%)</th>
                      <th className="px-5 py-3.5">ESIC (0.75%)</th>
                      <th className="px-5 py-3.5">Prof. Tax</th>
                      <th className="px-5 py-3.5">Total Deductions</th>
                      <th className="px-5 py-3.5">Net Take-Home</th>
                      <th className="px-5 py-3.5 text-right">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {currentRun.payslips.map((slip) => (
                      <tr key={slip.payslipId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-semibold text-gray-900">{slip.employeeName}</p>
                            <p className="text-xs text-gray-400">{slip.employeeId} • {slip.department}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono font-semibold text-gray-800">
                          ₹{slip.earnings.gross.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-600">
                          ₹{slip.deductions.pf.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-600">
                          ₹{slip.deductions.esic.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-600">
                          ₹{slip.deductions.pt.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-rose-600">
                          ₹{slip.deductions.total.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 font-mono font-bold text-emerald-700">
                          ₹{slip.netSalary.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedPayslip(slip);
                              setIsPayslipModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Payslip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SALARY MASTER & CTC STRUCTURES */}
      {activeTab === "structures" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Employee Salary & Statutory Compliance Master</h3>
              <p className="text-xs text-gray-400">Fixed CTC, PF/ESIC eligibility, Bank IFSC and PAN records</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Monthly Gross</th>
                  <th className="px-5 py-3.5">Annual CTC</th>
                  <th className="px-5 py-3.5">Basic + HRA Split</th>
                  <th className="px-5 py-3.5">UAN / ESIC</th>
                  <th className="px-5 py-3.5">Bank Details</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {employees.map((emp) => {
                  const empId = emp.employeeId || emp.id;
                  const struct = salaryStructures.find((s) => s.employeeId === empId);

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-gray-400">{empId} • {emp.department || "Operations"}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-gray-900">
                        {struct ? `₹${struct.monthlyGross.toLocaleString("en-IN")}` : "Not Set"}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-gray-600">
                        {struct ? `₹${struct.annualCtc.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {struct?.breakdown ? (
                          <div>
                            <span className="font-medium text-gray-800">Basic: ₹{struct.breakdown.basic}</span>
                            <span className="text-gray-400"> | HRA: ₹{struct.breakdown.hra}</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs font-mono">
                        <div>
                          <p className="text-gray-700">UAN: {struct?.uanNumber || "—"}</p>
                          <p className="text-gray-400">ESIC: {struct?.esicNumber || "—"}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <p className="font-medium text-gray-800">{struct?.bankName || "State Bank of India"}</p>
                        <p className="text-gray-400 font-mono">A/C: {struct?.bankAccountNumber ? `••••${struct.bankAccountNumber.slice(-4)}` : "—"}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => {
                            handleEmployeeSelect(empId);
                            setIsStructureModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          Configure CTC
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: STATUTORY CHALLANS & BANK EXPORTS */}
      {activeTab === "challans" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bank NEFT Payout */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Bank Bulk NEFT Payout File</h3>
                <p className="text-xs text-gray-400">Direct salary upload format for Corporate Internet Banking</p>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Generates a standard CSV sheet containing employee names, bank account numbers, IFSC codes, and net salary amounts ready for bulk corporate disbursal.
            </p>
            <button
              onClick={exportBankNEFT}
              disabled={!currentRun}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Bank NEFT File ({currentMonth})
            </button>
          </div>

          {/* EPF ECR Sheet */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">EPFO Electronic Challan (ECR)</h3>
                <p className="text-xs text-gray-400">Monthly PF portal filing sheet (12% EE + 12% ER split)</p>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Calculates EPF wages, EPS share (8.33%), EPF share (3.67%), and member contributions formatted for the Unified EPFO Employer Portal.
            </p>
            <button
              onClick={exportEPF_ECR}
              disabled={!currentRun}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download EPF ECR File ({currentMonth})
            </button>
          </div>
        </div>
      )}

      {/* Salary Structure Configuration Modal */}
      {isStructureModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">Configure Salary Structure & Statutory Master</h3>
              <button onClick={() => setIsStructureModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStructure} className="space-y-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Employee *</label>
                <select
                  required
                  value={structureForm.employeeId}
                  onChange={(e) => handleEmployeeSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.employeeId || emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Monthly Gross Wage (₹) *</label>
                  <input
                    type="number"
                    required
                    value={structureForm.monthlyGross}
                    onChange={(e) => setStructureForm({ ...structureForm, monthlyGross: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Annual CTC (₹)</label>
                  <input
                    type="text"
                    disabled
                    value={`₹${(structureForm.monthlyGross * 12).toLocaleString("en-IN")}`}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-600"
                  />
                </div>
              </div>

              {/* Live Statutory Breakdown Preview */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/60 space-y-2 text-xs">
                <p className="font-bold text-emerald-900 uppercase tracking-wider text-[11px]">Automatic Component Breakdown:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white p-2 rounded-xl border border-emerald-100">
                    <span className="text-gray-400 block text-[10px]">Basic (50%)</span>
                    <strong className="text-gray-900 font-mono">₹{liveBreakdown.basic}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-emerald-100">
                    <span className="text-gray-400 block text-[10px]">HRA (40% Basic)</span>
                    <strong className="text-gray-900 font-mono">₹{liveBreakdown.hra}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-emerald-100">
                    <span className="text-gray-400 block text-[10px]">EPF EE (12%)</span>
                    <strong className="text-rose-600 font-mono">-₹{liveBreakdown.employeePf}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-emerald-100">
                    <span className="text-gray-400 block text-[10px]">Net Take-Home</span>
                    <strong className="text-emerald-700 font-mono font-bold">₹{liveBreakdown.netPay}</strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={structureForm.enablePf}
                    onChange={(e) => setStructureForm({ ...structureForm, enablePf: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>Deduct EPF (12%)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={structureForm.enableEsic}
                    onChange={(e) => setStructureForm({ ...structureForm, enableEsic: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>Deduct ESIC (0.75%)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={structureForm.enablePt}
                    onChange={(e) => setStructureForm({ ...structureForm, enablePt: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>Prof. Tax (PT)</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">EPFO UAN Number</label>
                  <input
                    type="text"
                    placeholder="101012345678"
                    value={structureForm.uanNumber}
                    onChange={(e) => setStructureForm({ ...structureForm, uanNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">ESIC IP Number</label>
                  <input
                    type="text"
                    placeholder="3100123456"
                    value={structureForm.esicNumber}
                    onChange={(e) => setStructureForm({ ...structureForm, esicNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    placeholder="ABCDE1234F"
                    value={structureForm.panNumber}
                    onChange={(e) => setStructureForm({ ...structureForm, panNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={structureForm.bankName}
                    onChange={(e) => setStructureForm({ ...structureForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Bank Account No.</label>
                  <input
                    type="text"
                    value={structureForm.bankAccountNumber}
                    onChange={(e) => setStructureForm({ ...structureForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Bank IFSC Code</label>
                  <input
                    type="text"
                    value={structureForm.bankIfsc}
                    onChange={(e) => setStructureForm({ ...structureForm, bankIfsc: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsStructureModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium"
                >
                  {submitting ? "Saving..." : "Save CTC Structure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Printable Payslip Modal */}
      {isPayslipModalOpen && selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 max-h-[95vh] overflow-y-auto" id="printable-payslip">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 text-white font-bold flex items-center justify-center rounded-xl text-lg">
                  KV
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">KRISHIVISHAL AGRITECH PVT. LTD.</h2>
                  <p className="text-xs text-gray-500">Central Warehouse, Purnea, Bihar • CIN: U01100BR2024PTC068000</p>
                </div>
              </div>
              <button onClick={() => setIsPayslipModalOpen(false)} className="text-gray-400 hover:text-gray-600 print:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-3 bg-gray-50 my-4 rounded-xl">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Payslip for the Month of {selectedPayslip.month}
              </h3>
            </div>

            {/* Employee Details Grid */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-2 border-b border-gray-100">
              <div><span className="text-gray-500">Employee ID:</span> <strong className="font-mono text-gray-800">{selectedPayslip.employeeId}</strong></div>
              <div><span className="text-gray-500">Employee Name:</span> <strong className="text-gray-800">{selectedPayslip.employeeName}</strong></div>
              <div><span className="text-gray-500">Department:</span> <span className="text-gray-800">{selectedPayslip.department}</span></div>
              <div><span className="text-gray-500">Designation:</span> <span className="text-gray-800">{selectedPayslip.designation}</span></div>
              <div><span className="text-gray-500">UAN:</span> <span className="font-mono text-gray-800">{selectedPayslip.uanNumber || "N/A"}</span></div>
              <div><span className="text-gray-500">PAN:</span> <span className="font-mono text-gray-800">{selectedPayslip.panNumber || "N/A"}</span></div>
              <div><span className="text-gray-500">Bank Account:</span> <span className="font-mono text-gray-800">{selectedPayslip.bankAccountNumber ? `••••${selectedPayslip.bankAccountNumber.slice(-4)}` : "N/A"}</span></div>
              <div><span className="text-gray-500">IFSC:</span> <span className="font-mono text-gray-800">{selectedPayslip.bankIfsc || "N/A"}</span></div>
            </div>

            {/* Earnings vs Deductions Table */}
            <div className="grid grid-cols-2 gap-4 my-4 text-xs">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-emerald-50 px-3 py-2 font-bold text-emerald-900 border-b border-emerald-100">
                  Earnings (₹)
                </div>
                <div className="p-3 space-y-1.5 font-mono">
                  <div className="flex justify-between"><span>Basic Salary</span><span>{selectedPayslip.earnings.basic}</span></div>
                  <div className="flex justify-between"><span>House Rent Allowance (HRA)</span><span>{selectedPayslip.earnings.hra}</span></div>
                  <div className="flex justify-between"><span>Conveyance Allowance</span><span>{selectedPayslip.earnings.conveyance}</span></div>
                  <div className="flex justify-between"><span>Special Allowance</span><span>{selectedPayslip.earnings.specialAllowance}</span></div>
                  <div className="flex justify-between font-bold pt-2 border-t border-gray-100 text-gray-900">
                    <span>Total Gross Earnings</span><span>₹{selectedPayslip.earnings.gross}</span>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-rose-50 px-3 py-2 font-bold text-rose-900 border-b border-rose-100">
                  Deductions (₹)
                </div>
                <div className="p-3 space-y-1.5 font-mono">
                  <div className="flex justify-between"><span>EPF (Employee 12%)</span><span>{selectedPayslip.deductions.pf}</span></div>
                  <div className="flex justify-between"><span>ESIC (Employee 0.75%)</span><span>{selectedPayslip.deductions.esic}</span></div>
                  <div className="flex justify-between"><span>Professional Tax (PT)</span><span>{selectedPayslip.deductions.pt}</span></div>
                  <div className="flex justify-between"><span>TDS / Income Tax</span><span>{selectedPayslip.deductions.tds}</span></div>
                  <div className="flex justify-between font-bold pt-2 border-t border-gray-100 text-rose-600">
                    <span>Total Deductions</span><span>₹{selectedPayslip.deductions.total}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Pay Box */}
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-1">
              <span className="text-xs text-gray-600 font-medium">Net Take-Home Salary (Disbursed to Bank):</span>
              <h2 className="text-2xl font-black text-emerald-800 font-mono">
                ₹{selectedPayslip.netSalary.toLocaleString("en-IN")}
              </h2>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-200 text-[11px] text-gray-400 mt-6">
              <span>This is a computer-generated salary slip.</span>
              <span className="font-bold text-gray-700">Authorized Signatory • KrishiVishal HR</span>
            </div>

            <div className="flex justify-end gap-3 pt-6 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <Printer className="w-4 h-4" /> Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatutoryPayroll;

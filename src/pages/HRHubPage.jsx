import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Users, 
  FileCheck, 
  CalendarCheck, 
  Wallet, 
  ShieldAlert, 
  Award, 
  Laptop, 
  FileSignature, 
  ScrollText, 
  DoorOpen, 
  FileSpreadsheet, 
  Sliders 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy sub-components
const Employees = React.lazy(() => import("./hr/Employees"));
const EmployeeDocuments = React.lazy(() => import("./hr/EmployeeDocuments"));
const DocumentVerification = React.lazy(() => import("./hr/DocumentVerification"));
const ExpiringDocuments = React.lazy(() => import("./hr/ExpiringDocuments"));
const ExpiredDocuments = React.lazy(() => import("./hr/ExpiredDocuments"));
const LeaveAttendance = React.lazy(() => import("./hr/LeaveAttendance"));
const StatutoryPayroll = React.lazy(() => import("./hr/StatutoryPayroll"));
const BackgroundVerification = React.lazy(() => import("./hr/BackgroundVerification"));
const TrainingCertifications = React.lazy(() => import("./hr/TrainingCertifications"));
const CompanyAssets = React.lazy(() => import("./hr/CompanyAssets"));
const ContractsAgreements = React.lazy(() => import("./hr/ContractsAgreements"));
const AgriLicenses = React.lazy(() => import("./hr/AgriLicenses"));
const ExitManagement = React.lazy(() => import("./hr/ExitManagement"));
const HRReports = React.lazy(() => import("./hr/HRReports"));
const DocumentSettings = React.lazy(() => import("./hr/DocumentSettings"));

export default function HRHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "employees";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "employees", label: "Employees & Staff", icon: Users },
    { id: "documents", label: "Unified Document Desk", icon: FileCheck },
    { id: "verification", label: "Verification Queue", icon: FileCheck },
    { id: "expiring-docs", label: "Expiring Docs", icon: FileCheck },
    { id: "expired-docs", label: "Expired Docs", icon: FileCheck },
    { id: "attendance", label: "Leave & Attendance", icon: CalendarCheck },
    { id: "payroll", label: "Payroll & Slips", icon: Wallet },
    { id: "bgv", label: "Background Checks", icon: ShieldAlert },
    { id: "training", label: "Training & Certs", icon: Award },
    { id: "assets", label: "Company Assets", icon: Laptop },
    { id: "contracts", label: "Contracts & NDAs", icon: FileSignature },
    { id: "licenses", label: "Agri Govt Licenses", icon: ScrollText },
    { id: "exit", label: "Exit Desk", icon: DoorOpen },
    { id: "reports", label: "HR Reports", icon: FileSpreadsheet },
    { id: "settings", label: "HR Settings", icon: Sliders },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Human Resources & Compliance Hub"
        subtitle="Manage company workforce, employee onboarding, verification queue, payroll, company assets, and government agriculture licenses."
      />

      {/* Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/20"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading HR & Workforce Desk...</div>}>
        <div className="tab-container">
          {activeTab === "employees" && <Employees />}
          {activeTab === "documents" && <EmployeeDocuments />}
          {activeTab === "verification" && <DocumentVerification />}
          {activeTab === "expiring-docs" && <ExpiringDocuments />}
          {activeTab === "expired-docs" && <ExpiredDocuments />}
          {activeTab === "attendance" && <LeaveAttendance />}
          {activeTab === "payroll" && <StatutoryPayroll />}
          {activeTab === "bgv" && <BackgroundVerification />}
          {activeTab === "training" && <TrainingCertifications />}
          {activeTab === "assets" && <CompanyAssets />}
          {activeTab === "contracts" && <ContractsAgreements />}
          {activeTab === "licenses" && <AgriLicenses />}
          {activeTab === "exit" && <ExitManagement />}
          {activeTab === "reports" && <HRReports />}
          {activeTab === "settings" && <DocumentSettings />}
        </div>
      </React.Suspense>
    </div>
  );
}

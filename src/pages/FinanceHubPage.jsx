import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Landmark, 
  CreditCard, 
  Receipt, 
  FileSpreadsheet, 
  PieChart, 
  Scale, 
  Coins 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";
import { useAuth } from "../hooks/useAuth";

// Lazy sub-components
const Finance = React.lazy(() => import("./Finance"));
const Payments = React.lazy(() => import("./Payments"));
const Expenses = React.lazy(() => import("./Expenses/Expenses"));
const ExpenseCategories = React.lazy(() => import("./Expenses/ExpenseCategories"));
const ExpenseVendors = React.lazy(() => import("./Expenses/ExpenseVendors"));
const GSTReports = React.lazy(() => import("./GSTReports"));
const FinancialStatements = React.lazy(() => import("./FinancialStatements"));
const CapTableLoans = React.lazy(() => import("./finance/CapTableLoans"));
const UnitEconomics = React.lazy(() => import("./UnitEconomics"));
const TallySync = React.lazy(() => import("./finance/TallySync"));
const ChartOfAccounts = React.lazy(() => import("./finance/ChartOfAccounts"));
const TDSCompliance = React.lazy(() => import("./finance/TDSCompliance"));
const DataImportHub = React.lazy(() => import("./finance/DataImportHub"));

export default function FinanceHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const isSuperAdmin = role === "SuperAdmin";

  const allTabs = [
    { id: "overview", label: "Finance Hub", icon: Landmark },
    { id: "data-import", label: "Data & Tally Importer", icon: Landmark },
    { id: "tally-sync", label: "Tally ERP Export", icon: FileSpreadsheet },
    { id: "chart-of-accounts", label: "Chart of Accounts (JV)", icon: Scale },
    { id: "tds-tax", label: "TDS & Tax Compliance", icon: Receipt },
    { id: "payments", label: "Payments & Inflow", icon: CreditCard },
    { id: "expenses", label: "Expenses & Bills", icon: Receipt },
    { id: "expense-categories", label: "Expense Categories", icon: Coins },
    { id: "expense-vendors", label: "Expense Vendors", icon: Scale },
    { id: "gst", label: "GST & Tax Reports", icon: FileSpreadsheet },
    { id: "statements", label: "P&L Statements", icon: PieChart },
    ...(isSuperAdmin ? [{ id: "cap-table", label: "Cap Table & Loans", icon: Scale }] : []),
    { id: "unit-economics", label: "Unit Economics", icon: Coins },
  ];

  const rawTab = (searchParams.get("tab") || "").trim();
  const activeTab = allTabs.some((t) => t.id === rawTab) ? rawTab : "overview";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Finance, Accounts & Tax Hub"
        subtitle="Manage business cash flows, customer payments, operating expenses, GST returns, and financial balance sheets."
      />

      {/* Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {allTabs.map((tab) => {
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading Financial Data...</div>}>
        <div className="tab-container">
          {activeTab === "overview" && <Finance />}
          {activeTab === "data-import" && <DataImportHub />}
          {activeTab === "tally-sync" && <TallySync />}
          {activeTab === "chart-of-accounts" && <ChartOfAccounts />}
          {activeTab === "tds-tax" && <TDSCompliance />}
          {activeTab === "payments" && <Payments />}
          {activeTab === "expenses" && <Expenses />}
          {activeTab === "expense-categories" && <ExpenseCategories />}
          {activeTab === "expense-vendors" && <ExpenseVendors />}
          {activeTab === "gst" && <GSTReports />}
          {activeTab === "statements" && <FinancialStatements />}
          {activeTab === "cap-table" && (isSuperAdmin ? <CapTableLoans /> : <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-100">Access Restricted to SuperAdmin only.</div>)}
          {activeTab === "unit-economics" && <UnitEconomics />}
        </div>
      </React.Suspense>
    </div>
  );
}

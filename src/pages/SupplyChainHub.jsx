import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Building2, 
  ClipboardList, 
  PackageCheck, 
  ArrowRightLeft, 
  Truck, 
  BookOpenCheck 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy sub-components
const Warehouses = React.lazy(() => import("./Warehouses"));
const ProcurementQueue = React.lazy(() => import("./ProcurementQueue"));
const AutoReorderEngine = React.lazy(() => import("./supply-chain/AutoReorderEngine"));
const GoodsReceipt = React.lazy(() => import("./GoodsReceipt"));
const ReturnToVendor = React.lazy(() => import("./supply-chain/ReturnToVendor"));
const PhysicalStockAudit = React.lazy(() => import("./inventory/PhysicalStockAudit"));
const InterHubTransfers = React.lazy(() => import("./InterHubTransfers"));
const Suppliers = React.lazy(() => import("./Suppliers"));
const SupplierLedger = React.lazy(() => import("./SupplierLedger"));
const AgriStatutoryRegisters = React.lazy(() => import("./compliance/AgriStatutoryRegisters"));

export default function SupplyChainHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "warehouses";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "warehouses", label: "Regional Hubs & Depots", icon: Building2 },
    { id: "procurement", label: "Purchase Orders (PO)", icon: ClipboardList },
    { id: "reorder", label: "Auto Re-Order (ROL)", icon: ClipboardList },
    { id: "grn", label: "Goods Receipt (GRN)", icon: PackageCheck },
    { id: "rtv", label: "Vendor Returns (RTV)", icon: ArrowRightLeft },
    { id: "audit", label: "Physical Stock Audit", icon: PackageCheck },
    { id: "transfers", label: "Inter-Hub Stock Transfers", icon: ArrowRightLeft },
    { id: "suppliers", label: "Suppliers Directory", icon: Truck },
    { id: "ledger", label: "Supplier Accounts Ledger", icon: BookOpenCheck },
    { id: "registers", label: "Form O / A Govt. Registers", icon: BookOpenCheck },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Supply Chain, Warehouses & Procurement Hub"
        subtitle="Manage regional depots, purchase orders, goods receipt notes, stock transfers, and supplier accounting."
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading Supply Chain Module...</div>}>
        <div className="tab-container">
          {activeTab === "warehouses" && <Warehouses />}
          {activeTab === "procurement" && <ProcurementQueue />}
          {activeTab === "reorder" && <AutoReorderEngine />}
          {activeTab === "grn" && <GoodsReceipt />}
          {activeTab === "rtv" && <ReturnToVendor />}
          {activeTab === "audit" && <PhysicalStockAudit />}
          {activeTab === "transfers" && <InterHubTransfers />}
          {activeTab === "suppliers" && <Suppliers />}
          {activeTab === "ledger" && <SupplierLedger />}
          {activeTab === "registers" && <AgriStatutoryRegisters />}
        </div>
      </React.Suspense>
    </div>
  );
}

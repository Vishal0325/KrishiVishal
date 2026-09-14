import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  ShoppingCart, 
  ShoppingBag, 
  PackageCheck, 
  RefreshCcw 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy sub-components
const Orders = React.lazy(() => import("./Orders"));
const AutoBatching = React.lazy(() => import("./AutoBatching"));
const PackingStation = React.lazy(() => import("./PackingStation"));
const RTOManagement = React.lazy(() => import("./RTOManagement"));
const AbandonedCarts = React.lazy(() => import("./AbandonedCarts"));
const Returns = React.lazy(() => import("./Returns"));

export default function OrdersHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "orders";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "orders", label: "All Customer Orders", icon: ShoppingCart },
    { id: "batching", label: "Smart Panchayat Dispatch", icon: PackageCheck },
    { id: "rto", label: "RTO & NDR Restock Desk", icon: RefreshCcw },
    { id: "packing", label: "Packing Station & Barcodes", icon: PackageCheck },
    { id: "abandoned", label: "Abandoned Carts Recovery", icon: ShoppingBag },
    { id: "returns", label: "Returns & Exchanges", icon: RefreshCcw },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Orders, Packing & Fulfillment Hub"
        subtitle="Manage customer orders, regional depot dispatch, packing station, cart recovery, and return requests."
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading Orders Desk...</div>}>
        <div className="tab-container">
          {activeTab === "orders" && <Orders />}
          {activeTab === "batching" && <AutoBatching />}
          {activeTab === "rto" && <RTOManagement />}
          {activeTab === "packing" && <PackingStation />}
          {activeTab === "abandoned" && <AbandonedCarts />}
          {activeTab === "returns" && <Returns />}
        </div>
      </React.Suspense>
    </div>
  );
}

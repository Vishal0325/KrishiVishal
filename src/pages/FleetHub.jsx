import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Bike, 
  MapPin, 
  Compass, 
  TrendingUp, 
  CalendarCheck, 
  AlertOctagon, 
  Banknote, 
  FileCheck2 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy sub-components
const Riders = React.lazy(() => import("./Riders"));
const Tracking = React.lazy(() => import("./Tracking"));
const Trips = React.lazy(() => import("./Trips"));
const RiderPerformance = React.lazy(() => import("./RiderPerformance"));
const Attendance = React.lazy(() => import("./Attendance"));
const SOSAlerts = React.lazy(() => import("./SOSAlerts"));
const RiderPayouts = React.lazy(() => import("./RiderPayouts"));
const CashRecon = React.lazy(() => import("./CashRecon"));
const RiderDocuments = React.lazy(() => import("./hr/RiderDocuments"));
const RiderWithdrawals = React.lazy(() => import("./RiderWithdrawals"));

export default function FleetHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "fleet";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "fleet", label: "Fleet Directory", icon: Bike },
    { id: "live", label: "Live GPS Tracking", icon: MapPin },
    { id: "trips", label: "Trips History", icon: Compass },
    { id: "performance", label: "Performance & SLA", icon: TrendingUp },
    { id: "attendance", label: "Shift Attendance", icon: CalendarCheck },
    { id: "sos", label: "SOS Alerts", icon: AlertOctagon },
    { id: "payouts", label: "Rider Payouts", icon: Banknote },
    { id: "withdrawals", label: "Withdrawal Requests", icon: Banknote },
    { id: "recon", label: "COD Reconciliation", icon: Banknote },
    { id: "compliance", label: "KYC & Compliance Docs", icon: FileCheck2 },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Fleet, Rider Operations & Live Delivery Hub"
        subtitle="Manage active riders, real-time vehicle GPS, trips, shift attendance, cash reconciliation, and compliance documents."
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading Fleet Operations...</div>}>
        <div className="tab-container">
          {activeTab === "fleet" && <Riders />}
          {activeTab === "live" && <Tracking />}
          {activeTab === "trips" && <Trips />}
          {activeTab === "performance" && <RiderPerformance />}
          {activeTab === "attendance" && <Attendance />}
          {activeTab === "sos" && <SOSAlerts />}
          {activeTab === "payouts" && <RiderPayouts />}
          {activeTab === "withdrawals" && <RiderWithdrawals />}
          {activeTab === "recon" && <CashRecon />}
          {activeTab === "compliance" && <RiderDocuments />}
        </div>
      </React.Suspense>
    </div>
  );
}

import React from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Users, 
  BarChart3, 
  Headphones, 
  AlertTriangle, 
  MessageSquareHeart 
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy sub-components
const Customers = React.lazy(() => import("./Customers"));
const CRMDashboard = React.lazy(() => import("./CRMDashboard"));
const SupportTickets = React.lazy(() => import("./SupportTickets"));
const Complaints = React.lazy(() => import("./Complaints"));
const CustomerFeedback = React.lazy(() => import("./CustomerFeedback"));
const CropAdvisoryCRM = React.lazy(() => import("./crm/CropAdvisoryCRM"));
const WhatsAppAutomation = React.lazy(() => import("./crm/WhatsAppAutomation"));
const SalesPipeline = React.lazy(() => import("./crm/SalesPipeline"));
const TeleAgronomyCallCenter = React.lazy(() => import("./crm/TeleAgronomyCallCenter"));

export default function SupportDeskHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "customers";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "customers", label: "Customers Directory", icon: Users },
    { id: "kisan-call-center", label: "Kisan Call Center & Tele-Doctor", icon: Headphones },
    { id: "crop-advisory", label: "Crop Advisory & Agri-CRM", icon: MessageSquareHeart },
    { id: "whatsapp", label: "WhatsApp Marketing & Drips", icon: Headphones },
    { id: "pipeline", label: "B2B Deals & Pipeline", icon: BarChart3 },
    { id: "crm", label: "CRM Analytics", icon: BarChart3 },
    { id: "tickets", label: "Support Tickets", icon: Headphones },
    { id: "complaints", label: "Order Complaints", icon: AlertTriangle },
    { id: "feedback", label: "Feedback & Ratings", icon: MessageSquareHeart },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Customer CRM & Support Helpdesk"
        subtitle="Manage farmer profiles, customer relationship analytics, support tickets, complaints resolution, and feedback."
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading CRM Desk...</div>}>
        <div className="tab-container">
          {activeTab === "customers" && <Customers />}
          {activeTab === "kisan-call-center" && <TeleAgronomyCallCenter />}
          {activeTab === "crop-advisory" && <CropAdvisoryCRM />}
          {activeTab === "whatsapp" && <WhatsAppAutomation />}
          {activeTab === "pipeline" && <SalesPipeline />}
          {activeTab === "crm" && <CRMDashboard />}
          {activeTab === "tickets" && <SupportTickets />}
          {activeTab === "complaints" && <Complaints />}
          {activeTab === "feedback" && <CustomerFeedback />}
        </div>
      </React.Suspense>
    </div>
  );
}

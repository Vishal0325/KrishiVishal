import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Package, 
  Layers, 
  Tag, 
  Sparkles, 
  Sprout, 
  Ticket, 
  Gift, 
  Image as ImageIcon,
  Database
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";

// Lazy-load sub-components
const Products = React.lazy(() => import("./Products"));
const SkuDashboard = React.lazy(() => import("./SkuDashboard"));
const Categories = React.lazy(() => import("./Categories"));
const Brands = React.lazy(() => import("./Brands"));
const Crops = React.lazy(() => import("./Crops"));
const MasterData = React.lazy(() => import("./MasterData"));
const Coupons = React.lazy(() => import("./Coupons"));
const Banners = React.lazy(() => import("./Banners"));
const Referrals = React.lazy(() => import("./Referrals"));
const ExpiryMonitor = React.lazy(() => import("./ExpiryMonitor"));
const DeadStockLiquidation = React.lazy(() => import("./DeadStockLiquidation"));

export default function CatalogHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "products";

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const tabs = [
    { id: "products", label: "Products Catalog", icon: Package },
    { id: "skus", label: "SKU & Stock Monitor", icon: Layers },
    { id: "liquidation", label: "Dead Stock Liquidation", icon: Sparkles },
    { id: "expiry", label: "FEFO Expiry & Quarantine", icon: Sparkles },
    { id: "categories", label: "Categories", icon: Tag },
    { id: "brands", label: "Brands", icon: Sparkles },
    { id: "crops", label: "Crops & Seasons", icon: Sprout },
    { id: "master", label: "Master Data & Units", icon: Database },
    { id: "coupons", label: "Coupons & Offers", icon: Ticket },
    { id: "banners", label: "Banners & Media", icon: ImageIcon },
    { id: "referrals", label: "Refer & Earn", icon: Gift },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Unified Catalog & SKU Inventory Hub"
        subtitle="Manage products, variants, brands, categories, crop mapping, offers, and banners in one unified center."
      />

      {/* Navigation Tabs Bar */}
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
      <React.Suspense fallback={<div className="p-12 text-center text-gray-400 font-bold">Loading Catalog Module...</div>}>
        <div className="tab-container">
          {activeTab === "products" && <Products />}
          {activeTab === "skus" && <SkuDashboard />}
          {activeTab === "liquidation" && <DeadStockLiquidation />}
          {activeTab === "expiry" && <ExpiryMonitor />}
          {activeTab === "categories" && <Categories />}
          {activeTab === "brands" && <Brands />}
          {activeTab === "crops" && <Crops />}
          {activeTab === "master" && <MasterData />}
          {activeTab === "coupons" && <Coupons />}
          {activeTab === "banners" && <Banners />}
          {activeTab === "referrals" && <Referrals />}
        </div>
      </React.Suspense>
    </div>
  );
}


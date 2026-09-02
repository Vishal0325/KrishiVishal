import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Grid3X3,
  Users,
  CreditCard,
  Banknote,
  Receipt,
  Image as ImageIcon,
  Bell,
  Bike,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCcw,
  Activity,
  Award,
  Sprout,
  Wallet,
  Navigation,
  AlertTriangle,
  Calendar,
  Route as RouteIcon,
  Cpu,
  Factory,
  Database,
  ClipboardList,
  PackageCheck,
  History,
  QrCode,
  TrendingUp,
  BookOpen,
  Landmark,
  Scale,
  Sparkles,
  Truck,
  Sliders,
  Headphones,
  AlertOctagon,
  Star
} from "lucide-react";
import { auth } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { role } = useAuth();
  const location = useLocation();

  const categories = [
    {
      id: "operations",
      label: "Operations & Orders",
      icon: <ShoppingCart size={16} className="text-emerald-300" />,
      roles: ["SuperAdmin", "OrderManager", "Viewer", "CatalogManager"],
      items: [
        { icon: <LayoutDashboard size={17} />, label: "Dashboard", path: "/", roles: ["SuperAdmin", "CatalogManager", "OrderManager", "Viewer"] },
        { icon: <ShoppingCart size={17} />, label: "Orders", path: "/orders", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <QrCode size={17} />, label: "Packing Station", path: "/packing-station", roles: ["SuperAdmin", "OrderManager", "Viewer"], isNew: true },
        { icon: <CreditCard size={17} />, label: "Payments", path: "/payments", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <RefreshCcw size={17} />, label: "Returns", path: "/returns", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
      ]
    },
    {
      id: "crm",
      label: "Customer CRM",
      icon: <Users size={16} className="text-teal-300" />,
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      items: [
        { icon: <Activity size={17} />, label: "CRM Overview", path: "/crm-dashboard", roles: ["SuperAdmin", "OrderManager", "Viewer"], isNew: true },
        { icon: <Users size={17} />, label: "Farmers (360°)", path: "/customers", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Headphones size={17} />, label: "Support Tickets", path: "/support-tickets", roles: ["SuperAdmin", "OrderManager", "Viewer"], isNew: true },
        { icon: <AlertOctagon size={17} />, label: "Grievances", path: "/complaints", roles: ["SuperAdmin", "OrderManager", "Viewer"], isNew: true },
        { icon: <Star size={17} />, label: "Customer Feedback", path: "/customer-feedback", roles: ["SuperAdmin", "OrderManager", "Viewer"], isNew: true },
      ]
    },
    {
      id: "supply-chain",
      label: "Supply Chain & Stock",
      icon: <Factory size={16} className="text-amber-300" />,
      roles: ["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"],
      items: [
        { icon: <Package size={17} />, label: "SKU Master & Stock", path: "/skus", roles: ["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"], isNew: true },
        { icon: <Factory size={17} />, label: "Suppliers", path: "/suppliers", roles: ["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"] },
        { icon: <ClipboardList size={17} />, label: "Procurement", path: "/procurement", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <PackageCheck size={17} />, label: "Goods Receipt (GRN)", path: "/grn", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <History size={17} />, label: "Stock Ledger", path: "/inventory-movements", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
      ]
    },
    {
      id: "catalog",
      label: "Catalog Management",
      icon: <Package size={16} className="text-lime-300" />,
      roles: ["SuperAdmin", "CatalogManager", "Viewer"],
      items: [
        { icon: <Package size={17} />, label: "Products", path: "/products", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Grid3X3 size={17} />, label: "Categories", path: "/categories", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Database size={17} />, label: "SKU Master Codes", path: "/master-data", roles: ["SuperAdmin", "ADMIN", "CatalogManager", "Viewer"], isNew: true },
        { icon: <Award size={17} />, label: "Brands", path: "/brands", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Sprout size={17} />, label: "Crops", path: "/crops", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Bell size={17} />, label: "Stock Requests", path: "/stock-requests", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
      ]
    },
    {
      id: "fleet",
      label: "Fleet & Logistics",
      icon: <Truck size={16} className="text-sky-300" />,
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      items: [
        { icon: <Bike size={17} />, label: "Riders", path: "/riders", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Activity size={17} />, label: "Rider Intelligence", path: "/rider-performance", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Navigation size={17} />, label: "Live Tracking", path: "/tracking", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <RouteIcon size={17} />, label: "Trips & Routes", path: "/trips", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Calendar size={17} />, label: "Attendance", path: "/attendance", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <AlertTriangle size={17} />, label: "SOS Alerts", path: "/sos", roles: ["SuperAdmin", "OrderManager"] },
      ]
    },
    {
      id: "finance",
      label: "ERP, Tax & Accounts",
      icon: <Landmark size={16} className="text-yellow-300" />,
      roles: ["SuperAdmin", "OrderManager"],
      items: [
        { icon: <TrendingUp size={17} />, label: "Unit Economics (P&L)", path: "/unit-economics", roles: ["SuperAdmin", "OrderManager"], isNew: true },
        { icon: <BookOpen size={17} />, label: "Supplier Ledger (A/P)", path: "/supplier-ledger", roles: ["SuperAdmin", "OrderManager"], isNew: true },
        { icon: <Landmark size={17} />, label: "GST & Tax Filing", path: "/gst-reports", roles: ["SuperAdmin", "OrderManager"], isNew: true },
        { icon: <Scale size={17} />, label: "Financial Statements", path: "/financial-statements", roles: ["SuperAdmin", "OrderManager"], isNew: true },
        { icon: <Receipt size={17} />, label: "Expenses", path: "/expenses", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Banknote size={17} />, label: "Rider Payouts", path: "/payouts", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Wallet size={17} />, label: "Cash Recon", path: "/reconciliation", roles: ["SuperAdmin", "OrderManager"] },
      ]
    },
    {
      id: "marketing",
      label: "Growth & Marketing",
      icon: <Sparkles size={16} className="text-purple-300" />,
      roles: ["SuperAdmin", "CatalogManager"],
      items: [
        { icon: <ImageIcon size={17} />, label: "Banners", path: "/banners", roles: ["SuperAdmin", "CatalogManager"] },
        { icon: <Bell size={17} />, label: "Notifications", path: "/notifications", roles: ["SuperAdmin", "CatalogManager"] },
      ]
    },
    {
      id: "intelligence",
      label: "Intelligence & Admin",
      icon: <Sliders size={16} className="text-cyan-300" />,
      roles: ["SuperAdmin", "OrderManager"],
      items: [
        { icon: <Cpu size={17} />, label: "AI Control Room", path: "/ai-control", roles: ["SuperAdmin"] },
        { icon: <BarChart3 size={17} />, label: "Analytics Reports", path: "/reports", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Activity size={17} />, label: "Audit Logs", path: "/audit-logs", roles: ["SuperAdmin"] },
        { icon: <Users size={17} />, label: "Staff Access", path: "/staff", roles: ["SuperAdmin"] },
        { icon: <Settings size={17} />, label: "Settings", path: "/settings", roles: ["SuperAdmin"] },
      ]
    }
  ];

  // Expanded Categories State (defaults all to open, allows user toggle)
  const [expandedCategories, setExpandedCategories] = useState({
    operations: true,
    crm: true,
    "supply-chain": true,
    catalog: true,
    fleet: true,
    finance: true,
    marketing: true,
    intelligence: true
  });

  // Auto-expand category containing current active route
  useEffect(() => {
    categories.forEach(cat => {
      if (cat.items.some(item => item.path === location.pathname)) {
        setExpandedCategories(prev => ({ ...prev, [cat.id]: true }));
      }
    });
  }, [location.pathname]);

  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  return (
    <div
      className={`h-screen bg-[#144217] text-white flex flex-col transition-all duration-300 ${isCollapsed ? "w-20" : "w-72"} select-none shadow-2xl border-r border-white/5`}
    >
      {/* Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10 bg-[#0e3311]">
        {!isCollapsed ? (
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-green-300 flex items-center justify-center shadow-md">
              <Sprout size={18} className="text-[#0e3311] font-black" />
            </div>
            <div>
              <span className="text-base font-black tracking-wider text-white">KrishiVishal</span>
              <p className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-widest leading-none">Enterprise ERP</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 mx-auto rounded-xl bg-gradient-to-tr from-emerald-500 to-green-300 flex items-center justify-center shadow-md">
            <Sprout size={18} className="text-[#0e3311]" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:bg-white/10 p-1.5 rounded-lg text-white/70 hover:text-white transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation Accordion List */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1.5 custom-scrollbar">
        {categories.map((category) => {
          const filteredItems = category.items.filter(item => item.roles.includes(role || "Viewer"));
          if (filteredItems.length === 0) return null;

          const isExpanded = expandedCategories[category.id] !== false;
          const hasActiveChild = filteredItems.some(i => i.path === location.pathname);

          return (
            <div key={category.id} className="rounded-xl overflow-hidden bg-white/[0.02] border border-white/[0.04]">
              {/* Category Header */}
              {!isCollapsed ? (
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-all group ${
                    hasActiveChild ? "text-emerald-300 font-black" : "text-white/60"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="opacity-80 group-hover:opacity-100">{category.icon}</span>
                    <span className="text-[10.5px] font-black uppercase tracking-wider text-white/80 group-hover:text-white">
                      {category.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] font-mono font-bold bg-white/10 text-white/60 px-1.5 py-0.2 rounded-full">
                      {filteredItems.length}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-white/40 group-hover:text-white transition-transform duration-200 ${
                        isExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </div>
                </button>
              ) : (
                <div className="p-2 text-center text-white/40 hover:text-white cursor-pointer" title={category.label}>
                  {category.icon}
                </div>
              )}

              {/* Items List (Collapsible) */}
              {(isExpanded || isCollapsed) && (
                <div className={`${!isCollapsed ? "pb-1.5 px-1 space-y-0.5" : "space-y-1"}`}>
                  {filteredItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={isCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all text-xs font-bold ${
                          isActive
                            ? "bg-emerald-600 text-white shadow-md font-black"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        } ${isCollapsed ? "justify-center px-0 py-2.5" : ""}`
                      }
                    >
                      <div className="min-w-[18px] flex items-center justify-center opacity-90">{item.icon}</div>
                      {!isCollapsed && (
                        <div className="flex-1 flex items-center justify-between">
                          <span className="truncate">{item.label}</span>
                          {item.isNew && (
                            <span className="text-[8.5px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                              NEW
                            </span>
                          )}
                        </div>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer User & Logout */}
      <div className="p-3 border-t border-white/10 bg-[#0e3311]">
        <button
          onClick={() => auth.signOut()}
          className={`flex items-center space-x-2.5 px-3 py-2.5 w-full hover:bg-red-500/20 text-red-300 hover:text-red-200 transition-all rounded-xl text-xs font-black uppercase tracking-wider ${
            isCollapsed ? "justify-center px-0" : ""
          }`}
          title="Logout"
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

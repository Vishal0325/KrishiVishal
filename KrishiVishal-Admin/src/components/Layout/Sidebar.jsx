import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Grid3X3,
  Users,
  CreditCard,
  Banknote,
  Tag,
  Receipt,
  Image as ImageIcon,
  Bell,
  Bike,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Activity,
  Award,
  Sprout,
  Wallet,
  Navigation,
  AlertTriangle,
  Calendar,
  Route as RouteIcon,
  IndianRupee,
  Cpu,
  ShieldCheck
} from "lucide-react";
import { auth } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { role } = useAuth();

  const categories = [
    {
      label: "Core Operations",
      roles: ["SuperAdmin", "OrderManager", "Viewer", "CatalogManager"],
      items: [
        { icon: <LayoutDashboard size={18} />, label: "Dashboard", path: "/", roles: ["SuperAdmin", "CatalogManager", "OrderManager", "Viewer"] },
        { icon: <ShoppingCart size={18} />, label: "Orders", path: "/orders", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <CreditCard size={18} />, label: "Payments", path: "/payments", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <RefreshCcw size={18} />, label: "Returns", path: "/returns", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Users size={18} />, label: "Customers", path: "/customers", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
      ]
    },
    {
      label: "Catalog Management",
      roles: ["SuperAdmin", "CatalogManager", "Viewer"],
      items: [
        { icon: <Package size={18} />, label: "Products", path: "/products", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Grid3X3 size={18} />, label: "Categories", path: "/categories", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Award size={18} />, label: "Brands", path: "/brands", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Sprout size={18} />, label: "Crops", path: "/crops", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
        { icon: <Bell size={18} />, label: "Stock Requests", path: "/stock-requests", roles: ["SuperAdmin", "CatalogManager", "Viewer"] },
      ]
    },
    {
      label: "Logistics & Fleet",
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      items: [
        { icon: <Bike size={18} />, label: "Riders", path: "/riders", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Activity size={18} />, label: "Rider Intelligence", path: "/rider-performance", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Navigation size={18} />, label: "Live Tracking", path: "/tracking", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <RouteIcon size={18} />, label: "Trips", path: "/trips", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Calendar size={18} />, label: "Attendance", path: "/attendance", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <AlertTriangle size={18} />, label: "SOS Alerts", path: "/sos", roles: ["SuperAdmin", "OrderManager"] },
      ]
    },
    {
      label: "Finance & Accounts",
      roles: ["SuperAdmin", "OrderManager"],
      items: [
        { icon: <IndianRupee size={18} />, label: "Finance", path: "/finance", roles: ["SuperAdmin"] },
        { icon: <Receipt size={18} />, label: "Expenses", path: "/expenses", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
        { icon: <Grid3X3 size={18} />, label: "Exp Categories", path: "/expenses/categories", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Users size={18} />, label: "Supply Partners", path: "/expenses/vendors", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Banknote size={18} />, label: "Rider Payouts", path: "/payouts", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Wallet size={18} />, label: "Settlement", path: "/settlement", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Wallet size={18} />, label: "Cash Recon", path: "/reconciliation", roles: ["SuperAdmin", "OrderManager"] },
      ]
    },
    {
      label: "Marketing",
      roles: ["SuperAdmin", "CatalogManager"],
      items: [
        { icon: <ImageIcon size={18} />, label: "Banners", path: "/banners", roles: ["SuperAdmin", "CatalogManager"] },
        { icon: <Bell size={18} />, label: "Notifications", path: "/notifications", roles: ["SuperAdmin", "CatalogManager"] },
      ]
    },
    {
      label: "Intelligence",
      roles: ["SuperAdmin", "OrderManager"],
      items: [
        { icon: <Cpu size={18} />, label: "AI Control", path: "/ai-control", roles: ["SuperAdmin"] },
        { icon: <BarChart3 size={18} />, label: "Reports", path: "/reports", roles: ["SuperAdmin", "OrderManager"] },
        { icon: <Activity size={18} />, label: "Audit Logs", path: "/audit-logs", roles: ["SuperAdmin"] },
      ]
    },
    {
      label: "System",
      roles: ["SuperAdmin"],
      items: [
        { icon: <Users size={18} />, label: "Staff", path: "/staff", roles: ["SuperAdmin"] },
        { icon: <Settings size={18} />, label: "Settings", path: "/settings", roles: ["SuperAdmin"] },
      ]
    }
  ];

  return (
    <div
      className={`h-screen bg-[#1b5e20] text-white flex flex-col transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}
    >
      <div className="p-6 flex items-center justify-between border-b border-white/10">
        {!isCollapsed && (
          <span className="text-xl font-bold tracking-wider">KrishiVishal</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:bg-white/10 p-1 rounded"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {categories.map((category, catIdx) => {
          const filteredItems = category.items.filter(item => item.roles.includes(role || "Viewer"));
          if (filteredItems.length === 0) return null;

          return (
            <div key={catIdx} className="mb-6">
              {!isCollapsed && (
                <p className="px-6 mb-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                  {category.label}
                </p>
              )}
              {filteredItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-6 py-2.5 transition-all ${
                      isActive
                        ? "bg-[#2e7d32] border-r-4 border-orange-500 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <div className="min-w-[20px]">{item.icon}</div>
                  {!isCollapsed && <span className="text-xs font-bold tracking-wide">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => auth.signOut()}
          className="flex items-center space-x-3 px-6 py-3 w-full hover:bg-red-500/20 text-red-100 transition-colors rounded-lg"
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="text-xs font-bold">Logout</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

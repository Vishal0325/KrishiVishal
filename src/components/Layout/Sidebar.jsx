import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Grid3X3,
  Building2,
  Bike,
  Users,
  Landmark,
  Briefcase,
  Settings,
  ChevronDown,
  Sprout,
  X
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { role } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState({});

  const menu = [
    { 
      icon: <LayoutDashboard size={18} />, 
      label: "Dashboard & AI", 
      id: "dashboard",
      roles: ["SuperAdmin", "CatalogManager", "OrderManager", "HubManager", "FinanceAdmin", "HRAdmin", "Viewer"],
      subItems: [
        { label: "Main Dashboard", path: "/" },
        { label: "AI Control Room", path: "/ai-control" }
      ]
    },
    { 
      icon: <ShoppingCart size={18} />, 
      label: "Orders & Fulfillment", 
      path: "/orders",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "Viewer"]
    },
    { 
      icon: <Grid3X3 size={18} />, 
      label: "Catalog & SKU Inventory", 
      path: "/catalog",
      roles: ["SuperAdmin", "CatalogManager", "HubManager", "Viewer"]
    },
    { 
      icon: <Building2 size={18} />, 
      label: "Supply Chain & Hubs", 
      path: "/supply-chain",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "CatalogManager", "Viewer"]
    },
    { 
      icon: <Bike size={18} />, 
      label: "Fleet & Delivery", 
      path: "/fleet",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "RiderManager"]
    },
    { 
      icon: <Users size={18} />, 
      label: "Customers & Support", 
      path: "/support-desk",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "Viewer"]
    },
    { 
      icon: <Landmark size={18} />, 
      label: "Finance & Accounts", 
      path: "/finance-desk",
      roles: ["SuperAdmin", "FinanceAdmin", "OrderManager"]
    },
    { 
      icon: <Briefcase size={18} />, 
      label: "HR & Compliance", 
      path: "/hr-desk",
      roles: ["SuperAdmin", "HRAdmin", "HRExecutive", "DepartmentManager"]
    },
    { 
      icon: <Sprout size={18} />, 
      label: "Service Marketplace", 
      id: "services",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "FinanceAdmin", "Viewer"],
      subItems: [
        { label: "Live Bookings", path: "/service-bookings" },
        { label: "Partner Settlements", path: "/partner-settlements" },
        { label: "Service Catalog Config", path: "/services-config" }
      ]
    },
    { 
      icon: <Settings size={18} />, 
      label: "Administration", 
      id: "administration",
      roles: ["SuperAdmin"],
      subItems: [
        { label: "Staff & RBAC Roles", path: "/staff" },
        { label: "Audit Logs", path: "/audit-logs" },
        { label: "Global Settings", path: "/settings" },
        { label: "Push Notifications", path: "/notifications" }
      ]
    },
  ];

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div className={`w-[260px] h-screen bg-white flex flex-col border-r border-gray-100 shadow-sm z-30 flex-shrink-0 transition-transform duration-300 absolute lg:relative ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'}`}>
        {/* Brand */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center">
              <Sprout size={20} />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 leading-tight">KrishiVishal</h1>
              <p className="text-[10px] text-gray-500 font-medium">Enterprise Admin ERP</p>
            </div>
          </div>
          <button className="lg:hidden p-1 bg-gray-50 text-gray-500 hover:text-gray-900 rounded-md" onClick={() => setIsOpen(false)}>
            <X size={18} />
          </button>
        </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
        {menu.filter(m => m.roles.includes(role || "Viewer")).map((item) => {
          if (item.subItems) {
            const isExpanded = expanded[item.id];
            const isActiveChild = item.subItems.some(sub => location.pathname === sub.path);
            return (
              <div key={item.id} className="mb-1">
                <button
                  onClick={() => toggleExpand(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                    isActiveChild ? "bg-green-50 text-green-800 font-bold" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActiveChild ? "text-green-700" : "text-gray-400"}>{item.icon}</span>
                    <span className="text-[13px] font-semibold">{item.label}</span>
                  </div>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="ml-9 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                    {item.subItems.map(sub => (
                      <NavLink
                        key={sub.path}
                        to={sub.path}
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                            isActive ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/30" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                          }`
                        }
                      >
                        {sub.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[13px] font-semibold mb-1 ${
                  isActive
                    ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/30"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? "text-white" : "text-gray-400"}>{item.icon}</span>
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Version Card */}
      <div className="p-4">
        <div className="bg-[#EAF5F0] rounded-2xl p-4 flex flex-col items-center justify-center text-center">
           <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 text-[#0B4D31]">
             <Sprout size={20} />
           </div>
           <h3 className="text-sm font-black text-[#0B4D31]">KrishiVishal</h3>
           <p className="text-[10px] text-green-800/70 font-semibold mb-2">Multi-Hub Agri ERP</p>
           <span className="text-[9px] font-bold text-green-700/60 uppercase">Version 2.5.0</span>
        </div>
      </div>
      </div>
    </>
  );
};
export default Sidebar;

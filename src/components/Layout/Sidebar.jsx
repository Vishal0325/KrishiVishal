import React, { useState, useEffect } from "react";
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
  X,
  Warehouse,
  Eye,
  PanelLeftClose
} from "lucide-react";
import { useAuthContext } from "../../hooks/useAuthContext";
import { db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { role, hubId, isHubManager, isDeptManager, isViewer } = useAuthContext();
  const location = useLocation();
  const [expanded, setExpanded] = useState({});
  const [warehouseName, setWarehouseName] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (hubId) {
      getDoc(doc(db, "warehouses", hubId))
        .then((snap) => {
          if (isMounted) {
            if (snap.exists()) {
              setWarehouseName(snap.data().name || hubId);
            } else {
              setWarehouseName(hubId);
            }
          }
        })
        .catch(() => {
          if (isMounted) setWarehouseName(hubId);
        });
    } else {
      setWarehouseName(null);
    }
    return () => {
      isMounted = false;
    };
  }, [hubId]);

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
      id: "orders_group",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "Viewer"],
      subItems: [
        { label: "Orders", path: "/orders" },
        { label: "Returns / RTO", path: "/returns" },
        { label: "AutoBatching", path: "/auto-batching" }
      ]
    },
    { 
      icon: <Grid3X3 size={18} />, 
      label: "Catalog & SKU Inventory", 
      id: "catalog_group",
      roles: ["SuperAdmin", "CatalogManager", "HubManager", "Viewer"],
      subItems: [
        { label: "Catalog", path: "/catalog" },
        { label: "SKU Dashboard", path: "/sku-dashboard" }
      ]
    },
    { 
      icon: <Building2 size={18} />, 
      label: "Supply Chain & Hubs", 
      id: "supply_group",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "CatalogManager", "Viewer"],
      subItems: [
        { label: "Procurement Queue", path: "/procurement" },
        { label: "Goods Receipt", path: "/grn" },
        { label: "Inter-Hub Transfers", path: "/transfers" },
        { label: "Expiry Monitor", path: "/expiry" },
        { label: "Warehouse Settings", path: "/warehouses" }
      ]
    },
    { 
      icon: <Bike size={18} />, 
      label: "Fleet & Delivery", 
      id: "fleet_group",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "RiderManager"],
      subItems: [
        { label: "Fleet Overview", path: "/fleet" },
        { label: "Riders / Workforce", path: "/riders" }
      ]
    },
    { 
      icon: <Users size={18} />, 
      label: "Customers & Support", 
      id: "support_group",
      roles: ["SuperAdmin", "OrderManager", "HubManager", "Viewer"],
      subItems: [
        { label: "Customers", path: "/customers" },
        { label: "Support Tickets", path: "/support-tickets" }
      ]
    },
    { 
      icon: <Landmark size={18} />, 
      label: "Finance & Accounts", 
      id: "finance_group",
      roles: ["SuperAdmin", "FinanceAdmin", "OrderManager"],
      subItems: [
        { label: "Finance / Ledger", path: "/finance" },
        { label: "Expenses", path: "/expenses" },
        { label: "Accounts / GST", path: "/chart-of-accounts" }
      ]
    },
    { 
      icon: <Briefcase size={18} />, 
      label: "HR & Compliance", 
      id: "hr_group",
      roles: ["SuperAdmin", "HRAdmin", "HRExecutive", "DepartmentManager"],
      subItems: [
        { label: "HR Desk", path: "/hr-desk" },
        { label: "Staff Management", path: "/staff" }
      ]
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
        { label: "Audit Logs", path: "/audit-logs" },
        { label: "Global Settings", path: "/settings" },
        { label: "Push Notifications", path: "/notifications" }
      ]
    }
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
      <div 
        className={`w-[260px] h-screen bg-white flex flex-col border-r border-gray-100 shadow-sm z-30 flex-shrink-0 transition-all duration-300 ease-in-out fixed lg:relative inset-y-0 left-0 ${
          isOpen 
            ? 'translate-x-0 lg:ml-0' 
            : '-translate-x-full lg:translate-x-0 lg:-ml-[260px]'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 flex items-center justify-between border-b border-gray-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0">
              <Sprout size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-gray-900 leading-tight truncate">KrishiVishal</h1>
              <p className="text-[10px] text-gray-500 font-medium truncate">Enterprise Admin ERP</p>
            </div>
          </div>
          <button 
            className="p-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-400 hover:text-[#0B4D31] rounded-xl border border-gray-200/60 hover:border-emerald-200 transition-all cursor-pointer shadow-xs group shrink-0" 
            onClick={() => setIsOpen(false)}
            title="Hide Sidebar (साइडबार छुपाएं) [Ctrl+B]"
            aria-label="Hide Sidebar"
          >
            <PanelLeftClose size={18} className="transition-transform group-hover:-translate-x-0.5" />
          </button>
        </div>

        {/* Hub Scope Badge (Oct 1 RBAC sprint) */}
        <div className="px-4 pt-3 pb-2">
          {isHubManager || isDeptManager ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <Warehouse size={16} className="text-emerald-700 shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Scoped Hub</p>
                <p className="text-xs font-black text-gray-900 truncate" title={warehouseName || hubId}>
                  🏪 {warehouseName || hubId || "Local Hub"}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-sm shrink-0">🌐</span>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Access Scope</p>
                <p className="text-xs font-black text-gray-700">All Hubs (Central)</p>
              </div>
            </div>
          )}

          {isViewer && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5 text-amber-800 text-[11px] font-semibold">
              <Eye size={13} className="shrink-0 text-amber-600" />
              <span>Read-Only Viewer Mode</span>
            </div>
          )}
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
        <div className="p-4 pt-2">
          <div className="bg-[#EAF5F0] rounded-2xl p-3 flex flex-col items-center justify-center text-center">
            <h3 className="text-xs font-black text-[#0B4D31]">KrishiVishal ERP</h3>
            <p className="text-[10px] text-green-800/70 font-semibold">
              {role || "Viewer"} • {hubId || "Global"}
            </p>
            <span className="text-[9px] font-bold text-green-700/60 uppercase mt-0.5">Version 2.5.0</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

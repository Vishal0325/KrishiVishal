import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  RotateCcw,
  Layers,
  ClipboardList,
  PackageCheck,
  ArrowLeftRight,
  AlertTriangle,
  Boxes,
  Users,
  Headphones,
  Bike,
  Landmark,
  Receipt,
  FileText,
  Bot,
  UserCog,
  Building2,
  Sprout,
  X,
  Eye,
  Warehouse
} from "lucide-react";
import { useAuthContext } from "../../hooks/useAuthContext";
import { navConfig } from "../../config/navConfig";
import { db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const ICON_MAP = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  ShoppingCart: <ShoppingCart size={18} />,
  RotateCcw: <RotateCcw size={18} />,
  Layers: <Layers size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  PackageCheck: <PackageCheck size={18} />,
  ArrowLeftRight: <ArrowLeftRight size={18} />,
  AlertTriangle: <AlertTriangle size={18} />,
  Boxes: <Boxes size={18} />,
  Users: <Users size={18} />,
  Headphones: <Headphones size={18} />,
  Bike: <Bike size={18} />,
  Landmark: <Landmark size={18} />,
  Receipt: <Receipt size={18} />,
  FileText: <FileText size={18} />,
  Bot: <Bot size={18} />,
  UserCog: <UserCog size={18} />,
  Building2: <Building2 size={18} />
};

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { role, hubId, isHubManager, isDeptManager, isViewer, isSuperAdmin } = useAuthContext();
  const location = useLocation();
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

  // Filter nav items based on user's role
  const visibleItems = navConfig.filter((item) => {
    if (isSuperAdmin || role === "SuperAdmin") return true;
    if (!role) return item.allowedRoles.includes("Viewer");
    return item.allowedRoles.includes(role);
  });

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
        className={`w-[260px] h-screen bg-white flex flex-col border-r border-gray-100 shadow-sm z-30 flex-shrink-0 transition-transform duration-300 absolute lg:relative ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:hidden"
        }`}
      >
        {/* Brand */}
        <div className="p-5 pb-3 flex items-center justify-between border-b border-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center">
              <Sprout size={20} />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 leading-tight">KrishiVishal</h1>
              <p className="text-[10px] text-gray-500 font-medium">Enterprise Admin ERP</p>
            </div>
          </div>
          <button
            className="lg:hidden p-1 bg-gray-50 text-gray-500 hover:text-gray-900 rounded-md"
            onClick={() => setIsOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Hub Scope Badge */}
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

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
          {visibleItems.map((item) => {
            const iconComponent = ICON_MAP[item.icon] || <Boxes size={18} />;
            const isItemReadOnly = isViewer || (item.readOnlyFor && item.readOnlyFor.includes(role));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-[13px] font-semibold mb-1 ${
                    isActive
                      ? "bg-[#0B4D31] text-white shadow-md shadow-[#0B4D31]/30"
                      : isViewer
                      ? "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <span className={isActive ? "text-white" : isViewer ? "text-gray-400" : "text-gray-500"}>
                        {iconComponent}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {isItemReadOnly && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                      }`}>
                        View
                      </span>
                    )}
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

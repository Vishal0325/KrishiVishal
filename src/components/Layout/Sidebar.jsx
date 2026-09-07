import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Factory,
  ClipboardList,
  PackageCheck,
  History,
  RefreshCcw,
  Bike,
  Landmark,
  BarChart3,
  Users,
  Grid3X3,
  Settings,
  ChevronDown,
  Sprout,
  Ticket,
  Gift,
  X,
  Briefcase
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
      roles: ["SuperAdmin", "CatalogManager", "OrderManager", "Viewer"],
      subItems: [
        { label: "Main Dashboard", path: "/" },
        { label: "AI Control Room", path: "/ai-control" }
      ]
    },
    { 
      icon: <ShoppingCart size={18} />, 
      label: "Orders", 
      id: "orders",
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      subItems: [
        { label: "All Orders", path: "/orders" },
        { label: "Abandoned Carts", path: "/abandoned-carts" },
        { label: "Packing Station", path: "/packing-station" }
      ]
    },
    { 
      icon: <Package size={18} />, 
      label: "Inventory", 
      id: "inventory",
      roles: ["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"],
      subItems: [
        { label: "SKU Dashboard", path: "/inventory" },
        { label: "Stock Requests", path: "/stock-requests" }
      ]
    },
    { icon: <Factory size={18} />, label: "Warehouses", path: "/warehouses", roles: ["SuperAdmin", "OrderManager"] },
    { 
      icon: <ClipboardList size={18} />, 
      label: "Procurement", 
      id: "procurement",
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      subItems: [
        { label: "Purchase Orders", path: "/procurement" },
        { label: "Suppliers", path: "/suppliers" },
      ]
    },
    { icon: <PackageCheck size={18} />, label: "GRN", path: "/grn", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
    { icon: <History size={18} />, label: "Stock Transfers", path: "/transfers", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
    { icon: <RefreshCcw size={18} />, label: "Returns", path: "/returns", roles: ["SuperAdmin", "OrderManager", "Viewer"] },
    { 
      icon: <Bike size={18} />, 
      label: "Riders & Delivery", 
      id: "riders",
      roles: ["SuperAdmin", "OrderManager"],
      subItems: [
        { label: "Riders List", path: "/riders" },
        { label: "Performance", path: "/rider-performance" },
        { label: "Live Tracking", path: "/tracking" },
        { label: "Trips History", path: "/trips" },
        { label: "Attendance", path: "/attendance" },
        { label: "SOS Alerts", path: "/sos" },
        { label: "Delivery Rules", path: "/delivery-rules" }
      ]
    },
    { 
      icon: <Landmark size={18} />, 
      label: "Finance & Ledger", 
      id: "finance",
      roles: ["SuperAdmin", "OrderManager"],
      subItems: [
        { label: "Finance Hub", path: "/finance" },
        { label: "Payments", path: "/payments" },
        { label: "Expenses", path: "/expenses" },
        { label: "Add Expense", path: "/expenses/new" },
        { label: "Expense Categories", path: "/expenses/categories" },
        { label: "Expense Vendors", path: "/expenses/vendors" },
        { label: "Payouts", path: "/payouts" },
        { label: "Reconciliation", path: "/reconciliation" },
        { label: "Settlement", path: "/settlement" },
        { label: "GST Reports", path: "/gst-reports" },
        { label: "Financial Statements", path: "/financial-statements" },
        { label: "Cap Table & Loans", path: "/finance/cap-table" },
        { label: "Unit Economics", path: "/unit-economics" },
        { label: "Supplier Ledger", path: "/supplier-ledger" }
      ]
    },
    { icon: <BarChart3 size={18} />, label: "Reports", path: "/reports", roles: ["SuperAdmin", "OrderManager"] },
    { 
      icon: <Users size={18} />, 
      label: "Customers & Support", 
      id: "customers",
      roles: ["SuperAdmin", "OrderManager", "Viewer"],
      subItems: [
        { label: "Customers Directory", path: "/customers" },
        { label: "CRM Dashboard", path: "/crm-dashboard" },
        { label: "Support Tickets", path: "/support-tickets" },
        { label: "Complaints", path: "/complaints" },
        { label: "Customer Feedback", path: "/customer-feedback" }
      ]
    },
    { 
      icon: <Grid3X3 size={18} />, 
      label: "Products & SKUs", 
      id: "products",
      roles: ["SuperAdmin", "CatalogManager", "Viewer"],
      subItems: [
        { label: "All Products", path: "/products" },
        { label: "Add New Product", path: "/product/new" },
        { label: "Categories", path: "/categories" },
        { label: "Brands", path: "/brands" },
        { label: "Crops", path: "/crops" },
        { label: "Master Data", path: "/master-data" }
      ]
    },
    { icon: <Ticket size={18} />, label: "Coupons & Offers", path: "/coupons", roles: ["SuperAdmin", "CatalogManager"] },
    { icon: <Gift size={18} />, label: "Refer & Earn", path: "/referrals", roles: ["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"] },
    { 
      icon: <Briefcase size={18} />, 
      label: "HR & Workforce", 
      id: "hr_workforce",
      roles: ["SuperAdmin", "HRAdmin", "HRExecutive", "FinanceAdmin", "OperationsAdmin", "DepartmentManager"],
      subItems: [
        { label: "Employees", path: "/hr/employees" },
        { label: "Riders (HR)", path: "/hr/riders" },
        { label: "Employee Documents", path: "/hr/documents" },
        { label: "Rider Documents", path: "/hr/rider-documents" },
        { label: "Document Verification", path: "/hr/document-verification" },
        { label: "Expiring Documents", path: "/hr/expiring-documents" },
        { label: "Expired Documents", path: "/hr/expired-documents" },
        { label: "Background Verification", path: "/hr/background-verification" },
        { label: "Training & Certs", path: "/hr/training" },
        { label: "Physical Files", path: "/hr/physical-files" },
        { label: "Company Assets", path: "/hr/company-assets" },
        { label: "Contracts & NDAs", path: "/hr/contracts" },
        { label: "Exit Management", path: "/hr/exit-management" },
        { label: "HR Dashboard", path: "/hr/dashboard" },
        { label: "Agri & Statutory Licenses", path: "/hr/licenses" },
        { label: "Leave & Attendance", path: "/hr/leave-attendance" },
        { label: "Statutory Payroll & Slips", path: "/hr/payroll" },
        { label: "HR Reports", path: "/hr/reports" },
        { label: "Document Settings", path: "/hr/settings" }
      ]
    },
    { 
      icon: <Settings size={18} />, 
      label: "Administration", 
      id: "administration",
      roles: ["SuperAdmin"],
      subItems: [
        { label: "Global Settings", path: "/settings" },
        { label: "Staff Management", path: "/staff" },
        { label: "Audit Logs", path: "/audit-logs" },
        { label: "App Banners", path: "/banners" },
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
              <p className="text-[10px] text-gray-500 font-medium">Admin Panel</p>
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
           <p className="text-[10px] text-green-800/70 font-semibold mb-2">Agri Supply Chain ERP</p>
           <span className="text-[9px] font-bold text-green-700/60 uppercase">Version 2.0.0</span>
        </div>
      </div>
      </div>
    </>
  );
};
export default Sidebar;

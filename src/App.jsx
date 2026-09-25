import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { auth } from "./firebase/config";
import { signOut } from "firebase/auth";
import LoadingSpinner from "./components/common/LoadingSpinner";
import { Toaster } from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

// Layout & Core Pages
const Layout = React.lazy(() => import("./components/Layout/Layout"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const AIControlRoom = React.lazy(() => import("./pages/AIControlRoom"));
const Login = React.lazy(() => import("./pages/Login"));
const Unauthorized = React.lazy(() => import("./pages/Unauthorized"));
const Profile = React.lazy(() => import("./pages/Profile"));

// 7 Consolidated Enterprise Hubs
const OrdersHubPage = React.lazy(() => import("./pages/OrdersHubPage"));
const CatalogHub = React.lazy(() => import("./pages/CatalogHub"));
const SupplyChainHub = React.lazy(() => import("./pages/SupplyChainHub"));
const FleetHub = React.lazy(() => import("./pages/FleetHub"));
const SupportDeskHub = React.lazy(() => import("./pages/SupportDeskHub"));
const FinanceHubPage = React.lazy(() => import("./pages/FinanceHubPage"));
const HRHubPage = React.lazy(() => import("./pages/HRHubPage"));

// Administration
const Staff = React.lazy(() => import("./pages/Staff"));
const AuditLogs = React.lazy(() => import("./pages/AuditLogs"));
const Settings = React.lazy(() => import("./pages/Settings"));
const DeliverySlots = React.lazy(() => import("./pages/DeliverySlots"));
const Notifications = React.lazy(() => import("./pages/Notifications"));

// Service Marketplace
const ServicesConfig = React.lazy(() => import("./pages/ServicesConfig"));
const ServiceBookings = React.lazy(() => import("./pages/ServiceBookings"));
const PartnerSettlements = React.lazy(() => import("./pages/PartnerSettlements"));

// Deep Details Pages (Direct views)
const ProductDetail = React.lazy(() => import("./pages/ProductDetail"));
const PurchaseOrderDetail = React.lazy(() => import("./pages/PurchaseOrderDetail"));
const EmployeeProfile = React.lazy(() => import("./pages/hr/EmployeeProfile"));
const RiderProfile = React.lazy(() => import("./pages/hr/RiderProfile"));
const ExpenseDetail = React.lazy(() => import("./pages/Expenses/ExpenseDetail"));
const ExpenseForm = React.lazy(() => import("./pages/Expenses/ExpenseForm"));

function App() {
  const { user, loading, isAdmin, role, authError } = useAuth();

  const RequireRole = ({ allowedRoles, children }) => {
    if (!user || !role) {
      return <Navigate to="/login" replace />;
    }
    // SuperAdmin bypasses all role checks
    if (role === "SuperAdmin") {
      return children;
    }
    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/unauthorized" replace />;
    }
    return children;
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (authError) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-red-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-200 text-center">
          <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
          <h1 className="text-2xl font-black text-gray-900 mb-2">Authentication Error</h1>
          <p className="text-gray-500 text-sm mb-6">{authError}</p>
          <button onClick={() => window.location.reload()} className="bg-primary text-white px-6 py-2 rounded-xl font-bold">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <React.Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </React.Suspense>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-red-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center">
          <div className="h-18 w-18 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Your account does not have administrator privileges. Please contact
            the super admin to enable your access.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg text-left mb-6">
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Your ID (Copy this)
            </p>
            <p className="font-mono text-xs text-gray-700 break-all select-all">
              {user.uid}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#1b5e20] text-white py-3 rounded-xl font-bold hover:bg-[#2e7d32] transition-colors"
          >
            I've been granted access
          </button>
          <button
            onClick={() => signOut(auth)}
            className="w-full mt-4 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg"
          >
            LOGOUT AND SWITCH ACCOUNT
          </button>
        </div>
      </div>
    );
  }

  const hrRoles = ["SuperAdmin", "HRAdmin", "HRExecutive", "DepartmentManager"];
  const opsRoles = ["SuperAdmin", "OrderManager", "HubManager", "WarehouseManager", "OperationsAdmin", "Viewer"];
  const catalogRoles = ["SuperAdmin", "CatalogManager", "HubManager", "Viewer"];
  const financeRoles = ["SuperAdmin", "FinanceAdmin", "OrderManager"];
  const fleetRoles = ["SuperAdmin", "OrderManager", "HubManager", "RiderManager"];

  const RootRedirect = () => {
    if (role === 'FinanceAdmin') return <Navigate to="/finance-desk" replace />;
    if (hrRoles.includes(role) && role !== "SuperAdmin") return <Navigate to="/hr-desk" replace />;
    if (role === 'RiderManager') return <Navigate to="/fleet" replace />;
    return <Dashboard />;
  };

  return (
    <>
      <Toaster position="top-right" />
      <React.Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/ai-control" element={<RequireRole allowedRoles={["SuperAdmin"]}><AIControlRoom /></RequireRole>} />

            {/* 7 Unified Enterprise Hubs */}
            <Route path="/orders" element={<RequireRole allowedRoles={opsRoles}><OrdersHubPage /></RequireRole>} />
            <Route path="/catalog" element={<RequireRole allowedRoles={catalogRoles}><CatalogHub /></RequireRole>} />
            <Route path="/supply-chain" element={<RequireRole allowedRoles={opsRoles}><SupplyChainHub /></RequireRole>} />
            <Route path="/fleet" element={<RequireRole allowedRoles={fleetRoles}><FleetHub /></RequireRole>} />
            <Route path="/support-desk" element={<RequireRole allowedRoles={opsRoles}><SupportDeskHub /></RequireRole>} />
            <Route path="/finance-desk" element={<RequireRole allowedRoles={financeRoles}><FinanceHubPage /></RequireRole>} />
            <Route path="/hr-desk" element={<RequireRole allowedRoles={hrRoles}><HRHubPage /></RequireRole>} />

            {/* Administration & Staff Management */}
            <Route path="/staff" element={<RequireRole allowedRoles={["SuperAdmin"]}><Staff /></RequireRole>} />
            <Route path="/audit-logs" element={<RequireRole allowedRoles={["SuperAdmin"]}><AuditLogs /></RequireRole>} />
            <Route path="/settings" element={<RequireRole allowedRoles={["SuperAdmin"]}><Settings /></RequireRole>} />
            <Route path="/delivery-slots" element={<RequireRole allowedRoles={opsRoles}><DeliverySlots /></RequireRole>} />
            <Route path="/notifications" element={<RequireRole allowedRoles={catalogRoles}><Notifications /></RequireRole>} />
            <Route path="/profile" element={<Profile />} />

            {/* Service Marketplace */}
            <Route path="/services-config" element={<RequireRole allowedRoles={["SuperAdmin", "HubManager", "OrderManager", "Viewer"]}><ServicesConfig /></RequireRole>} />
            <Route path="/service-bookings" element={<RequireRole allowedRoles={["SuperAdmin", "HubManager", "OrderManager", "Viewer"]}><ServiceBookings /></RequireRole>} />
            <Route path="/partner-settlements" element={<RequireRole allowedRoles={["SuperAdmin", "HubManager", "FinanceAdmin", "Viewer"]}><PartnerSettlements /></RequireRole>} />

            {/* Direct Detail Pages */}
            <Route path="/product/:productId" element={<RequireRole allowedRoles={catalogRoles}><ProductDetail /></RequireRole>} />
            <Route path="/purchase-order/:id" element={<RequireRole allowedRoles={opsRoles}><PurchaseOrderDetail /></RequireRole>} />
            <Route path="/hr/employees/:employeeId" element={<RequireRole allowedRoles={hrRoles}><EmployeeProfile /></RequireRole>} />
            <Route path="/hr/riders/:riderId" element={<RequireRole allowedRoles={fleetRoles}><RiderProfile /></RequireRole>} />
            <Route path="/expenses/new" element={<RequireRole allowedRoles={financeRoles}><ExpenseForm /></RequireRole>} />
            <Route path="/expenses/edit/:id" element={<RequireRole allowedRoles={financeRoles}><ExpenseForm /></RequireRole>} />
            <Route path="/expenses/:id" element={<RequireRole allowedRoles={financeRoles}><ExpenseDetail /></RequireRole>} />

            {/* ========================================================================= */}
            {/* 100% Backward Compatible Redirects for KrishiVishal & Bookmarks          */}
            {/* ========================================================================= */}
            
            {/* Catalog Aliases */}
            <Route path="/products" element={<Navigate to="/catalog?tab=products" replace />} />
            <Route path="/inventory" element={<Navigate to="/catalog?tab=skus" replace />} />
            <Route path="/skus" element={<Navigate to="/catalog?tab=skus" replace />} />
            <Route path="/sku-dashboard" element={<Navigate to="/catalog?tab=skus" replace />} />
            <Route path="/dead-stock" element={<Navigate to="/catalog?tab=liquidation" replace />} />
            <Route path="/liquidation" element={<Navigate to="/catalog?tab=liquidation" replace />} />
            <Route path="/expiry" element={<Navigate to="/catalog?tab=expiry" replace />} />
            <Route path="/expiry-monitor" element={<Navigate to="/catalog?tab=expiry" replace />} />
            <Route path="/categories" element={<Navigate to="/catalog?tab=categories" replace />} />
            <Route path="/brands" element={<Navigate to="/catalog?tab=brands" replace />} />
            <Route path="/crops" element={<Navigate to="/catalog?tab=crops" replace />} />
            <Route path="/master-data" element={<Navigate to="/catalog?tab=master" replace />} />
            <Route path="/stock-requests" element={<Navigate to="/catalog?tab=skus" replace />} />
            <Route path="/coupons" element={<Navigate to="/catalog?tab=coupons" replace />} />
            <Route path="/banners" element={<Navigate to="/catalog?tab=banners" replace />} />
            <Route path="/referrals" element={<Navigate to="/catalog?tab=referrals" replace />} />


            {/* Orders Aliases */}
            <Route path="/auto-batching" element={<Navigate to="/orders?tab=batching" replace />} />
            <Route path="/batch-dispatch" element={<Navigate to="/orders?tab=batching" replace />} />
            <Route path="/packing-station" element={<Navigate to="/orders?tab=packing" replace />} />
            <Route path="/abandoned-carts" element={<Navigate to="/orders?tab=abandoned" replace />} />
            <Route path="/returns" element={<Navigate to="/orders?tab=returns" replace />} />

            {/* Supply Chain & Warehouses Aliases */}
            <Route path="/warehouses" element={<Navigate to="/supply-chain?tab=warehouses" replace />} />
            <Route path="/procurement" element={<Navigate to="/supply-chain?tab=procurement" replace />} />
            <Route path="/auto-reorder" element={<Navigate to="/supply-chain?tab=reorder" replace />} />
            <Route path="/grn" element={<Navigate to="/supply-chain?tab=grn" replace />} />
            <Route path="/rtv" element={<Navigate to="/supply-chain?tab=rtv" replace />} />
            <Route path="/return-to-vendor" element={<Navigate to="/supply-chain?tab=rtv" replace />} />
            <Route path="/physical-audit" element={<Navigate to="/supply-chain?tab=audit" replace />} />
            <Route path="/cycle-count" element={<Navigate to="/supply-chain?tab=audit" replace />} />
            <Route path="/transfers" element={<Navigate to="/supply-chain?tab=transfers" replace />} />
            <Route path="/inventory-movements" element={<Navigate to="/supply-chain?tab=transfers" replace />} />
            <Route path="/suppliers" element={<Navigate to="/supply-chain?tab=suppliers" replace />} />
            <Route path="/supplier-ledger" element={<Navigate to="/supply-chain?tab=ledger" replace />} />
            <Route path="/statutory-registers" element={<Navigate to="/supply-chain?tab=registers" replace />} />
            <Route path="/form-o" element={<Navigate to="/supply-chain?tab=registers" replace />} />
            <Route path="/form-a" element={<Navigate to="/supply-chain?tab=registers" replace />} />

            {/* Fleet & Rider Aliases */}
            <Route path="/riders" element={<Navigate to="/fleet?tab=fleet" replace />} />
            <Route path="/tracking" element={<Navigate to="/fleet?tab=live" replace />} />
            <Route path="/trips" element={<Navigate to="/fleet?tab=trips" replace />} />
            <Route path="/rider-performance" element={<Navigate to="/fleet?tab=performance" replace />} />
            <Route path="/attendance" element={<Navigate to="/fleet?tab=attendance" replace />} />
            <Route path="/sos" element={<Navigate to="/fleet?tab=sos" replace />} />
            <Route path="/payouts" element={<Navigate to="/fleet?tab=payouts" replace />} />
            <Route path="/withdrawals" element={<Navigate to="/fleet?tab=withdrawals" replace />} />
            <Route path="/reconciliation" element={<Navigate to="/fleet?tab=recon" replace />} />
            <Route path="/settlement" element={<Navigate to="/fleet?tab=recon" replace />} />
            <Route path="/delivery-rules" element={<Navigate to="/fleet?tab=fleet" replace />} />

            {/* Customer & Support Aliases */}
            <Route path="/customers" element={<Navigate to="/support-desk?tab=customers" replace />} />
            <Route path="/kisan-call-center" element={<Navigate to="/support-desk?tab=kisan-call-center" replace />} />
            <Route path="/tele-agronomy" element={<Navigate to="/support-desk?tab=kisan-call-center" replace />} />
            <Route path="/call-center" element={<Navigate to="/support-desk?tab=kisan-call-center" replace />} />
            <Route path="/crop-advisory" element={<Navigate to="/support-desk?tab=crop-advisory" replace />} />
            <Route path="/whatsapp-marketing" element={<Navigate to="/support-desk?tab=whatsapp" replace />} />
            <Route path="/sales-pipeline" element={<Navigate to="/support-desk?tab=pipeline" replace />} />
            <Route path="/crm-dashboard" element={<Navigate to="/support-desk?tab=crm" replace />} />
            <Route path="/support-tickets" element={<Navigate to="/support-desk?tab=tickets" replace />} />
            <Route path="/complaints" element={<Navigate to="/support-desk?tab=complaints" replace />} />
            <Route path="/customer-feedback" element={<Navigate to="/support-desk?tab=feedback" replace />} />

            {/* Finance Aliases */}
            <Route path="/finance" element={<Navigate to="/finance-desk?tab=overview" replace />} />
            <Route path="/data-import" element={<Navigate to="/finance-desk?tab=data-import" replace />} />
            <Route path="/import" element={<Navigate to="/finance-desk?tab=data-import" replace />} />
            <Route path="/tally-sync" element={<Navigate to="/finance-desk?tab=tally-sync" replace />} />
            <Route path="/chart-of-accounts" element={<Navigate to="/finance-desk?tab=chart-of-accounts" replace />} />
            <Route path="/tds" element={<Navigate to="/finance-desk?tab=tds-tax" replace />} />
            <Route path="/payments" element={<Navigate to="/finance-desk?tab=payments" replace />} />
            <Route path="/expenses" element={<Navigate to="/finance-desk?tab=expenses" replace />} />
            <Route path="/expenses/categories" element={<Navigate to="/finance-desk?tab=expense-categories" replace />} />
            <Route path="/expenses/vendors" element={<Navigate to="/finance-desk?tab=expense-vendors" replace />} />
            <Route path="/gst-reports" element={<Navigate to="/finance-desk?tab=gst" replace />} />
            <Route path="/financial-statements" element={<Navigate to="/finance-desk?tab=statements" replace />} />
            <Route path="/finance/cap-table" element={<Navigate to="/finance-desk?tab=cap-table" replace />} />
            <Route path="/unit-economics" element={<Navigate to="/finance-desk?tab=unit-economics" replace />} />
            <Route path="/reports" element={<Navigate to="/finance-desk?tab=statements" replace />} />

            {/* HR Aliases */}
            <Route path="/hr/employees" element={<Navigate to="/hr-desk?tab=employees" replace />} />
            <Route path="/hr/riders" element={<Navigate to="/fleet?tab=compliance" replace />} />
            <Route path="/hr/documents" element={<Navigate to="/hr-desk?tab=documents" replace />} />
            <Route path="/hr/rider-documents" element={<Navigate to="/fleet?tab=compliance" replace />} />
            <Route path="/hr/document-verification" element={<Navigate to="/hr-desk?tab=verification" replace />} />
            <Route path="/hr/expiring-documents" element={<Navigate to="/hr-desk?tab=expiring-docs" replace />} />
            <Route path="/hr/expired-documents" element={<Navigate to="/hr-desk?tab=expired-docs" replace />} />
            <Route path="/hr/background-verification" element={<Navigate to="/hr-desk?tab=bgv" replace />} />
            <Route path="/hr/training" element={<Navigate to="/hr-desk?tab=training" replace />} />
            <Route path="/hr/physical-files" element={<Navigate to="/hr-desk?tab=documents" replace />} />
            <Route path="/hr/company-assets" element={<Navigate to="/hr-desk?tab=assets" replace />} />
            <Route path="/hr/contracts" element={<Navigate to="/hr-desk?tab=contracts" replace />} />
            <Route path="/hr/exit-management" element={<Navigate to="/hr-desk?tab=exit" replace />} />
            <Route path="/hr/dashboard" element={<Navigate to="/hr-desk?tab=employees" replace />} />
            <Route path="/hr/reports" element={<Navigate to="/hr-desk?tab=reports" replace />} />
            <Route path="/hr/settings" element={<Navigate to="/hr-desk?tab=settings" replace />} />
            <Route path="/hr/licenses" element={<Navigate to="/hr-desk?tab=licenses" replace />} />
            <Route path="/hr/leave-attendance" element={<Navigate to="/hr-desk?tab=attendance" replace />} />
            <Route path="/hr/payroll" element={<Navigate to="/hr-desk?tab=payroll" replace />} />
            <Route path="/roles" element={<Navigate to="/staff" replace />} />
            <Route path="/rbac" element={<Navigate to="/staff" replace />} />
            <Route path="/permissions" element={<Navigate to="/staff" replace />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </React.Suspense>
    </>
  );
}

export default App;

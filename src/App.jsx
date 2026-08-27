import React from "react";
import { Routes, Route, Navigate, BrowserRouter } from "react-router-dom";
import Layout from "./components/Layout/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Categories from "./pages/Categories";
import Brands from "./pages/Brands";
import Crops from "./pages/Crops";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Banners from "./pages/Banners";
import Notifications from "./pages/Notifications";
import Reports from "./pages/Reports";
import Payments from "./pages/Payments";
import RiderPayouts from "./pages/RiderPayouts";
import Settings from "./pages/Settings";
import Returns from "./pages/Returns";
import Login from "./pages/Login";
import Staff from "./pages/Staff";
import Riders from "./pages/Riders";
import AuditLogs from "./pages/AuditLogs";
import Settlement from "./pages/Settlement";
import Tracking from "./pages/Tracking";
import SOSAlerts from "./pages/SOSAlerts";
import Attendance from "./pages/Attendance";
import CashRecon from "./pages/CashRecon";
import Trips from "./pages/Trips";
import Finance from "./pages/Finance";
import Expenses from "./pages/Expenses/Expenses";
import ExpenseForm from "./pages/Expenses/ExpenseForm";
import ExpenseDetail from "./pages/Expenses/ExpenseDetail";
import ExpenseCategories from "./pages/Expenses/ExpenseCategories";
import ExpenseVendors from "./pages/Expenses/ExpenseVendors";
import StockRequests from "./pages/StockRequests";
import RiderPerformance from "./pages/RiderPerformance";
import AIControlRoom from "./pages/AIControlRoom";
import Suppliers from "./pages/Suppliers";
import ProcurementQueue from "./pages/ProcurementQueue";
import PurchaseOrderDetail from "./pages/PurchaseOrderDetail";
import GoodsReceipt from "./pages/GoodsReceipt";
import InventoryMovements from "./pages/InventoryMovements";
import PackingStation from "./pages/PackingStation";
import SupplierLedger from "./pages/SupplierLedger";
import UnitEconomics from "./pages/UnitEconomics";
import GSTReports from "./pages/GSTReports";
import FinancialStatements from "./pages/FinancialStatements";
import SupportTickets from "./pages/SupportTickets";
import Complaints from "./pages/Complaints";
import CustomerFeedback from "./pages/CustomerFeedback";
import { useAuth } from "./hooks/useAuth";
import { auth } from "./firebase/config"; // Direct import
import { signOut } from "firebase/auth";

import LoadingSpinner from "./components/common/LoadingSpinner";
import { Toaster } from "react-hot-toast";

function App() {
  const { user, loading, isAdmin, role } = useAuth();

  const RequireRole = ({ allowedRoles, children }) => {
    if (!role || !allowedRoles.includes(role)) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
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

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Orders /></RequireRole>} />
          <Route path="/packing-station" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><PackingStation /></RequireRole>} />
          <Route path="/support-tickets" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><SupportTickets /></RequireRole>} />
          <Route path="/complaints" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Complaints /></RequireRole>} />
          <Route path="/customer-feedback" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><CustomerFeedback /></RequireRole>} />
          <Route path="/suppliers" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "CatalogManager", "Viewer"]}><Suppliers /></RequireRole>} />
          <Route path="/procurement" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><ProcurementQueue /></RequireRole>} />
          <Route path="/purchase-order/:id" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><PurchaseOrderDetail /></RequireRole>} />
          <Route path="/grn" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><GoodsReceipt /></RequireRole>} />
          <Route path="/inventory-movements" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><InventoryMovements /></RequireRole>} />
          <Route path="/products" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><Products /></RequireRole>} />
          <Route path="/product/new" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager"]}><ProductDetail /></RequireRole>} />
          <Route path="/product/:id" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><ProductDetail /></RequireRole>} />
          <Route path="/categories" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><Categories /></RequireRole>} />
          <Route path="/brands" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><Brands /></RequireRole>} />
          <Route path="/crops" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><Crops /></RequireRole>} />
          <Route path="/stock-requests" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager", "Viewer"]}><StockRequests /></RequireRole>} />
          <Route path="/customers" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Customers /></RequireRole>} />
          <Route path="/returns" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Returns /></RequireRole>} />
          <Route path="/banners" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager"]}><Banners /></RequireRole>} />
          <Route path="/notifications" element={<RequireRole allowedRoles={["SuperAdmin", "CatalogManager"]}><Notifications /></RequireRole>} />
          <Route path="/payments" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Payments /></RequireRole>} />
          <Route path="/payouts" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><RiderPayouts /></RequireRole>} />
          <Route path="/reports" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><Reports /></RequireRole>} />
          <Route path="/settings" element={<RequireRole allowedRoles={["SuperAdmin"]}><Settings /></RequireRole>} />
          <Route path="/staff" element={<RequireRole allowedRoles={["SuperAdmin"]}><Staff /></RequireRole>} />
          <Route path="/riders" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><Riders /></RequireRole>} />
          <Route path="/settlement" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><Settlement /></RequireRole>} />
          <Route path="/tracking" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Tracking /></RequireRole>} />
          <Route path="/audit-logs" element={<RequireRole allowedRoles={["SuperAdmin"]}><AuditLogs /></RequireRole>} />
          <Route path="/ai-control" element={<RequireRole allowedRoles={["SuperAdmin"]}><AIControlRoom /></RequireRole>} />
          <Route path="/unit-economics" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><UnitEconomics /></RequireRole>} />
          <Route path="/supplier-ledger" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><SupplierLedger /></RequireRole>} />
          <Route path="/gst-reports" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><GSTReports /></RequireRole>} />
          <Route path="/financial-statements" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><FinancialStatements /></RequireRole>} />
          <Route path="/finance" element={<RequireRole allowedRoles={["SuperAdmin"]}><Finance /></RequireRole>} />
          <Route path="/expenses" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Expenses /></RequireRole>} />
          <Route path="/expenses/new" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><ExpenseForm /></RequireRole>} />
          <Route path="/expenses/edit/:id" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><ExpenseForm /></RequireRole>} />
          <Route path="/expenses/:id" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><ExpenseDetail /></RequireRole>} />
          <Route path="/expenses/categories" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><ExpenseCategories /></RequireRole>} />
          <Route path="/expenses/vendors" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><ExpenseVendors /></RequireRole>} />
          <Route path="/rider-performance" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><RiderPerformance /></RequireRole>} />
          <Route path="/sos" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><SOSAlerts /></RequireRole>} />
          <Route path="/attendance" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Attendance /></RequireRole>} />
          <Route path="/reconciliation" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager"]}><CashRecon /></RequireRole>} />
          <Route path="/trips" element={<RequireRole allowedRoles={["SuperAdmin", "OrderManager", "Viewer"]}><Trips /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;

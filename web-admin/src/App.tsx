import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Truck, Wallet, Map, Settings, Menu, X,
  Package, Tags, AlertTriangle, Calendar, Route as RouteIcon, LogOut
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import OrdersDashboard from './pages/OrdersDashboard';
import SettlementDesk from './pages/SettlementDesk';
import LiveTracking from './pages/LiveTracking';
import SettingsPage from './pages/SettingsPage';
import ProductsPage from './pages/ProductsPage';
import CategoriesCropsPage from './pages/CategoriesCropsPage';
import EmergencyAlerts from './pages/EmergencyAlerts';
import CashReconciliation from './pages/CashReconciliation';
import TripMonitoring from './pages/TripMonitoring';
import AttendanceOverview from './pages/AttendanceOverview';
import LoginPage from './pages/LoginPage';

import './index.css';

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSOSCount, setActiveSOSCount] = useState(0);
  const { user, logout } = useAuth();

  const closeSidebar = () => setSidebarOpen(false);

  // Listen for ACTIVE SOS alerts globally
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'emergency_alerts'), where('status', '==', 'ACTIVE'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveSOSCount(snapshot.size);
    }, (error) => {
      console.error("Firestore listen error:", error);
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-container">
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Truck color="var(--primary-color)" size={28} />
            <h1 style={{ marginBottom: 0 }}>KrishiVishal</h1>
          </div>
          <button className="hamburger-btn" onClick={closeSidebar} style={{ display: 'none' }} aria-label="Close sidebar">
            <X size={24} />
          </button>
        </div>

        <nav>
          <div className="nav-section-label">Core Operations</div>
          <NavLink to="/orders" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <LayoutDashboard size={20} />
            <span>Orders Lifecycle</span>
          </NavLink>
          <NavLink to="/products" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <Package size={20} />
            <span>Manage Products</span>
          </NavLink>

          <div className="nav-section-label">Field Management</div>
          <NavLink to="/sos" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <div className="relative">
              <AlertTriangle size={20} className={activeSOSCount > 0 ? "text-red-500 animate-pulse" : ""} />
              {activeSOSCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-slate-900">
                  {activeSOSCount}
                </span>
              )}
            </div>
            <span className={activeSOSCount > 0 ? "text-red-400 font-bold" : ""}>Emergency SOS</span>
          </NavLink>
          <NavLink to="/trips" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <RouteIcon size={20} />
            <span>Trip Monitoring</span>
          </NavLink>
          <NavLink to="/tracking" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <Map size={20} />
            <span>Live Tracking</span>
          </NavLink>

          <div className="nav-section-label">Finance & HR</div>
          <NavLink to="/reconciliation" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <Wallet size={20} />
            <span>Cash Recon</span>
          </NavLink>
          <NavLink to="/attendance" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <Calendar size={20} />
            <span>Attendance/HR</span>
          </NavLink>

          <div className="nav-section-label">System</div>
          <NavLink to="/settings" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} onClick={closeSidebar}>
            <Settings size={20} />
            <span>Settings</span>
          </NavLink>

          <div className="mt-8 pt-4 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="nav-link text-slate-400 hover:text-red-400 w-full text-left"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            User: {user.email?.split('@')[0]}
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-wrapper">
        {/* Top Bar Alert Banner */}
        {activeSOSCount > 0 && (
          <NavLink to="/sos" className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 flex items-center justify-center gap-2 transition-colors cursor-pointer no-underline">
            <AlertTriangle size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">
              {activeSOSCount} Active Emergency SOS Alert{activeSOSCount > 1 ? 's' : ''}! Respond Immediately.
            </span>
          </NavLink>
        )}

        {/* Mobile Top Header */}
        <div className="top-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu size={24} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck color="var(--primary-color)" size={22} />
            <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>KrishiVishal</span>
          </div>
          <div style={{ width: '40px' }} />
        </div>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/orders" element={<ProtectedRoute><OrdersDashboard /></ProtectedRoute>} />
            <Route path="/sos" element={<ProtectedRoute><EmergencyAlerts /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><CashReconciliation /></ProtectedRoute>} />
            <Route path="/trips" element={<ProtectedRoute><TripMonitoring /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute><AttendanceOverview /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
            <Route path="/categories" element={<ProtectedRoute><CategoriesCropsPage /></ProtectedRoute>} />
            <Route path="/settlement" element={<ProtectedRoute><SettlementDesk /></ProtectedRoute>} />
            <Route path="/tracking" element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

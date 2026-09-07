import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, Calendar, ChevronDown, Menu, ShoppingCart, AlertCircle, CheckCircle, User, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const Topbar = ({ toggleSidebar, isSidebarOpen }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/';

  // Format today's date like "09 May 2026"
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <header className="h-[88px] bg-[#fdfdfd] border-b border-gray-100 flex items-center justify-between px-8 z-10 sticky top-0 flex-shrink-0">
      {/* Greeting or Breadcrumbs */}
      <div className="flex items-center gap-4">
        {!isSidebarOpen && (
          <button 
            onClick={toggleSidebar} 
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-600"
          >
            <Menu size={18} />
          </button>
        )}
        <div>
          {isDashboard ? (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <h1 className="text-[22px] font-black text-gray-900 tracking-tight flex items-center gap-2">
                Good Morning, Admin! <span className="text-2xl animate-wave origin-bottom-right">👋</span>
              </h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Here's what's happening with your business today.
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <h1 className="text-[22px] font-black text-gray-900 tracking-tight capitalize">
                {location.pathname.replace('/', '').replace(/-/g, ' ') || 'Page'}
              </h1>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        
        {/* Date */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-600">
          <Calendar size={15} />
          <span className="text-xs font-bold">{formattedDate}</span>
        </div>

        {/* Warehouse Selector */}
        <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider leading-none">Warehouse</span>
            <span className="text-xs font-bold text-gray-800">All Warehouses</span>
          </div>
          <ChevronDown size={14} className="text-gray-400" />
        </div>

        {/* Search */}
        <div className="hidden md:flex items-center px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500/20 transition-all w-64">
          <Search size={15} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search orders, SKUs, invoices..."
            className="bg-transparent border-none outline-none focus:ring-0 text-[11px] font-medium ml-2 w-full text-gray-700 placeholder-gray-400"
          />
        </div>

        {/* Notification */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm ml-2"
          >
            <Bell size={18} className="text-gray-600" />
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">
              3
            </span>
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
              <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-sm">Notifications</h3>
                <span className="text-xs text-green-600 font-semibold cursor-pointer hover:underline">Mark all read</span>
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                <div className="p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer flex gap-3 items-start">
                  <div className="p-2 rounded-full bg-blue-50 text-blue-600"><ShoppingCart size={14}/></div>
                  <div>
                    <p className="text-xs text-gray-800 font-semibold">New Order Received</p>
                    <p className="text-[10px] text-gray-500">Order #1042 needs packing</p>
                    <span className="text-[9px] text-gray-400 mt-1 block">2 mins ago</span>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer flex gap-3 items-start">
                  <div className="p-2 rounded-full bg-red-50 text-red-600"><AlertCircle size={14}/></div>
                  <div>
                    <p className="text-xs text-gray-800 font-semibold">Low Stock Alert</p>
                    <p className="text-[10px] text-gray-500">Tomato Hybrid 500g is running low</p>
                    <span className="text-[9px] text-gray-400 mt-1 block">1 hour ago</span>
                  </div>
                </div>
                <div className="p-3 hover:bg-gray-50 cursor-pointer flex gap-3 items-start">
                  <div className="p-2 rounded-full bg-green-50 text-green-600"><CheckCircle size={14}/></div>
                  <div>
                    <p className="text-xs text-gray-800 font-semibold">System Update</p>
                    <p className="text-[10px] text-gray-500">App deployed successfully</p>
                    <span className="text-[9px] text-gray-400 mt-1 block">3 hours ago</span>
                  </div>
                </div>
              </div>
              <div className="p-2 border-t border-gray-100 text-center bg-gray-50">
                <span className="text-xs text-green-700 font-bold cursor-pointer hover:underline">View all notifications</span>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-200 mx-2 hidden sm:block"></div>

        {/* Profile */}
        <div className="relative">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[13px] font-black text-gray-900 group-hover:text-green-700 transition-colors">Admin</span>
              <span className="text-[10px] text-gray-500 font-bold">{role || "Super Admin"}</span>
            </div>
            <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-100 shadow-sm">
              {/* Dummy Avatar */}
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin&backgroundColor=e5e7eb" alt="Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
          
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
              <div className="p-3 border-b border-gray-50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100">
                  <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin&backgroundColor=e5e7eb" alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">Admin</p>
                  <p className="text-[9px] text-gray-500">{role || "Super Admin"}</p>
                </div>
              </div>
              <div className="p-1">
                <button 
                  onClick={() => { setShowProfileMenu(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                >
                  <User size={14} />
                  My Profile
                </button>
                <button 
                  onClick={() => { setShowProfileMenu(false); if (logout) logout(); else navigate('/login'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-1"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

export default Topbar;

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, Calendar, ChevronDown, Menu, ShoppingCart, AlertCircle, CheckCircle, User, LogOut, FileText, Package, Building2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWarehouse } from '../../context/WarehouseContext';
import { db } from '../../firebase/config';
import { collection, query, where, orderBy, limit, onSnapshot, doc, writeBatch, updateDoc } from 'firebase/firestore';

const Topbar = ({ toggleSidebar, isSidebarOpen }) => {
  const { warehouses, selectedWarehouseId, selectWarehouse, isGlobalView } = useWarehouse();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWarehouseMenu, setShowWarehouseMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/';

  // Fetch Unread Notifications
  React.useEffect(() => {
    if (!user) return;
    
    // In a real multi-tenant app, we'd filter by ownerId, but for Admin we can show all global alerts
    const q = query(
      collection(db, 'notifications'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = [];
      snapshot.forEach((doc) => notifs.push({ id: doc.id, ...doc.data() }));
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error("Error marking read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking all read:", error);
    }
  };

  // Format today's date like "09 May 2026"
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const getFirstName = () => {
    if (!user || !user.displayName) return 'Admin';
    return user.displayName.split(' ')[0];
  };

  const firstName = getFirstName();
  const userPhoto = user?.photoURL || `https://api.dicebear.com/7.x/notionists/svg?seed=${firstName}&backgroundColor=e5e7eb`;

  return (
    <header className="h-[76px] sm:h-[84px] bg-[#fdfdfd] border-b border-gray-100 flex items-center justify-between px-4 sm:px-8 z-40 sticky top-0 flex-shrink-0">
      {/* Greeting or Breadcrumbs */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {!isSidebarOpen && (
          <button 
            onClick={toggleSidebar} 
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-600 shrink-0"
          >
            <Menu size={18} />
          </button>
        )}
        <div className="min-w-0">
          {isDashboard ? (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500 min-w-0">
              <h1 className="text-base sm:text-lg lg:text-[20px] font-black text-gray-900 tracking-tight flex items-center gap-2 capitalize truncate">
                <span>Good Morning, {firstName}!</span> <span className="text-lg sm:text-xl animate-wave origin-bottom-right shrink-0">👋</span>
              </h1>
              <p className="text-[11px] text-gray-500 font-medium truncate hidden sm:block">
                Here's what's happening with your business today.
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300 min-w-0">
              <h1 className="text-base sm:text-lg lg:text-[20px] font-black text-gray-900 tracking-tight capitalize truncate">
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




        {/* Multi-Warehouse / Hub Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowWarehouseMenu(!showWarehouseMenu)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-xl shadow-sm text-emerald-900 transition-all font-bold text-xs cursor-pointer"
            title="Switch Operational Warehouse Hub"
          >
            <Building2 size={15} className="text-emerald-700" />
            <span className="max-w-[130px] truncate">
              {isGlobalView
                ? "All Hubs (Global)"
                : warehouses.find((w) => w.id === selectedWarehouseId || w.code === selectedWarehouseId)?.name || selectedWarehouseId}
            </span>
            <ChevronDown size={14} className={`text-emerald-600 transition-transform ${showWarehouseMenu ? "rotate-180" : ""}`} />
          </button>

          {showWarehouseMenu && (
            <>
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setShowWarehouseMenu(false)} 
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">Operational Hub</h4>
                  <p className="text-[10px] text-gray-500">Filter data by active depot</p>
                </div>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                  {warehouses.length} Hubs
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                <button
                  onClick={() => {
                    selectWarehouse("ALL");
                    setShowWarehouseMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                    isGlobalView ? "bg-emerald-700 text-white" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className={isGlobalView ? "text-white" : "text-gray-400"} />
                    <span>All Warehouses (Global)</span>
                  </div>
                  {isGlobalView && <CheckCircle size={14} className="text-emerald-200" />}
                </button>

                {warehouses.map((wh) => {
                  const isSelected = selectedWarehouseId === wh.id || selectedWarehouseId === wh.code;
                  return (
                    <button
                      key={wh.id}
                      onClick={() => {
                        selectWarehouse(wh.id);
                        setShowWarehouseMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        isSelected ? "bg-emerald-700 text-white" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${wh.isActive !== false ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="truncate">{wh.name}</span>
                        <span className="text-[10px] font-mono opacity-70 shrink-0">({wh.code || wh.id})</span>
                      </div>
                      {isSelected && <CheckCircle size={14} className="text-emerald-200 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
            </>
          )}
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
            {notifications.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">
                {notifications.length}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <>
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setShowNotifications(false)} 
              />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
              <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-sm">Notifications</h3>
                {notifications.length > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-green-600 font-semibold cursor-pointer hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-xs font-medium">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((n) => {
                    let Icon = Bell;
                    let iconColor = 'bg-blue-50 text-blue-600';
                    
                    if (n.type === 'DOCUMENT_EXPIRED' || n.severity === 'HIGH') {
                      Icon = AlertCircle;
                      iconColor = 'bg-red-50 text-red-600';
                    } else if (n.type === 'DOCUMENT_EXPIRING_SOON') {
                      Icon = FileText;
                      iconColor = 'bg-orange-50 text-orange-600';
                    } else if (n.type?.includes('ORDER')) {
                      Icon = ShoppingCart;
                      iconColor = 'bg-blue-50 text-blue-600';
                    } else if (n.type?.includes('UPDATE') || n.type?.includes('SUCCESS')) {
                      Icon = CheckCircle;
                      iconColor = 'bg-green-50 text-green-600';
                    }

                    return (
                      <div 
                        key={n.id} 
                        onClick={() => markAsRead(n.id)}
                        className="p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer flex gap-3 items-start transition-colors"
                      >
                        <div className={`p-2 rounded-full ${iconColor}`}>
                          <Icon size={14}/>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-800 font-semibold">{n.title}</p>
                          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{n.message}</p>
                          <span className="text-[9px] text-gray-400 mt-1 block">
                            {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div 
                className="p-2 border-t border-gray-100 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => {
                  setShowNotifications(false);
                  navigate('/notifications');
                }}
              >
                <span className="text-xs text-green-700 font-bold hover:underline">View all notifications</span>
              </div>
            </div>
            </>
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
              <span className="text-[13px] font-black text-gray-900 group-hover:text-green-700 transition-colors capitalize">{firstName}</span>
              <span className="text-[10px] text-gray-500 font-bold">{role || "Super Admin"}</span>
            </div>
            <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-100 shadow-sm bg-emerald-100 flex items-center justify-center">
              <img 
                src={userPhoto} 
                alt={firstName} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                }}
              />
            </div>
          </div>
          
          {showProfileMenu && (
            <>
              {/* Invisible backdrop for outside click */}
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setShowProfileMenu(false)} 
              />
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/70">
                  <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-200 bg-emerald-100 flex-shrink-0">
                    <img 
                      src={userPhoto} 
                      alt={firstName} 
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-gray-900 truncate capitalize">{user?.displayName || firstName}</p>
                    <p className="text-[10px] text-emerald-800 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded-md inline-block mt-0.5">{role || "SuperAdmin"}</p>
                  </div>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <button 
                    onClick={() => { setShowProfileMenu(false); navigate('/profile'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-gray-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <User size={14} className="text-gray-400" />
                    My Profile
                  </button>
                  <button 
                    onClick={async () => { 
                      setShowProfileMenu(false); 
                      if (logout) {
                        await logout();
                      }
                      navigate('/login'); 
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </header>
  );
};

export default Topbar;

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const Topbar = () => {
  const location = useLocation();
  const { user } = useAuth();

  const getPageTitle = () => {
    const path = location.pathname.split('/')[1] || 'Dashboard';
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  return (
    <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10">
      <div className="flex items-center space-x-4">
        <h2 className="text-xl font-semibold text-gray-800">{getPageTitle()}</h2>
        <div className="hidden md:flex items-center bg-gray-100 px-3 py-1.5 rounded-lg">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Global search..."
            className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-64"
          />
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <button className="relative text-gray-500 hover:text-primary transition-colors">
          <Bell size={22} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white font-bold">
            3
          </span>
        </button>

        <div className="flex items-center space-x-3 border-l pl-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-900">{user?.email?.split('@')[0] || 'Admin'}</p>
            <p className="text-[11px] text-gray-500">Super Admin</p>
          </div>
          <div className="h-10 w-10 bg-primary-dark rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {user?.email?.charAt(0).toUpperCase() || <User size={20} />}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;

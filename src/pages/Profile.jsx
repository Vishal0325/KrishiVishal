import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Save, User, Mail, Lock, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, role } = useAuth();
  
  const [formData, setFormData] = useState({
    name: 'Admin',
    email: 'admin@krishivishal.com',
    userId: 'RBA-001',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    // Handle profile update logic here
    toast.success("Profile updated successfully!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">My Profile</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Manage your account details and settings.</p>
        </div>
        <button 
          onClick={handleSubmit}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-700 text-white rounded-xl text-sm font-bold shadow-md hover:bg-green-800 transition-colors"
        >
          <Save size={16} />
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Basic Info */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col items-center text-center relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg mb-4 relative group cursor-pointer">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin&backgroundColor=e5e7eb" alt="Profile" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={20} className="text-white" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900">{formData.name}</h2>
            <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full mt-2">
              {role || "Super Admin"}
            </span>
          </div>
        </div>

        {/* Right Column: Form Fields */}
        <div className="md:col-span-2">
          <form className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" onSubmit={handleSubmit}>
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                <User size={16} className="text-gray-400" />
                Personal Information
              </h3>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">User ID (RBA ID)</label>
                  <input 
                    type="text" 
                    name="userId"
                    value={formData.userId}
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 cursor-not-allowed focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">User ID cannot be changed.</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input 
                    type="text" 
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Mail size={12} /> Email Address
                </label>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                />
              </div>

              <hr className="border-gray-100 my-6" />

              <div>
                <h3 className="text-sm font-black text-gray-800 flex items-center gap-2 mb-5">
                  <Lock size={16} className="text-gray-400" />
                  Security
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">New Password</label>
                    <input 
                      type="password" 
                      name="password"
                      placeholder="Leave blank to keep current"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Confirm Password</label>
                    <input 
                      type="password" 
                      name="confirmPassword"
                      placeholder="Confirm new password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User, Briefcase, FileText, Bike, ShieldCheck, BookOpen,
  MonitorSmartphone, Clock, ShieldAlert, LogOut, History, ArrowLeft, Upload
} from "lucide-react";
import toast from "react-hot-toast";
import { getRiderHRProfileById } from "../../services/workforceService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import StatusBadge from "../../components/common/StatusBadge";

const TABS = [
  { id: "Overview", icon: User },
  { id: "Personal", icon: User },
  { id: "Employment", icon: Briefcase },
  { id: "Documents", icon: FileText },
  { id: "Driving", icon: Bike },
  { id: "Vehicle", icon: Bike },
  { id: "Verification", icon: ShieldCheck },
  { id: "Training", icon: BookOpen },
  { id: "Assets", icon: MonitorSmartphone },
  { id: "Compliance", icon: ShieldAlert },
  { id: "Exit", icon: LogOut },
  { id: "Audit", icon: History }
];

const RiderProfile = () => {
  const { riderId } = useParams();
  const navigate = useNavigate();
  const [rider, setRider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Documents");

  useEffect(() => {
    fetchRider();
  }, [riderId]);

  const fetchRider = async () => {
    try {
      const data = await getRiderHRProfileById(riderId);
      if (data) {
        setRider(data);
      } else {
        toast.error("Rider HR Profile not found");
        navigate("/hr/riders");
      }
    } catch (err) {
      toast.error("Error loading profile");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!rider) return null;

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center font-black text-2xl">
            {rider.firstName?.charAt(0) || 'R'}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">{rider.displayName || 'Rider'}</h1>
              <StatusBadge status={rider.status} type={rider.status === 'Active' ? 'success' : 'default'} />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {rider.hrRiderId} • Operational ID: {rider.riderId}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-gray-50 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-100 border border-gray-200">
            Edit HR Profile
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto custom-scrollbar bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                isActive 
                  ? "bg-[#1b5e20] text-white shadow-md" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={16} />
              {tab.id}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
        {activeTab === "Documents" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Rider Document Vault</h2>
                <p className="text-sm text-gray-500">Manage driving and compliance documents.</p>
              </div>
              <button className="bg-[#1b5e20] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#2e7d32]">
                <Upload size={16} /> Upload Document
              </button>
            </div>
            
            <div className="flex gap-2 border-b border-gray-100 overflow-x-auto pb-2">
              {['Identity', 'Address', 'Driving', 'Vehicle', 'Verification', 'Training', 'Contracts', 'Other'].map(cat => (
                <button key={cat} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 whitespace-nowrap">
                  {cat}
                </button>
              ))}
            </div>
            <div className="py-10 text-center flex flex-col items-center">
               <FileText size={40} className="text-gray-300 mb-3" />
               <p className="text-gray-500 font-bold">No documents uploaded in this category yet.</p>
            </div>
          </div>
        )}
        
        {activeTab !== "Documents" && (
          <div className="flex items-center justify-center h-40 text-gray-400 font-bold border-2 border-dashed border-gray-100 rounded-xl">
            {activeTab} module placeholder.
          </div>
        )}
      </div>
    </div>
  );
};

export default RiderProfile;

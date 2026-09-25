import React, { useState, useEffect, useMemo } from "react";
import {
  Bike,
  Search,
  Loader2,
  UserX,
  ShieldCheck,
  Zap,
  Wifi,
  WifiOff,
  UserCheck,
  Clock,
  CheckCircle2,
  Trash2,
  PhoneCall,
  Building2,
  Filter,
  X,
  ExternalLink,
  FileText,
  CreditCard,
  AlertTriangle
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import { revokeRiderAccess, whitelistRiderPhone, deleteWhitelistedRider } from "../services/riderManagement";
import { useAuth } from "../hooks/useAuth";

const Riders = () => {
  const { user: currentUser } = useAuth();
  const [ridersList, setRidersList] = useState([]);
  const [whitelistedList, setWhitelistedList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedHub, setSelectedHub] = useState("ALL");
  const [selectedKycRider, setSelectedKycRider] = useState(null);
  const [kycProcessing, setKycProcessing] = useState(false);
  const [kycRejectionNote, setKycRejectionNote] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    onDuty: 0,
    whitelistedPending: 0,
    whitelistedRegistered: 0
  });
  const [loading, setLoading] = useState(true);
  const [whitelistLoading, setWhitelistLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [whitelistSearchTerm, setWhitelistSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const [whitelistPhone, setWhitelistPhone] = useState("");
  const [whitelistName, setWhitelistName] = useState("");
  const [whitelistHub, setWhitelistHub] = useState("");
  const [whitelistRole, setWhitelistRole] = useState("rider");
  const [whitelisting, setWhitelisting] = useState(false);

  useEffect(() => {
    // 0. Listener for Warehouses / Hubs
    const unsubWh = onSnapshot(collection(db, "warehouses"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWarehouses(list);
      if (list.length > 0 && !whitelistHub) {
        setWhitelistHub(list[0].id);
      }
    });

    // 1. Real-time listener for Riders Operational Data
    const qRiders = collection(db, "riders");
    const unsubscribeRiders = onSnapshot(qRiders, (snapshot) => {
      // Only show riders who are not revoked/inactive
      const riders = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(r => r.status !== "INACTIVE");
        
      setRidersList(riders);

      const online = riders.filter(r => r.online).length;
      setStats(prev => ({
        ...prev,
        total: riders.length,
        online: online,
        offline: riders.length - online,
        onDuty: riders.filter(r => r.currentOrderId).length
      }));
      setLoading(false);
    });

    // 2. Real-time listener for Whitelisted Riders Data
    const qWhitelist = collection(db, "whitelisted_riders");
    const unsubscribeWhitelist = onSnapshot(qWhitelist, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWhitelistedList(list);

      const pending = list.filter(w => w.status !== "REGISTERED").length;
      const registered = list.filter(w => w.status === "REGISTERED").length;
      setStats(prev => ({
        ...prev,
        whitelistedPending: pending,
        whitelistedRegistered: registered
      }));
      setWhitelistLoading(false);
    });

    return () => {
      unsubWh();
      unsubscribeRiders();
      unsubscribeWhitelist();
    };
  }, []);

  const getWarehouseInfo = (whId) => {
    if (!whId) return { name: 'General Fleet', code: 'GENERAL' };
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? { name: wh.name, code: wh.code || wh.id } : { name: whId, code: whId };
  };

  const handleWhitelist = async (e) => {
    e.preventDefault();
    const formattedPhone = whitelistPhone.startsWith("+91") ? whitelistPhone : `+91${whitelistPhone.replace(/\D/g, "")}`;
    if (formattedPhone.length !== 13) {
      return toast.error("Phone must be 10 digits (e.g. +919876543210)");
    }
    setWhitelisting(true);
    try {
      await whitelistRiderPhone(
        formattedPhone,
        whitelistName,
        whitelistRole === "service_man" ? null : whitelistHub,
        whitelistRole
      );
      toast.success(
        whitelistRole === "service_man"
          ? "Service Man whitelisted successfully!"
          : "Rider whitelisted and assigned to Hub!"
      );
      setWhitelistPhone("");
      setWhitelistName("");
      setWhitelistRole("rider");
    } catch (error) {
      console.error("Whitelisting failed error:", error);
      toast.error("Whitelisting failed: " + error.message);
    } finally {
      setWhitelisting(false);
    }
  };

  const handleDeleteWhitelist = async (item) => {
    if (!window.confirm(`Are you sure you want to remove ${item.name || item.phone} from whitelist?`)) {
      return;
    }
    try {
      await deleteWhitelistedRider(item.id || item.phone);
      toast.success("Whitelist entry removed successfully");
    } catch (err) {
      console.error("Delete whitelist failed error:", err);
      toast.error("Failed to remove whitelist entry: " + err.message);
    }
  };

  const handleRevokeRider = async (rider) => {
    if (rider.id === currentUser?.uid) {
      toast.error("You cannot revoke your own access!");
      return;
    }
    if (!window.confirm(`Are you sure you want to revoke rider access for ${rider.name || 'this user'}?`)) {
      return;
    }
    try {
      await revokeRiderAccess(rider.id);
      toast.success("Rider access revoked successfully");
    } catch (err) {
      console.error("Revoke access failed error:", err);
      toast.error("Failed to revoke access: " + err.message);
    }
  };

  const handleApproveKyc = async (riderId) => {
    setKycProcessing(true);
    try {
      const riderRef = doc(db, "riders", riderId);
      await updateDoc(riderRef, {
        kycStatus: "VERIFIED",
        kycVerifiedAt: Timestamp.now(),
        kycVerifiedBy: currentUser?.email || "Admin",
        kycRejectionReason: null
      });
      toast.success("Rider KYC verified & approved successfully!");
      setSelectedKycRider(prev => prev ? { ...prev, kycStatus: "VERIFIED" } : null);
    } catch (err) {
      console.error("KYC approval failed:", err);
      toast.error("Failed to approve KYC: " + err.message);
    } finally {
      setKycProcessing(false);
    }
  };

  const handleRejectKyc = async (riderId) => {
    if (!kycRejectionNote.trim()) {
      return toast.error("Please provide a reason for rejecting the KYC");
    }
    setKycProcessing(true);
    try {
      const riderRef = doc(db, "riders", riderId);
      await updateDoc(riderRef, {
        kycStatus: "REJECTED",
        kycRejectedAt: Timestamp.now(),
        kycRejectedBy: currentUser?.email || "Admin",
        kycRejectionReason: kycRejectionNote.trim()
      });
      toast.success("Rider KYC marked as rejected. Reason logged.");
      setSelectedKycRider(prev => prev ? { ...prev, kycStatus: "REJECTED", kycRejectionReason: kycRejectionNote } : null);
      setKycRejectionNote("");
    } catch (err) {
      console.error("KYC rejection failed:", err);
      toast.error("Failed to reject KYC: " + err.message);
    } finally {
      setKycProcessing(false);
    }
  };



  const filteredRiders = ridersList.filter((s) => {
    const matchesHub = selectedHub === "ALL" || s.warehouseId === selectedHub || s.assignedWarehouse === selectedHub;
    const matchesSearch =
      (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.phone || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.riderIdDisplay || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesHub && matchesSearch;
  });

  const filteredWhitelist = whitelistedList.filter((w) => {
    const matchesHub = selectedHub === "ALL" || w.warehouseId === selectedHub;
    const matchesSearch =
      (w.name || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase()) ||
      (w.phone || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase()) ||
      (w.riderIdDisplay || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase());
    return matchesHub && matchesSearch;
  });

  const liveFleetColumns = [
    {
      header: "Status",
      render: (s) => (
        <div className="flex items-center">
          {s.online ? (
            <div className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border border-green-100 animate-pulse">
              <Wifi size={10} className="mr-1" /> Online
            </div>
          ) : (
            <div className="flex items-center text-gray-400 bg-gray-50 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border border-gray-100">
              <WifiOff size={10} className="mr-1" /> Offline
            </div>
          )}
        </div>
      )
    },
    {
      header: "Rider ID",
      render: (s) => (
        <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded tracking-tighter text-gray-600">
          {s.riderIdDisplay || 'KV-PENDING'}
        </span>
      )
    },
    {
      header: "Name",
      render: (s) => (
        <div>
          <div className="font-bold text-gray-900">{s.name || "N/A"}</div>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{s.phone || "No Phone"}</div>
        </div>
      )
    },
    {
      header: "Role",
      render: (s) => {
        const role = (s.partnerRole || s.role || "rider").toLowerCase();
        if (role === "service_man") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
              🛠️ Service
            </span>
          );
        }
        if (role === "both") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              🔄 Both
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            🚚 Rider
          </span>
        );
      }
    },
    {
      header: "Assigned Hub",
      render: (s) => {
        const role = (s.partnerRole || s.role || "").toLowerCase();
        if (role === "service_man") {
          return (
            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-100">
              N/A (Field Partner)
            </span>
          );
        }
        const wh = getWarehouseInfo(s.warehouseId || s.assignedWarehouse);
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Building2 size={11} className="mr-1 text-blue-500" />
            {wh.name}
          </span>
        );
      }
    },

    {
      header: "Multi-Skills",
      render: (s) => (
        <div className="flex flex-wrap gap-1 max-w-[160px]">
          {s.serviceSkills && s.serviceSkills.length > 0 ? (
            s.serviceSkills.map((sk, idx) => (
              <span key={idx} className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-purple-100">
                {sk.replace('_', ' ')}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-gray-400 font-medium">Delivery Only</span>
          )}
        </div>
      )
    },
    {
      header: "Live Activity",
      render: (s) => (
        <div className="text-xs font-bold">
          {s.currentOrderId ? (
            <span className="text-orange-600 flex items-center">
              <Zap size={12} className="mr-1" /> Delivering...
            </span>
          ) : (
            <span className="text-gray-400">Idle</span>
          )}
        </div>
      )
    },

    {
      header: "KYC Status",
      render: (s) => {
        const kyc = s.kycStatus || (s.documents && Object.keys(s.documents).length > 0 ? "PENDING_VERIFICATION" : "NOT_SUBMITTED");
        return (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
            kyc === 'VERIFIED' ? 'bg-green-50 text-green-700 border-green-200' :
            kyc === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
            kyc === 'PENDING_VERIFICATION' ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse' :
            'bg-gray-50 text-gray-500 border-gray-200'
          }`}>
            {kyc === 'VERIFIED' ? '✓ Verified' : kyc === 'REJECTED' ? '✕ Rejected' : kyc === 'PENDING_VERIFICATION' ? '⏳ Review Docs' : 'Missing'}
          </span>
        );
      }
    },
    {
      header: "Actions",
      render: (s) => (
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedKycRider(s)}
            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-all shadow-sm flex items-center text-xs font-bold"
            title="Inspect KYC Documents"
          >
            <ShieldCheck size={13} className="mr-1" />
            KYC Docs
          </button>
          <button
            onClick={() => handleRevokeRider(s)}
            disabled={s.id === currentUser?.uid}
            className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all shadow-sm flex items-center text-xs font-bold"
            title="Revoke Rider Access"
          >
            <UserX size={13} className="mr-1" />
            Revoke
          </button>
        </div>
      )
    }
  ];

  const whitelistColumns = [
    {
      header: "Login Status",
      render: (w) => (
        <div className="flex items-center">
          {w.status === "REGISTERED" ? (
            <div className="flex items-center text-green-700 bg-green-50 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border border-green-200">
              <CheckCircle2 size={12} className="mr-1 text-green-600" /> Logged In
            </div>
          ) : (
            <div className="flex items-center text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border border-amber-200">
              <Clock size={12} className="mr-1 text-amber-600 animate-spin" /> Login Pending
            </div>
          )}
        </div>
      )
    },
    {
      header: "Rider ID",
      render: (w) => (
        <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded tracking-tighter text-gray-700">
          {w.riderIdDisplay || (w.status === "REGISTERED" ? "Assigned" : "Pending Login")}
        </span>
      )
    },
    {
      header: "Rider Details",
      render: (w) => (
        <div>
          <div className="font-bold text-gray-900">{w.name || "Unnamed"}</div>
          <div className="text-xs text-gray-500 font-mono flex items-center mt-0.5">
            <PhoneCall size={10} className="mr-1 text-gray-400" /> {w.phone || w.id}
          </div>
        </div>
      )
    },
    {
      header: "भूमिका (Role)",
      render: (w) => {
        const role = (w.role || "rider").toLowerCase();
        if (role === "service_man") {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
              🛠️ Service Man
            </span>
          );
        }
        if (role === "both") {
          return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              🔄 Rider & Service
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            🚚 Delivery Rider
          </span>
        );
      }
    },
    {
      header: "Assigned Hub",
      render: (w) => {
        if ((w.role || "").toLowerCase() === "service_man") {
          return (
            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-100">
              N/A (Field Partner)
            </span>
          );
        }
        const wh = getWarehouseInfo(w.warehouseId);
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Building2 size={11} className="mr-1 text-blue-500" />
            {wh.name}
          </span>
        );
      }
    },
    {
      header: "Permission Given At",
      render: (w) => {
        const date = w.whitelistedAt?.toDate ? w.whitelistedAt.toDate() : null;
        return (
          <span className="text-xs text-gray-500 font-medium">
            {date ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "N/A"}
          </span>
        );
      }
    },
    {
      header: "Actions",
      render: (w) => (
        <button
          onClick={() => handleDeleteWhitelist(w)}
          className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all shadow-sm flex items-center text-xs font-bold"
          title="Remove Permission"
        >
          <Trash2 size={13} className="mr-1" />
          Remove
        </button>
      )
    }
  ];

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-300">
      <PageHeader
        title="Delivery Fleet & Whitelist Management"
        subtitle="Manage active delivery partners, regional hub fleet allocations, and login security whitelist."
      />

      {/* Hub Filter Selector */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center text-xs font-black text-gray-700 uppercase tracking-wider bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100">
            <Building2 size={16} className="mr-2 text-primary" />
            Hub Fleet Filter:
          </div>
          <select
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer hover:bg-gray-100 transition-colors focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">🏢 All Regional Hubs & Depots</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>
                📍 {wh.name} ({wh.code || wh.id})
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-bold text-gray-500">
          Showing <span className="text-primary font-black">{filteredRiders.length}</span> active riders in selected hub
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`py-4 px-6 font-black text-sm uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'active'
              ? 'border-green-900 text-green-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Active Fleet ({filteredRiders.length})
        </button>
        <button
          onClick={() => setActiveTab('whitelist')}
          className={`py-4 px-6 font-black text-sm uppercase tracking-wider border-b-2 transition-all flex items-center ${
            activeTab === 'whitelist'
              ? 'border-green-900 text-green-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <ShieldCheck className="mr-2" size={18} />
          Whitelist & Permissions ({filteredWhitelist.length})
        </button>
      </div>

      {activeTab === 'active' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total in Hub</p>
              <h3 className="text-2xl font-black text-gray-900">{filteredRiders.length}</h3>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Currently Online</p>
              <div className="flex items-center">
                <h3 className="text-2xl font-black text-green-600">{filteredRiders.filter(r => r.online).length}</h3>
                <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-ping"></span>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">On Delivery</p>
              <h3 className="text-2xl font-black text-orange-500">{filteredRiders.filter(r => r.currentOrderId).length}</h3>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Rate</p>
              <h3 className="text-2xl font-black text-blue-600">
                {filteredRiders.length > 0 ? Math.round((filteredRiders.filter(r => r.online).length / filteredRiders.length) * 100) : 0}%
              </h3>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-3 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="नाम, फ़ोन या आईडी से खोजें..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-900 font-bold"
              />
            </div>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-green-900" size={32} />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-50">
                <DataTable columns={liveFleetColumns} data={filteredRiders} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center uppercase mb-4">
                <ShieldCheck className="mr-2 text-green-600" size={22} />
                नया राइडर जोड़ें (Whitelist)
              </h2>
              <form onSubmit={handleWhitelist} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">राइडर का नाम</label>
                  <input
                    type="text"
                    required
                    value={whitelistName}
                    onChange={(e) => setWhitelistName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold"
                    placeholder="पूरा नाम दर्ज करें"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">फ़ोन नंबर (+91 सहित)</label>
                  <input
                    type="text"
                    required
                    value={whitelistPhone}
                    onChange={(e) => setWhitelistPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-mono font-bold"
                    placeholder="+919876543210"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">पार्टनर की भूमिका (Assign Role)</label>
                  <select
                    value={whitelistRole}
                    onChange={(e) => setWhitelistRole(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-800 outline-none"
                  >
                    <option value="rider">🚚 डिलीवरी राइडर (Delivery Rider)</option>
                    <option value="service_man">🛠️ सर्विस मैन / ड्रोन पायलट (Service Man)</option>
                    <option value="both">🔄 दोनों (Delivery + Service)</option>
                  </select>
                </div>
                {whitelistRole !== "service_man" && (
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">असाइन हब / वेयरहाउस</label>
                    <select
                      value={whitelistHub}
                      onChange={(e) => setWhitelistHub(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-800 outline-none"
                    >
                      {warehouses.map(wh => (
                        <option key={wh.id} value={wh.id}>
                          📍 {wh.name} ({wh.code || wh.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={whitelisting}
                  className="w-full py-3 bg-green-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-800 transition-all flex justify-center items-center shadow-lg shadow-green-100"
                >
                  {whitelisting ? <Loader2 className="animate-spin mr-2" size={16} /> : <UserCheck className="mr-2" size={16} />}
                  गेट पास दें (Allow Login)
                </button>
              </form>

              <div className="mt-6 p-4 bg-green-50 rounded-2xl border border-green-100">
                <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-1">सुरक्षा नियम:</p>
                <p className="text-[9px] font-bold text-green-700/70 leading-relaxed uppercase">
                  यहाँ नंबर जोड़ने के बाद ही वह ऐप में लॉगिन कर पाएगा। लॉगिन करते ही उसका स्टेटस 'Pending' से बदलकर 'Logged In' हो जाएगा।
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2rem] border border-amber-100 bg-amber-50/30 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Login Pending</p>
                    <Clock size={20} className="text-amber-500" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-2">{stats.whitelistedPending}</h3>
                </div>
                <p className="text-[10px] text-gray-400 font-bold mt-4">
                  इन राइडर्स को परमिशन मिल चुकी है, लेकिन इन्होंने अभी तक ऐप में पहली बार लॉगिन नहीं किया है।
                </p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-green-100 bg-green-50/30 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Successfully Logged In</p>
                    <CheckCircle2 size={20} className="text-green-500" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-2">{stats.whitelistedRegistered}</h3>
                </div>
                <p className="text-[10px] text-gray-400 font-bold mt-4">
                  ये राइडर्स सफलता पूर्वक डिलीवरी ऐप में रजिस्टर होकर लॉगिन कर चुके हैं।
                </p>
              </div>

              <div className="sm:col-span-2 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Permitted Numbers</p>
                    <h3 className="text-2xl font-black text-gray-900">{whitelistedList.length}</h3>
                  </div>
                  <ShieldCheck size={32} className="text-green-900 opacity-20" />
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Whitelisted Table */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase">अनुमति प्राप्त राइडर्स सूची (Whitelisted List)</h3>
                <p className="text-xs text-gray-400 font-medium">यहाँ आपको दिखेगा कि किस राइडर ने लॉगिन कर लिया है और किसका लॉगिन अभी बाकी है</p>
              </div>
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="नाम, फ़ोन या आईडी से खोजें..."
                  value={whitelistSearchTerm}
                  onChange={(e) => setWhitelistSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-900"
                />
              </div>
            </div>

            {whitelistLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-green-900" size={32} />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-50">
                <DataTable columns={whitelistColumns} data={filteredWhitelist} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* KYC DOCUMENTS & IDENTITY AUDIT MODAL */}
      {selectedKycRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-gray-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-700" />
                <h3 className="font-black text-gray-900 text-base">
                  Rider KYC Verification & Document Audit
                </h3>
              </div>
              <button onClick={() => setSelectedKycRider(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-5">
              {/* Profile Header Box */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block font-bold">Rider Name:</span>
                  <span className="font-black text-gray-900">{selectedKycRider.name || "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold">Phone Number:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedKycRider.phone || "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold">Rider Serial ID:</span>
                  <span className="font-mono font-bold text-emerald-800">{selectedKycRider.riderIdDisplay || "KV-PENDING"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold">Bank Account:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedKycRider.bankAccount || "Not Provided"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold">Bank Name & IFSC:</span>
                  <span className="font-bold text-gray-900">{selectedKycRider.bankName || "N/A"} ({selectedKycRider.ifscCode || "N/A"})</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold">Vehicle:</span>
                  <span className="font-bold text-gray-900">{selectedKycRider.vehicleType || "BIKE"} • {selectedKycRider.vehicleNumber || "N/A"}</span>
                </div>
              </div>

              {/* Status Banner */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-emerald-50/50 border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700">Current KYC State:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    selectedKycRider.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-800 border-green-300' :
                    selectedKycRider.kycStatus === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-300' :
                    'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {selectedKycRider.kycStatus || 'PENDING_VERIFICATION'}
                  </span>
                </div>
                {selectedKycRider.kycVerifiedBy && (
                  <span className="text-[11px] text-gray-500">Verified by: {selectedKycRider.kycVerifiedBy}</span>
                )}
              </div>

              {/* Uploaded Documents Grid */}
              <div>
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-3">Submitted Identification Documents</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'dl', label: 'Driving License (DL)' },
                    { key: 'aadhaar', label: 'Aadhaar Card' },
                    { key: 'rc', label: 'Vehicle Registration (RC)' },
                    { key: 'pan', label: 'PAN Card' }
                  ].map(docItem => {
                    const docUrl = selectedKycRider.documents?.[docItem.key];
                    return (
                      <div key={docItem.key} className="border border-gray-200 rounded-2xl p-3 bg-white space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-800">{docItem.label}</span>
                          {docUrl ? (
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink size={11} /> Open HD
                            </a>
                          ) : (
                            <span className="text-[10px] font-bold text-red-500">Not Uploaded</span>
                          )}
                        </div>

                        {docUrl ? (
                          <div className="h-40 w-full bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
                            <img
                              src={docUrl}
                              alt={docItem.label}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                              onClick={() => window.open(docUrl, '_blank')}
                            />
                          </div>
                        ) : (
                          <div className="h-28 w-full bg-gray-50 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs font-bold border border-dashed border-gray-200">
                            <FileText size={24} className="mb-1 opacity-40" />
                            Document pending from rider
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rejection Note Input */}
              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-gray-700">Rejection Reason / KYC Notes (Required only if rejecting):</label>
                <input
                  type="text"
                  value={kycRejectionNote}
                  onChange={(e) => setKycRejectionNote(e.target.value)}
                  placeholder="e.g. DL photo is blurred or expired"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedKycRider(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={kycProcessing}
                  onClick={() => handleRejectKyc(selectedKycRider.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow hover:bg-red-700 transition-all flex items-center gap-1.5"
                >
                  <AlertTriangle size={14} />
                  Reject Documents
                </button>
                <button
                  type="button"
                  disabled={kycProcessing}
                  onClick={() => handleApproveKyc(selectedKycRider.id)}
                  className="px-5 py-2 bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md hover:bg-emerald-900 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  {kycProcessing ? "Saving..." : "Approve & Verify KYC"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Riders;

import React, { useState, useEffect } from "react";
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
  PhoneCall
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import DataTable from "../components/common/DataTable";
import { revokeRiderAccess, whitelistRiderPhone, deleteWhitelistedRider } from "../services/riderManagement";
import { useAuth } from "../hooks/useAuth";

const Riders = () => {
  const { user: currentUser } = useAuth();
  const [ridersList, setRidersList] = useState([]);
  const [whitelistedList, setWhitelistedList] = useState([]);
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
  const [whitelisting, setWhitelisting] = useState(false);

  useEffect(() => {
    // 1. Real-time listener for Riders Operational Data
    const qRiders = collection(db, "riders");
    const unsubscribeRiders = onSnapshot(qRiders, (snapshot) => {
      const riders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
      unsubscribeRiders();
      unsubscribeWhitelist();
    };
  }, []);

  const handleWhitelist = async (e) => {
    e.preventDefault();
    const formattedPhone = whitelistPhone.startsWith("+91") ? whitelistPhone : `+91${whitelistPhone.replace(/\D/g, "")}`;
    if (formattedPhone.length !== 13) {
      return toast.error("Phone must be 10 digits (e.g. +919876543210)");
    }
    setWhitelisting(true);
    try {
      await whitelistRiderPhone(formattedPhone, whitelistName);
      toast.success("Rider whitelisted! They can now login via Delivery App.");
      setWhitelistPhone("");
      setWhitelistName("");
    } catch (error) {
      toast.error("Whitelisting failed");
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
      toast.error("Failed to remove whitelist entry");
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
      toast.error("Failed to revoke access");
    }
  };

  const filteredRiders = ridersList.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.phone || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.riderIdDisplay || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWhitelist = whitelistedList.filter(
    (w) =>
      (w.name || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase()) ||
      (w.phone || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase()) ||
      (w.riderIdDisplay || "").toLowerCase().includes(whitelistSearchTerm.toLowerCase())
  );

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
      header: "Actions",
      render: (s) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleRevokeRider(s)}
            disabled={s.id === currentUser?.uid}
            className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all shadow-sm flex items-center text-xs font-bold"
            title="Revoke Rider Access"
          >
            <UserX size={14} className="mr-1" />
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
    <div className="space-y-8 pb-20">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Bike className="mr-3 text-primary" size={32} />
            Fleet Control
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Manage delivery operations & security gate</p>
        </div>
        <div className="flex bg-white p-1 rounded-3xl border border-gray-100 shadow-sm">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-2 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-green-900 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}>
            Live Fleet ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-6 py-2 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'whitelist' ? 'bg-green-900 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}>
            Security Gate ({whitelistedList.length})
          </button>
        </div>
      </div>

      {activeTab === 'active' ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Registered</p>
              <h3 className="text-2xl font-black text-gray-900">{stats.total}</h3>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Currently Online</p>
              <div className="flex items-center">
                <h3 className="text-2xl font-black text-green-600">{stats.online}</h3>
                <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-ping"></span>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">On Delivery</p>
              <h3 className="text-2xl font-black text-orange-500">{stats.onDuty}</h3>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Rate</p>
              <h3 className="text-2xl font-black text-blue-600">
                {stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}%
              </h3>
            </div>
          </div>

          {/* Table Section */}
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
        /* Security Gate (Whitelist Management & Real-time Whitelist Table) */
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          {/* Top Row: Whitelist Stats & Add Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
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
    </div>
  );
};

export default Riders;

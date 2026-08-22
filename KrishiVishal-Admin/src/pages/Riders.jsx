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
  UserCheck
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import DataTable from "../components/common/DataTable";
import { getAllRiders, revokeRiderAccess, whitelistRiderPhone } from "../services/riderManagement";
import { useAuth } from "../hooks/useAuth";

const Riders = () => {
  const { user: currentUser } = useAuth();
  const [ridersList, setRidersList] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    onDuty: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const [whitelistPhone, setWhitelistPhone] = useState("");
  const [whitelistName, setWhitelistName] = useState("");
  const [whitelisting, setWhitelisting] = useState(false);

  useEffect(() => {
    // Real-time listener for Riders Operational Data
    const q = collection(db, "riders");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const riders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRidersList(riders);

      // Calculate Stats
      const online = riders.filter(r => r.online).length;
      setStats({
        total: riders.length,
        online: online,
        offline: riders.length - online,
        onDuty: riders.filter(r => r.currentOrderId).length
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleWhitelist = async (e) => {
    e.preventDefault();
    if (!whitelistPhone.startsWith("+91") || whitelistPhone.length < 13) {
      return toast.error("Phone must start with +91 and be 10 digits");
    }
    setWhitelisting(true);
    try {
      await whitelistRiderPhone(whitelistPhone, whitelistName);
      toast.success("Rider whitelisted! They can now register/login.");
      setWhitelistPhone("");
      setWhitelistName("");
    } catch (error) {
      toast.error("Whitelisting failed");
    } finally {
      setWhitelisting(false);
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

  const columns = [
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

  return (
    <div className="space-y-8 pb-20">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Bike className="mr-3 text-primary" size={32} />
            Fleet Control
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Manage delivery operations</p>
        </div>
        <div className="flex bg-white p-1 rounded-3xl border border-gray-100 shadow-sm">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-2 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-green-900 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}>
            Live Fleet
          </button>
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-6 py-2 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'whitelist' ? 'bg-green-900 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}>
            Security Gate
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

          {/* सर्च और टेबल सेक्शन */}
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
                <DataTable columns={columns} data={filteredRiders} />
              </div>
            )}
          </div>
        </>
      ) : (
        /* सुरक्षा गेट (Whitelist Form) टैब */
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm max-w-md mx-auto animate-in slide-in-from-bottom-4">
          <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center uppercase mb-4">
            <ShieldCheck className="mr-2 text-green-600" size={24} />
            सुरक्षा गेट (Whitelist)
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">फ़ोन नंबर (+91 के साथ)</label>
              <input
                type="text"
                required
                value={whitelistPhone}
                onChange={(e) => setWhitelistPhone(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-mono font-bold"
                placeholder="+919999999999"
              />
            </div>
            <button
              type="submit"
              disabled={whitelisting}
              className="w-full py-3 bg-green-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-800 transition-all flex justify-center items-center shadow-lg shadow-green-100"
            >
              {whitelisting ? <Loader2 className="animate-spin mr-2" size={16} /> : <UserCheck className="mr-2" size={16} />}
              गेट पास दें (Whitelist)
            </button>
          </form>

          <div className="mt-8 p-4 bg-green-50 rounded-2xl border border-green-100">
             <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-2">महत्वपूर्ण सूचना:</p>
             <p className="text-[9px] font-bold text-green-700/70 leading-relaxed uppercase">
                नंबर यहाँ जोड़ने के बाद ही नया राइडर डिलीवरी ऐप में रजिस्टर कर पायेगा। रजिस्ट्रेशन होते ही वह 'लाइव फ्लीट' में दिखने लगेगा।
             </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Riders;

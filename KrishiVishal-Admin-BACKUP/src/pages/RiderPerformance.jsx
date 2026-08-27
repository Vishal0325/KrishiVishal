import React, { useState, useEffect } from "react";
import {
  Trophy,
  Truck,
  Clock,
  Star,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Zap
} from "lucide-react";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase/config";
import DataTable from "../components/common/DataTable";

const RiderPerformance = () => {
  const [performanceData, setPerformanceData] = useState([]);
  const [riders, setRiders] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Rider Performance Stats
    const unsubPerf = onSnapshot(collection(db, "rider_performance"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPerformanceData(data);
      setLoading(false);
    });

    // 2. Fetch Rider Basic Info (Names)
    const unsubRiders = onSnapshot(collection(db, "riders"), (snapshot) => {
      const map = {};
      snapshot.forEach(doc => { map[doc.id] = doc.data(); });
      setRiders(map);
    });

    return () => { unsubPerf(); unsubRiders(); };
  }, []);

  const columns = [
    {
      header: "Rider",
      render: (r) => (
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black">
            {(riders[r.id]?.name || "R").charAt(0)}
          </div>
          <div>
            <div className="text-sm font-black text-gray-900">{riders[r.id]?.name || "Unknown Rider"}</div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ID: {r.id.slice(0,8)}</div>
          </div>
        </div>
      )
    },
    {
      header: "Deliveries",
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-sm font-black text-gray-900">{r.successful} / {r.totalAssigned}</span>
          <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${(r.successful / r.totalAssigned) * 100}%` }}
            />
          </div>
        </div>
      )
    },
    {
      header: "Avg Time",
      render: (r) => {
        const avgMinutes = r.successful > 0 ? Math.round((r.totalDeliveryTimeMs / r.successful) / 60000) : 0;
        return (
          <div className="flex items-center space-x-1">
            <Clock size={14} className={avgMinutes > 45 ? 'text-orange-500' : 'text-green-500'} />
            <span className="text-sm font-bold text-gray-700">{avgMinutes} Mins</span>
          </div>
        );
      }
    },
    {
      header: "Rating",
      render: (r) => (
        <div className="flex items-center text-orange-500 space-x-1">
          <Star size={14} fill="currentColor" />
          <span className="text-sm font-black">{r.ratingsCount > 0 ? (r.ratingsSum / r.ratingsCount).toFixed(1) : "4.5"}</span>
        </div>
      )
    },
    {
        header: "Status",
        render: (r) => {
            const successRate = (r.successful / r.totalAssigned) * 100;
            return (
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${successRate > 90 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {successRate > 90 ? 'Elite' : 'Under Review'}
                </span>
            )
        }
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Trophy className="mr-3 text-primary" size={32} />
            Rider Leaderboard
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Active Performance Intelligence</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
            <div className="p-3 bg-green-50 text-green-600 w-fit rounded-2xl">
                <Truck size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Success Rate</p>
                <h3 className="text-3xl font-black text-gray-900">96.4%</h3>
            </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
            <div className="p-3 bg-blue-50 text-blue-600 w-fit rounded-2xl">
                <Clock size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Hub-to-Door</p>
                <h3 className="text-3xl font-black text-gray-900">38 Min</h3>
            </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
            <div className="p-3 bg-purple-50 text-purple-600 w-fit rounded-2xl">
                <ShieldCheck size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Riders</p>
                <h3 className="text-3xl font-black text-gray-900">{Object.keys(riders).length}</h3>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
                <Zap size={20} className="text-primary" />
                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Performance Scorecard</h2>
            </div>
        </div>
        <DataTable columns={columns} data={performanceData} loading={loading} />
      </div>

      <div className="bg-orange-50 p-8 rounded-[3rem] border border-orange-100 flex items-start space-x-4">
          <AlertTriangle className="text-orange-500 shrink-0 mt-1" size={24} />
          <div>
              <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest mb-2 leading-none">Automated SLA Policy</h4>
              <p className="text-[10px] font-bold text-orange-700/60 leading-relaxed uppercase">
                  Riders with success rates below 85% for 3 consecutive days are automatically flagged for manager review. Nudges are sent via push notifications for pickups exceeding 30 minutes.
              </p>
          </div>
      </div>
    </div>
  );
};

export default RiderPerformance;

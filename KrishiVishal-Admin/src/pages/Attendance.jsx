import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User, Clock, CheckCircle, TrendingUp, Calendar, Search, Trophy, Medal } from 'lucide-react';
import DataTable from '../components/common/DataTable';

const Attendance = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubRiders = onSnapshot(collection(db, 'riders'), async (riderSnap) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const qOrders = query(
        collection(db, 'orders'),
        where('status', '==', 'DELIVERED'),
        where('createdAt', '>=', today)
      );
      const ordersSnap = await getDocs(qOrders);

      // Fetch app config for incentives (optional, but keep for completeness)
      const configSnap = await getDocs(collection(db, 'app_config'));
      const incentiveConfig = configSnap.docs.find(d => d.id === 'incentive_slabs')?.data()?.slabs || [];

      const attendanceData = riderSnap.docs.map(doc => {
        const rider = doc.data();
        const riderId = doc.id;
        const riderOrdersCount = ordersSnap.docs.filter(d => d.data().riderId === riderId).length;

        let hoursStr = "0h 0m";
        let durationMs = 0;
        if (rider.online && rider.shiftStartTime) {
          durationMs = Date.now() - rider.shiftStartTime;
        } else if (!rider.online && rider.shiftStartTime && rider.shiftEndTime) {
          durationMs = rider.shiftEndTime - rider.shiftStartTime;
        }

        if (durationMs > 0) {
          const h = Math.floor(durationMs / 3600000);
          const m = Math.floor((durationMs % 3600000) / 60000);
          hoursStr = `${h}h ${m}m`;
        }

        const nextSlab = incentiveConfig.find(s => s.ordersRequired > riderOrdersCount);
        const progress = nextSlab ? (riderOrdersCount / nextSlab.ordersRequired) * 100 : 100;

        // Efficiency Score (Deliveries per shift hour)
        let efficiency = 0;
        if (durationMs > 0) {
            const hours = durationMs / 3600000;
            efficiency = (riderOrdersCount / hours);
        }

        return {
          id: riderId,
          name: rider.name || 'Unknown',
          isOnline: rider.online || false,
          shiftStartTime: rider.shiftStartTime,
          totalHours: hoursStr,
          ordersDeliveredToday: riderOrdersCount,
          incentiveProgress: progress,
          nextSlabOrders: nextSlab?.ordersRequired || 0,
          efficiency: efficiency.toFixed(1)
        };
      });

      setRecords(attendanceData);
      setLoading(false);
    });

    return () => unsubRiders();
  }, []);

  const filteredRecords = records
    .filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      // Primary Sort: Deliveries Today
      if (b.ordersDeliveredToday !== a.ordersDeliveredToday) {
        return b.ordersDeliveredToday - a.ordersDeliveredToday;
      }
      // Secondary Sort: Efficiency
      return b.efficiency - a.efficiency;
    });

  const columns = [
    { header: 'Rank', render: (r, idx) => {
      const isTop = idx < 3 && r.ordersDeliveredToday > 0;
      return (
        <div className="flex items-center justify-center">
          {isTop ? (
            <div className={`p-1.5 rounded-lg ${idx === 0 ? 'bg-yellow-100 text-yellow-600' : idx === 1 ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-600'}`}>
              <Trophy size={16} />
            </div>
          ) : (
            <span className="text-xs font-black text-gray-300">#{idx + 1}</span>
          )}
        </div>
      )
    }},
    { header: 'Rider', render: (r) => (
      <div>
        <div className="font-bold text-gray-900">{r.name}</div>
        <div className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">ID-{r.id.slice(-6)}</div>
      </div>
    )},
    { header: 'Status', render: (r) => (
      r.isOnline ? (
        <span className="flex items-center text-emerald-600 text-[10px] font-black uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> Online
        </span>
      ) : (
        <span className="text-gray-400 text-[10px] font-black uppercase italic">Offline</span>
      )
    )},
    { header: 'Current Shift', render: (r) => (
      <div className="flex items-center text-xs font-bold text-gray-600">
        <Clock size={12} className="mr-1.5 opacity-40" />
        {r.totalHours}
      </div>
    )},
    { header: 'Deliveries', render: (r) => (
      <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-black border border-blue-100">
        {r.ordersDeliveredToday}
      </span>
    )},
    { header: 'Efficiency', render: (r) => (
      <div className="flex items-center text-[10px] font-black uppercase text-gray-500">
        <TrendingUp size={12} className="mr-1.5 text-primary" />
        {r.efficiency} per hr
      </div>
    )},
    { header: 'Incentive Progress', render: (r) => (
      <div className="w-48">
        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">
          <span>{r.ordersDeliveredToday} orders</span>
          <span>Target: {r.nextSlabOrders}</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${r.incentiveProgress}%` }}></div>
        </div>
      </div>
    )}
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Trophy className="mr-3 text-primary" size={28} />
          Rider Leaderboard
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Monitor fleet shifts and daily performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Riders Online</p>
            <p className="text-3xl font-black text-gray-900">{records.filter(r => r.isOnline).length}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Deliveries Today</p>
            <p className="text-3xl font-black text-gray-900">{records.reduce((sum, r) => sum + r.ordersDeliveredToday, 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Top Performer</p>
            <p className="text-xl font-black text-primary truncate">
                {records.length > 0 ? records.reduce((prev, curr) => (prev.ordersDeliveredToday > curr.ordersDeliveredToday) ? prev : curr).name : 'N/A'}
            </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Attendance Sheet</h3>
            <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Filter by name..."
                    className="pl-11 pr-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold w-64 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        <DataTable columns={columns} data={filteredRecords} loading={loading} />
      </div>
    </div>
  );
};

export default Attendance;

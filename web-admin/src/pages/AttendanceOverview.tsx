import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { User, Clock, CheckCircle, TrendingUp, Calendar, Search } from 'lucide-react';

interface AttendanceRecord {
  riderId: string;
  name: string;
  isOnline: boolean;
  shiftStartTime?: number;
  totalHours: string;
  ordersDeliveredToday: number;
  incentiveProgress: number;
  nextSlabOrders: number;
}

const AttendanceOverview: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // 1. Listen to riders for online status and names
    const unsubRiders = onSnapshot(collection(db, 'riders'), async (riderSnap) => {
      // 2. Fetch today's orders to count deliveries
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const qOrders = query(
        collection(db, 'orders'),
        where('status', '==', 'DELIVERED'),
        where('createdAt', '>=', today)
      );
      const ordersSnap = await getDocs(qOrders);

      // 3. Fetch app config for incentives
      const configSnap = await getDocs(collection(db, 'app_config'));
      const incentiveConfig = configSnap.docs.find(d => d.id === 'incentive_slabs')?.data()?.slabs || [];

      const attendanceData: AttendanceRecord[] = riderSnap.docs.map(doc => {
        const rider = doc.data();
        const riderId = doc.id;

        // Count orders for this rider
        const riderOrdersCount = ordersSnap.docs.filter(d => d.data().riderId === riderId).length;

        // Calculate shift hours
        let hoursStr = "0h 0m";
        if (rider.online && rider.shiftStartTime) {
          const diffMs = Date.now() - rider.shiftStartTime;
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          hoursStr = `${h}h ${m}m`;
        }

        // Incentive progress
        const nextSlab = incentiveConfig.find((s: any) => s.ordersRequired > riderOrdersCount);
        const progress = nextSlab ? (riderOrdersCount / nextSlab.ordersRequired) * 100 : 100;

        return {
          riderId,
          name: rider.name || 'Unknown',
          isOnline: rider.online || false,
          shiftStartTime: rider.shiftStartTime,
          totalHours: hoursStr,
          ordersDeliveredToday: riderOrdersCount,
          incentiveProgress: progress,
          nextSlabOrders: nextSlab?.ordersRequired || 0
        };
      });

      setRecords(attendanceData);
      setLoading(false);
    });

    return () => unsubRiders();
  }, []);

  const filteredRecords = records.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-500">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Calendar className="text-primary-color" />
          Shift & Attendance Overview
        </h2>
        <p>Monitor rider online hours, daily performance, and incentive eligibility.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon green">
            <User size={24} />
          </div>
          <div className="stat-info">
            <h4>Riders Online</h4>
            <div className="stat-value">{records.filter(r => r.isOnline).length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <h4>Total Deliveries Today</h4>
            <div className="stat-value">{records.reduce((sum, r) => sum + r.ordersDeliveredToday, 0)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <h4>Top Performer</h4>
            <div className="stat-value text-lg">
              {records.length > 0 ? records.reduce((prev, current) => (prev.ordersDeliveredToday > current.ordersDeliveredToday) ? prev : current).name : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Rider Attendance Sheet</h3>
          <div className="search-input-wrapper" style={{ maxWidth: '300px' }}>
            <Search size={18} />
            <input
              type="text"
              placeholder="Filter by name..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Rider Name</th>
                <th>Status</th>
                <th>Shift Duration</th>
                <th>Orders Delivered</th>
                <th>Incentive Progress</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">Fetching attendance records...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">No riders matching your search.</td></tr>
              ) : filteredRecords.map(record => (
                <tr key={record.riderId}>
                  <td>
                    <div className="font-semibold">{record.name}</div>
                    <div className="text-xs text-slate-400">ID: {record.riderId.slice(-6)}</div>
                  </td>
                  <td>
                    {record.isOnline ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                        <span className="live-dot"></span> Online
                      </span>
                    ) : (
                      <span className="text-slate-500">Offline</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-slate-500" />
                      {record.totalHours}
                    </div>
                  </td>
                  <td className="text-center">
                    <span className="text-lg font-bold">{record.ordersDeliveredToday}</span>
                  </td>
                  <td style={{ minWidth: '200px' }}>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{record.ordersDeliveredToday} orders</span>
                        <span>Target: {record.nextSlabOrders}</span>
                      </div>
                      <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary-color h-full transition-all duration-500"
                          style={{ width: `${record.incentiveProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendanceOverview;

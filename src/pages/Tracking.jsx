import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Map as MapIcon, Navigation, User, MapPin, Search, ExternalLink, Wifi, WifiOff, Battery, BatteryLow, Smartphone, Building2 } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';

const Tracking = () => {
  const [riders, setRiders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribe = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => {
      unsubWh();
      unsubscribe();
    };
  }, []);

  const getWarehouseName = (whId) => {
    if (!whId) return 'General Fleet';
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? wh.name : whId;
  };

  const filteredRiders = useMemo(() => {
    const selectedWh = warehouses.find(w => w.id === selectedHub || w.code === selectedHub);
    const selectedHubId = selectedWh?.id || selectedHub;
    const selectedHubCode = selectedWh?.code || selectedHub;

    return riders.filter(r => {
      const riderHub = r.warehouseId || r.assignedWarehouse || r.hubCode || '';
      const matchesHub = selectedHub === 'ALL' ||
        riderHub === selectedHub ||
        riderHub === selectedHubId ||
        riderHub === selectedHubCode;

      const matchesSearch = (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.phone || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesHub && matchesSearch;
    });
  }, [riders, selectedHub, searchTerm, warehouses]);

  const metrics = useMemo(() => {
    const list = filteredRiders;
    const online = list.filter(r => r.online).length;
    const offline = list.filter(r => !r.online).length;
    const withGps = list.filter(r => r.currentLat).length;
    const lowBattery = list.filter(r => (r.batteryLevel || 0) < 20).length;
    return { total: list.length, online, offline, withGps, lowBattery };
  }, [filteredRiders]);

  const columns = [
    { header: 'Rider Info', render: (r) => (
      <div className="flex items-center space-x-4">
        <div className="h-10 w-10 bg-[#1b5e20] text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-green-100">
          {r.name?.charAt(0) || '?'}
        </div>
        <div>
          <span className="font-black text-gray-900 block text-sm">{r.name || 'Unknown Rider'}</span>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{r.id.slice(-8)}</span>
        </div>
      </div>
    )},
    { header: 'Assigned Hub', render: (r) => (
      <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
        {getWarehouseName(r.warehouseId || r.assignedWarehouse || r.hubCode)}
      </span>
    )},
    { header: 'Status', render: (r) => (
      r.online ? (
        <span className="flex items-center gap-2 text-emerald-600 text-xs font-black uppercase">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Online
        </span>
      ) : (
        <span className="flex items-center gap-2 text-gray-400 text-xs font-black uppercase italic">
          <span className="h-2 w-2 rounded-full bg-gray-300"></span> Offline
        </span>
      )
    )},
    { header: 'Battery / Signal', render: (r) => (
      <div className="flex items-center space-x-4 text-xs font-bold text-gray-500">
        <div className="flex items-center gap-1">
          {(r.batteryLevel || 0) < 20 ? (
            <BatteryLow size={14} className="text-red-500" />
          ) : (
            <Battery size={14} className="text-green-600" />
          )}
          <span className={`${(r.batteryLevel || 0) < 20 ? 'text-red-500' : 'text-gray-600'}`}>
            {r.batteryLevel || 0}%
          </span>
        </div>
        <div className="text-[10px] text-gray-400">
          {r.lastLocationUpdate ? new Date(r.lastLocationUpdate).toLocaleTimeString() : 'N/A'}
        </div>
      </div>
    )},
    { header: 'Map Action', render: (r) => (
      r.currentLat ? (
        <a
          href={`https://www.google.com/maps?q=${r.currentLat},${r.currentLng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center bg-white border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary hover:bg-green-50 hover:border-primary transition-all shadow-sm"
        >
          <ExternalLink size={12} className="mr-2" />
          Track Live
        </a>
      ) : (
        <span className="text-[9px] font-bold text-gray-300 uppercase italic">No GPS Signal</span>
      )
    )}
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Live Fleet Tracking"
        subtitle="Monitor rider positions, battery health, and signal status in real-time"
      />

      {/* Hub Filter Selector */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center text-xs font-black text-gray-700 uppercase tracking-wider bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100">
            <Building2 size={16} className="mr-2 text-[#1b5e20]" />
            Hub Fleet Filter:
          </div>
          <select
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer hover:bg-gray-100 transition-colors focus:ring-2 focus:ring-[#1b5e20]/20"
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
          Showing <span className="text-[#1b5e20] font-black">{filteredRiders.length}</span> riders in selected hub
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Riders" value={metrics.total} icon={User} color="blue" />
        <MetricCard label="Online Now" value={metrics.online} icon={Wifi} color="green" />
        <MetricCard label="Offline" value={metrics.offline} icon={WifiOff} color="gray" />
        <MetricCard label="Low Battery" value={metrics.lowBattery} icon={BatteryLow} color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              Rider Signal List
            </h3>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search rider..."
                className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium w-48 outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <DataTable columns={columns} data={filteredRiders} loading={loading} />
        </div>

        <div className="space-y-4">
          <div className="bg-[#1b5e20] p-6 rounded-2xl text-white shadow-xl shadow-green-100">
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-5 opacity-60">Status Overview</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-xs font-bold">Online Now</span>
                <span className="text-2xl font-black">{metrics.online}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-xs font-bold">With GPS</span>
                <span className="text-2xl font-black">{metrics.withGps}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Offline</span>
                <span className="text-2xl font-black opacity-40">{metrics.offline}</span>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
            <h4 className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <MapIcon size={14} /> Google Maps
            </h4>
            <p className="text-[10px] font-bold text-orange-700/70 leading-relaxed">
              Click on a rider's "Track Live" button to view their real-time location on a satellite map.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tracking;

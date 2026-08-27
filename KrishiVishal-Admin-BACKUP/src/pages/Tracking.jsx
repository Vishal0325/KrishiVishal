import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Map as MapIcon, Navigation, User, MapPin, Search, ExternalLink } from 'lucide-react';
import DataTable from '../components/common/DataTable';

const Tracking = () => {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const filteredRiders = riders.filter(r =>
    (r.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Rider Info', render: (r) => (
      <div className="flex items-center space-x-4">
        <div className="h-10 w-10 bg-[#1b5e20] text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-green-100">
          {r.name?.charAt(0) || '?'}
        </div>
        <div>
          <span className="font-black text-gray-900 block">{r.name || 'Unknown Rider'}</span>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{r.id.slice(-8)}</span>
        </div>
      </div>
    )},
    { header: 'Status', render: (r) => (
      r.online ? (
        <span className="flex items-center text-emerald-600 text-[10px] font-black uppercase tracking-widest">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> Online
        </span>
      ) : (
        <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest italic">Offline</span>
      )
    )},
    { header: 'Battery / Signal', render: (r) => (
      <div className="flex items-center space-x-4 text-xs font-bold text-gray-500">
        <div className="flex items-center">
            <span className={r.batteryLevel < 20 ? 'text-red-500' : 'text-gray-600'}>
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
        <span className="text-[8px] font-bold text-gray-300 uppercase italic">No GPS Signal</span>
      )
    )}
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Navigation className="mr-3 text-primary" size={28} />
          Live Fleet Tracking
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Monitor rider positions and signal health</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-3 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center">
                      <MapPin size={18} className="mr-2 text-primary" />
                      Rider Signal List
                  </h3>
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search rider..."
                        className="pl-11 pr-6 py-2.5 bg-white border border-gray-100 rounded-2xl text-[10px] font-bold w-48 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
              </div>
              <DataTable columns={columns} data={filteredRiders} loading={loading} />
          </div>

          <div className="space-y-6">
              <div className="bg-[#1b5e20] p-8 rounded-[2.5rem] text-white shadow-xl shadow-green-100">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-6 opacity-60">Status Overview</h3>
                  <div className="space-y-6">
                      <div className="flex justify-between items-center border-b border-white/10 pb-4">
                          <span className="text-xs font-bold">Online Now</span>
                          <span className="text-2xl font-black">{riders.filter(r => r.online).length}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/10 pb-4">
                          <span className="text-xs font-bold">In Field</span>
                          <span className="text-2xl font-black">{riders.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-bold">Offline</span>
                          <span className="text-2xl font-black opacity-40">{riders.filter(r => !r.online).length}</span>
                      </div>
                  </div>
              </div>

              <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100">
                  <h4 className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-2 flex items-center">
                      <MapIcon size={14} className="mr-1.5" /> Google Maps
                  </h4>
                  <p className="text-[10px] font-bold text-orange-700/70 leading-relaxed">
                      Maps API is active. Click on a rider's "Track Live" button to view their real-time location on a satellite map.
                  </p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Tracking;

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Truck, MapPin, Package, CheckCircle, Clock, Map as MapIcon, Navigation } from 'lucide-react';
import DataTable from '../components/common/DataTable';

const Trips = () => {
  const [activeTrips, setActiveTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubRiders = onSnapshot(collection(db, 'riders'), (riderSnap) => {
      const qOrders = query(
        collection(db, 'orders'),
        where('status', 'in', ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'])
      );

      const unsubOrders = onSnapshot(qOrders, (orderSnap) => {
        const ridersWithTrips = new Map();

        orderSnap.docs.forEach(doc => {
          const order = doc.data();
          if (!order.riderId) return;

          const riderDoc = riderSnap.docs.find(r => r.id === order.riderId);
          if (!riderDoc) return;
          const rider = riderDoc.data();

          if (!ridersWithTrips.has(order.riderId)) {
            ridersWithTrips.set(order.riderId, {
              riderId: order.riderId,
              riderName: rider.name || 'Unknown',
              orderCount: 0,
              stops: [],
              currentLat: rider.currentLat || 0,
              currentLng: rider.currentLng || 0,
              lastUpdate: rider.lastLocationUpdate || 0
            });
          }

          const trip = ridersWithTrips.get(order.riderId);
          trip.orderCount++;
          trip.stops.push({
            orderId: doc.id,
            address: order.address?.address || order.address || 'No Address',
            status: order.status,
            customerName: order.address?.name || 'Customer'
          });
        });

        setActiveTrips(Array.from(ridersWithTrips.values()));
        setLoading(false);
      });

      return () => unsubOrders();
    });

    return () => unsubRiders();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Truck className="mr-3 text-primary" size={28} />
          Active Trip Monitoring
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Real-time multi-stop delivery routes</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          {loading ? (
            <div className="bg-white p-20 rounded-[2.5rem] text-center">
              <Truck size={40} className="animate-bounce text-primary mx-auto mb-4" />
              <p className="font-bold text-gray-400 uppercase tracking-widest text-[10px]">Scanning routes...</p>
            </div>
          ) : activeTrips.length === 0 ? (
            <div className="bg-white p-20 rounded-[2.5rem] text-center border border-dashed border-gray-200">
              <p className="font-bold text-gray-300 uppercase tracking-widest text-[10px]">No active trips in transit</p>
            </div>
          ) : (
            activeTrips.map(trip => (
              <div key={trip.riderId} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all duration-500">
                <div className="bg-gray-50/50 p-8 flex flex-wrap justify-between items-center gap-6 border-b border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#1b5e20] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-green-100">
                      {trip.riderName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 text-lg">{trip.riderName}</h3>
                      <p className="text-[10px] text-primary font-black uppercase tracking-widest flex items-center mt-1">
                        <Navigation size={10} className="mr-1" />
                        {trip.orderCount} Stops Active
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Signal Update</p>
                        <p className="text-xs font-bold text-gray-600">{trip.lastUpdate ? new Date(trip.lastUpdate).toLocaleTimeString() : 'N/A'}</p>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${trip.currentLat},${trip.currentLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-primary border border-primary/20 p-4 rounded-2xl hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
                    >
                      <MapPin size={24} />
                    </a>
                  </div>
                </div>

                <div className="p-8">
                  <div className="relative">
                    <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-100"></div>
                    <div className="space-y-8">
                      {trip.stops.map((stop, idx) => (
                        <div key={stop.orderId} className="relative flex items-start gap-8 pl-10">
                          <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white z-10 shadow-sm ${
                            stop.status === 'DELIVERED' ? 'bg-green-500' :
                            stop.status === 'OUT_FOR_DELIVERY' ? 'bg-orange-500 animate-pulse' :
                            'bg-blue-500'
                          }`}></div>

                          <div className="flex-1 bg-gray-50/50 p-6 rounded-3xl border border-gray-100 group-hover:bg-white transition-colors">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Stop #{idx + 1}</span>
                                <h4 className="font-black text-gray-900">Order KV-{stop.orderId.slice(-6)}</h4>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                stop.status === 'OUT_FOR_DELIVERY' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                                {stop.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-gray-600 flex items-center">
                                    <Package size={12} className="mr-2 opacity-40" /> {stop.customerName}
                                </p>
                                <p className="text-xs font-medium text-gray-400 flex items-start">
                                    <MapPin size={12} className="mr-2 mt-0.5 opacity-40 shrink-0" /> {stop.address}
                                </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
            <div className="bg-[#1b5e20] p-8 rounded-[2.5rem] text-white shadow-xl shadow-green-100">
                <h3 className="text-lg font-black uppercase tracking-tighter mb-8">Fleet Summary</h3>
                <div className="space-y-6">
                    <div className="bg-white/10 p-6 rounded-3xl backdrop-blur-sm border border-white/10">
                        <p className="text-[10px] font-bold text-green-200 uppercase tracking-widest mb-1">Batched Trips</p>
                        <p className="text-4xl font-black">{activeTrips.length}</p>
                    </div>
                    <div className="bg-white/10 p-6 rounded-3xl backdrop-blur-sm border border-white/10">
                        <p className="text-[10px] font-bold text-green-200 uppercase tracking-widest mb-1">Orders in Transit</p>
                        <p className="text-4xl font-black text-orange-300">
                            {activeTrips.reduce((sum, t) => sum + t.stops.filter(s => s.status === 'OUT_FOR_DELIVERY').length, 0)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 text-center">
                <MapIcon size={32} className="mx-auto text-gray-200 mb-4" />
                <p className="text-xs font-bold text-gray-400 leading-relaxed px-4">
                    Click the <MapPin size={12} className="inline text-primary" /> icon on a trip card to track the rider precisely on Google Maps.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Trips;

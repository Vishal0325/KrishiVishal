import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Truck, MapPin, Package, CheckCircle, Clock, Map as MapIcon, ChevronRight } from 'lucide-react';

interface ActiveTrip {
  riderId: string;
  riderName: string;
  orderCount: number;
  stops: Array<{
    orderId: string;
    address: string;
    status: string;
    customerName: string;
  }>;
  currentLat: number;
  currentLng: number;
  lastUpdate: number;
}

const TripMonitoring: React.FC = () => {
  const [activeTrips, setActiveTrips] = useState<ActiveTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to riders who are online and potentially have active trips
    const unsubRiders = onSnapshot(collection(db, 'riders'), (riderSnap) => {
      // Listen to orders that are assigned but not delivered
      const qOrders = query(
        collection(db, 'orders'),
        where('status', 'in', ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'])
      );

      const unsubOrders = onSnapshot(qOrders, (orderSnap) => {
        const ridersWithTrips: Map<string, ActiveTrip> = new Map();

        // Process orders into trips grouped by rider
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

          const trip = ridersWithTrips.get(order.riderId)!;
          trip.orderCount++;
          trip.stops.push({
            orderId: doc.id,
            address: order.address,
            status: order.status,
            customerName: order.userName
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
    <div className="animate-in fade-in duration-500">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <MapIcon className="text-primary-color" />
          Live Trip Monitoring
        </h2>
        <p>Real-time view of multi-stop batched trips and rider locations.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Monitoring List */}
        <div className="xl:col-span-2 space-y-4">
          {loading ? (
            <div className="card text-center py-20">
              <Truck size={40} className="animate-bounce text-primary-color mx-auto mb-4" />
              <p>Detecting active trips in the field...</p>
            </div>
          ) : activeTrips.length === 0 ? (
            <div className="card text-center py-20 text-slate-400">
              No active batched trips currently in transit.
            </div>
          ) : (
            activeTrips.map(trip => (
              <div key={trip.riderId} className="card overflow-hidden p-0 border-primary-color/20 hover:border-primary-color/50 transition-colors">
                <div className="bg-slate-800/50 p-6 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-color flex items-center justify-center text-white font-bold text-xl shadow-lg">
                      {trip.riderName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{trip.riderName}</h3>
                      <div className="text-sm text-slate-400 flex items-center gap-1">
                        <Truck size={14} />
                        Active Trip: {trip.orderCount} Stops
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">Last Location Update</div>
                      <div className="text-sm font-medium">{trip.lastUpdate ? new Date(trip.lastUpdate).toLocaleTimeString() : 'N/A'}</div>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${trip.currentLat},${trip.currentLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm rounded-full"
                    >
                      <MapPin size={16} />
                    </a>
                  </div>
                </div>

                <div className="p-6">
                  <div className="relative">
                    {/* Vertical Line Connector */}
                    <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-700"></div>

                    <div className="space-y-6">
                      {trip.stops.map((stop, idx) => (
                        <div key={stop.orderId} className="relative flex items-start gap-6 pl-8">
                          {/* Status Dot */}
                          <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-slate-900 z-10 ${
                            stop.status === 'DELIVERED' ? 'bg-emerald-500' :
                            stop.status === 'OUT_FOR_DELIVERY' ? 'bg-amber-500 animate-pulse' :
                            'bg-slate-700'
                          }`}></div>

                          <div className="flex-1 bg-slate-800/30 p-4 rounded-xl border border-border-color">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-xs font-bold text-primary-color uppercase tracking-widest">STOP {idx + 1}</span>
                                <h4 className="font-bold text-slate-100">Order #{stop.orderId.slice(-6)}</h4>
                              </div>
                              <span className={`badge ${
                                stop.status === 'OUT_FOR_DELIVERY' ? 'badge-warning' :
                                stop.status === 'PICKED_UP' ? 'badge-primary' :
                                'badge-success'
                              } btn-sm`}>
                                {stop.status.replace(/_/g, ' ')}
                              </span>
                            </div>

                            <div className="text-sm text-slate-300 flex items-center gap-2 mb-1">
                              <Package size={14} className="text-slate-500" />
                              Customer: {stop.customerName}
                            </div>
                            <div className="text-sm text-slate-400 flex items-center gap-2">
                              <MapPin size={14} className="text-slate-500" />
                              {stop.address}
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

        {/* Fleet Overview Sidebar */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg font-bold mb-4">Fleet Summary</h3>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-border-color">
                <div className="text-slate-400 text-sm mb-1">Total Batched Trips</div>
                <div className="text-3xl font-bold">{activeTrips.length}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-border-color">
                <div className="text-slate-400 text-sm mb-1">Orders in Transit</div>
                <div className="text-3xl font-bold text-amber-500">
                  {activeTrips.reduce((sum, t) => sum + t.stops.filter(s => s.status === 'OUT_FOR_DELIVERY').length, 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4">Tracking Map Info</h3>
            <div className="bg-slate-800/50 rounded-xl p-6 border-2 border-dashed border-border-color flex flex-col items-center gap-4 text-center">
              <MapIcon size={40} className="text-slate-500 opacity-50" />
              <p className="text-sm text-slate-400">
                Click the <MapPin size={14} className="inline mx-1" /> icon on any rider card to open their precise live location in Google Maps.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripMonitoring;

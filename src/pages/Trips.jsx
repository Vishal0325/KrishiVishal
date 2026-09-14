import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Truck, MapPin, Package, CheckCircle, Clock, Map as MapIcon, Navigation, Route, Sparkles, ShieldCheck } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import ProofOfDeliveryModal from '../components/orders/ProofOfDeliveryModal';
import toast from 'react-hot-toast';

/**
 * Extracts structured location parts from an order's address.
 * Handles both object addresses (schema v2) and legacy string addresses.
 */
const extractLocationParts = (address) => {
  if (!address || address === 'No Address') {
    return { pincode: '', village: '', district: '', street: '', raw: 'No Address' };
  }

  // Object address (Firestore schema v2)
  if (typeof address === 'object') {
    return {
      pincode: (address.pincode || '').trim(),
      village: (address.village || '').trim(),
      district: (address.district || '').trim(),
      street: (address.street || '').trim(),
      raw: [address.street, address.village, address.district, address.state, address.pincode].filter(Boolean).join(', '),
    };
  }

  // Legacy string address — try to parse "street, village, district, state, pincode"
  if (typeof address === 'string') {
    const parts = address.split(',').map(p => p.trim());
    // Try to find a 6-digit pincode anywhere in the string
    const pincodeMatch = address.match(/\b(\d{6})\b/);
    return {
      pincode: pincodeMatch ? pincodeMatch[1] : '',
      village: parts.length >= 4 ? parts[parts.length - 3] : '',
      district: parts.length >= 3 ? parts[parts.length - 2] : '',
      street: parts.length >= 1 ? parts[0] : '',
      raw: address,
    };
  }

  return { pincode: '', village: '', district: '', street: '', raw: String(address) };
};

/**
 * Groups and sorts stops by Pincode → Village/Locality → Address.
 * Stops with missing location data are placed at the end under "Location Unavailable".
 * No stops are deleted or merged.
 */
const optimizeStopsByAddress = (stops) => {
  if (!stops || stops.length <= 1) return stops;

  // Build a grouping key for each stop
  const enriched = stops.map(stop => {
    const loc = stop._location || extractLocationParts(stop.address);
    const hasLocation = loc.pincode || loc.village || loc.district;
    // Primary sort: pincode, secondary: village, tertiary: district
    const groupKey = hasLocation
      ? `${loc.pincode || 'zzz'}|${loc.village || 'zzz'}|${loc.district || 'zzz'}`
      : 'zzz|zzz|zzz|NO_LOCATION';
    return { ...stop, _groupKey: groupKey, _location: loc, _hasLocation: hasLocation };
  });

  // Sort by groupKey so same pincode/village stays together
  enriched.sort((a, b) => a._groupKey.localeCompare(b._groupKey, 'en', { numeric: true }));

  return enriched;
};

const Trips = () => {
  const [activeTrips, setActiveTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizedTrips, setOptimizedTrips] = useState(new Set()); // track which trips are optimized
  const [selectedPodOrder, setSelectedPodOrder] = useState(null);
  const [isPodOpen, setIsPodOpen] = useState(false);

  useEffect(() => {
    // [FIXED] Point #111 & #161: Proper nested listener cleanup to prevent exponential memory leaks
    let unsubOrders = null;

    const unsubRiders = onSnapshot(collection(db, 'riders'), (riderSnap) => {
      if (unsubOrders) unsubOrders(); // Cleanup previous order listener before starting new one

      const qOrders = query(
        collection(db, 'orders'),
        where('status', 'in', ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'])
      );

      unsubOrders = onSnapshot(qOrders, (orderSnap) => {
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

          const locationParts = extractLocationParts(order.address);

          trip.stops.push({
            orderId: doc.id,
            order: { id: doc.id, ...order },
            address: locationParts.raw || order.address?.address || order.address || 'No Address',
            status: order.status,
            customerName: order.address?.name || order.userName || 'Customer',
            _location: locationParts,
          });
        });

        setActiveTrips(Array.from(ridersWithTrips.values()));
        setLoading(false);
      });
    });

    return () => {
      unsubRiders();
      if (unsubOrders) unsubOrders();
    };
  }, []);

  const handleOptimizeRoute = (riderId) => {
    setActiveTrips(prev => prev.map(trip => {
      if (trip.riderId !== riderId) return trip;
      const optimized = optimizeStopsByAddress(trip.stops);
      return { ...trip, stops: optimized };
    }));
    setOptimizedTrips(prev => new Set([...prev, riderId]));
    toast.success("Route optimized by location grouping!");
  };

  /**
   * Generates group header labels for optimized stops.
   * Returns null if the stop belongs to the same group as the previous one.
   */
  const getGroupLabel = (stops, idx) => {
    const stop = stops[idx];
    if (!stop._location) return null;
    
    const loc = stop._location;
    const prevLoc = idx > 0 ? stops[idx - 1]?._location : null;

    // Check if this is a new group
    const currentGroup = `${loc.pincode}|${loc.village}|${loc.district}`;
    const prevGroup = prevLoc ? `${prevLoc.pincode}|${prevLoc.village}|${prevLoc.district}` : null;

    if (currentGroup === prevGroup) return null;

    if (!stop._hasLocation) return '📍 Location Unavailable';

    const parts = [];
    if (loc.pincode) parts.push(loc.pincode);
    if (loc.village) parts.push(loc.village);
    if (loc.district && loc.district !== loc.village) parts.push(loc.district);
    
    return parts.length > 0 ? `📍 ${parts.join(' → ')}` : null;
  };

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Active Delivery Trips & GPS Monitoring ERP"
        subtitle="Real-time multi-stop delivery routes, location grouping optimization, and live GPS map tracking."
      />

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

                  <div className="flex items-center space-x-4">
                    {/* Optimize Route Button */}
                    <button
                      onClick={() => handleOptimizeRoute(trip.riderId)}
                      disabled={trip.stops.length <= 1}
                      className={`flex items-center space-x-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm ${
                        optimizedTrips.has(trip.riderId)
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100'
                      } ${trip.stops.length <= 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {optimizedTrips.has(trip.riderId) ? <Sparkles size={14} /> : <Route size={14} />}
                      <span>{optimizedTrips.has(trip.riderId) ? 'Optimized ✓' : 'Optimize Route'}</span>
                    </button>

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
                  {/* Optimization info banner */}
                  {optimizedTrips.has(trip.riderId) && (
                    <div className="mb-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center space-x-3">
                      <Sparkles size={16} className="text-blue-500 shrink-0" />
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                        Stops grouped by Pincode → Village — Same area ke stops saath mein dikhaye gaye hain
                      </p>
                    </div>
                  )}

                  <div className="relative">
                    <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-100"></div>
                    <div className="space-y-6">
                      {trip.stops.map((stop, idx) => {
                        const groupLabel = optimizedTrips.has(trip.riderId) ? getGroupLabel(trip.stops, idx) : null;
                        return (
                          <React.Fragment key={stop.orderId}>
                            {/* Group Header */}
                            {groupLabel && (
                              <div className="ml-10 mb-2">
                                <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                                  {groupLabel}
                                </span>
                              </div>
                            )}

                            <div className="relative flex items-start gap-8 pl-10">
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
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => {
                                        setSelectedPodOrder(stop.order);
                                        setIsPodOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-extrabold flex items-center space-x-1 transition"
                                      title="Inspect POD & OTP"
                                    >
                                      <ShieldCheck size={12} />
                                      <span>POD / OTP</span>
                                    </button>
                                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                      stop.status === 'OUT_FOR_DELIVERY' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                      'bg-blue-50 text-blue-700 border-blue-100'
                                    }`}>
                                      {stop.status.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-600 flex items-center">
                                        <Package size={12} className="mr-2 opacity-40" /> {stop.customerName}
                                    </p>
                                    <p className="text-xs font-medium text-gray-400 flex items-start">
                                        <MapPin size={12} className="mr-2 mt-0.5 opacity-40 shrink-0" /> {stop.address}
                                    </p>
                                    {/* Show pincode/village tags when optimized */}
                                    {optimizedTrips.has(trip.riderId) && stop._location && (stop._location.pincode || stop._location.village) && (
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {stop._location.pincode && (
                                          <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">
                                            PIN: {stop._location.pincode}
                                          </span>
                                        )}
                                        {stop._location.village && (
                                          <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">
                                            {stop._location.village}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
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

            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <Route size={32} className="mx-auto text-blue-200 mb-4" />
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest text-center mb-3">Route Optimization</h4>
                <p className="text-[10px] font-bold text-gray-400 leading-relaxed px-2 text-center">
                    "Optimize Route" बटन दबाएँ — Same Pincode और Village के stops एक साथ group हो जाएंगे ताकि rider को कम भटकना पड़े।
                </p>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                    <p className="text-[9px] font-bold text-amber-700 text-center uppercase tracking-widest">
                        ⚠️ यह grouping-based suggestion है, shortest GPS route नहीं
                    </p>
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

      {/* Proof of Delivery & OTP Audit Modal */}
      {isPodOpen && selectedPodOrder && (
        <ProofOfDeliveryModal
          order={selectedPodOrder}
          isOpen={isPodOpen}
          onClose={() => {
            setIsPodOpen(false);
            setSelectedPodOrder(null);
          }}
        />
      )}
    </div>
  );
};

export default Trips;


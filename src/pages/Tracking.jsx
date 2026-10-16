import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Map as MapIcon,
  Navigation,
  User,
  MapPin,
  Search,
  Wifi,
  WifiOff,
  Battery,
  BatteryLow,
  DollarSign,
  AlertTriangle,
  Layers,
  Crosshair,
  RefreshCw,
  Phone,
  Package,
  Building2
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { useWarehouse } from '../context/WarehouseContext';

const HUBS = [
  {
    id: 'HUB-SAM-001',
    name: 'Samastipur Central Hub (Mother)',
    lat: 25.8633,
    lng: 85.7818,
    radiusKm: 20
  },
  {
    id: 'REG-RAH-002',
    name: 'Rahika Spoke Hub (Madhubani)',
    lat: 26.3750,
    lng: 86.0680,
    radiusKm: 15
  },
  {
    id: 'REG-KHA-003',
    name: 'Kalyanpur Spoke Hub',
    lat: 25.9610,
    lng: 85.8340,
    radiusKm: 15
  },
  {
    id: 'REG-TAJ-004',
    name: 'Tajpur Spoke Hub',
    lat: 25.8750,
    lng: 85.6420,
    radiusKm: 15
  }
];

// Helper to create custom SVG div icons
const createRiderIcon = (type, cashInHand = 0) => {
  let innerHtml = '';

  if (type === 'HIGH_CASH') {
    innerHtml = `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background-color: #f59e0b; opacity: 0.5; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="width: 26px; height: 26px; border-radius: 9999px; background-color: #d97706; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 900; font-size: 12px;">
          ₹
        </div>
      </div>
    `;
  } else if (type === 'ONLINE') {
    innerHtml = `
      <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 28px; height: 28px; border-radius: 9999px; background-color: #10b981; opacity: 0.4; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="width: 24px; height: 24px; border-radius: 9999px; background-color: #059669; border: 2px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); display: flex; align-items: center; justify-content: center; color: #ffffff;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
      </div>
    `;
  } else {
    // OFFLINE
    innerHtml = `
      <div style="width: 22px; height: 22px; border-radius: 9999px; background-color: #9ca3af; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15); display: flex; align-items: center; justify-content: center; color: #ffffff;">
        <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>
      </div>
    `;
  }

  return L.divIcon({
    html: innerHtml,
    className: 'custom-fleet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createHubIcon = (hubName) => {
  const html = `
    <div style="width: 36px; height: 36px; border-radius: 12px; background-color: #1b5e20; border: 2px solid #fbbf24; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 16px;">
      🏢
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-hub-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const Tracking = () => {
  const { selectedWarehouseId, selectWarehouse, isHubLocked, warehouses } = useWarehouse();
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const dynamicHubs = useMemo(() => {
    if (!warehouses || warehouses.length === 0) return HUBS;
    return warehouses.map((wh) => {
      const fb = HUBS.find((f) => f.id === wh.id || (wh.code && f.id.includes(wh.code.slice(0, 3))));
      const lat = Number(wh.lat || wh.latitude || wh.location?.latitude || fb?.lat || 25.8633);
      const lng = Number(wh.lng || wh.longitude || wh.location?.longitude || fb?.lng || 85.7818);
      return {
        id: wh.id,
        code: wh.code || wh.id,
        name: wh.name || wh.id,
        lat: isNaN(lat) ? 25.8633 : lat,
        lng: isNaN(lng) ? 85.7818 : lng,
        radiusKm: Number(wh.radiusKm || wh.deliveryRadiusKm || fb?.radiusKm || 15)
      };
    });
  }, [warehouses]);

  const [selectedHubId, setSelectedHubId] = useState(() => {
    if (isHubLocked && selectedWarehouseId) return selectedWarehouseId;
    if (selectedWarehouseId && selectedWarehouseId !== 'ALL') return selectedWarehouseId;
    return HUBS[0].id;
  });
  const [filterType, setFilterType] = useState('ALL'); // ALL | ONLINE | OFFLINE | HIGH_CASH

  // Sync selectedHubId with global WarehouseContext / Topbar
  useEffect(() => {
    if (isHubLocked && selectedWarehouseId) {
      setSelectedHubId(selectedWarehouseId);
    } else if (selectedWarehouseId && selectedWarehouseId !== 'ALL') {
      setSelectedHubId(selectedWarehouseId);
    }
  }, [selectedWarehouseId, isHubLocked]);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const hubLayerRef = useRef(null);

  const selectedHub = useMemo(() => {
    return (
      dynamicHubs.find((h) => h.id === selectedHubId || h.code === selectedHubId) ||
      dynamicHubs[0] ||
      HUBS[0]
    );
  }, [dynamicHubs, selectedHubId]);

  // Real-time Firestore subscription to riders
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'riders'), (snapshot) => {
      const riderList = snapshot.docs.map(doc => {
        const data = doc.data();
        const lat = data.currentLat || data.lat || data.location?.latitude || data.location?.lat || null;
        const lng = data.currentLng || data.lng || data.location?.longitude || data.location?.lng || null;
        return {
          id: doc.id,
          ...data,
          resolvedLat: lat ? Number(lat) : null,
          resolvedLng: lng ? Number(lng) : null
        };
      });
      setRiders(riderList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([selectedHub.lat, selectedHub.lng], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      hubLayerRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Hub Center, Hub Marker, and Operational Radius Overlay
  useEffect(() => {
    const map = mapInstanceRef.current;
    const hubLayer = hubLayerRef.current;
    if (!map || !hubLayer) return;

    hubLayer.clearLayers();

    // 1. Hub Marker
    const hubMarker = L.marker([selectedHub.lat, selectedHub.lng], {
      icon: createHubIcon(selectedHub.name)
    }).bindPopup(`
      <div style="font-family: inherit; padding: 4px;">
        <div style="font-weight: 800; font-size: 14px; color: #1b5e20;">${selectedHub.name}</div>
        <div style="font-size: 11px; color: #4b5563; margin-top: 2px;">Spoke Coordinates: ${selectedHub.lat.toFixed(4)}, ${selectedHub.lng.toFixed(4)}</div>
        <div style="font-size: 11px; color: #047857; font-weight: 700; margin-top: 4px;">Operational Radius: ${selectedHub.radiusKm} km</div>
      </div>
    `);
    hubLayer.addLayer(hubMarker);

    // 2. Operational Circle Overlay (15–20 km radius)
    const circle = L.circle([selectedHub.lat, selectedHub.lng], {
      radius: selectedHub.radiusKm * 1000,
      color: '#16a34a',
      fillColor: '#22c55e',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6, 6'
    });
    hubLayer.addLayer(circle);

    map.panTo([selectedHub.lat, selectedHub.lng], { animate: true });
  }, [selectedHub]);

  const hubScopedRiders = useMemo(() => {
    return riders.filter((r) => {
      if (!selectedHubId || selectedHubId === 'ALL' || selectedHubId === 'all') return true;
      const rWh = r.warehouseId || r.assignedWarehouse || r.hubCode || r.hubId || '';
      if (!rWh) return false;
      return (
        rWh === selectedHubId ||
        warehouses.some(
          (w) =>
            (w.id === selectedHubId || w.code === selectedHubId) &&
            (rWh === w.id || rWh === w.code)
        )
      );
    });
  }, [riders, selectedHubId, warehouses]);

  const metrics = useMemo(() => {
    const online = hubScopedRiders.filter((r) => r.online).length;
    const offline = hubScopedRiders.filter((r) => !r.online).length;
    const withGps = hubScopedRiders.filter((r) => r.resolvedLat && r.resolvedLng).length;
    const highCash = hubScopedRiders.filter((r) => Number(r.cashInHand || r.collectedCash || 0) > 15000).length;
    const lowBattery = hubScopedRiders.filter((r) => (r.batteryLevel || 100) < 20).length;
    return { total: hubScopedRiders.length, online, offline, withGps, highCash, lowBattery };
  }, [hubScopedRiders]);

  const filteredRiders = useMemo(() => {
    return hubScopedRiders.filter((r) => {
      const matchesSearch =
        (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.phone || '').includes(searchTerm);
      const isOnline = Boolean(r.online);
      const isHighCash = Number(r.cashInHand || r.collectedCash || 0) > 15000;

      if (!matchesSearch) return false;
      if (filterType === 'ONLINE') return isOnline;
      if (filterType === 'OFFLINE') return !isOnline;
      if (filterType === 'HIGH_CASH') return isHighCash;
      return true;
    });
  }, [hubScopedRiders, searchTerm, filterType]);

  // Update Rider Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    filteredRiders.forEach(rider => {
      if (!rider.resolvedLat || !rider.resolvedLng) return;

      const cashInHand = Number(rider.cashInHand || rider.collectedCash || 0);
      const isHighCash = cashInHand > 15000;
      const isOnline = Boolean(rider.online);

      const markerType = isHighCash ? 'HIGH_CASH' : (isOnline ? 'ONLINE' : 'OFFLINE');
      const icon = createRiderIcon(markerType, cashInHand);

      const assignedOrdersCount = Array.isArray(rider.activeOrders)
        ? rider.activeOrders.length
        : (rider.activeOrderCount || (rider.assignedOrderId ? 1 : 0));

      const popupHtml = `
        <div style="font-family: inherit; min-width: 210px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
            <span style="font-weight: 800; font-size: 14px; color: #111827;">${rider.name || 'Unknown Rider'}</span>
            <span style="font-size: 9px; font-weight: 700; background: #f3f4f6; color: #4b5563; padding: 1px 5px; border-radius: 4px;">${rider.id.slice(-6)}</span>
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">${rider.phone || 'No phone'}</div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
            <span style="color: #4b5563;">Fleet Status:</span>
            <span style="font-weight: 700; color: ${isOnline ? '#059669' : '#9ca3af'};">${isOnline ? '● Online' : '○ Offline'}</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
            <span style="color: #4b5563;">Battery Health:</span>
            <span style="font-weight: 700; color: ${(rider.batteryLevel || 100) < 20 ? '#dc2626' : '#16a34a'};">${rider.batteryLevel || 0}%</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
            <span style="color: #4b5563;">Active Deliveries:</span>
            <span style="font-weight: 700; color: #1d4ed8;">${assignedOrdersCount} Orders</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #e5e7eb;">
            <span style="color: #374151; font-weight: 700;">Cash in Hand:</span>
            <span style="font-weight: 800; color: ${isHighCash ? '#d97706' : '#111827'};">₹${cashInHand.toLocaleString('en-IN')}</span>
          </div>

          ${isHighCash ? '<div style="margin-top: 6px; background: #fef3c7; border: 1px solid #fde68a; color: #92400e; font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 6px; text-align: center;">⚠️ Vault Settlement > ₹15k</div>' : ''}
        </div>
      `;

      const marker = L.marker([rider.resolvedLat, rider.resolvedLng], { icon })
        .bindPopup(popupHtml);

      markersLayer.addLayer(marker);
    });
  }, [filteredRiders]);

  const focusRiderOnMap = (rider) => {
    if (!rider.resolvedLat || !rider.resolvedLng || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([rider.resolvedLat, rider.resolvedLng], 15, { animate: true });
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Live Fleet Telemetry & Spoke Map"
        subtitle="Real-time GPS tracking canvas with hub geofence overlays and cash-in-hand monitoring"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Riders" value={metrics.total} icon={User} color="blue" />
        <MetricCard label="Online Now" value={metrics.online} icon={Wifi} color="green" />
        <MetricCard label="With Live GPS" value={metrics.withGps} icon={Navigation} color="blue" />
        <MetricCard label="High Cash (>₹15k)" value={metrics.highCash} icon={AlertTriangle} color="amber" />
        <MetricCard label="Low Battery (<20%)" value={metrics.lowBattery} icon={BatteryLow} color="red" />
      </div>

      {/* Hub Selector & Map Canvas Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Map Canvas */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {/* Map Top Bar Controls */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-gray-700 tracking-wider flex items-center gap-1.5">
                <MapPin size={15} className="text-primary" /> Active Hub:
              </span>
              {isHubLocked ? (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 select-none shadow-sm">
                  <Building2 size={13} className="text-emerald-700" />
                  <span>{dynamicHubs.find(h => h.id === selectedHubId || h.code === selectedHubId)?.name || selectedHubId} (Assigned)</span>
                </span>
              ) : (
                <select
                  value={selectedHubId}
                  onChange={(e) => {
                    setSelectedHubId(e.target.value);
                    selectWarehouse(e.target.value);
                  }}
                  className="bg-white border border-gray-200 text-xs font-bold rounded-xl px-3 py-1.5 text-gray-800 outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-sm"
                >
                  {dynamicHubs.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Filter Toggle Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'ONLINE', label: 'Online' },
                { id: 'HIGH_CASH', label: 'High Cash' },
                { id: 'OFFLINE', label: 'Offline' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    filterType === f.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Leaflet Map Container */}
          <div className="relative w-full h-[540px]">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Map Legend Floating Widget */}
            <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm p-3 rounded-xl border border-gray-100 shadow-md text-[11px] font-medium space-y-1.5">
              <div className="font-bold text-gray-900 text-xs mb-1">Fleet Legend</div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600 border border-white"></span>
                <span>Active & Online</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 border border-white"></span>
                <span className="font-semibold text-amber-900">Cash in Hand &gt; ₹15,000</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-gray-400 border border-white"></span>
                <span className="text-gray-500">Offline / No Signal</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <span className="text-base">🏢</span>
                <span className="font-semibold text-gray-700">Hub ({selectedHub.radiusKm}km Operational Zone)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Rider Sidebar Stream */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-[610px] overflow-hidden">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-1.5">
                <Navigation size={14} className="text-primary" /> Live Riders ({filteredRiders.length})
              </h3>
              <span className="text-[10px] font-bold text-gray-400">Tap to Center</span>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search rider by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Scrollable Rider List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 space-y-1">
            {loading ? (
              <div className="py-20 text-center text-xs font-bold text-gray-400 flex flex-col items-center gap-2">
                <RefreshCw size={18} className="animate-spin text-primary" />
                Connecting live telemetry stream...
              </div>
            ) : filteredRiders.length === 0 ? (
              <div className="py-20 text-center text-xs font-bold text-gray-400">
                No riders match current filters.
              </div>
            ) : (
              filteredRiders.map(rider => {
                const cashInHand = Number(rider.cashInHand || rider.collectedCash || 0);
                const isHighCash = cashInHand > 15000;
                const hasGps = Boolean(rider.resolvedLat && rider.resolvedLng);

                return (
                  <div
                    key={rider.id}
                    onClick={() => focusRiderOnMap(rider)}
                    className="p-3 rounded-xl hover:bg-gray-50/80 transition-all cursor-pointer border border-transparent hover:border-gray-100 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-xs text-white ${
                          isHighCash ? 'bg-amber-500 shadow-sm' : (rider.online ? 'bg-[#1b5e20]' : 'bg-gray-400')
                        }`}>
                          {rider.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-extrabold text-xs text-gray-900">{rider.name || 'Unknown Rider'}</div>
                          <div className="text-[10px] text-gray-400 font-medium">{rider.phone || 'No phone'}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase ${
                          rider.online ? 'text-emerald-600' : 'text-gray-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${rider.online ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                          {rider.online ? 'Online' : 'Offline'}
                        </span>
                        <div className="text-[10px] font-bold text-gray-500">
                          Bat: {rider.batteryLevel || 0}%
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-gray-50 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-700">Cash: ₹{cashInHand.toLocaleString('en-IN')}</span>
                        {isHighCash && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded">
                            &gt; ₹15k
                          </span>
                        )}
                      </div>

                      {hasGps ? (
                        <span className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
                          <Crosshair size={11} /> Locate
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold text-gray-300 italic">No GPS</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tracking;

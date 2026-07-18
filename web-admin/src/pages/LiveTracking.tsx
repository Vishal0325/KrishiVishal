import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { MapPin, Navigation, Users } from 'lucide-react';

// Mock store location (center)
const STORE_LOCATION = { lat: 28.6139, lng: 77.2090 }; // New Delhi

const MAPS_API_KEY: string = "YOUR_GOOGLE_MAPS_API_KEY";

interface RiderLocation {
  riderId: string;
  lat: number;
  lng: number;
  targetLat?: number;
  targetLng?: number;
  lastUpdated: number;
}

const mapContainerStyle = {
  width: '100%',
  height: '600px',
  borderRadius: '16px'
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  styles: [
    // Dark mode map styles (simplified)
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  ]
};

const LiveTracking: React.FC = () => {
  const isApiKeyConfigured = MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY" && MAPS_API_KEY.length > 10;

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: isApiKeyConfigured ? MAPS_API_KEY : ""
  });

  const [, setMap] = useState<google.maps.Map | null>(null);
  const [riders, setRiders] = useState<RiderLocation[]>([]);

  useEffect(() => {
    // Listen to rider_locations collection
    const q = query(collection(db, 'rider_locations'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const locations: RiderLocation[] = [];
      snapshot.forEach((doc) => {
        locations.push({ riderId: doc.id, ...doc.data() } as RiderLocation);
      });
      setRiders(locations);
    }, (error) => {
      console.error("Error fetching rider locations:", error);
    });

    return () => unsubscribe();
  }, []);

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback() {
    setMap(null);
  }, []);

  const formatTimestamp = (ts: number) => {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Live Tracking</h2>
        <p>Monitor active riders in real-time. Vectors connect the store to the active destination.</p>
      </div>

      <div className="tracking-layout">
        {/* Map Area */}
        <div className="tracking-map-container">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {!isApiKeyConfigured ? (
              /* Fallback UI when no API key */
              <div className="map-fallback">
                <MapPin size={64} />
                <h3 style={{ color: 'var(--text-primary)' }}>Google Maps API Key Not Configured</h3>
                <p>
                  To enable live map tracking, add your Google Maps API key in
                  <code style={{ color: 'var(--primary-color)', padding: '2px 6px', background: 'var(--surface-color-light)', borderRadius: '4px', margin: '0 4px' }}>
                    LiveTracking.tsx
                  </code>
                  — Replace <code style={{ color: 'var(--warning-color)', padding: '2px 6px', background: 'var(--surface-color-light)', borderRadius: '4px' }}>YOUR_GOOGLE_MAPS_API_KEY</code> with your real key.
                </p>
                <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  Rider data is still being synced from Firestore in the background.
                </p>
              </div>
            ) : !isLoaded ? (
              <div className="skeleton" style={{ height: '600px', width: '100%' }}></div>
            ) : (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={STORE_LOCATION}
                zoom={12}
                options={mapOptions}
                onLoad={onLoad}
                onUnmount={onUnmount}
              >
                {/* Store Marker */}
                <Marker
                  position={STORE_LOCATION}
                  icon={{
                    url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                  }}
                  title="Store Location"
                />

                {/* Rider Markers & Routes */}
                {riders.map((rider) => (
                  <React.Fragment key={rider.riderId}>
                    <Marker
                      position={{ lat: rider.lat, lng: rider.lng }}
                      icon={{
                        url: 'http://maps.google.com/mapfiles/ms/icons/motorcycle.png'
                      }}
                      title={`Rider: ${rider.riderId}`}
                    />

                    {/* Draw route if target exists */}
                    {rider.targetLat && rider.targetLng && (
                      <Polyline
                        path={[
                          STORE_LOCATION,
                          { lat: rider.lat, lng: rider.lng },
                          { lat: rider.targetLat, lng: rider.targetLng }
                        ]}
                        options={{
                          strokeColor: '#3b82f6',
                          strokeOpacity: 0.8,
                          strokeWeight: 4,
                          icons: [{
                            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                            offset: '100%'
                          }]
                        }}
                      />
                    )}

                    {/* Destination Marker */}
                    {rider.targetLat && rider.targetLng && (
                      <Marker
                        position={{ lat: rider.targetLat, lng: rider.targetLng }}
                        icon={{
                          url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                        }}
                        title="Customer Location"
                      />
                    )}
                  </React.Fragment>
                ))}
              </GoogleMap>
            )}
          </div>
        </div>

        {/* Tracking Sidebar */}
        <div className="tracking-sidebar">
          {/* Live Status */}
          <div className="tracking-info-card">
            <div className="live-indicator">
              <div className="live-dot"></div>
              Live Updates Active
            </div>
            <h4>
              <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Active Riders
            </h4>
            {riders.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '8px 0' }}>
                No active riders at the moment.
              </div>
            ) : (
              riders.map((rider) => (
                <div key={rider.riderId} className="rider-stat-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Navigation size={14} style={{ color: 'var(--primary-color)' }} />
                    <span>{rider.riderId}</span>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {formatTimestamp(rider.lastUpdated)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Map Legend */}
          <div className="tracking-info-card">
            <h4>Map Legend</h4>
            <div className="legend-item">
              <div className="legend-dot blue"></div>
              <span>Store Location</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot orange"></div>
              <span>Rider (Active)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot green"></div>
              <span>Customer Destination</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="tracking-info-card">
            <h4>Quick Stats</h4>
            <div className="rider-stat-item">
              <span>Total Active</span>
              <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{riders.length}</span>
            </div>
            <div className="rider-stat-item">
              <span>With Destination</span>
              <span style={{ fontWeight: 600, color: 'var(--success-color)' }}>
                {riders.filter(r => r.targetLat && r.targetLng).length}
              </span>
            </div>
            <div className="rider-stat-item">
              <span>Idle Riders</span>
              <span style={{ fontWeight: 600, color: 'var(--warning-color)' }}>
                {riders.filter(r => !r.targetLat || !r.targetLng).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTracking;

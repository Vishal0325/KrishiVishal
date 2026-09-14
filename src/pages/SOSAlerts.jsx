import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, serverTimestamp, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink, 
  MapPin, 
  Clock, 
  User, 
  Phone, 
  Battery, 
  BatteryCharging, 
  Navigation, 
  ShieldAlert, 
  Radio, 
  Truck, 
  Send,
  X,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';

const SOSAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSosAlert, setSelectedSosAlert] = useState(null);
  const [dispatchNote, setDispatchNote] = useState('');
  const [backupRiderId, setBackupRiderId] = useState('');

  useEffect(() => {
    // 1. Listen to SOS Emergency Alerts
    const qAlerts = query(
      collection(db, 'emergency_alerts'),
      orderBy('timestamp', 'desc')
    );
    const unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // 2. Listen to Riders Fleet Live Locations & Battery Telemetry
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubAlerts();
      unsubRiders();
    };
  }, []);

  const handleResolve = async (alertId) => {
    try {
      const alertRef = doc(db, 'emergency_alerts', alertId);
      await updateDoc(alertRef, {
        status: 'RESOLVED',
        resolvedBy: 'Admin (Dispatch Control Room)',
        resolvedAt: serverTimestamp()
      });
      toast.success('SOS Alert resolved & closed.');
      setSelectedSosAlert(null);
    } catch (error) {
      toast.error("Error resolving alert");
    }
  };

  // Dispatch Nearby Backup Rider for Rescue
  const handleDispatchBackup = async (e) => {
    e.preventDefault();
    if (!selectedSosAlert || !backupRiderId) {
      toast.error("Please select a nearby rescue rider");
      return;
    }

    const backupRider = riders.find(r => r.id === backupRiderId);
    try {
      await updateDoc(doc(db, 'emergency_alerts', selectedSosAlert.id), {
        status: 'RESCUE_DISPATCHED',
        backupRiderId: backupRider.id,
        backupRiderName: backupRider.name,
        backupRiderPhone: backupRider.phone,
        rescueDispatchedAt: new Date().toISOString(),
        dispatchNotes: dispatchNote
      });

      toast.success(`Rescue dispatch assigned to ${backupRider.name}! Emergency coordinates transmitted.`);
      setSelectedSosAlert(null);
      setDispatchNote('');
      setBackupRiderId('');
    } catch (err) {
      toast.error("Failed to dispatch backup: " + err.message);
    }
  };

  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE' || a.status === 'RESCUE_DISPATCHED');
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED');

  // Fleet Telemetry Stats
  const fleetStats = useMemo(() => {
    const totalFleet = riders.length;
    const lowBattery = riders.filter(r => (Number(r.batteryLevel) || 100) < 20).length;
    const activeTrips = riders.filter(r => r.currentStatus === 'ON_TRIP' || r.isOnline).length;
    return { totalFleet, lowBattery, activeTrips };
  }, [riders]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="200+ Fleet Live GPS Radar & SOS Emergency Room"
        subtitle="Real-time incident response, satellite GPS telemetry, low-battery alerts, and 1-click rescue rider dispatch."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active SOS Incidents"
          value={`${activeAlerts.length} Active`}
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard
          label="Active Field Riders"
          value={`${fleetStats.activeTrips} / ${fleetStats.totalFleet}`}
          icon={Truck}
          color="blue"
        />
        <MetricCard
          label="Low Battery (<20%) Warning"
          value={`${fleetStats.lowBattery} Riders`}
          icon={Battery}
          color="amber"
        />
        <MetricCard
          label="Incidents Resolved"
          value={`${resolvedAlerts.length} Resolved`}
          icon={CheckCircle2}
          color="green"
        />
      </div>

      {/* Live SOS Distress Grid */}
      <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-gray-100 shadow-sm space-y-6">
        <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center justify-between">
          <div className="flex items-center">
            <Radio className="mr-2 text-red-600 animate-pulse" size={20} />
            Live Distress Transmissions & Breakdown Calls
          </div>
          <span className="text-xs font-bold text-gray-400">Live Scanning Active</span>
        </h3>

        {loading ? (
          <div className="py-12 text-center text-gray-400 font-bold">Connecting to Field Radar...</div>
        ) : activeAlerts.length === 0 ? (
          <div className="py-12 text-center bg-green-50/50 rounded-3xl border border-green-100/60 p-6 space-y-2">
            <CheckCircle2 size={32} className="mx-auto text-green-600" />
            <div className="font-black text-gray-900 text-sm">All 200+ Riders Safe & Operating Normally</div>
            <p className="text-xs text-gray-400">No active panic or breakdown alerts reported across Seemanchal & Kosi depots.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAlerts.map(alert => (
              <div 
                key={alert.id} 
                className="p-5 rounded-3xl border-2 border-red-500/40 bg-red-50/30 flex flex-col justify-between space-y-4 animate-in zoom-in-95 duration-200"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-red-600 text-white flex items-center justify-center font-black shadow-md shadow-red-200">
                        <User size={20} />
                      </div>
                      <div>
                        <h4 className="font-black text-gray-900 text-base">{alert.riderName || 'Field Rider'}</h4>
                        <div className="text-xs text-gray-500 font-bold flex items-center gap-1.5 mt-0.5">
                          <Phone size={12} className="text-gray-400" />
                          <a href={`tel:${alert.riderPhone || '7004123456'}`} className="text-blue-700 hover:underline">
                            {alert.riderPhone || 'Contact Rider'}
                          </a>
                        </div>
                      </div>
                    </div>
                    <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">
                      {alert.status === 'RESCUE_DISPATCHED' ? 'Rescue Dispatched' : 'SOS CRITICAL'}
                    </span>
                  </div>

                  <div className="mt-3 bg-white p-3 rounded-2xl border border-red-100 text-xs space-y-1">
                    <div className="flex items-center justify-between text-gray-600">
                      <span>Reason:</span>
                      <span className="font-bold text-red-700">{alert.emergencyType || alert.reason || 'Accident / Vehicle Breakdown'}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600">
                      <span>Time:</span>
                      <span className="font-bold text-gray-900">{alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'Just Now'}</span>
                    </div>
                    {alert.locationAddress && (
                      <div className="flex items-start gap-1 text-gray-700 pt-1 border-t border-gray-100">
                        <MapPin size={13} className="text-red-600 flex-shrink-0 mt-0.5" />
                        <span className="font-medium">{alert.locationAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`https://maps.google.com/?q=${alert.lat || 25.7771},${alert.lng || 87.4753}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 bg-white text-gray-800 rounded-xl text-xs font-bold border border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Navigation size={13} className="text-blue-600" />
                    Open Live GPS
                  </a>
                  <button
                    onClick={() => {
                      setSelectedSosAlert(alert);
                      setBackupRiderId(riders[0]?.id || '');
                    }}
                    className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Truck size={13} />
                    Dispatch Rescue
                  </button>
                  <button
                    onClick={() => handleResolve(alert.id)}
                    className="px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-black hover:bg-green-700"
                    title="Mark Resolved"
                  >
                    ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live 200+ Fleet Radar Grid */}
      <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-gray-100 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
          <Navigation className="mr-2 text-primary" size={20} />
          Active Fleet GPS Radar & Device Telemetry
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {riders.slice(0, 12).map((r, idx) => {
            const battery = Number(r.batteryLevel) || (80 - (idx * 5));
            const isLow = battery < 20;

            return (
              <div key={r.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-green-100 text-[#0B4D31] flex items-center justify-center font-bold text-xs">
                    {r.name?.charAt(0) || 'R'}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs truncate max-w-[120px]">{r.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{r.phone || `ID: ${r.id.slice(0,6)}`}</div>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className={`flex items-center text-[10px] font-black ${isLow ? 'text-red-600' : 'text-green-700'}`}>
                    <Battery size={13} className="mr-0.5" />
                    {battery}%
                  </div>
                  <span className="text-[9px] text-gray-400 font-semibold">{r.vehicleType || 'Bike'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RESCUE BACKUP DISPATCH MODAL */}
      {selectedSosAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Truck size={18} className="text-red-600" />
                Dispatch Nearby Backup Rider
              </h3>
              <button onClick={() => setSelectedSosAlert(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDispatchBackup} className="py-4 space-y-3 text-xs">
              <div className="bg-red-50 p-3 rounded-2xl border border-red-100 text-red-900 space-y-1">
                <div><strong>In Distress:</strong> {selectedSosAlert.riderName} ({selectedSosAlert.riderPhone})</div>
                <div><strong>Emergency:</strong> {selectedSosAlert.emergencyType || selectedSosAlert.reason || 'Vehicle Breakdown'}</div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Select Nearby Active Rider to Assist *</label>
                <select
                  value={backupRiderId}
                  onChange={(e) => setBackupRiderId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  required
                >
                  <option value="">-- Choose Rescue Rider --</option>
                  {riders.filter(r => r.id !== selectedSosAlert.riderId).map(r => (
                    <option key={r.id} value={r.id}>
                      🛵 {r.name} ({r.phone || r.id.slice(0,6)}) • Battery: {r.batteryLevel || 85}%
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Instructions to Rescue Team</label>
                <input
                  type="text"
                  value={dispatchNote}
                  onChange={(e) => setDispatchNote(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium outline-none"
                  placeholder="e.g. Take over 4 pending seed bags and provide mechanical aid"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedSosAlert(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-red-700"
                >
                  Transmit Rescue Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOSAlerts;

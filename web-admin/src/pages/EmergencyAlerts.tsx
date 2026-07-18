import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { AlertTriangle, CheckCircle, ExternalLink, MapPin, Clock, User } from 'lucide-react';

interface SOSAlert {
  id: string;
  riderId: string;
  riderName: string;
  location: {
    latitude: number;
    longitude: number;
  };
  timestamp: number;
  activeOrderId?: string;
  status: 'ACTIVE' | 'RESOLVED';
  resolvedBy?: string;
  resolvedAt?: any;
}

const EmergencyAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'emergency_alerts'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertsData: SOSAlert[] = [];
      snapshot.forEach((doc) => {
        alertsData.push({ id: doc.id, ...doc.data() } as SOSAlert);
      });
      setAlerts(alertsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleResolve = async (alertId: string) => {
    try {
      const alertRef = doc(db, 'emergency_alerts', alertId);
      await updateDoc(alertRef, {
        status: 'RESOLVED',
        resolvedBy: 'Admin (Web)',
        resolvedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error resolving alert:", error);
    }
  };

  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED');

  return (
    <div className="animate-in fade-in duration-500">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <AlertTriangle color="var(--danger-color)" size={32} />
          <h2 style={{ margin: 0 }}>Emergency SOS Dashboard</h2>
        </div>
        <p>Monitor and respond to real-time rider emergencies in the field.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon red">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-info">
            <h4>Active Emergencies</h4>
            <div className="stat-value">{activeAlerts.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <h4>Resolved Today</h4>
            <div className="stat-value">{resolvedAlerts.length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`live-dot ${activeAlerts.length > 0 ? 'bg-red-500' : 'bg-gray-500'}`}></span>
          Active Alerts
        </h3>

        {loading ? (
          <div className="skeleton" style={{ height: '200px', width: '100%' }}></div>
        ) : activeAlerts.length === 0 ? (
          <div className="empty-state-small">
            No active emergency alerts at this time.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="alert-item p-4 rounded-xl border-2 border-red-500/30 bg-red-500/5 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
                      <User size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{alert.riderName}</h4>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className="badge badge-danger">CRITICAL</span>
                </div>

                <div className="bg-slate-800/50 p-3 rounded-lg flex flex-col gap-2">
                  <div className="text-sm flex items-center gap-2">
                    <MapPin size={14} className="text-red-400" />
                    <span>Lat: {alert.location.latitude.toFixed(6)}, Lng: {alert.location.longitude.toFixed(6)}</span>
                  </div>
                  {alert.activeOrderId && (
                    <div className="text-sm flex items-center gap-2">
                      <Clock size={14} className="text-slate-400" />
                      <span>On Order: #{alert.activeOrderId.slice(-6)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-2">
                  <a
                    href={`https://www.google.com/maps?q=${alert.location.latitude},${alert.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary flex-1 btn-sm"
                  >
                    <ExternalLink size={16} />
                    View on Map
                  </a>
                  <button
                    onClick={() => handleResolve(alert.id)}
                    className="btn bg-green-600 hover:bg-green-700 text-white flex-1 btn-sm"
                  >
                    <CheckCircle size={16} />
                    Resolve Alert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '20px' }}>Recent Reoslutions</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Resolved At</th>
                <th>Resolved By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {resolvedAlerts.slice(0, 10).map(alert => (
                <tr key={alert.id}>
                  <td>
                    <div className="font-medium">{alert.riderName}</div>
                    <div className="text-xs text-slate-400">{alert.riderId}</div>
                  </td>
                  <td>{alert.resolvedAt?.toDate() ? alert.resolvedAt.toDate().toLocaleString() : 'Just now'}</td>
                  <td>{alert.resolvedBy}</td>
                  <td><span className="badge badge-success">RESOLVED</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmergencyAlerts;

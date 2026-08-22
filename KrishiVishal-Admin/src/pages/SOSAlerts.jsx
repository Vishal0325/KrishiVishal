import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AlertTriangle, CheckCircle, ExternalLink, MapPin, Clock, User } from 'lucide-react';
import toast from 'react-hot-toast';

const SOSAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'emergency_alerts'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleResolve = async (alertId) => {
    try {
      const alertRef = doc(db, 'emergency_alerts', alertId);
      await updateDoc(alertRef, {
        status: 'RESOLVED',
        resolvedBy: 'Admin (Main Panel)',
        resolvedAt: serverTimestamp()
      });
      toast.success('SOS Alert resolved');
    } catch (error) {
      toast.error("Error resolving alert");
    }
  };

  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <AlertTriangle className="mr-3 text-red-600" size={28} />
          Emergency SOS Dashboard
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 ml-11">Monitor and respond to rider emergencies</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 flex items-center justify-between">
            <div>
                <p className="text-[10px] font-black text-red-900 uppercase tracking-widest mb-1">Active Emergencies</p>
                <p className="text-4xl font-black text-red-600">{activeAlerts.length}</p>
            </div>
            <div className="h-12 w-12 bg-red-600/10 text-red-600 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={24} />
            </div>
        </div>
        <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100 flex items-center justify-between">
            <div>
                <p className="text-[10px] font-black text-green-900 uppercase tracking-widest mb-1">Resolved Today</p>
                <p className="text-4xl font-black text-green-600">{resolvedAlerts.length}</p>
            </div>
            <div className="h-12 w-12 bg-green-600/10 text-green-600 rounded-2xl flex items-center justify-center">
                <CheckCircle size={24} />
            </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter mb-6 flex items-center">
          <span className={`h-2 w-2 rounded-full mr-2 ${activeAlerts.length > 0 ? 'bg-red-600 animate-pulse' : 'bg-gray-300'}`}></span>
          Live Alerts
        </h3>

        {loading ? (
          <div className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest">Scanning field...</div>
        ) : activeAlerts.length === 0 ? (
          <div className="py-20 text-center text-gray-300 font-bold uppercase tracking-widest">No active emergencies</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="p-6 rounded-[2rem] border-2 border-red-500/30 bg-red-50/30 flex flex-col gap-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg">
                      <User size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900 text-lg">{alert.riderName}</h4>
                      <div className="text-[10px] text-gray-500 font-bold flex items-center">
                        <Clock size={12} className="mr-1" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full">CRITICAL</span>
                </div>

                <div className="bg-white/50 p-4 rounded-2xl border border-red-100">
                  <div className="text-sm font-bold text-gray-700 flex items-center mb-2">
                    <MapPin size={14} className="mr-2 text-red-600" />
                    Loc: {alert.location.latitude.toFixed(6)}, {alert.location.longitude.toFixed(6)}
                  </div>
                  {alert.activeOrderId && (
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      On Order: <span className="text-gray-900 font-mono">KV-{alert.activeOrderId.slice(-6)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <a
                    href={`https://www.google.com/maps?q=${alert.location.latitude},${alert.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white text-gray-900 border border-gray-200 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center flex-1 hover:bg-gray-50 transition-all"
                  >
                    <ExternalLink size={16} className="mr-2" />
                    Open Map
                  </a>
                  <button
                    onClick={() => handleResolve(alert.id)}
                    className="bg-green-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center flex-1 hover:bg-green-700 shadow-lg shadow-green-100 transition-all"
                  >
                    <CheckCircle size={16} className="mr-2" />
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm overflow-hidden">
        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter mb-6">Recently Resolved</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Rider</th>
                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Resolved At</th>
                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Handler</th>
                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resolvedAlerts.slice(0, 10).map(alert => (
                <tr key={alert.id}>
                  <td className="py-4">
                    <div className="font-bold text-gray-900">{alert.riderName}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{alert.riderId}</div>
                  </td>
                  <td className="py-4 text-xs font-bold text-gray-600">
                    {alert.resolvedAt?.toDate() ? alert.resolvedAt.toDate().toLocaleString() : 'Just now'}
                  </td>
                  <td className="py-4 text-xs font-black text-blue-600 uppercase tracking-widest">
                    {alert.resolvedBy}
                  </td>
                  <td className="py-4">
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-green-100">RESOLVED</span>
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

export default SOSAlerts;

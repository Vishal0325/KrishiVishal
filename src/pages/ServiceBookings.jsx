import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Clock, MapPin, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '../components/common/LoadingSpinner';

const ServiceBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'service_bookings'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBookings(bookingsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching bookings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING_ASSIGNMENT': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ASSIGNED': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ON_THE_WAY': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'IN_PROGRESS': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'COMPLETED': return 'bg-green-100 text-green-800 border-green-200';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'DISPUTED': return 'bg-red-100 text-red-800 border-red-200';
      case 'NO_PARTNER_FOUND': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Live Service Bookings</h1>
        <p className="text-sm text-gray-500">Monitor all marketplace service requests in real-time</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bookings.map((booking) => (
          <div key={booking.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-xs font-bold text-gray-400">#{booking.id.slice(-6).toUpperCase()}</span>
                <h3 className="font-bold text-gray-900 text-lg">{booking.serviceName}</h3>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold border uppercase tracking-wider ${getStatusColor(booking.status)}`}>
                {booking.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="space-y-2 mt-4 text-sm">
              <div className="flex items-center text-gray-600 gap-2">
                <MapPin size={16} className="text-gray-400" />
                <span className="truncate">{booking.farmLocation?.addressText || 'Unknown Location'}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600 bg-gray-50 p-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <span>Area: {booking.farmArea} {booking.areaUnit}</span>
                </div>
                <span className="font-bold text-gray-900">₹{booking.amount}</span>
              </div>
              
              <div className="pt-3 border-t mt-3 text-xs text-gray-500 flex justify-between items-center">
                <span>Radius: {booking.currentRadiusKm || 0} km</span>
                {booking.assignedPartnerId ? (
                  <span className="font-semibold text-green-700">Partner Assigned</span>
                ) : (
                  <span className="text-yellow-600">Finding Partner...</span>
                )}
              </div>
            </div>
            
            {booking.status === 'NO_PARTNER_FOUND' && (
              <div className="mt-3 bg-orange-50 text-orange-800 text-xs p-2 rounded-lg flex items-center gap-2 border border-orange-100">
                <AlertTriangle size={14} />
                <b>Action Required:</b> Manual Re-assign needed.
              </div>
            )}
          </div>
        ))}
        {bookings.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500">
            No live bookings found.
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceBookings;

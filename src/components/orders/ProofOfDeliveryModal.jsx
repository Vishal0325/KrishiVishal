import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  X, 
  ShieldCheck, 
  Camera, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  User, 
  Clock, 
  KeyRound, 
  AlertTriangle, 
  Navigation, 
  ExternalLink,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { addAuditLog } from '../../services/logger';
import toast from 'react-hot-toast';

export default function ProofOfDeliveryModal({ order, isOpen, onClose, onRefresh }) {
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [internalOtp, setInternalOtp] = useState(null);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    if (isOpen && order?.id) {
      fetchInternalOtp(order.id);
    } else {
      setInternalOtp(null);
      setShowOverrideConfirm(false);
    }
  }, [isOpen, order?.id]);

  const fetchInternalOtp = async (orderId) => {
    setLoadingOtp(true);
    try {
      const otpDoc = await getDoc(doc(db, 'orders', orderId, 'internal', 'otp'));
      if (otpDoc.exists()) {
        setInternalOtp(otpDoc.data());
      } else {
        setInternalOtp(null);
      }
    } catch (err) {
      console.warn('Failed to fetch internal OTP:', err);
    } finally {
      setLoadingOtp(false);
    }
  };

  if (!isOpen || !order) return null;

  // Calculate Geofence Distance if coordinates are available
  const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const targetLat = order.targetLat || order.shippingAddress?.latitude;
  const targetLng = order.targetLng || order.shippingAddress?.longitude;
  const deliveredLat = order.deliveredLat || order.podLat;
  const deliveredLng = order.deliveredLng || order.podLng;
  const geofenceDistance = calculateDistanceMeters(targetLat, targetLng, deliveredLat, deliveredLng);

  // Admin Emergency Override (for no-network deliveries)
  const handleAdminDeliveryOverride = async () => {
    setOverriding(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'DELIVERED',
        deliveredAt: Timestamp.now(),
        adminOverrideDelivery: true,
        overrideTimestamp: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      await addAuditLog('ADMIN_DELIVERY_OVERRIDE', 'Order', order.id, {
        customer: order.userName,
        amount: order.totalAmount,
        reason: 'Manual Admin Verification / Farmer Voice Confirmation'
      });

      toast.success(`Order #${order.id.slice(-6)} marked as DELIVERED via Admin Override`);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error('Admin override error:', err);
      toast.error('Failed to override delivery: ' + err.message);
    } finally {
      setOverriding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold">Proof of Delivery & OTP Audit</h3>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                  order.status === 'DELIVERED' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">Order ID: #{order.id} | Customer: {order.userName || 'Kisan Customer'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* OTP Verification Badge Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-600 text-white rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">Delivery PIN / OTP Verification</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {order.otpVerifiedAt 
                      ? `Verified at ${formatDateTime(order.otpVerifiedAt)}`
                      : order.status === 'DELIVERED'
                      ? 'Delivered with secure verification'
                      : 'Pending Customer Verification upon Rider Arrival'}
                  </p>
                </div>
              </div>
              {order.customerOTP && (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Customer PIN</span>
                  <div className="font-mono text-lg font-black text-emerald-900 bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-sm">
                    {order.customerOTP}
                  </div>
                </div>
              )}
            </div>

            {/* Internal OTP Details for Support Desk */}
            {internalOtp && (
              <div className="mt-3 pt-3 border-t border-emerald-200/60 flex items-center justify-between text-xs text-emerald-900">
                <span>Active Server OTP: <strong className="font-mono text-emerald-950 font-bold">{internalOtp.value}</strong></span>
                <span>Attempts: <strong>{internalOtp.attempts || 0} / 3</strong></span>
                <span>Expires: <strong>15 Mins</strong></span>
              </div>
            )}
          </div>

          {/* Visual Proof: Package Photo & Signature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Package Drop Photo */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col">
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-700 mb-2">
                <Camera className="w-4 h-4 text-gray-500" />
                <span>Package Photo at Farm/Doorstep</span>
              </div>

              {order.podPhotoUrl ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-black aspect-video flex items-center justify-center">
                  <img 
                    src={order.podPhotoUrl} 
                    alt="Package Delivery POD" 
                    className="w-full h-full object-cover hover:scale-105 transition duration-300 cursor-zoom-in"
                    onClick={() => window.open(order.podPhotoUrl, '_blank')}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-[140px] rounded-lg border border-dashed border-gray-300 bg-white flex flex-col items-center justify-center p-4 text-center">
                  <Camera className="w-8 h-8 text-gray-300 mb-1" />
                  <p className="text-xs text-gray-400 font-medium">No POD Photo uploaded yet</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Rider captures photo upon handover</p>
                </div>
              )}
            </div>

            {/* Farmer Signature */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col">
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-700 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Farmer / Receiver Signature</span>
              </div>

              {order.podSignatureUrl ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-white aspect-video flex items-center justify-center p-2">
                  <img 
                    src={order.podSignatureUrl} 
                    alt="Farmer Signature" 
                    className="max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-[140px] rounded-lg border border-dashed border-gray-300 bg-white flex flex-col items-center justify-center p-4 text-center">
                  <Sparkles className="w-8 h-8 text-gray-300 mb-1" />
                  <p className="text-xs text-gray-400 font-medium">Digital Signature Pending</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Signed on Rider App touchscreen</p>
                </div>
              )}
            </div>
          </div>

          {/* Geo-Fencing & Delivery Location Coordinates */}
          <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-800">
                <MapPin className="w-4 h-4 text-red-500" />
                <span>GPS Geofence & Location Validation</span>
              </div>
              {geofenceDistance !== null && (
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                  geofenceDistance <= 150 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {geofenceDistance <= 150 ? '✅ Accurate (Within 150m)' : `⚠️ Offset (${geofenceDistance}m)`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div>
                <span className="text-gray-500 block text-[11px]">Customer Destination Address:</span>
                <span className="font-semibold text-gray-800 line-clamp-2">
                  {typeof order.address === 'string' 
                    ? order.address 
                    : [order.address?.village, order.address?.district, order.address?.state].filter(Boolean).join(', ')}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[11px]">Assigned Delivery Rider:</span>
                <span className="font-semibold text-gray-800">
                  {order.riderName || (order.riderId ? `Rider #${order.riderId.slice(0, 8)}` : 'Unassigned')}
                </span>
              </div>
            </div>

            {deliveredLat && deliveredLng && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-600 font-mono">
                  Coordinates: {deliveredLat.toFixed(5)}, {deliveredLng.toFixed(5)}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${deliveredLat},${deliveredLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Admin Emergency Override Section (When farmer phone is dead or rider offline) */}
          {order.status !== 'DELIVERED' && (
            <div className="border border-amber-200 bg-amber-50/70 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h5 className="text-xs font-bold text-amber-950">Farmer Phone Offline / Emergency Dispatch Support</h5>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    If customer cannot receive OTP due to poor rural telecom connectivity, hub manager can verify delivery over phone call.
                  </p>

                  {!showOverrideConfirm ? (
                    <button
                      onClick={() => setShowOverrideConfirm(true)}
                      className="mt-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition shadow-sm"
                    >
                      Trigger Admin Delivery Override
                    </button>
                  ) : (
                    <div className="mt-3 bg-white p-3 rounded-lg border border-amber-300 space-y-2">
                      <p className="text-xs text-gray-700 font-medium">
                        Are you sure you want to mark this order <strong>DELIVERED</strong> without rider OTP? This action is permanently audited.
                      </p>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleAdminDeliveryOverride}
                          disabled={overriding}
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg transition"
                        >
                          {overriding ? 'Updating...' : 'Yes, Confirm Delivered'}
                        </button>
                        <button
                          onClick={() => setShowOverrideConfirm(false)}
                          className="text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Payment Mode: <strong className="text-gray-800">{order.paymentMethod || 'COD'}</strong> ({formatCurrency(order.totalAmount || 0)})
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl transition"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
}

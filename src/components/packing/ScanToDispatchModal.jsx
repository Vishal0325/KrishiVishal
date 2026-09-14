import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import { addAuditLog } from '../../services/logger';
import { 
  X, 
  Scan, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  User, 
  Package, 
  Sparkles, 
  Search, 
  ShieldCheck, 
  ArrowRight,
  Volume2,
  VolumeX,
  RefreshCw
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function ScanToDispatchModal({ isOpen, onClose, onComplete }) {
  const { user } = useAuth();
  const [riders, setRiders] = useState([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [tripOrders, setTripOrders] = useState([]);
  const [scannedParcels, setScannedParcels] = useState(new Set());
  const [scanInput, setScanInput] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastScanMessage, setLastScanMessage] = useState(null);

  const inputRef = useRef(null);

  // Sound Synthesizer via Web Audio API (Zero external assets)
  const playBeep = (isSuccess = true) => {
    if (!audioEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isSuccess) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // Low pitch A3
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn('Audio feedback unavailable:', e);
    }
  };

  // Fetch Active Riders
  useEffect(() => {
    if (!isOpen) return;
    const fetchRiders = async () => {
      try {
        const snap = await getDocs(collection(db, 'riders'));
        setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load riders:', err);
      }
    };
    fetchRiders();
  }, [isOpen]);

  // When a rider is selected, load their assigned orders awaiting dispatch
  useEffect(() => {
    if (!selectedRiderId) {
      setTripOrders([]);
      setScannedParcels(new Set());
      return;
    }

    const fetchRiderOrders = async () => {
      setLoadingOrders(true);
      try {
        const q = query(
          collection(db, 'orders'),
          where('riderId', '==', selectedRiderId),
          where('status', 'in', ['ASSIGNED', 'PACKED', 'READY_FOR_PICKUP'])
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTripOrders(list);
        setScannedParcels(new Set());
        setLastScanMessage(null);
      } catch (err) {
        console.error('Error fetching rider trip orders:', err);
        toast.error('Failed to load orders for selected rider');
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchRiderOrders();
  }, [selectedRiderId]);

  // Keep input focused for continuous barcode gun scanning
  useEffect(() => {
    if (isOpen && selectedRiderId) {
      inputRef.current?.focus();
    }
  }, [isOpen, selectedRiderId, scannedParcels]);

  // Flatten orders into expected parcel barcodes
  const expectedParcels = tripOrders.flatMap(order => {
    const totalParcels = order.parcels?.length || 1;
    if (order.parcels && order.parcels.length > 0) {
      return order.parcels.map((p, idx) => ({
        barcode: p.parcelId || `AWB-${order.id.slice(-8).toUpperCase()}-${idx + 1}`,
        orderId: order.id,
        customerName: order.userName || 'Kisan',
        parcelLabel: `Parcel ${idx + 1}/${totalParcels}`,
        weightKg: p.weightKg || '3.5',
        totalAmount: order.totalAmount || 0,
        paymentMethod: order.paymentMethod || 'COD'
      }));
    }
    // Single parcel fallback
    return [{
      barcode: `AWB-${order.id.slice(-8).toUpperCase()}-1`,
      altBarcode: order.id,
      orderId: order.id,
      customerName: order.userName || 'Kisan',
      parcelLabel: 'Single Box (1/1)',
      weightKg: order.totalWeightKg || '3.5',
      totalAmount: order.totalAmount || 0,
      paymentMethod: order.paymentMethod || 'COD'
    }];
  });

  const totalParcelCount = expectedParcels.length;
  const verifiedCount = scannedParcels.size;
  const isAllScanned = totalParcelCount > 0 && verifiedCount === totalParcelCount;

  // Handle Barcode Scan
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!code) return;

    // Check if code matches any expected parcel
    const matchedParcel = expectedParcels.find(p => 
      p.barcode.toUpperCase() === code || 
      (p.altBarcode && p.altBarcode.toUpperCase() === code) ||
      code.includes(p.orderId.toUpperCase()) ||
      p.orderId.toUpperCase().includes(code)
    );

    if (matchedParcel) {
      if (scannedParcels.has(matchedParcel.barcode)) {
        playBeep(false);
        setLastScanMessage({
          type: 'warning',
          text: `⚠️ Already Scanned: ${matchedParcel.barcode} (${matchedParcel.customerName})`
        });
        toast('Already scanned!', { icon: '⚠️' });
      } else {
        playBeep(true);
        setScannedParcels(prev => new Set(prev).add(matchedParcel.barcode));
        setLastScanMessage({
          type: 'success',
          text: `✅ Verified: ${matchedParcel.barcode} | Customer: ${matchedParcel.customerName}`
        });
      }
    } else {
      playBeep(false);
      setLastScanMessage({
        type: 'error',
        text: `❌ Mismatch! Barcode "${code}" does NOT belong to this rider's trip.`
      });
      toast.error(`Invalid Parcel Barcode: ${code}`);
    }
  };

  // 1-Click Finalize Handover & Dispatch
  const handleFinalizeDispatch = async () => {
    if (!isAllScanned) {
      toast.error('Please scan all parcels before completing handover!');
      return;
    }

    setDispatching(true);
    try {
      const batch = writeBatch(db);
      const now = Timestamp.now();

      tripOrders.forEach(order => {
        const ref = doc(db, 'orders', order.id);
        batch.update(ref, {
          status: 'OUT_FOR_DELIVERY',
          dispatchedAt: now,
          handoverVerified: true,
          handoverVerifiedBy: user?.email || 'Hub Executive',
          updatedAt: now
        });
      });

      await batch.commit();

      const riderObj = riders.find(r => r.id === selectedRiderId);
      await addAuditLog('SCAN_TO_DISPATCH_HANDOVER', 'Rider', selectedRiderId, {
        riderName: riderObj?.name || 'Rider',
        totalOrders: tripOrders.length,
        totalParcels: totalParcelCount,
        verifiedBy: user?.email || 'Admin'
      });

      toast.success(`🚀 ${totalParcelCount} parcels handed over to ${riderObj?.name || 'Rider'}! Out for delivery.`);
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      console.error('Dispatch handover failed:', err);
      toast.error('Failed to complete dispatch: ' + err.message);
    } finally {
      setDispatching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-gray-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold flex items-center space-x-2">
                <span>Scan-to-Dispatch Bag Handover</span>
                <span className="bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Zero-Theft Protocol
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Scan each parcel's Code-128 barcode before loading into the rider's delivery bag.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              title={audioEnabled ? 'Mute Scanner Audio' : 'Unmute Scanner Audio'}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            >
              {audioEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-red-400" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Step 1: Rider Selection */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Step 1: Select Departing Delivery Rider
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">-- Choose Rider to Dispatch --</option>
                {riders.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.phone || 'No Phone'}) — {r.vehicleType || 'Bike'}
                  </option>
                ))}
              </select>

              {selectedRiderId && (
                <div className="flex items-center space-x-3 bg-white px-3 py-2 rounded-lg border border-gray-200 text-xs">
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-gray-800">
                      {tripOrders.length} Orders Assigned
                    </span>
                    <span className="text-gray-500 block text-[11px]">
                      Total {totalParcelCount} Packages to Hand Over
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedRiderId && (
            <>
              {/* Step 2: Barcode Scanner Input */}
              <div className="border-2 border-emerald-500/40 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Scan className="w-4 h-4 text-emerald-600" />
                    <span>Step 2: Scan Parcel Barcode (Laser Gun / Camera)</span>
                  </label>
                  <span className="text-xs font-bold text-emerald-800">
                    Progress: {verifiedCount} / {totalParcelCount} ({totalParcelCount > 0 ? Math.round((verifiedCount / totalParcelCount) * 100) : 0}%)
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-emerald-200 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${totalParcelCount > 0 ? (verifiedCount / totalParcelCount) * 100 : 0}%` }}
                  />
                </div>

                <form onSubmit={handleBarcodeSubmit} className="flex space-x-2 pt-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan AWB / Order barcode (e.g. AWB-1001-1 or #854301)..."
                    className="flex-1 px-4 py-2.5 bg-white border border-emerald-400 rounded-xl text-sm font-mono font-bold focus:ring-4 focus:ring-emerald-500/20 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
                  >
                    Verify Scan
                  </button>
                </form>

                {/* Scan Audio/Status Feedback Box */}
                {lastScanMessage && (
                  <div className={`text-xs p-2.5 rounded-lg font-bold border ${
                    lastScanMessage.type === 'success' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                    lastScanMessage.type === 'warning' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                    'bg-red-100 text-red-900 border-red-300'
                  }`}>
                    {lastScanMessage.text}
                  </div>
                )}
              </div>

              {/* Step 3: Expected Parcels Checklist */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Rider Bag Manifest Checklist ({expectedParcels.length} Parcels)
                </h4>

                {loadingOrders ? (
                  <div className="text-center py-6 text-gray-400 text-xs">Loading trip manifest...</div>
                ) : expectedParcels.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
                    No pending dispatch orders found for this rider.
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {expectedParcels.map((parcel, idx) => {
                      const isScanned = scannedParcels.has(parcel.barcode);
                      return (
                        <div 
                          key={idx}
                          className={`p-3 rounded-xl border flex items-center justify-between transition ${
                            isScanned 
                              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' 
                              : 'bg-white border-gray-200 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg ${
                              isScanned ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {isScanned ? <CheckCircle2 className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-xs font-extrabold">{parcel.barcode}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">
                                  {parcel.parcelLabel} ({parcel.weightKg} kg)
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Customer: <strong className="text-gray-800">{parcel.customerName}</strong> | {parcel.paymentMethod}: {formatCurrency(parcel.totalAmount)}
                              </p>
                            </div>
                          </div>

                          <div>
                            {isScanned ? (
                              <span className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-black rounded-lg">
                                VERIFIED ✅
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg border border-gray-200">
                                PENDING SCAN
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            {isAllScanned ? (
              <span className="text-emerald-700 font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>All {totalParcelCount} parcels verified for departure!</span>
              </span>
            ) : (
              <span>{totalParcelCount - verifiedCount} parcels remaining to scan</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-xs rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalizeDispatch}
              disabled={!isAllScanned || dispatching}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
                isAllScanned && !dispatching
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {dispatching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching Fleet...</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  <span>Finalize Handover & Dispatch ({verifiedCount}/{totalParcelCount})</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

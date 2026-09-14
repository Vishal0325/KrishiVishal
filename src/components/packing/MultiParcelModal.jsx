import React, { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  X, 
  Layers, 
  Plus, 
  Trash2, 
  Printer, 
  ShieldCheck, 
  Scale, 
  Package, 
  Tag, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { printThermalShippingLabel } from '../../utils/PrintService';
import { formatCurrency } from '../../utils/formatters';
import { addAuditLog } from '../../services/logger';
import toast from 'react-hot-toast';

export default function MultiParcelModal({ order, isOpen, onClose, onUpdated }) {
  const [parcels, setParcels] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order?.parcels && order.parcels.length > 0) {
      setParcels(order.parcels);
    } else if (order) {
      setParcels([{
        parcelIndex: 1,
        parcelId: `AWB-${order?.id?.slice(-8)?.toUpperCase() || '1001'}-1`,
        weightKg: order?.totalWeightKg || '3.5',
        sealNumber: `SEAL-${order?.id?.slice(-6)?.toUpperCase() || '8921'}-1`,
        notes: 'Standard Agri Package'
      }]);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  // Add new parcel box
  const handleAddParcel = () => {
    const nextIdx = parcels.length + 1;
    setParcels(prev => [
      ...prev,
      {
        parcelIndex: nextIdx,
        parcelId: `AWB-${order.id.slice(-8).toUpperCase()}-${nextIdx}`,
        weightKg: '2.0',
        sealNumber: `SEAL-${order.id.slice(-6).toUpperCase()}-${nextIdx}`,
        notes: `Box ${nextIdx}`
      }
    ]);
  };

  // Remove parcel box
  const handleRemoveParcel = (index) => {
    if (parcels.length <= 1) {
      toast.error('At least 1 parcel is required');
      return;
    }
    const updated = parcels.filter((_, idx) => idx !== index).map((p, i) => ({
      ...p,
      parcelIndex: i + 1,
      parcelId: `AWB-${order.id.slice(-8).toUpperCase()}-${i + 1}`,
      sealNumber: `SEAL-${order.id.slice(-6).toUpperCase()}-${i + 1}`
    }));
    setParcels(updated);
  };

  // Update specific parcel field
  const handleUpdateParcel = (index, field, value) => {
    setParcels(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Save parcels to Firestore
  const handleSaveParcels = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        parcels: parcels,
        totalParcelsCount: parcels.length,
        isMultiParcel: parcels.length > 1,
        updatedAt: Timestamp.now()
      });

      await addAuditLog('SPLIT_MULTI_PARCEL', 'Order', order.id, {
        totalParcels: parcels.length,
        weights: parcels.map(p => `${p.weightKg}kg`).join(', ')
      });

      toast.success(`Configured ${parcels.length} parcel(s) for Order #${order.id.slice(-6)}`);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to save parcels:', err);
      toast.error('Failed to update parcels: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Print all 4x6 labels sequentially
  const handlePrintAllThermalLabels = async () => {
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      await printThermalShippingLabel(order, {
        parcelIndex: p.parcelIndex,
        totalParcels: parcels.length,
        weightKg: p.weightKg,
        sealNumber: p.sealNumber,
        parcelId: p.parcelId,
        items: order.items || []
      });
    }
    toast.success(`Sent ${parcels.length} 4x6 thermal label(s) to printer!`);
  };

  // Print individual label
  const handlePrintSingleLabel = (p) => {
    printThermalShippingLabel(order, {
      parcelIndex: p.parcelIndex,
      totalParcels: parcels.length,
      weightKg: p.weightKg,
      sealNumber: p.sealNumber,
      parcelId: p.parcelId,
      items: order.items || []
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Multi-Parcel & Heavy Cargo Splitting</h3>
              <p className="text-xs text-slate-400">Order ID: #{order.id} | Customer: {order.userName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-blue-900">
            <Package className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Heavy Agri Fertilizer & Liquid Separation:</span>
              <p className="mt-0.5 text-blue-800">
                Split bulky items (e.g. 50kg Urea/DAP bags) from fragile liquid chemical bottles into separate barcodes so delivery riders never miss a parcel.
              </p>
            </div>
          </div>

          {/* Parcel List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Configured Parcels ({parcels.length} Boxes/Bags)
              </h4>
              <button
                onClick={handleAddParcel}
                className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Box / Bag</span>
              </button>
            </div>

            <div className="space-y-3">
              {parcels.map((p, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-gray-900">
                        📦 Box {p.parcelIndex} of {parcels.length}
                      </span>
                      <span className="font-mono text-xs text-gray-500 font-bold bg-white px-2 py-0.5 rounded border border-gray-200">
                        {p.parcelId}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePrintSingleLabel(p)}
                        className="p-1.5 text-gray-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg border border-gray-200 transition"
                        title="Print this 4x6 Label"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {parcels.length > 1 && (
                        <button
                          onClick={() => handleRemoveParcel(idx)}
                          className="p-1.5 text-red-500 hover:text-red-700 bg-white hover:bg-red-50 rounded-lg border border-gray-200 transition"
                          title="Remove Parcel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-gray-500 font-bold mb-1">Weight (KG)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={p.weightKg}
                        onChange={(e) => handleUpdateParcel(idx, 'weightKg', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-500 font-bold mb-1">Tamper Seal Number</label>
                      <input
                        type="text"
                        value={p.sealNumber}
                        onChange={(e) => handleUpdateParcel(idx, 'sealNumber', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-500 font-bold mb-1">Package Contents / Tag</label>
                      <input
                        type="text"
                        value={p.notes}
                        onChange={(e) => handleUpdateParcel(idx, 'notes', e.target.value)}
                        placeholder="e.g. 50kg Fertilizer / Pesticide Bottle"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <button
            onClick={handlePrintAllThermalLabels}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print All {parcels.length} Thermal Labels (4×6)</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-xs rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveParcels}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-sm"
            >
              {saving ? 'Saving...' : 'Save Parcel Config'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

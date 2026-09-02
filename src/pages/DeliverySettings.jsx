import React, { useState, useEffect } from "react";
import { 
  Truck, 
  MapPin, 
  Save, 
  ShieldCheck, 
  Calculator, 
  Package, 
  Layers, 
  Check, 
  Plus, 
  Trash2,
  Info
} from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { formatCurrency } from "../utils/formatters";
import toast from "react-hot-toast";

export default function DeliverySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [rules, setRules] = useState({
    warehouseName: "पूर्णिया सेंट्रल वेयरहाउस डिपो (Purnea Central Depot)",
    warehouseLat: 25.7711,
    warehouseLng: 87.4753,
    maxDeliveryRadiusKm: 50,
    freeDeliveryOrderThreshold: 999, // Orders above this get free delivery regardless of distance
    heavyBagSurcharge: 20, // ₹ per 50kg bag
    tiers: [
      { minKm: 0, maxKm: 10, fee: 0, label: "लोकल हब ज़ोन (Free Zone)" },
      { minKm: 10, maxKm: 25, fee: 50, label: "मध्यम दूरी (Standard Tier)" },
      { minKm: 25, maxKm: 50, fee: 100, label: "विस्तारित देहात क्षेत्र (Extended Rural Tier)" }
    ]
  });

  // Simulator state
  const [simDistance, setSimDistance] = useState(18);
  const [simCartValue, setSimCartValue] = useState(750);
  const [simHeavyBags, setSimHeavyBags] = useState(1);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const snap = await getDoc(doc(db, "system_settings", "delivery_rules"));
        if (snap.exists()) {
          setRules(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.warn("Could not fetch delivery rules, using defaults", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, "system_settings", "delivery_rules"), {
        ...rules,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success("Delivery fee rules saved & updated across mobile apps!");
    } catch (err) {
      toast.error("Failed to save delivery rules: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculate simulated fee
  const calculateSimulatedFee = () => {
    if (simDistance > rules.maxDeliveryRadiusKm) {
      return { fee: 0, serviceable: false, reason: `Max delivery radius is ${rules.maxDeliveryRadiusKm} km` };
    }
    if (simCartValue >= rules.freeDeliveryOrderThreshold) {
      const heavyExtra = simHeavyBags * rules.heavyBagSurcharge;
      return { 
        fee: heavyExtra, 
        baseFee: 0, 
        heavyFee: heavyExtra, 
        serviceable: true, 
        reason: `₹${rules.freeDeliveryOrderThreshold}+ पर फ्री डिलीवरी लागू (${heavyExtra > 0 ? `+₹${heavyExtra} भारी बोरी चार्ज` : ''})` 
      };
    }

    const matchedTier = rules.tiers.find(t => simDistance >= t.minKm && simDistance <= t.maxKm) || 
      rules.tiers[rules.tiers.length - 1];
    
    const baseFee = matchedTier ? matchedTier.fee : 50;
    const heavyExtra = simHeavyBags * rules.heavyBagSurcharge;
    return {
      fee: baseFee + heavyExtra,
      baseFee,
      heavyFee: heavyExtra,
      serviceable: true,
      reason: `दूरी आधार शुल्क (₹${baseFee}) + भारी सामान शुल्क (₹${heavyExtra})`
    };
  };

  const simResult = calculateSimulatedFee();

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
            <Truck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Dynamic Delivery Fee Rules (दूरी अनुसार डिलीवरी चार्ज)
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              वेयरहाउस से किलोमीटर दूरी और कार्ट राशि के आधार पर डिलीवरी शुल्क निर्धारित करें
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 bg-emerald-800 hover:bg-emerald-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-800/20 active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={16} />
          <span>{saving ? "Saving Changes..." : "Save Delivery Rules"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Rules Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Origin & Thresholds */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={18} className="text-emerald-700" />
              वेयरहाउस लोकेशन व बेसिक थ्रेशोल्ड
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Primary Dispatch Warehouse Name
                </label>
                <input
                  type="text"
                  value={rules.warehouseName}
                  onChange={(e) => setRules({ ...rules, warehouseName: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Free Delivery Cart Threshold (₹)
                </label>
                <input
                  type="number"
                  value={rules.freeDeliveryOrderThreshold}
                  onChange={(e) => setRules({ ...rules, freeDeliveryOrderThreshold: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl text-xs font-black outline-none focus:border-emerald-600"
                />
                <p className="text-[10px] text-gray-400">इस राशि से ऊपर सभी ऑर्डर पर डिलीवरी मुफ्त होगी</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Heavy Bag Surcharge (₹ per 50kg bag)
                </label>
                <input
                  type="number"
                  value={rules.heavyBagSurcharge}
                  onChange={(e) => setRules({ ...rules, heavyBagSurcharge: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-black text-gray-900 outline-none focus:border-emerald-600"
                />
                <p className="text-[10px] text-gray-400">50kg यूरिया/डीएपी प्रति बोरी अतिरिक्त डिलीवरी चार्ज</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Max Serviceable Radius (km)
                </label>
                <input
                  type="number"
                  value={rules.maxDeliveryRadiusKm}
                  onChange={(e) => setRules({ ...rules, maxDeliveryRadiusKm: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  GPS Coordinates (Lat, Lng)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={rules.warehouseLat}
                    onChange={(e) => setRules({ ...rules, warehouseLat: Number(e.target.value) })}
                    className="w-1/2 px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono"
                    placeholder="Lat"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={rules.warehouseLng}
                    onChange={(e) => setRules({ ...rules, warehouseLng: Number(e.target.value) })}
                    className="w-1/2 px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono"
                    placeholder="Lng"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Distance Tiers Matrix */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Layers size={18} className="text-emerald-700" />
              दूरी मैट्रिक्स (Kilometer Tiers)
            </h3>

            <div className="space-y-3">
              {rules.tiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-2xl">
                  <div className="w-1/3">
                    <input
                      type="text"
                      value={tier.label}
                      onChange={(e) => {
                        const newTiers = [...rules.tiers];
                        newTiers[idx].label = e.target.value;
                        setRules({ ...rules, tiers: newTiers });
                      }}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900"
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-gray-500">
                    <input
                      type="number"
                      value={tier.minKm}
                      onChange={(e) => {
                        const newTiers = [...rules.tiers];
                        newTiers[idx].minKm = Number(e.target.value);
                        setRules({ ...rules, tiers: newTiers });
                      }}
                      className="w-16 px-2 py-2 bg-white border border-gray-200 rounded-xl text-center text-xs font-black"
                    />
                    <span>से</span>
                    <input
                      type="number"
                      value={tier.maxKm}
                      onChange={(e) => {
                        const newTiers = [...rules.tiers];
                        newTiers[idx].maxKm = Number(e.target.value);
                        setRules({ ...rules, tiers: newTiers });
                      }}
                      className="w-16 px-2 py-2 bg-white border border-gray-200 rounded-xl text-center text-xs font-black"
                    />
                    <span>किमी</span>
                  </div>
                  <div className="flex-1 flex items-center justify-end gap-2">
                    <span className="text-xs font-bold text-gray-500">शुल्क: ₹</span>
                    <input
                      type="number"
                      value={tier.fee}
                      onChange={(e) => {
                        const newTiers = [...rules.tiers];
                        newTiers[idx].fee = Number(e.target.value);
                        setRules({ ...rules, tiers: newTiers });
                      }}
                      className="w-20 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-right text-xs font-black"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Simulator & Tester Panel */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white p-6 rounded-3xl shadow-xl space-y-6">
            <div className="flex items-center space-x-2 border-b border-emerald-800 pb-3">
              <Calculator size={20} className="text-emerald-400" />
              <h3 className="text-sm font-black uppercase tracking-wider">
                Live Delivery Fee Simulator
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-emerald-300 uppercase">
                  ग्राहक की वेयरहाउस से दूरी: {simDistance} km
                </label>
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={simDistance}
                  onChange={(e) => setSimDistance(Number(e.target.value))}
                  className="w-full accent-emerald-400 mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-emerald-300 uppercase">
                  कार्ट राशि (Cart Value): ₹{simCartValue}
                </label>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="50"
                  value={simCartValue}
                  onChange={(e) => setSimCartValue(Number(e.target.value))}
                  className="w-full accent-emerald-400 mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-emerald-300 uppercase">
                  50kg खाद बोरी की संख्या: {simHeavyBags}
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={simHeavyBags}
                  onChange={(e) => setSimHeavyBags(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-emerald-800/60 border border-emerald-700 text-white rounded-xl text-xs font-bold mt-1"
                />
              </div>
            </div>

            {/* Calculated Result Box */}
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 space-y-2">
              <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">
                Calculated Delivery Charge
              </p>
              {simResult.serviceable ? (
                <div>
                  <h2 className="text-3xl font-black text-emerald-300">
                    {simResult.fee === 0 ? "FREE (₹0)" : `₹${simResult.fee}`}
                  </h2>
                  <p className="text-xs text-emerald-100 mt-1 font-medium">
                    {simResult.reason}
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-black text-rose-300">
                    Non-Serviceable
                  </h2>
                  <p className="text-xs text-rose-200 mt-1">
                    {simResult.reason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

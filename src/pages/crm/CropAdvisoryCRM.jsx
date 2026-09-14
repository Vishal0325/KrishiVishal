import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Sprout,
  Calendar,
  Send,
  Plus,
  Search,
  Filter,
  Layers,
  Sparkles,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  X,
  MessageSquare,
  Wheat,
  Share2
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CropAdvisoryCRM() {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState([]);
  const [cropsList, setCropsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCropFilter, setSelectedCropFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFarmerForAdvisory, setSelectedFarmerForAdvisory] = useState(null);

  // New Farmer Farm Profile Form
  const [form, setForm] = useState({
    farmerName: '',
    phone: '',
    village: '',
    district: '',
    acreage: '',
    soilType: 'Loamy (दोमट)',
    irrigationSource: 'Tubewell (नलकूप)',
    cropName: 'Wheat (गेहूँ)',
    sowingDate: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  // Comprehensive Agri-Crop Knowledge Stage Rules
  const cropStageGuides = {
    'Wheat (गेहूँ)': [
      { minDay: 0, maxDay: 20, stage: 'Germination & Crown Root (CRI)', advice: 'पहली सिंचाई (First Irrigation) 21वें दिन करें। जड़ विकास हेतु 25kg DAP प्रति एकड़ दें।', product: 'DAP 18:46:00 / Micro-Nutrient Granules' },
      { minDay: 21, maxDay: 45, stage: 'Tillering & First Top Dressing', advice: 'खरपतवार नियंत्रण (Weed Control) करें। 45kg यूरिया + 5kg जिंक सल्फेट प्रति एकड़ डालें।', product: 'Urea 46% + Zinc Sulfate 33%' },
      { minDay: 46, maxDay: 75, stage: 'Jointing & Stem Elongation', advice: 'दूसरी सिंचाई करें। पीले रतुआ (Yellow Rust) की निगरानी करें और प्रोपिकोनाजोल का छिड़काव करें।', product: 'Propiconazole 25% EC Fungicide' },
      { minDay: 76, maxDay: 105, stage: 'Booting & Heading (फूल/बाली)', advice: 'दाने की चमक और वजन बढ़ाने हेतु 00:52:34 (NPK) का 1kg प्रति एकड़ स्प्रे करें।', product: 'NPK 00:52:34 Water Soluble Fertilizer' },
      { minDay: 106, maxDay: 140, stage: 'Grain Filling & Maturity', advice: 'अंतिम हल्की सिंचाई। तेज हवा में सिंचाई से बचें ताकि फसल गिरे नहीं।', product: 'Potash 00:00:50 Spray' }
    ],
    'Mustard (सरसों)': [
      { minDay: 0, maxDay: 25, stage: 'Early Vegetative (प्रारंभिक बढ़वार)', advice: 'पहली सिंचाई 25-30 दिन पर करें। सल्फर 90% WG 3kg प्रति एकड़ डालें (तेल प्रतिशत बढ़ाने हेतु)।', product: 'Sulfur 90% WG Fert' },
      { minDay: 26, maxDay: 50, stage: 'Branching & Pre-Flowering', advice: 'माहो (Aphid/Chepa) कीट का प्रकोप हो तो इमिडाक्लोप्रिड 17.8% SL 1ml/L पानी में छिड़कें।', product: 'Imidacloprid 17.8% SL Insecticide' },
      { minDay: 51, maxDay: 85, stage: 'Pod Formation (फलियां बनना)', advice: 'सफेद रतुआ (White Rust) रोकने के लिए मेंकोजेब 75% WP 2g/L का छिड़काव करें।', product: 'Mancozeb 75% WP Fungicide' }
    ],
    'Gram / Chana (चना)': [
      { minDay: 0, maxDay: 30, stage: 'Branching (शाखाएं निकलना)', advice: 'उकठा (Wilt) रोग से बचाव हेतु ट्राइकोडर्मा विरिडी 2kg प्रति एकड़ गोबर की खाद में मिलाकर दें।', product: 'Trichoderma Viride Bio-Fungicide' },
      { minDay: 31, maxDay: 60, stage: 'Flowering & Nipping (तुड़ाई)', advice: 'शीर्ष कलियों को तोड़ें ताकि अधिक शाखाएं और फूल आएं। इल्ली (Pod Borer) से बचाव हेतु फेरोमोन ट्रैप लगाएं।', product: 'Helilure Pheromone Trap & Emamectin Benzoate 5% SG' }
    ]
  };

  // Fetch Farmers Agri Profiles
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'farmer_crop_profiles'), orderBy('createdAt', 'desc')),
      (snap) => {
        setFarmers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Compute Current Crop Stage & Advisory
  const calculateStageAndAdvisory = (sowingDateStr, cropName) => {
    if (!sowingDateStr) return { days: 0, stage: 'Unknown', advice: 'Sowing date not provided', product: 'None' };
    const sowing = new Date(sowingDateStr);
    const now = new Date();
    const diffTime = Math.abs(now - sowing);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const stages = cropStageGuides[cropName] || cropStageGuides['Wheat (गेहूँ)'];
    const current = stages.find(s => days >= s.minDay && days <= s.maxDay) || stages[stages.length - 1];

    return {
      days,
      stage: current?.stage || `Day ${days} Stage`,
      advice: current?.advice || 'Monitor crop health and soil moisture.',
      product: current?.product || 'General Agri Micronutrients'
    };
  };

  // Add Farmer Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'farmer_crop_profiles'), {
        ...form,
        acreage: Number(form.acreage || 1),
        createdAt: Timestamp.now(),
        createdBy: user?.email || 'Admin'
      });
      toast.success('Farmer Crop Profile & Agri-Calendar created!');
      setIsModalOpen(false);
      setForm({
        farmerName: '',
        phone: '',
        village: '',
        district: '',
        acreage: '',
        soilType: 'Loamy (दोमट)',
        irrigationSource: 'Tubewell (नलकूप)',
        cropName: 'Wheat (गेहूँ)',
        sowingDate: new Date().toISOString().slice(0, 10),
        notes: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save profile.');
    }
  };

  // Send Instant WhatsApp Advisory
  const handleSendAdvisory = (farmer) => {
    const info = calculateStageAndAdvisory(farmer.sowingDate, farmer.cropName);
    const msg = `नमस्ते ${farmer.farmerName} जी! KrishiVishal की ओर से आपकी ${farmer.cropName} की फसल (Day ${info.days}) के लिए महत्वपूर्ण कृषि सलाह:\n\n🌱 वर्तमान अवस्था: ${info.stage}\n📋 सलाह: ${info.advice}\n🌾 अनुशंसित उत्पाद: ${info.product}\n\nघर बैठे ऑर्डर करने के लिए 1-क्लिक करें: https://krishivishal.in/crop-advisory`;
    
    // Open WhatsApp Web with prefilled message
    const cleanPhone = farmer.phone?.replace(/[^0-9]/g, '');
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    toast.success(`Opening WhatsApp advisory for ${farmer.farmerName}!`);
  };

  // Filtered Farmers
  const filteredFarmers = useMemo(() => {
    return farmers.filter(f => {
      const matchesSearch =
        (f.farmerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.phone || '').includes(searchTerm) ||
        (f.village || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCrop = selectedCropFilter === 'ALL' || f.cropName === selectedCropFilter;
      return matchesSearch && matchesCrop;
    });
  }, [farmers, searchTerm, selectedCropFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0F5132] to-[#1E7E34] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sprout size={14} className="text-lime-300" />
              AI-Powered Agri CRM & Proactive Farming Assistant
            </div>
            <h2 className="text-2xl font-black">Crop-Calendar Advisory & Farmer Profiling</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Track farmer landholdings, sowing dates, soil types, and automate stage-wise nutrient & pest advisories (15/30/45/60 days) to boost harvest yield and sales.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-lime-400 hover:bg-lime-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Add Farmer Agri Profile
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by farmer name, phone, or village..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:border-[#0F5132]"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <Wheat size={14} className="text-gray-500" />
            <select
              value={selectedCropFilter}
              onChange={(e) => setSelectedCropFilter(e.target.value)}
              className="bg-transparent outline-none font-bold text-gray-700 cursor-pointer"
            >
              <option value="ALL">All Crops (सभी फसलें)</option>
              <option value="Wheat (गेहूँ)">Wheat (गेहूँ)</option>
              <option value="Mustard (सरसों)">Mustard (सरसों)</option>
              <option value="Gram / Chana (चना)">Gram / Chana (चना)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Advisory Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Active Crop Profiles</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{farmers.length}</h3>
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 font-bold">
              <Wheat size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Mapped to Agri-Calendar</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Acreage Monitored</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {farmers.reduce((acc, f) => acc + Number(f.acreage || 0), 0)} Acres
            </h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <Sprout size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Under active supervision</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Advisories Due This Week</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-amber-600">
              {farmers.filter(f => {
                const days = calculateStageAndAdvisory(f.sowingDate, f.cropName).days;
                return days % 20 <= 5;
              }).length}
            </h3>
            <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold">
              <Calendar size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Requires Fertilizer / Spray alert</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Advisory Channel</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-lg font-black text-gray-900">WhatsApp & SMS</h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <MessageSquare size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">1-Click Direct Delivery</p>
        </div>
      </div>

      {/* Main Farmers Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <Sprout className="text-[#0F5132]" size={18} />
            Farmer Field Records & Automated Stage Advisories
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {filteredFarmers.length} Farmers
          </span>
        </div>

        <DataTable
          data={filteredFarmers}
          columns={[
            {
              header: 'Farmer Name & Phone',
              accessor: 'farmerName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.farmerName}</span>
                  <span className="font-mono text-xs text-gray-500">{row.phone}</span>
                </div>
              )
            },
            {
              header: 'Location / Farm Size',
              accessor: 'village',
              render: (row) => (
                <div>
                  <span className="text-xs font-bold text-gray-800">{row.village || 'Village'}, {row.district || 'Dist'}</span>
                  <p className="text-[11px] text-emerald-700 font-extrabold">{row.acreage || 1} Acres • {row.soilType}</p>
                </div>
              )
            },
            {
              header: 'Crop & Sowing Date',
              accessor: 'cropName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.cropName}</span>
                  <span className="text-[11px] text-gray-500 font-medium">Sown: {row.sowingDate}</span>
                </div>
              )
            },
            {
              header: 'Current Crop Stage',
              accessor: 'stage',
              render: (row) => {
                const info = calculateStageAndAdvisory(row.sowingDate, row.cropName);
                return (
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-lime-100 text-lime-900 border border-lime-300">
                      Day {info.days} • {info.stage}
                    </span>
                  </div>
                );
              }
            },
            {
              header: 'Proactive Action & Recommendations',
              accessor: 'advice',
              render: (row) => {
                const info = calculateStageAndAdvisory(row.sowingDate, row.cropName);
                return (
                  <div className="max-w-md">
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{info.advice}</p>
                    <p className="text-[11px] text-emerald-800 font-bold mt-1">🛒 Product: {info.product}</p>
                  </div>
                );
              }
            },
            {
              header: 'Action',
              accessor: 'id',
              render: (row) => (
                <button
                  onClick={() => handleSendAdvisory(row)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 cursor-pointer"
                >
                  <Send size={12} />
                  Send WhatsApp
                </button>
              )
            }
          ]}
        />
      </div>

      {/* Add Farmer Agri Profile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Sprout className="text-[#0F5132]" size={20} />
                Add Farmer Agri & Crop Profile
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Farmer Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Patel"
                    value={form.farmerName}
                    onChange={(e) => setForm({ ...form, farmerName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">WhatsApp / Mobile Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Village (गाँव)</label>
                  <input
                    type="text"
                    placeholder="e.g. Rampur"
                    value={form.village}
                    onChange={(e) => setForm({ ...form, village: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">District (ज़िला)</label>
                  <input
                    type="text"
                    placeholder="e.g. Indore"
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Farm Size (Acres / एकड़)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    placeholder="e.g. 5"
                    value={form.acreage}
                    onChange={(e) => setForm({ ...form, acreage: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Soil Type (मिट्टी का प्रकार)</label>
                  <select
                    value={form.soilType}
                    onChange={(e) => setForm({ ...form, soilType: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  >
                    <option value="Loamy (दोमट)">Loamy (दोमट)</option>
                    <option value="Black Cotton (काली मिट्टी)">Black Cotton (काली मिट्टी)</option>
                    <option value="Sandy Loam (बलुई दोमट)">Sandy Loam (बलुई दोमट)</option>
                    <option value="Clayey (मटियार)">Clayey (मटियार)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Primary Sown Crop</label>
                  <select
                    value={form.cropName}
                    onChange={(e) => setForm({ ...form, cropName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  >
                    <option value="Wheat (गेहूँ)">Wheat (गेहूँ)</option>
                    <option value="Mustard (सरसों)">Mustard (सरसों)</option>
                    <option value="Gram / Chana (चना)">Gram / Chana (चना)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Sowing Date (बुवाई की तारीख)</label>
                  <input
                    type="date"
                    required
                    value={form.sowingDate}
                    onChange={(e) => setForm({ ...form, sowingDate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0F5132]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#0F5132] hover:bg-[#16653f] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

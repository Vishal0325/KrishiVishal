import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import { 
  Bell, 
  Send, 
  History, 
  X, 
  CheckCircle2, 
  MessageSquare, 
  Info, 
  Target, 
  Calendar,
  Sprout,
  Layers,
  Sparkles,
  Users,
  Download,
  PhoneCall,
  FileSpreadsheet
} from 'lucide-react';
import { formatDateTime } from '../utils/formatters';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { getFarmerAge, getLandSize, getLandUnit, getCropAllocations } from './Customers';
import toast from 'react-hot-toast';

const COMMON_CROPS = [
  { id: 'Dhan', name: 'Dhan (Paddy)', icon: '🌾', category: 'Cereal' },
  { id: 'Phool Gobhi', name: 'Phool Gobhi (Cauliflower)', icon: '🥦', category: 'Vegetable' },
  { id: 'Kaddu', name: 'Kaddu (Pumpkin)', icon: '🎃', category: 'Vegetable' },
  { id: 'Makka', name: 'Makka (Maize)', icon: '🌽', category: 'Cereal' },
  { id: 'Aloo', name: 'Aloo (Potato)', icon: '🥔', category: 'Vegetable' },
  { id: 'Sarson', name: 'Sarson (Mustard)', icon: '🌿', category: 'Oilseed' },
  { id: 'Gehun', name: 'Gehun (Wheat)', icon: '🌾', category: 'Cereal' },
  { id: 'Tamatar', name: 'Tamatar (Tomato)', icon: '🍅', category: 'Vegetable' }
];

const PRESET_TEMPLATES = [
  {
    label: '🌾 Dhan Keetnashak Advisory',
    title: '🌾 Dhan me Teela/Chhedak se Bachav',
    body: 'Dhan ki fasal ko rog aur keedo se bachayein. Abhi top rated Keetnashak mangwayen 20% discount ke sath!',
    targetType: 'CROP',
    crop: 'Dhan'
  },
  {
    label: '🥦 Gobhi Growth & Nutrient',
    title: '🥦 Gobhi ki Paidawar Badhayein',
    body: 'Phool Gobhi ka size aur quality behtar karne ke liye micro-nutrients spray karein. Same-day delivery uplabdh!',
    targetType: 'CROP',
    crop: 'Phool Gobhi'
  },
  {
    label: '🎃 Kaddu / Sabzi Booster',
    title: '🎃 Sabzi Fasal Growth Tonic Offer',
    body: 'Kaddu aur sabzi faslon me fal aur phool badhane ke liye certified growth booster spray karein.',
    targetType: 'CROP',
    crop: 'Kaddu'
  },
  {
    label: '🚜 Khali Khet Beej Alert',
    title: '🚜 Khali Zameen par Nayi Fasal Taiyari',
    body: 'Aapke paas khali khet uplabdh hai! Is mahine certified beej lagayein aur sabse accha munafa kamayein.',
    targetType: 'VACANT_LAND',
    crop: ''
  }
];

const Notifications = () => {
  const [history, setHistory] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Target Filter State
  const [targetMode, setTargetMode] = useState('ALL'); // 'ALL', 'CROP', 'LAND_SIZE', 'VACANT_LAND'
  const [selectedCrop, setSelectedCrop] = useState('Dhan');
  const [landCategory, setLandCategory] = useState('ALL'); // 'MARGINAL' (<10), 'SMALL' (10-30), 'LARGE' (>30)
  
  const [formData, setFormData] = useState({ 
    title: '', 
    body: '', 
    imageUrl: '',
    actionRoute: ''
  });

  // Listen to Broadcast Logs
  useEffect(() => {
    const q = query(collection(db, 'broadcast_notifications'), orderBy('sentAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Listen to Farmers to compute matching target audience
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const farmerUsers = allUsers.filter(u => !u.isAdmin && !['SuperAdmin', 'CatalogManager', 'OrderManager', 'RIDER'].includes(u.role));
      setFarmers(farmerUsers);
    });
    return unsubscribe;
  }, []);

  // Compute Matched Audience based on Filters
  const matchedFarmers = useMemo(() => {
    if (targetMode === 'ALL') {
      return farmers;
    }

    if (targetMode === 'CROP') {
      return farmers.filter(f => {
        const allocations = f.cropAllocations || [];
        return allocations.some(a => 
          (a.cropName || '').toLowerCase().includes(selectedCrop.toLowerCase())
        );
      });
    }

    if (targetMode === 'LAND_SIZE') {
      return farmers.filter(f => {
        const land = Number(f.totalLand || f.farmSize || 0);
        if (landCategory === 'MARGINAL') return land > 0 && land < 10;
        if (landCategory === 'SMALL') return land >= 10 && land <= 30;
        if (landCategory === 'LARGE') return land > 30;
        return true;
      });
    }

    if (targetMode === 'VACANT_LAND') {
      return farmers.filter(f => {
        const total = Number(f.totalLand || f.farmSize || 0);
        const allocations = f.cropAllocations || [];
        const cultivated = allocations
          .filter(a => (a.status || '').toUpperCase() !== 'VACANT')
          .reduce((sum, a) => sum + Number(a.allocatedArea || 0), 0);
        const vacant = Math.max(0, total - cultivated);
        return vacant > 0;
      });
    }

    return farmers;
  }, [farmers, targetMode, selectedCrop, landCategory]);

  const applyTemplate = (tpl) => {
    setFormData(prev => ({ ...prev, title: tpl.title, body: tpl.body }));
    setTargetMode(tpl.targetType);
    if (tpl.crop) setSelectedCrop(tpl.crop);
    toast.success(`Template applied: ${tpl.label}`);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return toast.error('Please enter notification title and message');

    setSending(true);
    try {
      const targetTopicLabel = targetMode === 'ALL' 
        ? 'All Farmers (Broadcast)' 
        : targetMode === 'CROP' 
          ? `Crop Target: ${selectedCrop}`
          : targetMode === 'LAND_SIZE'
            ? `Land Holding: ${landCategory}`
            : 'Farmers with Vacant Land';

      const payload = {
        title: formData.title,
        body: formData.body,
        imageUrl: formData.imageUrl || null,
        targetType: targetMode,
        targetDetail: targetMode === 'CROP' ? selectedCrop : targetMode === 'LAND_SIZE' ? landCategory : 'VACANT',
        topic: targetMode === 'ALL' ? 'all' : `target_${targetMode.toLowerCase()}`,
        targetTopicLabel,
        matchedCount: matchedFarmers.length,
        recipientUserIds: matchedFarmers.map(f => f.id).slice(0, 500),
        sentAt: Timestamp.now(),
        sent: true,
        deliveredCount: matchedFarmers.length
      };

      // 1. Add to Broadcast History Collection
      await addDoc(collection(db, 'broadcast_notifications'), payload);

      // 2. Write in-app notification directly to matched users' notifications subcollection
      if (matchedFarmers.length > 0) {
        const batch = writeBatch(db);
        const sampleLimit = Math.min(matchedFarmers.length, 50);
        for (let i = 0; i < sampleLimit; i++) {
          const farmerId = matchedFarmers[i].id;
          const notifRef = doc(collection(db, 'users', farmerId, 'notifications'));
          batch.set(notifRef, {
            title: formData.title,
            body: formData.body,
            type: 'PROMOTIONAL',
            createdAt: Timestamp.now(),
            isRead: false
          });
        }
        await batch.commit();
      }

      toast.success(`Push notification dispatched to ${matchedFarmers.length} targeted farmers! 🚀`);
      setFormData({ title: '', body: '', imageUrl: '', actionRoute: '' });
    } catch (error) {
      console.error('Failed to send targeted notification:', error);
      toast.error('Failed to dispatch notification: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Export Target Calling List for Tele-callers
  const handleExportCallingList = (format = 'excel') => {
    if (!matchedFarmers || matchedFarmers.length === 0) {
      toast.error('No farmers in the selected audience to export');
      return;
    }

    const targetTopicLabel = targetMode === 'ALL' 
      ? 'All Farmers (Broadcast)' 
      : targetMode === 'CROP' 
        ? `Crop: ${selectedCrop}`
        : targetMode === 'LAND_SIZE'
          ? `Land Bracket: ${landCategory}`
          : 'Vacant / Uncultivated Land';

    const callingSheet = matchedFarmers.map(f => {
      const age = getFarmerAge(f);
      const land = getLandSize(f);
      const unit = getLandUnit(f);
      const crops = getCropAllocations(f);

      const activeCropsList = crops.length > 0
        ? crops.map(cr => cr.name).filter(Boolean).join(', ')
        : 'None';

      const sowingDetails = crops.length > 0
        ? crops
            .filter(cr => cr.sowingMonth && cr.sowingMonth !== '—')
            .map(cr => `${cr.name} (${cr.sowingMonth})`)
            .join('; ') || '—'
        : (f.sowingMonth || '—');

      let vacantArea = 0;
      if (targetMode === 'VACANT_LAND') {
        const total = Number(f.totalLand || f.farmSize || 0);
        const cultivated = (f.cropAllocations || [])
          .filter(a => (a.status || '').toUpperCase() !== 'VACANT')
          .reduce((sum, a) => sum + Number(a.allocatedArea || 0), 0);
        vacantArea = Math.max(0, total - cultivated);
      }

      return {
        'Farmer Name': f.name || 'Anonymous Farmer',
        'Mobile Number': f.phone || f.mobile || '—',
        'Audience Target Segment': targetTopicLabel,
        'Age': age !== null && age !== undefined ? age : '—',
        'Total Land': land > 0 ? `${land} ${unit}` : `0 ${unit}`,
        'Active Crops': activeCropsList,
        'Sowing Details': sowingDetails,
        'Vacant Katha': targetMode === 'VACANT_LAND' ? `${vacantArea} ${unit}` : 'N/A',
        'District': f.district || 'Bihar',
        'State': f.state || 'Bihar',
        'Call Status': 'Pending Call',
        'Tele-Caller Remarks': ''
      };
    });

    const filePrefix = `Target_Calling_List_${targetMode}_${targetMode === 'CROP' ? selectedCrop : targetMode === 'LAND_SIZE' ? landCategory : 'Audience'}`.replace(/\s+/g, '_');

    if (format === 'csv') {
      exportToCSV(callingSheet, filePrefix);
      toast.success(`Exported ${callingSheet.length} calling records to CSV`);
    } else {
      exportToExcel(callingSheet, filePrefix, 'Calling Sheet');
      toast.success(`Exported ${callingSheet.length} calling records to Excel (.xlsx)`);
    }
  };

  const columns = [
    { 
      header: 'Alert Title & Message', 
      render: (n) => (
        <div className="space-y-0.5">
          <span className="font-black text-gray-900 tracking-tight text-xs block">{n.title}</span>
          <span className="text-gray-500 font-medium text-[11px] line-clamp-1">{n.body}</span>
        </div>
      )
    },
    { 
      header: 'Audience Target', 
      render: (n) => (
        <div>
          <span className="bg-emerald-50 text-[#1b5e20] border border-emerald-200/60 px-2 py-0.5 rounded text-[10px] font-black uppercase inline-flex items-center gap-1">
            <Target size={11} /> {n.targetTopicLabel || n.topic || 'All'}
          </span>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{n.matchedCount || n.deliveredCount || 0} Farmers Reach</p>
        </div>
      )
    },
    { 
      header: 'Dispatched At', 
      render: (n) => <span className="text-gray-400 font-bold text-xs">{formatDateTime(n.sentAt)}</span> 
    },
    { 
      header: 'Delivery Status', 
      render: (n) => (
        <span className={`flex items-center space-x-1.5 font-black text-[9px] uppercase tracking-widest ${n.sent ? 'text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200/50' : 'text-orange-500'}`}>
          {n.sent ? <CheckCircle2 size={11} className="text-emerald-600" /> : <div className="w-2.5 h-2.5 border-2 border-orange-500 border-t-transparent animate-spin rounded-full" />}
          <span>{n.sent ? 'Delivered' : 'Queued'}</span>
        </span>
      )
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <PageHeader
        title="CRM Push Notification & Farmer Targeting Center"
        subtitle="Dispatch hyper-targeted agronomy alerts, crop-specific advice, and seasonal offers directly to farmer mobile devices"
        actions={[
          {
            label: `Export Target Calling List (${matchedFarmers.length})`,
            icon: PhoneCall,
            onClick: () => handleExportCallingList('excel'),
            variant: 'outline',
            className: 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-black'
          },
          {
            label: "Calling CSV",
            icon: Download,
            onClick: () => handleExportCallingList('csv'),
            variant: 'secondary',
            className: 'border-gray-200 text-gray-700 hover:bg-gray-100 font-black'
          }
        ]}
      />

      {/* Quick Advisory Presets */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-green-900 p-6 rounded-3xl text-white shadow-xl shadow-green-950/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={18} />
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-100">Quick Advisory & Offer Templates</h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-white/10 px-2.5 py-1 rounded-full">1-Click Auto Fill</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_TEMPLATES.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] group"
            >
              <p className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">{tpl.label}</p>
              <p className="text-[10px] text-emerald-200/80 line-clamp-2 mt-1 font-medium">{tpl.body}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Composition & Target Setup Panel (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-50 text-[#1b5e20] rounded-2xl shadow-inner">
                  <Send size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Compose Alert</h2>
                  <p className="text-[10px] text-gray-400 font-bold">Targeted Push Dispatcher</p>
                </div>
              </div>

              {/* Realtime Reach Counter Badge */}
              <div className="bg-emerald-100/70 border border-emerald-300/80 px-3 py-1.5 rounded-xl text-center">
                <p className="text-[9px] font-black uppercase text-emerald-900 tracking-wider">Live Audience</p>
                <p className="text-sm font-black font-mono text-emerald-950">{matchedFarmers.length} Farmers</p>
              </div>
            </div>

            <form onSubmit={handleSend} className="space-y-6">
              {/* Target Mode Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Target size={12} className="text-[#1b5e20]" /> Select Audience Target
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ALL', label: 'All Farmers', icon: <Users size={12} /> },
                    { id: 'CROP', label: 'By Crop (Fasal)', icon: <Sprout size={12} /> },
                    { id: 'LAND_SIZE', label: 'By Land Size', icon: <Layers size={12} /> },
                    { id: 'VACANT_LAND', label: 'Vacant Land', icon: <Calendar size={12} /> }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTargetMode(mode.id)}
                      className={`py-2.5 px-3 rounded-xl text-[11px] font-black tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
                        targetMode === mode.id
                          ? 'bg-[#1b5e20] text-white border-[#1b5e20] shadow-md shadow-emerald-200'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {mode.icon} {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-Filter: Crop Selection */}
              {targetMode === 'CROP' && (
                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-2.5 animate-in fade-in duration-200">
                  <label className="text-[10px] font-black text-emerald-950 uppercase tracking-widest block">
                    Choose Specific Crop to Target:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_CROPS.map(crop => (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => setSelectedCrop(crop.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 border ${
                          selectedCrop === crop.id
                            ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-100/50'
                        }`}
                      >
                        <span>{crop.icon}</span> {crop.id}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-emerald-800 mt-1">
                    🎯 {matchedFarmers.length} farmers currently have <strong>{selectedCrop}</strong> registered in their farm profile.
                  </p>
                </div>
              )}

              {/* Sub-Filter: Land Size Category */}
              {targetMode === 'LAND_SIZE' && (
                <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200/80 space-y-2.5 animate-in fade-in duration-200">
                  <label className="text-[10px] font-black text-blue-950 uppercase tracking-widest block">
                    Select Land Holding Bracket:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'MARGINAL', label: '< 10 Katha', desc: 'Marginal' },
                      { id: 'SMALL', label: '10–30 Katha', desc: 'Small' },
                      { id: 'LARGE', label: '> 30 Katha', desc: 'Large' }
                    ].map(brk => (
                      <button
                        key={brk.id}
                        type="button"
                        onClick={() => setLandCategory(brk.id)}
                        className={`py-2 px-2 rounded-xl text-center border transition-all ${
                          landCategory === brk.id
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-100/50'
                        }`}
                      >
                        <p className="text-xs font-black">{brk.label}</p>
                        <p className={`text-[9px] font-bold ${landCategory === brk.id ? 'text-blue-100' : 'text-gray-400'}`}>{brk.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-blue-800 mt-1">
                    🎯 {matchedFarmers.length} farmers match the selected land category.
                  </p>
                </div>
              )}

              {/* Sub-Filter: Vacant Land Note */}
              {targetMode === 'VACANT_LAND' && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-bold space-y-1">
                  <p className="font-black flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-600" /> Sowing Recommendation Mode
                  </p>
                  <p className="text-[11px] text-amber-800/90 leading-relaxed">
                    Targeting <strong>{matchedFarmers.length} farmers</strong> who have recorded uncultivated / vacant Katha available for the upcoming season.
                  </p>
                </div>
              )}

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
                  <Info size={12} className="mr-1" /> Alert Title (Headline)
                </label>
                <input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none transition-all font-black text-gray-900 text-xs shadow-inner"
                  placeholder="e.g., 🌾 Dhan Keetnashak 20% Off"
                />
              </div>

              {/* Body Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Notification Message Body
                </label>
                <textarea
                  required
                  rows="4"
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none transition-all font-bold text-gray-800 text-xs leading-relaxed shadow-inner"
                  placeholder="Enter customized Hindi/English advisory message..."
                />
              </div>

              {/* Tele-Calling Export Action Box */}
              <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <PhoneCall size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-emerald-950">Target Calling List</p>
                    <p className="text-[10px] text-emerald-700 font-bold">{matchedFarmers.length} Tele-calling leads ready</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleExportCallingList('excel')}
                    disabled={matchedFarmers.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#1b5e20] hover:bg-[#2e7d32] text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                    title="Download Excel sheet for tele-callers"
                  >
                    <Download size={13} />
                    <span>Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCallingList('csv')}
                    disabled={matchedFarmers.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-100 border border-emerald-200 text-gray-700 rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                    title="Download CSV for tele-callers"
                  >
                    <Download size={13} />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Dispatch Action Button */}
              <button
                type="submit"
                disabled={sending || matchedFarmers.length === 0}
                className="w-full bg-[#1b5e20] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#2e7d32] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : (
                  <Send size={16} />
                )}
                <span>Dispatch Alert to {matchedFarmers.length} Farmers</span>
              </button>
            </form>
          </div>
        </div>

        {/* Dispatch History Panel (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden min-h-[600px] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <History className="text-[#1b5e20]" size={18} />
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">Notification Dispatch Logs</h2>
              </div>
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full uppercase tracking-widest font-mono">
                {history.length} Broadcasts
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <DataTable columns={columns} data={history} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;

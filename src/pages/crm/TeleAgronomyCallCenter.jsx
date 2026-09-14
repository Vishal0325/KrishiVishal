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
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  User,
  Sprout,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  Search,
  MessageSquare,
  Sparkles,
  Layers,
  X,
  FileText,
  ShoppingCart,
  Headphones,
  UserCheck,
  Wheat
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeleAgronomyCallCenter() {
  const { user } = useAuth();
  const [calls, setCalls] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDispositionFilter, setSelectedDispositionFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCallTimer, setActiveCallTimer] = useState(0);
  const [isCalling, setIsCalling] = useState(false);

  // New Call Log Form
  const [form, setForm] = useState({
    farmerName: '',
    phone: '',
    village: '',
    district: '',
    callType: 'INBOUND', // INBOUND | OUTBOUND_FOLLOWUP
    callCategory: 'CROP_DISEASE_DIAGNOSIS', 
    // CROP_DISEASE_DIAGNOSIS | FERTILIZER_DOSAGE | ORDER_TRACKING | NEW_ORDER_BOOKING | COMPLAINT_ESCALATION | MANDI_RATE
    cropName: 'Wheat (गेहूँ)',
    cropStage: 'Tillering Stage (25-35 Days)',
    problemReported: '',
    agronomistPrescription: '',
    recommendedProduct: '',
    callDurationSeconds: 120,
    sentiment: 'SATISFIED', // SATISFIED | NEUTRAL | ESCALATED_ANGRY
    followUpDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    agentName: user?.displayName || user?.email || 'Agri Doctor',
    needsTicket: false
  });

  // Call Timer Effect
  useEffect(() => {
    let interval = null;
    if (isCalling) {
      interval = setInterval(() => {
        setActiveCallTimer(prev => prev + 1);
      }, 1000);
    } else {
      setActiveCallTimer(0);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  // Fetch Call Logs and Farmer Profiles
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(query(collection(db, 'kisan_call_logs'), orderBy('createdAt', 'desc')), (snap) => {
        setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'farmer_crop_profiles'), (snap) => {
        setFarmers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Quick Farmer Search & Auto-Fill
  const handleFarmerPhoneInput = (phoneNumber) => {
    setForm(prev => ({ ...prev, phone: phoneNumber }));
    const matched = farmers.find(f => f.phone?.includes(phoneNumber) || f.phone === phoneNumber);
    if (matched) {
      setForm(prev => ({
        ...prev,
        farmerName: matched.farmerName || '',
        village: matched.village || '',
        district: matched.district || '',
        cropName: matched.cropName || 'Wheat (गेहूँ)'
      }));
      toast.success(`Farmer Profile Loaded: ${matched.farmerName} (${matched.cropName})`);
    }
  };

  // Format Duration mm:ss
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Save Call Log
  const handleSaveCallLog = async (e) => {
    e.preventDefault();
    const callRefNo = `CALL-${Date.now().toString().slice(-6)}`;

    try {
      // 1. Save Call Log
      await addDoc(collection(db, 'kisan_call_logs'), {
        ...form,
        callRefNo,
        createdAt: Timestamp.now(),
        recordedBy: user?.email || 'Agri Doctor'
      });

      // 2. If Ticket requested, generate ticket in support_tickets
      if (form.needsTicket) {
        await addDoc(collection(db, 'support_tickets'), {
          ticketId: `TCK-${Date.now().toString().slice(-6)}`,
          customerName: form.farmerName,
          customerPhone: form.phone,
          subject: `Call Center Ticket: ${form.callCategory.replace(/_/g, ' ')}`,
          description: `Problem: ${form.problemReported} | Prescription: ${form.agronomistPrescription}`,
          priority: form.sentiment === 'ESCALATED_ANGRY' ? 'HIGH' : 'MEDIUM',
          status: 'OPEN',
          category: 'Kisan Call Center',
          createdAt: Timestamp.now()
        });
      }

      toast.success(`Kisan Call Log ${callRefNo} saved successfully!`);
      setIsModalOpen(false);
      setIsCalling(false);
      setForm({
        farmerName: '',
        phone: '',
        village: '',
        district: '',
        callType: 'INBOUND',
        callCategory: 'CROP_DISEASE_DIAGNOSIS',
        cropName: 'Wheat (गेहूँ)',
        cropStage: 'Tillering Stage (25-35 Days)',
        problemReported: '',
        agronomistPrescription: '',
        recommendedProduct: '',
        callDurationSeconds: 120,
        sentiment: 'SATISFIED',
        followUpDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        agentName: user?.displayName || user?.email || 'Agri Doctor',
        needsTicket: false
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save call log.');
    }
  };

  // Send Instant WhatsApp Summary
  const handleSendWhatsAppPrescription = (call) => {
    const cleanPhone = (call.phone || '').replace(/[^0-9]/g, '');
    const msg = `नमस्ते ${call.farmerName} जी! 📞 KrishiVishal किसान कॉल सेंटर पर डॉक्टर परामर्श का सारांश:\n\n🌾 फसल: ${call.cropName}\n⚠️ समस्या: ${call.problemReported || 'फसल परामर्श'}\n📋 डॉक्टर का सुझाव: ${call.agronomistPrescription || 'समय पर सिंचाई व उर्वरक प्रबंधन करें'}\n🛒 अनुशंसित दवा: ${call.recommendedProduct || 'कृषिविशाल एग्री इनपुट'}\n\nघर बैठे दवा मंगाने हेतु क्लिक करें: https://krishivishal.in\nहेल्पलाइन: 1800-123-KRISHI`;
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    toast.success(`WhatsApp prescription opened for ${call.farmerName}!`);
  };

  // Filtered Calls
  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      const matchesSearch =
        (c.farmerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || '').includes(searchTerm) ||
        (c.problemReported || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedDispositionFilter === 'ALL' || c.callCategory === selectedDispositionFilter;
      return matchesSearch && matchesCat;
    });
  }, [calls, searchTerm, selectedDispositionFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0E7490] to-[#155E75] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Headphones size={14} className="text-cyan-200" />
              Tele-Agronomy Helpline & CRM Call Disposition
            </div>
            <h2 className="text-2xl font-black">Kisan Call Center & Tele-Agronomy CRM</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Inbound farmer call logging, instant farmer crop history pop-up, Agri Doctor disease prescriptions, call sentiment tracking, and 1-click WhatsApp advisory summaries.
            </p>
          </div>
          <button
            onClick={() => {
              setIsModalOpen(true);
              setIsCalling(true);
            }}
            className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <PhoneIncoming size={20} />
            Log Live Farmer Call
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Calls Handled</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{calls.length}</h3>
            <div className="h-10 w-10 bg-cyan-50 rounded-xl flex items-center justify-center text-cyan-600 font-bold">
              <PhoneCall size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Logged in CRM database</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Doctor Prescriptions Given</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-emerald-700">
              {calls.filter(c => c.agronomistPrescription).length}
            </h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <Sprout size={20} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-600 mt-2 font-medium">Crop treatments prescribed</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Avg Call Duration (AHT)</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {calls.length > 0 ? formatDuration(Math.round(calls.reduce((a, c) => a + Number(c.callDurationSeconds || 120), 0) / calls.length)) : '0:00'} min
            </h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Average handling time</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Farmer Satisfaction Rate</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-emerald-600">
              {calls.length > 0 ? Math.round((calls.filter(c => c.sentiment === 'SATISFIED').length / calls.length) * 100) : 100}%
            </h3>
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-green-600 mt-2 font-medium">Positive call dispositions</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by farmer name, phone number, or problem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:border-[#0E7490]"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedDispositionFilter}
            onChange={(e) => setSelectedDispositionFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 outline-none cursor-pointer"
          >
            <option value="ALL">All Inquiries (सभी प्रकार)</option>
            <option value="CROP_DISEASE_DIAGNOSIS">Crop Disease (रोग/कीट)</option>
            <option value="FERTILIZER_DOSAGE">Fertilizer Dosage (खाद की मात्रा)</option>
            <option value="ORDER_TRACKING">Order Tracking (आर्डर पूछताछ)</option>
            <option value="NEW_ORDER_BOOKING">Phone Order (फोन पर आर्डर)</option>
            <option value="COMPLAINT_ESCALATION">Escalation (शिकायत)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <Headphones className="text-[#0E7490]" size={18} />
            Helpline Call Logs & Doctor Prescriptions
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {filteredCalls.length} Logs
          </span>
        </div>

        <DataTable
          data={filteredCalls}
          columns={[
            {
              header: 'Call Ref & Type',
              accessor: 'callRefNo',
              render: (row) => (
                <div>
                  <span className="font-mono font-bold text-gray-900 block">{row.callRefNo || 'CALL-001'}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-700">
                    {row.callType === 'INBOUND' ? <PhoneIncoming size={12} /> : <PhoneOutgoing size={12} />}
                    {row.callType}
                  </span>
                </div>
              )
            },
            {
              header: 'Farmer Name & Phone',
              accessor: 'farmerName',
              render: (row) => (
                <div>
                  <span className="font-bold text-gray-900 block">{row.farmerName}</span>
                  <span className="font-mono text-xs text-gray-500">{row.phone} • {row.village || 'Village'}</span>
                </div>
              )
            },
            {
              header: 'Inquiry Category',
              accessor: 'callCategory',
              render: (row) => {
                const labels = {
                  CROP_DISEASE_DIAGNOSIS: 'Crop Disease (कीट/रोग)',
                  FERTILIZER_DOSAGE: 'Fertilizer Dose (खाद मात्रा)',
                  ORDER_TRACKING: 'Order Tracking (डिलीवरी)',
                  NEW_ORDER_BOOKING: 'Phone Order Booking',
                  COMPLAINT_ESCALATION: 'Complaint (शिकायत)'
                };
                return (
                  <span className="px-2.5 py-1 bg-cyan-50 text-cyan-800 rounded-lg text-xs font-bold border border-cyan-200">
                    {labels[row.callCategory] || row.callCategory}
                  </span>
                );
              }
            },
            {
              header: 'Problem & Prescription',
              accessor: 'problemReported',
              render: (row) => (
                <div className="max-w-xs">
                  <p className="text-xs font-bold text-gray-800 line-clamp-1">{row.problemReported || 'Inquiry'}</p>
                  <p className="text-[11px] text-emerald-700 font-semibold line-clamp-1">Rx: {row.agronomistPrescription || 'General guidance'}</p>
                </div>
              )
            },
            {
              header: 'Sentiment',
              accessor: 'sentiment',
              render: (row) => {
                const colors = {
                  SATISFIED: 'bg-green-50 text-green-700 border-green-200',
                  NEUTRAL: 'bg-gray-100 text-gray-700 border-gray-200',
                  ESCALATED_ANGRY: 'bg-rose-50 text-rose-700 border-rose-200'
                };
                return (
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${colors[row.sentiment] || colors.NEUTRAL}`}>
                    {row.sentiment}
                  </span>
                );
              }
            },
            {
              header: 'Action',
              accessor: 'id',
              render: (row) => (
                <button
                  onClick={() => handleSendWhatsAppPrescription(row)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 cursor-pointer"
                >
                  <Send size={12} />
                  Send Rx WhatsApp
                </button>
              )
            }
          ]}
        />
      </div>

      {/* Log Call Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-50 rounded-xl text-cyan-600 animate-pulse">
                  <PhoneIncoming size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Live Farmer Call Disposition</h3>
                  <span className="text-xs font-bold text-emerald-600">⏱️ Call Timer: {formatDuration(activeCallTimer)}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setIsCalling(false);
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCallLog} className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Farmer Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={(e) => handleFarmerPhoneInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Farmer Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Patel"
                    value={form.farmerName}
                    onChange={(e) => setForm({ ...form, farmerName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Village & District</label>
                  <input
                    type="text"
                    placeholder="e.g. Rampur, Indore"
                    value={form.village}
                    onChange={(e) => setForm({ ...form, village: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Inquiry Category</label>
                  <select
                    value={form.callCategory}
                    onChange={(e) => setForm({ ...form, callCategory: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  >
                    <option value="CROP_DISEASE_DIAGNOSIS">Crop Disease (रोग/कीट प्रकोप)</option>
                    <option value="FERTILIZER_DOSAGE">Fertilizer Dose (खाद/दवा की मात्रा)</option>
                    <option value="ORDER_TRACKING">Order Delivery Tracking</option>
                    <option value="NEW_ORDER_BOOKING">Phone Order Booking</option>
                    <option value="COMPLAINT_ESCALATION">Complaint / Refund Issue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Crop (फसल)</label>
                  <select
                    value={form.cropName}
                    onChange={(e) => setForm({ ...form, cropName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  >
                    <option value="Wheat (गेहूँ)">Wheat (गेहूँ)</option>
                    <option value="Mustard (सरसों)">Mustard (सरसों)</option>
                    <option value="Gram / Chana (चना)">Gram / Chana (चना)</option>
                    <option value="Maize (मक्का)">Maize (मक्का)</option>
                    <option value="Paddy (धान)">Paddy (धान)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Crop Stage (फसल की अवस्था)</label>
                  <input
                    type="text"
                    placeholder="e.g. 25-35 Days (Tillering)"
                    value={form.cropStage}
                    onChange={(e) => setForm({ ...form, cropStage: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Farmer Problem / Symptoms (समस्या का विवरण)</label>
                <textarea
                  rows="2"
                  required
                  placeholder="State the disease symptoms reported by farmer (e.g. Yellow rust on wheat leaves)..."
                  value={form.problemReported}
                  onChange={(e) => setForm({ ...form, problemReported: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-medium text-gray-800 outline-none focus:border-[#0E7490]"
                />
              </div>

              <div>
                <label className="block text-emerald-800 mb-1">Agri Doctor Treatment & Prescription (दवा व समाधान)</label>
                <textarea
                  rows="2"
                  placeholder="Doctor prescription (e.g. Spray Propiconazole 25% EC 1ml/L + Urea top-dressing)..."
                  value={form.agronomistPrescription}
                  onChange={(e) => setForm({ ...form, agronomistPrescription: e.target.value })}
                  className="w-full bg-emerald-50/50 border border-emerald-300 rounded-xl p-2.5 font-bold text-gray-900 outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Call Sentiment</label>
                  <select
                    value={form.sentiment}
                    onChange={(e) => setForm({ ...form, sentiment: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  >
                    <option value="SATISFIED">😊 Satisfied (संतुष्ट)</option>
                    <option value="NEUTRAL">😐 Neutral (सामान्य)</option>
                    <option value="ESCALATED_ANGRY">😡 Escalated (नाराज / शिकायत)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    value={form.followUpDate}
                    onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#0E7490]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-cyan-900">
                <input
                  type="checkbox"
                  id="needsTicket"
                  checked={form.needsTicket}
                  onChange={(e) => setForm({ ...form, needsTicket: e.target.checked })}
                  className="rounded text-[#0E7490] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="needsTicket" className="font-bold text-xs cursor-pointer">
                  Auto-create Support Ticket for Field Officer / Depot Manager
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsCalling(false);
                  }}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#0E7490] hover:bg-[#155E75] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Save Call & Prescription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

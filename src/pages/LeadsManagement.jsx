import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import {
  PhoneCall,
  UserCheck,
  Calendar,
  Clock,
  Filter,
  Search,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Building2,
  Sprout,
  RefreshCw,
  PhoneForwarded,
  Share2,
  UserPlus,
  Send
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import toast from 'react-hot-toast';

const HUBS = [
  { id: 'all', name: 'All 55 Regional Hubs' },
  { id: 'HUB-SAM-001', name: 'Samastipur Central Hub (Mother)' },
  { id: 'hub_central_samastipur', name: 'Samastipur Central Hub' },
  { id: 'REG-RAH-002', name: 'Rahika Spoke Hub (Madhubani)' },
  { id: 'REG-KHA-003', name: 'Kalyanpur Spoke Hub' },
  { id: 'REG-TAJ-004', name: 'Tajpur Spoke Hub' }
];

const STATUS_TABS = [
  { id: 'ALL', label: 'All Leads' },
  { id: 'NEW', label: 'New / Uncontacted' },
  { id: 'CALLBACK_REQUESTED', label: 'Callbacks Scheduled' },
  { id: 'INTERESTED', label: 'Interested' },
  { id: 'CONVERTED', label: 'Converted' },
  { id: 'DROPPED', label: 'Dropped' }
];

const DISPOSITION_OPTIONS = [
  { id: 'INTERESTED_ORDER_PLACED', label: 'Order Placed (Converted)' },
  { id: 'CALLBACK_REQUESTED', label: 'Callback Requested by Kisan' },
  { id: 'DOUBT_ON_PRICE_OR_DELIVERY', label: 'Price / Delivery Doubt' },
  { id: 'CROP_ADVISORY_NEEDED', label: 'Agronomist Consultation Needed' },
  { id: 'WRONG_NUMBER_OR_JUNK', label: 'Wrong Number / Not Interested' }
];

export default function LeadsManagement() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState('all');
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Disposition Drawer / Modal State
  const [activeLead, setActiveLead] = useState(null);
  const [statusVal, setStatusVal] = useState('CONTACTED');
  const [dispositionVal, setDispositionVal] = useState('INTERESTED_ORDER_PLACED');
  const [notesVal, setNotesVal] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [savingDisposition, setSavingDisposition] = useState(false);

  // Subscribe to Firestore leads collection in real-time
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setLeads(docs);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching leads:', error);
        toast.error('Failed to load real-time leads');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchHub = selectedHub === 'all' || l.assignedHubId === selectedHub;
      const matchTab = activeTab === 'ALL' || l.status === activeTab;

      const raw = l.rawPayload || {};
      const name = l.customerName || raw.full_name || raw.name || '';
      const phone = l.customerPhone || raw.phone_number || raw.phone || '';
      const crop = l.cropInterest || raw.crop || '';

      const matchSearch =
        searchTerm === '' ||
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        phone.includes(searchTerm) ||
        crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.id.toLowerCase().includes(searchTerm.toLowerCase());

      return matchHub && matchTab && matchSearch;
    });
  }, [leads, selectedHub, activeTab, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = leads.length;
    const newQueue = leads.filter((l) => l.status === 'NEW').length;
    const callbacks = leads.filter((l) => l.status === 'CALLBACK_REQUESTED').length;
    const converted = leads.filter((l) => l.status === 'CONVERTED').length;
    const convRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return {
      total,
      newQueue,
      callbacks,
      converted,
      convRate
    };
  }, [leads]);

  // Open Disposition Modal
  const openDispositionModal = (lead) => {
    setActiveLead(lead);
    setStatusVal(lead.status === 'NEW' ? 'CONTACTED' : lead.status || 'CONTACTED');
    setDispositionVal(lead.telecallerDisposition || 'INTERESTED_ORDER_PLACED');
    setNotesVal(lead.lastNotes || '');
    setCallbackDate(lead.callbackScheduledAt ? lead.callbackScheduledAt.slice(0, 16) : '');
  };

  // Submit Disposition
  const handleSaveDisposition = async (e) => {
    if (e) e.preventDefault();
    if (!activeLead) return;

    try {
      setSavingDisposition(true);
      toast.loading('Updating telecalling disposition...', { id: 'save-disp' });
      const updateFn = httpsCallable(functions, 'updateLeadDisposition');
      await updateFn({
        leadId: activeLead.id,
        status: statusVal,
        disposition: dispositionVal,
        notes: notesVal,
        callbackAt: statusVal === 'CALLBACK_REQUESTED' && callbackDate ? new Date(callbackDate).toISOString() : null
      });

      toast.success(`Lead disposition updated to ${statusVal}!`, { id: 'save-disp' });
      setActiveLead(null);
    } catch (err) {
      console.error('Error saving disposition:', err);
      toast.error(err.message || 'Failed to update disposition', { id: 'save-disp' });
    } finally {
      setSavingDisposition(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Admin Leads & Tele-Calling Tool"
        subtitle="Real-time Meta Ads digital lead ingestion, kisan call center disposition, and automated Spoke Hub routing"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Meta Webhook Live
          </span>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Leads"
          value={metrics.total.toString()}
          icon={<Share2 className="text-blue-500" size={22} />}
          subtext="Meta Ads + App Installs"
        />
        <MetricCard
          title="Uncontacted Queue"
          value={metrics.newQueue.toString()}
          icon={<UserPlus className="text-amber-500" size={22} />}
          subtext="Requires 15m Telecall"
        />
        <MetricCard
          title="Scheduled Callbacks"
          value={metrics.callbacks.toString()}
          icon={<PhoneForwarded className="text-indigo-500" size={22} />}
          subtext="Follow-ups Today"
        />
        <MetricCard
          title="Converted Orders"
          value={metrics.converted.toString()}
          icon={<CheckCircle2 className="text-emerald-500" size={22} />}
          subtext="First Purchase Completed"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${metrics.convRate}%`}
          icon={<TrendingUp className="text-primary" size={22} />}
          subtext="Lead to Order Efficiency"
        />
      </div>

      {/* Filter Bar & Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Hub Selector */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <Building2 size={16} className="text-gray-400" />
              <select
                value={selectedHub}
                onChange={(e) => setSelectedHub(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-700 outline-none"
              >
                {HUBS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search kisan, phone, crop..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold text-xs uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="py-3.5 px-4">Kisan Details</th>
                <th className="py-3.5 px-4">Lead Source</th>
                <th className="py-3.5 px-4">Fasal / Inquiry</th>
                <th className="py-3.5 px-4">Assigned Hub</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Received / Follow-up</th>
                <th className="py-3.5 px-4 text-right">Telecall Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                    Loading digital leads queue...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-400">
                    <PhoneCall className="inline-block mb-2 text-gray-300" size={32} />
                    <p className="font-medium text-gray-600">No leads found for this filter</p>
                    <p className="text-xs text-gray-400 mt-1">
                      New Meta Ads form submissions will appear here automatically via Webhook.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const raw = lead.rawPayload || {};
                  const kisanName = lead.customerName || raw.full_name || raw.name || 'Kisan Lead';
                  const phone = lead.customerPhone || raw.phone_number || raw.phone || '';
                  const crop = lead.cropInterest || raw.crop || 'Paddy / Wheat';
                  const district = lead.district || raw.city || raw.district || 'Samastipur';

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Kisan Details */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-900">{kisanName}</div>
                        <div className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                          <span>{phone || 'No Phone'}</span>
                          <span className="text-gray-300">•</span>
                          <span>{district}</span>
                        </div>
                      </td>

                      {/* Lead Source */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {lead.leadSource || 'META_ADS'}
                        </span>
                        {lead.formId && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                            Form: {lead.formId}
                          </div>
                        )}
                      </td>

                      {/* Crop */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
                          <Sprout size={14} className="text-emerald-600" />
                          {crop}
                        </div>
                        {lead.lastNotes && (
                          <div className="text-[11px] text-gray-400 italic line-clamp-1 mt-0.5">
                            "{lead.lastNotes}"
                          </div>
                        )}
                      </td>

                      {/* Hub */}
                      <td className="py-3.5 px-4 text-xs font-medium text-gray-700">
                        {lead.assignedHubId || 'hub_central_samastipur'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            lead.status === 'NEW'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : lead.status === 'CONVERTED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : lead.status === 'CALLBACK_REQUESTED'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : lead.status === 'INTERESTED'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {lead.status || 'NEW'}
                        </span>
                      </td>

                      {/* Time / Callback */}
                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {lead.callbackScheduledAt ? (
                          <div className="text-blue-600 font-semibold flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(lead.callbackScheduledAt).toLocaleString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        ) : lead.createdAt?.toDate ? (
                          lead.createdAt.toDate().toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric'
                          })
                        ) : (
                          'Recent'
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                          >
                            <PhoneCall size={12} />
                            Call
                          </a>
                        )}
                        <button
                          onClick={() => openDispositionModal(lead)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Disposition
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disposition Modal / Drawer */}
      {activeLead && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Call Disposition & Advisory Notes
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Lead: {activeLead.customerName || activeLead.id} ({activeLead.customerPhone || 'No Phone'})
                </p>
              </div>
              <button
                onClick={() => setActiveLead(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDisposition} className="space-y-4">
              {/* Status Select */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Lead Stage / Status
                </label>
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-primary"
                >
                  <option value="CONTACTED">CONTACTED (Spoke with farmer)</option>
                  <option value="INTERESTED">INTERESTED (Considering order)</option>
                  <option value="CALLBACK_REQUESTED">CALLBACK_REQUESTED (Follow-up scheduled)</option>
                  <option value="CONVERTED">CONVERTED (Order placed on app/call)</option>
                  <option value="DROPPED">DROPPED (Wrong number / Not interested)</option>
                </select>
              </div>

              {/* Disposition Outcome */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Call Outcome / Disposition
                </label>
                <select
                  value={dispositionVal}
                  onChange={(e) => setDispositionVal(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-primary"
                >
                  {DISPOSITION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditional Callback Date Picker */}
              {statusVal === 'CALLBACK_REQUESTED' && (
                <div>
                  <label className="text-xs font-semibold text-blue-600 uppercase flex items-center gap-1">
                    <Clock size={13} />
                    Schedule Follow-up Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={callbackDate}
                    onChange={(e) => setCallbackDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-blue-50/60 border border-blue-200 rounded-xl text-sm outline-none focus:border-primary"
                    required={statusVal === 'CALLBACK_REQUESTED'}
                  />
                </div>
              )}

              {/* Advisory & Call Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Call Notes & Advisory Details
                </label>
                <textarea
                  rows={3}
                  placeholder="E.g., Kisan has 4 acres of Wheat in Tajpur, needs DAP & Zinc advice next week..."
                  value={notesVal}
                  onChange={(e) => setNotesVal(e.target.value)}
                  className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveLead(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDisposition}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50 transition-all"
                >
                  {savingDisposition ? 'Saving Record...' : 'Save Disposition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

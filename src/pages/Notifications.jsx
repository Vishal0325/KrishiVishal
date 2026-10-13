import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { 
  Bell, 
  Send, 
  History, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Info, 
  Target, 
  Sparkles, 
  Users, 
  FlaskConical,
  Smartphone,
  ShieldCheck,
  Ban
} from 'lucide-react';
import { formatDateTime } from '../utils/formatters';
import toast from 'react-hot-toast';

const PRESET_TEMPLATES = [
  {
    label: '🌾 Dhan Rog & Kitnashak Advisory',
    title: '🌾 धान की फसल में कीट रोकथाम',
    body: 'धान की फसल को कीटों से बचाने के लिए प्रमाणित कीटनाशक 20% छूट के साथ आज ही ऑर्डर करें।',
    deepLink: '/product?id=PROD_DAP_50KG'
  },
  {
    label: '🥦 Gobhi & Sabzi Growth Booster',
    title: '🥦 गोभी व सब्जी फल-फूल वर्धक',
    body: 'सब्जियों में अधिक पैदावार के लिए सूक्ष्म पोषक तत्व स्प्रे करें। आज ऑर्डर पर फास्ट डिलीवरी।',
    deepLink: '/product?id=PROD_UREA_45KG'
  },
  {
    label: '⚡ Flash Offer - Free Delivery Today',
    title: '⚡ आज सभी कृषि उत्पादों पर फ्री डिलीवरी',
    body: 'सीमित समय के लिए स्पेशल ऑफर: ऐप खोलें और ₹499+ के ऑर्डर पर पाएं मुफ्त होम डिलीवरी।',
    deepLink: '/order'
  }
];

const Notifications = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({ 
    title: '', 
    body: '', 
    imageUrl: '',
    deepLink: '/product',
    scheduledAt: ''
  });

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  // Preview language switcher
  const [previewLang, setPreviewLang] = useState('hi'); // 'hi' | 'en'

  // Quiet Hours check helper
  const isQuietHoursNow = useMemo(() => {
    const istHours = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
    return istHours >= 22 || istHours < 7;
  }, []);

  // Listen to notification_campaigns collection
  useEffect(() => {
    const q = query(collection(db, 'notification_campaigns'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.warn("notification_campaigns snapshot subscription error:", err.message);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const applyTemplate = (tpl) => {
    setFormData(prev => ({ 
      ...prev, 
      title: tpl.title, 
      body: tpl.body, 
      deepLink: tpl.deepLink || '/product' 
    }));
    toast.success(`Template applied: ${tpl.label}`);
  };

  // 1. Send Test Notification (Caller's own device or safe test_all topic)
  const handleTestSend = async (useTestTopic = false) => {
    if (!formData.title || !formData.body) {
      return toast.error('Please enter title and message body first');
    }

    setTesting(true);
    try {
      const sendTestFn = httpsCallable(functions, 'sendTestNotification');
      const res = await sendTestFn({
        title: formData.title,
        body: formData.body,
        imageUrl: formData.imageUrl || null,
        deepLink: formData.deepLink || null,
        useTestTopic
      });

      if (res.data?.success) {
        toast.success(
          useTestTopic 
            ? 'Test broadcast dispatched safely to topic: test_all' 
            : `Test notification sent to your registered device tokens! (${res.data?.tokenCount || 1} device)`
        );
      }
    } catch (err) {
      console.error("Test send failed:", err);
      toast.error('Test Send Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setTesting(false);
    }
  };

  // 2. Draft Campaign creation
  const handleSaveDraft = async () => {
    if (!formData.title || !formData.body) {
      return toast.error('Please enter title and body');
    }

    setSubmitting(true);
    try {
      const createCampaignFn = httpsCallable(functions, 'createCampaign');
      const res = await createCampaignFn({
        title: formData.title,
        body: formData.body,
        imageUrl: formData.imageUrl || null,
        deepLink: formData.deepLink || null,
        scheduledAt: formData.scheduledAt || null
      });

      if (res.data?.success) {
        toast.success(`Campaign created as ${res.data.status}! ID: ${res.data.campaignId.substring(0, 8)}...`);
        setFormData({ title: '', body: '', imageUrl: '', deepLink: '/product', scheduledAt: '' });
      }
    } catch (err) {
      console.error("Create campaign failed:", err);
      toast.error('Failed to create campaign: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Dispatch Live Broadcast with Confirmation
  const promptBroadcastConfirm = () => {
    if (!formData.title || !formData.body) {
      return toast.error('Please enter title and body for the broadcast');
    }

    if (isQuietHoursNow) {
      toast((t) => (
        <span>
          ⚠️ <b>Quiet Hours Warning (IST 10 PM - 7 AM):</b> Customer notifications sent right now might disturb farmers. Please schedule for morning or confirm override.
        </span>
      ), { duration: 5000 });
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Broadcast to ALL Customers?',
      message: `Are you sure you want to broadcast this message to topic "all_customers"? Every registered customer with notifications enabled will receive this alert immediately.`,
      onConfirm: executeBroadcastImmediately
    });
  };

  const executeBroadcastImmediately = async () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    setSubmitting(true);
    try {
      // Step A: Create the campaign first
      const createCampaignFn = httpsCallable(functions, 'createCampaign');
      const createRes = await createCampaignFn({
        title: formData.title,
        body: formData.body,
        imageUrl: formData.imageUrl || null,
        deepLink: formData.deepLink || null
      });

      const campaignId = createRes.data?.campaignId;
      if (!campaignId) throw new Error("Failed to initialize campaign");

      // Step B: Send the campaign via topic broadcast
      const sendCampaignFn = httpsCallable(functions, 'sendCampaign');
      const sendRes = await sendCampaignFn({
        campaignId,
        overrideQuietHours: isQuietHoursNow
      });

      if (sendRes.data?.success) {
        toast.success('🚀 Broadcast successfully dispatched to topic all_customers!');
        setFormData({ title: '', body: '', imageUrl: '', deepLink: '/product', scheduledAt: '' });
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
      toast.error('Broadcast failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Cancel Scheduled or Pending Campaign
  const handleCancelCampaign = async (campaignId) => {
    setCancellingId(campaignId);
    try {
      const cancelFn = httpsCallable(functions, 'cancelCampaign');
      const res = await cancelFn({ campaignId });
      if (res.data?.success) {
        toast.success('Campaign cancelled successfully');
      }
    } catch (err) {
      toast.error('Failed to cancel campaign: ' + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  // 5. Reset Stuck Campaign (>5 min in SENDING)
  const handleResetStuck = async (campaignId) => {
    setCancellingId(campaignId);
    try {
      const resetFn = httpsCallable(functions, 'resetStuckCampaign');
      const res = await resetFn({ campaignId, newStatus: 'FAILED' });
      if (res.data?.success) {
        toast.success(`Stuck campaign safely marked as FAILED (${res.data?.elapsedMinutes} mins elapsed). You can retry.`);
      }
    } catch (err) {
      toast.error('Failed to reset stuck campaign: ' + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const columns = [
    { 
      header: 'Campaign Title & Message', 
      render: (c) => (
        <div className="space-y-0.5 max-w-sm">
          <div className="flex items-center gap-2">
            <span className="font-black text-gray-900 tracking-tight text-xs block">{c.title}</span>
            {c.deepLink && (
              <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">
                {c.deepLink}
              </span>
            )}
          </div>
          <span className="text-gray-500 font-medium text-[11px] line-clamp-2">{c.body}</span>
        </div>
      )
    },
    { 
      header: 'Audience & Target', 
      render: (c) => (
        <div>
          <span className="bg-emerald-50 text-[#1b5e20] border border-emerald-200/60 px-2 py-0.5 rounded text-[10px] font-black uppercase inline-flex items-center gap-1">
            <Target size={11} /> {c.audience?.topic || 'all_customers'}
          </span>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">Topic Broadcast (All Customers)</p>
        </div>
      )
    },
    { 
      header: 'Created & Scheduled', 
      render: (c) => (
        <div className="space-y-0.5 text-xs text-gray-500">
          <div><span className="font-bold">Created:</span> {formatDateTime(c.createdAt)}</div>
          {c.scheduledAt && (
            <div className="text-amber-600 font-semibold"><span className="font-bold">Scheduled:</span> {formatDateTime(c.scheduledAt)}</div>
          )}
        </div>
      )
    },
    { 
      header: 'Status', 
      render: (c) => {
        const statusColors = {
          COMPLETED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          SENDING: 'text-blue-700 bg-blue-50 border-blue-200',
          SCHEDULED: 'text-amber-700 bg-amber-50 border-amber-200',
          DRAFT: 'text-gray-700 bg-gray-50 border-gray-200',
          FAILED: 'text-red-700 bg-red-50 border-red-200',
          CANCELLED: 'text-gray-400 bg-gray-100 border-gray-200'
        };

        return (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${statusColors[c.status] || 'text-gray-600'}`}>
              {c.status || 'DRAFT'}
            </span>
            {c.status === 'SENDING' && (
              <button
                type="button"
                onClick={() => handleResetStuck(c.id)}
                disabled={cancellingId === c.id}
                className="text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded text-[10px] font-black flex items-center gap-1 border border-amber-200"
                title="Reset stuck sending state to FAILED"
              >
                <span>Reset Stuck</span>
              </button>
            )}
            {(c.status === 'SCHEDULED' || c.status === 'DRAFT') && (
              <button
                type="button"
                onClick={() => handleCancelCampaign(c.id)}
                disabled={cancellingId === c.id}
                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 text-xs flex items-center gap-1"
                title="Cancel Campaign"
              >
                <Ban size={13} />
                <span>Cancel</span>
              </button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <PageHeader
        title="Broadcast Campaign Hub (FCM Topic: all_customers)"
        subtitle="Scale push notifications to all registered farmers via FCM Topic broadcast with idempotency and quiet hours protection"
      />

      {/* Quiet Hours Banner */}
      {isQuietHoursNow && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800 text-xs font-medium">
          <Clock className="text-amber-600 flex-shrink-0" size={18} />
          <div>
            <span className="font-black uppercase tracking-wide">Quiet Hours Active in India (10:00 PM - 07:00 AM IST):</span> Direct customer pushes are restricted during night hours to avoid disturbing farmers. Please save as Draft or schedule for tomorrow morning.
          </div>
        </div>
      )}

      {/* Quick Advisory Presets */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-green-900 p-6 rounded-3xl text-white shadow-xl shadow-green-950/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={18} />
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-100">Broadcast Templates</h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-white/10 px-2.5 py-1 rounded-full">1-Click Fill</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        {/* Composition Form (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-50 text-[#1b5e20] rounded-2xl shadow-inner">
                  <Send size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Compose Broadcast</h2>
                  <p className="text-[10px] text-gray-400 font-bold">FCM Topic: all_customers</p>
                </div>
              </div>

              <div className="bg-emerald-100/70 border border-emerald-300/80 px-3 py-1.5 rounded-xl text-center">
                <p className="text-[9px] font-black uppercase text-emerald-900 tracking-wider">Audience</p>
                <p className="text-xs font-black font-mono text-emerald-950">ALL Registered Customers</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                    <Info size={12} className="mr-1" /> Alert Title (Headline)
                  </label>
                  <span className={`text-[10px] font-mono ${formData.title.length > 65 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    {formData.title.length}/65 chars
                  </span>
                </div>
                <input
                  required
                  maxLength={65}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none font-black text-gray-900 text-xs shadow-inner"
                  placeholder="e.g. 🌾 धान कीट रोकथाम स्पेशल ऑफर"
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Message Body (Hindi / English)
                  </label>
                  <span className={`text-[10px] font-mono ${formData.body.length > 240 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    {formData.body.length}/240 chars
                  </span>
                </div>
                <textarea
                  required
                  rows="3"
                  maxLength={240}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none font-bold text-gray-800 text-xs leading-relaxed shadow-inner"
                  placeholder="Enter customized Hindi/English notification copy..."
                />
              </div>

              {/* Image URL & DeepLink */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Banner Image (HTTPS only)
                  </label>
                  <input
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Deep Link (Allow-list: /product, /order)
                  </label>
                  <select
                    value={formData.deepLink}
                    onChange={(e) => setFormData({ ...formData, deepLink: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  >
                    <option value="/product">/product (Product Catalog)</option>
                    <option value="/product?id=PROD_DAP_50KG">/product?id=PROD_DAP_50KG (DAP Fertilizer)</option>
                    <option value="/product?id=PROD_UREA_45KG">/product?id=PROD_UREA_45KG (Urea)</option>
                    <option value="/order">/order (My Orders)</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleTestSend(false)}
                  disabled={testing || !formData.title || !formData.body}
                  className="flex-1 min-w-[140px] px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="Sends push strictly to your admin registered devices"
                >
                  <FlaskConical size={14} />
                  <span>{testing ? 'Sending...' : 'Test on My Device'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestSend(true)}
                  disabled={testing || !formData.title || !formData.body}
                  className="px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="Sends push to safe test topic: test_all"
                >
                  <span>Test Topic (test_all)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={submitting || !formData.title || !formData.body}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  onClick={promptBroadcastConfirm}
                  disabled={submitting || !formData.title || !formData.body}
                  className="w-full bg-[#1b5e20] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#2e7d32] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>Broadcast to ALL Customers Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Smartphone Notification Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="text-gray-700" size={18} />
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">Live Device Preview</h3>
              </div>

              {/* Language Switcher */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg text-[10px] font-black">
                <button
                  type="button"
                  onClick={() => setPreviewLang('hi')}
                  className={`px-2 py-0.5 rounded ${previewLang === 'hi' ? 'bg-[#1b5e20] text-white' : 'text-gray-600'}`}
                >
                  हिंदी
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLang('en')}
                  className={`px-2 py-0.5 rounded ${previewLang === 'en' ? 'bg-[#1b5e20] text-white' : 'text-gray-600'}`}
                >
                  ENG
                </button>
              </div>
            </div>

            {/* Android Notification Shade Simulator */}
            <div className="bg-gray-900 rounded-2xl p-4 text-white shadow-inner font-sans space-y-3">
              <div className="flex items-center justify-between text-[11px] text-gray-400 border-b border-gray-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center text-[9px] font-black text-white">
                    KV
                  </div>
                  <span className="font-bold text-gray-200">Krishi Vishal</span>
                  <span>•</span>
                  <span>just now</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">krishi_offers_channel</span>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-black text-white leading-tight">
                  {formData.title || (previewLang === 'hi' ? '🌾 धान कीट रोकथाम स्पेशल ऑफर' : '🌾 Paddy Pest Control Special Alert')}
                </p>
                <p className="text-[11px] text-gray-300 leading-snug font-medium">
                  {formData.body || (previewLang === 'hi' ? 'धान की फसल को कीटों से बचाने के लिए प्रमाणित कीटनाशक 20% छूट के साथ आज ही ऑर्डर करें।' : 'Protect your paddy crop from insects. Order certified crop protection with 20% discount today.')}
                </p>
              </div>

              {formData.imageUrl && (
                <div className="mt-2 rounded-xl overflow-hidden border border-gray-800 max-h-36 bg-black">
                  <img src={formData.imageUrl} alt="Banner Preview" className="w-full object-cover" />
                </div>
              )}

              <div className="pt-1 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                <span>Deep link: {formData.deepLink || '/product'}</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck size={12} /> Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign History Logs */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <History className="text-[#1b5e20]" size={18} />
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">Notification Campaigns History</h2>
          </div>
          <span className="text-xs font-bold text-gray-400">{history.length} Total Campaigns</span>
        </div>

        <DataTable
          columns={columns}
          data={history}
          loading={loading}
          emptyMessage="No broadcast campaigns created yet."
        />
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Confirm Broadcast"
        cancelText="Review Again"
      />
    </div>
  );
};

export default Notifications;

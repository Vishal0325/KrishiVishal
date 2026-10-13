import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
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
  Ban,
  UserCheck
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
  const { isSuperAdmin, role } = useAuth();
  const canOverrideQuietHours = isSuperAdmin || role === 'SuperAdmin' || role === 'SUPER_ADMIN';

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingUser, setTestingUser] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({ 
    title: '', 
    body: '', 
    imageUrl: '',
    deepLink: '/product'
  });

  // Direct test user targeting
  const [testUserUid, setTestUserUid] = useState('');

  // Quiet Hours & Override Controls
  const [overrideQuietHours, setOverrideQuietHours] = useState(false);

  // Broadcast Confirmation Modal with 'SEND' type requirement
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [confirmInputText, setConfirmInputText] = useState('');

  // Preview language switcher
  const [previewLang, setPreviewLang] = useState('hi'); // 'hi' | 'en'

  // Quiet Hours check helper (IST 22:00 PM to 07:00 AM)
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

  const formatNotificationError = (err, isTestUser = false) => {
    const code = (err?.code || '').toLowerCase();
    const msg = err?.message || '';
    const lower = msg.toLowerCase();

    if (code.includes('permission-denied') || lower.includes('permission-denied') || lower.includes('allow-list') || lower.includes('not in the test allow-list')) {
      if (isTestUser) {
        return '❌ Ye UID notification_test_users allow-list mein nahi hai / UID is not in the test allow-list';
      }
      return '❌ Unauthorized: Kripya SuperAdmin ya Marketing permissions verify karein.';
    }

    if (code.includes('not-found') || lower.includes('not-found') || lower.includes('no valid fcm token') || lower.includes('no fcm tokens')) {
      return '❌ Is user ke koi FCM tokens nahi mile / No FCM tokens for this user';
    }

    if (code.includes('resource-exhausted') || lower.includes('resource-exhausted') || lower.includes('rate limit')) {
      return '⏳ Hourly test rate limit poori ho gayi (Max 30/hr). Kripya thodi der baad prayas karein.';
    }

    if (code.includes('failed-precondition') || lower.includes('failed-precondition')) {
      // Server ka asli message dikhao (quiet hours/state errors), generic error nahi
      return `⚠️ ${msg}`;
    }

    return msg || 'An unexpected error occurred.';
  };

  // 1a. Send Test Notification (Caller's own device or safe test_all topic)
  const handleTestSend = async (useTestTopic = false) => {
    if (!formData.title || !formData.body) {
      return toast.error('Pehle Title aur Message Body enter karein / Please enter title and body first');
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
      toast.error(formatNotificationError(err, false));
    } finally {
      setTesting(false);
    }
  };

  // 1b. Test on Specific Tester UID (Task D direct user targeting)
  const handleTestOnUser = async () => {
    if (!formData.title || !formData.body) {
      return toast.error('Pehle Title aur Message Body enter karein / Please enter title and body first');
    }
    if (!testUserUid || !testUserUid.trim()) {
      return toast.error('Target tester UID enter karein / Please enter target tester UID');
    }

    setTestingUser(true);
    try {
      const sendTestFn = httpsCallable(functions, 'sendTestNotification');
      const res = await sendTestFn({
        title: formData.title,
        body: formData.body,
        imageUrl: formData.imageUrl || null,
        deepLink: formData.deepLink || null,
        testUserUid: testUserUid.trim()
      });

      if (res.data?.success) {
        toast.success(
          `✅ Test notification safalta se bheja gaya! (${res.data.tokensAttempted} tokens targeted, ${res.data.successCount} delivered)`
        );
      }
    } catch (err) {
      console.error("Test user send failed:", err);
      toast.error(formatNotificationError(err, true));
    } finally {
      setTestingUser(false);
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
        deepLink: formData.deepLink || null
      });

      if (res.data?.success) {
        toast.success(`Campaign created as ${res.data.status}! ID: ${res.data.campaignId.substring(0, 8)}...`);
        setFormData({ title: '', body: '', imageUrl: '', deepLink: '/product' });
      }
    } catch (err) {
      console.error("Create campaign failed:", err);
      toast.error('Failed to create campaign: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Dispatch Live Broadcast with 'SEND' confirmation
  const promptBroadcastConfirm = () => {
    if (!formData.title || !formData.body) {
      return toast.error('Please enter title and body for the broadcast');
    }

    if (isQuietHoursNow && !overrideQuietHours && !canOverrideQuietHours) {
      return toast.error('🌙 Quiet Hours Active (10:00 PM - 07:00 AM IST): Push broadcasting is restricted for Marketing role.');
    }

    setConfirmInputText('');
    setBroadcastModalOpen(true);
  };

  const executeBroadcastImmediately = async () => {
    if (confirmInputText.trim().toUpperCase() !== 'SEND') {
      return toast.error('Please type SEND to confirm');
    }

    setBroadcastModalOpen(false);
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
        overrideQuietHours: isQuietHoursNow && canOverrideQuietHours && overrideQuietHours
      });

      if (sendRes.data?.success) {
        toast.success('🚀 Broadcast successfully dispatched to topic all_customers!');
        setFormData({ title: '', body: '', imageUrl: '', deepLink: '/product' });
        setConfirmInputText('');
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
      toast.error('Broadcast failed: ' + formatNotificationError(err, false));
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
      toast.error('Failed to cancel campaign: ' + formatNotificationError(err, false));
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
        toast.success(`Stuck campaign marked as FAILED (${res.data?.elapsedMinutes} mins elapsed).`, { duration: 5000 });
        if (res.data?.warning) {
          toast(res.data.warning, {
            icon: '⚠️',
            duration: 9000,
            style: {
              background: '#fffbeb',
              color: '#92400e',
              border: '1px solid #fde68a',
              fontSize: '12px',
              fontWeight: '600'
            }
          });
        }
      }
    } catch (err) {
      toast.error('Failed to reset stuck campaign: ' + formatNotificationError(err, false));
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
          {c.quietHoursOverridden && (
            <span className="inline-block mt-1 text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">
              ⚡ Quiet Hours Overridden
            </span>
          )}
        </div>
      )
    },
    { 
      header: 'Created & Timing', 
      render: (c) => (
        <div className="space-y-0.5 text-xs text-gray-500">
          <div><span className="font-bold">Created:</span> {formatDateTime(c.createdAt)}</div>
          {c.completedAt && (
            <div className="text-emerald-700 font-semibold"><span className="font-bold">Completed:</span> {formatDateTime(c.completedAt)}</div>
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
            {(c.status === 'DRAFT') && (
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

      {/* Quiet Hours Alert Banner */}
      {isQuietHoursNow && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 text-xs">
          <div className="flex items-center gap-3">
            <Clock className="text-amber-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-black uppercase tracking-wide">
                Quiet Hours Active in India (10:00 PM - 07:00 AM IST)
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Farmers ko disturb karne se bachne ke liye push broadcasting restricted hai.
                {!canOverrideQuietHours && " Marketing managers subah 7:00 AM ke baad bhej sakte hain ya Draft save karein."}
              </p>
            </div>
          </div>

          {canOverrideQuietHours ? (
            <label className="flex items-center gap-2 bg-amber-100/70 border border-amber-300/80 px-3.5 py-2 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors flex-shrink-0">
              <input
                type="checkbox"
                checked={overrideQuietHours}
                onChange={(e) => setOverrideQuietHours(e.target.checked)}
                className="w-4 h-4 text-emerald-700 rounded border-amber-400 focus:ring-emerald-600"
              />
              <span className="font-black text-amber-950 text-[11px]">
                Override Quiet Hours (SuperAdmin Emergency)
              </span>
            </label>
          ) : (
            <span className="text-[10px] bg-amber-200/60 text-amber-900 px-2 py-1 rounded-md font-bold uppercase">
              Marketing Role (No Override)
            </span>
          )}
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

              {/* Staging & Direct Test Options */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center gap-2">
                  <FlaskConical size={14} className="text-emerald-700" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-700">Pre-Broadcast Testing Tools</span>
                </div>

                {/* Test on User UID Input */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={testUserUid}
                    onChange={(e) => setTestUserUid(e.target.value)}
                    placeholder="Target Tester UID (e.g. 0Qdt0MYazN...)"
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={handleTestOnUser}
                    disabled={testingUser || !formData.title || !formData.body || !testUserUid.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <UserCheck size={13} />
                    <span>{testingUser ? 'Sending...' : 'Test on User Device'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleTestSend(false)}
                    disabled={testing || !formData.title || !formData.body}
                    className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Smartphone size={13} />
                    <span>{testing ? 'Sending...' : 'Test on My Device'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestSend(true)}
                    disabled={testing || !formData.title || !formData.body}
                    className="px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Target size={13} />
                    <span>Test Topic (test_all)</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={submitting || !formData.title || !formData.body}
                  className="px-5 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  onClick={promptBroadcastConfirm}
                  disabled={submitting || !formData.title || !formData.body || (isQuietHoursNow && !overrideQuietHours && !canOverrideQuietHours)}
                  className="flex-1 bg-[#1b5e20] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#2e7d32] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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

      {/* Broadcast Modal with 'SEND' confirmation requirement */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border border-gray-100">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center bg-red-50 text-red-600">
                <AlertCircle size={30} />
              </div>

              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                Broadcast to ALL Customers?
              </h2>

              <div className="text-left bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 space-y-1.5 text-xs text-amber-950">
                <p className="font-bold">⚠️ Critical Action Warning:</p>
                <p className="text-[11px] leading-relaxed">
                  Ye push notification topic <b>all_customers</b> par turant deliver hoga. Sabhi customers jinka app notification on hai, unhe alert milega. Ise cancel ya undo nahi kiya ja sakta.
                </p>
                {isQuietHoursNow && overrideQuietHours && (
                  <p className="text-[11px] font-bold text-red-700 pt-1 border-t border-amber-200">
                    ⚡ SuperAdmin Quiet Hours Override enable hai! Push raat ke samay bhej di jayegi.
                  </p>
                )}
              </div>

              <div className="text-left space-y-2 pt-2">
                <label className="text-[11px] font-black text-gray-700 block">
                  Confirm karne ke liye <span className="text-red-600 font-mono font-bold">SEND</span> type karein:
                </label>
                <input
                  type="text"
                  value={confirmInputText}
                  onChange={(e) => setConfirmInputText(e.target.value)}
                  placeholder="Type SEND to confirm"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-mono font-black text-xs text-center uppercase tracking-widest focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex p-4 gap-3 bg-gray-50/70 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="flex-1 px-5 py-3 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition-all"
              >
                Review Again
              </button>

              <button
                type="button"
                onClick={executeBroadcastImmediately}
                disabled={confirmInputText.trim().toUpperCase() !== 'SEND' || submitting}
                className="flex-1 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Broadcasting...' : 'Confirm & Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;

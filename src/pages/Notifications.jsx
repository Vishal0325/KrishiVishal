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
  Calendar,
  Info, 
  Target, 
  Sparkles, 
  Users, 
  FlaskConical,
  Smartphone,
  ShieldCheck,
  Ban,
  UserCheck,
  Wheat,
  MapPin,
  ShoppingBag,
  UserX,
  RefreshCw,
  BarChart3,
  MousePointerClick,
  TrendingUp,
  IndianRupee,
  Trophy,
  Sliders,
  GitCompare
} from 'lucide-react';
import { formatDateTime } from '../utils/formatters';
import toast from 'react-hot-toast';

const POPULAR_CROPS = [
  { value: 'धान (Paddy)', label: '🌾 धान (Paddy)', topic: 'crop_paddy' },
  { value: 'गेहूं (Wheat)', label: '🌾 गेहूं (Wheat)', topic: 'crop_wheat' },
  { value: 'मक्का (Maize)', label: '🌽 मक्का (Maize)', topic: 'crop_maize' },
  { value: 'आलू (Potato)', label: '🥔 आलू (Potato)', topic: 'crop_potato' },
  { value: 'फूलगोभी (Gobhi)', label: '🥦 फूलगोभी (Gobhi)', topic: 'crop_gobhi' },
  { value: 'कद्दू (Kaddu)', label: '🎃 कद्दू (Kaddu)', topic: 'crop_kaddu' },
  { value: 'सरसों (Sarson)', label: '🌼 सरसों (Sarson)', topic: 'crop_sarson' },
  { value: 'टमाटर (Tomato)', label: '🍅 टमाटर (Tomato)', topic: 'crop_tomato' },
  { value: 'प्याज (Onion)', label: '🧅 प्याज (Onion)', topic: 'crop_onion' },
  { value: 'CUSTOM', label: '✏️ Other / Custom Crop', topic: '' }
];

const PRESET_TEMPLATES = [
  {
    label: '🛒 Abandoned Cart Recovery (छूटा हुआ कार्ट)',
    title: '🛒 आपके कार्ट में उत्पाद छूट गए हैं!',
    body: 'धान व फसल सुरक्षा के उत्पाद आपके कार्ट में सुरक्षित हैं। आज ही ऑर्डर पूरा करें और पाएं स्पेशल डिस्काउंट!',
    deepLink: '/cart'
  },
  {
    label: '💤 Inactive Farmers Re-engagement',
    title: '🌱 कृषि विशाल पर नए फसल उत्पाद आ चुके हैं!',
    body: 'मौसम के अनुसार प्रमाणित बीज, खाद और कीटनाशक पर स्पेशल छूट उपलब्ध है। आज ही ऐप खोलें और चेक करें!',
    deepLink: '/product'
  },
  {
    label: '🍄 Amistar Fungicide (Syngenta)',
    title: '🍄 अमिस्टार फफूंदनाशक पर विशेष छूट',
    body: 'धान व सब्जियों को फफूंद रोगों से बचाने के लिए सिंजेंटा अमिस्टार 20% छूट के साथ आज ही ऑर्डर करें।',
    deepLink: '/product?id=CzAzFSJcsAvCAYApgYGD',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/krishivishal-a9ed7.firebasestorage.app/o/products%2F1789894165988_amistar.jpg?alt=media&token=c0323ee4-8f56-4b04-b4d1-331dc4487685'
  },
  {
    label: '🌾 Dhan Rog & Kitnashak Advisory',
    title: '🌾 धान की फसल में कीट रोकथाम',
    body: 'धान की फसल को कीटों से बचाने के लिए प्रमाणित कीटनाशक 20% छूट के साथ आज ही ऑर्डर करें।',
    deepLink: '/product?id=CzAzFSJcsAvCAYApgYGD',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/krishivishal-a9ed7.firebasestorage.app/o/products%2F1789894165988_amistar.jpg?alt=media&token=c0323ee4-8f56-4b04-b4d1-331dc4487685'
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

  // A/B Testing State (Feature 4)
  const [isAbTest, setIsAbTest] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50); // Variant A percentage (10 to 90)
  const [activeVariantTab, setActiveVariantTab] = useState('A'); // 'A' | 'B'
  const [variantA, setVariantA] = useState({
    title: '',
    body: '',
    imageUrl: '',
    deepLink: '/product'
  });
  const [variantB, setVariantB] = useState({
    title: '',
    body: '',
    imageUrl: '',
    deepLink: '/product'
  });
  const [previewVariant, setPreviewVariant] = useState('A'); // 'A' | 'B'
  const [testVariant, setTestVariant] = useState('A'); // 'A' | 'B'

  // Helper to get active editable variant
  const currentVariantData = isAbTest
    ? (activeVariantTab === 'A' ? variantA : variantB)
    : formData;

  const updateCurrentVariantField = (field, value) => {
    if (isAbTest) {
      if (activeVariantTab === 'A') {
        setVariantA(prev => ({ ...prev, [field]: value }));
        setFormData(prev => ({ ...prev, [field]: value }));
      } else {
        setVariantB(prev => ({ ...prev, [field]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
      setVariantA(prev => ({ ...prev, [field]: value }));
    }
  };

  const validateNotificationContent = () => {
    if (isAbTest) {
      if (!variantA.title?.trim() || !variantA.body?.trim()) {
        toast.error('Variant A (Control) ka Title aur Body enter karein / Please enter Variant A title & body');
        setActiveVariantTab('A');
        setPreviewVariant('A');
        return false;
      }
      if (!variantB.title?.trim() || !variantB.body?.trim()) {
        toast.error('Variant B (Challenger) ka Title aur Body enter karein / Please enter Variant B title & body');
        setActiveVariantTab('B');
        setPreviewVariant('B');
        return false;
      }
      if (splitRatio < 10 || splitRatio > 90) {
        toast.error('Split ratio 10% se 90% ke beech hona chahiye');
        return false;
      }
    } else {
      if (!formData.title?.trim() || !formData.body?.trim()) {
        toast.error('Pehle Title aur Message Body enter karein / Please enter title and body first');
        return false;
      }
    }
    return true;
  };

  const getCampaignPayload = () => {
    const base = {
      title: isAbTest ? variantA.title.trim() : formData.title.trim(),
      body: isAbTest ? variantA.body.trim() : formData.body.trim(),
      imageUrl: (isAbTest ? variantA.imageUrl?.trim() : formData.imageUrl?.trim()) || null,
      deepLink: (isAbTest ? variantA.deepLink?.trim() : formData.deepLink?.trim()) || '/product',
      audience: getAudiencePayload(),
      isAbTest: Boolean(isAbTest),
      splitRatio: isAbTest ? Number(splitRatio) : 50
    };

    if (isAbTest) {
      base.variantA = {
        title: variantA.title.trim(),
        body: variantA.body.trim(),
        imageUrl: variantA.imageUrl?.trim() || null,
        deepLink: variantA.deepLink?.trim() || '/product'
      };
      base.variantB = {
        title: variantB.title.trim(),
        body: variantB.body.trim(),
        imageUrl: variantB.imageUrl?.trim() || null,
        deepLink: variantB.deepLink?.trim() || '/product'
      };
    }

    return base;
  };

  const resetCampaignForm = () => {
    setFormData({ title: '', body: '', imageUrl: '', deepLink: '/product' });
    setVariantA({ title: '', body: '', imageUrl: '', deepLink: '/product' });
    setVariantB({ title: '', body: '', imageUrl: '', deepLink: '/product' });
    setIsAbTest(false);
    setSplitRatio(50);
    setActiveVariantTab('A');
    setPreviewVariant('A');
    setIsScheduled(false);
    setScheduledDateTime('');
  };

  // Scheduling State
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Real Firestore Master Data for Crops & Pincodes
  const [realCrops, setRealCrops] = useState([]);
  const [loadingCrops, setLoadingCrops] = useState(true);
  const [realPincodes, setRealPincodes] = useState([]);
  const [loadingPincodes, setLoadingPincodes] = useState(true);

  // Audience Targeting State: 'ALL' | 'CROP' | 'PINCODE' | 'SEGMENT'
  const [audienceType, setAudienceType] = useState('ALL');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [customCrop, setCustomCrop] = useState('');
  const [targetPincode, setTargetPincode] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('ABANDONED_CART'); // 'ABANDONED_CART' | 'INACTIVE_30D'
  const [segmentCounts, setSegmentCounts] = useState({ abandonedCartCount: 0, inactive30dCount: 0, loading: true });
  const [syncingSegments, setSyncingSegments] = useState(false);

  const fetchSegmentCounts = async () => {
    try {
      const getCountsFn = httpsCallable(functions, 'getSegmentCounts');
      const res = await getCountsFn();
      if (res.data?.success) {
        setSegmentCounts({
          abandonedCartCount: res.data.abandonedCartCount || 0,
          inactive30dCount: res.data.inactive30dCount || 0,
          loading: false
        });
      }
    } catch (err) {
      console.warn("Could not fetch segment counts:", err.message);
      setSegmentCounts(prev => ({ ...prev, loading: false }));
    }
  };

  const handleSyncSegments = async () => {
    setSyncingSegments(true);
    try {
      const syncFn = httpsCallable(functions, 'syncCustomerSegmentsNow');
      const res = await syncFn();
      if (res.data?.success) {
        toast.success(`Segments synced! Subscribed: ${res.data.abandonedCart?.subscribed || 0} cart, ${res.data.inactive30d?.subscribed || 0} inactive`);
        fetchSegmentCounts();
      }
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncingSegments(false);
    }
  };

  const getAudiencePayload = () => {
    if (audienceType === 'CROP') {
      const cropVal = selectedCrop === 'CUSTOM' ? customCrop.trim() : selectedCrop;
      return { type: 'CROP', crop: cropVal };
    }
    if (audienceType === 'PINCODE') {
      return { type: 'PINCODE', pincode: targetPincode.trim() };
    }
    if (audienceType === 'SEGMENT') {
      return { type: 'SEGMENT', segment: selectedSegment };
    }
    return { type: 'ALL' };
  };

  const getTargetTopic = () => {
    if (audienceType === 'CROP') {
      const cropVal = selectedCrop === 'CUSTOM' ? customCrop.trim() : selectedCrop;
      const clean = (cropVal || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
      return clean ? `crop_${clean}` : 'crop_...';
    }
    if (audienceType === 'PINCODE') {
      return targetPincode.trim() ? `pin_${targetPincode.trim()}` : 'pin_...';
    }
    if (audienceType === 'SEGMENT') {
      return selectedSegment === 'ABANDONED_CART' ? 'segment_abandoned_cart' : 'segment_inactive_30d';
    }
    return 'all_customers';
  };

  const getAudienceDescription = () => {
    if (audienceType === 'CROP') {
      const cropVal = selectedCrop === 'CUSTOM' ? (customCrop.trim() || 'Custom') : selectedCrop;
      return `Targeted to Farmers growing ${cropVal}`;
    }
    if (audienceType === 'PINCODE') {
      return `Targeted to Farmers in Pincode ${targetPincode.trim() || '...'}`;
    }
    if (audienceType === 'SEGMENT') {
      return selectedSegment === 'ABANDONED_CART'
        ? `Targeted to Farmers with pending items in cart (${segmentCounts.abandonedCartCount} users)`
        : `Targeted to Farmers inactive for 30+ days (${segmentCounts.inactive30dCount} users)`;
    }
    return 'ALL Registered Customers';
  };

  const validateAudience = () => {
    if (audienceType === 'CROP') {
      const cropVal = selectedCrop === 'CUSTOM' ? customCrop.trim() : selectedCrop;
      if (!cropVal) {
        toast.error('Kripya target crop ka naam chunein ya enter karein / Please select or enter a crop');
        return false;
      }
    } else if (audienceType === 'PINCODE') {
      const pin = targetPincode.trim();
      if (!/^[1-9][0-9]{5}$/.test(pin)) {
        toast.error('Kripya valid 6-digit Indian pincode enter karein (e.g. 844101)');
        return false;
      }
    } else if (audienceType === 'SEGMENT') {
      if (!selectedSegment) {
        toast.error('Kripya target user segment select karein / Please select user segment');
        return false;
      }
    }
    return true;
  };

  // Direct test user targeting
  const [testUserUid, setTestUserUid] = useState('');

  // Quiet Hours & Override Controls
  const [overrideQuietHours, setOverrideQuietHours] = useState(false);

  // Broadcast Confirmation Modal with 'SEND' type requirement
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [confirmInputText, setConfirmInputText] = useState('');

  // Campaign Analytics Modal State (Feature 3)
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [selectedCampaignForAnalytics, setSelectedCampaignForAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  const openCampaignAnalytics = async (campaign) => {
    setSelectedCampaignForAnalytics(campaign);
    setAnalyticsModalOpen(true);
    setLoadingAnalytics(true);
    setAnalyticsData(null);
    try {
      const getAnalyticsFn = httpsCallable(functions, 'getCampaignAnalytics');
      const res = await getAnalyticsFn({ campaignId: campaign.id });
      if (res.data?.success) {
        setAnalyticsData(res.data);
      }
    } catch (err) {
      console.warn("Failed to load deep analytics, falling back to local doc stats:", err.message);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Preview language switcher
  const [previewLang, setPreviewLang] = useState('hi'); // 'hi' | 'en'

  // Quiet Hours check helper (IST 22:00 PM to 07:00 AM)
  const isQuietHoursNow = useMemo(() => {
    const istHours = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
    return istHours >= 22 || istHours < 7;
  }, []);

  // Check if chosen scheduled time falls into IST Quiet Hours (22:00 PM to 07:00 AM)
  const isScheduledTimeInQuietHours = useMemo(() => {
    if (!scheduledDateTime) return false;
    const schedDate = new Date(scheduledDateTime);
    if (isNaN(schedDate.getTime())) return false;
    const istHours = new Date(schedDate.getTime() + 5.5 * 3600 * 1000).getUTCHours();
    return istHours >= 22 || istHours < 7;
  }, [scheduledDateTime]);

  const getMinScheduledDateTime = () => {
    const d = new Date(Date.now() + 2 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const setSchedulePreset = (offsetMinutes) => {
    const target = new Date(Date.now() + offsetMinutes * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
    setScheduledDateTime(formatted);
    setIsScheduled(true);
  };

  const setScheduleTomorrowMorning = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:00`;
    setScheduledDateTime(formatted);
    setIsScheduled(true);
  };

  const setScheduleTomorrowEvening = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T17:00`;
    setScheduledDateTime(formatted);
    setIsScheduled(true);
  };

  // Fetch live segment counts on mount
  useEffect(() => {
    fetchSegmentCounts();
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

  const overallMetrics = useMemo(() => {
    let completedCampaigns = 0;
    let totalClicks = 0;
    let totalUniqueClicks = 0;
    let totalOrders = 0;
    let totalRevenue = 0;

    history.forEach(c => {
      if (c.status === 'COMPLETED') completedCampaigns++;
      const s = c.stats || {};
      totalClicks += Number(s.clicks) || 0;
      totalUniqueClicks += Number(s.uniqueClicks) || 0;
      totalOrders += Number(s.conversions) || 0;
      totalRevenue += Number(s.revenue) || 0;
    });

    const conversionRate = totalUniqueClicks > 0
      ? Math.round((totalOrders / totalUniqueClicks) * 1000) / 10
      : 0;

    return {
      completedCampaigns,
      totalClicks,
      totalUniqueClicks,
      totalOrders,
      totalRevenue,
      conversionRate
    };
  }, [history]);

  // Listen to real crops in Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'crops'), (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, name: (doc.data().name || doc.id).trim(), isActive: doc.data().isActive !== false }))
        .filter(c => c.isActive && c.name);
      setRealCrops(list);
      setLoadingCrops(false);
      setSelectedCrop(prev => {
        if (!prev && list.length > 0) return list[0].name;
        return prev;
      });
    }, (err) => {
      console.warn("notification_campaigns: crops subscription error:", err.message);
      setLoadingCrops(false);
    });
    return unsub;
  }, []);

  // Listen to real operational warehouses to populate real serviceable pincodes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      const pinMap = new Map();
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        const pin = (d.pincode ? String(d.pincode) : '').trim();
        if (pin && /^[1-9][0-9]{5}$/.test(pin)) {
          if (!pinMap.has(pin)) {
            pinMap.set(pin, {
              pincode: pin,
              name: d.name || d.hubName || `Hub ${pin}`,
              district: d.district || 'Samastipur'
            });
          }
        }
      });
      const list = Array.from(pinMap.values());
      setRealPincodes(list);
      setLoadingPincodes(false);
      setTargetPincode(prev => {
        if (!prev && list.length > 0) return list[0].pincode;
        return prev;
      });
    }, (err) => {
      console.warn("notification_campaigns: warehouses subscription error:", err.message);
      setLoadingPincodes(false);
    });
    return unsub;
  }, []);

  const applyTemplate = (tpl) => {
    if (isAbTest) {
      if (activeVariantTab === 'B') {
        setVariantB(prev => ({
          ...prev,
          title: tpl.title,
          body: tpl.body,
          deepLink: tpl.deepLink || '/product',
          imageUrl: tpl.imageUrl || ''
        }));
        toast.success(`Template applied to Variant B: ${tpl.label}`);
        return;
      }
      setVariantA(prev => ({
        ...prev,
        title: tpl.title,
        body: tpl.body,
        deepLink: tpl.deepLink || '/product',
        imageUrl: tpl.imageUrl || ''
      }));
    }
    setFormData(prev => ({ 
      ...prev, 
      title: tpl.title, 
      body: tpl.body, 
      deepLink: tpl.deepLink || '/product',
      imageUrl: tpl.imageUrl || ''
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
    const targetData = isAbTest
      ? (testVariant === 'B' ? variantB : variantA)
      : formData;

    if (!targetData.title?.trim() || !targetData.body?.trim()) {
      return toast.error(`Pehle ${isAbTest ? `Variant ${testVariant} ka ` : ''}Title aur Message Body enter karein`);
    }

    setTesting(true);
    try {
      const sendTestFn = httpsCallable(functions, 'sendTestNotification');
      const res = await sendTestFn({
        title: targetData.title.trim(),
        body: targetData.body.trim(),
        imageUrl: targetData.imageUrl?.trim() || null,
        deepLink: targetData.deepLink?.trim() || '/product',
        useTestTopic,
        testVariant: isAbTest ? testVariant : undefined,
        variantA: isAbTest ? variantA : undefined,
        variantB: isAbTest ? variantB : undefined
      });

      if (res.data?.success) {
        toast.success(
          useTestTopic 
            ? `Test broadcast dispatched safely to topic: test_all ${isAbTest ? `(Variant ${testVariant})` : ''}` 
            : `Test notification sent to your registered device tokens! (${res.data?.tokenCount || 1} device) ${isAbTest ? `[Variant ${testVariant}]` : ''}`
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
    const targetData = isAbTest
      ? (testVariant === 'B' ? variantB : variantA)
      : formData;

    if (!targetData.title?.trim() || !targetData.body?.trim()) {
      return toast.error(`Pehle ${isAbTest ? `Variant ${testVariant} ka ` : ''}Title aur Message Body enter karein`);
    }
    if (!testUserUid || !testUserUid.trim()) {
      return toast.error('Target tester UID enter karein / Please enter target tester UID');
    }

    setTestingUser(true);
    try {
      const sendTestFn = httpsCallable(functions, 'sendTestNotification');
      const res = await sendTestFn({
        title: targetData.title.trim(),
        body: targetData.body.trim(),
        imageUrl: targetData.imageUrl?.trim() || null,
        deepLink: targetData.deepLink?.trim() || '/product',
        testUserUid: testUserUid.trim(),
        testVariant: isAbTest ? testVariant : undefined,
        variantA: isAbTest ? variantA : undefined,
        variantB: isAbTest ? variantB : undefined
      });

      if (res.data?.success) {
        toast.success(
          `✅ Test notification safalta se bheja gaya! (${res.data.tokensAttempted} tokens targeted, ${res.data.successCount} delivered) ${isAbTest ? `[Variant ${testVariant}]` : ''}`
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
    if (!validateNotificationContent()) return;
    if (!validateAudience()) return;

    setSubmitting(true);
    try {
      const createCampaignFn = httpsCallable(functions, 'createCampaign');
      const res = await createCampaignFn(getCampaignPayload());

      if (res.data?.success) {
        toast.success(`Campaign created as ${res.data.status}! ID: ${res.data.campaignId.substring(0, 8)}... ${isAbTest ? '(A/B Test)' : ''}`);
        resetCampaignForm();
      }
    } catch (err) {
      console.error("Create campaign failed:", err);
      toast.error('Failed to create campaign: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 2b. Schedule Campaign for Automated Dispatch
  const handleScheduleCampaign = async () => {
    if (!validateNotificationContent()) return;
    if (!validateAudience()) return;

    if (!scheduledDateTime) {
      return toast.error('Kripya schedule date aur time select karein / Please select scheduled date and time');
    }

    const schedDate = new Date(scheduledDateTime);
    if (isNaN(schedDate.getTime())) {
      return toast.error('Invalid date format');
    }

    const now = new Date();
    if (schedDate.getTime() < now.getTime() + 60 * 1000) {
      return toast.error('Schedule time kam se kam 1 minute aage ka hona chahiye / Scheduled time must be at least 1 minute in the future');
    }

    if (schedDate.getTime() > now.getTime() + (30 * 24 * 60 * 60 * 1000)) {
      return toast.error('Schedule time 30 din se zyada aage ka nahi ho sakta / Cannot schedule more than 30 days in advance');
    }

    if (isScheduledTimeInQuietHours && !overrideQuietHours && !canOverrideQuietHours) {
      return toast.error('🌙 Selected time IST Quiet Hours (10:00 PM - 07:00 AM) mein aata hai. Marketing role quiet hours mein schedule nahi kar sakta.');
    }

    setSubmitting(true);
    try {
      const createCampaignFn = httpsCallable(functions, 'createCampaign');
      const res = await createCampaignFn({
        ...getCampaignPayload(),
        scheduledAt: schedDate.toISOString(),
        overrideQuietHours: Boolean(canOverrideQuietHours && overrideQuietHours)
      });

      if (res.data?.success) {
        toast.success(`📅 Broadcast scheduled successfully for ${formatDateTime(schedDate)}! ${isAbTest ? '(A/B Test)' : ''}`);
        resetCampaignForm();
      }
    } catch (err) {
      console.error("Schedule campaign failed:", err);
      toast.error('Scheduling failed: ' + formatNotificationError(err, false));
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Dispatch Live Broadcast with 'SEND' confirmation
  const promptBroadcastConfirm = () => {
    if (!validateNotificationContent()) return;
    if (!validateAudience()) return;

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
      // Step A: Create the campaign first with audience targeting & A/B payload
      const createCampaignFn = httpsCallable(functions, 'createCampaign');
      const createRes = await createCampaignFn(getCampaignPayload());

      const campaignId = createRes.data?.campaignId;
      if (!campaignId) throw new Error("Failed to initialize campaign");

      // Step B: Send the campaign via topic broadcast
      const sendCampaignFn = httpsCallable(functions, 'sendCampaign');
      const sendRes = await sendCampaignFn({
        campaignId,
        overrideQuietHours: isQuietHoursNow && canOverrideQuietHours && overrideQuietHours
      });

      if (sendRes.data?.success) {
        const topicName = sendRes.data?.topic || getTargetTopic();
        toast.success(`🚀 Broadcast successfully dispatched to topic: ${topicName}! ${isAbTest ? '(A/B Test Live)' : ''}`);
        resetCampaignForm();
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
        <div className="space-y-1 max-w-sm">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-gray-900 tracking-tight text-xs block">{c.title}</span>
            {c.isAbTest && (
              <span className="text-[9px] bg-purple-100 text-purple-900 border border-purple-200/80 px-1.5 py-0.5 rounded font-black font-mono">
                🧪 A/B ({c.splitRatio || 50}/{100 - (c.splitRatio || 50)})
              </span>
            )}
            {c.stats?.winnerVariant && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black flex items-center gap-0.5 ${
                c.stats.winnerVariant === 'TIE'
                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                  : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
              }`}>
                🏆 {c.stats.winnerVariant === 'TIE' ? 'Tie' : `Var ${c.stats.winnerVariant}`}
              </span>
            )}
            {c.deepLink && (
              <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">
                {c.deepLink}
              </span>
            )}
          </div>
          <span className="text-gray-500 font-medium text-[11px] line-clamp-2">{c.body}</span>
          {c.isAbTest && c.variantB?.title && (
            <div className="text-[10px] text-purple-800 font-medium bg-purple-50/70 px-2 py-0.5 rounded-md border border-purple-100 line-clamp-1">
              <span className="font-black">B:</span> {c.variantB.title}
            </div>
          )}
        </div>
      )
    },
    { 
      header: 'Audience & Target', 
      render: (c) => {
        const audType = c.audience?.type || 'ALL';
        const topic = c.audience?.topic || 'all_customers';
        const label = audType === 'CROP'
          ? `🌾 Crop: ${c.audience?.crop || 'Custom'}`
          : audType === 'PINCODE'
          ? `📍 Pin: ${c.audience?.pincode || ''}`
          : audType === 'SEGMENT'
          ? (c.audience?.segment === 'ABANDONED_CART' ? '🛒 Segment: Abandoned Cart' : '💤 Segment: Inactive (30d)')
          : '👥 All Customers';

        return (
          <div>
            <span className="bg-emerald-50 text-[#1b5e20] border border-emerald-200/60 px-2 py-0.5 rounded text-[10px] font-black inline-flex items-center gap-1">
              <Target size={11} /> {topic}
            </span>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">{label}</p>
            {c.quietHoursOverridden && (
              <span className="inline-block mt-1 text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                ⚡ Quiet Hours Overridden
              </span>
            )}
          </div>
        );
      }
    },
    { 
      header: 'Created & Timing', 
      render: (c) => (
        <div className="space-y-0.5 text-xs text-gray-500">
          <div><span className="font-bold">Created:</span> {formatDateTime(c.createdAt)}</div>
          {c.scheduledAt && (
            <div className="text-purple-700 font-semibold flex items-center gap-1">
              <Calendar size={11} className="inline flex-shrink-0" />
              <span><span className="font-bold">Scheduled:</span> {formatDateTime(c.scheduledAt)}</span>
            </div>
          )}
          {c.completedAt && (
            <div className="text-emerald-700 font-semibold"><span className="font-bold">Completed:</span> {formatDateTime(c.completedAt)}</div>
          )}
        </div>
      )
    },
    { 
      header: 'Clicks & CTR', 
      render: (c) => {
        const clicks = Number(c.stats?.clicks) || 0;
        const uniqueClicks = Number(c.stats?.uniqueClicks) || 0;
        const ctr = c.stats?.ctr != null ? c.stats.ctr : (c.stats?.uniqueClicks && c.stats?.sent ? Math.round((c.stats.uniqueClicks / c.stats.sent) * 1000) / 10 : 0);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-900">
              <MousePointerClick size={13} className="text-blue-600" />
              <span>{clicks}</span>
              <span className="text-[10px] text-gray-400 font-bold">({uniqueClicks} unique)</span>
            </div>
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/60">
              {ctr}% CTR
            </span>
            {c.isAbTest && (c.stats?.variantA || c.stats?.variantB) && (
              <div className="text-[9px] font-mono font-bold text-gray-500 pt-0.5 flex gap-1.5">
                <span className="text-blue-700">A: {c.stats.variantA?.clicks || 0} clk</span>
                <span>•</span>
                <span className="text-purple-700">B: {c.stats.variantB?.clicks || 0} clk</span>
              </div>
            )}
          </div>
        );
      }
    },
    { 
      header: 'Orders & Sales', 
      render: (c) => {
        const conversions = Number(c.stats?.conversions) || 0;
        const revenue = Number(c.stats?.revenue) || 0;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-900">
              <ShoppingBag size={13} className="text-emerald-600" />
              <span>{conversions} {conversions === 1 ? 'order' : 'orders'}</span>
            </div>
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200/60">
              ₹{Number(revenue).toLocaleString('en-IN')}
            </span>
            {c.isAbTest && (c.stats?.variantA || c.stats?.variantB) && (
              <div className="text-[9px] font-mono font-bold text-gray-500 pt-0.5 flex gap-1.5">
                <span className="text-blue-700">A: ₹{Number(c.stats.variantA?.revenue || 0).toLocaleString('en-IN')}</span>
                <span>•</span>
                <span className="text-purple-700">B: ₹{Number(c.stats.variantB?.revenue || 0).toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        );
      }
    },
    { 
      header: 'Status & Report', 
      render: (c) => {
        const statusColors = {
          COMPLETED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          SCHEDULED: 'text-purple-700 bg-purple-50 border-purple-200',
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
            <button
              type="button"
              onClick={() => openCampaignAnalytics(c)}
              className="text-[#1b5e20] bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 border border-emerald-200/60 px-2 py-1 rounded-md text-[10px] font-black flex items-center gap-1 transition-colors"
              title="View full performance analytics & converted orders"
            >
              <BarChart3 size={12} />
              <span>Report</span>
            </button>
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
            {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
              <button
                type="button"
                onClick={() => handleCancelCampaign(c.id)}
                disabled={cancellingId === c.id}
                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 text-xs flex items-center gap-1"
                title={c.status === 'SCHEDULED' ? 'Cancel Scheduled Campaign' : 'Cancel Campaign'}
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
                  <p className="text-[10px] text-gray-400 font-bold">FCM Topic: {getTargetTopic()}</p>
                </div>
              </div>

              <div className="bg-emerald-100/70 border border-emerald-300/80 px-3 py-1.5 rounded-xl text-center">
                <p className="text-[9px] font-black uppercase text-emerald-900 tracking-wider">Audience</p>
                <p className="text-xs font-black font-mono text-emerald-950">
                  {audienceType === 'ALL' ? 'ALL Customers' : audienceType === 'CROP' ? 'By Crop' : audienceType === 'PINCODE' ? 'By Pincode' : 'By Segment'}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Audience Targeting Selector */}
              <div className="space-y-2.5 p-4 bg-gray-50/80 border border-gray-200/80 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Target size={13} className="text-[#1b5e20]" /> Select Audience Target
                  </label>
                  <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    Topic: {getTargetTopic()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setAudienceType('ALL')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      audienceType === 'ALL'
                        ? 'bg-emerald-50 border-[#1b5e20] text-[#1b5e20] shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Users size={14} />
                      <span className="text-xs font-black">All Customers</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono mt-1">all_customers</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudienceType('CROP')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      audienceType === 'CROP'
                        ? 'bg-emerald-50 border-[#1b5e20] text-[#1b5e20] shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Wheat size={14} />
                      <span className="text-xs font-black">By Crop</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono mt-1">crop_&lt;name&gt;</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudienceType('PINCODE')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      audienceType === 'PINCODE'
                        ? 'bg-emerald-50 border-[#1b5e20] text-[#1b5e20] shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} />
                      <span className="text-xs font-black">By Pincode</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono mt-1">pin_&lt;pincode&gt;</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudienceType('SEGMENT')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      audienceType === 'SEGMENT'
                        ? 'bg-emerald-50 border-[#1b5e20] text-[#1b5e20] shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ShoppingBag size={14} />
                      <span className="text-xs font-black">By Segment</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono mt-1">segment_&lt;name&gt;</span>
                  </button>
                </div>

                {/* Crop Options if CROP selected */}
                {audienceType === 'CROP' && (
                  <div className="pt-2 space-y-3 border-t border-gray-200/60 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">
                        Real Crops from Database ({realCrops.length} Active in Firestore)
                      </label>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.5 rounded">
                        Live Master Data
                      </span>
                    </div>

                    {/* Quick Select Chips from Real Database Crops */}
                    {realCrops.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-400 block">1-Click Quick Select:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {realCrops.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedCrop(c.name); setCustomCrop(''); }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                                selectedCrop === c.name
                                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm scale-105'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                              }`}
                            >
                              <span>🌱</span>
                              <span>{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400">All Available Crops:</label>
                      <select
                        value={selectedCrop}
                        onChange={(e) => setSelectedCrop(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-1 focus:ring-emerald-600"
                      >
                        {realCrops.length > 0 && (
                          <optgroup label="🌱 Real Database Crops (Firestore)">
                            {realCrops.map((crop) => {
                              const clean = crop.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                              return (
                                <option key={crop.id} value={crop.name}>
                                  {crop.name} (topic: crop_{clean})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}

                        <optgroup label="🌾 Other Farm Crops">
                          {POPULAR_CROPS.map((crop) => (
                            <option key={crop.value} value={crop.value}>
                              {crop.label} {crop.topic ? `(${crop.topic})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {selectedCrop === 'CUSTOM' && (
                      <input
                        type="text"
                        value={customCrop}
                        onChange={(e) => setCustomCrop(e.target.value)}
                        placeholder="Enter Custom Crop Name (e.g. Chilli, Cotton, Soybean)"
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    )}
                  </div>
                )}

                {/* Pincode Input if PINCODE selected */}
                {audienceType === 'PINCODE' && (
                  <div className="pt-2 space-y-3 border-t border-gray-200/60 animate-in fade-in">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                        Real Serviceable Hub & Customer Pincodes ({realPincodes.length} Active in Database)
                      </label>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.5 rounded">
                        Live Hubs
                      </span>
                    </div>

                    {/* Quick Select Cards for Real Operational Pincodes */}
                    {realPincodes.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-400 block">1-Click Quick Select:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {realPincodes.map((hub) => (
                            <button
                              key={hub.pincode}
                              type="button"
                              onClick={() => setTargetPincode(hub.pincode)}
                              className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                                targetPincode === hub.pincode
                                  ? 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-sm ring-1 ring-emerald-600'
                                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-black font-mono tracking-wider">{hub.pincode}</span>
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                  {hub.district}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-500 font-medium truncate mt-1">{hub.name}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400">
                        Target Pincode (6-digit Indian PIN code):
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={targetPincode}
                        onChange={(e) => setTargetPincode(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 848101 or 848117"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-800 outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>
                  </div>
                )}

                {/* Segment Options if SEGMENT selected */}
                {audienceType === 'SEGMENT' && (
                  <div className="pt-2 space-y-3 border-t border-gray-200/60 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">
                        Customer Lifecycle Segments (लाइव ग्राहक वर्ग)
                      </label>
                      <button
                        type="button"
                        onClick={handleSyncSegments}
                        disabled={syncingSegments}
                        className="text-[10px] text-emerald-800 font-bold bg-emerald-100/80 hover:bg-emerald-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                        title="Sync active tokens to FCM segment topics right now"
                      >
                        <RefreshCw size={11} className={syncingSegments ? "animate-spin" : ""} />
                        <span>{syncingSegments ? "Syncing..." : "Sync FCM Topics Now"}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Abandoned Cart Segment */}
                      <div
                        onClick={() => setSelectedSegment('ABANDONED_CART')}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          selectedSegment === 'ABANDONED_CART'
                            ? 'bg-emerald-50/80 border-[#1b5e20] ring-1 ring-[#1b5e20] shadow-sm'
                            : 'bg-white border-gray-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                              <ShoppingBag size={16} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-gray-900">Abandoned Cart</h4>
                              <p className="text-[10px] text-gray-500 font-medium">सामान कार्ट में छोड़ दिया</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                            {segmentCounts.loading ? '...' : `${segmentCounts.abandonedCartCount} Pending`}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 font-mono">
                          Topic: <strong className="text-gray-700">segment_abandoned_cart</strong>
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">Routes to: <code className="text-emerald-700 font-bold">/cart</code></span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSegment('ABANDONED_CART');
                              setFormData(prev => ({
                                ...prev,
                                title: "🛒 आपकी कार्ट में कुछ सामान बाकी है!",
                                body: "कृषि विशाल पर आपकी चुनी हुई खाद/दवाएं कार्ट में सुरक्षित हैं। अभी आर्डर पूरा करें और विशेष छूट पाएं!",
                                deepLink: "/cart"
                              }));
                              toast.success("Applied Abandoned Cart template & /cart deepLink");
                            }}
                            className="text-[10px] font-bold text-emerald-700 hover:underline"
                          >
                            1-Click Fill
                          </button>
                        </div>
                      </div>

                      {/* Inactive 30d Segment */}
                      <div
                        onClick={() => setSelectedSegment('INACTIVE_30D')}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          selectedSegment === 'INACTIVE_30D'
                            ? 'bg-emerald-50/80 border-[#1b5e20] ring-1 ring-[#1b5e20] shadow-sm'
                            : 'bg-white border-gray-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-purple-100 text-purple-800 rounded-lg">
                              <UserX size={16} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-gray-900">Inactive Farmers (30d+)</h4>
                              <p className="text-[10px] text-gray-500 font-medium">30 दिनों से कोई गतिविधि नहीं</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
                            {segmentCounts.loading ? '...' : `${segmentCounts.inactive30dCount} Inactive`}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 font-mono">
                          Topic: <strong className="text-gray-700">segment_inactive_30d</strong>
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">Routes to: <code className="text-emerald-700 font-bold">/product</code></span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSegment('INACTIVE_30D');
                              setFormData(prev => ({
                                ...prev,
                                title: "🌱 किसान भाई, आपकी फसल कैसी है?",
                                body: "कृषि विशाल पर नई कीटनाशक और पोषण उत्पाद उपलब्ध हैं। अपनी फसल की सुरक्षा के लिए अभी देखें।",
                                deepLink: "/product"
                              }));
                              toast.success("Applied Re-engagement template & /product deepLink");
                            }}
                            className="text-[10px] font-bold text-emerald-700 hover:underline"
                          >
                            1-Click Fill
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* A/B Testing Experiment Card (Feature 4) */}
              <div className="p-4 bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 border border-purple-200/80 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-600 text-white rounded-xl shadow-sm">
                      <FlaskConical size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-purple-950">A/B Testing Experiment</h3>
                        <span className="text-[9px] bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full font-black uppercase">
                          Split Experiment
                        </span>
                      </div>
                      <p className="text-[10px] text-purple-700 font-medium mt-0.5">
                        दो अलग-अलग हेडलाइन/मैसेज का टेस्ट करें और रियल टाइम में ऑटोमैटिक विनर (CTR & Revenue) जानें
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3.5 py-1.5 rounded-xl border border-purple-300 hover:border-purple-400 shadow-sm transition-all flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isAbTest}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIsAbTest(val);
                        if (val) {
                          if (!variantA.title && formData.title) {
                            setVariantA({ ...formData });
                          }
                          if (!variantB.title) {
                            setVariantB({
                              title: formData.title ? `${formData.title} [Special Offer]` : '',
                              body: formData.body ? `${formData.body} सीमित समय के लिए!` : '',
                              imageUrl: formData.imageUrl || '',
                              deepLink: formData.deepLink || '/product'
                            });
                          }
                        }
                      }}
                      className="w-4 h-4 text-purple-600 rounded border-purple-400 focus:ring-purple-500"
                    />
                    <span className="text-xs font-black text-purple-950">
                      {isAbTest ? 'A/B Test ON' : 'Enable A/B'}
                    </span>
                  </label>
                </div>

                {isAbTest && (
                  <div className="pt-2 border-t border-purple-200/70 space-y-3 animate-in fade-in">
                    {/* Split Ratio Slider */}
                    <div className="bg-white/90 p-3 rounded-xl border border-purple-200/70 space-y-2">
                      <div className="flex items-center justify-between text-xs font-black text-purple-950">
                        <span className="flex items-center gap-1.5">
                          <Sliders size={13} className="text-purple-700" />
                          Audience Split Ratio:
                        </span>
                        <span className="font-mono text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md text-[11px]">
                          Variant A: {splitRatio}% | Variant B: {100 - splitRatio}%
                        </span>
                      </div>

                      <input
                        type="range"
                        min="10"
                        max="90"
                        step="5"
                        value={splitRatio}
                        onChange={(e) => setSplitRatio(Number(e.target.value))}
                        className="w-full accent-purple-600 cursor-pointer h-2 bg-purple-200 rounded-lg"
                      />

                      <div className="h-2 w-full bg-indigo-100 rounded-full overflow-hidden flex shadow-inner">
                        <div
                          className="bg-blue-600 transition-all duration-200"
                          style={{ width: `${splitRatio}%` }}
                        />
                        <div
                          className="bg-purple-600 transition-all duration-200"
                          style={{ width: `${100 - splitRatio}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] font-bold text-gray-500 font-mono">
                        <span className="text-blue-700">🔵 Variant A (Control): {splitRatio}%</span>
                        <span className="text-purple-700">🟣 Variant B (Challenger): {100 - splitRatio}%</span>
                      </div>
                    </div>

                    {/* Variant Tabs */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setActiveVariantTab('A'); setPreviewVariant('A'); }}
                        className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border ${
                          activeVariantTab === 'A'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-500/20'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50/50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">A</span>
                        <span>Variant A (Control) — {splitRatio}%</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setActiveVariantTab('B'); setPreviewVariant('B'); }}
                        className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border ${
                          activeVariantTab === 'B'
                            ? 'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-500/20'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50/50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">B</span>
                        <span>Variant B (Challenger) — {100 - splitRatio}%</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <Info size={12} />
                    <span>Alert Title (Headline)</span>
                    {isAbTest && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black ${
                        activeVariantTab === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        Editing Variant {activeVariantTab}
                      </span>
                    )}
                  </label>
                  <span className={`text-[10px] font-mono ${(currentVariantData.title?.length || 0) > 65 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    {(currentVariantData.title?.length || 0)}/65 chars
                  </span>
                </div>
                <input
                  required
                  maxLength={65}
                  value={currentVariantData.title || ''}
                  onChange={(e) => updateCurrentVariantField('title', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none font-black text-gray-900 text-xs shadow-inner"
                  placeholder={
                    isAbTest && activeVariantTab === 'B'
                      ? "e.g. ⚡ सीमित समय छूट: धान फसल सुरक्षा उत्पाद!"
                      : "e.g. 🌾 धान कीट रोकथाम स्पेशल ऑफर"
                  }
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <span>Message Body (Hindi / English)</span>
                    {isAbTest && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black ${
                        activeVariantTab === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        Editing Variant {activeVariantTab}
                      </span>
                    )}
                  </label>
                  <span className={`text-[10px] font-mono ${(currentVariantData.body?.length || 0) > 240 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    {(currentVariantData.body?.length || 0)}/240 chars
                  </span>
                </div>
                <textarea
                  required
                  rows="3"
                  maxLength={240}
                  value={currentVariantData.body || ''}
                  onChange={(e) => updateCurrentVariantField('body', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/20 focus:border-[#1b5e20] outline-none font-bold text-gray-800 text-xs leading-relaxed shadow-inner"
                  placeholder={
                    isAbTest && activeVariantTab === 'B'
                      ? "Enter challenger variant copy (e.g., offer urgency, alternative emoji, question hook)..."
                      : "Enter customized Hindi/English notification copy..."
                  }
                />
              </div>

              {/* Image URL & DeepLink */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <span>Banner Image (HTTPS only)</span>
                    {isAbTest && (
                      <span className="text-[9px] font-mono text-gray-400">Var {activeVariantTab}</span>
                    )}
                  </label>
                  <input
                    value={currentVariantData.imageUrl || ''}
                    onChange={(e) => updateCurrentVariantField('imageUrl', e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <span>Deep Link (Allow-list)</span>
                    {isAbTest && (
                      <span className="text-[9px] font-mono text-gray-400">Var {activeVariantTab}</span>
                    )}
                  </label>
                  <select
                    value={currentVariantData.deepLink || '/product'}
                    onChange={(e) => updateCurrentVariantField('deepLink', e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  >
                    <option value="/product">/product (Product Catalog)</option>
                    <option value="/cart">/cart (Shopping Cart / Abandoned Bag)</option>
                    <option value="/product?id=CzAzFSJcsAvCAYApgYGD">/product?id=CzAzFSJcsAvCAYApgYGD (Amistar Fungicide - Syngenta)</option>
                    <option value="/order">/order (My Orders)</option>
                  </select>
                </div>
              </div>

              {/* Staging & Direct Test Options */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical size={14} className="text-emerald-700" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-700">Pre-Broadcast Testing Tools</span>
                  </div>

                  {isAbTest && (
                    <div className="flex items-center gap-1 bg-white border border-purple-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                      <span className="text-purple-900 mr-1">Test Variant:</span>
                      <button
                        type="button"
                        onClick={() => setTestVariant('A')}
                        className={`px-1.5 py-0.5 rounded ${testVariant === 'A' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => setTestVariant('B')}
                        className={`px-1.5 py-0.5 rounded ${testVariant === 'B' ? 'bg-purple-600 text-white' : 'text-gray-600'}`}
                      >
                        B
                      </button>
                    </div>
                  )}
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
                    disabled={testingUser || !(isAbTest ? (testVariant === 'B' ? variantB.title : variantA.title) : formData.title) || !testUserUid.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <UserCheck size={13} />
                    <span>{testingUser ? 'Sending...' : `Test on User Device ${isAbTest ? `(Var ${testVariant})` : ''}`}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleTestSend(false)}
                    disabled={testing || !(isAbTest ? (testVariant === 'B' ? variantB.title : variantA.title) : formData.title)}
                    className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Smartphone size={13} />
                    <span>{testing ? 'Sending...' : `Test on My Device ${isAbTest ? `(Var ${testVariant})` : ''}`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestSend(true)}
                    disabled={testing || !(isAbTest ? (testVariant === 'B' ? variantB.title : variantA.title) : formData.title)}
                    className="px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Target size={13} />
                    <span>Test Topic (test_all) {isAbTest ? `[Var ${testVariant}]` : ''}</span>
                  </button>
                </div>
              </div>

              {/* Schedule for Later Card */}
              <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-purple-700" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-purple-900">
                      Schedule Broadcast (स्वचालित शेड्यूलिंग)
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1 rounded-xl border border-purple-200 hover:border-purple-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIsScheduled(val);
                        if (val && !scheduledDateTime) {
                          setSchedulePreset(30);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500"
                    />
                    <span className="text-xs font-black text-purple-950">
                      {isScheduled ? 'Scheduled Mode ON' : 'Schedule for Later'}
                    </span>
                  </label>
                </div>

                {isScheduled && (
                  <div className="pt-2 space-y-3 border-t border-purple-200/60 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <div className="flex-1 w-full space-y-1">
                        <label className="text-[10px] font-bold text-purple-900">
                          Select Date & Time (IST / India Time):
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledDateTime}
                          min={getMinScheduledDateTime()}
                          onChange={(e) => setScheduledDateTime(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold font-mono text-purple-950 outline-none focus:ring-2 focus:ring-purple-400"
                        />
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-purple-800 block">Quick Schedule Shortcuts:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSchedulePreset(30)}
                          className="px-2.5 py-1 bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 rounded-lg text-[11px] font-bold transition-all"
                        >
                          ⚡ In 30 Mins
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulePreset(120)}
                          className="px-2.5 py-1 bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 rounded-lg text-[11px] font-bold transition-all"
                        >
                          ⏰ In 2 Hours
                        </button>
                        <button
                          type="button"
                          onClick={setScheduleTomorrowMorning}
                          className="px-2.5 py-1 bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 rounded-lg text-[11px] font-bold transition-all"
                        >
                          🌅 Tomorrow 9:00 AM
                        </button>
                        <button
                          type="button"
                          onClick={setScheduleTomorrowEvening}
                          className="px-2.5 py-1 bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 rounded-lg text-[11px] font-bold transition-all"
                        >
                          🌇 Tomorrow 5:00 PM
                        </button>
                      </div>
                    </div>

                    {/* Quiet Hours Warning for Scheduled Time */}
                    {isScheduledTimeInQuietHours && (
                      <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded-xl text-amber-950 text-[11px] font-medium flex items-start gap-2">
                        <Clock size={15} className="text-amber-700 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">⚠️ Warning: Selected time falls in Quiet Hours (10:00 PM - 07:00 AM IST)</p>
                          <p className="text-[10px] text-amber-900 mt-0.5">
                            {canOverrideQuietHours 
                              ? "SuperAdmin override checkbox enable hona chahiye varna scheduler broadcast skip kar dega."
                              : "Marketing role quiet hours mein schedule nahi kar sakta. Kripya 07:00 AM ke baad ka samay chunein."}
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-purple-700/80 font-medium">
                      ℹ️ Cloud Scheduler har 1 minute mein scheduled notifications check karke automatically broadcast dispatch karega.
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={submitting || !(isAbTest ? (variantA.title && variantA.body && variantB.title && variantB.body) : (formData.title && formData.body))}
                  className="px-5 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                >
                  Save Draft {isAbTest ? '(A/B)' : ''}
                </button>

                {isScheduled ? (
                  <button
                    type="button"
                    onClick={handleScheduleCampaign}
                    disabled={submitting || !(isAbTest ? (variantA.title && variantA.body && variantB.title && variantB.body) : (formData.title && formData.body)) || !scheduledDateTime || (isScheduledTimeInQuietHours && !overrideQuietHours && !canOverrideQuietHours)}
                    className="flex-1 bg-purple-700 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-900/20 hover:bg-purple-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Calendar size={15} />
                    <span>
                      {submitting ? 'Scheduling...' : `Schedule for ${scheduledDateTime ? formatDateTime(scheduledDateTime) : '...'} ${isAbTest ? '(A/B)' : ''}`}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={promptBroadcastConfirm}
                    disabled={submitting || !(isAbTest ? (variantA.title && variantA.body && variantB.title && variantB.body) : (formData.title && formData.body)) || (isQuietHoursNow && !overrideQuietHours && !canOverrideQuietHours)}
                    className="flex-1 bg-[#1b5e20] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#2e7d32] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Send size={15} />
                    <span>
                      Broadcast {isAbTest ? `A/B (${splitRatio}% : ${100 - splitRatio}%)` : ''} to {audienceType === 'CROP' ? (selectedCrop === 'CUSTOM' ? (customCrop || 'Crop') : selectedCrop) : audienceType === 'PINCODE' ? `Pincode ${targetPincode || ''}` : 'ALL Customers'} Now
                    </span>
                  </button>
                )}
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

              {/* Preview Controls (Variant Switcher + Language Switcher) */}
              <div className="flex items-center gap-2">
                {isAbTest && (
                  <div className="flex bg-gray-100 p-0.5 rounded-lg text-[10px] font-black">
                    <button
                      type="button"
                      onClick={() => setPreviewVariant('A')}
                      className={`px-2 py-0.5 rounded transition-all ${previewVariant === 'A' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600'}`}
                    >
                      Var A
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewVariant('B')}
                      className={`px-2 py-0.5 rounded transition-all ${previewVariant === 'B' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600'}`}
                    >
                      Var B
                    </button>
                  </div>
                )}

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
            </div>

            {/* Android Notification Shade Simulator */}
            {(() => {
              const activePreview = isAbTest
                ? (previewVariant === 'B' ? variantB : variantA)
                : formData;

              return (
                <div className="bg-gray-900 rounded-2xl p-4 text-white shadow-inner font-sans space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-gray-400 border-b border-gray-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center text-[9px] font-black text-white">
                        KV
                      </div>
                      <span className="font-bold text-gray-200">Krishi Vishal</span>
                      {isAbTest && (
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black ${
                          previewVariant === 'A' ? 'bg-blue-600/40 text-blue-300' : 'bg-purple-600/40 text-purple-300'
                        }`}>
                          Variant {previewVariant}
                        </span>
                      )}
                      <span>•</span>
                      <span>{isScheduled && scheduledDateTime ? `📅 ${formatDateTime(scheduledDateTime)}` : 'just now'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">krishi_offers_channel</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-black text-white leading-tight">
                      {activePreview.title || (
                        isAbTest && previewVariant === 'B'
                          ? (previewLang === 'hi' ? '⚡ सीमित समय: धान सुरक्षा उत्पाद!' : '⚡ Flash Deal: Crop Protection Inside!')
                          : (previewLang === 'hi' ? '🌾 धान कीट रोकथाम स्पेशल ऑफर' : '🌾 Paddy Pest Control Special Alert')
                      )}
                    </p>
                    <p className="text-[11px] text-gray-300 leading-snug font-medium">
                      {activePreview.body || (
                        isAbTest && previewVariant === 'B'
                          ? (previewLang === 'hi' ? 'सीमित समय के लिए स्पेशल डिस्काउंट। अपनी धान फसल को सुरक्षित रखें और अभी आर्डर करें!' : 'Special limited time deal on pest defense! Secure your harvest today.')
                          : (previewLang === 'hi' ? 'धान की फसल को कीटों से बचाने के लिए प्रमाणित कीटनाशक 20% छूट के साथ आज ही ऑर्डर करें।' : 'Protect your paddy crop from insects. Order certified crop protection with 20% discount today.')
                      )}
                    </p>
                  </div>

                  {activePreview.imageUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-gray-800 max-h-36 bg-black">
                      <img src={activePreview.imageUrl} alt="Banner Preview" className="w-full object-cover" />
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                    <span>Deep link: {activePreview.deepLink || '/product'}</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck size={12} /> Verified
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Overall Campaign Performance Analytics (Feature 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center flex-shrink-0">
            <Send size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Completed Broadcasts</p>
            <h3 className="text-xl font-black text-gray-900">{overallMetrics.completedCampaigns}</h3>
            <p className="text-[10px] text-purple-700 font-bold mt-0.5">{history.length} Total Campaigns</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
            <MousePointerClick size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Total Clicks</p>
            <h3 className="text-xl font-black text-gray-900">{overallMetrics.totalClicks}</h3>
            <p className="text-[10px] text-blue-700 font-bold mt-0.5">{overallMetrics.totalUniqueClicks} Unique Farmers</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Converted Orders</p>
            <h3 className="text-xl font-black text-gray-900">{overallMetrics.totalOrders}</h3>
            <p className="text-[10px] text-amber-700 font-bold mt-0.5">{overallMetrics.conversionRate}% Conversion Rate</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#1b5e20] flex items-center justify-center flex-shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Direct Push Revenue</p>
            <h3 className="text-xl font-black text-gray-900">₹{overallMetrics.totalRevenue.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-emerald-700 font-bold mt-0.5">Attributed to Push Notifications</p>
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
                Broadcast to {audienceType === 'CROP' ? 'Target Crop' : audienceType === 'PINCODE' ? 'Target Pincode' : 'ALL Customers'}?
              </h2>

              <div className="text-left bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 space-y-1.5 text-xs text-amber-950">
                <p className="font-bold">⚠️ Critical Action Warning:</p>
                <p className="text-[11px] leading-relaxed">
                  Ye push notification topic <b className="font-mono text-emerald-800">{getTargetTopic()}</b> ({getAudienceDescription()}) par turant deliver hoga. Sabhi subscribed customers jinka app notification on hai, unhe alert milega. Ise cancel ya undo nahi kiya ja sakta.
                </p>
                {isQuietHoursNow && overrideQuietHours && (
                  <p className="text-[11px] font-bold text-red-700 pt-1 border-t border-amber-200">
                    ⚡ SuperAdmin Quiet Hours Override enable hai! Push raat ke samay bhej di jayegi.
                  </p>
                )}
              </div>

              {isAbTest && (
                <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3 text-left space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-black text-purple-900">
                    <span className="flex items-center gap-1.5">
                      <FlaskConical size={13} className="text-purple-700" />
                      A/B Testing Experiment Enabled
                    </span>
                    <span className="font-mono text-[10px] bg-purple-200 text-purple-900 px-2 py-0.5 rounded-md font-bold">
                      {splitRatio}% A / {100 - splitRatio}% B
                    </span>
                  </div>
                  <div className="text-[11px] space-y-1 pt-1 border-t border-purple-200/60">
                    <p className="text-blue-900 font-medium">
                      <span className="font-black">🔵 Variant A:</span> {variantA.title}
                    </p>
                    <p className="text-purple-900 font-medium">
                      <span className="font-black">🟣 Variant B:</span> {variantB.title}
                    </p>
                  </div>
                </div>
              )}

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

      {/* Campaign Performance & Conversion Analytics Modal (Feature 3) */}
      {analyticsModalOpen && selectedCampaignForAnalytics && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-300 border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1b5e20] flex items-center justify-center font-black">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-900 tracking-tight">Campaign Performance & Conversion Analytics</h2>
                  <p className="text-xs text-gray-500 font-medium truncate max-w-md">{selectedCampaignForAnalytics.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAnalyticsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Campaign Highlights */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold">Target Audience:</span>
                    <span className="font-black text-gray-900">
                      {selectedCampaignForAnalytics.audience?.type === 'CROP'
                        ? `🌾 Crop: ${selectedCampaignForAnalytics.audience?.crop}`
                        : selectedCampaignForAnalytics.audience?.type === 'PINCODE'
                        ? `📍 Pincode: ${selectedCampaignForAnalytics.audience?.pincode}`
                        : selectedCampaignForAnalytics.audience?.type === 'SEGMENT'
                        ? `👥 Segment: ${selectedCampaignForAnalytics.audience?.segment}`
                        : '👥 All Customers'}
                    </span>
                    {selectedCampaignForAnalytics.isAbTest && (
                      <span className="text-[10px] bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-full font-black font-mono">
                        🧪 A/B Test ({selectedCampaignForAnalytics.splitRatio || 50}/{100 - (selectedCampaignForAnalytics.splitRatio || 50)})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono mt-0.5">Topic: {selectedCampaignForAnalytics.audience?.topic || 'all_customers'}</div>
                </div>
                <div className="text-right sm:text-right">
                  <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                    {selectedCampaignForAnalytics.status}
                  </span>
                  <div className="text-[10px] text-gray-400 mt-1">{formatDateTime(selectedCampaignForAnalytics.createdAt)}</div>
                </div>
              </div>

              {/* A/B Test Outcome Trophy Banner (Feature 4) */}
              {selectedCampaignForAnalytics.isAbTest && (() => {
                const winner = analyticsData?.winnerVariant || selectedCampaignForAnalytics.stats?.winnerVariant;
                return (
                  <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    winner === 'A'
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-950'
                      : winner === 'B'
                      ? 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 text-purple-950'
                      : winner === 'TIE'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-gray-50 border-gray-200 text-gray-800'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-sm flex-shrink-0">
                        <Trophy size={22} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider">
                          {winner === 'A'
                            ? '🏆 Winner: Variant A (Control)'
                            : winner === 'B'
                            ? '🏆 Winner: Variant B (Challenger)'
                            : winner === 'TIE'
                            ? '🤝 Result: Tie (Equal Performance)'
                            : '⏳ Experiment Active — Gathering Farmer Responses'}
                        </h4>
                        <p className="text-[11px] text-gray-600 font-medium mt-0.5">
                          {winner && winner !== 'TIE'
                            ? `Variant ${winner} has produced superior customer conversions and click-through metrics.`
                            : 'Real-time algorithm dynamically declares the winner as orders and clicks arrive.'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-black px-3 py-1 bg-white rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
                      Ratio: {selectedCampaignForAnalytics.splitRatio || 50}% / {100 - (selectedCampaignForAnalytics.splitRatio || 50)}%
                    </span>
                  </div>
                );
              })()}

              {/* Side-by-Side Head-to-Head Comparison Matrix for A/B Campaigns */}
              {selectedCampaignForAnalytics.isAbTest && (() => {
                const winner = analyticsData?.winnerVariant || selectedCampaignForAnalytics.stats?.winnerVariant;
                const mA = analyticsData?.metricsVariantA || selectedCampaignForAnalytics.stats?.variantA || {};
                const mB = analyticsData?.metricsVariantB || selectedCampaignForAnalytics.stats?.variantB || {};
                const split = selectedCampaignForAnalytics.splitRatio || 50;

                return (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                      <GitCompare size={14} className="text-purple-700" />
                      <span>Head-to-Head Variant Performance Comparison</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Variant A Card */}
                      <div className={`p-4 rounded-2xl border transition-all ${
                        winner === 'A'
                          ? 'border-blue-400 bg-blue-50/40 ring-2 ring-blue-400/80 shadow-sm'
                          : 'border-gray-200 bg-white'
                      }`}>
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white">
                              Variant A
                            </span>
                            <span className="text-xs font-bold text-gray-500">
                              Control ({split}% Traffic)
                            </span>
                          </div>
                          {winner === 'A' && (
                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Trophy size={11} /> WINNER
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 space-y-1">
                          <p className="text-xs font-black text-gray-900">
                            {selectedCampaignForAnalytics.variantA?.title || selectedCampaignForAnalytics.title}
                          </p>
                          <p className="text-[11px] text-gray-500 line-clamp-2">
                            {selectedCampaignForAnalytics.variantA?.body || selectedCampaignForAnalytics.body}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 text-center">
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Clicks</p>
                            <p className="text-xs font-black text-blue-900">{mA.clicks || 0}</p>
                            <p className="text-[9px] text-gray-400 font-bold">({mA.uniqueClicks || 0} unq)</p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">CTR</p>
                            <p className="text-xs font-black text-indigo-900">{mA.ctr || 0}%</p>
                            <p className="text-[9px] text-indigo-600 font-bold">rate</p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Revenue</p>
                            <p className="text-xs font-black text-emerald-800">₹{Number(mA.revenue || 0).toLocaleString('en-IN')}</p>
                            <p className="text-[9px] text-emerald-600 font-bold">{mA.conversions || 0} orders</p>
                          </div>
                        </div>

                        <div className="mt-2.5 text-[10px] text-gray-500 flex justify-between font-bold pt-1">
                          <span>Converted Orders: <strong className="text-gray-800">{mA.conversions || 0}</strong></span>
                          <span>Conv. Rate: <strong className="text-gray-800">{mA.conversionRate || 0}%</strong></span>
                        </div>
                      </div>

                      {/* Variant B Card */}
                      <div className={`p-4 rounded-2xl border transition-all ${
                        winner === 'B'
                          ? 'border-purple-400 bg-purple-50/40 ring-2 ring-purple-400/80 shadow-sm'
                          : 'border-gray-200 bg-white'
                      }`}>
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white">
                              Variant B
                            </span>
                            <span className="text-xs font-bold text-gray-500">
                              Challenger ({100 - split}% Traffic)
                            </span>
                          </div>
                          {winner === 'B' && (
                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Trophy size={11} /> WINNER
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 space-y-1">
                          <p className="text-xs font-black text-gray-900">
                            {selectedCampaignForAnalytics.variantB?.title || 'Variant B Headline'}
                          </p>
                          <p className="text-[11px] text-gray-500 line-clamp-2">
                            {selectedCampaignForAnalytics.variantB?.body || 'Challenger copy text'}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 text-center">
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Clicks</p>
                            <p className="text-xs font-black text-purple-900">{mB.clicks || 0}</p>
                            <p className="text-[9px] text-gray-400 font-bold">({mB.uniqueClicks || 0} unq)</p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">CTR</p>
                            <p className="text-xs font-black text-indigo-900">{mB.ctr || 0}%</p>
                            <p className="text-[9px] text-indigo-600 font-bold">rate</p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Revenue</p>
                            <p className="text-xs font-black text-emerald-800">₹{Number(mB.revenue || 0).toLocaleString('en-IN')}</p>
                            <p className="text-[9px] text-emerald-600 font-bold">{mB.conversions || 0} orders</p>
                          </div>
                        </div>

                        <div className="mt-2.5 text-[10px] text-gray-500 flex justify-between font-bold pt-1">
                          <span>Converted Orders: <strong className="text-gray-800">{mB.conversions || 0}</strong></span>
                          <span>Conv. Rate: <strong className="text-gray-800">{mB.conversionRate || 0}%</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Overall KPI Cards for Selected Campaign */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block">
                  Overall Aggregate Campaign KPIs
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-3.5 text-center">
                    <p className="text-[10px] font-black uppercase text-blue-700 tracking-wider">Total Clicks</p>
                    <p className="text-xl font-black text-blue-950 mt-0.5">
                      {analyticsData?.metrics?.clicks ?? (selectedCampaignForAnalytics.stats?.clicks || 0)}
                    </p>
                    <p className="text-[9px] font-bold text-blue-600">
                      ({analyticsData?.metrics?.uniqueClicks ?? (selectedCampaignForAnalytics.stats?.uniqueClicks || 0)} unique)
                    </p>
                  </div>

                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3.5 text-center">
                    <p className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">Click Rate (CTR)</p>
                    <p className="text-xl font-black text-indigo-950 mt-0.5">
                      {analyticsData?.metrics?.ctr ?? (selectedCampaignForAnalytics.stats?.ctr || 0)}%
                    </p>
                    <p className="text-[9px] font-bold text-indigo-600">Open Engagement</p>
                  </div>

                  <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3.5 text-center">
                    <p className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Orders Converted</p>
                    <p className="text-xl font-black text-amber-950 mt-0.5">
                      {analyticsData?.metrics?.conversions ?? (selectedCampaignForAnalytics.stats?.conversions || 0)}
                    </p>
                    <p className="text-[9px] font-bold text-amber-600">
                      {analyticsData?.metrics?.conversionRate ?? 0}% conversion
                    </p>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 text-center">
                    <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Direct Sales</p>
                    <p className="text-xl font-black text-emerald-950 mt-0.5">
                      ₹{Number(analyticsData?.metrics?.revenue ?? (selectedCampaignForAnalytics.stats?.revenue || 0)).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[9px] font-bold text-emerald-700">Attributed GMV</p>
                  </div>
                </div>
              </div>

              {/* Converted Orders Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-[#1b5e20]" />
                    <span>Converted Orders Attributed to this Notification</span>
                  </h3>
                  <span className="text-[11px] font-bold text-gray-400">
                    {(analyticsData?.recentOrders?.length || 0)} Orders
                  </span>
                </div>

                {loadingAnalytics ? (
                  <div className="p-8 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                    <RefreshCw className="animate-spin text-[#1b5e20]" size={20} />
                    <span>Loading real-time conversion ledger...</span>
                  </div>
                ) : analyticsData?.recentOrders?.length > 0 ? (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
                    <div className="bg-gray-50/80 px-4 py-2.5 grid grid-cols-12 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      <div className="col-span-3">Order ID</div>
                      <div className="col-span-3">Customer</div>
                      <div className="col-span-2 text-center">Variant</div>
                      <div className="col-span-2 text-right">Amount</div>
                      <div className="col-span-2 text-right">Date</div>
                    </div>
                    {analyticsData.recentOrders.map((ord) => (
                      <div key={ord.orderId} className="px-4 py-3 grid grid-cols-12 text-xs items-center hover:bg-gray-50/50 transition-colors">
                        <div className="col-span-3 font-mono font-black text-blue-700 truncate">
                          #{ord.orderId.slice(-8).toUpperCase()}
                        </div>
                        <div className="col-span-3">
                          <p className="font-black text-gray-800 text-[11px] truncate">{ord.userName || 'Customer'}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{ord.userPhone || '-'}</p>
                        </div>
                        <div className="col-span-2 text-center">
                          {selectedCampaignForAnalytics.isAbTest ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                              ord.variant === 'B'
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}>
                              Var {ord.variant || 'A'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-mono">-</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right font-black text-emerald-700">
                          ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                        </div>
                        <div className="col-span-2 text-right text-[10px] text-gray-400">
                          {ord.convertedAt ? formatDateTime(ord.convertedAt) : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center text-xs text-gray-400">
                    Abhi tak is campaign se koi direct order attribute nahi hua hai. (No orders converted yet)
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50/70 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAnalyticsModalOpen(false)}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;

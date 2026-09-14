import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  Timestamp,
  orderBy,
  limit,
  getDocs,
  where,
  startAfter
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { addAuditLog } from '../services/logger';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import {
  Users,
  Search,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  ChevronRight,
  X,
  UserCircle,
  MessageCircle,
  Package,
  Headphones,
  AlertOctagon,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Star,
  ExternalLink,
  Loader2,
  Sparkles,
  FileCheck,
  UploadCloud,
  Layers,
  Activity,
  Eye,
  RefreshCw,
  Sprout,
  Leaf,
  Wheat,
  Tractor,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';

export const getFarmerAge = (c) => {
  if (!c) return null;
  if (c.age && !isNaN(Number(c.age))) return Number(c.age);
  if (c.farmerAge && !isNaN(Number(c.farmerAge))) return Number(c.farmerAge);
  if (c.farmerProfile?.age && !isNaN(Number(c.farmerProfile.age))) return Number(c.farmerProfile.age);
  if (c.dob) {
    const dobDate = new Date(c.dob);
    if (!isNaN(dobDate.getTime())) {
      const diffMs = Date.now() - dobDate.getTime();
      const ageDt = new Date(diffMs);
      return Math.abs(ageDt.getUTCFullYear() - 1970);
    }
  }
  return null;
};

export const getLandSize = (c) => {
  if (!c) return 0;
  const raw = c.totalLand ?? c.landHolding ?? c.farmSize ?? c.land ?? c.farmerProfile?.totalLand ?? c.farmerProfile?.landHolding;
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 0 : parsed;
};

export const getLandUnit = (c) => {
  if (!c) return 'Katha';
  if (c.landUnit) return c.landUnit;
  if (c.farmerProfile?.landUnit) return c.farmerProfile.landUnit;
  const raw = c.totalLand ?? c.landHolding ?? c.farmSize ?? c.land;
  if (typeof raw === 'string') {
    const match = raw.match(/[a-zA-Z\u0900-\u097F]+/);
    if (match) return match[0];
  }
  return 'Katha';
};

export const getCropAllocations = (c) => {
  if (!c) return [];
  const raw = c.cropAllocations || c.crops || c.cropAllocation || c.farmerProfile?.cropAllocations || [];
  if (Array.isArray(raw)) {
    return raw.map((crop, idx) => {
      if (typeof crop === 'string') {
        return {
          id: `crop-${idx}`,
          name: crop,
          area: 0,
          unit: 'Katha',
          sowingMonth: '—',
          harvestMonth: '—',
          status: 'Active'
        };
      }
      return {
        id: crop.id || `crop-${idx}`,
        name: crop.name || crop.cropName || crop.crop || 'Unknown Crop',
        area: Number(crop.area ?? crop.allocatedArea ?? crop.land ?? crop.katha ?? crop.size ?? 0) || 0,
        unit: crop.unit || 'Katha',
        sowingMonth: crop.sowingMonth || crop.sowingDate || crop.sowing || crop.season || '—',
        harvestMonth: crop.harvestMonth || crop.harvestDate || crop.harvest || crop.expectedHarvest || '—',
        status: crop.status || 'Active',
        variety: crop.variety || '',
        ...crop
      };
    });
  } else if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw).map(([key, val], idx) => {
      if (typeof val === 'number') {
        return {
          id: `crop-${idx}`,
          name: key,
          area: val,
          unit: 'Katha',
          sowingMonth: '—',
          harvestMonth: '—',
          status: 'Active'
        };
      }
      return {
        id: val.id || `crop-${idx}`,
        name: val.name || val.cropName || key,
        area: Number(val.area ?? val.allocatedArea ?? val.land ?? val.katha ?? 0) || 0,
        unit: val.unit || 'Katha',
        sowingMonth: val.sowingMonth || val.sowingDate || val.sowing || '—',
        harvestMonth: val.harvestMonth || val.harvestDate || val.harvest || '—',
        status: val.status || 'Active',
        ...val
      };
    });
  }
  return [];
};

const KYC_DOC_TYPES = [
  'Aadhaar Card (Identity Proof)',
  'Kisan Credit Card (KCC)',
  'Land Ownership / RoR Document',
  'Soil Health Card / Test Report',
  'Bank Passbook / Cancelled Cheque',
  'Farming License / Trade Certificate'
];

const Customers = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'orders', 'support', 'timeline', 'kyc'
  const [isMasked, setIsMasked] = useState(true);

  // Modals inside drawer
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({ label: 'Home Farm', address: '', district: '', state: 'Bihar', pin: '', isPrimary: false });
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [newDocForm, setNewDocForm] = useState({ docType: 'Aadhaar Card (Identity Proof)', docNumber: '', docUrl: '', remarks: '' });
  const [savingDrawerData, setSavingDrawerData] = useState(false);

  // Wallet state
  const [walletHistory, setWalletHistory] = useState([]);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletAdjustForm, setWalletAdjustForm] = useState({ type: 'CREDIT', amount: '', reason: '' });
  const [walletAdjusting, setWalletAdjusting] = useState(false);

  // [FIXED] Point #145: Scalable paginated customer fetching instead of full collection scan
  const PAGE_SIZE = 50;
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchCustomers = async (isLoadMore = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const { collection, query, where, orderBy, limit, startAfter, getDocs } = await import('firebase/firestore');

      let q = query(
        collection(db, 'users'),
        where('isAdmin', '==', false), // Filter out admins on server
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );

      if (isLoadMore && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const snapshot = await getDocs(q);
      const newCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (isLoadMore) {
        setCustomers(prev => [...prev, ...newCustomers]);
      } else {
        setCustomers(newCustomers);
      }

      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load farmers list");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Server-side Search Implementation
  const handleSearch = async (val) => {
    setSearch(val);
    if (val.length < 3) {
       if (val.length === 0) fetchCustomers();
       return;
    }

    setLoading(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const searchFn = httpsCallable(getFunctions(), 'searchUsers');
      const res = await searchFn({ query: val, type: 'CUSTOMER' });
      setCustomers(res.data.users || []);
      setHasMore(false); // Disable pagination during search results
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Listen to Orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  // Listen to Support Tickets
  useEffect(() => {
    const q = query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  // Listen to Complaints
  useEffect(() => {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setComplaints(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  // Listen to Customer Feedback
  useEffect(() => {
    const q = query(collection(db, 'customer_feedback'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setFeedbackList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  // Compute Customer Metrics (Orders, LTV, Persona)
  const customerAnalytics = useMemo(() => {
    const map = {};
    const fortyFiveDaysAgo = Date.now() - 45 * 24 * 60 * 60 * 1000;

    customers.forEach(c => {
      const userOrders = orders.filter(o => o.userId === c.id || (c.phone && o.userPhone === c.phone));
      const totalSpent = userOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
      const ordersCount = userOrders.length;

      let lastOrderDateMs = 0;
      if (userOrders.length > 0) {
        const firstOrder = userOrders[0];
        lastOrderDateMs = firstOrder.createdAt?.toMillis ? firstOrder.createdAt.toMillis() : new Date(firstOrder.createdAt).getTime();
      }

      let persona = 'NEW_FARMER';
      if (totalSpent >= 10000) {
        persona = 'HIGH_VALUE';
      } else if (ordersCount >= 2) {
        if (lastOrderDateMs && lastOrderDateMs < fortyFiveDaysAgo) {
          persona = 'CHURN_RISK';
        } else {
          persona = 'ACTIVE_BUYER';
        }
      }

      map[c.id] = {
        orders: userOrders,
        totalSpent,
        ordersCount,
        persona
      };
    });
    return map;
  }, [customers, orders]);

  // Selected Customer Sub-Entities
  const selectedCustomerOrders = selectedCustomer
    ? orders.filter(o => o.userId === selectedCustomer.id || (selectedCustomer.phone && o.userPhone === selectedCustomer.phone))
    : [];

  const selectedCustomerTickets = selectedCustomer
    ? tickets.filter(t => t.customerId === selectedCustomer.id || (selectedCustomer.phone && t.customerPhone === selectedCustomer.phone))
    : [];

  const selectedCustomerComplaints = selectedCustomer
    ? complaints.filter(c => c.customerId === selectedCustomer.id || (selectedCustomer.phone && c.customerPhone === selectedCustomer.phone))
    : [];

  const selectedCustomerFeedback = selectedCustomer
    ? feedbackList.filter(f => f.customerId === selectedCustomer.id || (selectedCustomer.phone && f.customerPhone === selectedCustomer.phone))
    : [];

  // Generate Chronological Activity Timeline
  const activityTimeline = useMemo(() => {
    if (!selectedCustomer) return [];
    const events = [];

    // Account Creation
    if (selectedCustomer.createdAt) {
      events.push({
        type: 'ACCOUNT_CREATED',
        title: 'Account Registered',
        desc: `Farmer account created with mobile ${selectedCustomer.phone || ''}`,
        timestamp: selectedCustomer.createdAt?.toDate ? selectedCustomer.createdAt.toDate() : new Date(selectedCustomer.createdAt),
        icon: <Users size={16} className="text-emerald-600" />
      });
    }

    // Orders
    selectedCustomerOrders.forEach(o => {
      events.push({
        type: 'ORDER_PLACED',
        title: `Order #${o.id.slice(0, 8).toUpperCase()} Placed`,
        desc: `Total: ₹${o.totalAmount} (${o.items?.length || 0} items) — Status: ${o.status}`,
        timestamp: o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt),
        icon: <Package size={16} className="text-blue-600" />
      });
    });

    // Tickets
    selectedCustomerTickets.forEach(t => {
      events.push({
        type: 'TICKET_RAISED',
        title: `Support Ticket ${t.ticketNumber}`,
        desc: `${t.subject} (${t.priority} Priority) — Status: ${t.status}`,
        timestamp: t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt),
        icon: <Headphones size={16} className="text-amber-600" />
      });
    });

    // Complaints
    selectedCustomerComplaints.forEach(c => {
      events.push({
        type: 'COMPLAINT_LOGGED',
        title: `Grievance ${c.complaintNumber} Logged`,
        desc: `${c.title} (${c.severity} Severity) — Status: ${c.status}`,
        timestamp: c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt),
        icon: <AlertOctagon size={16} className="text-red-600" />
      });
    });

    // Feedback
    selectedCustomerFeedback.forEach(f => {
      events.push({
        type: 'FEEDBACK_GIVEN',
        title: `Rated ${f.rating} Stars Review`,
        desc: `"${f.comments}" (${f.category})`,
        timestamp: f.createdAt?.toDate ? f.createdAt.toDate() : new Date(f.createdAt),
        icon: <Star size={16} className="text-yellow-500 fill-yellow-500" />
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedCustomer, selectedCustomerOrders, selectedCustomerTickets, selectedCustomerComplaints, selectedCustomerFeedback]);

  // Add Address Handler
  const handleAddAddress = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !newAddressForm.address.trim()) return;

    setSavingDrawerData(true);
    try {
      const userDocRef = doc(db, 'users', selectedCustomer.id);
      const existingAddresses = selectedCustomer.addresses || [];
      const newAddress = {
        id: `addr-${Date.now()}`,
        ...newAddressForm,
        createdAt: new Date().toISOString()
      };

      const updatedAddresses = [...existingAddresses, newAddress];
      await updateDoc(userDocRef, { addresses: updatedAddresses });

      setSelectedCustomer(prev => ({ ...prev, addresses: updatedAddresses }));
      toast.success('New delivery address added');
      setIsAddAddressOpen(false);
      setNewAddressForm({ label: 'Home Farm', address: '', district: '', state: 'Bihar', pin: '', isPrimary: false });
    } catch (error) {
      toast.error('Failed to add address: ' + error.message);
    } finally {
      setSavingDrawerData(false);
    }
  };

  // Add KYC Document Handler
  const handleAddKycDoc = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !newDocForm.docNumber.trim()) {
      toast.error('Please enter Document Reference Number');
      return;
    }

    setSavingDrawerData(true);
    try {
      const userDocRef = doc(db, 'users', selectedCustomer.id);
      const existingDocs = selectedCustomer.kycDocuments || [];
      const newDoc = {
        id: `doc-${Date.now()}`,
        docType: newDocForm.docType,
        docNumber: newDocForm.docNumber.trim(),
        docUrl: newDocForm.docUrl.trim() || null,
        remarks: newDocForm.remarks.trim() || 'Uploaded via CRM Admin',
        status: 'VERIFIED',
        verifiedBy: user?.email || 'Admin',
        verifiedAt: new Date().toISOString()
      };

      const updatedDocs = [...existingDocs, newDoc];
      await updateDoc(userDocRef, {
        kycDocuments: updatedDocs,
        isKycVerified: true
      });

      setSelectedCustomer(prev => ({ ...prev, kycDocuments: updatedDocs, isKycVerified: true }));
      toast.success('KYC Document verified & recorded');
      setIsAddDocOpen(false);
      setNewDocForm({ docType: 'Aadhaar Card (Identity Proof)', docNumber: '', docUrl: '', remarks: '' });
    } catch (error) {
      toast.error('Failed to save KYC: ' + error.message);
    } finally {
      setSavingDrawerData(false);
    }
  };

  // Toggle KYC Document Status
  const handleUpdateDocStatus = async (docId, newStatus) => {
    if (!selectedCustomer) return;
    try {
      const userDocRef = doc(db, 'users', selectedCustomer.id);
      const updatedDocs = (selectedCustomer.kycDocuments || []).map(d => {
        if (d.id === docId) {
          return { ...d, status: newStatus, verifiedBy: user?.email || 'Admin', updatedAt: new Date().toISOString() };
        }
        return d;
      });

      await updateDoc(userDocRef, { kycDocuments: updatedDocs });
      setSelectedCustomer(prev => ({ ...prev, kycDocuments: updatedDocs }));
      toast.success(`Document marked as ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Filter Customers
  const filteredCustomers = customers.filter(c => {
    const search = searchTerm.toLowerCase();
    const matchSearch =
      (c.name || '').toLowerCase().includes(search) ||
      (c.phone ? String(c.phone) : '').includes(searchTerm) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.district || '').toLowerCase().includes(search);

    const stats = customerAnalytics[c.id] || {};
    const matchPersona = personaFilter === 'ALL' || stats.persona === personaFilter;

    return matchSearch && matchPersona;
  });

  // Export to Excel / CSV Handler
  const handleExportFarmers = (format = 'excel') => {
    if (!filteredCustomers || filteredCustomers.length === 0) {
      toast.error('No farmers available to export');
      return;
    }

    const exportRows = filteredCustomers.map(c => {
      const stats = customerAnalytics[c.id] || { ordersCount: 0, totalSpent: 0 };
      const age = getFarmerAge(c);
      const land = getLandSize(c);
      const unit = getLandUnit(c);
      const crops = getCropAllocations(c);

      const activeCropsList = crops.length > 0
        ? crops.map(cr => cr.name).filter(Boolean).join(', ')
        : 'None';

      const sowingMonthList = crops.length > 0
        ? crops
            .filter(cr => cr.sowingMonth && cr.sowingMonth !== '—')
            .map(cr => `${cr.name} (${cr.sowingMonth})`)
            .join('; ') || '—'
        : (c.sowingMonth || '—');

      let regDate = '—';
      if (c.createdAt?.toDate) {
        regDate = c.createdAt.toDate().toLocaleDateString('en-IN');
      } else if (c.createdAt) {
        const d = new Date(c.createdAt);
        regDate = !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN') : '—';
      }

      return {
        'Customer Name': c.name || 'Anonymous Farmer',
        'Mobile Number': c.phone || c.mobile || '—',
        'Age': age !== null && age !== undefined ? age : '—',
        'Total Land (Katha/Unit)': land > 0 ? `${land} ${unit}` : `0 ${unit}`,
        'Active Crops List': activeCropsList,
        'Sowing Month': sowingMonthList,
        'District': c.district || 'Bihar',
        'State': c.state || 'Bihar',
        'Lifetime Orders': stats.ordersCount || 0,
        'Total Spent (LTV)': stats.totalSpent || 0,
        'Registration Date': regDate
      };
    });

    const filePrefix = `KrishiVishal_Farmers_${personaFilter.toLowerCase()}`;
    if (format === 'csv') {
      exportToCSV(exportRows, filePrefix);
      toast.success(`Exported ${exportRows.length} farmers to CSV`);
    } else {
      exportToExcel(exportRows, filePrefix, 'Farmers Directory');
      toast.success(`Exported ${exportRows.length} farmers to Excel (.xlsx)`);
    }
  };

  // [FIXED] Point #92: PII Masking utility for phone numbers
  const maskPhone = (phone) => {
    if (!phone) return '—';
    if (!isMasked) return phone;
    const s = String(phone);
    if (s.length < 10) return s;
    return s.substring(0, 3) + 'XXXX' + s.substring(s.length - 3);
  };

  // Table Columns
  const columns = [
    {
      header: 'Farmer Profile',
      render: (c) => (
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-[#1b5e20]/10 text-[#1b5e20] rounded-2xl flex items-center justify-center font-black text-sm border border-[#1b5e20]/10">
            {c.name?.charAt(0).toUpperCase() || 'F'}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-gray-900 tracking-tight text-xs leading-none mb-1">{c.name || 'Anonymous Farmer'}</span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">
              {maskPhone(c.phone || c.email)}
            </span>
          </div>
        </div>
      )
    },
    {
      header: 'Farm & Land',
      render: (c) => {
        const age = getFarmerAge(c);
        const land = getLandSize(c);
        const unit = getLandUnit(c);
        const crops = getCropAllocations(c);
        return (
          <div>
            <div className="flex items-center gap-1.5 font-mono text-xs font-black text-gray-900">
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                {age ? `${age} Yrs` : '— Yrs'}
              </span>
              <span>•</span>
              <span className="text-gray-800">{land > 0 ? `${land} ${unit}` : '—'}</span>
            </div>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5 truncate max-w-[140px]">
              {crops.length > 0
                ? `${crops.length} Crop${crops.length > 1 ? 's' : ''}: ${crops.map(cr => cr.name).slice(0, 2).join(', ')}${crops.length > 2 ? '...' : ''}`
                : 'No active crops'}
            </p>
          </div>
        );
      }
    },
    {
      header: 'Location',
      render: (c) => (
        <div>
          <span className="text-gray-900 font-black text-xs">{c.district || 'Bihar'}</span>
          <p className="text-[10px] text-gray-400 font-bold">{c.state || 'Bihar'}</p>
        </div>
      )
    },
    {
      header: 'Orders & LTV',
      render: (c) => {
        const stats = customerAnalytics[c.id] || { ordersCount: 0, totalSpent: 0 };
        return (
          <div>
            <span className="font-mono text-xs font-black text-gray-900">₹{stats.totalSpent.toLocaleString('en-IN')}</span>
            <p className="text-[10px] text-gray-500 font-bold">{stats.ordersCount} Total Orders</p>
          </div>
        );
      }
    },
    {
      header: 'Persona & Status',
      render: (c) => {
        const stats = customerAnalytics[c.id] || { persona: 'NEW_FARMER' };
        if (stats.persona === 'HIGH_VALUE') {
          return (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 w-max">
              <Sparkles size={10} className="text-amber-600 fill-amber-600" /> High Value Farmer
            </span>
          );
        }
        if (stats.persona === 'CHURN_RISK') {
          return (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200 flex items-center gap-1 w-max">
              <AlertTriangle size={10} /> Churn Risk (&gt;45d)
            </span>
          );
        }
        if (stats.persona === 'ACTIVE_BUYER') {
          return (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-green-100 text-green-800 border border-green-200 w-max">
              Active Buyer
            </span>
          );
        }
        return (
          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 w-max">
            New Farmer
          </span>
        );
      }
    },
    {
      header: 'KYC Status',
      render: (c) => (
        c.isKycVerified || (c.kycDocuments && c.kycDocuments.length > 0) ? (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1 w-max">
            <ShieldCheck size={11} /> Verified
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-gray-100 text-gray-500 w-max">
            Unverified
          </span>
        )
      )
    },
    {
      header: 'Actions',
      render: (c) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedCustomer(c);
            setActiveTab('overview');
          }}
          className="p-2 hover:bg-emerald-100 text-[#1b5e20] rounded-xl transition-all bg-emerald-50 shadow-sm"
          title="Open 360° Customer Command Center"
        >
          <Eye size={16} />
        </button>
      )
    }
  ];

  // KPI aggregates
  const kpiMetrics = useMemo(() => {
    const analytics = Object.values(customerAnalytics);
    const highValue = analytics.filter(a => a.persona === 'HIGH_VALUE').length;
    const active = analytics.filter(a => a.persona === 'ACTIVE_BUYER' || a.persona === 'HIGH_VALUE').length;
    const churnRisk = analytics.filter(a => a.persona === 'CHURN_RISK').length;
    const newFarmers = analytics.filter(a => a.persona === 'NEW_FARMER').length;
    return { total: customers.length, highValue, active, churnRisk, newFarmers };
  }, [customerAnalytics, customers]);

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Farmers Database & 360° Customer Hub"
        subtitle="Unified Customer Profile, Multi-Address Management, LTV Analytics, Activity Timelines, and KYC Vault"
        actions={[
          {
            label: "Export to Excel",
            icon: Download,
            onClick: () => handleExportFarmers('excel'),
            variant: 'outline',
            className: 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-black'
          },
          {
            label: "Export to CSV",
            icon: Download,
            onClick: () => handleExportFarmers('csv'),
            variant: 'secondary',
            className: 'border-gray-200 text-gray-700 hover:bg-gray-100 font-black'
          }
        ]}
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Farmers" value={kpiMetrics.total} icon={Users} color="blue" />
        <MetricCard label="Active Buyers" value={kpiMetrics.active} icon={Activity} color="green" />
        <MetricCard label="High Value" value={kpiMetrics.highValue} icon={Star} color="amber" />
        <MetricCard label="New Farmers" value={kpiMetrics.newFarmers} icon={Sparkles} color="indigo" />
        <MetricCard label="Churn Risk" value={kpiMetrics.churnRisk} icon={AlertTriangle} color="red" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search Farmer by name, phone, district, email..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/10 focus:border-[#1b5e20] outline-none text-xs font-bold text-gray-900 transition-all"
          />
        </div>

        <select
          value={personaFilter}
          onChange={(e) => setPersonaFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Farmer Personas</option>
          <option value="HIGH_VALUE">⭐ High Value Farmers (₹10k+ LTV)</option>
          <option value="ACTIVE_BUYER">🌱 Active Regular Buyers</option>
          <option value="NEW_FARMER">🌾 New Farmers</option>
          <option value="CHURN_RISK">⚠️ Churn Risk (45+ Days Inactive)</option>
        </select>

        <button
          onClick={() => setIsMasked(!isMasked)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-xs font-black uppercase tracking-widest ${
            isMasked ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'
          }`}
        >
          {isMasked ? <Eye size={14} /> : <X size={14} />}
          {isMasked ? 'Show Phone Nos' : 'Hide PII'}
        </button>

        {/* Export to Excel / CSV Quick Actions in Filter Bar */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => handleExportFarmers('excel')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all text-xs font-black shadow-sm"
            title="Export filtered farmers to Excel (.xlsx)"
          >
            <Download size={14} className="text-emerald-700" />
            <span>Export to Excel</span>
          </button>
          <button
            onClick={() => handleExportFarmers('csv')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all text-xs font-black shadow-sm"
            title="Export filtered farmers to CSV"
          >
            <Download size={14} className="text-gray-500" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filteredCustomers}
        loading={loading}
        onRowClick={(c) => {
          setSelectedCustomer(c);
          setActiveTab('overview');
          setWalletHistory([]);
        }}
      />

      {/* Load More Button */}
      {hasMore && !searchTerm && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchCustomers(true)}
            disabled={loadingMore}
            className="flex items-center gap-2 px-8 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-[#1b5e20] hover:border-[#1b5e20] transition-all shadow-sm disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            <span>{loadingMore ? 'Fetching more farmers...' : 'Load Older Records'}</span>
          </button>
        </div>
      )}

      {/* 360° CUSTOMER COMMAND CENTER DRAWER */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100">
            {/* Drawer Top Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#0e3311] text-white">
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-green-300 flex items-center justify-center text-[#0e3311] font-black text-lg shadow-md">
                  {selectedCustomer.name?.charAt(0).toUpperCase() || 'F'}
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                    {selectedCustomer.name || 'Anonymous Farmer'}
                    <span className="text-[10px] font-mono font-bold bg-white/20 text-emerald-300 px-2 py-0.5 rounded">
                      ID: {selectedCustomer.id.slice(0, 8)}
                    </span>
                  </h2>
                  <p className="text-xs text-emerald-300/80 font-mono">
                    {selectedCustomer.phone} • {selectedCustomer.district || 'Bihar'}, {selectedCustomer.state || 'Bihar'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedCustomer.phone && (
                  <a
                    href={`https://wa.me/91${String(selectedCustomer.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${selectedCustomer.name}, KrishiVishal se call/support update.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white transition-all shadow-sm flex items-center gap-1 text-xs font-black"
                  >
                    <MessageCircle size={15} />
                    WhatsApp
                  </a>
                )}
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all text-white/70 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Dynamic Tabs Navigation Bar */}
            <div className="flex items-center border-b border-gray-100 bg-gray-50 px-6 overflow-x-auto">
              {[
                { id: 'overview', label: 'Overview & Addresses', icon: <MapPin size={14} /> },
                { id: 'farm', label: `Farm & Crops (${selectedCustomer ? getCropAllocations(selectedCustomer).length : 0})`, icon: <Sprout size={14} /> },
                { id: 'orders', label: `Orders (${selectedCustomerOrders.length})`, icon: <Package size={14} /> },
                { id: 'wallet', label: `Wallet (₹${(selectedCustomer.walletBalance || 0).toLocaleString('en-IN')})`, icon: <span style={{fontSize:14}}>💰</span> },
                { id: 'support', label: `Support & Grievances (${selectedCustomerTickets.length + selectedCustomerComplaints.length})`, icon: <Headphones size={14} /> },
                { id: 'timeline', label: `Activity Timeline (${activityTimeline.length})`, icon: <Activity size={14} /> },
                { id: 'kyc', label: `KYC Vault (${selectedCustomer.kycDocuments?.length || 0})`, icon: <FileCheck size={14} /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#1b5e20] text-[#1b5e20] bg-white font-black'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* TAB: FARM, LAND & CROP PROFILE */}
              {activeTab === 'farm' && (() => {
                const age = getFarmerAge(selectedCustomer);
                const totalLand = getLandSize(selectedCustomer);
                const unit = getLandUnit(selectedCustomer);
                const crops = getCropAllocations(selectedCustomer);
                const allocatedLand = crops.reduce((sum, c) => sum + (Number(c.area) || 0), 0);
                const vacantLand = Math.max(0, totalLand - allocatedLand);
                const allocatedPercent = totalLand > 0 ? Math.min(100, Math.round((allocatedLand / totalLand) * 100)) : 0;
                const vacantPercent = totalLand > 0 ? Math.max(0, 100 - allocatedPercent) : 0;

                const getStatusColor = (st) => {
                  const s = String(st || '').toLowerCase();
                  if (s.includes('sown') || s.includes('growing') || s.includes('standing') || s.includes('active')) {
                    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  }
                  if (s.includes('harvested')) {
                    return 'bg-amber-100 text-amber-800 border-amber-200';
                  }
                  if (s.includes('planned') || s.includes('prep')) {
                    return 'bg-blue-100 text-blue-800 border-blue-200';
                  }
                  return 'bg-gray-100 text-gray-700 border-gray-200';
                };

                const CROP_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

                return (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Top Land & Demographics Summary Banner */}
                    <div className="bg-gradient-to-br from-[#0e3311] via-[#1b5e20] to-[#2e7d32] p-6 rounded-3xl text-white shadow-md relative overflow-hidden">
                      <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
                        <Tractor size={180} />
                      </div>

                      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider text-emerald-200 border border-white/10 flex items-center gap-1.5">
                              <Calendar size={13} /> {age ? `Farmer Age: ${age} Yrs` : 'Age: Not Specified'}
                            </span>
                            <span className="px-3 py-1 bg-emerald-400/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider text-emerald-100 border border-emerald-300/20 flex items-center gap-1.5">
                              <MapPin size={13} /> {selectedCustomer.district || 'Bihar'}, {selectedCustomer.state || 'Bihar'}
                            </span>
                          </div>
                          <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                            {selectedCustomer.name || 'Farmer'}&apos;s Agronomy Profile
                          </h3>
                          <p className="text-xs text-emerald-200/90 font-medium mt-1">
                            Real-time farm holding breakdown, crop allocation matrix, and fallow land tracker.
                          </p>
                        </div>

                        {/* Total Land Hero Pill */}
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl text-right shrink-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Total Farm Land</p>
                          <p className="text-3xl font-black font-mono mt-0.5 text-white">
                            {totalLand > 0 ? `${totalLand} ${unit}` : '0 Katha'}
                          </p>
                          <p className="text-[10px] text-emerald-200 font-bold mt-0.5">
                            {crops.length} Active Crop{crops.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* KPI Badges Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Farmer Age Badge */}
                      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Farmer Age</p>
                          <p className="text-xl font-black text-gray-900 mt-1 font-mono">
                            {age ? `${age} Years` : 'Unspecified'}
                          </p>
                          <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                            {age ? (age < 30 ? '🌱 Young Agronomist' : age <= 50 ? '🌾 Mid-Career Farmer' : '🎖️ Veteran Farmer') : 'Profile incomplete'}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          <UserCircle size={22} />
                        </div>
                      </div>

                      {/* Cultivated Land Summary */}
                      <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Cultivated Area</p>
                          <p className="text-xl font-black text-emerald-900 mt-1 font-mono">
                            {allocatedLand} {unit}
                          </p>
                          <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                            {totalLand > 0 ? `${allocatedPercent}% of Total Land` : `${crops.length} Crops recorded`}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          <Sprout size={22} />
                        </div>
                      </div>

                      {/* Vacant / Fallow Land Badge */}
                      <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                        vacantLand > 0
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-gray-50 border-gray-100'
                      }`}>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${
                            vacantLand > 0 ? 'text-amber-800' : 'text-gray-400'
                          }`}>
                            Vacant / Fallow Land
                          </p>
                          <p className={`text-xl font-black mt-1 font-mono ${
                            vacantLand > 0 ? 'text-amber-900' : 'text-gray-700'
                          }`}>
                            {vacantLand} {unit} <span className="text-xs font-bold font-sans">Khali</span>
                          </p>
                          <p className={`text-[10px] font-bold mt-0.5 ${
                            vacantLand > 0 ? 'text-amber-700' : 'text-gray-500'
                          }`}>
                            {totalLand > 0 ? `${vacantPercent}% Available for Sowing` : 'Fully Allocated'}
                          </p>
                        </div>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                          vacantLand > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          <Layers size={22} />
                        </div>
                      </div>
                    </div>

                    {/* Visual Land Allocation Distribution Bar */}
                    {totalLand > 0 && (
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                            <Wheat size={15} className="text-[#1b5e20]" />
                            Land Utilization Breakdown ({totalLand} {unit})
                          </h4>
                          <span className="text-[11px] font-mono font-bold text-gray-500">
                            {allocatedLand} {unit} Sown • {vacantLand} {unit} Khali
                          </span>
                        </div>

                        {/* Stacked Progress Bar */}
                        <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                          {crops.map((crop, idx) => {
                            const pct = totalLand > 0 ? (crop.area / totalLand) * 100 : 0;
                            if (pct <= 0) return null;
                            const color = CROP_COLORS[idx % CROP_COLORS.length];
                            return (
                              <div
                                key={crop.id || idx}
                                title={`${crop.name}: ${crop.area} ${crop.unit || unit} (${Math.round(pct)}%)`}
                                style={{ width: `${pct}%`, backgroundColor: color }}
                                className="h-full transition-all hover:opacity-80 relative"
                              />
                            );
                          })}
                          {vacantLand > 0 && (
                            <div
                              title={`Vacant Land: ${vacantLand} ${unit} (${Math.round(vacantPercent)}%)`}
                              style={{ width: `${vacantPercent}%` }}
                              className="h-full bg-amber-200/90 transition-all hover:opacity-80"
                            />
                          )}
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          {crops.map((crop, idx) => (
                            <div key={crop.id || idx} className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: CROP_COLORS[idx % CROP_COLORS.length] }}
                              />
                              <span>{crop.name}:</span>
                              <span className="font-mono text-gray-900">{crop.area} {crop.unit || unit}</span>
                            </div>
                          ))}
                          {vacantLand > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                              <span>Vacant (Khali):</span>
                              <span className="font-mono">{vacantLand} {unit}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Clean Crop Allocation Cards Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                          <Leaf size={15} className="text-[#1b5e20]" />
                          Allocated Crops &amp; Sowing Schedule ({crops.length})
                        </h4>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Crop Cycle &amp; Growth Status
                        </span>
                      </div>

                      {crops.length === 0 ? (
                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                          <Sprout size={36} className="mx-auto text-emerald-400" />
                          <p className="text-xs font-bold text-gray-700">No Crop Allocations Recorded</p>
                          <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                            Crop details (e.g. Dhan, Phool Gobhi, Kaddu) updated by the farmer in the mobile app or field executive will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {crops.map((crop, idx) => {
                            const badgeColor = getStatusColor(crop.status);
                            const color = CROP_COLORS[idx % CROP_COLORS.length];
                            return (
                              <div
                                key={crop.id || idx}
                                className="bg-white p-4 rounded-2xl border border-gray-200/80 hover:border-emerald-300 hover:shadow-md transition-all space-y-3 relative overflow-hidden"
                              >
                                <div
                                  className="absolute top-0 left-0 right-0 h-1"
                                  style={{ backgroundColor: color }}
                                />

                                <div className="flex items-start justify-between gap-2 pt-1">
                                  <div className="space-y-0.5">
                                    <h5 className="font-black text-gray-900 text-sm tracking-tight flex items-center gap-1.5">
                                      <span className="text-base">🌱</span>
                                      {crop.name}
                                    </h5>
                                    {crop.variety && (
                                      <p className="text-[10px] text-gray-500 font-medium">Variety: {crop.variety}</p>
                                    )}
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${badgeColor}`}>
                                    {crop.status || 'Active'}
                                  </span>
                                </div>

                                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Allocated Area</span>
                                  <span className="font-mono text-xs font-black text-emerald-800">
                                    {crop.area} {crop.unit || unit}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-gray-100">
                                  <div>
                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Sowing Month</span>
                                    <span className="font-bold text-gray-800 flex items-center gap-1 mt-0.5">
                                      <Calendar size={11} className="text-emerald-600" />
                                      {crop.sowingMonth || crop.sowingDate || '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Harvest Month</span>
                                    <span className="font-bold text-gray-800 flex items-center gap-1 mt-0.5">
                                      <Clock size={11} className="text-amber-600" />
                                      {crop.harvestMonth || crop.harvestDate || '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* TAB 1: OVERVIEW & MULTI-ADDRESSES */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Overview Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lifetime Value (LTV)</p>
                      <p className="text-xl font-black text-gray-900 font-mono mt-1">
                        ₹{(customerAnalytics[selectedCustomer.id]?.totalSpent || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Orders</p>
                      <p className="text-xl font-black text-gray-900 font-mono mt-1">
                        {customerAnalytics[selectedCustomer.id]?.ordersCount || 0}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Registration</p>
                      <p className="text-xs font-black text-gray-800 font-mono mt-1.5">
                        {formatDate(selectedCustomer.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Saved Delivery Addresses */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                        <MapPin size={15} className="text-[#1b5e20]" />
                        Saved Delivery Locations {'&'} Hub Addresses
                      </h4>
                      <button
                        onClick={() => setIsAddAddressOpen(true)}
                        className="text-[11px] font-black text-[#1b5e20] hover:underline flex items-center gap-1"
                      >
                        <Plus size={13} /> Add Address
                      </button>
                    </div>

                    {/* Primary Address from Profile */}
                    <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          Primary Default Address
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 mt-1">
                        {selectedCustomer.address || `${selectedCustomer.district || 'Purnea'}, ${selectedCustomer.state || 'Bihar'}`}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono">
                        District: {selectedCustomer.district || 'Bihar'} • State: {selectedCustomer.state || 'Bihar'}
                      </p>
                    </div>

                    {/* Additional Saved Addresses */}
                    {(selectedCustomer.addresses || []).map((addr, idx) => (
                      <div key={addr.id || idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-gray-700 bg-gray-200 px-2 py-0.5 rounded">
                            {addr.label || `Address #${idx + 1}`}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-gray-900 mt-1">{addr.address}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {addr.district}, {addr.state} — PIN: {addr.pin || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: ORDERS & LIFETIME VALUE */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">
                      Past Orders ({selectedCustomerOrders.length})
                    </h4>
                  </div>

                  {selectedCustomerOrders.length === 0 ? (
                    <p className="text-xs text-gray-400 font-medium py-8 text-center bg-gray-50 rounded-2xl">
                      No orders placed by this farmer yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedCustomerOrders.map(order => (
                        <div key={order.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between hover:bg-gray-100/50 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-gray-900">
                                #{order.id.slice(0, 10).toUpperCase()}
                              </span>
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                {order.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 font-medium">
                              {order.items?.length || 0} items • Payment: {order.paymentMethod || 'COD'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-IN') : ''}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-black text-gray-900 font-mono">
                              ₹{order.totalAmount}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: WALLET */}
              {activeTab === 'wallet' && (() => {
                // Load history when tab is first opened
                if (!walletHistoryLoading && walletHistory.length === 0 && selectedCustomer?.id) {
                  setWalletHistoryLoading(true);
                  getDocs(query(
                    collection(db, 'users', selectedCustomer.id, 'wallet_history'),
                    orderBy('timestamp', 'desc'),
                    limit(30)
                  )).then(snap => {
                    setWalletHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setWalletHistoryLoading(false);
                  }).catch((err) => {
                    console.error('Failed to load wallet history:', err);
                    setWalletHistoryLoading(false);
                  });
                }

                const handleAdjust = async (e) => {
                  e.preventDefault();
                  if (!walletAdjustForm.amount || Number(walletAdjustForm.amount) <= 0)
                    return toast.error('Enter a valid amount');
                  setWalletAdjusting(true);
                  try {
                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                    const fns = getFunctions();
                    const adjustFn = httpsCallable(fns, 'adminAdjustWallet');
                    await adjustFn({
                      userId: selectedCustomer.id,
                      amount: Number(walletAdjustForm.amount),
                      type: walletAdjustForm.type,
                      reason: walletAdjustForm.reason,
                    });
                    toast.success(`Wallet ${walletAdjustForm.type} of ₹${walletAdjustForm.amount} applied.`);
                    setWalletAdjustForm({ type: 'CREDIT', amount: '', reason: '' });
                    // Reload history
                    setWalletHistory([]);
                  } catch (err) {
                    toast.error(err.message || 'Adjustment failed');
                  } finally {
                    setWalletAdjusting(false);
                  }
                };

                return (
                  <div className="space-y-6">
                    {/* Balance Header */}
                    <div className="bg-gradient-to-r from-[#0e3311] to-[#1b5e20] p-5 rounded-2xl text-white">
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-300 mb-1">KrishiWallet Balance</p>
                      <p className="text-3xl font-black font-mono">
                        ₹{(selectedCustomer.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-emerald-400 mt-1">Last updated on Firestore real-time</p>
                    </div>

                    {/* Admin Adjustment Form */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 mb-4">Manual Adjustment</h4>
                      <form onSubmit={handleAdjust} className="space-y-3">
                        <div className="flex gap-3">
                          <select
                            value={walletAdjustForm.type}
                            onChange={e => setWalletAdjustForm(f => ({ ...f, type: e.target.value }))}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-black text-gray-700 outline-none"
                          >
                            <option value="CREDIT">➕ Credit (Add)</option>
                            <option value="DEBIT">➖ Debit (Remove)</option>
                          </select>
                          <input
                            type="number"
                            min="1"
                            placeholder="Amount (₹)"
                            value={walletAdjustForm.amount}
                            onChange={e => setWalletAdjustForm(f => ({ ...f, amount: e.target.value }))}
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-[#1b5e20]"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Reason (e.g. Goodwill credit, correction)"
                          value={walletAdjustForm.reason}
                          onChange={e => setWalletAdjustForm(f => ({ ...f, reason: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-[#1b5e20]"
                        />
                        <button
                          type="submit"
                          disabled={walletAdjusting}
                          className="w-full bg-[#1b5e20] text-white text-xs font-black py-2.5 rounded-xl hover:bg-[#0e3311] transition-all disabled:opacity-50"
                        >
                          {walletAdjusting ? 'Processing...' : 'Apply Adjustment'}
                        </button>
                      </form>
                    </div>

                    {/* Transaction History */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">Transaction History</h4>
                        <button
                          onClick={() => { setWalletHistory([]); setWalletHistoryLoading(false); }}
                          className="text-[11px] font-black text-[#1b5e20] hover:underline"
                        >Refresh</button>
                      </div>
                      {walletHistoryLoading ? (
                        <p className="text-xs text-gray-400 text-center py-4">Loading...</p>
                      ) : walletHistory.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-xl">No transactions yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {walletHistory.map(txn => {
                            const isCredit = ['TOP_UP', 'REFUND_CREDIT', 'ADMIN_CREDIT'].includes(txn.type);
                            return (
                              <div key={txn.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {isCredit ? '+' : '-'}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-gray-900">{txn.type?.replace(/_/g, ' ')}</p>
                                    <p className="text-[10px] text-gray-400">{txn.description}</p>
                                    <p className="text-[9px] text-gray-300 font-mono">
                                      {txn.timestamp?.toDate?.().toLocaleString('en-IN') || ''}
                                    </p>
                                  </div>
                                </div>
                                <span className={`text-sm font-black font-mono ${isCredit ? 'text-green-700' : 'text-red-600'}`}>
                                  {isCredit ? '+' : '-'}₹{txn.amount}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* TAB 3: SUPPORT & GRIEVANCES HISTORY */}
              {activeTab === 'support' && (
                <div className="space-y-6">
                  {/* Support Tickets Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                      <Headphones size={15} className="text-[#1b5e20]" />
                      Helpdesk Tickets ({selectedCustomerTickets.length})
                    </h4>

                    {selectedCustomerTickets.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-xl">No tickets logged.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedCustomerTickets.map(t => (
                          <div key={t.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-gray-900">{t.ticketNumber}</span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                  t.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {t.status}
                                </span>
                              </div>
                              <p className="font-bold text-gray-800 mt-0.5">{t.subject}</p>
                              {t.resolutionSummary && (
                                <p className="text-[10px] text-green-700 font-medium">Res: {t.resolutionSummary}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('en-IN') : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Complaints Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-red-900 flex items-center gap-2">
                      <AlertOctagon size={15} className="text-red-600" />
                      Grievances {'&'} Complaints ({selectedCustomerComplaints.length})
                    </h4>

                    {selectedCustomerComplaints.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-xl">No grievances registered.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedCustomerComplaints.map(c => (
                          <div key={c.id} className="p-3.5 bg-red-50/40 rounded-xl border border-red-100 flex items-center justify-between text-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-red-900">{c.complaintNumber}</span>
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-800">
                                  {c.severity}
                                </span>
                              </div>
                              <p className="font-bold text-gray-900 mt-0.5">{c.title}</p>
                              {c.correctiveAction && (
                                <p className="text-[10px] text-red-700 font-medium">Action: {c.correctiveAction}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-IN') : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: CHRONOLOGICAL ACTIVITY TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Farmer 360° Activity Stream ({activityTimeline.length} Events)
                  </h4>

                  {activityTimeline.length === 0 ? (
                    <p className="text-xs text-gray-400 py-8 text-center bg-gray-50 rounded-2xl">No recorded activity yet.</p>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                      {activityTimeline.map((item, idx) => (
                        <div key={idx} className="relative group">
                          {/* Dot / Icon */}
                          <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center shadow-sm">
                            {item.icon}
                          </div>
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-gray-900">{item.title}</span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {item.timestamp ? item.timestamp.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 font-medium">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: FARM & KYC DOCUMENTS VAULT */}
              {activeTab === 'kyc' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                      <FileCheck size={15} className="text-[#1b5e20]" />
                      Farmer KYC {'&'} Land Verification Vault
                    </h4>
                    <button
                      onClick={() => setIsAddDocOpen(true)}
                      className="text-[11px] font-black text-[#1b5e20] hover:underline flex items-center gap-1"
                    >
                      <Plus size={13} /> Attach Document
                    </button>
                  </div>

                  {(selectedCustomer.kycDocuments || []).length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                      <FileText size={32} className="mx-auto text-gray-300" />
                      <p className="text-xs font-bold text-gray-700">No KYC documents attached yet.</p>
                      <p className="text-[11px] text-gray-400">Attach Aadhaar, Kisan Credit Card, or Soil Health Records for high-value purchases.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(selectedCustomer.kycDocuments || []).map((docItem, idx) => (
                        <div key={docItem.id || idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-gray-900">{docItem.docType}</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                              docItem.status === 'VERIFIED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {docItem.status}
                            </span>
                          </div>
                          <p className="text-xs font-mono font-bold text-gray-700">Ref: {docItem.docNumber}</p>
                          <p className="text-[10px] text-gray-400">{docItem.remarks} • Verified by {docItem.verifiedBy?.split('@')[0]}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Close Command Center
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ADDRESS MODAL */}
      {isAddAddressOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 border border-white/20">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Add Delivery Address</h3>
              <button onClick={() => setIsAddAddressOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddAddress} className="space-y-3">
              <input
                type="text"
                required
                value={newAddressForm.label}
                onChange={e => setNewAddressForm({ ...newAddressForm, label: e.target.value })}
                placeholder="Label (e.g. Village Farmhouse, North Plot)"
                className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
              />
              <textarea
                required
                rows={2}
                value={newAddressForm.address}
                onChange={e => setNewAddressForm({ ...newAddressForm, address: e.target.value })}
                placeholder="Full Street / Village / Landmark address..."
                className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-medium"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={newAddressForm.district}
                  onChange={e => setNewAddressForm({ ...newAddressForm, district: e.target.value })}
                  placeholder="District (e.g. Purnea)"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                />
                <input
                  type="text"
                  value={newAddressForm.pin}
                  onChange={e => setNewAddressForm({ ...newAddressForm, pin: e.target.value })}
                  placeholder="PIN Code"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <button
                type="submit"
                disabled={savingDrawerData}
                className="w-full bg-[#1b5e20] text-white py-3 rounded-xl font-black text-xs uppercase"
              >
                Save Address
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADD KYC DOC MODAL */}
      {isAddDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 border border-white/20">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Attach KYC / Farm Document</h3>
              <button onClick={() => setIsAddDocOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddKycDoc} className="space-y-3">
              <select
                value={newDocForm.docType}
                onChange={e => setNewDocForm({ ...newDocForm, docType: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
              >
                {KYC_DOC_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                type="text"
                required
                value={newDocForm.docNumber}
                onChange={e => setNewDocForm({ ...newDocForm, docNumber: e.target.value })}
                placeholder="Document / ID / KCC Number"
                className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
              />
              <input
                type="text"
                value={newDocForm.remarks}
                onChange={e => setNewDocForm({ ...newDocForm, remarks: e.target.value })}
                placeholder="Verification Remarks (e.g. Verified via Aadhar OTP)"
                className="w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-xs font-medium"
              />
              <button
                type="submit"
                disabled={savingDrawerData}
                className="w-full bg-[#1b5e20] text-white py-3 rounded-xl font-black text-xs uppercase"
              >
                Record {'&'} Verify Document
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;

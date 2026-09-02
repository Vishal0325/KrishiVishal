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
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
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
  Activity
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  // Modals inside drawer
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({ label: 'Home Farm', address: '', district: '', state: 'Bihar', pin: '', isPrimary: false });
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [newDocForm, setNewDocForm] = useState({ docType: 'Aadhaar Card (Identity Proof)', docNumber: '', docUrl: '', remarks: '' });
  const [savingDrawerData, setSavingDrawerData] = useState(false);

  // Listen to Users (Customers)
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const farmersOnly = allUsers.filter(u => {
        const isAdmin = u.isAdmin === true || String(u.isAdmin).toLowerCase() === "true";
        const isStaffOrRider = ['SuperAdmin', 'CatalogManager', 'OrderManager', 'RIDER'].includes(u.role);
        return !isAdmin && !isStaffOrRider;
      });
      setCustomers(farmersOnly);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">{c.phone || c.email || 'No contact'}</span>
          </div>
        </div>
      )
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Users className="mr-3 text-[#1b5e20]" size={28} />
            Farmers Database & 360° Customer Hub
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Unified Customer Profile, Multi-Address Management, LTV Analytics, Activity Timelines, and KYC Vault.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search Farmer by name, phone, district, email..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
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
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filteredCustomers}
        loading={loading}
        onRowClick={(c) => {
          setSelectedCustomer(c);
          setActiveTab('overview');
        }}
      />

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
                { id: 'orders', label: `Orders (${selectedCustomerOrders.length})`, icon: <Package size={14} /> },
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
                        Saved Delivery Locations & Hub Addresses
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
                      Grievances & Complaints ({selectedCustomerComplaints.length})
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
                      Farmer KYC & Land Verification Vault
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
                Record & Verify Document
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;

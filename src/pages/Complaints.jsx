import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  AlertOctagon,
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  User,
  Phone,
  Calendar,
  X,
  Loader2,
  MessageSquare,
  Send,
  Package,
  FileWarning,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

const COMPLAINT_CATEGORIES = [
  { value: 'DAMAGED_PRODUCT', label: 'Damaged / Broken Product' },
  { value: 'WRONG_ITEM_DELIVERED', label: 'Wrong Item / Variant Delivered' },
  { value: 'EXPIRED_ITEM', label: 'Expired / Near Expiry Product' },
  { value: 'PACKAGING_LEAKAGE', label: 'Bottle / Bag Leakage in Transit' },
  { value: 'MISSING_ITEM', label: 'Item Missing from Package' },
  { value: 'RIDER_MISBEHAVIOR', label: 'Delivery Rider Misbehavior / Delay' },
  { value: 'OVERCHARGED', label: 'Overcharged / Pricing Discrepancy' },
  { value: 'POOR_EFFICACY', label: 'Ineffective Chemical / Product Quality' },
  { value: 'OTHER', label: 'Other Operational Grievance' }
];

const SEVERITIES = [
  { value: 'MINOR', label: 'Minor', color: 'bg-gray-100 text-gray-700' },
  { value: 'MAJOR', label: 'Major', color: 'bg-amber-100 text-amber-800' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-800 font-black animate-pulse' }
];

const RCA_OPTIONS = [
  'Vendor Packaging Quality Fault',
  'Rough Handling in Transit / Logistics',
  'Warehouse Packing & Picking Error',
  'Delivery Rider Delay or Mishandling',
  'Batch Level Manufacturing Defect',
  'Customer Usage / Application Misunderstanding',
  'System / Catalog Pricing Glitch'
];

const CORRECTIVE_ACTIONS = [
  'REPLACEMENT_ORDER_DISPATCHED',
  'FULL_REFUND_PROCESSED',
  'PARTIAL_REFUND_PROCESSED',
  'APOLOGY_WITH_DISCOUNT_COUPON',
  'SUPPLIER_BATCH_RECALLED',
  'RIDER_PENALIZED_AND_RETRAINED',
  'REJECTED_INVALID_GRIEVANCE'
];

const STATUS_CONFIG = {
  COMPLAINT_LOGGED: { label: 'Logged', color: 'bg-red-100 text-red-800' },
  UNDER_INVESTIGATION: { label: 'Under Investigation', color: 'bg-blue-100 text-blue-800' },
  ACTION_TAKEN: { label: 'Action Taken', color: 'bg-purple-100 text-purple-800' },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rejected', color: 'bg-gray-100 text-gray-600' }
};

const Complaints = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Modals
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // New Complaint Form
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [affectedProductName, setAffectedProductName] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('DAMAGED_PRODUCT');
  const [complaintSeverity, setComplaintSeverity] = useState('MAJOR');
  const [complaintTitle, setComplaintTitle] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [loggingComplaint, setLoggingComplaint] = useState(false);

  // Resolution Form in Drawer
  const [rcaSelected, setRcaSelected] = useState('');
  const [actionSelected, setActionSelected] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [newLogNote, setNewLogNote] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  // Listen to Complaints
  useEffect(() => {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Complaints fetch error:', err);
      toast.error('Failed to load complaints');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Customers & Staff
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const farmers = allUsers.filter(u => !u.isAdmin && !['SuperAdmin', 'OrderManager', 'CatalogManager'].includes(u.role));
      setCustomers(farmers);

      const staff = allUsers.filter(u => u.isAdmin || ['SuperAdmin', 'OrderManager', 'CatalogManager'].includes(u.role));
      setStaffList(staff);
    });
    return unsub;
  }, []);

  // Listen to Orders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Filtered customer orders for dropdown
  const customerOrders = selectedCustomerId
    ? orders.filter(o => o.userId === selectedCustomerId || o.userPhone === customers.find(c => c.id === selectedCustomerId)?.phone)
    : [];

  // Selected Order details & items
  const activeOrderDetails = selectedOrderId
    ? orders.find(o => o.id === selectedOrderId)
    : null;

  // Compute Frequency of Complaints per Customer (Repeated Complainants)
  const complaintCountByCustomer = useMemo(() => {
    const counts = {};
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    complaints.forEach(c => {
      const createdAtMs = c.createdAt?.toMillis ? c.createdAt.toMillis() : new Date(c.createdAt).getTime();
      if (createdAtMs > thirtyDaysAgo && c.customerId) {
        counts[c.customerId] = (counts[c.customerId] || 0) + 1;
      }
    });
    return counts;
  }, [complaints]);

  // Log Complaint Handler
  const handleLogComplaint = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedOrderId || !complaintTitle.trim()) {
      toast.error('Please select customer, order and enter complaint title');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    const order = orders.find(o => o.id === selectedOrderId);
    if (!customer || !order) return;

    setLoggingComplaint(true);
    try {
      const complaintRef = doc(collection(db, 'complaints'));
      const complaintNumber = `CMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${complaintRef.id.slice(0, 4).toUpperCase()}`;

      const newComplaintData = {
        id: complaintRef.id,
        complaintNumber,
        customerId: customer.id,
        customerName: customer.name || 'Anonymous Farmer',
        customerPhone: customer.phone || '',
        customerLocation: `${customer.district || ''} ${customer.state || ''}`.trim() || 'Bihar',
        orderId: order.id,
        orderTotal: order.totalAmount || 0,
        affectedProduct: affectedProductName || 'Whole Order / Delivery Service',
        category: complaintCategory,
        severity: complaintSeverity,
        title: complaintTitle.trim(),
        description: complaintDesc.trim(),
        status: 'COMPLAINT_LOGGED',
        assignedTo: user?.email || 'Unassigned',
        logs: [
          {
            id: `log-${Date.now()}`,
            text: `Complaint logged by ${user?.email || 'Admin'}: ${complaintDesc.trim() || complaintTitle}`,
            author: user?.email || 'Admin',
            timestamp: new Date().toISOString()
          }
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(complaintRef, newComplaintData);
      await addAuditLog('LOG_CUSTOMER_COMPLAINT', 'Complaint', complaintRef.id, {
        complaintNumber,
        customerName: customer.name,
        orderId: order.id
      });

      toast.success(`Complaint ${complaintNumber} registered!`);
      setIsLogModalOpen(false);
      // Reset
      setSelectedCustomerId('');
      setSelectedOrderId('');
      setAffectedProductName('');
      setComplaintTitle('');
      setComplaintDesc('');
    } catch (error) {
      console.error('Complaint logging failed:', error);
      toast.error('Failed to log complaint: ' + error.message);
    } finally {
      setLoggingComplaint(false);
    }
  };

  // Add Investigation Note
  const handleAddInvestigationLog = async (e) => {
    e.preventDefault();
    if (!newLogNote.trim() || !selectedComplaint) return;

    try {
      const docRef = doc(db, 'complaints', selectedComplaint.id);
      const newEntry = {
        id: `log-${Date.now()}`,
        text: newLogNote.trim(),
        author: user?.email || 'Admin',
        timestamp: new Date().toISOString()
      };

      const updatedLogs = [...(selectedComplaint.logs || []), newEntry];
      await updateDoc(docRef, {
        logs: updatedLogs,
        updatedAt: Timestamp.now()
      });

      setSelectedComplaint(prev => ({ ...prev, logs: updatedLogs }));
      setNewLogNote('');
      toast.success('Investigation note recorded');
    } catch (error) {
      toast.error('Failed to add note');
    }
  };

  // Resolve Complaint with RCA & Action
  const handleResolveComplaint = async (statusToSet = 'RESOLVED') => {
    if (!selectedComplaint) return;
    if (statusToSet === 'RESOLVED' && (!rcaSelected || !actionSelected)) {
      toast.error('Please select Root Cause (RCA) and Corrective Action before resolving');
      return;
    }

    setIsSubmittingResolution(true);
    try {
      const docRef = doc(db, 'complaints', selectedComplaint.id);
      const updates = {
        status: statusToSet,
        rootCause: rcaSelected || selectedComplaint.rootCause || 'General resolution',
        correctiveAction: actionSelected || selectedComplaint.correctiveAction || 'RESOLVED',
        resolutionSummary: resolutionSummary || 'Resolved by Support & Operations team',
        resolvedAt: Timestamp.now(),
        resolvedBy: user?.email || 'Admin',
        updatedAt: Timestamp.now()
      };

      await updateDoc(docRef, updates);
      setSelectedComplaint(prev => ({ ...prev, ...updates }));
      toast.success(`Complaint marked as ${statusToSet}`);
    } catch (error) {
      toast.error('Failed to update resolution: ' + error.message);
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Filtered Complaints
  const filteredComplaints = complaints.filter(c => {
    const matchSearch = !searchTerm ||
      c.complaintNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerPhone?.includes(searchTerm) ||
      c.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchCategory = categoryFilter === 'ALL' || c.category === categoryFilter;
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchSeverity = severityFilter === 'ALL' || c.severity === severityFilter;

    return matchSearch && matchCategory && matchStatus && matchSeverity;
  });

  // KPI Metrics
  const totalComplaints = complaints.length;
  const loggedComplaints = complaints.filter(c => c.status === 'COMPLAINT_LOGGED').length;
  const investigatingComplaints = complaints.filter(c => c.status === 'UNDER_INVESTIGATION').length;
  const resolvedComplaints = complaints.filter(c => c.status === 'RESOLVED').length;
  const frequentComplainantsCount = Object.values(complaintCountByCustomer).filter(count => count >= 2).length;

  // Table Columns
  const columns = [
    {
      header: 'Complaint ID',
      key: 'complaintNumber',
      render: (c) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{c.complaintNumber}</span>
          <p className="text-[10px] text-gray-400 font-mono">
            {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
      )
    },
    {
      header: 'Customer & History',
      key: 'customerName',
      render: (c) => {
        const pastCount = complaintCountByCustomer[c.customerId] || 1;
        return (
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-black text-xs text-gray-900">{c.customerName}</p>
              {pastCount >= 2 && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200" title={`${pastCount} complaints in past 30 days`}>
                  ⚠️ Frequent ({pastCount})
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold text-gray-500 font-mono flex items-center gap-1">
              <Phone size={10} /> {c.customerPhone || '—'}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Linked Order & Product',
      key: 'orderId',
      render: (c) => (
        <div>
          <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">
            Ord: #{c.orderId ? c.orderId.slice(0, 8).toUpperCase() : '—'}
          </span>
          <p className="text-[11px] font-bold text-gray-800 truncate max-w-[180px] mt-0.5">
            {c.affectedProduct || 'General'}
          </p>
        </div>
      )
    },
    {
      header: 'Grievance Title & Category',
      key: 'title',
      render: (c) => {
        const cat = COMPLAINT_CATEGORIES.find(item => item.value === c.category);
        return (
          <div className="max-w-xs">
            <p className="font-black text-xs text-gray-900 truncate">{c.title}</p>
            <span className="text-[10px] font-bold text-gray-500">{cat?.label || c.category}</span>
          </div>
        );
      }
    },
    {
      header: 'Severity',
      key: 'severity',
      render: (c) => {
        const s = SEVERITIES.find(item => item.value === c.severity) || SEVERITIES[0];
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${s.color}`}>
            {c.severity}
          </span>
        );
      }
    },
    {
      header: 'Status',
      key: 'status',
      render: (c) => {
        const st = STATUS_CONFIG[c.status] || STATUS_CONFIG.COMPLAINT_LOGGED;
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${st.color}`}>
            {st.label}
          </span>
        );
      }
    },
    {
      header: 'Action',
      render: (c) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedComplaint(c);
            setRcaSelected(c.rootCause || '');
            setActionSelected(c.correctiveAction || '');
            setResolutionSummary(c.resolutionSummary || '');
          }}
          className="p-2 hover:bg-red-100 text-red-700 rounded-xl transition-all bg-red-50 shadow-sm"
          title="Investigate & Resolve Grievance"
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
            <AlertOctagon className="mr-3 text-red-600" size={28} />
            Customer Grievance & Complaint Management
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Track order-linked grievances, damaged goods, repeated complainant detection, and Root Cause Analysis (RCA).
          </p>
        </div>

        <button
          onClick={() => setIsLogModalOpen(true)}
          className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-red-700 transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Log Grievance / Complaint
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Complaints</p>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{totalComplaints}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm bg-red-50/40">
          <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">New Logged</p>
          <p className="text-2xl font-black text-red-600 mt-1 font-mono">{loggedComplaints}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm bg-blue-50/40">
          <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Under Investigation</p>
          <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{investigatingComplaints}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-green-50/40">
          <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Resolved & Rectified</p>
          <p className="text-2xl font-black text-[#1b5e20] mt-1 font-mono">{resolvedComplaints}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm bg-amber-50/50">
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-600" /> Frequent Complainants
          </p>
          <p className="text-2xl font-black text-amber-900 mt-1 font-mono">{frequentComplainantsCount} Farmers</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search Complaint ID, Order ID, Customer, Title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none text-xs font-bold text-gray-900 transition-all"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Categories</option>
          {COMPLAINT_CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="MAJOR">Major</option>
          <option value="MINOR">Minor</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="COMPLAINT_LOGGED">Logged</option>
          <option value="UNDER_INVESTIGATION">Under Investigation</option>
          <option value="ACTION_TAKEN">Action Taken</option>
          <option value="RESOLVED">Resolved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filteredComplaints}
        loading={loading}
        onRowClick={(c) => {
          setSelectedComplaint(c);
          setRcaSelected(c.rootCause || '');
          setActionSelected(c.correctiveAction || '');
          setResolutionSummary(c.resolutionSummary || '');
        }}
      />

      {/* LOG COMPLAINT MODAL */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <AlertOctagon size={20} className="text-red-600" />
                  Register Customer Grievance
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Every complaint must be bound to a verified Customer Order.
                </p>
              </div>
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleLogComplaint} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer / Farmer *</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    setSelectedOrderId('');
                    setAffectedProductName('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-red-500"
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => {
                    const pastCount = complaintCountByCustomer[c.id] || 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Anonymous'} ({c.phone}) {pastCount >= 2 ? `[⚠️ ${pastCount} past complaints]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Order Selector (MANDATORY) */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Associated Order *</label>
                <select
                  required
                  disabled={!selectedCustomerId}
                  value={selectedOrderId}
                  onChange={(e) => {
                    setSelectedOrderId(e.target.value);
                    setAffectedProductName('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-red-500 disabled:opacity-50"
                >
                  <option value="">-- Select Customer Order --</option>
                  {customerOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      Order #{o.id.slice(0, 10).toUpperCase()} — ₹{o.totalAmount} ({o.status}) - {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Affected Product (Optional dropdown if order has items) */}
              {activeOrderDetails && activeOrderDetails.items && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Affected Product / Item</label>
                  <select
                    value={affectedProductName}
                    onChange={(e) => setAffectedProductName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-red-500"
                  >
                    <option value="">Whole Order / Delivery Incident</option>
                    {activeOrderDetails.items.map((item, idx) => (
                      <option key={idx} value={item.name || item.title}>
                        {item.name || item.title} (Qty: {item.quantity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category & Severity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Grievance Category</label>
                  <select
                    value={complaintCategory}
                    onChange={(e) => setComplaintCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-red-500"
                  >
                    {COMPLAINT_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Severity</label>
                  <select
                    value={complaintSeverity}
                    onChange={(e) => setComplaintSeverity(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-xs text-gray-900 outline-none focus:border-red-500"
                  >
                    {SEVERITIES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Grievance Headline *</label>
                <input
                  type="text"
                  required
                  value={complaintTitle}
                  onChange={(e) => setComplaintTitle(e.target.value)}
                  placeholder="e.g. Pesticide bottle seal broken and leaked inside bag"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-red-500"
                />
              </div>

              {/* Detailed Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Incident Description & Farmer Feedback</label>
                <textarea
                  rows={3}
                  value={complaintDesc}
                  onChange={(e) => setComplaintDesc(e.target.value)}
                  placeholder="Describe exact condition upon unboxing, driver comments, etc."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-medium text-xs text-gray-900 outline-none focus:border-red-500"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loggingComplaint}
                className="w-full bg-red-600 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loggingComplaint && <Loader2 size={16} className="animate-spin" />}
                Register Complaint & Initiate RCA
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GRIEVANCE RESOLUTION & RCA DRAWER */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100">
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-950 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-white/20 text-red-300 px-2 py-0.5 rounded">
                    {selectedComplaint.complaintNumber}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-red-500/30 text-white px-2 py-0.5 rounded">
                    {selectedComplaint.severity}
                  </span>
                </div>
                <h2 className="text-base font-black tracking-tight mt-1 text-white truncate max-w-md">
                  {selectedComplaint.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedComplaint(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-all text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Customer Card with Frequent Warning */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Farmer Profile</p>
                    <p className="text-sm font-black text-gray-900">{selectedComplaint.customerName}</p>
                    <p className="text-xs text-gray-500">{selectedComplaint.customerLocation}</p>
                  </div>
                  {selectedComplaint.customerPhone && (
                    <a
                      href={`tel:${selectedComplaint.customerPhone}`}
                      className="flex items-center gap-1.5 bg-red-600 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-red-700"
                    >
                      <Phone size={13} />
                      Call Farmer
                    </a>
                  )}
                </div>

                {/* Frequent Complainant Alert */}
                {(complaintCountByCustomer[selectedComplaint.customerId] || 0) >= 2 && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2">
                    <ShieldAlert size={18} className="text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-black text-red-900">⚠️ FREQUENT COMPLAINANT ALERT</p>
                      <p className="text-[10px] text-red-700">
                        This customer has logged {complaintCountByCustomer[selectedComplaint.customerId]} complaints in the last 30 days. Priority supervisor review recommended.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Info Card */}
              <div className="bg-blue-50/40 p-4 rounded-2xl border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package size={22} className="text-blue-600" />
                  <div>
                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Associated Order</p>
                    <p className="font-mono text-xs font-black text-gray-900">
                      #{selectedComplaint.orderId?.slice(0, 10).toUpperCase()} (₹{selectedComplaint.orderTotal || 0})
                    </p>
                    <p className="text-[11px] text-gray-600 font-bold mt-0.5">
                      Product: {selectedComplaint.affectedProduct}
                    </p>
                  </div>
                </div>
              </div>

              {/* Root Cause Analysis (RCA) Section */}
              <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <FileWarning size={16} className="text-amber-700" />
                  Root Cause Analysis (RCA) & Corrective Action
                </h4>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Identified Root Cause (RCA)</label>
                    <select
                      value={rcaSelected}
                      onChange={(e) => setRcaSelected(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-bold text-xs text-gray-900 outline-none"
                    >
                      <option value="">-- Select Root Cause --</option>
                      {RCA_OPTIONS.map((rca, idx) => (
                        <option key={idx} value={rca}>{rca}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Corrective Redressal Action</label>
                    <select
                      value={actionSelected}
                      onChange={(e) => setActionSelected(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-black text-xs text-gray-900 outline-none"
                    >
                      <option value="">-- Select Corrective Action --</option>
                      {CORRECTIVE_ACTIONS.map((act, idx) => (
                        <option key={idx} value={act}>{act.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Resolution Summary & Outcome</label>
                    <input
                      type="text"
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      placeholder="e.g. Free replacement dispatched via Blue Dart, supplier warned for bottle cap seal"
                      className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-bold text-xs text-gray-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Investigation Log History */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  <MessageSquare size={14} className="text-red-600" />
                  Investigation Trail & Staff Notes
                </h4>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(selectedComplaint.logs || []).map((log, index) => (
                    <div key={log.id || index} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs space-y-0.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black text-gray-800">{log.author}</span>
                        <span className="text-gray-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-700">{log.text}</p>
                    </div>
                  ))}
                </div>

                {/* Add Investigation Log Form */}
                <form onSubmit={handleAddInvestigationLog} className="flex gap-2">
                  <input
                    type="text"
                    value={newLogNote}
                    onChange={(e) => setNewLogNote(e.target.value)}
                    placeholder="Add audit note or warehouse inspection finding..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    disabled={!newLogNote.trim()}
                    className="bg-red-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1 hover:bg-red-700"
                  >
                    <Send size={13} />
                    Log
                  </button>
                </form>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <button
                onClick={() => setSelectedComplaint(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Close
              </button>

              <div className="flex gap-2">
                {selectedComplaint.status !== 'UNDER_INVESTIGATION' && selectedComplaint.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleResolveComplaint('UNDER_INVESTIGATION')}
                    className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase hover:bg-blue-700"
                  >
                    Mark Investigating
                  </button>
                )}

                {selectedComplaint.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleResolveComplaint('RESOLVED')}
                    disabled={isSubmittingResolution}
                    className="bg-green-700 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-green-800 flex items-center gap-1.5"
                  >
                    {isSubmittingResolution ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Complete Resolution
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Complaints;

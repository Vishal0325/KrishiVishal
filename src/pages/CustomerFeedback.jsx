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
import { formatDateTime } from '../utils/formatters';
import {
  Star,
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Phone,
  Calendar,
  X,
  Loader2,
  MessageSquare,
  Send,
  Package,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Headphones,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

const FEEDBACK_CATEGORIES = [
  'Product Quality & Efficacy',
  'Delivery Speed & Packaging',
  'Delivery Rider Courtesy',
  'Pricing & Value for Money',
  'Mobile App Experience',
  'Customer Support Assistance',
  'General Feedback'
];

const CustomerFeedback = () => {
  const { user } = useAuth();
  const [feedbackList, setFeedbackList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Modals
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [ratingValue, setRatingValue] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState('Product Quality & Efficacy');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [recordingFeedback, setRecordingFeedback] = useState(false);

  // Follow-up Note in Drawer
  const [followupNote, setFollowupNote] = useState('');
  const [convertingToTicket, setConvertingToTicket] = useState(false);

  // Listen to Customer Feedback collection
  useEffect(() => {
    const q = query(collection(db, 'customer_feedback'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setFeedbackList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Feedback fetch error:', err);
      toast.error('Failed to load feedback');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Customers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const farmers = allUsers.filter(u => !u.isAdmin && !['SuperAdmin', 'OrderManager', 'CatalogManager'].includes(u.role));
      setCustomers(farmers);
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

  // Customer orders for dropdown
  const customerOrders = selectedCustomerId
    ? orders.filter(o => o.userId === selectedCustomerId || o.userPhone === customers.find(c => c.id === selectedCustomerId)?.phone)
    : [];

  // CSAT Analytics Calculations
  const totalReviews = feedbackList.length;
  const averageRating = totalReviews > 0
    ? (feedbackList.reduce((acc, f) => acc + (Number(f.rating) || 0), 0) / totalReviews).toFixed(1)
    : '0.0';

  const positiveReviews = feedbackList.filter(f => Number(f.rating) >= 4).length;
  const neutralReviews = feedbackList.filter(f => Number(f.rating) === 3).length;
  const negativeReviews = feedbackList.filter(f => Number(f.rating) <= 2).length;

  const positivePercent = totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0;
  const actionRequiredCount = feedbackList.filter(f => f.actionRequired && !f.escalatedTicketId).length;

  // Record Feedback Handler
  const handleRecordFeedback = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId || !feedbackComments.trim()) {
      toast.error('Please select customer and write review comments');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return;

    const isLowRating = Number(ratingValue) <= 2;

    setRecordingFeedback(true);
    try {
      const feedbackRef = doc(collection(db, 'customer_feedback'));
      const feedbackData = {
        id: feedbackRef.id,
        customerId: customer.id,
        customerName: customer.name || 'Anonymous Farmer',
        customerPhone: customer.phone || '',
        customerLocation: `${customer.district || ''} ${customer.state || ''}`.trim() || 'Bihar',
        orderId: selectedOrderId || null,
        rating: Number(ratingValue),
        category: feedbackCategory,
        title: feedbackTitle.trim() || `${ratingValue} Star Review`,
        comments: feedbackComments.trim(),
        actionRequired: isLowRating,
        status: isLowRating ? 'ACTION_REQUIRED' : 'RECORDED',
        followupLogs: [
          {
            id: `log-${Date.now()}`,
            text: `Feedback recorded by ${user?.email || 'Admin'}. Rating: ${ratingValue}★`,
            timestamp: new Date().toISOString()
          }
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(feedbackRef, feedbackData);
      await addAuditLog('RECORD_CUSTOMER_FEEDBACK', 'CustomerFeedback', feedbackRef.id, {
        customerName: customer.name,
        rating: ratingValue,
        actionRequired: isLowRating
      });

      if (isLowRating) {
        toast.success(`Negative review (${ratingValue}★) flagged for urgent follow-up!`);
      } else {
        toast.success(`Feedback of ${ratingValue}★ saved!`);
      }

      setIsRecordModalOpen(false);
      // Reset
      setSelectedCustomerId('');
      setSelectedOrderId('');
      setRatingValue(5);
      setFeedbackTitle('');
      setFeedbackComments('');
    } catch (error) {
      console.error('Feedback record error:', error);
      toast.error('Failed to save feedback: ' + error.message);
    } finally {
      setRecordingFeedback(false);
    }
  };

  // 1-Click Convert Negative Feedback to Support Ticket
  const handleConvertToTicket = async (feedbackItem) => {
    if (!feedbackItem) return;

    setConvertingToTicket(true);
    try {
      const ticketRef = doc(collection(db, 'support_tickets'));
      const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${ticketRef.id.slice(0, 4).toUpperCase()}`;

      const newTicketData = {
        id: ticketRef.id,
        ticketNumber,
        customerId: feedbackItem.customerId,
        customerName: feedbackItem.customerName,
        customerPhone: feedbackItem.customerPhone,
        customerEmail: feedbackItem.customerEmail || '',
        customerLocation: feedbackItem.customerLocation || 'Bihar',
        orderId: feedbackItem.orderId || null,
        subject: `[Low Rating ${feedbackItem.rating}★ Follow-up] ${feedbackItem.title || feedbackItem.category}`,
        issueType: 'Customer Escalation (Low Rating)',
        priority: 'URGENT',
        status: 'OPEN',
        assignedTo: user?.email || 'Unassigned',
        description: `Customer gave ${feedbackItem.rating} Stars. Feedback: "${feedbackItem.comments}"`,
        sourceFeedbackId: feedbackItem.id,
        notes: [
          {
            id: `note-${Date.now()}`,
            text: `Escalated automatically from negative review (${feedbackItem.rating}★). Customer requires immediate resolution call.`,
            author: user?.email || 'Admin',
            authorName: 'CRM Auto-Escalation Engine',
            timestamp: new Date().toISOString()
          }
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(ticketRef, newTicketData);

      // Update feedback record to link ticket
      const feedbackDocRef = doc(db, 'customer_feedback', feedbackItem.id);
      const updatedLogs = [
        ...(feedbackItem.followupLogs || []),
        {
          id: `log-${Date.now()}`,
          text: `Converted to Urgent Support Ticket ${ticketNumber} by ${user?.email || 'Admin'}`,
          timestamp: new Date().toISOString()
        }
      ];

      await updateDoc(feedbackDocRef, {
        escalatedTicketId: ticketRef.id,
        escalatedTicketNumber: ticketNumber,
        status: 'ESCALATED_TO_TICKET',
        actionRequired: false,
        followupLogs: updatedLogs,
        updatedAt: Timestamp.now()
      });

      if (selectedFeedback && selectedFeedback.id === feedbackItem.id) {
        setSelectedFeedback(prev => ({
          ...prev,
          escalatedTicketId: ticketRef.id,
          escalatedTicketNumber: ticketNumber,
          status: 'ESCALATED_TO_TICKET',
          actionRequired: false,
          followupLogs: updatedLogs
        }));
      }

      toast.success(`Created Urgent Ticket ${ticketNumber} for this feedback!`);
    } catch (error) {
      console.error('Escalation failed:', error);
      toast.error('Failed to create ticket: ' + error.message);
    } finally {
      setConvertingToTicket(false);
    }
  };

  // Add Follow-up Note in Drawer
  const handleAddFollowupNote = async (e) => {
    e.preventDefault();
    if (!followupNote.trim() || !selectedFeedback) return;

    try {
      const docRef = doc(db, 'customer_feedback', selectedFeedback.id);
      const newEntry = {
        id: `log-${Date.now()}`,
        text: followupNote.trim(),
        author: user?.email || 'Admin',
        timestamp: new Date().toISOString()
      };

      const updatedLogs = [...(selectedFeedback.followupLogs || []), newEntry];
      await updateDoc(docRef, {
        followupLogs: updatedLogs,
        updatedAt: Timestamp.now()
      });

      setSelectedFeedback(prev => ({ ...prev, followupLogs: updatedLogs }));
      setFollowupNote('');
      toast.success('Follow-up note logged');
    } catch (error) {
      toast.error('Failed to add note');
    }
  };

  // Filtered List
  const filteredFeedback = feedbackList.filter(f => {
    const matchSearch = !searchTerm ||
      f.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.customerPhone?.includes(searchTerm) ||
      f.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.comments?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.orderId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchRating = ratingFilter === 'ALL' || String(f.rating) === ratingFilter;
    const matchCategory = categoryFilter === 'ALL' || f.category === categoryFilter;

    let matchAction = true;
    if (actionFilter === 'ACTION_REQUIRED') matchAction = f.actionRequired && !f.escalatedTicketId;
    if (actionFilter === 'ESCALATED') matchAction = !!f.escalatedTicketId;
    if (actionFilter === 'RESOLVED') matchAction = f.status === 'RESOLVED';

    return matchSearch && matchRating && matchCategory && matchAction;
  });

  // Table Columns
  const columns = [
    {
      header: 'Rating & Sentiment',
      key: 'rating',
      render: (f) => {
        const rating = Number(f.rating) || 5;
        const isNegative = rating <= 2;
        const isNeutral = rating === 3;
        return (
          <div className="flex items-center gap-2">
            <div className="flex text-amber-400">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  className={i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}
                />
              ))}
            </div>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
              isNegative ? 'bg-red-100 text-red-800' : isNeutral ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
            }`}>
              {rating}.0
            </span>
          </div>
        );
      }
    },
    {
      header: 'Customer',
      key: 'customerName',
      render: (f) => (
        <div>
          <p className="font-black text-xs text-gray-900">{f.customerName}</p>
          <span className="text-[10px] font-bold text-gray-500 font-mono flex items-center gap-1">
            <Phone size={10} /> {f.customerPhone || '—'}
          </span>
        </div>
      )
    },
    {
      header: 'Feedback & Comments',
      key: 'comments',
      render: (f) => (
        <div className="max-w-xs">
          <p className="font-black text-xs text-gray-900 truncate">{f.title || f.category}</p>
          <p className="text-[11px] text-gray-600 font-medium truncate mt-0.5 italic">
            "{f.comments}"
          </p>
          <span className="text-[10px] font-bold text-gray-400 mt-1 block">
            {f.category}
          </span>
        </div>
      )
    },
    {
      header: 'Linked Order',
      key: 'orderId',
      render: (f) => (
        f.orderId ? (
          <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">
            #{f.orderId.slice(0, 8).toUpperCase()}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400 font-mono">General</span>
        )
      )
    },
    {
      header: 'Escalation Status',
      key: 'status',
      render: (f) => {
        if (f.escalatedTicketNumber) {
          return (
            <span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 flex items-center gap-1">
              <Headphones size={11} /> {f.escalatedTicketNumber}
            </span>
          );
        }
        if (f.actionRequired) {
          return (
            <span className="text-[10px] font-black uppercase text-red-800 bg-red-100 px-2.5 py-1 rounded-full border border-red-200 animate-pulse flex items-center gap-1">
              <Flame size={11} /> Action Required
            </span>
          );
        }
        return (
          <span className="text-[10px] font-black uppercase text-green-800 bg-green-50 px-2 py-0.5 rounded">
            Satisfied
          </span>
        );
      }
    },
    {
      header: 'Actions',
      render: (f) => (
        <div className="flex items-center gap-1.5">
          {f.actionRequired && !f.escalatedTicketId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConvertToTicket(f);
              }}
              disabled={convertingToTicket}
              className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1"
              title="Convert this negative review into an urgent support ticket"
            >
              <Headphones size={12} />
              Ticket
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFeedback(f);
            }}
            className="p-2 hover:bg-amber-100 text-amber-800 rounded-xl transition-all bg-amber-50 shadow-sm"
            title="View Details"
          >
            <Eye size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Star className="mr-3 text-amber-500 fill-amber-500" size={28} />
            Customer Feedback & CSAT Ratings
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Monitor customer satisfaction scores (CSAT), reviews, and auto-escalate low ratings to helpdesk tickets.
          </p>
        </div>

        <button
          onClick={() => setIsRecordModalOpen(true)}
          className="bg-amber-500 text-gray-900 px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-400 transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Record Customer Review
        </button>
      </div>

      {/* CSAT KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1">
            <Sparkles size={12} className="text-amber-600" /> Overall CSAT Rating
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-black text-gray-900 font-mono">{averageRating}</p>
            <span className="text-xs font-bold text-gray-400">/ 5.0 ⭐</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Reviews</p>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{totalReviews}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-green-50/30">
          <p className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center gap-1">
            <ThumbsUp size={12} /> Positive (4-5★)
          </p>
          <p className="text-2xl font-black text-green-700 mt-1 font-mono">{positivePercent}% ({positiveReviews})</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm bg-blue-50/30">
          <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1">
            <Meh size={12} /> Neutral (3★)
          </p>
          <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{neutralReviews}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm bg-red-50/40">
          <p className="text-[10px] font-black text-red-700 uppercase tracking-widest flex items-center gap-1">
            <Flame size={12} /> Action Required (1-2★)
          </p>
          <p className="text-2xl font-black text-red-600 mt-1 font-mono">{actionRequiredCount}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search Farmer, Phone, Order ID, Review comment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 outline-none text-xs font-bold text-gray-900 transition-all"
          />
        </div>

        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Ratings</option>
          <option value="5">5 Stars ⭐⭐⭐⭐⭐</option>
          <option value="4">4 Stars ⭐⭐⭐⭐</option>
          <option value="3">3 Stars ⭐⭐⭐</option>
          <option value="2">2 Stars ⭐⭐</option>
          <option value="1">1 Star ⭐</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Categories</option>
          {FEEDBACK_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Action Statuses</option>
          <option value="ACTION_REQUIRED">🚨 Action Required (Low Rating)</option>
          <option value="ESCALATED">🎧 Escalated to Ticket</option>
          <option value="RESOLVED">✅ Satisfied</option>
        </select>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filteredFeedback}
        loading={loading}
        onRowClick={(f) => setSelectedFeedback(f)}
      />

      {/* RECORD FEEDBACK MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Star size={20} className="text-amber-500 fill-amber-500" />
                  Record Customer Review / Feedback
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Log farmer rating, delivery feedback, and auto-flag if assistance required.
                </p>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordFeedback} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer / Farmer *</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    setSelectedOrderId('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-amber-500"
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Anonymous'} ({c.phone}) - {c.district || c.state || 'Bihar'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Order Link */}
              {selectedCustomerId && customerOrders.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Associated Order (Optional)</label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-amber-500"
                  >
                    <option value="">-- General Service Feedback --</option>
                    {customerOrders.map(o => (
                      <option key={o.id} value={o.id}>
                        Order #{o.id.slice(0, 8).toUpperCase()} — ₹{o.totalAmount} ({o.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Interactive Star Rating Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer Rating (1 to 5 Stars) *</label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-1 cursor-pointer">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRatingValue(star)}
                        className="p-1 hover:scale-125 transition-transform"
                      >
                        <Star
                          size={28}
                          className={star <= ratingValue ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-sm font-black text-gray-900 font-mono ml-2">
                    {ratingValue} / 5 Stars
                  </span>
                  {ratingValue <= 2 && (
                    <span className="text-[10px] font-black uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded ml-auto animate-pulse">
                      🚨 Will Auto-Escalate
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Feedback Domain</label>
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-amber-500"
                >
                  {FEEDBACK_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Headline */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Review Headline</label>
                <input
                  type="text"
                  value={feedbackTitle}
                  onChange={(e) => setFeedbackTitle(e.target.value)}
                  placeholder="e.g. Very fast delivery, crop fungicide worked great!"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-amber-500"
                />
              </div>

              {/* Comments */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Detailed Farmer Comments *</label>
                <textarea
                  rows={3}
                  required
                  value={feedbackComments}
                  onChange={(e) => setFeedbackComments(e.target.value)}
                  placeholder="Enter verbatim feedback from call or app review..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-medium text-xs text-gray-900 outline-none focus:border-amber-500"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={recordingFeedback}
                className="w-full bg-amber-500 text-gray-900 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {recordingFeedback && <Loader2 size={16} className="animate-spin" />}
                Save Customer Review
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FEEDBACK DETAIL & ESCALATION DRAWER */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100">
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-amber-950 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={15}
                        className={i < selectedFeedback.rating ? 'fill-amber-400 text-amber-400' : 'text-amber-900'}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white/20 text-amber-300 px-2 py-0.5 rounded">
                    {selectedFeedback.rating}.0 / 5.0
                  </span>
                </div>
                <h2 className="text-base font-black tracking-tight mt-1 text-white truncate max-w-md">
                  {selectedFeedback.title || selectedFeedback.category}
                </h2>
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-all text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Customer Profile Card */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Farmer</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{selectedFeedback.customerName}</p>
                  <p className="text-xs text-gray-500">{selectedFeedback.customerLocation}</p>
                </div>
                {selectedFeedback.customerPhone && (
                  <a
                    href={`tel:${selectedFeedback.customerPhone}`}
                    className="flex items-center gap-1.5 bg-[#1b5e20] text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-[#2e7d32]"
                  >
                    <Phone size={13} />
                    Call Farmer
                  </a>
                )}
              </div>

              {/* Review Comments Box */}
              <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200 space-y-2">
                <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest flex items-center gap-1">
                  <MessageSquare size={13} /> Farmer Transcript / Review
                </p>
                <p className="text-sm text-gray-900 font-bold leading-relaxed">
                  "{selectedFeedback.comments}"
                </p>
                <span className="text-[10px] font-bold text-gray-400 block pt-1">
                  Category: {selectedFeedback.category}
                </span>
              </div>

              {/* Escalation Status & Action Card */}
              {selectedFeedback.actionRequired && !selectedFeedback.escalatedTicketId && (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame size={18} className="text-red-600" />
                    <div>
                      <p className="text-xs font-black text-red-900">🚨 LOW RATING ESCALATION TRIGGER</p>
                      <p className="text-[10px] text-red-700">
                        This review received {selectedFeedback.rating} Stars. Convert to an Urgent Support Ticket for agent follow-up.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleConvertToTicket(selectedFeedback)}
                    disabled={convertingToTicket}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2"
                  >
                    {convertingToTicket ? <Loader2 size={14} className="animate-spin" /> : <Headphones size={14} />}
                    Convert to Urgent Support Ticket
                  </button>
                </div>
              )}

              {/* If already escalated */}
              {selectedFeedback.escalatedTicketNumber && (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Headphones size={18} className="text-blue-600" />
                    <div>
                      <p className="text-xs font-black text-blue-900">Escalated to Helpdesk Ticket</p>
                      <p className="text-[10px] text-blue-700 font-mono">{selectedFeedback.escalatedTicketNumber}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-200 text-blue-900 px-2 py-1 rounded">
                    Active Ticket
                  </span>
                </div>
              )}

              {/* Follow-up Notes History */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  <Calendar size={14} className="text-amber-600" />
                  Follow-up Audit Log
                </h4>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {(selectedFeedback.followupLogs || []).map((log, index) => (
                    <div key={log.id || index} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs space-y-0.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black text-gray-800">{log.author || 'Admin'}</span>
                        <span className="text-gray-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-700">{log.text}</p>
                    </div>
                  ))}
                </div>

                {/* Add Follow-up note */}
                <form onSubmit={handleAddFollowupNote} className="flex gap-2">
                  <input
                    type="text"
                    value={followupNote}
                    onChange={(e) => setFollowupNote(e.target.value)}
                    placeholder="Log agent call response or resolution note..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={!followupNote.trim()}
                    className="bg-amber-500 text-gray-900 px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1 hover:bg-amber-400"
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
                onClick={() => setSelectedFeedback(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerFeedback;

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import {
  Users,
  Headphones,
  AlertOctagon,
  Star,
  Activity,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Phone,
  Package,
  Calendar,
  ArrowRight,
  ChevronRight,
  UserCheck,
  MessageSquare,
  ThumbsUp,
  Clock
} from 'lucide-react';

const CRMDashboard = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Listen to Users (Farmers)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const farmers = all.filter(u => !u.isAdmin && !['SuperAdmin', 'CatalogManager', 'OrderManager', 'RIDER'].includes(u.role));
      setCustomers(farmers);
      setLoading(false);
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

  // Listen to Support Tickets
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc')), (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to Complaints
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'complaints'), orderBy('createdAt', 'desc')), (snap) => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to Feedback
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'customer_feedback'), orderBy('createdAt', 'desc')), (snap) => {
      setFeedbackList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Compute Persona Stats
  const personaStats = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const fortyFiveDaysAgo = Date.now() - 45 * 24 * 60 * 60 * 1000;

    let highValueCount = 0;
    let activeBuyerCount = 0;
    let newFarmerCount = 0;
    let churnRiskCount = 0;
    let activeThirtyDays = 0;

    customers.forEach(c => {
      const userOrders = orders.filter(o => o.userId === c.id || (c.phone && o.userPhone === c.phone));
      const totalSpent = userOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
      const ordersCount = userOrders.length;

      let lastOrderDateMs = 0;
      if (userOrders.length > 0) {
        const firstOrder = userOrders[0];
        lastOrderDateMs = firstOrder.createdAt?.toMillis ? firstOrder.createdAt.toMillis() : new Date(firstOrder.createdAt).getTime();
      }

      if (lastOrderDateMs && lastOrderDateMs >= thirtyDaysAgo) {
        activeThirtyDays++;
      }

      if (totalSpent >= 10000) {
        highValueCount++;
      } else if (ordersCount >= 2) {
        if (lastOrderDateMs && lastOrderDateMs < fortyFiveDaysAgo) {
          churnRiskCount++;
        } else {
          activeBuyerCount++;
        }
      } else {
        newFarmerCount++;
      }
    });

    return {
      highValueCount,
      activeBuyerCount,
      newFarmerCount,
      churnRiskCount,
      activeThirtyDays
    };
  }, [customers, orders]);

  // CSAT Metrics
  const totalReviews = feedbackList.length;
  const averageRating = totalReviews > 0
    ? (feedbackList.reduce((acc, f) => acc + (Number(f.rating) || 0), 0) / totalReviews).toFixed(1)
    : '0.0';

  const positivePercent = totalReviews > 0
    ? Math.round((feedbackList.filter(f => Number(f.rating) >= 4).length / totalReviews) * 100)
    : 0;

  // Star Distribution
  const starCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    feedbackList.forEach(f => {
      const r = Number(f.rating) || 5;
      if (counts[r] !== undefined) counts[r]++;
    });
    return counts;
  }, [feedbackList]);

  // Support & Grievances Stats
  const openTickets = tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const openComplaints = complaints.filter(c => c.status === 'OPEN' || c.status === 'UNDER_INVESTIGATION').length;
  const urgentTickets = tickets.filter(t => t.priority === 'URGENT' && t.status !== 'RESOLVED').length;

  // Complaint Category Breakdown
  const complaintCategories = useMemo(() => {
    const map = {};
    complaints.forEach(c => {
      const cat = c.category || 'GENERAL';
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [complaints]);

  // Unified Live Realtime Activity Stream (Latest 10)
  const unifiedActivityStream = useMemo(() => {
    const events = [];

    tickets.forEach(t => {
      events.push({
        id: `tkt-${t.id}`,
        type: 'TICKET',
        title: `Ticket ${t.ticketNumber}: ${t.subject}`,
        sub: `Customer: ${t.customerName} • Status: ${t.status}`,
        timestamp: t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt),
        icon: <Headphones size={15} className="text-amber-600" />,
        link: '/support-tickets',
        badge: t.priority
      });
    });

    complaints.forEach(c => {
      events.push({
        id: `cmp-${c.id}`,
        type: 'COMPLAINT',
        title: `Grievance ${c.complaintNumber}: ${c.title}`,
        sub: `Order: #${c.orderId?.slice(0, 8)} • Severity: ${c.severity}`,
        timestamp: c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt),
        icon: <AlertOctagon size={15} className="text-red-600" />,
        link: '/complaints',
        badge: c.status
      });
    });

    feedbackList.forEach(f => {
      events.push({
        id: `fdb-${f.id}`,
        type: 'FEEDBACK',
        title: `${f.rating}★ Review from ${f.customerName}`,
        sub: `"${f.comments?.slice(0, 60)}..."`,
        timestamp: f.createdAt?.toDate ? f.createdAt.toDate() : new Date(f.createdAt),
        icon: <Star size={15} className="text-yellow-500 fill-yellow-500" />,
        link: '/customer-feedback',
        badge: `${f.rating}.0★`
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  }, [tickets, complaints, feedbackList]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Activity className="mr-3 text-[#1b5e20]" size={28} />
            CRM Executive Dashboard
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Real-time Farmer Lifecycle, Helpdesk Tickets, Grievance Resolutions, and CSAT Satisfaction Analytics.
          </p>
        </div>

        {/* Quick Jump Buttons */}
        <div className="flex items-center gap-2">
          <Link
            to="/customers"
            className="bg-[#1b5e20] text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all flex items-center gap-1.5"
          >
            <Users size={14} />
            Farmers (360°)
          </Link>
          <Link
            to="/support-tickets"
            className="bg-white border border-gray-200 text-gray-800 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-50 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Headphones size={14} />
            Tickets
          </Link>
          <Link
            to="/complaints"
            className="bg-white border border-gray-200 text-gray-800 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-50 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <AlertOctagon size={14} />
            Grievances
          </Link>
        </div>
      </div>

      {/* 6 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Total Farmers */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Users size={12} className="text-[#1b5e20]" /> Total Farmers
          </p>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{customers.length}</p>
          <span className="text-[10px] font-bold text-emerald-700 mt-1 block">
            {personaStats.activeThirtyDays} active in last 30d
          </span>
        </div>

        {/* High Value Farmers */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1">
            <Sparkles size={12} className="text-amber-600 fill-amber-600" /> High Value (₹10k+)
          </p>
          <p className="text-2xl font-black text-amber-900 mt-1 font-mono">{personaStats.highValueCount}</p>
          <span className="text-[10px] font-bold text-amber-700 mt-1 block">
            VIP Farmer Accounts
          </span>
        </div>

        {/* CSAT Score */}
        <div className="bg-white p-5 rounded-2xl border border-green-200 shadow-sm bg-gradient-to-br from-green-50/50 to-white">
          <p className="text-[10px] font-black text-green-800 uppercase tracking-widest flex items-center gap-1">
            <Star size={12} className="text-yellow-500 fill-yellow-500" /> CSAT Score
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-2xl font-black text-green-900 font-mono">{averageRating}</p>
            <span className="text-[11px] font-bold text-green-700">/ 5.0 ⭐</span>
          </div>
          <span className="text-[10px] font-bold text-green-700 mt-1 block">
            {positivePercent}% Positive ({totalReviews} Reviews)
          </span>
        </div>

        {/* Open Support Tickets */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Headphones size={12} className="text-blue-600" /> Open Tickets
          </p>
          <p className="text-2xl font-black text-blue-900 mt-1 font-mono">{openTickets}</p>
          {urgentTickets > 0 ? (
            <span className="text-[10px] font-black text-red-600 mt-1 block animate-pulse">
              🚨 {urgentTickets} Urgent Priority
            </span>
          ) : (
            <span className="text-[10px] font-bold text-gray-400 mt-1 block">All handled</span>
          )}
        </div>

        {/* Open Grievances */}
        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm bg-red-50/20">
          <p className="text-[10px] font-black text-red-700 uppercase tracking-widest flex items-center gap-1">
            <AlertOctagon size={12} /> Open Grievances
          </p>
          <p className="text-2xl font-black text-red-600 mt-1 font-mono">{openComplaints}</p>
          <span className="text-[10px] font-bold text-red-700 mt-1 block">
            Under Investigation
          </span>
        </div>

        {/* Churn Risk */}
        <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm">
          <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest flex items-center gap-1">
            <AlertTriangle size={12} /> Churn Risk (&gt;45d)
          </p>
          <p className="text-2xl font-black text-orange-800 mt-1 font-mono">{personaStats.churnRiskCount}</p>
          <span className="text-[10px] font-bold text-orange-600 mt-1 block">
            Need Re-engagement
          </span>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Farmer Persona & Lifecycle Distribution */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <UserCheck size={16} className="text-[#1b5e20]" />
              Farmer Persona Breakdown
            </h3>
            <Link to="/customers" className="text-xs font-black text-[#1b5e20] hover:underline flex items-center gap-0.5">
              View All <ChevronRight size={13} />
            </Link>
          </div>

          <div className="space-y-4">
            {/* High Value */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-amber-800 flex items-center gap-1">
                  <Sparkles size={12} /> High Value Farmers (₹10k+ LTV)
                </span>
                <span className="font-mono text-gray-900">{personaStats.highValueCount} ({customers.length ? Math.round((personaStats.highValueCount / customers.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{ width: `${customers.length ? (personaStats.highValueCount / customers.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Active Buyers */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-green-800 flex items-center gap-1">
                  <ThumbsUp size={12} /> Active Regular Buyers
                </span>
                <span className="font-mono text-gray-900">{personaStats.activeBuyerCount} ({customers.length ? Math.round((personaStats.activeBuyerCount / customers.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${customers.length ? (personaStats.activeBuyerCount / customers.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* New Farmers */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-blue-800 flex items-center gap-1">
                  <Users size={12} /> New Farmers (1st Order)
                </span>
                <span className="font-mono text-gray-900">{personaStats.newFarmerCount} ({customers.length ? Math.round((personaStats.newFarmerCount / customers.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${customers.length ? (personaStats.newFarmerCount / customers.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Churn Risk */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-red-700 flex items-center gap-1">
                  <AlertTriangle size={12} /> Churn Risk (45+ Days Inactive)
                </span>
                <span className="font-mono text-gray-900">{personaStats.churnRiskCount} ({customers.length ? Math.round((personaStats.churnRiskCount / customers.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full rounded-full transition-all"
                  style={{ width: `${customers.length ? (personaStats.churnRiskCount / customers.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle Col: CSAT Satisfaction Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Star size={16} className="text-yellow-500 fill-yellow-500" />
              CSAT Satisfaction Breakdown
            </h3>
            <Link to="/customer-feedback" className="text-xs font-black text-amber-700 hover:underline flex items-center gap-0.5">
              Feedback Hub <ChevronRight size={13} />
            </Link>
          </div>

          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map(stars => {
              const count = starCounts[stars] || 0;
              const pct = totalReviews ? Math.round((count / totalReviews) * 100) : 0;
              return (
                <div key={stars} className="flex items-center gap-3">
                  <span className="text-xs font-mono font-black text-gray-700 w-12 flex items-center gap-1">
                    {stars} <Star size={12} className="fill-amber-400 text-amber-400" />
                  </span>
                  <div className="flex-1 bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stars >= 4 ? 'bg-green-500' : stars === 3 ? 'bg-amber-400' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-gray-500 w-12 text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grievance Category Breakdown */}
          <div className="pt-4 border-t border-gray-100 space-y-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Top Grievance Categories ({complaints.length} Total)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {complaintCategories.slice(0, 4).map(([cat, count]) => (
                <span key={cat} className="text-[10px] font-bold bg-red-50 text-red-800 px-2.5 py-1 rounded-lg border border-red-100">
                  {cat.replace(/_/g, ' ')}: {count}
                </span>
              ))}
              {complaintCategories.length === 0 && (
                <span className="text-xs text-gray-400 italic">No grievances registered.</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Live Unified CRM Activity Stream */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Clock size={16} className="text-[#1b5e20]" />
              Live CRM Activity Stream
            </h3>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
            {unifiedActivityStream.length === 0 ? (
              <p className="text-xs text-gray-400 py-12 text-center">No recent interactions.</p>
            ) : (
              unifiedActivityStream.map(evt => (
                <Link
                  key={evt.id}
                  to={evt.link}
                  className="block p-3 bg-gray-50 hover:bg-gray-100/70 rounded-2xl border border-gray-100 transition-all space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {evt.icon}
                      <span className="text-xs font-black text-gray-900 group-hover:text-[#1b5e20] transition-colors truncate max-w-[160px]">
                        {evt.title}
                      </span>
                    </div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                      {evt.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium truncate">{evt.sub}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CRMDashboard;

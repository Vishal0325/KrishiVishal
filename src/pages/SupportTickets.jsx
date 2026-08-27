import React, { useState, useEffect } from 'react';
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
  Headphones,
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
  UserCheck,
  Package,
  FileText,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

const ISSUE_TYPES = [
  'Delivery Delay',
  'Product Quality Issue',
  'Damaged / Defective Goods',
  'Wrong Item Delivered',
  'Payment / Refund Query',
  'App / Account Assistance',
  'Crop Consultation / Advisory',
  'General Inquiry'
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'HIGH', label: 'High', color: 'bg-amber-100 text-amber-800' },
  { value: 'URGENT', label: 'Urgent', color: 'bg-red-100 text-red-800 font-black animate-pulse' }
];

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open', color: 'bg-amber-100 text-amber-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-green-100 text-green-800' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-gray-100 text-gray-600' }
];

const SupportTickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // New Ticket Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [linkedOrderId, setLinkedOrderId] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketType, setTicketType] = useState('Delivery Delay');
  const [ticketPriority, setTicketPriority] = useState('MEDIUM');
  const [ticketDescription, setTicketDescription] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Internal Note State (Detail Drawer)
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Listen to Support Tickets
  useEffect(() => {
    const q = query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Tickets fetch error:', err);
      toast.error('Failed to load tickets');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Users (Customers & Staff)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Customers (farmers)
      const farmers = allUsers.filter(u => !u.isAdmin && !['SuperAdmin', 'OrderManager', 'CatalogManager'].includes(u.role));
      setCustomers(farmers);

      // Staff/Admins for assignment
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

  // Create Ticket Handler
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId || !ticketSubject.trim()) {
      toast.error('Please select customer and enter subject');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return;

    setCreatingTicket(true);
    try {
      const ticketRef = doc(collection(db, 'support_tickets'));
      const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${ticketRef.id.slice(0, 4).toUpperCase()}`;

      const newTicketData = {
        id: ticketRef.id,
        ticketNumber,
        customerId: customer.id,
        customerName: customer.name || 'Anonymous Farmer',
        customerPhone: customer.phone || '',
        customerEmail: customer.email || '',
        customerLocation: `${customer.district || ''} ${customer.state || ''}`.trim() || 'Bihar',
        orderId: linkedOrderId || null,
        subject: ticketSubject.trim(),
        issueType: ticketType,
        priority: ticketPriority,
        status: 'OPEN',
        assignedTo: assigneeEmail || user?.email || 'Unassigned',
        description: ticketDescription.trim(),
        notes: [
          {
            id: `note-${Date.now()}`,
            text: ticketDescription.trim() || 'Ticket created',
            author: user?.email || 'Admin',
            authorName: user?.displayName || 'Support Admin',
            timestamp: new Date().toISOString(),
            isInitial: true
          }
        ],
        createdBy: user?.email || 'Admin',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(ticketRef, newTicketData);
      await addAuditLog('CREATE_SUPPORT_TICKET', 'SupportTicket', ticketRef.id, {
        ticketNumber,
        customerName: customer.name,
        subject: ticketSubject
      });

      toast.success(`Support Ticket ${ticketNumber} created!`);
      setIsCreateModalOpen(false);
      // Reset
      setSelectedCustomerId('');
      setLinkedOrderId('');
      setTicketSubject('');
      setTicketDescription('');
    } catch (error) {
      console.error('Ticket creation failed:', error);
      toast.error('Failed to create ticket: ' + error.message);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Add Internal Staff Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedTicket) return;

    setAddingNote(true);
    try {
      const ticketDocRef = doc(db, 'support_tickets', selectedTicket.id);
      const newNote = {
        id: `note-${Date.now()}`,
        text: newNoteText.trim(),
        author: user?.email || 'Admin',
        authorName: user?.displayName || 'Support Agent',
        timestamp: new Date().toISOString()
      };

      const updatedNotes = [...(selectedTicket.notes || []), newNote];

      await updateDoc(ticketDocRef, {
        notes: updatedNotes,
        updatedAt: Timestamp.now()
      });

      setSelectedTicket(prev => ({ ...prev, notes: updatedNotes }));
      setNewNoteText('');
      toast.success('Note added to ticket');
    } catch (error) {
      console.error('Note add error:', error);
      toast.error('Failed to add note: ' + error.message);
    } finally {
      setAddingNote(false);
    }
  };

  // Update Status & Resolution
  const handleUpdateStatus = async (newStatus, resolutionNote = '') => {
    if (!selectedTicket) return;

    setIsResolving(true);
    try {
      const ticketDocRef = doc(db, 'support_tickets', selectedTicket.id);
      const updates = {
        status: newStatus,
        updatedAt: Timestamp.now()
      };

      if (newStatus === 'RESOLVED') {
        updates.resolvedAt = Timestamp.now();
        updates.resolvedBy = user?.email || 'Admin';
        updates.resolutionSummary = resolutionNote || 'Resolved by support agent';
      }

      await updateDoc(ticketDocRef, updates);
      setSelectedTicket(prev => ({ ...prev, ...updates }));
      toast.success(`Ticket status updated to ${newStatus}`);
      setResolutionText('');
    } catch (error) {
      console.error('Status update failed:', error);
      toast.error('Failed to update status');
    } finally {
      setIsResolving(false);
    }
  };

  // Update Assignee
  const handleUpdateAssignee = async (newAssignee) => {
    if (!selectedTicket) return;
    try {
      const ticketDocRef = doc(db, 'support_tickets', selectedTicket.id);
      await updateDoc(ticketDocRef, {
        assignedTo: newAssignee,
        updatedAt: Timestamp.now()
      });
      setSelectedTicket(prev => ({ ...prev, assignedTo: newAssignee }));
      toast.success(`Ticket assigned to ${newAssignee.split('@')[0]}`);
    } catch (error) {
      toast.error('Failed to assign ticket');
    }
  };

  // Filtered Tickets
  const filteredTickets = tickets.filter(t => {
    const matchSearch = !searchTerm ||
      t.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.customerPhone?.includes(searchTerm) ||
      t.subject?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
    const matchType = typeFilter === 'ALL' || t.issueType === typeFilter;

    return matchSearch && matchStatus && matchPriority && matchType;
  });

  // KPI Metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.status === 'OPEN').length;
  const inProgressTickets = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolvedTickets = tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)).length;
  const urgentTickets = tickets.filter(t => t.priority === 'URGENT' && t.status !== 'CLOSED').length;

  // Table Columns
  const columns = [
    {
      header: 'Ticket ID',
      key: 'ticketNumber',
      render: (t) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{t.ticketNumber}</span>
          <p className="text-[10px] text-gray-400 font-mono">
            {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
      )
    },
    {
      header: 'Customer',
      key: 'customerName',
      render: (t) => (
        <div>
          <p className="font-black text-xs text-gray-900">{t.customerName}</p>
          <span className="text-[10px] font-bold text-gray-500 font-mono flex items-center gap-1">
            <Phone size={10} /> {t.customerPhone || '—'}
          </span>
        </div>
      )
    },
    {
      header: 'Subject & Issue Type',
      key: 'subject',
      render: (t) => (
        <div className="max-w-xs">
          <p className="font-black text-xs text-gray-800 truncate">{t.subject}</p>
          <span className="text-[10px] font-bold text-gray-400">{t.issueType}</span>
          {t.orderId && (
            <span className="ml-2 text-[9px] font-mono font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              Ord: #{t.orderId.slice(0, 6)}
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Priority',
      key: 'priority',
      render: (t) => {
        const p = PRIORITIES.find(item => item.value === t.priority) || PRIORITIES[0];
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${p.color}`}>
            {t.priority}
          </span>
        );
      }
    },
    {
      header: 'Status',
      key: 'status',
      render: (t) => {
        const s = STATUS_OPTIONS.find(item => item.value === t.status) || STATUS_OPTIONS[0];
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${s.color}`}>
            {t.status.replace('_', ' ')}
          </span>
        );
      }
    },
    {
      header: 'Assigned Agent',
      key: 'assignedTo',
      render: (t) => (
        <span className="text-xs font-bold text-gray-700">
          {t.assignedTo ? t.assignedTo.split('@')[0] : 'Unassigned'}
        </span>
      )
    },
    {
      header: 'Action',
      render: (t) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedTicket(t);
          }}
          className="p-2 hover:bg-emerald-100 text-[#1b5e20] rounded-xl transition-all bg-emerald-50 shadow-sm"
          title="View Ticket Details & Resolve"
        >
          <Eye size={16} />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Headphones className="mr-3 text-[#1b5e20]" size={28} />
            Support Ticket Management & Helpdesk
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Track customer inquiries, delivery assistance, order issues, and agent resolution workflows.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Create Support Ticket
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Tickets</p>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{totalTickets}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm bg-amber-50/30">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Open Tickets</p>
          <p className="text-2xl font-black text-amber-700 mt-1 font-mono">{openTickets}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm bg-blue-50/30">
          <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">In Progress</p>
          <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{inProgressTickets}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-green-50/30">
          <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Resolved & Closed</p>
          <p className="text-2xl font-black text-[#1b5e20] mt-1 font-mono">{resolvedTickets}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm bg-red-50/30">
          <p className="text-[10px] font-black text-red-700 uppercase tracking-widest flex items-center gap-1">
            <Flame size={12} /> Urgent Issues
          </p>
          <p className="text-2xl font-black text-red-600 mt-1 font-mono">{urgentTickets}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search Ticket ID, Customer, Phone, Subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#1b5e20]/10 focus:border-[#1b5e20] outline-none text-xs font-bold text-gray-900 transition-all"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 outline-none"
        >
          <option value="ALL">All Issue Types</option>
          {ISSUE_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filteredTickets}
        loading={loading}
        onRowClick={(t) => setSelectedTicket(t)}
      />

      {/* CREATE TICKET MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Headphones size={20} className="text-[#1b5e20]" />
                  Create Customer Support Ticket
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Log customer issue, assign support priority and responsible agent.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer / Farmer *</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    setLinkedOrderId('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                >
                  <option value="">-- Select Registered Customer --</option>
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
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Link with Customer Order (Optional)</label>
                  <select
                    value={linkedOrderId}
                    onChange={(e) => setLinkedOrderId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                  >
                    <option value="">-- No Order Linked --</option>
                    {customerOrders.map(o => (
                      <option key={o.id} value={o.id}>
                        Order #{o.id.slice(0, 8).toUpperCase()} - ₹{o.totalAmount} ({o.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Issue Type & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Issue Category</label>
                  <select
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                  >
                    {ISSUE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Priority</label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ticket Subject *</label>
                <input
                  type="text"
                  required
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="e.g. Order delayed by 2 days in Purnea hub"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Issue Description & Notes</label>
                <textarea
                  rows={3}
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Provide detailed context regarding customer issue..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-medium text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={creatingTicket}
                className="w-full bg-[#1b5e20] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {creatingTicket && <Loader2 size={16} className="animate-spin" />}
                Submit Support Ticket
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAIL & RESOLUTION DRAWER */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100">
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#0e3311] text-white">
              <div>
                <span className="text-[10px] font-mono font-bold bg-white/20 text-emerald-300 px-2 py-0.5 rounded">
                  {selectedTicket.ticketNumber}
                </span>
                <h2 className="text-base font-black tracking-tight mt-1 text-white truncate max-w-md">
                  {selectedTicket.subject}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-all text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Customer Info Card */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer Profile</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{selectedTicket.customerName}</p>
                  <p className="text-xs text-gray-500">{selectedTicket.customerLocation}</p>
                </div>
                {selectedTicket.customerPhone && (
                  <a
                    href={`tel:${selectedTicket.customerPhone}`}
                    className="flex items-center gap-1.5 bg-[#1b5e20] text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-[#2e7d32]"
                  >
                    <Phone size={13} />
                    Call Farmer
                  </a>
                )}
              </div>

              {/* Status Stepper & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</label>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleUpdateStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-black text-xs text-gray-900 outline-none"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned Agent</label>
                  <select
                    value={selectedTicket.assignedTo || ''}
                    onChange={(e) => handleUpdateAssignee(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-900 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.email}>{s.name || s.email.split('@')[0]} ({s.role || 'Staff'})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linked Order Card (if present) */}
              {selectedTicket.orderId && (
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package size={20} className="text-blue-600" />
                    <div>
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Associated Order</p>
                      <p className="font-mono text-xs font-black text-gray-900">#{selectedTicket.orderId.slice(0, 10).toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded">
                    Linked to Ticket
                  </span>
                </div>
              )}

              {/* Activity & Internal Notes Thread */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  <MessageSquare size={14} className="text-[#1b5e20]" />
                  Agent Notes & Communication History
                </h4>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {(selectedTicket.notes || []).map((note, index) => (
                    <div key={note.id || index} className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black text-gray-800">{note.authorName || note.author}</span>
                        <span className="text-gray-400 font-mono">
                          {new Date(note.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium">{note.text}</p>
                    </div>
                  ))}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add internal staff note or call outcome..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-[#1b5e20]"
                  />
                  <button
                    type="submit"
                    disabled={addingNote || !newNoteText.trim()}
                    className="bg-[#1b5e20] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1 hover:bg-[#2e7d32]"
                  >
                    <Send size={13} />
                    Note
                  </button>
                </form>
              </div>

              {/* Resolution Summary Box (if resolved) */}
              {selectedTicket.status === 'RESOLVED' && selectedTicket.resolutionSummary && (
                <div className="p-4 bg-green-50 rounded-2xl border border-green-100 space-y-1">
                  <p className="text-[10px] font-black text-green-800 uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 size={12} /> Resolution Summary
                  </p>
                  <p className="text-xs text-green-900 font-bold">{selectedTicket.resolutionSummary}</p>
                  <p className="text-[10px] text-green-700 font-mono">
                    Resolved by {selectedTicket.resolvedBy?.split('@')[0]}
                  </p>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Close Drawer
              </button>

              {selectedTicket.status !== 'RESOLVED' && selectedTicket.status !== 'CLOSED' && (
                <button
                  onClick={() => {
                    const res = window.prompt("Enter Resolution Summary for this ticket:", "Issue resolved and customer informed.");
                    if (res) handleUpdateStatus('RESOLVED', res);
                  }}
                  className="bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-emerald-800 flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  Resolve Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTickets;

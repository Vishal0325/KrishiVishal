import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Trophy,
  Kanban,
  Table,
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Building2,
  Phone,
  DollarSign,
  Sparkles,
  Flame,
  X,
  Layers
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SalesPipeline() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState('KANBAN'); // 'KANBAN' | 'TABLE'
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Deal Form State
  const [form, setForm] = useState({
    title: '',
    clientName: '',
    clientType: 'FPO (Farmer Producer Org)',
    phone: '',
    dealValue: '',
    stage: 'NEW_LEAD',
    expectedCloseDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    assignedTo: 'Sales Team',
    acreageOrCapacity: '',
    notes: ''
  });

  const stages = [
    { id: 'NEW_LEAD', label: 'New Lead (नई लीड)', color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { id: 'CONTACTED', label: 'Contacted (बातचीत जारी)', color: 'bg-purple-50 border-purple-200 text-purple-800' },
    { id: 'FARM_VISIT_DEMO', label: 'Farm Visit / Demo (खेत विजिट)', color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { id: 'PROPOSAL_SENT', label: 'Quote / Proposal Sent (कोटेशन)', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
    { id: 'CLOSED_WON', label: 'Closed Won 🎉 (डील फाइनल)', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { id: 'CLOSED_LOST', label: 'Closed Lost (रद्द)', color: 'bg-rose-50 border-rose-200 text-rose-800' }
  ];

  // Fetch Deals from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'b2b_sales_deals'), orderBy('createdAt', 'desc')),
      (snap) => {
        setDeals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Calculate Lead Score & Heat (Hot, Warm, Cold)
  const computeLeadScore = (deal) => {
    let score = 50;
    const val = Number(deal.dealValue || 0);
    if (val > 100000) score += 25;
    else if (val > 50000) score += 15;

    if (deal.clientType === 'FPO (Farmer Producer Org)') score += 15;
    if (deal.stage === 'PROPOSAL_SENT') score += 10;
    if (deal.stage === 'CLOSED_LOST') score = 10;

    return Math.min(99, score);
  };

  // Create Deal
  const handleCreateDeal = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'b2b_sales_deals'), {
        ...form,
        dealValue: Number(form.dealValue || 0),
        createdAt: Timestamp.now(),
        createdBy: user?.email || 'Admin'
      });
      toast.success('B2B / FPO Deal created in sales pipeline!');
      setIsModalOpen(false);
      setForm({
        title: '',
        clientName: '',
        clientType: 'FPO (Farmer Producer Org)',
        phone: '',
        dealValue: '',
        stage: 'NEW_LEAD',
        expectedCloseDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        assignedTo: 'Sales Team',
        acreageOrCapacity: '',
        notes: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to create deal.');
    }
  };

  // Advance Stage
  const handleUpdateStage = async (dealId, nextStage) => {
    try {
      await updateDoc(doc(db, 'b2b_sales_deals', dealId), {
        stage: nextStage,
        updatedAt: Timestamp.now()
      });
      toast.success('Deal moved to ' + nextStage);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update stage.');
    }
  };

  // Metrics
  const totalPipelineValue = useMemo(() => {
    return deals
      .filter(d => d.stage !== 'CLOSED_LOST')
      .reduce((acc, d) => acc + Number(d.dealValue || 0), 0);
  }, [deals]);

  const totalWonValue = useMemo(() => {
    return deals
      .filter(d => d.stage === 'CLOSED_WON')
      .reduce((acc, d) => acc + Number(d.dealValue || 0), 0);
  }, [deals]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#1E293B] to-[#334155] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Trophy size={14} className="text-amber-400" />
              B2B, FPO & Agri Dealer Sales Pipeline
            </div>
            <h2 className="text-2xl font-black">Institutional Sales CRM & Deals Kanban</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Manage large volume fertilizer/seed bulk orders, track FPO negotiations, field demos, quotations, and optimize salesperson conversion rates.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Add New B2B Deal
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Active Pipeline</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{formatCurrency(totalPipelineValue)}</h3>
            <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Across active negotiations</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Closed Won Revenue</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-emerald-700">{formatCurrency(totalWonValue)}</h3>
            <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
              <Trophy size={20} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-600 mt-2 font-medium">Successfully converted deals</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Active Deal Count</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{deals.length}</h3>
            <div className="h-10 w-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 font-bold">
              <Building2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">FPOs, Dealers & Large Farms</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Win Conversion Rate</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-amber-600">
              {deals.length > 0 ? Math.round((deals.filter(d => d.stage === 'CLOSED_WON').length / deals.length) * 100) : 0} %
            </h3>
            <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold">
              <Sparkles size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Based on closed milestones</p>
        </div>
      </div>

      {/* View Switcher: Kanban vs Table */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200">
          <button
            onClick={() => setViewMode('KANBAN')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'KANBAN' ? 'bg-[#1E293B] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Kanban size={14} />
            <span>Kanban Board</span>
          </button>
          <button
            onClick={() => setViewMode('TABLE')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'TABLE' ? 'bg-[#1E293B] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Table size={14} />
            <span>Table View</span>
          </button>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'KANBAN' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageDeals = deals.filter(d => (d.stage || 'NEW_LEAD') === stage.id);
            const stageTotal = stageDeals.reduce((acc, d) => acc + Number(d.dealValue || 0), 0);

            return (
              <div key={stage.id} className="bg-gray-50/80 rounded-2xl border border-gray-200 p-3 flex flex-col space-y-3 min-w-[240px]">
                {/* Stage Header */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <div>
                    <h4 className="font-extrabold text-xs text-gray-900">{stage.label}</h4>
                    <span className="text-[10px] font-bold text-gray-500">{formatCurrency(stageTotal)}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-white text-gray-700 rounded-full text-[10px] font-black shadow-sm">
                    {stageDeals.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[550px] pr-1">
                  {stageDeals.map((deal) => {
                    const score = computeLeadScore(deal);
                    return (
                      <div
                        key={deal.id}
                        className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm space-y-2 hover:border-[#1E293B] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <h5 className="font-black text-xs text-gray-900 leading-snug">{deal.title || 'Agri Bulk Order'}</h5>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            <Flame size={10} /> {score}
                          </span>
                        </div>

                        <p className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                          <Building2 size={12} className="text-gray-400" />
                          {deal.clientName}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="font-black text-emerald-700">{formatCurrency(deal.dealValue || 0)}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">{deal.expectedCloseDate}</span>
                        </div>

                        {/* Advance Stage Control */}
                        {stage.id !== 'CLOSED_WON' && stage.id !== 'CLOSED_LOST' && (
                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <button
                              onClick={() => handleUpdateStage(deal.id, 'CLOSED_LOST')}
                              className="text-[10px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                            >
                              Mark Lost
                            </button>
                            <button
                              onClick={() => {
                                const currentIndex = stages.findIndex(s => s.id === stage.id);
                                if (currentIndex < stages.length - 2) {
                                  handleUpdateStage(deal.id, stages[currentIndex + 1].id);
                                } else {
                                  handleUpdateStage(deal.id, 'CLOSED_WON');
                                }
                              }}
                              className="flex items-center gap-1 text-[10px] bg-gray-900 hover:bg-black text-white px-2.5 py-1 rounded-lg font-bold shadow-sm cursor-pointer"
                            >
                              <span>Advance</span>
                              <ArrowRight size={10} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {stageDeals.length === 0 && (
                    <div className="p-6 text-center text-[11px] text-gray-400 font-medium italic">
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'TABLE' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <DataTable
            data={deals}
            columns={[
              {
                header: 'Deal Title',
                accessor: 'title',
                render: (row) => <span className="font-bold text-gray-900">{row.title}</span>
              },
              {
                header: 'Client / Organization',
                accessor: 'clientName',
                render: (row) => (
                  <div>
                    <span className="font-bold text-gray-800 block">{row.clientName}</span>
                    <span className="text-[11px] text-gray-500">{row.clientType} • {row.phone}</span>
                  </div>
                )
              },
              {
                header: 'Deal Value',
                accessor: 'dealValue',
                render: (row) => <span className="font-black text-emerald-700">{formatCurrency(row.dealValue || 0)}</span>
              },
              {
                header: 'Current Stage',
                accessor: 'stage',
                render: (row) => {
                  const s = stages.find(st => st.id === row.stage) || stages[0];
                  return (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${s.color}`}>
                      {s.label}
                    </span>
                  );
                }
              },
              {
                header: 'Lead Score',
                accessor: 'score',
                render: (row) => (
                  <span className="inline-flex items-center gap-1 font-black text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Flame size={12} /> {computeLeadScore(row)} / 100
                  </span>
                )
              },
              {
                header: 'Expected Close',
                accessor: 'expectedCloseDate',
                render: (row) => <span className="text-xs font-semibold text-gray-600">{row.expectedCloseDate}</span>
              }
            ]}
          />
        </div>
      )}

      {/* Add Deal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Building2 className="text-[#1E293B]" size={20} />
                Create Institutional B2B Deal
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-gray-600 mb-1">Deal Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 50 Ton Urea & DAP Supply for FPO"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Organization / Client Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Malwa Kisan FPO Ltd"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Client Type</label>
                  <select
                    value={form.clientType}
                    onChange={(e) => setForm({ ...form, clientType: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                  >
                    <option value="FPO (Farmer Producer Org)">FPO (Farmer Producer Org)</option>
                    <option value="Agri Retailer / Dealer">Agri Retailer / Dealer</option>
                    <option value="Corporate Farm (50+ Acres)">Corporate Farm (50+ Acres)</option>
                    <option value="Govt / Cooperative">Govt / Cooperative</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Estimated Deal Value (₹)</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    placeholder="e.g. 150000"
                    value={form.dealValue}
                    onChange={(e) => setForm({ ...form, dealValue: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-black text-sm text-gray-900 outline-none focus:border-[#1E293B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Initial Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Expected Closing Date</label>
                  <input
                    type="date"
                    required
                    value={form.expectedCloseDate}
                    onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#1E293B]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#1E293B] hover:bg-[#334155] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

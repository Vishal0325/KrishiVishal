import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { releaseStockAtomic } from '../services/inventory';
import { 
  RotateCcw, 
  Package, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Building2, 
  Search, 
  Phone, 
  User, 
  ShieldAlert, 
  ArrowRight,
  Clock,
  RefreshCw,
  X,
  Layers,
  Sparkles
} from 'lucide-react';
import { formatAddress } from '../utils/formatters';
import toast from 'react-hot-toast';

const RTOManagement = () => {
  const { user } = useAuth();
  const [rtoOrders, setRtoOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING_INWARD' | 'RESTOCKED' | 'RESCHEDULED' | 'DAMAGED'

  // Action Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [inwardAction, setInwardAction] = useState('RESTOCK'); // 'RESTOCK' | 'RESCHEDULE' | 'MARK_DAMAGED'
  const [rescheduleDate, setRescheduleDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [actionRemarks, setActionRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // 1. Fetch Warehouses
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch RTO / NDR / Undelivered Orders
    const qOrders = query(
      collection(db, 'orders'),
      where('status', 'in', [
        'UNDELIVERED',
        'NDR',
        'RTO_REQUESTED',
        'CANCELLED',
        'RTO_RESTOCKED',
        'RTO_DAMAGED',
        'REATTEMPT_SCHEDULED',
        'RTO_INITIATED'
      ])
    );

    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRtoOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("RTO query error:", err);
      setLoading(false);
    });

    return () => {
      unsubWh();
      unsubOrders();
    };
  }, []);

  const getWarehouseName = (whId) => {
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? wh.name : (whId || 'Central Hub');
  };

  // Filtered RTO Orders
  const filteredOrders = useMemo(() => {
    return rtoOrders.filter(o => {
      const matchesSearch = 
        (o.orderNumber || o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.customerName || o.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.customerPhone || o.userPhone || '').includes(searchTerm);

      const matchesHub = selectedHub === 'ALL' || o.warehouseId === selectedHub;
      const matchesStatus = 
        statusFilter === 'ALL' ? true :
        statusFilter === 'PENDING_INWARD' ? ['UNDELIVERED', 'NDR', 'RTO_REQUESTED', 'CANCELLED', 'REATTEMPT_SCHEDULED', 'RTO_INITIATED'].includes(o.status) :
        o.status === statusFilter;

      return matchesSearch && matchesHub && matchesStatus;
    });
  }, [rtoOrders, searchTerm, selectedHub, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const pending = rtoOrders.filter(o => ['UNDELIVERED', 'NDR', 'RTO_REQUESTED', 'CANCELLED', 'REATTEMPT_SCHEDULED', 'RTO_INITIATED'].includes(o.status));
    const restocked = rtoOrders.filter(o => o.status === 'RTO_RESTOCKED');
    const damaged = rtoOrders.filter(o => o.status === 'RTO_DAMAGED');
    const pendingValue = pending.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);

    return {
      pendingCount: pending.length,
      pendingValue,
      restockedCount: restocked.length,
      damagedCount: damaged.length
    };
  }, [rtoOrders]);

  // Execute Inward Restock / Reschedule / Damaged Action
  const handleExecuteInward = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setProcessing(true);

    try {
      const orderRef = doc(db, 'orders', selectedOrder.id);

      if (inwardAction === 'RESTOCK') {
        // 1. Release reserved stock back to active inventory atomically
        if (Array.isArray(selectedOrder.items)) {
          for (const item of selectedOrder.items) {
            if (item.productId) {
              await releaseStockAtomic(item.productId, Number(item.quantity) || 1, `RTO Restock for #${selectedOrder.id.slice(0,6)}`);
            }
          }
        }

        // 2. Update order status to RTO_RESTOCKED
        await updateDoc(orderRef, {
          status: 'RTO_RESTOCKED',
          rtoInwardDetails: {
            action: 'RESTOCKED_TO_SHELF',
            inwardBy: user?.displayName || user?.email || 'Hub Incharge',
            inwardAt: new Date().toISOString(),
            remarks: actionRemarks || 'Package verified intact, items restocked to active inventory.'
          },
          updatedAt: Timestamp.now()
        });

        toast.success(`Order #${selectedOrder.orderNumber || selectedOrder.id.slice(0,6)} restocked to warehouse shelf! Stock restored.`);
      } else if (inwardAction === 'RESCHEDULE') {
        // Reschedule for next delivery attempt
        await updateDoc(orderRef, {
          status: 'CONFIRMED', // Ready for batch dispatch again
          riderId: null, // Clear rider to re-batch
          deliveryRiderId: null,
          rescheduledDeliveryDate: rescheduleDate,
          rtoInwardDetails: {
            action: 'RESCHEDULED_DELIVERY',
            rescheduledDate: rescheduleDate,
            inwardBy: user?.displayName || user?.email || 'Hub Incharge',
            inwardAt: new Date().toISOString(),
            remarks: actionRemarks || `Delivery re-attempt scheduled for ${rescheduleDate}.`
          },
          updatedAt: Timestamp.now()
        });

        toast.success(`Order #${selectedOrder.orderNumber || selectedOrder.id.slice(0,6)} re-scheduled for ${rescheduleDate}. Moved back to dispatch pool.`);
      } else if (inwardAction === 'MARK_DAMAGED') {
        // Mark as damaged transit loss
        await updateDoc(orderRef, {
          status: 'RTO_DAMAGED',
          rtoInwardDetails: {
            action: 'DAMAGED_IN_TRANSIT',
            inwardBy: user?.displayName || user?.email || 'Hub Incharge',
            inwardAt: new Date().toISOString(),
            remarks: actionRemarks || 'Package damaged/leaked in transit. Sent to scrap write-off.'
          },
          updatedAt: Timestamp.now()
        });

        toast.success(`Order marked as RTO Damaged. Logged for scrap audit.`);
      }

      setSelectedOrder(null);
      setActionRemarks('');
    } catch (err) {
      console.error("RTO action error:", err);
      toast.error("Failed to process inward: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const columns = [
    {
      header: 'Order Reference',
      render: (o) => (
        <div className="flex flex-col">
          <span className="font-mono font-black text-gray-900 text-xs">#{o.orderNumber || o.id.slice(0,8)}</span>
          <span className="text-[10px] text-gray-400 font-semibold">{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
        </div>
      )
    },
    {
      header: 'Farmer / Destination',
      render: (o) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-gray-900">{o.customerName || o.userName || 'Farmer'}</span>
          <span className="text-[10px] text-gray-500 font-mono">{o.customerPhone || o.userPhone || 'N/A'}</span>
          <span className="text-[10px] text-gray-400 truncate max-w-xs">{formatAddress(o.shippingAddress || o.address, 'Village Address')}</span>
        </div>
      )
    },
    {
      header: 'Hub Depot',
      render: (o) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
          <Building2 size={11} className="mr-1 text-blue-500" />
          {getWarehouseName(o.warehouseId)}
        </span>
      )
    },
    {
      header: 'NDR Undelivered Reason',
      render: (o) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 w-fit">
            {o.ndrReason || o.cancellationReason || 'Customer Not Available / Rescheduled'}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">Rider: {o.riderName || 'Field Boy'}</span>
        </div>
      )
    },
    {
      header: 'Consignment Amount',
      render: (o) => (
        <div className="flex flex-col text-xs">
          <span className="font-black text-gray-900">₹{(o.totalAmount || 0).toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-400">{(o.items || []).length} Items</span>
        </div>
      )
    },
    {
      header: 'RTO Status',
      render: (o) => (
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
          o.status === 'RTO_RESTOCKED' ? 'bg-green-50 text-green-700 border-green-200' :
          o.status === 'RTO_DAMAGED' ? 'bg-red-50 text-red-700 border-red-200' :
          'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
        }`}>
          {o.status === 'RTO_RESTOCKED' ? '✓ Restocked' : o.status === 'RTO_DAMAGED' ? '✕ Damaged' : '⏳ Pending Inward'}
        </span>
      )
    },
    {
      header: 'Action',
      render: (o) => (
        ['UNDELIVERED', 'NDR', 'RTO_REQUESTED', 'CANCELLED', 'REATTEMPT_SCHEDULED', 'RTO_INITIATED'].includes(o.status) ? (
          <button
            onClick={() => {
              setSelectedOrder(o);
              setInwardAction('RESTOCK');
            }}
            className="px-3.5 py-1.5 bg-[#0B4D31] text-white hover:bg-[#146c43] rounded-xl text-xs font-black shadow-sm transition-all flex items-center gap-1.5"
          >
            <RotateCcw size={12} />
            Inward Desk
          </button>
        ) : (
          <span className="text-[10px] font-bold text-gray-400">Processed ✓</span>
        )
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="RTO & NDR Undelivered Parcel Restocking Desk"
          subtitle="Physical parcel reception from evening delivery boys. 1-Click atomic inventory restocking, delivery re-attempt scheduling, and damaged reverse logistics claims."
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Pending Inward Parcels"
          value={`${metrics.pendingCount} Parcels`}
          icon={AlertTriangle}
          color="amber"
        />
        <MetricCard
          label="At-Risk NDR Value"
          value={`₹${metrics.pendingValue.toLocaleString('en-IN')}`}
          icon={Package}
          color="red"
        />
        <MetricCard
          label="Restocked to Active Shelf"
          value={`${metrics.restockedCount} Orders`}
          icon={CheckCircle2}
          color="green"
        />
        <MetricCard
          label="Damaged in Reverse Transit"
          value={`${metrics.damagedCount} Parcels`}
          icon={ShieldAlert}
          color="purple"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Order ID, Farmer Name, Phone..."
              className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 w-full outline-none focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none"
            >
              <option value="ALL">🏢 All Regional Depots (Consolidated)</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>📍 {wh.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
          {[
            { id: 'ALL', label: 'All Parcels' },
            { id: 'PENDING_INWARD', label: '⏳ Pending Inward Desk' },
            { id: 'RTO_RESTOCKED', label: '✓ Restocked to Shelf' },
            { id: 'RTO_DAMAGED', label: '✕ Damaged Scrap' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? 'bg-[#0B4D31] text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto text-xs font-bold text-gray-400">
            Showing {filteredOrders.length} records
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
        <DataTable columns={columns} data={filteredOrders} loading={loading} />
      </div>

      {/* INWARD ACTION MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <RotateCcw size={18} className="text-[#0B4D31]" />
                RTO Inward Processing Desk
              </h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteInward} className="py-4 space-y-4">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order ID:</span>
                  <span className="font-mono font-bold text-gray-900">#{selectedOrder.orderNumber || selectedOrder.id.slice(0,8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Farmer:</span>
                  <span className="font-bold text-gray-900">{selectedOrder.customerName || selectedOrder.userName} ({selectedOrder.customerPhone || selectedOrder.userPhone})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">NDR Failure Reason:</span>
                  <span className="font-black text-orange-800">{selectedOrder.ndrReason || selectedOrder.cancellationReason || 'Delivery Boy reported customer unreachable'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Package Items:</span>
                  <span className="font-bold text-gray-900">
                    {(selectedOrder.items || []).map(i => `${i.productName || i.name} (x${i.quantity || 1})`).join(', ')}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1.5 block">Select Inward Action *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setInwardAction('RESTOCK')}
                    className={`p-2.5 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 ${
                      inwardAction === 'RESTOCK' ? 'bg-[#0B4D31] text-white shadow-sm' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    Restock to Shelf
                  </button>

                  <button
                    type="button"
                    onClick={() => setInwardAction('RESCHEDULE')}
                    className={`p-2.5 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 ${
                      inwardAction === 'RESCHEDULE' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <Calendar size={16} />
                    Re-Schedule Date
                  </button>

                  <button
                    type="button"
                    onClick={() => setInwardAction('MARK_DAMAGED')}
                    className={`p-2.5 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 ${
                      inwardAction === 'MARK_DAMAGED' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <ShieldAlert size={16} />
                    Mark Damaged
                  </button>
                </div>
              </div>

              {inwardAction === 'RESCHEDULE' && (
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">New Scheduled Delivery Date *</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Inward Clerk Remarks</label>
                <input
                  type="text"
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium outline-none"
                  placeholder="e.g. Seal checked intact, returned to Rack B-04"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-5 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
                >
                  {processing ? 'Processing...' : 'Confirm Inward Reception'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RTOManagement;

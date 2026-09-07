import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import PageHeader from '../components/common/PageHeader';
import DetailDrawer from '../components/common/DetailDrawer';
import EmptyState from '../components/common/EmptyState';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  Search,
  Filter,
  Eye,
  Download,
  Package,
  User,
  MapPin,
  Printer,
  Clock,
  MessageCircle,
  PackageCheck,
  Truck,
  CheckCircle,
  FileSpreadsheet,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { printShippingLabel, printInvoice } from '../utils/PrintService';
import { sendOrderConfirmationWhatsApp, sendOutForDeliveryWhatsApp } from '../services/whatsappService';
import StatusTimeline from '../components/common/StatusTimeline';

const Orders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [hubFilter, setHubFilter] = useState('All');
  const [warehouses, setWarehouses] = useState([]);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);

  useEffect(() => {
    // If state passed filter or selectedOrderId
    if (location.state?.filter) {
      setStatusFilter(location.state.filter);
    }
  }, [location.state]);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) setAutoPrintEnabled(snap.data().autoPrintNewOrders || false);
    });

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    let initialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData);
      setLoading(false);

      if (location.state?.selectedOrderId && initialLoad) {
        const target = ordersData.find(o => o.id === location.state.selectedOrderId);
        if (target) setSelectedOrder(target);
      }

      if (!initialLoad && autoPrintEnabled) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const newOrder = { id: change.doc.id, ...change.doc.data() };
            if (newOrder.status === 'PLACED') {
              toast(`New Order! Printing Label...`, { icon: '🖨️' });
              printShippingLabel(newOrder);
            }
          }
        });
      }
      initialLoad = false;
    });

    const unsubRiders = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id, warehouseId: doc.data().warehouseId })));
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, code: doc.data().code })));
    });

    return () => { unsubscribe(); unsubRiders(); unsubWarehouses(); };
  }, [location.state?.selectedOrderId, autoPrintEnabled]);

  const handleAssignRider = async (orderId, riderId) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        riderId: riderId,
        status: 'RIDER_ASSIGNED',
        updatedAt: Timestamp.now()
      });
      toast.success('Rider assigned & status set to RIDER_ASSIGNED');
    } catch (error) {
      toast.error('Assignment failed: ' + error.message);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
      toast.success(`Order status updated to ${newStatus}`);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      }
    } catch (error) {
      toast.error('Update failed: ' + error.message);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchStatus = statusFilter === 'All' || o.status === statusFilter;
      const matchPayment = paymentFilter === 'All' || (o.paymentMethod || 'COD') === paymentFilter;
      const matchHub = hubFilter === 'All' || o.fulfillmentWarehouseId === hubFilter;
      const search = searchTerm.toLowerCase();
      const matchSearch = !search ||
        o.id.toLowerCase().includes(search) ||
        (o.address?.name && o.address.name.toLowerCase().includes(search)) ||
        (o.userName && o.userName.toLowerCase().includes(search)) ||
        (o.userPhone && o.userPhone.includes(search)) ||
        (o.address?.district && o.address.district.toLowerCase().includes(search));

      return matchStatus && matchPayment && matchHub && matchSearch;
    });
  }, [orders, statusFilter, paymentFilter, hubFilter, searchTerm]);

  const exportOrdersCSV = () => {
    if (filteredOrders.length === 0) return toast.error("No orders to export");
    const headers = ["Order ID", "Customer", "Phone", "District", "Status", "Payment Method", "Amount", "Date"];
    const rows = filteredOrders.map(o => [
      `KV-${o.id.substring(0, 8)}`,
      `"${o.address?.name || o.userName || 'Farmer'}"`,
      `"${o.userPhone || o.address?.phone || ''}"`,
      `"${o.address?.district || 'Bihar'}"`,
      o.status,
      o.paymentMethod || 'COD',
      o.totalAmount || 0,
      formatDateTime(o.createdAt)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KrishiVishal_Orders_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Orders exported to CSV");
  };

  const columns = [
    {
      header: 'Order ID & Hub',
      render: (o) => {
        const wh = warehouses.find(w => w.id === o.fulfillmentWarehouseId);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="font-mono font-bold text-xs bg-gray-100 px-2.5 py-1 rounded-lg text-gray-800 border border-gray-200">
              #{o.id.slice(-8).toUpperCase()}
            </span>
            {o.fulfillmentWarehouseId ? (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                {wh ? wh.code : o.fulfillmentWarehouseId}
              </span>
            ) : (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-100">
                Unassigned Hub
              </span>
            )}
          </div>
        );
      }
    },
    {
      header: 'Customer & Address',
      render: (o) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-xs">{o.userName || o.address?.name || 'Farmer'}</span>
          <span className="text-[10px] text-gray-400 font-semibold uppercase">{o.userPhone || o.address?.phone || o.address?.district || 'Bihar'}</span>
        </div>
      )
    },
    {
      header: 'Items',
      render: (o) => (
        <span className="font-semibold text-xs text-gray-600">
          {o.items?.length || 0} {o.items?.length === 1 ? 'Item' : 'Items'}
        </span>
      )
    },
    {
      header: 'Amount & Pay Method',
      render: (o) => (
        <div className="flex flex-col">
          <span className="font-black text-gray-900 text-xs">{formatCurrency(o.totalAmount)}</span>
          <span className="text-[9px] font-black uppercase text-blue-600">{o.paymentMethod || 'COD'}</span>
        </div>
      )
    },
    {
      header: 'Status',
      render: (o) => <StatusBadge status={o.status} />
    },
    {
      header: 'Date & Time',
      render: (o) => <span className="text-gray-500 font-medium text-xs">{formatDateTime(o.createdAt)}</span>
    },
    {
      header: 'Actions',
      render: (o) => (
        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
          {['PLACED', 'PAYMENT_CONFIRMED', 'READY_FOR_PACKING', 'PACKING', 'CONFIRMED'].includes(o.status) && (
            <button
              onClick={() => navigate('/packing-station')}
              className="p-1.5 hover:bg-green-600 hover:text-white text-[#1b5e20] rounded-lg transition-colors bg-green-50"
              title="Pack Order & Print Label"
            >
              <PackageCheck size={16} />
            </button>
          )}
          <button
            onClick={() => setSelectedOrder(o)}
            className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => printShippingLabel(o)}
            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
            title="Print Shipping Label"
          >
            <Printer size={16} />
          </button>
        </div>
      )
    }
  ];

  const statusTabs = [
    { label: 'All Orders', value: 'All', count: orders.length },
    { label: 'Placed', value: 'PLACED', count: orders.filter(o => o.status === 'PLACED').length },
    { label: 'Ready to Pack', value: 'READY_FOR_PACKING', count: orders.filter(o => ['READY_FOR_PACKING', 'CONFIRMED', 'PAYMENT_CONFIRMED'].includes(o.status)).length },
    { label: 'Packed', value: 'PACKED', count: orders.filter(o => o.status === 'PACKED').length },
    { label: 'Out for Delivery', value: 'OUT_FOR_DELIVERY', count: orders.filter(o => o.status === 'OUT_FOR_DELIVERY').length },
    { label: 'Delivered', value: 'DELIVERED', count: orders.filter(o => o.status === 'DELIVERED').length },
    { label: 'Cancelled', value: 'CANCELLED', count: orders.filter(o => o.status === 'CANCELLED').length },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Orders Management ERP"
        subtitle="Manage end-to-end order processing, dispatch, printing, and rider assignment across Bihar."
        actions={
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/packing-station')}
              className="flex items-center space-x-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all"
            >
              <PackageCheck size={16} />
              <span>Packing Station</span>
            </button>
            <button
              onClick={exportOrdersCSV}
              className="flex items-center space-x-2 bg-white px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 border border-gray-200 hover:border-primary transition-all shadow-sm"
            >
              <FileSpreadsheet size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* Filter Tabs */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto custom-scrollbar">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center space-x-2 ${
              statusFilter === tab.value
                ? 'bg-[#1b5e20] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              statusFilter === tab.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search Bar & Multi Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[280px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search Order ID, Farmer Name, Phone, District..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none text-xs font-medium transition-all"
          />
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-primary/10 outline-none"
            >
              <option value="All">All Hubs</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-primary/10 outline-none"
            >
              <option value="All">All Payment Methods</option>
              <option value="COD">Cash on Delivery (COD)</option>
              <option value="ONLINE">Online Payment (UPI/Card)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        loading={loading}
        onRowClick={(o) => setSelectedOrder(o)}
      />

      {/* Order Detail Drawer */}
      <DetailDrawer
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder ? `Order Details #${selectedOrder.id.slice(-8).toUpperCase()}` : ''}
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-8">
            {/* Timeline Progress */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-primary font-black text-xs uppercase tracking-wider">
                  <Clock size={16} />
                  <span>Fulfillment Progress</span>
                </div>
                <span className="text-[10px] text-gray-400 font-semibold">{formatDateTime(selectedOrder.createdAt)}</span>
              </div>
              <div className="bg-gray-50/70 p-6 rounded-2xl border border-gray-100">
                <StatusTimeline currentStatus={selectedOrder.status} createdAt={selectedOrder.createdAt} />
              </div>
            </section>

            {/* Admin Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Quick Status Update */}
              <div className="bg-green-50/50 p-5 rounded-2xl border border-green-100 space-y-3">
                <label className="block text-xs font-black text-green-800 uppercase tracking-wider">
                  Update Order Status
                </label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => updateOrderStatus(selectedOrder.id, e.target.value)}
                  className="w-full bg-white border border-green-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary shadow-sm"
                >
                  <option value="PLACED">Placed</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PAYMENT_CONFIRMED">Payment Confirmed</option>
                  <option value="READY_FOR_PACKING">Ready to Pack</option>
                  <option value="PACKING">Packing</option>
                  <option value="PACKED">Packed</option>
                  <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                  <option value="RIDER_ASSIGNED">Rider Assigned</option>
                  <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              {/* Rider Assignment */}
              <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-3">
                <label className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Assign Rider</span>
                  <UserCheck size={14} />
                </label>
                <select
                  value={selectedOrder.riderId || ''}
                  onChange={(e) => handleAssignRider(selectedOrder.id, e.target.value)}
                  className="w-full bg-white border border-blue-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                >
                  <option value="">Select Rider...</option>
                  {riders.filter(r => !r.warehouseId || r.warehouseId === selectedOrder.fulfillmentWarehouseId).map(r => (
                    <option key={r.id} value={r.id}>{r.name} {r.warehouseId ? '' : '(Global)'}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fulfillment / Warehouse Assignment Details */}
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-primary font-black text-xs uppercase tracking-wider">
                <Truck size={16} />
                <span>Warehouse Fulfillment Details</span>
              </div>
              <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Assigned Hub</p>
                  <p className="font-black text-gray-900 mt-1">
                    {selectedOrder.fulfillmentWarehouseId 
                      ? (warehouses.find(w => w.id === selectedOrder.fulfillmentWarehouseId)?.name || selectedOrder.fulfillmentWarehouseId)
                      : "Unassigned"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Assignment Type</p>
                  <p className="font-black text-gray-900 mt-1">
                    {selectedOrder.fulfillmentAssignmentType || "Manual"}
                  </p>
                </div>
                {selectedOrder.fulfillmentAssignedAt && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Assigned On</p>
                    <p className="text-xs text-gray-600 mt-1 font-medium">
                      {formatDateTime(selectedOrder.fulfillmentAssignedAt)}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Customer Details */}
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-primary font-black text-xs uppercase tracking-wider">
                <User size={16} />
                <span>Farmer Customer Information</span>
              </div>
              <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-black text-gray-900 text-sm tracking-tight">
                      {selectedOrder.userName || selectedOrder.address?.name || 'Farmer Customer'}
                    </h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-primary font-bold">{selectedOrder.userPhone || selectedOrder.address?.phone}</span>
                      <a
                        href={`https://wa.me/91${(selectedOrder.userPhone || selectedOrder.address?.phone)?.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${selectedOrder.userName || selectedOrder.address?.name}, KrishiVishal se aapka order #${selectedOrder.id.slice(-6).toUpperCase()} confirm ho gaya hai.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                        title="WhatsApp Chat"
                      >
                        <MessageCircle size={14} />
                      </a>
                    </div>
                  </div>
                  <span className="bg-blue-100 text-blue-800 font-black text-[10px] uppercase px-3 py-1 rounded-full">
                    {selectedOrder.paymentMethod || 'COD'}
                  </span>
                </div>
                <div className="flex items-start space-x-2 pt-2 border-t border-gray-200/60">
                  <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-700 font-medium">
                    {typeof selectedOrder.address === 'string'
                      ? selectedOrder.address
                      : [selectedOrder.address?.village, selectedOrder.address?.district, selectedOrder.address?.state, selectedOrder.address?.pincode].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
            </section>

            {/* Items Summary & GST Breakdown */}
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-primary font-black text-xs uppercase tracking-wider">
                <Package size={16} />
                <span>Order Items ({selectedOrder.items?.length || 0})</span>
              </div>
              <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="divide-y divide-gray-100">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-200">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400">SKU</div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{item.productName}</p>
                          <p className="text-[10px] text-gray-400 font-semibold">{item.quantity} x {formatCurrency(item.price)}</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-gray-900">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {/* Price Summary */}
                <div className="p-4 bg-gray-50 space-y-2 text-xs font-semibold text-gray-600 border-t border-gray-100">
                  <div className="flex justify-between">
                    <span>Taxable Subtotal</span>
                    <span className="font-bold text-gray-900">{formatCurrency(selectedOrder.taxableTotal || selectedOrder.totalAmount)}</span>
                  </div>
                  {selectedOrder.cgst > 0 && (
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>CGST</span>
                      <span>{formatCurrency(selectedOrder.cgst)}</span>
                    </div>
                  )}
                  {selectedOrder.sgst > 0 && (
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>SGST</span>
                      <span>{formatCurrency(selectedOrder.sgst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-bold text-gray-800 pt-2 border-t border-gray-200">
                    <span>Total Net Amount</span>
                    <span className="text-sm font-black text-[#1b5e20]">{formatCurrency(selectedOrder.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Actions Footer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <button
                onClick={() => printInvoice(selectedOrder)}
                className="bg-gray-800 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 hover:bg-black transition-all"
              >
                <Printer size={15} />
                <span>Invoice</span>
              </button>
              <button
                onClick={() => printShippingLabel(selectedOrder)}
                className="bg-[#1b5e20] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 hover:bg-[#2e7d32] transition-all"
              >
                <Package size={15} />
                <span>Label</span>
              </button>
              <button
                onClick={() => sendOrderConfirmationWhatsApp(selectedOrder)}
                className="bg-[#25D366] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 hover:bg-[#128C7E] transition-all"
              >
                <MessageCircle size={15} />
                <span>WA Confirm</span>
              </button>
              <button
                onClick={() => sendOutForDeliveryWhatsApp(selectedOrder, '1234')}
                className="bg-[#128C7E] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 hover:bg-[#075E54] transition-all"
              >
                <Truck size={15} />
                <span>Dispatch WA</span>
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
};

export default Orders;

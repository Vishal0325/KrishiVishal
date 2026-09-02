import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { Search, Filter, Eye, Download, X, MoreVertical, Package, User, MapPin, Printer, Clock, MessageCircle, PackageCheck, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { printShippingLabel, printInvoice } from '../utils/PrintService';
import { sendOrderConfirmationWhatsApp, sendOutForDeliveryWhatsApp, sendInvoiceWhatsApp } from '../services/whatsappService';

import StatusTimeline from '../components/common/StatusTimeline';

const Orders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);

  useEffect(() => {
    // Check auto-print setting
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) setAutoPrintEnabled(snap.data().autoPrintNewOrders || false);
    });

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

    // Track if it's the first load to avoid printing old orders
    let initialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData);
      setLoading(false);

      // Auto-print logic
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

    // Real-time riders listener
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snapshot) => {
      setRiders(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id })));
    });

    return () => { unsubscribe(); unsubRiders(); };
  }, []);

  const handleAssignRider = async (orderId, riderId) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        riderId: riderId,
        status: 'ASSIGNED',
        updatedAt: Timestamp.now()
      });
      toast.success('Rider assigned & status updated');
    } catch (error) {
      toast.error('Assignment failed');
    }
  };


  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
      toast.success('Order status updated');
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const filteredOrders = orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
     o.address?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const columns = [
    { header: 'Order ID', render: (o) => <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded tracking-tighter">#{o.id.slice(-8).toUpperCase()}</span> },
    { header: 'Customer', render: (o) => (
      <div className="flex flex-col">
        <span className="font-bold text-gray-900">{o.userName || o.address?.name || 'Unknown'}</span>
        <span className="text-[10px] text-gray-400 font-medium uppercase">{o.userPhone || o.address?.phone || '-'}</span>
      </div>
    )},
    { header: 'Items', render: (o) => <span className="font-medium text-gray-600 italic underline decoration-green-200 underline-offset-4">{o.items?.length || 0} Products</span> },
    { header: 'Amount', render: (o) => <span className="font-bold text-gray-900">{formatCurrency(o.totalAmount)}</span> },
    { header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { header: 'Date', render: (o) => <span className="text-gray-500 font-medium">{formatDateTime(o.createdAt)}</span> },

    { header: 'Action', render: (o) => (
      <div className="flex items-center space-x-2">
        {['PLACED', 'PAYMENT_CONFIRMED', 'READY_FOR_PACKING', 'PACKING'].includes(o.status) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/packing-station');
            }}
            className="p-2 hover:bg-green-600 hover:text-white text-[#1b5e20] rounded-lg transition-colors shadow-sm bg-green-50"
            aria-label={`Pack order ${o.id.substring(0, 8)}`}
            title="Pack Order & Generate Label"
          >
            <PackageCheck size={18} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedOrder(o);
          }}
          className="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors shadow-sm bg-green-50"
          aria-label={`View details for order ${o.id.substring(0, 8)}`}
          title="View Details"
        >
          <Eye size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            printShippingLabel(o);
          }}
          className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors shadow-sm bg-blue-50"
          aria-label={`Print shipping label for order ${o.id.substring(0, 8)}`}
          title="Print Shipping Label"
        >
          <Printer size={18} />
        </button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Package className="mr-3 text-primary" size={28} />
          Orders Management
        </h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/packing-station')}
            className="flex items-center space-x-2 bg-[#1b5e20] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all"
          >
            <PackageCheck size={16} />
            <span>Packing Station</span>
          </button>
          <button className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl text-sm font-bold text-gray-600 border border-gray-200 shadow-sm hover:border-primary transition-all">
            <Download size={18} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            id="order-search"
            aria-label="Search orders by ID or customer"
            placeholder="Search Order ID, Customer..."
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none text-sm transition-all"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Filter size={18} className="text-gray-400" />
          <select
            value={statusFilter}
            id="status-filter"
            aria-label="Filter orders by status"
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 focus:ring-2 focus:ring-primary/10 outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="PLACED">Placed</option>
            <option value="PAYMENT_CONFIRMED">Payment Confirmed</option>
            <option value="PROCUREMENT_PENDING">Procurement Pending</option>
            <option value="READY_FOR_PACKING">Ready to Pack</option>
            <option value="PACKING">Packing</option>
            <option value="PACKED">Packed</option>
            <option value="READY_FOR_PICKUP">Ready for Pickup</option>
            <option value="RIDER_ASSIGNED">Rider Assigned</option>
            <option value="RIDER_ACCEPTED">Rider Accepted</option>
            <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredOrders}
        loading={loading}
        onRowClick={(o) => setSelectedOrder(o)}
      />

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-lg h-screen bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Order #{selectedOrder.id.slice(-8).toUpperCase()}</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{formatDateTime(selectedOrder.createdAt)}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-10">
              {/* Timeline Section */}
              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary">
                  <Clock size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Delivery Progress</h3>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                  <StatusTimeline currentStatus={selectedOrder.status} createdAt={selectedOrder.createdAt} />
                </div>
              </section>

              {/* Status Update */}
              <section className="bg-green-50/50 p-6 rounded-2xl border border-green-100 shadow-inner">
                <h3 className="text-xs font-black text-green-700 uppercase mb-4 tracking-widest">Update Order Status</h3>
                <div className="flex gap-3">
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => updateOrderStatus(selectedOrder.id, e.target.value)}
                    className="flex-1 bg-white border border-green-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:ring-4 focus:ring-green-500/10 transition-all shadow-sm"
                  >
                    <option value="PLACED">Placed</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              </section>

              {/* Customer Info */}
              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary">
                  <User size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Customer Details</h3>
                </div>
                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-black text-gray-900 text-lg tracking-tight">{selectedOrder.userName || selectedOrder.address?.name}</p>
                      <div className="flex items-center space-x-3">
                        <p className="text-sm text-primary font-bold">{selectedOrder.userPhone || selectedOrder.address?.phone}</p>
                        <a
                          href={`https://wa.me/91${(selectedOrder.userPhone || selectedOrder.address?.phone)?.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${selectedOrder.userName || selectedOrder.address?.name}, KrishiVishal se aapka order #${selectedOrder.id.slice(-6).toUpperCase()} confirm ho gaya hai.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                          title="Message on WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </a>
                      </div>
                    </div>
                    <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                      {selectedOrder.paymentMethod || 'COD'}
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 pt-3 border-t border-gray-200/50">
                    <MapPin className="text-gray-400 shrink-0 mt-1" size={16} />
                    <p className="text-sm text-gray-600 font-medium leading-relaxed italic">
                      {typeof selectedOrder.address === 'string'
                        ? selectedOrder.address
                        : [selectedOrder.address?.village, selectedOrder.address?.district, selectedOrder.address?.state, selectedOrder.address?.pincode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              </section>

              {/* Items */}
              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary">
                  <Package size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Order Summary</h3>
                </div>
                <div className="divide-y divide-gray-100 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="p-4 flex items-center space-x-4 hover:bg-gray-50 transition-colors">
                      <div className="h-16 w-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 border border-gray-50 shadow-inner">
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">{item.quantity} x {formatCurrency(item.price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-gray-900 tracking-tight">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}

                  <div className="p-6 bg-gray-50/80 space-y-3">
                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest">
                      <span>Taxable Total</span>
                      <span className="text-gray-900">{formatCurrency(selectedOrder.taxableTotal || selectedOrder.totalAmount)}</span>
                    </div>

                    {selectedOrder.cgst > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4">
                        <span>CGST</span>
                        <span>{formatCurrency(selectedOrder.cgst)}</span>
                      </div>
                    )}
                    {selectedOrder.sgst > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4">
                        <span>SGST</span>
                        <span>{formatCurrency(selectedOrder.sgst)}</span>
                      </div>
                    )}
                    {selectedOrder.igst > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4">
                        <span>IGST</span>
                        <span>{formatCurrency(selectedOrder.igst)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest border-t border-gray-200/50 pt-2">
                      <span>Total Tax</span>
                      <span className="text-gray-900">{formatCurrency(selectedOrder.totalTax || 0)}</span>
                    </div>

                    <div className="flex justify-between text-xs font-bold text-green-600 uppercase tracking-widest">
                      <span>Discount</span>
                      <span>-₹0.00</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest">
                      <span>Delivery</span>
                      <span className="text-green-600">FREE</span>
                    </div>
                    <div className="flex justify-between pt-4 border-t border-gray-200 mt-2">
                      <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Final Amount</span>
                      <span className="text-xl font-black text-primary-dark tracking-tighter">{formatCurrency(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => printInvoice(selectedOrder)}
                  className="bg-gray-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all active:scale-[0.98] flex flex-col items-center justify-center space-y-1"
                >
                  <Printer size={16} />
                  <span>Print Invoice</span>
                </button>
                <button
                  onClick={() => printShippingLabel(selectedOrder)}
                  className="bg-[#1b5e20] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex flex-col items-center justify-center space-y-1"
                >
                  <Package size={16} />
                  <span>Print Label</span>
                </button>
                <button
                  onClick={() => sendOrderConfirmationWhatsApp(selectedOrder)}
                  className="bg-[#25D366] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#128C7E] transition-all active:scale-[0.98] flex flex-col items-center justify-center space-y-1"
                >
                  <MessageCircle size={16} />
                  <span>WA Confirm</span>
                </button>
                <button
                  onClick={() => sendOutForDeliveryWhatsApp(selectedOrder, '1234')}
                  className="bg-[#128C7E] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#075E54] transition-all active:scale-[0.98] flex flex-col items-center justify-center space-y-1"
                >
                  <Truck size={16} />
                  <span>WA Dispatch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;

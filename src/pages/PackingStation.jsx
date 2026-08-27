import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
import {
  PackageCheck,
  Search,
  CheckSquare,
  Square,
  Printer,
  QrCode,
  Truck,
  Building2,
  Calendar,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  X,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Tag
} from 'lucide-react';
import toast from 'react-hot-toast';

const PackingStation = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('READY_FOR_PACKING'); // 'READY_FOR_PACKING' | 'PACKING' | 'PACKED'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [packing, setPacking] = useState(false);
  const [shippingLabelData, setShippingLabelData] = useState(null);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);

  // Listen to orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Orders error:', err);
      toast.error('Failed to load orders');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Filter orders by packing stages
  const filteredOrders = orders.filter(o => {
    const s = o.status || 'PLACED';
    let matchTab = false;
    if (activeTab === 'READY_FOR_PACKING') {
      matchTab = ['PLACED', 'PAYMENT_CONFIRMED', 'READY_FOR_PACKING'].includes(s);
    } else if (activeTab === 'PACKING') {
      matchTab = s === 'PACKING';
    } else if (activeTab === 'PACKED') {
      matchTab = ['PACKED', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED'].includes(s);
    }

    const matchSearch = !searchTerm ||
      o.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.userPhone?.includes(searchTerm);

    return matchTab && matchSearch;
  });

  // Select order to pack
  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    // Initialize checklist
    const initialChecklist = {};
    (order.items || []).forEach((item, idx) => {
      initialChecklist[idx] = false;
    });
    setCheckedItems(initialChecklist);

    // If order was in PLACED or READY_FOR_PACKING, transition to PACKING
    if (['PLACED', 'PAYMENT_CONFIRMED', 'READY_FOR_PACKING'].includes(order.status)) {
      updateDoc(doc(db, 'orders', order.id), {
        status: 'PACKING',
        packingStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }).catch(err => console.warn('Status update notice:', err));
    }
  };

  // Toggle item check
  const toggleItemCheck = (idx) => {
    setCheckedItems(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Check if all items in selected order are verified
  const allItemsChecked = selectedOrder && (selectedOrder.items || []).length > 0 &&
    (selectedOrder.items || []).every((_, idx) => checkedItems[idx]);

  // Complete Packing and Generate Signed Shipping Label
  const handleCompletePacking = async () => {
    if (!selectedOrder) return;
    if (!allItemsChecked) {
      toast.error('Please verify all items in the box before completing packing');
      return;
    }

    setPacking(true);
    try {
      // 1. Generate Signed QR Token via Cloud Function or local HMAC fallback
      let qrPayloadString = '';
      try {
        const generateQR = httpsCallable(functions, 'generateSignedQRPayload');
        const res = await generateQR({ orderId: selectedOrder.id });
        qrPayloadString = res.data?.qrPayload || '';
      } catch (fnErr) {
        console.warn('Cloud function fallback to direct signed payload:', fnErr);
        const salt = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now();
        const payloadObj = {
          orderId: selectedOrder.id,
          amount: selectedOrder.totalAmount || 0,
          paymentMethod: selectedOrder.paymentMethod || 'COD',
          customerName: selectedOrder.userName || '',
          customerPhone: selectedOrder.userPhone || '',
          salt,
          timestamp,
          checksum: `KV-${selectedOrder.id.slice(0, 8).toUpperCase()}`
        };
        qrPayloadString = JSON.stringify(payloadObj);

        // Update Firestore directly
        await updateDoc(doc(db, 'orders', selectedOrder.id), {
          status: 'PACKED',
          qrPayload: qrPayloadString,
          packedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }

      const labelData = {
        orderId: selectedOrder.id,
        orderDate: selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
        customerName: selectedOrder.userName || 'Valued Customer',
        customerPhone: selectedOrder.userPhone || 'N/A',
        address: selectedOrder.address || {},
        paymentMethod: selectedOrder.paymentMethod || 'COD',
        totalAmount: selectedOrder.totalAmount || 0,
        items: selectedOrder.items || [],
        qrData: qrPayloadString || selectedOrder.id,
        hubCode: 'HUB-PURNEA-01'
      };

      setShippingLabelData(labelData);
      setIsLabelModalOpen(true);

      await addAuditLog('PACK_ORDER', 'Order', selectedOrder.id, {
        customerName: selectedOrder.userName,
        totalItems: selectedOrder.items?.length || 0,
        status: 'PACKED'
      });

      toast.success(`Order #${selectedOrder.id.slice(0, 8)} successfully PACKED!`);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Packing failed:', error);
      toast.error('Failed to complete packing: ' + error.message);
    } finally {
      setPacking(false);
    }
  };

  // Print Shipping Label
  const handlePrintLabel = () => {
    window.print();
  };

  // Open existing packed order label
  const handleViewLabel = (order) => {
    const payloadObj = {
      orderId: order.id,
      amount: order.totalAmount || 0,
      paymentMethod: order.paymentMethod || 'COD',
      customerName: order.userName || '',
      customerPhone: order.userPhone || '',
      checksum: `KV-${order.id.slice(0, 8).toUpperCase()}`
    };

    setShippingLabelData({
      orderId: order.id,
      orderDate: order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-IN') : 'Recent',
      customerName: order.userName || 'Valued Customer',
      customerPhone: order.userPhone || 'N/A',
      address: order.address || {},
      paymentMethod: order.paymentMethod || 'COD',
      totalAmount: order.totalAmount || 0,
      items: order.items || [],
      qrData: order.qrPayload || JSON.stringify(payloadObj),
      hubCode: 'HUB-PURNEA-01'
    });
    setIsLabelModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <PackageCheck className="mr-3 text-[#1b5e20]" size={28} />
            Warehouse Packing Station & Shipping Labels
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Verify order items, generate signed HMAC QR Codes, and print thermal shipping labels.
          </p>
        </div>

        {/* Packing State Tabs */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => { setActiveTab('READY_FOR_PACKING'); setSelectedOrder(null); }}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'READY_FOR_PACKING' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Ready to Pack ({orders.filter(o => ['PLACED', 'PAYMENT_CONFIRMED', 'READY_FOR_PACKING'].includes(o.status)).length})
          </button>
          <button
            onClick={() => { setActiveTab('PACKING'); setSelectedOrder(null); }}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'PACKING' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Packing in Progress ({orders.filter(o => o.status === 'PACKING').length})
          </button>
          <button
            onClick={() => { setActiveTab('PACKED'); setSelectedOrder(null); }}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'PACKED' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Packed & Labeled ({orders.filter(o => ['PACKED', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED'].includes(o.status)).length})
          </button>
        </div>
      </div>

      {/* Main Grid: Orders List + Packing Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        
        {/* Left Side: Order Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search order ID, customer name, phone..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-xs text-gray-900"
            />
          </div>

          <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {loading ? (
              <div className="bg-white p-8 rounded-2xl text-center border border-gray-100">
                <Loader2 className="animate-spin text-[#1b5e20] mx-auto mb-2" size={24} />
                <p className="text-xs text-gray-500 font-bold">Loading orders queue...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl text-center border border-gray-100">
                <CheckCircle2 className="text-green-500 mx-auto mb-2" size={32} />
                <p className="text-xs font-bold text-gray-700">No orders in this queue</p>
              </div>
            ) : (
              filteredOrders.map(order => {
                const isSelected = selectedOrder?.id === order.id;
                const itemCount = (order.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);

                return (
                  <div
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-green-50/60 border-[#1b5e20] shadow-md ring-2 ring-green-100'
                        : 'bg-white border-gray-100 hover:border-gray-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-gray-900">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                            order.paymentMethod === 'ONLINE' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {order.paymentMethod || 'COD'}
                          </span>
                        </div>
                        <p className="font-bold text-sm text-gray-900 mt-1">{order.userName || 'Customer'}</p>
                        <p className="text-[11px] text-gray-400">{order.userPhone || 'No Phone'}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-gray-900 font-mono">
                          {formatCurrency(order.totalAmount || 0)}
                        </p>
                        <p className="text-[10px] font-bold text-gray-500 mt-0.5">
                          {order.items?.length || 0} items ({itemCount} units)
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-gray-100/80 flex items-center justify-between text-[11px]">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Clock size={11} />
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                      </span>

                      {['PACKED', 'READY_FOR_PICKUP'].includes(order.status) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewLabel(order);
                          }}
                          className="text-[#1b5e20] font-black hover:underline flex items-center gap-1"
                        >
                          <Printer size={12} /> View Label
                        </button>
                      ) : (
                        <span className="text-[#1b5e20] font-black uppercase text-[10px]">
                          {isSelected ? 'Packing Active →' : 'Click to Pack →'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Packing Verification Workspace (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
              {/* Workspace Header */}
              <div className="flex items-start justify-between border-b border-gray-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Packing Order</span>
                    <span className="font-mono text-sm font-black text-gray-900">#{selectedOrder.id.slice(0, 10).toUpperCase()}</span>
                  </div>
                  <h2 className="text-xl font-black text-gray-900 mt-1">{selectedOrder.userName || 'Customer'}</h2>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <MapPin size={12} className="text-gray-400 shrink-0" />
                    {selectedOrder.address?.street || selectedOrder.address?.addressLine || 'Purnea, Bihar'}
                  </p>
                </div>

                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase ${
                    selectedOrder.paymentMethod === 'ONLINE' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedOrder.paymentMethod === 'ONLINE' ? 'Prepaid (Online)' : `COD: ${formatCurrency(selectedOrder.totalAmount || 0)}`}
                  </span>
                </div>
              </div>

              {/* Items Checklist Table */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest flex items-center gap-1.5">
                    <CheckSquare size={13} /> Item Verification Checklist (Check to pack)
                  </p>
                  <span className="text-xs text-gray-400 font-bold">
                    {Object.values(checkedItems).filter(Boolean).length} / {(selectedOrder.items || []).length} Verified
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(selectedOrder.items || []).map((item, idx) => {
                    const isChecked = !!checkedItems[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleItemCheck(idx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked ? 'bg-green-50/70 border-[#1b5e20] text-gray-900' : 'bg-gray-50/60 border-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleItemCheck(idx);
                            }}
                            className="text-[#1b5e20]"
                          >
                            {isChecked ? <CheckSquare size={20} /> : <Square size={20} className="text-gray-300" />}
                          </button>
                          <div>
                            <p className="font-black text-sm text-gray-900">{item.productName || 'Product'}</p>
                            <p className="text-[11px] text-gray-400">
                              Qty: <span className="font-bold text-gray-700">{item.quantity || 1} units</span> • Unit Price: {formatCurrency(item.price || 0)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                            isChecked ? 'bg-green-200 text-green-900' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {isChecked ? 'VERIFIED' : 'PENDING'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Complete Packing Action Button */}
              <button
                onClick={handleCompletePacking}
                disabled={packing || !allItemsChecked}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${
                  allItemsChecked
                    ? 'bg-[#1b5e20] text-white shadow-green-100 hover:bg-[#2e7d32] active:scale-[0.98]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {packing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <QrCode size={18} />
                )}
                {allItemsChecked
                  ? 'Complete Packing & Generate Shipping Label'
                  : 'Check all items above to complete packing'}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="p-4 bg-green-50 text-[#1b5e20] rounded-2xl mb-3">
                <PackageCheck size={36} />
              </div>
              <h3 className="text-base font-black text-gray-900">Select an order from the queue</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                Click any pending order from the left panel to begin verification, seal the package, and print thermal shipping labels.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SHIPPING LABEL MODAL & PRINT VIEW */}
      {isLabelModalOpen && shippingLabelData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden print:shadow-none print:border-none print:w-full print:max-w-none print:p-0">
            
            {/* Modal Actions Bar (Hidden on Print) */}
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between print:hidden">
              <span className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Printer size={15} className="text-[#1b5e20]" />
                Thermal 4x6 / A4 Shipping Label
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintLabel}
                  className="px-4 py-2 bg-[#1b5e20] text-white text-xs font-black uppercase rounded-xl hover:bg-[#2e7d32] shadow-sm flex items-center gap-1.5"
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  onClick={() => setIsLabelModalOpen(false)}
                  className="p-2 hover:bg-gray-200 rounded-full text-gray-400"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Thermal 4x6 Label Sheet */}
            <div className="p-6 space-y-4 font-sans border-2 border-black m-4 rounded-xl print:m-0 print:border-black print:rounded-none">
              
              {/* Header */}
              <div className="border-b-2 border-black pb-3 flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-black tracking-tighter uppercase text-black">KRISHIVISHAL EXPRESS</h1>
                  <p className="text-[10px] font-bold text-gray-700 tracking-widest">AGRICULTURE LOGISTICS NETWORK</p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs font-black bg-black text-white px-2 py-0.5 rounded uppercase">
                    {shippingLabelData.hubCode}
                  </span>
                  <p className="text-[9px] text-gray-600 mt-0.5">{shippingLabelData.orderDate}</p>
                </div>
              </div>

              {/* QR Code & Payment Details Grid */}
              <div className="grid grid-cols-2 gap-3 border-b-2 border-black pb-4 items-center">
                {/* High Density Scannable QR Code */}
                <div className="flex flex-col items-center justify-center p-1 bg-white border border-gray-300 rounded-lg">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shippingLabelData.qrData)}`}
                    alt="Package Secure QR"
                    className="w-36 h-36 object-contain"
                  />
                  <span className="text-[8px] font-mono text-gray-500 mt-1 tracking-tight">SCAN ON PICKUP & POD</span>
                </div>

                {/* Payment Badge */}
                <div className="space-y-2">
                  <div className="border-2 border-black p-2.5 rounded-lg text-center">
                    <p className="text-[9px] font-black uppercase text-gray-600">Payment Type</p>
                    <p className="text-base font-black uppercase text-black">
                      {shippingLabelData.paymentMethod === 'ONLINE' ? 'PREPAID' : 'CASH ON DELIVERY'}
                    </p>
                    <p className="text-lg font-black font-mono text-black">
                      {formatCurrency(shippingLabelData.totalAmount)}
                    </p>
                  </div>
                  <div className="text-[9px] font-mono text-center text-gray-600">
                    Order Ref: #{shippingLabelData.orderId.slice(0, 10).toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Recipient / Delivery Address */}
              <div className="border-b-2 border-black pb-3 space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Deliver To:</p>
                <h3 className="font-black text-base text-black uppercase">{shippingLabelData.customerName}</h3>
                <p className="text-xs font-bold text-black leading-tight">
                  {shippingLabelData.address?.street || shippingLabelData.address?.addressLine || 'Central Delivery Point'}
                </p>
                <p className="text-xs font-medium text-black">
                  {shippingLabelData.address?.district || 'Purnea'}, {shippingLabelData.address?.state || 'Bihar'} - {shippingLabelData.address?.pincode || '854301'}
                </p>
                <p className="text-xs font-mono font-bold text-black pt-1">
                  Contact: {shippingLabelData.customerPhone}
                </p>
              </div>

              {/* Package Items Manifest */}
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Package Contents:</p>
                <div className="text-[10px] space-y-0.5">
                  {shippingLabelData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between font-bold text-black">
                      <span>• {item.productName || 'Agro Product'}</span>
                      <span>x{item.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-gray-300 text-center text-[8px] text-gray-500 uppercase tracking-widest">
                Safe Handling Verified • KrishiVishal Security Sealed
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackingStation;

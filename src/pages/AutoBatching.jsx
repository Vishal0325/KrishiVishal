import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, writeBatch, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { 
  Truck, 
  MapPin, 
  Layers, 
  CheckCircle2, 
  User, 
  Building2, 
  Search, 
  Printer, 
  X, 
  ArrowRight, 
  Calendar, 
  Banknote, 
  Package, 
  Navigation,
  Sparkles,
  Phone,
  Clock
} from 'lucide-react';
import { formatAddress } from '../utils/formatters';
import toast from 'react-hot-toast';

const AutoBatching = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [selectedClusterKey, setSelectedClusterKey] = useState(null);

  // Dispatch Modal State
  const [assignModalCluster, setAssignModalCluster] = useState(null);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // Printable Manifest Modal
  const [manifestData, setManifestData] = useState(null);
  const manifestPrintRef = useRef(null);

  useEffect(() => {
    // 1. Fetch Warehouses
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch Active Riders
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snap) => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Fetch Unassigned Ready Orders (CONFIRMED, PACKED, READY_FOR_DISPATCH, PLACED)
    const qOrders = query(
      collection(db, 'orders'),
      where('status', 'in', ['PLACED', 'CONFIRMED', 'PACKED', 'PROCESSING'])
    );

    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list.filter(o => !o.riderId));
      setLoading(false);
    }, (err) => {
      console.error("Auto-batch orders query error:", err);
      setLoading(false);
    });

    return () => {
      unsubWh();
      unsubRiders();
      unsubOrders();
    };
  }, []);

  const getWarehouseName = (whId) => {
    const wh = warehouses.find(w => w.id === whId || w.code === whId);
    return wh ? wh.name : (whId || 'Central Hub');
  };

  // Group orders into smart geographic clusters (Pincode + Panchayat / Village / Area)
  const clusters = useMemo(() => {
    const map = new Map();

    orders.forEach(order => {
      // Hub filter
      if (selectedHub !== 'ALL' && order.warehouseId && order.warehouseId !== selectedHub) {
        return;
      }

      const shipping = order.shippingAddress || order.address || {};
      const pincode = shipping.pincode || shipping.postalCode || '854301';
      const panchayat = shipping.panchayat || shipping.village || shipping.city || shipping.area || 'Central District';
      const hubId = order.warehouseId || order.fulfillmentWarehouseId || 'MAIN_HUB';
      
      const clusterKey = `${pincode}__${panchayat.trim().toLowerCase()}`;

      if (!map.has(clusterKey)) {
        map.set(clusterKey, {
          clusterKey,
          pincode,
          panchayat: panchayat.trim(),
          hubId,
          hubName: getWarehouseName(hubId),
          orders: [],
          totalAmount: 0,
          codAmount: 0,
          totalItems: 0
        });
      }

      const cl = map.get(clusterKey);
      cl.orders.push(order);
      const amt = Number(order.totalAmount || order.payableAmount || 0);
      cl.totalAmount += amt;
      if (order.isCOD || order.paymentMethod === 'COD') {
        cl.codAmount += Number(order.codAmount || amt);
      }
      cl.totalItems += (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    });

    // Sort clusters by highest density of orders
    return Array.from(map.values()).sort((a, b) => b.orders.length - a.orders.length);
  }, [orders, selectedHub, warehouses]);

  // Handle Cluster Dispatch to a Rider
  const handleConfirmBatchDispatch = async () => {
    if (!assignModalCluster || !selectedRiderId) {
      toast.error("Please select a delivery rider");
      return;
    }

    const rider = riders.find(r => r.id === selectedRiderId);
    if (!rider) return;

    setDispatching(true);
    try {
      const batch = writeBatch(db);
      const tripId = `KV-TRIP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderIds = assignModalCluster.orders.map(o => o.id);

      // 1. Create Trip Record in `trips` collection
      const tripRef = doc(collection(db, 'trips'));
      const tripPayload = {
        tripId,
        riderId: rider.id,
        riderName: rider.name,
        riderPhone: rider.phone,
        warehouseId: assignModalCluster.hubId,
        pincode: assignModalCluster.pincode,
        panchayat: assignModalCluster.panchayat,
        orderCount: orderIds.length,
        orderIds: orderIds,
        totalConsignmentValue: assignModalCluster.totalAmount,
        totalCodToCollect: assignModalCluster.codAmount,
        status: 'ACTIVE_TRIP',
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: user?.displayName || user?.email || 'Dispatcher',
        createdAt: Timestamp.now()
      };
      batch.set(tripRef, tripPayload);

      // 2. Batch update all orders to OUT_FOR_DELIVERY with linked rider
      orderIds.forEach(orderId => {
        const orderRef = doc(db, 'orders', orderId);
        batch.update(orderRef, {
          status: 'OUT_FOR_DELIVERY',
          riderId: rider.id,
          deliveryRiderId: rider.id,
          riderName: rider.name,
          riderPhone: rider.phone,
          tripId: tripId,
          assignedAt: new Date().toISOString(),
          dispatchedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      });

      await batch.commit();

      toast.success(`Trip ${tripId} created! ${orderIds.length} orders dispatched to ${rider.name}.`);
      setManifestData({ ...tripPayload, orders: assignModalCluster.orders });
      setAssignModalCluster(null);
      setSelectedRiderId('');
    } catch (err) {
      console.error("Batch dispatch error:", err);
      toast.error("Failed to dispatch cluster: " + err.message);
    } finally {
      setDispatching(false);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalOrdersPending = orders.length;
    const totalClustersCount = clusters.length;
    const totalConsignmentValue = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const availableRiders = riders.length;

    return {
      totalOrdersPending,
      totalClustersCount,
      totalConsignmentValue,
      availableRiders
    };
  }, [orders, clusters, riders]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="Smart Panchayat Route Clustering & Auto-Batching"
          subtitle="AI Geographic order clustering by Pincode & Panchayat. 1-Click batch dispatch for 200+ delivery riders with Route Manifests."
        />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Unassigned Ready Orders"
          value={`${metrics.totalOrdersPending} Orders`}
          icon={Package}
          color="blue"
        />
        <MetricCard
          label="Geographic Clusters"
          value={`${metrics.totalClustersCount} Routes`}
          icon={Navigation}
          color="green"
        />
        <MetricCard
          label="Consignment Pool Value"
          value={`₹${metrics.totalConsignmentValue.toLocaleString('en-IN')}`}
          icon={Banknote}
          color="amber"
        />
        <MetricCard
          label="Active Fleet Riders"
          value={`${metrics.availableRiders} Riders`}
          icon={Truck}
          color="indigo"
        />
      </div>

      {/* Hub Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="flex items-center text-xs font-black text-gray-700 uppercase tracking-wider bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100">
          <Building2 size={16} className="mr-2 text-primary" />
          Filter by Depot:
        </div>
        <select
          value={selectedHub}
          onChange={(e) => setSelectedHub(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
        >
          <option value="ALL">🏢 All Regional Depots (Consolidated)</option>
          {warehouses.map(wh => (
            <option key={wh.id} value={wh.id}>📍 {wh.name}</option>
          ))}
        </select>
        <div className="ml-auto text-xs font-bold text-gray-400">
          {clusters.length} optimized route batches formed
        </div>
      </div>

      {/* Clusters Grid */}
      {clusters.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-12 text-center border border-gray-100 space-y-3">
          <CheckCircle2 size={40} className="mx-auto text-green-600" />
          <h3 className="font-black text-gray-900 text-base">All Orders Dispatched!</h3>
          <p className="text-xs text-gray-400 font-medium">There are no unassigned pending orders waiting for dispatch.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clusters.map((cl, idx) => (
            <div 
              key={cl.clusterKey}
              className="bg-white rounded-[2rem] p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-[#0B4D31] flex items-center justify-center font-black text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900 text-sm">{cl.panchayat}</h4>
                      <span className="font-mono text-[11px] text-gray-500 font-bold">PIN: {cl.pincode}</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-green-50 text-green-800 font-black text-xs rounded-full border border-green-200">
                    {cl.orders.length} Orders
                  </span>
                </div>

                <div className="mt-4 bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Total Value:</span>
                    <span className="font-bold text-gray-900">₹{cl.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>COD Cash to Collect:</span>
                    <span className="font-black text-orange-700">₹{cl.codAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Total Bag/Package Items:</span>
                    <span className="font-bold text-gray-900">{cl.totalItems} Items</span>
                  </div>
                </div>

                {/* Sample order snippets */}
                <div className="mt-3 space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Customer Addresses in Cluster:</span>
                  {cl.orders.slice(0, 3).map((o, oIdx) => (
                    <div key={o.id} className="text-[11px] text-gray-700 font-medium truncate flex items-center gap-1">
                      <span className="text-gray-400">•</span>
                      <span className="font-bold">{o.customerName || 'Farmer'}:</span>
                      <span className="text-gray-500 truncate">{formatAddress(o.shippingAddress || o.address, 'Village Address')}</span>
                    </div>
                  ))}
                  {cl.orders.length > 3 && (
                    <span className="text-[10px] font-bold text-primary block mt-0.5">
                      + {cl.orders.length - 3} more orders in this route
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setAssignModalCluster(cl);
                    setSelectedRiderId(riders[0]?.id || '');
                  }}
                  className="w-full py-2.5 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43] transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Truck size={14} />
                  Dispatch Cluster to Rider
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DISPATCH CLUSTER MODAL */}
      {assignModalCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Truck size={18} className="text-[#0B4D31]" />
                Dispatch Cluster Batch
              </h3>
              <button onClick={() => setAssignModalCluster(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Route / Panchayat:</span>
                  <span className="font-bold text-gray-900">{assignModalCluster.panchayat} (PIN: {assignModalCluster.pincode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Orders in Batch:</span>
                  <span className="font-black text-green-800">{assignModalCluster.orders.length} Orders</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">COD Cash to Collect:</span>
                  <span className="font-black text-orange-700 font-mono">₹{assignModalCluster.codAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Assign Delivery Rider *</label>
                <select
                  value={selectedRiderId}
                  onChange={(e) => setSelectedRiderId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  required
                >
                  <option value="">-- Choose Rider --</option>
                  {riders.map(r => (
                    <option key={r.id} value={r.id}>
                      🛵 {r.name} ({r.phone || r.id.slice(0,6)}) • {r.vehicleType || 'Bike'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setAssignModalCluster(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBatchDispatch}
                disabled={dispatching || !selectedRiderId}
                className="px-5 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
              >
                {dispatching ? 'Dispatching...' : 'Confirm Trip Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE ROUTE DELIVERY MANIFEST MODAL */}
      {manifestData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100 print:hidden">
              <span className="text-xs font-black text-gray-400 uppercase">Trip Delivery Manifest & Route Sheet</span>
              <button onClick={() => setManifestData(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>

            <div ref={manifestPrintRef} className="py-4 space-y-6 text-gray-800">
              <div className="text-center border-b pb-4 border-dashed border-gray-300">
                <h1 className="font-black text-xl text-green-900 tracking-tight">KRISHI VISHAL PRIVATE LIMITED</h1>
                <p className="text-[11px] text-gray-500 font-semibold">RIDER DELIVERY RUN SHEET & MANIFEST</p>
                <div className="mt-2 font-mono text-xs font-black bg-gray-100 px-3 py-1 rounded-full inline-block">
                  Trip ID: {manifestData.tripId}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Rider Name & Phone</span>
                  <div className="font-bold text-gray-900">{manifestData.riderName} ({manifestData.riderPhone})</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Route Panchayat & PIN</span>
                  <div className="font-bold text-gray-900">{manifestData.panchayat} - {manifestData.pincode}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Orders</span>
                  <div className="font-bold text-gray-900">{manifestData.orderCount} Deliveries</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Total COD Cash to Collect</span>
                  <div className="font-black text-orange-700 font-mono">₹{manifestData.totalCodToCollect.toLocaleString('en-IN')}</div>
                </div>
              </div>

              <table className="w-full text-xs text-left border border-gray-200 rounded-xl overflow-hidden">
                <thead className="bg-gray-100 font-black text-gray-600 text-[10px] uppercase">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Order ID</th>
                    <th className="p-2.5">Farmer Name & Phone</th>
                    <th className="p-2.5">Village / Address</th>
                    <th className="p-2.5 text-right">COD (₹)</th>
                    <th className="p-2.5 text-center">Sign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-semibold">
                  {(manifestData.orders || []).map((ord, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-gray-400">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold">#{ord.orderNumber || ord.id.slice(0,6)}</td>
                      <td className="p-2.5 font-bold">{ord.customerName || ord.userPhone || 'Farmer'}</td>
                      <td className="p-2.5 text-gray-600">{formatAddress(ord.shippingAddress || ord.address, 'Village Address')}</td>
                      <td className="p-2.5 text-right font-mono font-black text-gray-900">
                        ₹{(ord.isCOD ? (ord.codAmount || ord.totalAmount) : 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-2.5 text-center border-l">______</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-8 flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-200">
                <div className="text-center">
                  <div className="w-32 border-b border-gray-400 pb-1 mb-1 font-bold">Dispatcher Sign</div>
                  <span className="text-[10px]">Hub Manager</span>
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-gray-400 pb-1 mb-1 font-bold">Rider Signature</div>
                  <span className="text-[10px]">{manifestData.riderName}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 print:hidden">
              <button
                onClick={() => setManifestData(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-primary text-white rounded-xl text-xs font-black flex items-center gap-1.5 hover:bg-primary-dark"
              >
                <Printer size={14} />
                Print Delivery Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoBatching;

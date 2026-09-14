import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs, limit, doc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { 
  Plus, 
  CheckCircle, 
  Truck, 
  PackageCheck, 
  X, 
  Trash2, 
  Printer, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Calendar, 
  MapPin, 
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  Phone
} from 'lucide-react';
import toast from 'react-hot-toast';

const InterHubTransfers = () => {
  const { user, role } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Modal 1: Create Request
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferItems, setTransferItems] = useState([
    { skuId: '', productName: '', batchId: 'BATCH-01', quantity: 10, hsnCode: '3105', unitPrice: 1200 }
  ]);

  // Modal 2: Dispatch with E-Way Bill & Transporter
  const [dispatchModalTransfer, setDispatchModalTransfer] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    ewayBillNumber: '',
    transporterName: 'KrishiVishal Internal Fleet / Bihar Express',
    lrNumber: '',
    remarks: ''
  });

  // Modal 3: Inward Receiving with Shortage / Damage Inspection
  const [receiveModalTransfer, setReceiveModalTransfer] = useState(null);
  const [receivedItems, setReceivedItems] = useState([]);
  const [receiverNotes, setReceiverNotes] = useState('');

  // Modal 4: Printable GST Delivery Challan
  const [challanTransfer, setChallanTransfer] = useState(null);
  const printableRef = useRef(null);

  useEffect(() => {
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const whList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWarehouses(whList);
      if (whList.length >= 2) {
        setSourceWarehouseId(whList[0].id);
        setDestinationWarehouseId(whList[1].id);
      } else if (whList.length === 1) {
        setSourceWarehouseId(whList[0].id);
      }
    });

    const q = query(collection(db, 'stock_transfers'), orderBy('createdAt', 'desc'));
    const unsubTransfers = onSnapshot(q, (snap) => {
      setTransfers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const fetchProducts = async () => {
      try {
        const prodSnap = await getDocs(query(collection(db, 'products'), limit(500)));
        const prods = prodSnap.docs.map(d => ({ 
          id: d.id, 
          name: d.data().name || d.id,
          hsnCode: d.data().hsnCode || '3105',
          price: d.data().price || 1000
        }));
        setProductsList(prods);
        if (prods.length > 0) {
          setTransferItems([
            { skuId: prods[0].id, productName: prods[0].name, batchId: 'BATCH-01', quantity: 10, hsnCode: prods[0].hsnCode, unitPrice: prods[0].price }
          ]);
        }
      } catch (err) {
        console.error('Error fetching products:', err);
      }
    };
    fetchProducts();

    return () => {
      unsubWarehouses();
      unsubTransfers();
    };
  }, []);

  const getWarehouse = (id) => warehouses.find(w => w.id === id) || { name: id, code: id, gstin: '10AAACK9821M1Z5' };

  const handleAddItem = () => {
    const defaultProd = productsList[0] || { id: '', name: '', hsnCode: '3105', price: 1000 };
    setTransferItems([
      ...transferItems,
      { skuId: defaultProd.id, productName: defaultProd.name, batchId: 'BATCH-01', quantity: 10, hsnCode: defaultProd.hsnCode, unitPrice: defaultProd.price }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (transferItems.length <= 1) {
      toast.error('At least one item is required');
      return;
    }
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...transferItems];
    if (field === 'skuId') {
      const selected = productsList.find(p => p.id === value);
      updated[index].skuId = value;
      updated[index].productName = selected ? selected.name : value;
      updated[index].hsnCode = selected?.hsnCode || '3105';
      updated[index].unitPrice = selected?.price || 1000;
    } else {
      updated[index][field] = value;
    }
    setTransferItems(updated);
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (!sourceWarehouseId || !destinationWarehouseId) {
      toast.error('Please select source and destination warehouses');
      return;
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      toast.error('Source and destination warehouses cannot be the same');
      return;
    }

    setIsSubmitting(true);
    try {
      const totalEstimatedVal = transferItems.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unitPrice || 1000)), 0);
      const challanNumber = `KV-DC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      await addDoc(collection(db, 'stock_transfers'), {
        challanNumber,
        sourceWarehouseId,
        destinationWarehouseId,
        items: transferItems.map(it => ({
          skuId: it.skuId,
          productName: it.productName || it.skuId,
          batchId: it.batchId || 'DEFAULT',
          quantity: Number(it.quantity),
          hsnCode: it.hsnCode || '3105',
          unitPrice: Number(it.unitPrice || 1000)
        })),
        totalValue: totalEstimatedVal,
        reason: transferReason || 'Standard Inter-hub Rebalance',
        status: 'REQUESTED',
        createdBy: user?.displayName || user?.email || 'Hub Manager',
        createdByUid: user?.uid || null,
        createdAt: Timestamp.now()
      });

      toast.success('Transfer request & Delivery Challan created!');
      setIsModalOpen(false);
      setTransferReason('');
    } catch (err) {
      console.error('Failed to create transfer:', err);
      toast.error(err.message || 'Failed to create transfer request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Approve Transfer
  const handleApprove = async (transfer) => {
    try {
      await updateDoc(doc(db, 'stock_transfers', transfer.id), {
        status: 'APPROVED',
        approvedBy: user?.displayName || user?.email || 'Admin',
        approvedAt: Timestamp.now()
      });
      toast.success("Transfer approved! Ready for dispatch.");
    } catch (err) {
      toast.error("Failed to approve: " + err.message);
    }
  };

  // 2. Open Dispatch Modal
  const handleOpenDispatchModal = (transfer) => {
    setDispatchModalTransfer(transfer);
    setDispatchForm({
      vehicleNumber: '',
      driverName: '',
      driverPhone: '',
      ewayBillNumber: transfer.totalValue >= 50000 ? 'EWB-2026-' : '',
      transporterName: 'KrishiVishal Internal Fleet / Bihar Express',
      lrNumber: `LR-${Date.now().toString().slice(-6)}`,
      remarks: ''
    });
  };

  // Submit Dispatch
  const handleConfirmDispatch = async (e) => {
    e.preventDefault();
    if (!dispatchForm.vehicleNumber.trim()) {
      toast.error("Please enter transport vehicle number");
      return;
    }

    try {
      await updateDoc(doc(db, 'stock_transfers', dispatchModalTransfer.id), {
        status: 'IN_TRANSIT',
        dispatchDetails: {
          ...dispatchForm,
          dispatchedAt: new Date().toISOString(),
          dispatchedBy: user?.displayName || user?.email || 'Dispatch Officer'
        },
        updatedAt: Timestamp.now()
      });

      toast.success("Stock Dispatched with GST Delivery Challan & Transporter Info!");
      setDispatchModalTransfer(null);
    } catch (err) {
      toast.error("Dispatch failed: " + err.message);
    }
  };

  // 3. Open Inward Inspection Modal (Receive Stock)
  const handleOpenReceiveModal = (transfer) => {
    setReceiveModalTransfer(transfer);
    setReceiverNotes('');
    const items = (transfer.items || []).map(item => ({
      ...item,
      receivedGoodQty: item.quantity,
      shortageQty: 0,
      damagedQty: 0
    }));
    setReceivedItems(items);
  };

  // Submit Inward with Damage & Shortage Loss Reconciliation
  const handleConfirmInward = async () => {
    if (!receiveModalTransfer) return;

    let hasShortage = false;
    let totalTransitLossAmount = 0;

    const validatedItems = receivedItems.map(item => {
      const good = Number(item.receivedGoodQty) || 0;
      const short = Number(item.shortageQty) || 0;
      const dam = Number(item.damagedQty) || 0;

      if (short > 0 || dam > 0) {
        hasShortage = true;
        totalTransitLossAmount += (short + dam) * (Number(item.unitPrice) || 1000);
      }

      return {
        ...item,
        receivedGoodQty: good,
        shortageQty: short,
        damagedQty: dam
      };
    });

    try {
      const debitNoteNumber = hasShortage ? `KV-DBN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}` : null;

      await updateDoc(doc(db, 'stock_transfers', receiveModalTransfer.id), {
        status: 'COMPLETED',
        inwardInspection: {
          receivedItems: validatedItems,
          hasDiscrepancy: hasShortage,
          totalTransitLossAmount,
          debitNoteNumber,
          receiverNotes,
          receivedBy: user?.displayName || user?.email || 'Hub Inward Incharge',
          receivedAt: new Date().toISOString()
        },
        updatedAt: Timestamp.now()
      });

      if (hasShortage) {
        toast.success(`Inward completed with Shortage Claim ${debitNoteNumber}! Debit Note logged against Transporter.`, { duration: 6000 });
      } else {
        toast.success("All items safely received & added to destination hub inventory!");
      }

      setReceiveModalTransfer(null);
    } catch (err) {
      toast.error("Inward failed: " + err.message);
    }
  };

  const columns = [
    {
      header: 'Challan / Ref',
      render: (t) => (
        <div className="flex flex-col">
          <span className="font-mono font-black text-gray-900 text-xs">{t.challanNumber || `TRX-${t.id.slice(0,6).toUpperCase()}`}</span>
          <span className="text-[10px] text-gray-400">{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
        </div>
      )
    },
    {
      header: 'Inter-Hub Route',
      render: (t) => {
        const src = getWarehouse(t.sourceWarehouseId);
        const dst = getWarehouse(t.destinationWarehouseId);
        return (
          <div className="text-xs font-bold flex items-center gap-2">
            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{src.name}</span>
            <span className="text-gray-400">→</span>
            <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">{dst.name}</span>
          </div>
        );
      }
    },
    {
      header: 'Consignment / Value',
      render: (t) => (
        <div className="text-xs">
          <span className="font-black text-gray-900">₹{(t.totalValue || 0).toLocaleString('en-IN')}</span>
          <p className="text-[10px] text-gray-500 font-semibold">
            {(t.items || []).length} SKUs • {(t.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0)} Units
          </p>
        </div>
      )
    },
    {
      header: 'Transport / E-Way Bill',
      render: (t) => (
        t.dispatchDetails ? (
          <div className="flex flex-col text-[11px]">
            <span className="font-mono font-bold text-gray-800">{t.dispatchDetails.vehicleNumber}</span>
            {t.dispatchDetails.ewayBillNumber && (
              <span className="text-[9px] font-mono text-emerald-700 font-bold">EWB: {t.dispatchDetails.ewayBillNumber}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 font-medium italic">Pending Dispatch</span>
        )
      )
    },
    {
      header: 'Status & Inward Inspection',
      render: (t) => {
        const hasLoss = t.inwardInspection?.hasDiscrepancy;
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={t.status} />
            {hasLoss && (
              <span className="inline-flex items-center text-[9px] font-black bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200">
                <AlertTriangle size={10} className="mr-1 text-red-600" />
                Transit Loss ₹{t.inwardInspection.totalTransitLossAmount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      }
    },
    {
      header: 'Actions',
      render: (t) => (
        <div className="flex items-center gap-1.5">
          {/* Printable Delivery Challan */}
          <button
            onClick={() => setChallanTransfer(t)}
            className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 transition-all"
            title="View & Print GST Delivery Challan"
          >
            <Printer size={14} className="text-[#0B4D31]" />
          </button>

          {t.status === 'REQUESTED' && (
            <button 
              onClick={() => handleApprove(t)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 text-xs font-bold border border-blue-200"
            >
              <CheckCircle size={13} />
              Approve
            </button>
          )}

          {t.status === 'APPROVED' && (
            <button 
              onClick={() => handleOpenDispatchModal(t)}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 text-xs font-black border border-amber-200"
            >
              <Truck size={13} />
              Dispatch
            </button>
          )}

          {t.status === 'IN_TRANSIT' && (
            <button 
              onClick={() => handleOpenReceiveModal(t)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#0B4D31] text-white rounded-xl hover:bg-[#146c43] text-xs font-black shadow-sm"
            >
              <PackageCheck size={13} />
              Receive
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="Inter-Hub Stock Transfers & Transit Reconciliation"
          subtitle="Multi-hub transfer network with Bihar GST E-Way Bill generation, Vehicle tracking, and In-Transit Shortage Loss claims."
        />
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 bg-[#0B4D31] text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43] transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>+ New Transfer Request</span>
        </button>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
        <DataTable columns={columns} data={transfers} loading={loading} />
      </div>

      {/* MODAL 1: Create Transfer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                <Truck size={20} className="text-[#0B4D31]" />
                New Inter-Hub Stock Transfer Note
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Origin / Source Hub *</label>
                  <select
                    value={sourceWarehouseId}
                    onChange={(e) => setSourceWarehouseId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code || w.id})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Destination Regional Depot *</label>
                  <select
                    value={destinationWarehouseId}
                    onChange={(e) => setDestinationWarehouseId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code || w.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Reason for Rebalance</label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium outline-none"
                  placeholder="e.g. Sowing season surge at Katihar Depot"
                />
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-gray-700 uppercase">Transfer SKUs & Quantities</label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-[#0B4D31] hover:underline"
                  >
                    + Add Another Product
                  </button>
                </div>

                <div className="space-y-2">
                  {transferItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      <div className="col-span-6">
                        <select
                          value={item.skuId}
                          onChange={(e) => handleItemChange(idx, 'skuId', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none"
                          required
                        >
                          {productsList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-right outline-none"
                          placeholder="Qty"
                          required
                        />
                      </div>

                      <div className="col-span-2 text-right text-xs font-mono font-bold text-gray-700">
                        ₹{(item.quantity * item.unitPrice).toLocaleString('en-IN')}
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
                >
                  {isSubmitting ? 'Creating...' : 'Create Transfer & Delivery Challan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dispatch with Transporter & E-Way Bill */}
      {dispatchModalTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Truck size={18} className="text-[#0B4D31]" />
                Dispatch & Bihar E-Way Bill Entry
              </h3>
              <button onClick={() => setDispatchModalTransfer(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmDispatch} className="py-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Vehicle Number *</label>
                <input
                  type="text"
                  value={dispatchForm.vehicleNumber}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value.toUpperCase() })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase outline-none"
                  placeholder="e.g. BR-11-GA-4821"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Driver Name</label>
                  <input
                    type="text"
                    value={dispatchForm.driverName}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Driver Phone</label>
                  <input
                    type="tel"
                    value={dispatchForm.driverPhone}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, driverPhone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">
                  Bihar GST E-Way Bill Number {dispatchModalTransfer.totalValue >= 50000 && <span className="text-red-500 font-bold">(Mandatory &gt; ₹50k)</span>}
                </label>
                <input
                  type="text"
                  value={dispatchForm.ewayBillNumber}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, ewayBillNumber: e.target.value.trim() })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none"
                  placeholder="e.g. 241289410291"
                  required={dispatchModalTransfer.totalValue >= 50000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDispatchModalTransfer(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
                >
                  Confirm Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Inward Inspection & Shortage/Damage Claim */}
      {receiveModalTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <PackageCheck size={18} className="text-[#0B4D31]" />
                Inward Physical Inspection & Loss Reconciliation
              </h3>
              <button onClick={() => setReceiveModalTransfer(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <p className="text-xs text-gray-500 font-semibold">
                Inspect received physical units. If any units are missing or damaged in transit, enter below to generate a Transporter Debit Note.
              </p>

              <div className="space-y-3">
                {receivedItems.map((it, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-2">
                    <div className="flex justify-between items-center text-xs font-black text-gray-900">
                      <span>{it.productName}</span>
                      <span className="text-gray-500">Dispatched: {it.quantity} units</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-green-700 block">Good Received</label>
                        <input
                          type="number"
                          min="0"
                          max={it.quantity}
                          value={it.receivedGoodQty}
                          onChange={(e) => {
                            const updated = [...receivedItems];
                            updated[idx].receivedGoodQty = Number(e.target.value);
                            setReceivedItems(updated);
                          }}
                          className="w-full bg-white border border-green-300 rounded-lg p-1.5 text-xs font-bold text-center outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-orange-700 block">Damaged / Leaked</label>
                        <input
                          type="number"
                          min="0"
                          value={it.damagedQty}
                          onChange={(e) => {
                            const updated = [...receivedItems];
                            updated[idx].damagedQty = Number(e.target.value);
                            setReceivedItems(updated);
                          }}
                          className="w-full bg-white border border-orange-300 rounded-lg p-1.5 text-xs font-bold text-center outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-red-700 block">Shortage / Missing</label>
                        <input
                          type="number"
                          min="0"
                          value={it.shortageQty}
                          onChange={(e) => {
                            const updated = [...receivedItems];
                            updated[idx].shortageQty = Number(e.target.value);
                            setReceivedItems(updated);
                          }}
                          className="w-full bg-white border border-red-300 rounded-lg p-1.5 text-xs font-bold text-center outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Inward Incharge Inspection Remarks</label>
                <input
                  type="text"
                  value={receiverNotes}
                  onChange={(e) => setReceiverNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium outline-none"
                  placeholder="e.g. 2 bags found torn and leaked in rear truck bay"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setReceiveModalTransfer(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmInward}
                className="px-6 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#146c43]"
              >
                Complete Inward & Reconcile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Printable Bihar GST Delivery Challan */}
      {challanTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100 print:hidden">
              <span className="text-xs font-black text-gray-400 uppercase">GST Delivery Challan (Rule 55)</span>
              <button onClick={() => setChallanTransfer(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>

            <div ref={printableRef} className="py-4 space-y-6 text-gray-800">
              <div className="text-center border-b pb-4 border-dashed border-gray-300">
                <h1 className="font-black text-xl text-green-900 tracking-tight">KRISHI VISHAL PRIVATE LIMITED</h1>
                <p className="text-[11px] text-gray-500 font-semibold">FORM GST ITC-04 / DELIVERY CHALLAN (RULE 55)</p>
                <div className="mt-2 font-mono text-xs font-black bg-gray-100 px-3 py-1 rounded-full inline-block">
                  Challan No: {challanTransfer.challanNumber || `TRX-${challanTransfer.id.slice(0,8)}`}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Dispatching Hub</span>
                  <div className="font-bold text-gray-900">{getWarehouse(challanTransfer.sourceWarehouseId).name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">GSTIN: {getWarehouse(challanTransfer.sourceWarehouseId).gstin || '10AAACK9821M1Z5'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Destination Depot</span>
                  <div className="font-bold text-gray-900">{getWarehouse(challanTransfer.destinationWarehouseId).name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">GSTIN: {getWarehouse(challanTransfer.destinationWarehouseId).gstin || '10AAACK9821M1Z5'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Vehicle No / Transporter</span>
                  <div className="font-mono font-bold text-gray-900">{challanTransfer.dispatchDetails?.vehicleNumber || 'Pending'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Bihar E-Way Bill</span>
                  <div className="font-mono font-bold text-emerald-700">{challanTransfer.dispatchDetails?.ewayBillNumber || 'Exempt / &lt; ₹50k'}</div>
                </div>
              </div>

              <table className="w-full text-xs text-left border border-gray-200 rounded-xl overflow-hidden">
                <thead className="bg-gray-100 font-black text-gray-600 text-[10px] uppercase">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Item Description</th>
                    <th className="p-2.5">HSN Code</th>
                    <th className="p-2.5 text-right">Quantity</th>
                    <th className="p-2.5 text-right">Unit Value</th>
                    <th className="p-2.5 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-semibold">
                  {(challanTransfer.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-gray-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold">{it.productName}</td>
                      <td className="p-2.5 font-mono">{it.hsnCode || '3105'}</td>
                      <td className="p-2.5 text-right">{it.quantity}</td>
                      <td className="p-2.5 text-right font-mono">₹{Number(it.unitPrice || 1000).toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-mono font-bold">₹{(it.quantity * (it.unitPrice || 1000)).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-8 flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-200">
                <div className="text-center">
                  <div className="w-32 border-b border-gray-400 pb-1 mb-1 font-bold">Dispatch Incharge</div>
                  <span className="text-[10px]">KrishiVishal Origin Hub</span>
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-gray-400 pb-1 mb-1 font-bold">Driver / Transporter</div>
                  <span className="text-[10px]">Received in Good Condition</span>
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-gray-400 pb-1 mb-1 font-bold">Receiver Incharge</div>
                  <span className="text-[10px]">Destination Depot</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 print:hidden">
              <button
                onClick={() => setChallanTransfer(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-primary text-white rounded-xl text-xs font-black flex items-center gap-1.5 hover:bg-primary-dark"
              >
                <Printer size={14} />
                Print Challan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterHubTransfers;

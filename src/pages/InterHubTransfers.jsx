import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { Plus, CheckCircle, Truck, PackageCheck, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const InterHubTransfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferItems, setTransferItems] = useState([
    { skuId: '', productName: '', batchId: 'BATCH-01', quantity: 10 }
  ]);

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

    // Fetch initial products for transfer dropdown
    const fetchProducts = async () => {
      try {
        const prodSnap = await getDocs(query(collection(db, 'products'), limit(150)));
        const prods = prodSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.id }));
        setProductsList(prods);
        if (prods.length > 0) {
          setTransferItems([
            { skuId: prods[0].id, productName: prods[0].name, batchId: 'BATCH-01', quantity: 10 }
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

  const getWarehouseName = (id) => warehouses.find(w => w.id === id)?.name || id;

  const handleAction = async (transferId, actionName) => {
    setProcessingId(transferId);
    try {
      const func = httpsCallable(functions, actionName);
      await func({ transferId });
      toast.success(`Transfer successfully updated!`);
    } catch (error) {
      toast.error(error.message || 'Action failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddItem = () => {
    const defaultProd = productsList[0] || { id: '', name: '' };
    setTransferItems([
      ...transferItems,
      { skuId: defaultProd.id, productName: defaultProd.name, batchId: 'BATCH-01', quantity: 10 }
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
    for (const it of transferItems) {
      if (!it.skuId || Number(it.quantity) <= 0) {
        toast.error('All items must have a valid product and quantity > 0');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const func = httpsCallable(functions, 'createStockTransfer');
      await func({
        sourceWarehouseId,
        destinationWarehouseId,
        items: transferItems.map(it => ({
          skuId: it.skuId,
          productName: it.productName || it.skuId,
          batchId: it.batchId || 'DEFAULT',
          quantity: Number(it.quantity)
        })),
        reason: transferReason || 'Standard Inter-hub Rebalance'
      });
      toast.success('Transfer request created successfully!');
      setIsModalOpen(false);
      setTransferReason('');
    } catch (err) {
      console.error('Failed to create transfer:', err);
      toast.error(err.message || 'Failed to create transfer request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Transfer ID',
      render: (t) => <span className="font-mono font-bold text-xs">TRX-{t.id.slice(0,6).toUpperCase()}</span>
    },
    {
      header: 'Route',
      render: (t) => (
        <div className="text-xs font-bold text-gray-800 flex items-center gap-2">
          <span className="text-blue-600">{getWarehouseName(t.sourceWarehouseId)}</span>
          <span className="text-gray-400">→</span>
          <span className="text-green-600">{getWarehouseName(t.destinationWarehouseId)}</span>
        </div>
      )
    },
    {
      header: 'Items',
      render: (t) => (
        <div className="text-xs">
          <span className="font-bold text-gray-700">{(t.items || []).length} items</span>
          <p className="text-[10px] text-gray-500">
            {(t.items || []).map(i => `${i.productName || i.skuId} (${i.quantity})`).join(', ').slice(0, 35)}...
          </p>
        </div>
      )
    },
    {
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />
    },
    {
      header: 'Date',
      render: (t) => <span className="text-xs text-gray-500">{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
    },
    {
      header: 'Actions',
      render: (t) => (
        <div className="flex gap-2">
          {t.status === 'REQUESTED' && (
            <button 
              onClick={() => handleAction(t.id, 'approveStockTransfer')}
              disabled={processingId === t.id}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-xs font-bold"
              title="Approve Transfer"
            >
              <CheckCircle size={14} />
              <span>Approve</span>
            </button>
          )}
          {t.status === 'APPROVED' && (
            <button 
              onClick={() => handleAction(t.id, 'dispatchStockTransfer')}
              disabled={processingId === t.id}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 text-xs font-bold"
              title="Dispatch Stock"
            >
              <Truck size={14} />
              <span>Dispatch</span>
            </button>
          )}
          {t.status === 'IN_TRANSIT' && (
            <button 
              onClick={() => handleAction(t.id, 'receiveStockTransfer')}
              disabled={processingId === t.id}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-xs font-bold"
              title="Receive Stock"
            >
              <PackageCheck size={14} />
              <span>Receive</span>
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Inter-Hub Transfers"
        subtitle="Manage and track stock transfers across warehouses."
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm hover:bg-[#2e7d32] transition-all"
          >
            <Plus size={16} />
            <span>New Request</span>
          </button>
        }
      />
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <DataTable columns={columns} data={transfers} loading={loading} />
      </div>

      {/* CREATE NEW TRANSFER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900">Request Inter-Hub Stock Transfer</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="p-6 space-y-4">
              {/* Route: Source & Destination */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Source Hub (From)</label>
                  <select
                    value={sourceWarehouseId}
                    onChange={(e) => setSourceWarehouseId(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-green-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code || w.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Destination Hub (To)</label>
                  <select
                    value={destinationWarehouseId}
                    onChange={(e) => setDestinationWarehouseId(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-green-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code || w.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Products & Quantities to Transfer</label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Product
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {transferItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <select
                          value={item.skuId}
                          onChange={(e) => handleItemChange(idx, 'skuId', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-800 outline-none"
                        >
                          {productsList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <input
                          type="text"
                          placeholder="Batch"
                          value={item.batchId}
                          onChange={(e) => handleItemChange(idx, 'batchId', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Transfer Reason / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly buffer restock for Katihar region"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#1b5e20] hover:bg-[#2e7d32] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Create Transfer Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterHubTransfers;

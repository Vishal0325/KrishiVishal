import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  increment,
  Timestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
import {
  Truck,
  Plus,
  Search,
  FileText,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  Upload,
  ExternalLink,
  PackageCheck,
  AlertCircle,
  X,
  Loader2,
  Receipt,
  Layers,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

const GoodsReceipt = () => {
  const { user } = useAuth();
  const [grnList, setGrnList] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [receiptItems, setReceiptItems] = useState([]);
  const [warehouseLocation, setWarehouseLocation] = useState('WH_PURNEA_CENTRAL_A1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Listen to Goods Receipts
  useEffect(() => {
    const q = query(collection(db, 'goods_receipts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setGrnList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('GRN load error:', err);
      toast.error('Failed to load Goods Receipts');
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Active Purchase Orders
  useEffect(() => {
    const q = query(collection(db, 'purchase_orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // When PO is selected, populate receipt items
  const handleSelectPO = (poId) => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) {
      setSelectedPO(null);
      setReceiptItems([]);
      return;
    }
    setSelectedPO(po);

    const items = (po.items || []).map(item => {
      const alreadyReceived = item.receivedQuantity || 0;
      const remaining = Math.max(0, (item.quantity || 0) - alreadyReceived);
      return {
        productId: item.productId,
        productName: item.productName || 'Product',
        orderedQuantity: item.quantity || 0,
        alreadyReceived,
        receivedQuantity: remaining,
        actualUnitCost: item.estimatedCostPrice || 0,
        batchNumber: `BAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        mfgDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        rackBin: 'RACK_A1_BIN_01',
        queueItemId: item.queueItemId || null,
        orderId: item.orderId || null
      };
    });
    setReceiptItems(items);
  };

  // Upload Invoice file
  const handleFileUpload = async (file) => {
    if (!file) return null;
    setUploadingFile(true);
    try {
      const storageRef = ref(storage, `invoices/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (err) {
      console.error('Invoice upload failed:', err);
      toast.error('Failed to upload invoice document: ' + err.message);
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  // Submit Goods Receipt
  const handleSubmitGRN = async (e) => {
    e.preventDefault();
    if (!selectedPO) {
      toast.error('Please select a valid Purchase Order');
      return;
    }

    const itemsWithQty = receiptItems.filter(i => Number(i.receivedQuantity) > 0);
    if (itemsWithQty.length === 0) {
      toast.error('Please enter received quantity for at least one item');
      return;
    }

    setSubmitting(true);
    try {
      let invoiceUrl = null;
      if (invoiceFile) {
        invoiceUrl = await handleFileUpload(invoiceFile);
      }

      const grnRef = doc(collection(db, 'goods_receipts'));
      const grnNumber = `GRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${grnRef.id.slice(0, 5).toUpperCase()}`;

      let totalGRNAmount = 0;
      let totalReceivedUnits = 0;

      const processedItems = itemsWithQty.map(item => {
        const qty = Number(item.receivedQuantity);
        const unitCost = Number(item.actualUnitCost) || 0;
        const lineTotal = qty * unitCost;
        totalGRNAmount += lineTotal;
        totalReceivedUnits += qty;

        return {
          ...item,
          receivedQuantity: qty,
          actualUnitCost: unitCost,
          lineTotal
        };
      });

      const grnData = {
        id: grnRef.id,
        grnNumber,
        poId: selectedPO.id,
        poNumber: selectedPO.poNumber,
        supplierId: selectedPO.supplierId,
        supplierName: selectedPO.supplierName,
        supplierGstin: selectedPO.supplierGstin || '',
        invoiceNumber,
        invoiceDate,
        invoiceUrl,
        warehouseLocation,
        notes,
        items: processedItems,
        totalReceivedUnits,
        totalGRNAmount,
        recordedBy: user?.uid || 'ADMIN',
        recordedByEmail: user?.email || 'admin@krishivishal.com',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // 1. Save GRN Document
      await setDoc(grnRef, grnData);

      // 2. Update Product Stocks and Record Immutable Inventory Movement
      for (const item of processedItems) {
        const productRef = doc(db, 'products', item.productId);
        
        // Update product stock balance and cost basis
        await updateDoc(productRef, {
          stockQuantity: increment(item.receivedQuantity),
          stock: increment(item.receivedQuantity),
          costPrice: item.actualUnitCost,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          mfgDate: item.mfgDate,
          updatedAt: Timestamp.now()
        });

        // Add Immutable Movement Ledger
        const movementRef = doc(collection(db, 'inventory_movements'));
        await setDoc(movementRef, {
          movementId: movementRef.id,
          productId: item.productId,
          productName: item.productName,
          type: 'PURCHASE_RECEIPT',
          quantity: item.receivedQuantity,
          costBasisPerUnit: item.actualUnitCost,
          totalCost: item.lineTotal,
          referenceId: grnNumber,
          poId: selectedPO.id,
          poNumber: selectedPO.poNumber,
          supplierId: selectedPO.supplierId,
          supplierName: selectedPO.supplierName,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          warehouseId: warehouseLocation,
          rackBin: item.rackBin,
          recordedBy: user?.uid || 'ADMIN',
          recordedByEmail: user?.email || 'admin@krishivishal.com',
          timestamp: Timestamp.now()
        });

        // If this item was tied to an on-demand procurement item, update queue
        if (item.queueItemId) {
          try {
            await updateDoc(doc(db, 'procurement_queue', item.queueItemId), {
              status: 'RECEIVED',
              grnId: grnRef.id,
              grnNumber,
              receivedAt: Timestamp.now(),
              updatedAt: Timestamp.now()
            });
          } catch (e) {
            console.warn('Queue item update silent error:', e);
          }
        }
      }

      // 3. Update Purchase Order Items & Status
      const updatedPOItems = (selectedPO.items || []).map(poItem => {
        const receivedEntry = processedItems.find(p => p.productId === poItem.productId);
        const newReceivedTotal = (poItem.receivedQuantity || 0) + (receivedEntry ? receivedEntry.receivedQuantity : 0);
        return {
          ...poItem,
          receivedQuantity: newReceivedTotal
        };
      });

      const allItemsFullyReceived = updatedPOItems.every(item => (item.receivedQuantity || 0) >= (item.quantity || 0));
      const newPOStatus = allItemsFullyReceived ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

      await updateDoc(doc(db, 'purchase_orders', selectedPO.id), {
        items: updatedPOItems,
        status: newPOStatus,
        statusHistory: [
          ...(selectedPO.statusHistory || []),
          {
            status: newPOStatus,
            timestamp: new Date().toISOString(),
            note: `Goods receipt recorded: ${grnNumber} (${totalReceivedUnits} units received)`
          }
        ],
        updatedAt: Timestamp.now()
      });

      // 4. Audit Log
      await addAuditLog('CREATE_GRN', 'GoodsReceipt', grnRef.id, {
        grnNumber,
        poNumber: selectedPO.poNumber,
        supplierName: selectedPO.supplierName,
        totalUnits: totalReceivedUnits,
        totalAmount: totalGRNAmount
      });

      toast.success(`GRN ${grnNumber} generated! Stock updated.`);
      setIsCreateModalOpen(false);
      setSelectedPO(null);
      setInvoiceFile(null);
      setInvoiceNumber('');
      setReceiptItems([]);
    } catch (error) {
      console.error('GRN Submission failed:', error);
      toast.error('Failed to create GRN: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Table Columns
  const columns = [
    {
      header: 'GRN Number',
      key: 'grnNumber',
      render: (grn) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{grn.grnNumber}</span>
          <p className="text-[10px] text-gray-400 font-medium">
            PO: <span className="font-bold text-gray-600">{grn.poNumber || '—'}</span>
          </p>
        </div>
      )
    },
    {
      header: 'Supplier',
      key: 'supplierName',
      render: (grn) => (
        <div>
          <p className="font-bold text-sm text-gray-900">{grn.supplierName}</p>
          {grn.supplierGstin && (
            <p className="text-[10px] font-mono text-gray-400">GST: {grn.supplierGstin}</p>
          )}
        </div>
      )
    },
    {
      header: 'Supplier Invoice',
      key: 'invoiceNumber',
      render: (grn) => (
        <div>
          <p className="font-bold text-xs text-gray-800">{grn.invoiceNumber || 'N/A'}</p>
          <p className="text-[10px] text-gray-400">{grn.invoiceDate || '—'}</p>
          {grn.invoiceUrl && (
            <a
              href={grn.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-black text-[#1b5e20] hover:underline mt-0.5"
            >
              <Receipt size={11} /> View Invoice
            </a>
          )}
        </div>
      )
    },
    {
      header: 'Received Units',
      key: 'totalReceivedUnits',
      render: (grn) => (
        <div>
          <span className="font-black text-sm text-gray-900">{grn.totalReceivedUnits} units</span>
          <p className="text-[10px] text-gray-400">{grn.items?.length || 0} products</p>
        </div>
      )
    },
    {
      header: 'Total Value',
      key: 'totalGRNAmount',
      render: (grn) => (
        <span className="font-black text-sm text-[#1b5e20] font-mono">
          {formatCurrency(grn.totalGRNAmount || 0)}
        </span>
      )
    },
    {
      header: 'Warehouse Bin',
      key: 'warehouseLocation',
      render: (grn) => (
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
          <MapPin size={12} className="text-gray-400" />
          {grn.warehouseLocation || 'Main Hub'}
        </span>
      )
    },
    {
      header: 'Date Recorded',
      key: 'createdAt',
      render: (grn) => (
        <span className="text-xs text-gray-500">
          {grn.createdAt?.toDate ? grn.createdAt.toDate().toLocaleDateString('en-IN') : '—'}
        </span>
      )
    }
  ];

  const filteredGRNs = grnList.filter(grn => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      grn.grnNumber?.toLowerCase().includes(term) ||
      grn.poNumber?.toLowerCase().includes(term) ||
      grn.supplierName?.toLowerCase().includes(term) ||
      grn.invoiceNumber?.toLowerCase().includes(term)
    );
  });

  const activePOs = purchaseOrders.filter(p => ['ISSUED_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(p.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <PackageCheck className="mr-3 text-[#1b5e20]" size={28} />
            Goods Received Note (GRN)
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Receive incoming vendor stock, record supplier GST invoices, and update inventory balances.
          </p>
        </div>

        <button
          onClick={() => {
            setIsCreateModalOpen(true);
            if (activePOs.length > 0) {
              handleSelectPO(activePOs[0].id);
            }
          }}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Create Goods Receipt (GRN)
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total GRNs Created</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{grnList.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Stock Received</p>
          <p className="text-3xl font-black text-[#1b5e20] mt-1">
            {grnList.reduce((acc, g) => acc + (g.totalReceivedUnits || 0), 0)} <span className="text-xs text-gray-400">units</span>
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Material Value</p>
          <p className="text-3xl font-black text-gray-900 mt-1">
            {formatCurrency(grnList.reduce((acc, g) => acc + (g.totalGRNAmount || 0), 0))}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending PO Deliveries</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{activePOs.length}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by GRN number, PO number, supplier, or invoice number..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
        />
      </div>

      {/* DataTable */}
      <DataTable columns={columns} data={filteredGRNs} loading={loading} />

      {/* CREATE GRN MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/60 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <PackageCheck size={22} className="text-[#1b5e20]" />
                  Create Goods Received Note (GRN)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Receive supplier inventory, attach invoice, and update warehouse stock balances.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitGRN} className="p-6 space-y-6">
              
              {/* Step 1: Select Purchase Order */}
              <div className="p-5 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-3">
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest flex items-center gap-1.5">
                  <FileText size={13} /> 1. Select Purchase Order
                </p>
                {activePOs.length === 0 ? (
                  <div className="p-4 bg-amber-50 rounded-xl text-amber-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} />
                    No active POs found. Please create and issue a Purchase Order first.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Purchase Order *</label>
                      <select
                        value={selectedPO?.id || ''}
                        onChange={(e) => handleSelectPO(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                      >
                        {activePOs.map(po => (
                          <option key={po.id} value={po.id}>
                            {po.poNumber} — {po.supplierName} ({po.items?.length || 0} items)
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedPO && (
                      <div className="p-3 bg-white rounded-xl border border-gray-100 text-xs">
                        <p className="font-bold text-gray-800">Supplier: {selectedPO.supplierName}</p>
                        <p className="text-gray-500 font-mono mt-0.5">GSTIN: {selectedPO.supplierGstin || 'Unregistered'}</p>
                        <p className="text-gray-500 mt-0.5">Expected: {selectedPO.expectedDeliveryDate || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Supplier Invoice Details */}
              <div className="p-5 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-4">
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest flex items-center gap-1.5">
                  <Receipt size={13} /> 2. Supplier GST Invoice & Documentation
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Invoice Number *</label>
                    <input
                      type="text"
                      required
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. INV-2026-987"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Invoice Date *</label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Attach Bill / PDF</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setInvoiceFile(e.target.files[0])}
                      className="w-full text-xs text-gray-500 file:mr-2 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-green-50 file:text-[#1b5e20] hover:file:bg-green-100 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Warehouse Hub / Location</label>
                    <input
                      type="text"
                      value={warehouseLocation}
                      onChange={(e) => setWarehouseLocation(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Receipt Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Physical seal intact, quality verified"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-sm text-gray-900 outline-none focus:border-[#1b5e20]"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Line Item Receipt Verification */}
              {receiptItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest flex items-center gap-1.5">
                      <Layers size={13} /> 3. Received Line Items & Batch Details
                    </p>
                    <span className="text-xs text-gray-500 font-bold">{receiptItems.length} Products</span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                        <tr>
                          <th className="py-3 px-3">Product Name</th>
                          <th className="py-3 px-3 text-center">Ordered</th>
                          <th className="py-3 px-3">Recv Qty *</th>
                          <th className="py-3 px-3">Actual Cost (₹) *</th>
                          <th className="py-3 px-3">Batch Number</th>
                          <th className="py-3 px-3">Expiry Date</th>
                          <th className="py-3 px-3">Rack/Bin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-gray-900">
                        {receiptItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-3 px-3 font-black">
                              {item.productName}
                              {item.alreadyReceived > 0 && (
                                <p className="text-[10px] text-amber-600 font-normal">
                                  Already received: {item.alreadyReceived}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center text-gray-500">
                              {item.orderedQuantity}
                            </td>
                            <td className="py-3 px-3 w-28">
                              <input
                                type="number"
                                required
                                min="0"
                                max={item.orderedQuantity}
                                value={item.receivedQuantity}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].receivedQuantity = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm font-black text-gray-900 text-center outline-none focus:border-[#1b5e20]"
                              />
                            </td>
                            <td className="py-3 px-3 w-32">
                              <input
                                type="number"
                                required
                                step="0.01"
                                value={item.actualUnitCost}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].actualUnitCost = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 text-right outline-none focus:border-[#1b5e20]"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={item.batchNumber}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-gray-900 outline-none focus:border-[#1b5e20]"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="date"
                                value={item.expiryDate}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].expiryDate = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 outline-none focus:border-[#1b5e20]"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={item.rackBin}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].rackBin = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-24 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-mono text-gray-700 outline-none focus:border-[#1b5e20]"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || !selectedPO || receiptItems.length === 0}
                className={`w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                  submitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {submitting && <Loader2 size={18} className="animate-spin" />}
                Confirm Receipt & Update Inventory Balance
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoodsReceipt;

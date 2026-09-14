import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  where,
  writeBatch
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import { addAuditLog } from '../services/logger';
import { formatCurrency } from '../utils/formatters';
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  CheckSquare,
  Square,
  Building2,
  Calendar,
  Clock,
  ArrowRight,
  Package,
  FileText,
  CheckCircle2,
  AlertCircle,
  Truck,
  Eye,
  Loader2,
  X,
  Trash2,
  ShoppingBag,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

const ProcurementQueue = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'queue'
  const [queueItems, setQueueItems] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isDirectPOModalOpen, setIsDirectPOModalOpen] = useState(false);
  const [selectedSupplierForPO, setSelectedSupplierForPO] = useState(null);
  const [poFormData, setPOFormData] = useState({
    expectedDeliveryDate: '',
    notes: '',
    deliveryAddress: 'KrishiVishal Central Hub, Agro Market Road, Purnea, Bihar - 854301'
  });
  const [directPOForm, setDirectPOForm] = useState({
    supplierId: '',
    warehouseId: '',
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    items: [
      {
        productId: '',
        productName: '',
        skuCode: '',
        quantity: 10,
        unitCost: 0,
        unit: 'Pcs'
      }
    ]
  });
  const [creatingPO, setCreatingPO] = useState(false);

  // Listen to suppliers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to warehouses
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      setWarehouses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to procurement queue
  useEffect(() => {
    const q = query(collection(db, 'procurement_queue'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setQueueItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingQueue(false);
    }, (err) => {
      console.error('Queue error:', err);
      toast.error('Failed to load procurement queue');
      setLoadingQueue(false);
    });
    return unsub;
  }, []);

  // Listen to purchase orders
  useEffect(() => {
    const q = query(collection(db, 'purchase_orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setPurchaseOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingPOs(false);
    }, (err) => {
      console.error('PO error:', err);
      toast.error('Failed to load purchase orders');
      setLoadingPOs(false);
    });
    return unsub;
  }, []);

  // Map supplier ID to name
  const getSupplierName = (supplierId) => {
    if (!supplierId) return 'Unassigned Supplier';
    const s = suppliers.find(sup => sup.id === supplierId);
    return s ? s.name : 'Unknown Supplier';
  };

  const getSupplier = (supplierId) => {
    return suppliers.find(sup => sup.id === supplierId);
  };

  // Selection toggle
  const toggleSelect = (id, supplierId) => {
    setSelectedItemIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectAllForSupplier = (supplierId, items) => {
    const supplierItemIds = items.filter(i => i.supplierId === supplierId && i.status === 'PROCUREMENT_PENDING').map(i => i.id);
    setSelectedItemIds(prev => {
      const allSelected = supplierItemIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !supplierItemIds.includes(id));
      } else {
        return Array.from(new Set([...prev, ...supplierItemIds]));
      }
    });
  };

  // Open Direct PO Modal
  const handleOpenDirectPOModal = () => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    
    const defaultWarehouse = warehouses[0] || null;
    const defaultSupplier = suppliers[0] || null;

    setDirectPOForm({
      supplierId: defaultSupplier ? defaultSupplier.id : '',
      warehouseId: defaultWarehouse ? defaultWarehouse.id : 'WH_PURNEA_CENTRAL',
      expectedDeliveryDate: defaultDate.toISOString().split('T')[0],
      deliveryAddress: defaultWarehouse 
        ? `${defaultWarehouse.name || 'Central Hub'}, ${defaultWarehouse.city || 'Purnea'}, ${defaultWarehouse.district || 'Bihar'}` 
        : 'KrishiVishal Central Hub, Agro Market Road, Purnea, Bihar - 854301',
      notes: '',
      items: [
        {
          productId: products[0]?.id || '',
          productName: products[0]?.name || '',
          skuCode: products[0]?.sku || products[0]?.id || '',
          quantity: 10,
          unitCost: Number(products[0]?.costPrice || products[0]?.purchasePrice || products[0]?.mrp || 0),
          unit: products[0]?.unit || 'Pcs'
        }
      ]
    });
    setIsDirectPOModalOpen(true);
  };

  // Add Item in Direct PO Form
  const handleAddDirectItem = () => {
    setDirectPOForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: '',
          productName: '',
          skuCode: '',
          quantity: 1,
          unitCost: 0,
          unit: 'Pcs'
        }
      ]
    }));
  };

  // Remove Item in Direct PO Form
  const handleRemoveDirectItem = (index) => {
    if (directPOForm.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    setDirectPOForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Change Item Product in Direct PO Form
  const handleItemProductChange = (index, prodId) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    setDirectPOForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        productName: prod.name,
        skuCode: prod.sku || prod.id,
        unitCost: Number(prod.costPrice || prod.purchasePrice || prod.mrp || 0),
        unit: prod.unit || 'Pcs'
      };
      return { ...prev, items: updated };
    });
  };

  // Change Item Field in Direct PO Form
  const handleItemFieldChange = (index, field, value) => {
    setDirectPOForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return { ...prev, items: updated };
    });
  };

  // Submit Direct PO Creation
  const handleCreateDirectPO = async (e) => {
    e.preventDefault();
    if (!directPOForm.supplierId) {
      toast.error('Please select a Supplier');
      return;
    }

    const validItems = directPOForm.items.filter(i => i.productId && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one product with quantity > 0');
      return;
    }

    setCreatingPO(true);
    try {
      const targetSupplier = getSupplier(directPOForm.supplierId);
      const targetWarehouse = warehouses.find(w => w.id === directPOForm.warehouseId);

      const poRef = doc(collection(db, 'purchase_orders'));
      const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${poRef.id.slice(0, 5).toUpperCase()}`;

      let totalEstimatedAmount = 0;
      let totalUnitsCount = 0;

      const poItems = validItems.map(item => {
        const costPrice = Number(item.unitCost) || 0;
        const qty = Number(item.quantity) || 1;
        const lineTotal = costPrice * qty;
        totalEstimatedAmount += lineTotal;
        totalUnitsCount += qty;

        return {
          productId: item.productId,
          productName: item.productName || 'Product',
          skuCode: item.skuCode || item.productId,
          unit: item.unit || 'Pcs',
          quantity: qty,
          estimatedCostPrice: costPrice,
          totalPrice: lineTotal,
          receivedQuantity: 0,
          status: 'PENDING'
        };
      });

      const poData = {
        id: poRef.id,
        poNumber,
        supplierId: directPOForm.supplierId,
        supplierName: targetSupplier ? targetSupplier.name : 'Unknown Supplier',
        supplierPhone: targetSupplier ? (targetSupplier.phone || '') : '',
        supplierGstin: targetSupplier ? (targetSupplier.gstin || '') : '',
        warehouseId: directPOForm.warehouseId || '',
        warehouseName: targetWarehouse ? targetWarehouse.name : 'Central Hub',
        items: poItems,
        totalItemsCount: totalUnitsCount,
        totalEstimatedAmount,
        expectedDeliveryDate: directPOForm.expectedDeliveryDate,
        deliveryAddress: directPOForm.deliveryAddress,
        notes: directPOForm.notes,
        status: 'ISSUED_TO_SUPPLIER',
        statusHistory: [
          {
            status: 'ISSUED_TO_SUPPLIER',
            timestamp: new Date().toISOString(),
            note: 'Direct Purchase Order created and issued to supplier'
          }
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(poRef, poData);

      await addAuditLog('CREATE_PURCHASE_ORDER', 'PurchaseOrder', poRef.id, {
        poNumber,
        supplierName: poData.supplierName,
        totalAmount: totalEstimatedAmount,
        totalUnits: totalUnitsCount
      });

      toast.success(`PO ${poNumber} created successfully!`);
      setIsDirectPOModalOpen(false);
      setActiveTab('pos');
    } catch (error) {
      console.error('Direct PO Creation failed:', error);
      toast.error('Failed to create Purchase Order: ' + error.message);
    } finally {
      setCreatingPO(false);
    }
  };

  // Open PO Creation Modal
  const handleOpenPOModal = (supplierId) => {
    const targetSupplier = getSupplier(supplierId);
    setSelectedSupplierForPO(targetSupplier || { id: supplierId, name: 'Unassigned Supplier' });
    
    // Set default expected delivery date based on lead time
    const leadTime = targetSupplier?.leadTimeDays || 2;
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + leadTime);
    
    setPOFormData({
      expectedDeliveryDate: defaultDate.toISOString().split('T')[0],
      notes: '',
      deliveryAddress: 'KrishiVishal Central Hub, Agro Market Road, Purnea, Bihar - 854301'
    });
    setIsPOModalOpen(true);
  };

  // Create Purchase Order Submit
  const handleCreatePO = async (e) => {
    e.preventDefault();
    if (!selectedSupplierForPO) return;

    const itemsToInclude = queueItems.filter(
      item => selectedItemIds.includes(item.id) && item.supplierId === selectedSupplierForPO.id
    );

    if (itemsToInclude.length === 0) {
      toast.error('No items selected for this supplier');
      return;
    }

    setCreatingPO(true);
    try {
      const poRef = doc(collection(db, 'purchase_orders'));
      const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${poRef.id.slice(0, 5).toUpperCase()}`;

      let totalEstimatedAmount = 0;
      const poItems = itemsToInclude.map(item => {
        const costPrice = Number(item.estimatedCostPrice) || 0;
        const lineTotal = costPrice * (item.quantity || 1);
        totalEstimatedAmount += lineTotal;
        return {
          queueItemId: item.id,
          orderId: item.orderId || null,
          productId: item.productId,
          productName: item.productName || 'Product',
          quantity: item.quantity || 1,
          estimatedCostPrice: costPrice,
          totalPrice: lineTotal,
          receivedQuantity: 0,
          status: 'PENDING'
        };
      });

      const poData = {
        id: poRef.id,
        poNumber,
        supplierId: selectedSupplierForPO.id,
        supplierName: selectedSupplierForPO.name || getSupplierName(selectedSupplierForPO.id),
        supplierPhone: selectedSupplierForPO.phone || '',
        supplierGstin: selectedSupplierForPO.gstin || '',
        items: poItems,
        totalItemsCount: poItems.reduce((acc, cur) => acc + cur.quantity, 0),
        totalEstimatedAmount,
        expectedDeliveryDate: poFormData.expectedDeliveryDate,
        deliveryAddress: poFormData.deliveryAddress,
        notes: poFormData.notes,
        status: 'ISSUED_TO_SUPPLIER', // DRAFT -> ISSUED_TO_SUPPLIER -> CONFIRMED -> PARTIALLY_RECEIVED -> COMPLETED
        statusHistory: [
          {
            status: 'ISSUED_TO_SUPPLIER',
            timestamp: new Date().toISOString(),
            note: 'Purchase Order generated and issued to supplier'
          }
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // [FIXED] Point #91: Use atomic writeBatch for PO creation and queue updates to prevent partial data state
      const batch = writeBatch(db);

      batch.set(poRef, poData);

      // Update all included queue items
      for (const item of itemsToInclude) {
        batch.update(doc(db, 'procurement_queue', item.id), {
          status: 'PO_CREATED',
          poId: poRef.id,
          poNumber: poNumber,
          poCreatedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }

      await batch.commit();

      await addAuditLog('CREATE_PURCHASE_ORDER', 'PurchaseOrder', poRef.id, {
        poNumber,
        supplierName: poData.supplierName,
        totalAmount: totalEstimatedAmount
      });

      toast.success(`PO ${poNumber} created successfully!`);
      // Clear selected items for this supplier
      setSelectedItemIds(prev => prev.filter(id => !itemsToInclude.map(i => i.id).includes(id)));
      setIsPOModalOpen(false);
      setActiveTab('pos');
    } catch (error) {
      console.error('PO Creation failed:', error);
      toast.error('Failed to create PO: ' + error.message);
    } finally {
      setCreatingPO(false);
    }
  };

  // Filter queue items
  const filteredQueue = queueItems.filter(item => {
    const matchSearch = !searchTerm ||
      item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getSupplierName(item.supplierId)?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSupplier = supplierFilter === 'ALL' || item.supplierId === supplierFilter;
    return matchSearch && matchSupplier;
  });

  // Group pending queue items by supplier
  const pendingQueue = filteredQueue.filter(i => i.status === 'PROCUREMENT_PENDING');
  const itemsBySupplier = pendingQueue.reduce((acc, item) => {
    const suppId = item.supplierId || 'unassigned';
    if (!acc[suppId]) acc[suppId] = [];
    acc[suppId].push(item);
    return acc;
  }, {});

  // PO Columns
  const poColumns = [
    {
      header: 'PO Number',
      key: 'poNumber',
      render: (po) => (
        <div>
          <span className="font-mono text-xs font-black text-gray-900">{po.poNumber}</span>
          <p className="text-[10px] text-gray-400 font-medium">
            {po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
      )
    },
    {
      header: 'Supplier',
      key: 'supplierName',
      render: (po) => (
        <div>
          <p className="font-bold text-sm text-gray-900">{po.supplierName}</p>
          {po.supplierPhone && <p className="text-[11px] text-gray-400">{po.supplierPhone}</p>}
        </div>
      )
    },
    {
      header: 'Items / Qty',
      key: 'items',
      render: (po) => (
        <span className="text-xs font-bold text-gray-700">
          {po.items?.length || 0} items ({po.totalItemsCount || 0} units)
        </span>
      )
    },
    {
      header: 'Est. Amount',
      key: 'totalEstimatedAmount',
      render: (po) => (
        <span className="font-black text-sm text-gray-900">
          {formatCurrency(po.totalEstimatedAmount || 0)}
        </span>
      )
    },
    {
      header: 'Expected Delivery',
      key: 'expectedDeliveryDate',
      render: (po) => (
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
          <Calendar size={12} className="text-gray-400" />
          {po.expectedDeliveryDate || 'Not specified'}
        </span>
      )
    },
    {
      header: 'Status',
      key: 'status',
      render: (po) => {
        const statusConfigs = {
          DRAFT: { bg: 'bg-gray-100 text-gray-700', label: 'Draft' },
          ISSUED_TO_SUPPLIER: { bg: 'bg-blue-100 text-blue-800', label: 'Issued' },
          CONFIRMED: { bg: 'bg-indigo-100 text-indigo-800', label: 'Confirmed' },
          PARTIALLY_RECEIVED: { bg: 'bg-yellow-100 text-yellow-800', label: 'Partial GRN' },
          COMPLETED: { bg: 'bg-green-100 text-green-800', label: 'Completed' },
          CANCELLED: { bg: 'bg-red-100 text-red-800', label: 'Cancelled' }
        };
        const conf = statusConfigs[po.status] || { bg: 'bg-gray-100 text-gray-600', label: po.status };
        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${conf.bg}`}>
            {conf.label}
          </span>
        );
      }
    },
    {
      header: 'Actions',
      render: (po) => (
        <button
          onClick={() => navigate(`/purchase-order/${po.id}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-[#1b5e20] hover:text-white text-gray-700 rounded-lg text-xs font-bold transition-all"
        >
          <Eye size={14} />
          View PO
        </button>
      )
    }
  ];

  // Calculate direct PO live totals
  const directTotalUnits = directPOForm.items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const directTotalAmount = directPOForm.items.reduce((acc, item) => acc + ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)), 0);

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Procurement & Purchase Orders ERP"
        subtitle="Manage supplier Purchase Orders (PO), aggregate backorders, and inward stock directly to warehouses."
        actions={[
          {
            label: 'Create Purchase Order (PO)',
            icon: Plus,
            onClick: handleOpenDirectPOModal,
            variant: 'primary'
          }
        ]}
      />

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'pos' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText size={14} />
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'queue' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package size={14} />
            Procurement Queue ({pendingQueue.length})
          </button>
        </div>

        <button
          onClick={handleOpenDirectPOModal}
          className="px-4 py-2.5 bg-[#1b5e20] text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-[#2e7d32] shadow-sm transition-all flex items-center gap-2"
        >
          <Plus size={16} />
          + New Purchase Order
        </button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Purchase Orders</p>
          <p className="text-3xl font-black text-blue-600 mt-1">
            {purchaseOrders.filter(p => ['ISSUED_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(p.status)).length}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed POs</p>
          <p className="text-3xl font-black text-green-700 mt-1">
            {purchaseOrders.filter(p => p.status === 'COMPLETED').length}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Available Suppliers</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending Backorders</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{pendingQueue.length}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === 'pos' ? 'Search by PO Number, Supplier name...' : 'Search by product name, order ID, or supplier...'}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-700 outline-none"
        >
          <option value="ALL">All Suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* TAB 1: PURCHASE ORDERS LIST */}
      {activeTab === 'pos' && (
        <div>
          {purchaseOrders.length === 0 && !loadingPOs ? (
            <div className="bg-white p-12 rounded-3xl text-center border border-gray-100 shadow-sm">
              <ShoppingBag className="text-gray-300 mx-auto mb-4" size={56} />
              <h3 className="text-lg font-black text-gray-900">No Purchase Orders Created Yet</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-6">
                Direct purchase order create karke aap kisi bhi supplier se seedha product kharid sakte hain aur warehouse me stock inward kar sakte hain.
              </p>
              <button
                onClick={handleOpenDirectPOModal}
                className="px-6 py-3 bg-[#1b5e20] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#2e7d32] transition-all shadow-lg shadow-green-100 inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Create First Purchase Order
              </button>
            </div>
          ) : (
            <DataTable
              columns={poColumns}
              data={purchaseOrders.filter(po => {
                const matchSearch = !searchTerm ||
                  po.poNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  po.supplierName?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchSupplier = supplierFilter === 'ALL' || po.supplierId === supplierFilter;
                return matchSearch && matchSupplier;
              })}
              loading={loadingPOs}
            />
          )}
        </div>
      )}

      {/* TAB 2: PROCUREMENT QUEUE (Grouped by Supplier) */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {loadingQueue ? (
            <div className="bg-white p-12 rounded-2xl text-center border border-gray-100">
              <Loader2 className="animate-spin text-[#1b5e20] mx-auto mb-3" size={32} />
              <p className="text-sm font-bold text-gray-500">Loading procurement queue...</p>
            </div>
          ) : Object.keys(itemsBySupplier).length === 0 ? (
            <div className="bg-white p-12 rounded-3xl text-center border border-gray-100 shadow-sm">
              <CheckCircle2 className="text-green-500 mx-auto mb-3" size={48} />
              <h3 className="text-lg font-black text-gray-900">Procurement Queue is Clean!</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-6">
                Koi pending customer order backorder nahi hai. Agar aap stock add karne ke liye direct maal kharidna chahte hain to "Create Purchase Order" par click karein.
              </p>
              <button
                onClick={handleOpenDirectPOModal}
                className="px-6 py-3 bg-[#1b5e20] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#2e7d32] transition-all shadow-md inline-flex items-center gap-2"
              >
                <Plus size={16} />
                + Create Direct Purchase Order
              </button>
            </div>
          ) : (
            Object.entries(itemsBySupplier).map(([supplierId, items]) => {
              const supplier = getSupplier(supplierId);
              const supplierSelectedCount = items.filter(i => selectedItemIds.includes(i.id)).length;
              const allSupplierSelected = supplierSelectedCount === items.length && items.length > 0;
              const totalEstCost = items.reduce((sum, item) => sum + ((item.estimatedCostPrice || 0) * (item.quantity || 1)), 0);

              return (
                <div key={supplierId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Supplier Section Header */}
                  <div className="p-5 bg-gray-50/80 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => selectAllForSupplier(supplierId, items)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors text-[#1b5e20]"
                      >
                        {allSupplierSelected ? <CheckSquare size={20} /> : <Square size={20} className="text-gray-400" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-base text-gray-900 flex items-center gap-1.5">
                            <Building2 size={16} className="text-[#1b5e20]" />
                            {supplier ? supplier.name : 'Unassigned Supplier'}
                          </h3>
                          {supplier?.leadTimeDays && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                              Lead: {supplier.leadTimeDays} days
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {items.length} item(s) pending • Est. Value: <span className="font-bold text-gray-800">{formatCurrency(totalEstCost)}</span>
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (supplierSelectedCount === 0) {
                            selectAllForSupplier(supplierId, items);
                          }
                          handleOpenPOModal(supplierId);
                        }}
                        className="px-5 py-2.5 bg-[#1b5e20] text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-[#2e7d32] shadow-md shadow-green-100 transition-all flex items-center gap-2 active:scale-95"
                      >
                        <FileText size={14} />
                        Generate PO ({supplierSelectedCount > 0 ? supplierSelectedCount : items.length})
                      </button>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="divide-y divide-gray-50">
                    {items.map(item => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const costPrice = Number(item.estimatedCostPrice) || 0;
                      const lineTotal = costPrice * (item.quantity || 1);

                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleSelect(item.id, supplierId)}
                          className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                            isSelected ? 'bg-green-50/50' : 'hover:bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(item.id, supplierId);
                              }}
                              className="text-[#1b5e20]"
                            >
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
                            </button>
                            <div>
                              <p className="font-black text-sm text-gray-900">{item.productName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-gray-400 font-mono">
                                  Order #{item.orderId?.slice(0, 8) || 'Manual'}
                                </span>
                                <span className="text-[10px] text-gray-300">•</span>
                                <span className="text-[11px] text-gray-400">
                                  {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('en-IN') : 'Recent'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 text-right">
                            <div>
                              <p className="text-xs font-bold text-gray-700">{item.quantity} units</p>
                              <p className="text-[11px] text-gray-400">@ {formatCurrency(costPrice)}/unit</p>
                            </div>
                            <div className="min-w-[90px]">
                              <p className="text-sm font-black text-gray-900">{formatCurrency(lineTotal)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* DIRECT PURCHASE ORDER CREATION MODAL */}
      {isDirectPOModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                  <FileText size={22} className="text-[#1b5e20]" />
                  Create Direct Purchase Order (PO)
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Vendor/Supplier ko purchase order bhejein aur products stock me inward karein.
                </p>
              </div>
              <button
                onClick={() => setIsDirectPOModalOpen(false)}
                className="p-2.5 hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleCreateDirectPO} className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Row 1: Supplier & Warehouse Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 size={13} className="text-[#1b5e20]" />
                    Select Supplier / Vendor *
                  </label>
                  <select
                    required
                    value={directPOForm.supplierId}
                    onChange={(e) => {
                      const supId = e.target.value;
                      const sup = getSupplier(supId);
                      const leadDays = sup?.leadTimeDays || 3;
                      const d = new Date();
                      d.setDate(d.getDate() + leadDays);
                      setDirectPOForm(prev => ({
                        ...prev,
                        supplierId: supId,
                        expectedDeliveryDate: d.toISOString().split('T')[0]
                      }));
                    }}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.phone ? `(${s.phone})` : ''} {s.city ? `• ${s.city}` : ''}
                      </option>
                    ))}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-[11px] text-amber-600 font-bold">
                      No suppliers registered yet. Please add a supplier in the Suppliers tab.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={13} className="text-[#1b5e20]" />
                    Destination Hub / Warehouse *
                  </label>
                  <select
                    required
                    value={directPOForm.warehouseId}
                    onChange={(e) => {
                      const whId = e.target.value;
                      const wh = warehouses.find(w => w.id === whId);
                      setDirectPOForm(prev => ({
                        ...prev,
                        warehouseId: whId,
                        deliveryAddress: wh ? `${wh.name || 'Central Hub'}, ${wh.city || ''}, ${wh.district || ''}` : prev.deliveryAddress
                      }));
                    }}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.city || w.district || 'Hub'})
                      </option>
                    ))}
                    {warehouses.length === 0 && (
                      <option value="WH_PURNEA_CENTRAL">KrishiVishal Central Hub (Purnea)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Row 2: Dates & Delivery Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={13} className="text-[#1b5e20]" />
                    Expected Delivery Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={directPOForm.expectedDeliveryDate}
                    onChange={(e) => setDirectPOForm({ ...directPOForm, expectedDeliveryDate: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                    Delivery Destination Address
                  </label>
                  <input
                    type="text"
                    value={directPOForm.deliveryAddress}
                    onChange={(e) => setDirectPOForm({ ...directPOForm, deliveryAddress: e.target.value })}
                    placeholder="e.g. Warehouse Hub Address..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                  />
                </div>
              </div>

              {/* Product Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <Package size={15} className="text-[#1b5e20]" />
                    Order Items & Quantities ({directPOForm.items.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddDirectItem}
                    className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-[#1b5e20] text-xs font-black rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Add Another Product
                  </button>
                </div>

                <div className="space-y-3 bg-gray-50/60 p-4 rounded-2xl border border-gray-100">
                  {directPOForm.items.map((item, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      
                      {/* Product select (5 cols) */}
                      <div className="sm:col-span-5 space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          Item #{idx + 1} Product *
                        </label>
                        <select
                          required
                          value={item.productId}
                          onChange={(e) => handleItemProductChange(idx, e.target.value)}
                          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:border-primary"
                        >
                          <option value="">-- Select Product --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.brand ? `(${p.brand})` : ''} - MRP: ₹{p.mrp || p.price || 0}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity (2 cols) */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          Qty ({item.unit || 'units'}) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-black text-gray-900 outline-none text-center"
                        />
                      </div>

                      {/* Purchase Unit Cost (2 cols) */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          Unit Cost (₹) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={item.unitCost}
                          onChange={(e) => handleItemFieldChange(idx, 'unitCost', e.target.value)}
                          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-black text-gray-900 outline-none text-right"
                        />
                      </div>

                      {/* Line Total (2 cols) */}
                      <div className="sm:col-span-2 space-y-1 text-right">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          Line Total
                        </label>
                        <p className="text-xs font-black text-[#1b5e20] py-2.5">
                          {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}
                        </p>
                      </div>

                      {/* Delete action (1 col) */}
                      <div className="sm:col-span-1 flex justify-center sm:justify-end pt-3 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveDirectItem(idx)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                  PO Notes / Terms / Instructions for Supplier
                </label>
                <textarea
                  rows={2}
                  value={directPOForm.notes}
                  onChange={(e) => setDirectPOForm({ ...directPOForm, notes: e.target.value })}
                  placeholder="e.g. Please deliver fresh stock with at least 18 months expiry date. Payment terms: 15 days."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium text-sm text-gray-900"
                />
              </div>

              {/* Summary Box */}
              <div className="bg-green-50 p-4 rounded-2xl border border-green-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-[#1b5e20] uppercase tracking-wider">
                    Total PO Units: <span className="font-bold text-gray-900">{directTotalUnits} Units</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Upon issuing, status will be set to <span className="font-bold text-blue-700">ISSUED_TO_SUPPLIER</span>.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-gray-500 uppercase">Estimated Total Amount</span>
                  <p className="text-2xl font-black text-[#1b5e20]">{formatCurrency(directTotalAmount)}</p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={creatingPO || directPOForm.items.length === 0}
                className="w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {creatingPO ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                Confirm & Issue Purchase Order (PO)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QUEUE PO CREATION MODAL */}
      {isPOModalOpen && selectedSupplierForPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <FileText size={20} className="text-[#1b5e20]" />
                  Generate Purchase Order
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Issuing to: <span className="font-bold text-gray-900">{selectedSupplierForPO.name}</span>
                </p>
              </div>
              <button
                onClick={() => setIsPOModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="p-6 space-y-5">
              {/* Selected items summary */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Selected Items Summary</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {queueItems
                    .filter(i => selectedItemIds.includes(i.id) && i.supplierId === selectedSupplierForPO.id)
                    .map(item => (
                      <div key={item.id} className="flex justify-between text-xs font-bold text-gray-700">
                        <span>{item.productName} (x{item.quantity})</span>
                        <span>{formatCurrency((item.estimatedCostPrice || 0) * (item.quantity || 1))}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Expected Delivery Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Expected Delivery Date *
                </label>
                <input
                  type="date"
                  required
                  value={poFormData.expectedDeliveryDate}
                  onChange={(e) => setPOFormData({ ...poFormData, expectedDeliveryDate: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                />
              </div>

              {/* Delivery Address */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Delivery Destination / Hub
                </label>
                <input
                  type="text"
                  value={poFormData.deliveryAddress}
                  onChange={(e) => setPOFormData({ ...poFormData, deliveryAddress: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  PO Notes / Instructions for Supplier
                </label>
                <textarea
                  rows={2}
                  value={poFormData.notes}
                  onChange={(e) => setPOFormData({ ...poFormData, notes: e.target.value })}
                  placeholder="e.g. Please deliver batch with minimum 12 months shelf life"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium text-sm text-gray-900"
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={creatingPO}
                className="w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {creatingPO && <Loader2 size={18} className="animate-spin" />}
                Confirm & Issue Purchase Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementQueue;

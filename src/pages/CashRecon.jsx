import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, where, orderBy, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { 
  Wallet, 
  Search, 
  CheckCircle, 
  Clock, 
  User, 
  Building2, 
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Truck,
  IndianRupee,
  Layers,
  ArrowRight,
  Filter,
  RefreshCw,
  Printer,
  ShieldCheck,
  PlusCircle,
  FileCheck2,
  Receipt,
  X,
  CreditCard,
  Building,
  Upload,
  Eye,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10];

const CashRecon = () => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState('DESK_SETTLEMENT'); // 'DESK_SETTLEMENT' | 'BANK_DEPOSITS' | 'VOUCHER_HISTORY'
  const [riders, setRiders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [bankDeposits, setBankDeposits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [depositFilter, setDepositFilter] = useState('ALL');
  const [processingId, setProcessingId] = useState(null);

  // Settlement & Denomination Modal
  const [settleModalRider, setSettleModalRider] = useState(null);
  const [denominations, setDenominations] = useState({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, coins: 0 });
  const [settleNotes, setSettleNotes] = useState('');

  // Bank Deposit Modal (Step 2)
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    warehouseId: '',
    bankName: 'HDFC Bank - Current A/C (..4920)',
    accountNumber: '50200067894920',
    amount: '',
    utrNumber: '',
    depositDate: new Date().toISOString().split('T')[0],
    slipUrl: '',
    remarks: ''
  });
  const [submittingBank, setSubmittingBank] = useState(false);

  // Printable Receipt Modal
  const [receiptData, setReceiptData] = useState(null);
  const printableRef = useRef(null);

  // 1. Fetch Warehouses
  useEffect(() => {
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      const whList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setWarehouses(whList);
      if (whList.length > 0 && !bankForm.warehouseId) {
        setBankForm(prev => ({ ...prev, warehouseId: whList[0].id }));
      }
    }, (err) => console.warn("Warehouses err:", err));
    return () => unsubWh();
  }, []);

  // 2. Fetch Summaries (Riders + Orders calculation)
  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const ridersSnap = await getDocs(collection(db, 'riders'));
      const ordersSnap = await getDocs(query(collection(db, 'orders'), where('riderId', '!=', '')));

      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const ridersData = ridersSnap.docs.map(riderDoc => {
        const riderId = riderDoc.id;
        const rider = riderDoc.data();
        
        const riderOrders = allOrders.filter(o => o.riderId === riderId);
        const deliveredOrders = riderOrders.filter(o => o.status === 'DELIVERED');
        const activeOrdersCount = riderOrders.filter(o => ['ASSIGNED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
        
        const codDeliveredOrders = deliveredOrders.filter(o => o.isCOD === true);
        const totalCollected = codDeliveredOrders.reduce((sum, o) => sum + (o.codAmount || o.totalAmount || 0), 0);
        
        const settledOrders = codDeliveredOrders.filter(o => o.verifiedByAdmin === true || o.isCashDeposited === true || o.isSettledByAdmin === true);
        const totalSettled = settledOrders.reduce((sum, o) => sum + (o.codAmount || o.totalAmount || 0), 0);
        
        const pendingOrders = codDeliveredOrders.filter(o => !o.verifiedByAdmin && !o.isCashDeposited && !o.isSettledByAdmin);
        const pendingCash = pendingOrders.reduce((sum, o) => sum + (o.codAmount || o.totalAmount || 0), 0);
        const pendingOrderIds = pendingOrders.map(o => o.id);

        return {
          id: riderId,
          name: rider.name || 'Unknown Rider',
          phone: rider.phone || '',
          warehouseId: rider.warehouseId || rider.assignedWarehouse || null,
          totalCashCollected: totalCollected,
          settledCash: totalSettled,
          pendingCash: pendingCash,
          pendingOrderIds: pendingOrderIds,
          deliveredToday: deliveredOrders.length,
          activeOrders: activeOrdersCount
        };
      });

      setRiders(ridersData);
    } catch (err) {
      console.error("Error fetching summaries:", err);
      toast.error("Failed to load cash summaries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Listen to cash deposits / handover receipts
    const qDeposits = query(collection(db, 'cash_deposits'), orderBy('timestamp', 'desc'));
    const unsubDeposits = onSnapshot(qDeposits, (snapshot) => {
      setDeposits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to hub bank deposits (Step 2)
    const qBank = query(collection(db, 'hub_bank_deposits'), orderBy('timestamp', 'desc'));
    const unsubBank = onSnapshot(qBank, (snapshot) => {
      setBankDeposits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    fetchSummaries();
    return () => {
      unsubDeposits();
      unsubBank();
    };
  }, []);

  const getWarehouseInfo = (warehouseId) => {
    if (!warehouseId) return { name: 'Unassigned Hub', code: 'GENERAL' };
    const wh = warehouses.find(w => w.id === warehouseId || w.code === warehouseId);
    return wh ? { name: wh.name, code: wh.code || wh.id } : { name: warehouseId, code: warehouseId };
  };

  // Calculate total from denomination inputs
  const totalCountedCash = useMemo(() => {
    const noteSum = DENOMINATIONS.reduce((sum, denom) => sum + (denom * (Number(denominations[denom]) || 0)), 0);
    return noteSum + (Number(denominations.coins) || 0);
  }, [denominations]);

  // Open Handover Modal for a rider
  const handleOpenSettleModal = (rider) => {
    setSettleModalRider(rider);
    setSettleNotes(`Handover at ${getWarehouseInfo(rider.warehouseId).name} counter`);
    const due = rider.pendingCash;
    let rem = due;
    const initialDenoms = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, coins: 0 };
    if (rem >= 500) {
      initialDenoms[500] = Math.floor(rem / 500);
      rem %= 500;
    }
    if (rem >= 200) {
      initialDenoms[200] = Math.floor(rem / 200);
      rem %= 200;
    }
    if (rem >= 100) {
      initialDenoms[100] = Math.floor(rem / 100);
      rem %= 100;
    }
    if (rem >= 50) {
      initialDenoms[50] = Math.floor(rem / 50);
      rem %= 50;
    }
    if (rem >= 20) {
      initialDenoms[20] = Math.floor(rem / 20);
      rem %= 20;
    }
    if (rem >= 10) {
      initialDenoms[10] = Math.floor(rem / 10);
      rem %= 10;
    }
    initialDenoms.coins = rem;
    setDenominations(initialDenoms);
  };

  // Submit Handover (Step 1: Rider -> Cashier)
  const handleConfirmHandover = async () => {
    if (!settleModalRider) return;
    const rider = settleModalRider;
    const whInfo = getWarehouseInfo(rider.warehouseId);

    if (totalCountedCash <= 0) {
      toast.error("Counted cash amount must be greater than 0");
      return;
    }

    if (totalCountedCash !== rider.pendingCash) {
      if (!window.confirm(`Warning: Counted cash (₹${totalCountedCash}) does not match due amount (₹${rider.pendingCash}). Do you want to proceed?`)) {
        return;
      }
    }

    setProcessingId(rider.id);
    try {
      const batch = writeBatch(db);
      const voucherNo = `KV-REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      // 1. Create Cash Deposit / Receipt Document
      const depositRef = doc(collection(db, 'cash_deposits'));
      const receiptPayload = {
        voucherNo,
        riderId: rider.id,
        riderName: rider.name,
        riderPhone: rider.phone,
        warehouseId: rider.warehouseId || (selectedHub !== 'ALL' ? selectedHub : 'GENERAL'),
        hubName: whInfo.name,
        hubCode: whInfo.code,
        amount: totalCountedCash,
        expectedAmount: rider.pendingCash,
        difference: totalCountedCash - rider.pendingCash,
        orderCount: rider.pendingOrderIds.length,
        denominations: { ...denominations },
        status: 'VERIFIED',
        timestamp: Date.now(),
        verifiedAt: new Date().toISOString(),
        verifiedBy: user?.displayName || user?.email || 'Hub Cashier',
        verifiedByRole: role || 'Cashier',
        verifiedByUid: user?.uid || null,
        source: 'DIRECT_DESK_SETTLEMENT',
        notes: settleNotes
      };

      batch.set(depositRef, receiptPayload);

      // 2. Mark rider's pending orders as settled
      rider.pendingOrderIds.forEach(orderId => {
        batch.update(doc(db, 'orders', orderId), {
          isSettledByAdmin: true,
          verifiedByAdmin: true,
          isCashDeposited: true,
          verifiedAt: new Date().toISOString(),
          reconciledWarehouseId: rider.warehouseId || selectedHub,
          depositRefId: depositRef.id,
          voucherNo: voucherNo
        });
      });

      await batch.commit();

      toast.success(`Handover complete! Voucher ${voucherNo} generated.`);
      setReceiptData({ id: depositRef.id, ...receiptPayload });
      setSettleModalRider(null);
      fetchSummaries();
    } catch (error) {
      console.error("Handover failed:", error);
      toast.error("Failed to process handover: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Submit Step 2: Hub Manager Bank Deposit
  const handleBankDepositSubmit = async (e) => {
    e.preventDefault();
    if (!bankForm.amount || Number(bankForm.amount) <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }
    if (!bankForm.utrNumber) {
      toast.error("Please enter Bank Challan / UTR reference number");
      return;
    }

    setSubmittingBank(true);
    try {
      const whInfo = getWarehouseInfo(bankForm.warehouseId);
      const bankChallanNo = `BNK-DEP-${Date.now().toString().slice(-6)}`;

      await addDoc(collection(db, 'hub_bank_deposits'), {
        challanNo: bankChallanNo,
        warehouseId: bankForm.warehouseId,
        hubName: whInfo.name,
        hubCode: whInfo.code,
        bankName: bankForm.bankName,
        accountNumber: bankForm.accountNumber,
        amount: Number(bankForm.amount),
        utrNumber: bankForm.utrNumber.trim().toUpperCase(),
        depositDate: bankForm.depositDate,
        slipUrl: bankForm.slipUrl || null,
        remarks: bankForm.remarks || '',
        status: 'PENDING_AUDIT',
        submittedBy: user?.displayName || user?.email || 'Hub Manager',
        submittedByUid: user?.uid || null,
        submittedAt: new Date().toISOString(),
        timestamp: Date.now()
      });

      toast.success("Bank Deposit Challan recorded! Sent to Finance for Audit.");
      setIsBankModalOpen(false);
      setBankForm({
        warehouseId: warehouses[0]?.id || '',
        bankName: 'HDFC Bank - Current A/C (..4920)',
        accountNumber: '50200067894920',
        amount: '',
        utrNumber: '',
        depositDate: new Date().toISOString().split('T')[0],
        slipUrl: '',
        remarks: ''
      });
    } catch (err) {
      console.error("Bank deposit failed:", err);
      toast.error("Failed to record bank deposit: " + err.message);
    } finally {
      setSubmittingBank(false);
    }
  };

  // Finance Maker-Checker: Audit & Clear Bank Deposit (Step 3)
  const handleAuditBankDeposit = async (bankDep, approve = true) => {
    if (!window.confirm(`${approve ? 'Authorize and reconcile' : 'Reject'} bank deposit of ₹${Number(bankDep.amount).toLocaleString('en-IN')} (UTR: ${bankDep.utrNumber})?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, 'hub_bank_deposits', bankDep.id), {
        status: approve ? 'RECONCILED' : 'REJECTED',
        auditedBy: user?.displayName || user?.email || 'Finance Controller',
        auditedByRole: role || 'FinanceHead',
        auditedByUid: user?.uid || null,
        auditedAt: new Date().toISOString(),
        glReference: approve ? `GL-2026-COD-${bankDep.id.slice(0, 6).toUpperCase()}` : null
      });

      toast.success(approve ? "Deposit Reconciled & GL Entry Locked!" : "Deposit marked as Rejected.");
    } catch (err) {
      console.error("Audit action failed:", err);
      toast.error("Failed to update audit status: " + err.message);
    }
  };

  // Filtered riders
  const filteredRiders = useMemo(() => {
    return riders.filter(r => {
      const matchesHub = selectedHub === 'ALL' || r.warehouseId === selectedHub;
      const matchesSearch = 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (r.phone && r.phone.includes(searchTerm));
      return matchesHub && matchesSearch;
    });
  }, [riders, selectedHub, searchTerm]);

  // Aggregated Hub Financial Metrics
  const metrics = useMemo(() => {
    const totalCollected = filteredRiders.reduce((acc, r) => acc + (r.totalCashCollected || 0), 0);
    const totalSettled = filteredRiders.reduce((acc, r) => acc + (r.settledCash || 0), 0);
    const totalPending = filteredRiders.reduce((acc, r) => acc + (r.pendingCash || 0), 0);
    const ridersWithPending = filteredRiders.filter(r => r.pendingCash > 0).length;

    const totalBankDeposited = bankDeposits.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
    const pendingBankAudits = bankDeposits.filter(b => b.status === 'PENDING_AUDIT').length;
    const reconciledBankDeposits = bankDeposits.filter(b => b.status === 'RECONCILED').reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

    return { 
      totalCollected, 
      totalSettled, 
      totalPending, 
      ridersWithPending, 
      totalBankDeposited,
      pendingBankAudits,
      reconciledBankDeposits,
      totalRiders: filteredRiders.length 
    };
  }, [filteredRiders, bankDeposits]);

  // Columns for Tab 1: Rider Handover Desk
  const settlementColumns = [
    { 
      header: 'Rider Info', 
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-[#0B4D31] text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-md shadow-green-100">
            {r.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-gray-900 tracking-tight text-sm">{r.name}</span>
            <span className="text-[11px] font-mono text-gray-400 font-semibold">{r.phone || `ID: ${r.id.slice(0, 8)}`}</span>
          </div>
        </div>
      )
    },
    { 
      header: 'Assigned Hub', 
      render: (r) => {
        const wh = getWarehouseInfo(r.warehouseId);
        return (
          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Building2 size={12} className="mr-1.5 text-blue-500" />
            {wh.name}
          </span>
        );
      }
    },
    { 
      header: 'Trip Deliveries', 
      render: (r) => (
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100">
            <CheckCircle size={12} className="mr-1 text-green-600" /> {r.deliveredToday} Done
          </span>
          {r.activeOrders > 0 && (
            <span className="inline-flex items-center px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-100">
              <Truck size={12} className="mr-1 text-amber-600" /> {r.activeOrders} En Route
            </span>
          )}
        </div>
      )
    },
    { 
      header: 'Total Lifetime COD', 
      render: (r) => (
        <span className="font-bold text-gray-900 text-sm">₹{r.totalCashCollected.toLocaleString('en-IN')}</span>
      )
    },
    { 
      header: 'Settled to Date', 
      render: (r) => (
        <span className="text-sm font-bold text-green-700">₹{r.settledCash.toLocaleString('en-IN')}</span>
      )
    },
    { 
      header: 'Due in Hand', 
      render: (r) => (
        r.pendingCash > 0 ? (
          <div className="flex items-center space-x-1.5 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200 w-fit">
            <IndianRupee size={13} className="text-orange-600" />
            <span className="text-orange-800 font-black text-sm tracking-tight">₹{r.pendingCash.toLocaleString('en-IN')}</span>
          </div>
        ) : (
          <span className="inline-flex items-center text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-xl border border-green-100">
            ✓ ₹0 Clear
          </span>
        )
      )
    },
    { 
      header: 'Action', 
      render: (r) => (
        <button
          disabled={r.pendingCash === 0 || processingId === r.id}
          onClick={() => handleOpenSettleModal(r)}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
            r.pendingCash === 0 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-[#0B4D31] text-white shadow-md shadow-green-100 hover:bg-[#146c43] active:scale-95'
          }`}
        >
          {processingId === r.id ? 'Processing...' : r.pendingCash === 0 ? 'Settled ✓' : (
            <>
              <Banknote size={14} />
              Receive Cash
            </>
          )}
        </button>
      )
    }
  ];

  // Columns for Tab 2: Hub Bank Deposits (Step 2)
  const bankDepositColumns = [
    {
      header: 'Challan / Date',
      render: (b) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-gray-900 text-xs">{b.challanNo}</span>
          <span className="text-[11px] text-gray-400">{b.depositDate || new Date(b.timestamp).toLocaleDateString()}</span>
        </div>
      )
    },
    {
      header: 'Hub',
      render: (b) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
          <Building2 size={11} className="mr-1 text-blue-500" />
          {b.hubName || getWarehouseInfo(b.warehouseId).name}
        </span>
      )
    },
    {
      header: 'Bank Account / UTR',
      render: (b) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-800 text-xs flex items-center gap-1">
            <Building size={12} className="text-gray-400" /> {b.bankName}
          </span>
          <span className="font-mono text-[11px] text-primary font-bold">UTR: {b.utrNumber}</span>
        </div>
      )
    },
    {
      header: 'Amount',
      render: (b) => (
        <span className="text-sm font-black text-gray-900">₹{Number(b.amount).toLocaleString('en-IN')}</span>
      )
    },
    {
      header: 'Submitted By',
      render: (b) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-gray-700">{b.submittedBy}</span>
          <span className="text-[10px] text-gray-400">{new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )
    },
    {
      header: 'Audit Status',
      render: (b) => (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
          b.status === 'RECONCILED' ? 'bg-green-50 text-green-700 border-green-200' :
          b.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
          'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
        }`}>
          {b.status === 'RECONCILED' ? '✓ Reconciled' : b.status === 'PENDING_AUDIT' ? '⏳ Pending Finance Audit' : '✕ Rejected'}
        </span>
      )
    },
    {
      header: 'Audit Actions',
      render: (b) => (
        b.status === 'PENDING_AUDIT' ? (
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handleAuditBankDeposit(b, true)}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              Approve
            </button>
            <button
              onClick={() => handleAuditBankDeposit(b, false)}
              className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all"
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="text-[10px] text-gray-400 font-semibold">
            {b.auditedBy && <span>Audited by {b.auditedBy}</span>}
            {b.glReference && <div className="font-mono text-primary">{b.glReference}</div>}
          </div>
        )
      )
    }
  ];

  // Columns for Tab 3: Vouchers & Receipts
  const voucherColumns = [
    {
      header: 'Voucher No',
      render: (d) => (
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-primary" />
          <span className="font-mono font-bold text-gray-900 text-xs">{d.voucherNo || `REC-${d.id.slice(0, 6)}`}</span>
        </div>
      )
    },
    {
      header: 'Date & Time',
      render: (d) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-xs">{new Date(d.timestamp).toLocaleDateString()}</span>
          <span className="text-[10px] text-gray-400">{new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )
    },
    {
      header: 'Rider & Phone',
      render: (d) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-xs">{d.riderName}</span>
          <span className="text-[10px] text-gray-400 font-mono">{d.riderPhone || `ID: ${d.riderId?.slice(0, 6)}`}</span>
        </div>
      )
    },
    {
      header: 'Hub & Cashier',
      render: (d) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-blue-700">{d.hubName || getWarehouseInfo(d.warehouseId).name}</span>
          <span className="text-[10px] text-gray-400">By: {d.verifiedBy}</span>
        </div>
      )
    },
    {
      header: 'Amount Handed Over',
      render: (d) => (
        <span className="text-sm font-black text-green-700">₹{Number(d.amount).toLocaleString('en-IN')}</span>
      )
    },
    {
      header: 'Receipt',
      render: (d) => (
        <button
          onClick={() => setReceiptData(d)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all"
        >
          <Printer size={13} className="text-primary" />
          View Receipt
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="3-Way COD Cash Reconciliation Engine"
          subtitle="Corporate cash control matrix: Rider Desk Handover -> Hub Bank Deposit Challans -> Finance General Ledger Audit."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsBankModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B4D31] text-white rounded-2xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43] transition-all active:scale-95"
          >
            <PlusCircle size={15} />
            + New Bank Deposit Challan
          </button>
          <button 
            onClick={fetchSummaries}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : 'text-gray-500'} />
            Refresh
          </button>
        </div>
      </div>

      {/* 4 Multi-Hub Corporate Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Total COD Collected (Field)" 
          value={`₹${metrics.totalCollected.toLocaleString('en-IN')}`} 
          icon={Banknote} 
          color="blue" 
        />
        <MetricCard 
          label="Desk Cash in Hand (Due)" 
          value={`₹${metrics.totalPending.toLocaleString('en-IN')}`} 
          icon={AlertTriangle} 
          color="amber" 
        />
        <MetricCard 
          label="Hub Bank Deposits Recorded" 
          value={`₹${metrics.totalBankDeposited.toLocaleString('en-IN')}`} 
          icon={Building} 
          color="indigo" 
        />
        <MetricCard 
          label="Finance Audited & Locked" 
          value={`₹${metrics.reconciledBankDeposits.toLocaleString('en-IN')}`} 
          icon={ShieldCheck} 
          color="green" 
        />
      </div>

      {/* Hub Filter & Search Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center text-xs font-black text-gray-700 uppercase tracking-wider bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100">
            <Building2 size={16} className="mr-2 text-primary" />
            Active Depot / Hub:
          </div>
          <select
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer hover:bg-gray-100 transition-colors focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">🏢 All Regional Hubs (Consolidated)</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>
                📍 {wh.name} ({wh.code || wh.id})
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search rider, phone, voucher..."
            className="pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold w-full outline-none focus:ring-2 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 3-Step Process Tabs */}
      <div className="flex items-center space-x-2 bg-gray-100/80 p-1.5 rounded-2xl w-full md:w-fit border border-gray-200/60 overflow-x-auto">
        <button
          onClick={() => setActiveTab('DESK_SETTLEMENT')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            activeTab === 'DESK_SETTLEMENT'
              ? 'bg-[#0B4D31] text-white shadow-lg shadow-[#0B4D31]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Wallet size={15} />
          Step 1: Rider Desk Handover
          {metrics.ridersWithPending > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'DESK_SETTLEMENT' ? 'bg-white text-green-900' : 'bg-orange-100 text-orange-700'
            }`}>
              {metrics.ridersWithPending} Due
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('BANK_DEPOSITS')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            activeTab === 'BANK_DEPOSITS'
              ? 'bg-[#0B4D31] text-white shadow-lg shadow-[#0B4D31]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Building size={15} />
          Step 2: Hub Bank Deposits
          {metrics.pendingBankAudits > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'BANK_DEPOSITS' ? 'bg-white text-green-900' : 'bg-amber-100 text-amber-800 animate-pulse'
            }`}>
              {metrics.pendingBankAudits} Pending Audit
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('VOUCHER_HISTORY')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            activeTab === 'VOUCHER_HISTORY'
              ? 'bg-[#0B4D31] text-white shadow-lg shadow-[#0B4D31]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Receipt size={15} />
          Step 3: Vouchers & Handover Receipts
        </button>
      </div>

      {/* Tab 1 Content: Desk Cash Handover */}
      {activeTab === 'DESK_SETTLEMENT' && (
        <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-gray-100 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-2">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                <Wallet className="mr-2 text-primary" size={20} />
                Physical Desk Cash Collection & Denomination Counter
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-0.5">
                Riders hand over collected cash at the hub desk. Cashier counts denominations and generates a signed receipt.
              </p>
            </div>
            <div className="text-xs font-bold text-gray-500 bg-gray-50 px-3.5 py-1.5 rounded-xl border border-gray-100">
              Total Outstanding Cash in Field: <span className="text-orange-700 font-black">₹{metrics.totalPending.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <DataTable columns={settlementColumns} data={filteredRiders} loading={loading} />
        </div>
      )}

      {/* Tab 2 Content: Hub Bank Deposits */}
      {activeTab === 'BANK_DEPOSITS' && (
        <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-gray-100 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                <Building className="mr-2 text-primary" size={20} />
                Hub-to-Bank Deposit Challans & UTR Verification
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-0.5">
                Hub managers deposit consolidated daily cash into KrishiVishal bank accounts and record UTR challan slips.
              </p>
            </div>
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="px-4 py-2 bg-[#0B4D31] text-white rounded-xl text-xs font-bold shadow-sm hover:bg-[#146c43]"
            >
              + Record Bank Challan
            </button>
          </div>

          <DataTable columns={bankDepositColumns} data={bankDeposits} loading={loading} />
        </div>
      )}

      {/* Tab 3 Content: Vouchers & Receipts */}
      {activeTab === 'VOUCHER_HISTORY' && (
        <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-gray-100 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
              <Receipt className="mr-2 text-primary" size={20} />
              Voucher History & Tamper-Proof Audit Trail
            </h3>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">
              Full record of physical cash handover receipts generated at hub desks.
            </p>
          </div>

          <DataTable columns={voucherColumns} data={deposits} loading={loading} />
        </div>
      )}

      {/* MODAL 1: Denomination Handover Counter Modal */}
      {settleModalRider && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-xl w-full p-6 lg:p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-green-50 flex items-center justify-center text-primary font-bold">
                  <Banknote size={20} />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-lg">Cash Handover Counter</h3>
                  <p className="text-xs text-gray-400 font-medium">{settleModalRider.name} • {getWarehouseInfo(settleModalRider.warehouseId).name}</p>
                </div>
              </div>
              <button onClick={() => setSettleModalRider(null)} className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="py-5 space-y-4">
              {/* Due vs Counted Bar */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200/60">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">System COD Due</span>
                  <div className="text-lg font-black text-gray-900">₹{settleModalRider.pendingCash.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Counted Physical Total</span>
                  <div className={`text-lg font-black ${totalCountedCash === settleModalRider.pendingCash ? 'text-green-700' : 'text-orange-600'}`}>
                    ₹{totalCountedCash.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Denomination Counter Inputs */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">Denomination Breakdown (Notes & Coins)</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {DENOMINATIONS.map(denom => (
                    <div key={denom} className="bg-gray-50 p-2.5 rounded-xl border border-gray-200/80 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600">₹{denom} ×</span>
                      <input
                        type="number"
                        min="0"
                        value={denominations[denom] || ''}
                        onChange={(e) => setDenominations({ ...denominations, [denom]: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-black text-right outline-none focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200/80 flex items-center justify-between mt-2">
                  <span className="text-xs font-bold text-gray-600">Coins / Small Change (₹):</span>
                  <input
                    type="number"
                    min="0"
                    value={denominations.coins || ''}
                    onChange={(e) => setDenominations({ ...denominations, coins: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-black text-right outline-none focus:ring-1 focus:ring-primary"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Handover Notes */}
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Counter Remarks / Notes</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Received full cash in good condition"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setSettleModalRider(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHandover}
                disabled={processingId !== null}
                className="px-6 py-2.5 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43] transition-all flex items-center gap-2"
              >
                <CheckCircle2 size={16} />
                {processingId ? 'Recording Handover...' : 'Generate Handover Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Bank Deposit Challan (Step 2) */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 lg:p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-700 font-bold">
                  <Building size={20} />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-lg">Bank Deposit Challan</h3>
                  <p className="text-xs text-gray-400 font-medium">Record Hub Cash deposit to KrishiVishal Current Account</p>
                </div>
              </div>
              <button onClick={() => setIsBankModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBankDepositSubmit} className="py-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Origin Hub / Depot *</label>
                <select
                  value={bankForm.warehouseId}
                  onChange={(e) => setBankForm({ ...bankForm, warehouseId: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  required
                >
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code || wh.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Target Bank Account *</label>
                <select
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  required
                >
                  <option value="HDFC Bank - Current A/C (..4920)">HDFC Bank - Current A/C (..4920)</option>
                  <option value="State Bank of India - Current A/C (..8812)">State Bank of India - Current A/C (..8812)</option>
                  <option value="ICICI Bank - Agri Business A/C (..3390)">ICICI Bank - Agri Business A/C (..3390)</option>
                  <option value="Punjab National Bank - Regional Depot A/C (..1104)">Punjab National Bank - Regional Depot A/C (..1104)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Deposited Cash Amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    value={bankForm.amount}
                    onChange={(e) => setBankForm({ ...bankForm, amount: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    placeholder="e.g. 50000"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">Deposit Date *</label>
                  <input
                    type="date"
                    value={bankForm.depositDate}
                    onChange={(e) => setBankForm({ ...bankForm, depositDate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Bank Challan / UTR Reference Number *</label>
                <input
                  type="text"
                  value={bankForm.utrNumber}
                  onChange={(e) => setBankForm({ ...bankForm, utrNumber: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase outline-none"
                  placeholder="e.g. HDFC2026090900128"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">Challan / Slip Image URL (Optional)</label>
                <input
                  type="url"
                  value={bankForm.slipUrl}
                  onChange={(e) => setBankForm({ ...bankForm, slipUrl: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
                  placeholder="https://..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBank}
                  className="px-6 py-2.5 bg-[#0B4D31] text-white rounded-xl text-xs font-black shadow-md shadow-green-900/10 hover:bg-[#146c43]"
                >
                  {submittingBank ? 'Submitting...' : 'Submit Challan to Finance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Printable Digital Handover Receipt */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 lg:p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100">
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Official Cash Handover Receipt</span>
              <button onClick={() => setReceiptData(null)} className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* Printable Content Area */}
            <div ref={printableRef} className="py-6 space-y-4 text-gray-800">
              <div className="text-center border-b pb-4 border-dashed border-gray-200">
                <div className="font-black text-xl text-primary tracking-tight">KRISHI VISHAL PRIVATE LIMITED</div>
                <div className="text-[10px] text-gray-500 font-semibold mt-0.5">Corporate Agri Logistics & Supply Chain Network</div>
                <div className="inline-block mt-2 px-3 py-1 bg-green-50 text-green-800 rounded-full font-mono text-xs font-bold border border-green-200">
                  {receiptData.voucherNo}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                <div>
                  <span className="text-gray-400 text-[10px] block">Rider Name</span>
                  <span className="font-bold text-gray-900">{receiptData.riderName}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Hub / Depot</span>
                  <span className="font-bold text-gray-900">{receiptData.hubName}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Collected By</span>
                  <span className="font-bold text-gray-900">{receiptData.verifiedBy}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Date & Time</span>
                  <span className="font-bold text-gray-900">{new Date(receiptData.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-2xl p-4 bg-emerald-50/50">
                <div className="flex justify-between items-center text-sm font-black">
                  <span>Total Amount Received:</span>
                  <span className="text-xl text-primary font-black">₹{Number(receiptData.amount).toLocaleString('en-IN')}</span>
                </div>
                <div className="text-[10px] text-gray-500 font-medium mt-1">
                  Settled {receiptData.orderCount || 0} COD Delivered Shipments
                </div>
              </div>

              {receiptData.denominations && (
                <div className="text-[11px] text-gray-600 bg-gray-50 p-3 rounded-xl">
                  <span className="font-bold block mb-1">Denomination Count:</span>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    {Object.entries(receiptData.denominations).map(([d, count]) => count > 0 && (
                      <span key={d} className="bg-white px-2 py-0.5 rounded border text-gray-700">
                        {d === 'coins' ? 'Coins' : `₹${d}`} × {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-6 flex justify-between items-end text-[10px] text-gray-400 border-t border-dashed border-gray-200">
                <div className="text-center">
                  <div className="w-24 border-b border-gray-300 pb-1 mb-1 font-semibold text-gray-600">{receiptData.riderName}</div>
                  <span>Rider Signature</span>
                </div>
                <div className="text-center">
                  <div className="w-24 border-b border-gray-300 pb-1 mb-1 font-semibold text-gray-600">{receiptData.verifiedBy}</div>
                  <span>Cashier Stamp / Sign</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setReceiptData(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm hover:bg-primary-dark"
              >
                <Printer size={15} />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashRecon;

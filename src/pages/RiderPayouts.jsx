import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, addDoc, Timestamp, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { 
  Banknote, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  Package, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  Download,
  Search,
  Filter,
  Eye,
  CreditCard,
  Building,
  Building2,
  AlertCircle,
  FileText,
  Phone,
  Check,
  XCircle,
  ShieldCheck,
  Receipt,
  Sliders,
  Settings,
  Edit3,
  Sparkles,
  Save
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import toast from 'react-hot-toast';

const RiderPayouts = () => {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState({});
  const [payoutLogs, setPayoutLogs] = useState({});
  const [warehouses, setWarehouses] = useState([]);
  const [config, setConfig] = useState({ baseSalaryPerDay: 300, commissionPerOrder: 20, fuelAllowancePerDay: 50 });
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, PENDING, PAID
  const [selectedHub, setSelectedHub] = useState('ALL'); // ALL or warehouseId

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailRider, setDetailRider] = useState(null);

  // Policy Settings Modal state
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    baseSalaryPerDay: 300,
    commissionPerOrder: 20,
    fuelAllowancePerDay: 50
  });

  const [payoutForm, setPayoutForm] = useState({ method: 'UPI', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [selectedRiders, setSelectedRiders] = useState(new Set());

  useEffect(() => {
    setLoading(true);

    // 0. Listen to Warehouses / Hubs
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 1. Fetch Config with robust defaults
    const unsubConfig = onSnapshot(doc(db, 'settings', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const base = Number(data.baseSalaryPerDay) || 300;
        const comm = Number(data.commissionPerOrder) || 20;
        const fuel = Number(data.fuelAllowancePerDay) || 50;
        setConfig({
          baseSalaryPerDay: base,
          commissionPerOrder: comm,
          fuelAllowancePerDay: fuel,
          ...data
        });
        setPolicyForm({
          baseSalaryPerDay: base,
          commissionPerOrder: comm,
          fuelAllowancePerDay: fuel
        });
      }
    });

    // 2. Listen to Riders fleet
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snap) => {
      const map = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setRiders(map);
    });

    // 3. Listen to Payout Logs for the selected month/year
    const logsQuery = query(
      collection(db, 'payout_logs'),
      where('month', '==', currentMonth + 1),
      where('year', '==', currentYear)
    );
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.riderId) {
          map[data.riderId] = { id: d.id, ...data };
        }
      });
      setPayoutLogs(map);
    });

    // 4. Listen to Delivered Orders for the selected month
    const startOfMonth = new Date(currentYear, currentMonth, 1, 0, 0, 0);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfMonth),
      where('createdAt', '<=', endOfMonth),
      where('status', '==', 'DELIVERED')
    );

    const unsubOrders = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Orders payout query error:", error);
      setLoading(false);
    });

    return () => {
      unsubConfig();
      unsubRiders();
      unsubLogs();
      unsubOrders();
    };
  }, [currentMonth, currentYear]);

  // Compute Payout Summary per Rider
  const payoutSummary = useMemo(() => {
    const summary = new Map();

    orders.forEach(order => {
      const riderId = order.riderId || order.deliveryRiderId;
      if (!riderId) return;

      if (!summary.has(riderId)) {
        summary.set(riderId, {
          riderId: riderId,
          orderCount: 0,
          commissionTotal: 0,
          activeDays: new Set(),
          baseSalaryTotal: 0,
          fuelTotal: 0,
          totalEarnings: 0,
          deliveredOrders: []
        });
      }

      const stats = summary.get(riderId);
      stats.orderCount += 1;
      stats.commissionTotal += (config.commissionPerOrder || 20);

      const d = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || Date.now());
      const dateKey = d.toDateString();
      stats.activeDays.add(dateKey);
      stats.deliveredOrders.push({
        id: order.id,
        orderNumber: order.orderNumber || order.id.slice(-6),
        totalAmount: order.totalAmount || 0,
        date: d
      });
    });

    // Calculate totals based on active days
    summary.forEach(stats => {
      const daysCount = stats.activeDays.size;
      stats.baseSalaryTotal = daysCount * (config.baseSalaryPerDay || 300);
      stats.fuelTotal = daysCount * (config.fuelAllowancePerDay || 50);
      stats.totalEarnings = stats.commissionTotal + stats.baseSalaryTotal + stats.fuelTotal;
      
      // Check settlement status from payoutLogs
      const log = payoutLogs[stats.riderId];
      stats.isPaid = !!log;
      stats.payoutLog = log || null;
    });

    return Array.from(summary.values());
  }, [orders, config, payoutLogs]);

  const getWarehouseInfo = (warehouseId) => {
    if (!warehouseId) return { name: 'General Hub', code: 'GENERAL' };
    const wh = warehouses.find(w => w.id === warehouseId || w.code === warehouseId);
    return wh ? { name: wh.name, code: wh.code || wh.id } : { name: warehouseId, code: warehouseId };
  };

  // Filtered Summary based on Search, Status, and Hub Filter
  const filteredPayoutSummary = useMemo(() => {
    return payoutSummary.filter(s => {
      const r = riders[s.riderId] || {};
      const name = (r.name || '').toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      const id = (s.riderId || '').toLowerCase();
      const q = searchTerm.trim().toLowerCase();

      const matchesSearch = !q || name.includes(q) || phone.includes(q) || id.includes(q);
      const matchesStatus = 
        statusFilter === 'ALL' || 
        (statusFilter === 'PAID' && s.isPaid) || 
        (statusFilter === 'PENDING' && !s.isPaid);
      const matchesHub = 
        selectedHub === 'ALL' || 
        r.warehouseId === selectedHub || 
        r.assignedWarehouse === selectedHub;

      return matchesSearch && matchesStatus && matchesHub;
    });
  }, [payoutSummary, riders, searchTerm, statusFilter, selectedHub]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalPayable = filteredPayoutSummary.reduce((sum, s) => sum + s.totalEarnings, 0);
    const totalSettled = filteredPayoutSummary.filter(s => s.isPaid).reduce((sum, s) => sum + s.totalEarnings, 0);
    const totalPending = totalPayable - totalSettled;
    const paidCount = filteredPayoutSummary.filter(s => s.isPaid).length;
    const pendingCount = filteredPayoutSummary.length - paidCount;

    return { totalPayable, totalSettled, totalPending, paidCount, pendingCount, totalOrders: orders.length };
  }, [filteredPayoutSummary, orders]);

  // Save Policy Handler
  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'config'), {
        ...config,
        baseSalaryPerDay: Number(policyForm.baseSalaryPerDay) || 0,
        commissionPerOrder: Number(policyForm.commissionPerOrder) || 0,
        fuelAllowancePerDay: Number(policyForm.fuelAllowancePerDay) || 0,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || 'unknown'
      }, { merge: true });
      toast.success("Rider Payout Policy updated successfully!");
      setIsPolicyModalOpen(false);
    } catch (err) {
      console.error("Policy update error:", err);
      toast.error("Failed to update policy: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Settle single rider payout
  const handleMarkAsPaid = async (e) => {
    e.preventDefault();
    if (!selectedRider) return;

    setSaving(true);
    const r = riders[selectedRider.riderId] || {};
    const riderName = r.name || 'Rider';

    try {
      // 1. Record in Payout Logs
      const payoutRef = await addDoc(collection(db, 'payout_logs'), {
        riderId: selectedRider.riderId,
        riderName,
        riderPhone: r.phone || '',
        amount: selectedRider.totalEarnings,
        method: payoutForm.method,
        referenceId: payoutForm.reference || 'DIRECT_PAY',
        notes: payoutForm.notes || '',
        month: currentMonth + 1,
        year: currentYear,
        ordersCount: selectedRider.orderCount,
        paidAt: serverTimestamp(),
        paidBy: user?.uid || 'unknown',
        paidByName: user?.displayName || user?.email?.split('@')[0] || 'Admin',
        paidByRole: role || 'SuperAdmin',
        breakdown: {
          commission: selectedRider.commissionTotal,
          baseSalary: selectedRider.baseSalaryTotal,
          fuel: selectedRider.fuelTotal,
          activeDaysCount: selectedRider.activeDays.size
        }
      });

      // 2. Add to General Ledger (Forensic Accounting DEBIT Entry under RIDER_PAYOUT)
      await addDoc(collection(db, 'ledger'), {
        account: 'RIDER_PAYOUT',
        type: 'DEBIT',
        amount: selectedRider.totalEarnings,
        description: `Rider Payout: ${riderName} for ${monthName} ${currentYear} (${selectedRider.orderCount} orders, ${selectedRider.activeDays.size} days)`,
        referenceId: payoutForm.reference || payoutRef.id,
        timestamp: serverTimestamp(),
        actorId: user?.uid || 'unknown',
        actorEmail: user?.email || '',
        actorName: user?.displayName || user?.email?.split('@')[0] || 'Admin',
        actorRole: role || 'SuperAdmin'
      });

      toast.success(`₹${selectedRider.totalEarnings.toLocaleString('en-IN')} paid to ${riderName} via ${payoutForm.method}`);
      setIsModalOpen(false);
      setPayoutForm({ method: 'UPI', reference: '', notes: '' });
    } catch (err) {
      console.error("Payout error:", err);
      toast.error("Failed to record payout: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Bulk Settlement for Selected Riders
  const handleBulkPay = async () => {
    const eligibleRiders = payoutSummary.filter(s => selectedRiders.has(s.riderId) && !s.isPaid);
    if (eligibleRiders.length === 0) return toast.error("Please select unpaid riders for settlement");

    const batchId = prompt("Enter Bank Batch Reference ID (e.g. BATCH_NEFT_01):");
    if (batchId === null) return;

    setSaving(true);
    try {
      for (const s of eligibleRiders) {
        const r = riders[s.riderId] || {};
        const riderName = r.name || 'Rider';

        // 1. Record log
        const logRef = await addDoc(collection(db, 'payout_logs'), {
          riderId: s.riderId,
          riderName,
          riderPhone: r.phone || '',
          amount: s.totalEarnings,
          method: 'BULK_BANK_TRANSFER',
          referenceId: batchId || 'BATCH_PAY',
          month: currentMonth + 1,
          year: currentYear,
          ordersCount: s.orderCount,
          paidAt: serverTimestamp(),
          paidBy: user?.uid || 'unknown',
          paidByName: user?.displayName || user?.email?.split('@')[0] || 'Admin',
          paidByRole: role || 'SuperAdmin',
          breakdown: {
            commission: s.commissionTotal,
            baseSalary: s.baseSalaryTotal,
            fuel: s.fuelTotal,
            activeDaysCount: s.activeDays.size
          }
        });

        // 2. Record in Ledger
        await addDoc(collection(db, 'ledger'), {
          account: 'RIDER_PAYOUT',
          type: 'DEBIT',
          amount: s.totalEarnings,
          description: `Bulk Rider Payout to ${riderName} (${monthName} ${currentYear})`,
          referenceId: batchId || logRef.id,
          timestamp: serverTimestamp(),
          actorId: user?.uid || 'unknown',
          actorEmail: user?.email || '',
          actorName: user?.displayName || user?.email?.split('@')[0] || 'Admin',
          actorRole: role || 'SuperAdmin'
        });
      }

      toast.success(`${eligibleRiders.length} Riders marked as PAID successfully!`);
      setSelectedRiders(new Set());
    } catch (err) {
      console.error("Bulk payout error:", err);
      toast.error("Bulk settlement failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Download Bank Transfer CSV File
  const downloadBankCSV = () => {
    if (payoutSummary.length === 0) return toast.error("No payout data to export");

    let csv = "Beneficiary Name,Phone Number,Bank Account Number,IFSC Code,UPI ID,Payout Amount (INR),Orders,Active Days,Status,Month,Remarks\n";

    payoutSummary.forEach(s => {
      const r = riders[s.riderId] || {};
      const statusStr = s.isPaid ? 'PAID' : 'PENDING';
      csv += `"${r.name || 'Rider'}","${r.phone || ''}","${r.bankAccount || ''}","${r.ifsc || ''}","${r.upiId || ''}",${s.totalEarnings},${s.orderCount},${s.activeDays.size},"${statusStr}","${monthName} ${currentYear}","KrishiVishal Rider Payout"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KrishiVishal_Rider_Payouts_${monthName}_${currentYear}.csv`;
    a.click();
    toast.success("Bank Transfer CSV file downloaded!");
  };

  const changeMonth = (offset) => {
    let nextMonth = currentMonth + offset;
    let nextYear = currentYear;
    if (nextMonth < 0) { nextMonth = 11; nextYear--; }
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
    setSelectedRiders(new Set());
  };

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));

  // Table Columns Definition
  const columns = [
    {
      header: (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
          onChange={(e) => {
            if (e.target.checked) setSelectedRiders(new Set(filteredPayoutSummary.filter(s => !s.isPaid).map(s => s.riderId)));
            else setSelectedRiders(new Set());
          }}
        />
      ),
      render: (s) => (
        <input
          type="checkbox"
          disabled={s.isPaid}
          checked={selectedRiders.has(s.riderId)}
          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:opacity-30"
          onChange={() => {
            const next = new Set(selectedRiders);
            if (next.has(s.riderId)) next.delete(s.riderId);
            else next.add(s.riderId);
            setSelectedRiders(next);
          }}
        />
      )
    },
    { 
      header: 'Rider Partner', 
      render: (s) => {
        const r = riders[s.riderId] || {};
        return (
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-orange-100 text-orange-700 rounded-2xl flex items-center justify-center font-black text-sm border border-orange-200">
              {(r.name || 'R').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="font-black text-gray-900 leading-tight flex items-center gap-1.5">
                {r.name || 'Unknown Rider'}
                {r.vehicleNumber && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-mono">{r.vehicleNumber}</span>}
              </span>
              <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 mt-0.5">
                <Phone size={10} /> {r.phone || 'No phone'}
              </span>
            </div>
          </div>
        );
      }
    },
    { 
      header: 'Assigned Hub', 
      render: (s) => {
        const r = riders[s.riderId] || {};
        const wh = getWarehouseInfo(r.warehouseId || r.assignedWarehouse);
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Building2 size={11} className="mr-1.5 text-blue-500" />
            {wh.name}
          </span>
        );
      }
    },
    { 
      header: 'Active Days', 
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-black text-gray-800 text-xs">{s.activeDays.size} Days</span>
          <span className="text-[9px] text-gray-400 font-medium">₹{s.baseSalaryTotal} Base</span>
        </div>
      )
    },
    { 
      header: 'Deliveries & Commission', 
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-black text-gray-800 text-xs">{s.orderCount} Orders</span>
          <span className="text-[9px] text-gray-400 font-medium">₹{s.commissionTotal} Comm.</span>
        </div>
      )
    },
    { 
      header: 'Fuel Allowance', 
      render: (s) => (
        <span className="text-xs font-bold text-gray-700">₹{s.fuelTotal}</span>
      )
    },
    { 
      header: 'Total Earnings', 
      render: (s) => (
        <div className="bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 w-fit">
          <span className="text-green-800 font-black tracking-tight text-sm">₹{s.totalEarnings.toLocaleString('en-IN')}</span>
        </div>
      )
    },
    { 
      header: 'Status', 
      render: (s) => (
        s.isPaid ? (
          <span className="px-2.5 py-1 bg-green-100 text-green-800 border border-green-200 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
            <Check size={11} /> Paid
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
            <Clock size={11} /> Pending
          </span>
        )
      )
    },
    { 
      header: 'Actions', 
      render: (s) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setDetailRider(s); setIsDetailModalOpen(true); }}
            className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
            title="View Full Breakdown"
          >
            <Eye size={15} />
          </button>
          {s.isPaid ? (
            <button
              onClick={() => { setDetailRider(s); setIsDetailModalOpen(true); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-gray-200 transition-all flex items-center gap-1"
            >
              <Receipt size={12} /> Settled
            </button>
          ) : (
            <button
              onClick={() => { setSelectedRider(s); setIsModalOpen(true); }}
              className="px-3 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-green-800 transition-all shadow-md shadow-green-100 flex items-center gap-1"
            >
              <CreditCard size={12} /> Pay Now
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-300">
      {/* Page Header with Month Navigator & Configure Policy Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <PageHeader
          title="Rider Payout & Earnings Settlement ERP"
          subtitle="Monthly salary calculations, per-order delivery commissions, fuel allowances, and automated bank export files."
          actions={[
            {
              label: 'Configure Policy',
              icon: Sliders,
              onClick: () => {
                setPolicyForm({
                  baseSalaryPerDay: config.baseSalaryPerDay,
                  commissionPerOrder: config.commissionPerOrder,
                  fuelAllowancePerDay: config.fuelAllowancePerDay
                });
                setIsPolicyModalOpen(true);
              },
              variant: 'secondary'
            }
          ]}
        />

        <div className="flex items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm space-x-4">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400 hover:text-gray-900"><ChevronLeft size={20}/></button>
          <div className="flex flex-col items-center min-w-[130px]">
            <span className="text-xs font-black uppercase text-primary tracking-tight">{monthName}</span>
            <span className="text-[10px] font-bold text-gray-400">{currentYear}</span>
          </div>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400 hover:text-gray-900"><ChevronRight size={20}/></button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-primary p-6 rounded-[2rem] text-white shadow-xl shadow-green-200 relative overflow-hidden flex flex-col justify-between">
          <Banknote size={90} className="absolute -right-4 -bottom-4 opacity-15" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-200 mb-1">Total Payout Volume</p>
          <h3 className="text-3xl font-black tracking-tighter">₹{metrics.totalPayable.toLocaleString('en-IN')}</h3>
          <p className="text-[10px] text-green-100/80 font-bold mt-2">{orders.length} Deliveries in {monthName}</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-green-100/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="p-2.5 bg-green-50 text-green-600 rounded-2xl"><CheckCircle size={20} /></span>
            <span className="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase">{metrics.paidCount} Riders</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3">Settled / Paid</p>
            <h3 className="text-2xl font-black text-green-700 tracking-tight mt-0.5">₹{metrics.totalSettled.toLocaleString('en-IN')}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-green-100/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl"><Clock size={20} /></span>
            <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase">{metrics.pendingCount} Riders</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3">Pending Settlement</p>
            <h3 className="text-2xl font-black text-amber-700 tracking-tight mt-0.5">₹{metrics.totalPending.toLocaleString('en-IN')}</h3>
          </div>
        </div>

        {/* Clickable Active Formula / Policy Card */}
        <div 
          onClick={() => {
            setPolicyForm({
              baseSalaryPerDay: config.baseSalaryPerDay,
              commissionPerOrder: config.commissionPerOrder,
              fuelAllowancePerDay: config.fuelAllowancePerDay
            });
            setIsPolicyModalOpen(true);
          }}
          className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-green-100/20 flex flex-col justify-between cursor-pointer hover:border-primary/50 transition-all group"
          title="Click to change formula rates"
        >
          <div className="flex items-center justify-between">
            <span className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
              <Sliders size={20} />
            </span>
            <span className="text-[9px] font-black text-primary bg-green-50 px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border border-green-100">
              <Edit3 size={10} /> Edit Policy
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Active Formula</p>
            <p className="text-xs font-black text-gray-800 mt-1">
              ₹{config.baseSalaryPerDay} Base + ₹{config.commissionPerOrder}/Order + ₹{config.fuelAllowancePerDay} Fuel
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Action and Filter Toolbar */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Bulk Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={downloadBankCSV}
            className="flex items-center px-5 py-2.5 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-md"
          >
            <Download size={14} className="mr-2" /> Download Bank File
          </button>
          <button
            onClick={handleBulkPay}
            disabled={selectedRiders.size === 0 || saving}
            className="flex items-center px-5 py-2.5 bg-green-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-md shadow-green-100 disabled:opacity-40"
          >
            <CheckCircle size={14} className="mr-2" /> Bulk Settle ({selectedRiders.size})
          </button>
        </div>

        {/* Right: Search and Status Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 outline-none cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <option value="ALL">🏢 All Hubs</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>
                📍 {wh.name}
              </option>
            ))}
          </select>

          <div className="flex bg-gray-100 p-1 rounded-2xl">
            {['ALL', 'PENDING', 'PAID'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === st ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Search rider name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold outline-none focus:border-primary w-56"
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-2xl shadow-green-100/20 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredPayoutSummary}
          loading={loading}
        />
        {filteredPayoutSummary.length === 0 && !loading && (
          <div className="py-20 text-center text-gray-400">
            <Package size={48} className="mx-auto mb-4 opacity-30" strokeWidth={1} />
            <p className="text-xs font-black uppercase tracking-widest">No deliveries or matching riders recorded in {monthName}</p>
            <p className="text-[10px] text-gray-400 mt-1">Check selected month or clear search filter.</p>
          </div>
        )}
      </div>

      {/* Configure Payout Policy Modal */}
      {isPolicyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30">
                  <Sliders size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-black tracking-tight uppercase">Configure Payout Policy</h2>
                  <p className="text-xs text-gray-300 font-medium">
                    Set company-wide delivery salary & commission rates
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPolicyModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-full transition-colors"
              >
                <XCircle size={22} />
              </button>
            </div>

            <form onSubmit={handleSavePolicy} className="p-6 space-y-5">
              <div className="space-y-4">
                {/* Base Salary */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                    1. Base Salary (Per Working Day in ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={policyForm.baseSalaryPerDay}
                    onChange={(e) => setPolicyForm({...policyForm, baseSalaryPerDay: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm text-gray-900 outline-none focus:border-primary"
                    placeholder="e.g. 300"
                  />
                  <p className="text-[9px] text-gray-400 ml-1">Rider jis din delivery karega us din ka basic attendance pay.</p>
                </div>

                {/* Commission Per Order */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                    2. Delivery Commission (Per Delivered Order in ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={policyForm.commissionPerOrder}
                    onChange={(e) => setPolicyForm({...policyForm, commissionPerOrder: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm text-gray-900 outline-none focus:border-primary"
                    placeholder="e.g. 20"
                  />
                  <p className="text-[9px] text-gray-400 ml-1">Har successfully delivered order par rider ko milne wala commission.</p>
                </div>

                {/* Fuel Allowance */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                    3. Fuel Allowance (Per Working Day in ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={policyForm.fuelAllowancePerDay}
                    onChange={(e) => setPolicyForm({...policyForm, fuelAllowancePerDay: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm text-gray-900 outline-none focus:border-primary"
                    placeholder="e.g. 50"
                  />
                  <p className="text-[9px] text-gray-400 ml-1">Daily petrol/fuel compensation.</p>
                </div>
              </div>

              {/* Live Preview / Simulation Card */}
              <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-100 space-y-1 text-xs">
                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block">Live Policy Preview:</span>
                <p className="font-bold text-blue-950">
                  Formula: ₹{policyForm.baseSalaryPerDay || 0} Base + ₹{policyForm.commissionPerOrder || 0}/Order + ₹{policyForm.fuelAllowancePerDay || 0} Fuel
                </p>
                <p className="text-[10px] text-blue-700 font-medium">
                  Example: 20 active days + 100 orders = ₹{((20 * Number(policyForm.baseSalaryPerDay || 0)) + (100 * Number(policyForm.commissionPerOrder || 0)) + (20 * Number(policyForm.fuelAllowancePerDay || 0))).toLocaleString('en-IN')} total payout.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="flex-1 py-3 text-xs font-black text-gray-500 uppercase tracking-wider hover:bg-gray-100 rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="flex-1 bg-primary text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-green-100 hover:bg-green-800 transition-all flex items-center justify-center gap-1.5"
                >
                  <Save size={14} />
                  {saving ? "SAVING..." : "SAVE POLICY"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Earnings Modal */}
      {isModalOpen && selectedRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight uppercase">Settle Rider Earnings</h2>
                <p className="text-xs text-gray-300 font-bold mt-0.5">
                  {riders[selectedRider.riderId]?.name || 'Rider'} • {monthName} {currentYear}
                </p>
              </div>
              <div className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-xl text-base font-black border border-green-500/30">
                ₹{selectedRider.totalEarnings.toLocaleString('en-IN')}
              </div>
            </div>

            <form onSubmit={handleMarkAsPaid} className="p-6 space-y-5">
              {/* Rider Bank Info Card */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <Building size={12} /> Rider Beneficiary Details:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[9px] uppercase font-bold">Bank A/C:</span>
                    <span className="font-mono font-bold text-gray-800">{riders[selectedRider.riderId]?.bankAccount || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[9px] uppercase font-bold">IFSC Code:</span>
                    <span className="font-mono font-bold text-gray-800">{riders[selectedRider.riderId]?.ifsc || 'Not set'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block text-[9px] uppercase font-bold">UPI ID:</span>
                    <span className="font-mono font-bold text-gray-800">{riders[selectedRider.riderId]?.upiId || (riders[selectedRider.riderId]?.phone ? `${riders[selectedRider.riderId]?.phone}@upi` : 'Not set')}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Method *</label>
                <select
                  value={payoutForm.method}
                  onChange={(e) => setPayoutForm({...payoutForm, method: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-xs text-gray-800 outline-none focus:border-primary"
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS / RTGS)</option>
                  <option value="CASH">Cash Settlement</option>
                  <option value="CHEQUE">Cheque Payment</option>
                </select>
              </div>

              {/* UTR / Transaction Reference */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">UTR No. / Transaction Ref *</label>
                <input
                  required
                  placeholder="e.g. UPI Ref 412345678901"
                  value={payoutForm.reference}
                  onChange={(e) => setPayoutForm({...payoutForm, reference: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-xs text-gray-800 outline-none focus:border-primary"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Internal Remarks</label>
                <input
                  placeholder="e.g. Settled for full month deliveries"
                  value={payoutForm.notes}
                  onChange={(e) => setPayoutForm({...payoutForm, notes: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-xs text-gray-800 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-xs font-black text-gray-500 uppercase tracking-wider hover:bg-gray-100 rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="flex-1 bg-primary text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-green-100 hover:bg-green-800 transition-all flex items-center justify-center gap-1.5"
                >
                  {saving ? "SAVING..." : "CONFIRM PAY"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rider Monthly Breakdown Detail Modal */}
      {isDetailModalOpen && detailRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-white/10 rounded-2xl flex items-center justify-center text-orange-400 font-black">
                  {(riders[detailRider.riderId]?.name || 'R').charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight uppercase">{riders[detailRider.riderId]?.name || 'Rider Partner'}</h2>
                  <p className="text-xs text-gray-300 font-medium">
                    Earnings Breakdown • {monthName} {currentYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-full transition-colors"
              >
                <XCircle size={22} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Earnings Components Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Base Salary</span>
                  <span className="text-lg font-black text-gray-900 mt-1 block">₹{detailRider.baseSalaryTotal}</span>
                  <span className="text-[9px] text-gray-400 font-medium">{detailRider.activeDays.size} days × ₹{config.baseSalaryPerDay}</span>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Order Commission</span>
                  <span className="text-lg font-black text-gray-900 mt-1 block">₹{detailRider.commissionTotal}</span>
                  <span className="text-[9px] text-gray-400 font-medium">{detailRider.orderCount} orders × ₹{config.commissionPerOrder}</span>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Fuel Allowance</span>
                  <span className="text-lg font-black text-gray-900 mt-1 block">₹{detailRider.fuelTotal}</span>
                  <span className="text-[9px] text-gray-400 font-medium">{detailRider.activeDays.size} days × ₹{config.fuelAllowancePerDay}</span>
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-green-700 uppercase tracking-widest block">Total Net Payable</span>
                  <span className="text-2xl font-black text-green-900 mt-0.5 block">₹{detailRider.totalEarnings.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  {detailRider.isPaid ? (
                    <div className="text-right">
                      <span className="px-3 py-1 bg-green-200 text-green-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                        ✓ Settled
                      </span>
                      <p className="text-[9px] text-green-700 font-mono mt-1">Ref: {detailRider.payoutLog?.referenceId || 'PAID'}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setIsDetailModalOpen(false); setSelectedRider(detailRider); setIsModalOpen(true); }}
                      className="px-4 py-2 bg-primary text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md"
                    >
                      Settle Now
                    </button>
                  )}
                </div>
              </div>

              {/* Deliveries List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-gray-700 tracking-wider">Completed Orders in this Cycle ({detailRider.deliveredOrders.length})</h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-100 rounded-2xl p-2 bg-gray-50/50">
                  {detailRider.deliveredOrders.map((o, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 text-xs">
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-gray-400" />
                        <span className="font-bold text-gray-800">Order #{o.orderNumber}</span>
                        <span className="text-[10px] text-gray-400">{o.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </div>
                      <span className="font-mono font-bold text-gray-700">₹{o.totalAmount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderPayouts;

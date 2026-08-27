import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Banknote, Calendar, ChevronLeft, ChevronRight, User, Package, TrendingUp, CheckCircle, Clock, Download } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import toast from 'react-hot-toast';

const RiderPayouts = () => {
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState({});
  const [config, setConfig] = useState({ baseSalaryPerDay: 300, commissionPerOrder: 20, fuelAllowancePerDay: 50 });
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    // 1. Fetch Config
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) setConfig(snap.data());
    });

    // 2. Listen to Riders
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snap) => {
      const map = {};
      snap.docs.forEach(d => map[d.id] = { id: d.id, ...d.data() });
      setRiders(map);
    });

    // 3. Listen to Orders for the selected month
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfMonth),
      where('createdAt', '<=', endOfMonth),
      where('status', '==', 'DELIVERED')
    );

    const unsubOrders = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => { unsubRiders(); unsubOrders(); };
  }, [currentMonth, currentYear]);

  const payoutSummary = useMemo(() => {
    const summary = new Map();

    orders.forEach(order => {
      if (!order.riderId) return;
      if (!summary.has(order.riderId)) {
        summary.set(order.riderId, {
          riderId: order.riderId,
          orderCount: 0,
          commissionTotal: 0,
          activeDays: new Set(),
          baseSalaryTotal: 0,
          fuelTotal: 0,
          totalEarnings: 0
        });
      }

      const stats = summary.get(order.riderId);
      stats.orderCount += 1;
      stats.commissionTotal += (config.commissionPerOrder || 20);

      const dateKey = order.createdAt?.toDate ? order.createdAt.toDate().toDateString() : new Date(order.createdAt).toDateString();
      stats.activeDays.add(dateKey);
    });

    // Calculate totals based on active days
    summary.forEach(stats => {
      const daysCount = stats.activeDays.size;
      stats.baseSalaryTotal = daysCount * (config.baseSalaryPerDay || 300);
      stats.fuelTotal = daysCount * (config.fuelAllowancePerDay || 50);
      stats.totalEarnings = stats.commissionTotal + stats.baseSalaryTotal + stats.fuelTotal;
    });

    return Array.from(summary.values());
  }, [orders, config]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [payoutForm, setPayoutForm] = useState({ method: 'UPI', reference: '' });
  const [saving, setSaving] = useState(false);

  const handleMarkAsPaid = async (e) => {
    e.preventDefault();
    if (!selectedRider) return;

    setSaving(true);
    const riderName = riders[selectedRider.riderId]?.name || 'Rider';

    try {
      // 1. Record in Payout Logs
      await addDoc(collection(db, 'payout_logs'), {
        riderId: selectedRider.riderId,
        riderName,
        amount: selectedRider.totalEarnings,
        method: payoutForm.method,
        referenceId: payoutForm.reference,
        month: currentMonth + 1,
        year: currentYear,
        ordersCount: selectedRider.orderCount,
        paidAt: Timestamp.now(),
        breakdown: {
          commission: selectedRider.commissionTotal,
          baseSalary: selectedRider.baseSalaryTotal,
          fuel: selectedRider.fuelTotal
        }
      });

      // 2. Add to General Ledger (Expense Entry)
      await addDoc(collection(db, 'ledger'), {
        account: 'RIDER_PAYMENT',
        type: 'DEBIT', // Money going out
        amount: selectedRider.totalEarnings,
        description: `Payout to ${riderName} for ${monthName} ${currentYear}`,
        referenceId: payoutForm.reference || selectedRider.riderId,
        timestamp: Timestamp.now()
      });

      toast.success(`₹${selectedRider.totalEarnings} paid to ${riderName} via ${payoutForm.method}`);
      setIsModalOpen(false);
      setPayoutForm({ method: 'UPI', reference: '' });
    } catch (e) {
      toast.error("Failed to record payout");
    } finally {
      setSaving(false);
    }
  };

  const [selectedRiders, setSelectedRiders] = useState(new Set());

  const downloadBankCSV = () => {
    if (payoutSummary.length === 0) return toast.error("No data to export");

    // Header for Bank Portal (Standard Format)
    let csv = "Beneficiary Name,Account Number,IFSC Code,Amount,Remarks\n";

    payoutSummary.forEach(s => {
      const r = riders[s.riderId];
      csv += `"${r?.name || 'Rider'}","${r?.bankAccount || ''}","${r?.ifsc || ''}",${s.totalEarnings},"Payout ${monthName}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KrishiVishal_Payouts_${monthName}_${currentYear}.csv`;
    a.click();
    toast.success("Bank Transfer File Downloaded!");
  };

  const handleBulkPay = async () => {
    if (selectedRiders.size === 0) return toast.error("Please select riders first");
    const batchId = prompt("Enter Bulk Transaction/Batch ID (Optional):");
    if (batchId === null) return;

    setSaving(true);
    try {
      const selectedData = payoutSummary.filter(s => selectedRiders.has(s.riderId));

      for (const s of selectedData) {
        const riderName = riders[s.riderId]?.name || 'Rider';
        // Record log
        await addDoc(collection(db, 'payout_logs'), {
          riderId: s.riderId,
          riderName,
          amount: s.totalEarnings,
          method: 'BULK_BANK_TRANSFER',
          referenceId: batchId || 'BATCH_PAY',
          month: currentMonth + 1,
          year: currentYear,
          paidAt: Timestamp.now()
        });

        // Record Ledger
        await addDoc(collection(db, 'ledger'), {
          account: 'RIDER_PAYMENT',
          type: 'DEBIT',
          amount: s.totalEarnings,
          description: `Bulk Payout to ${riderName}`,
          referenceId: batchId || 'BATCH_PAY',
          timestamp: Timestamp.now()
        });
      }

      toast.success(`${selectedRiders.size} Riders marked as PAID!`);
      setSelectedRiders(new Set());
    } catch (e) {
      toast.error("Bulk update failed");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
          onChange={(e) => {
            if (e.target.checked) setSelectedRiders(new Set(payoutSummary.map(s => s.riderId)));
            else setSelectedRiders(new Set());
          }}
        />
      ),
      render: (s) => (
        <input
          type="checkbox"
          checked={selectedRiders.has(s.riderId)}
          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
          onChange={() => {
            const next = new Set(selectedRiders);
            if (next.has(s.riderId)) next.delete(s.riderId);
            else next.add(s.riderId);
            setSelectedRiders(next);
          }}
        />
      )
    },
    { header: 'Rider', render: (s) => (
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center font-black">
          {(riders[s.riderId]?.name || 'R').charAt(0)}
        </div>
        <div className="flex flex-col">
          <span className="font-black text-gray-900 leading-none mb-1">{riders[s.riderId]?.name || 'Unknown'}</span>
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{s.activeDays.size} Days Active</span>
        </div>
      </div>
    )},
    { header: 'Deliveries', render: (s) => (
      <div className="flex items-center space-x-2">
        <span className="font-bold text-gray-700">{s.orderCount}</span>
      </div>
    )},
    { header: 'Earnings', render: (s) => (
      <div className="bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 w-fit">
        <span className="text-green-700 font-black tracking-tight">₹{s.totalEarnings}</span>
      </div>
    )},
    { header: 'Action', render: (s) => (
      <button
        onClick={() => { setSelectedRider(s); setIsModalOpen(true); }}
        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
      >
        Manual Pay
      </button>
    )}
  ];

  const changeMonth = (offset) => {
    let nextMonth = currentMonth + offset;
    let nextYear = currentYear;
    if (nextMonth < 0) { nextMonth = 11; nextYear--; }
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  };

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Banknote className="mr-3 text-primary" size={28} />
            Rider Payout Dashboard
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Commission & Salary Settlement</p>
        </div>

        <div className="flex items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm space-x-4">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400"><ChevronLeft size={20}/></button>
          <div className="flex flex-col items-center min-w-[120px]">
            <span className="text-xs font-black uppercase text-primary tracking-tighter">{monthName}</span>
            <span className="text-[10px] font-bold text-gray-400">{currentYear}</span>
          </div>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400"><ChevronRight size={20}/></button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
         <div className="flex items-center space-x-4">
            <button
              onClick={downloadBankCSV}
              className="flex items-center px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl"
            >
               <Download size={14} className="mr-2" /> Download Bank File
            </button>
            <button
              onClick={handleBulkPay}
              disabled={selectedRiders.size === 0}
              className="flex items-center px-6 py-3 bg-green-50 text-green-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition-all disabled:opacity-30"
            >
               <CheckCircle size={14} className="mr-2" /> Bulk Settle ({selectedRiders.size})
            </button>
         </div>
         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic mr-4">
            Select riders to perform bulk actions
         </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-primary p-8 rounded-[3rem] text-white shadow-2xl shadow-green-200 flex flex-col justify-between">
           <div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-200 mb-2">Total Payout Volume</p>
             <p className="text-4xl font-black tracking-tighter">
                {formatCurrency(payoutSummary.reduce((sum, s) => sum + s.totalEarnings, 0))}
             </p>
           </div>
           <div className="flex justify-between items-end mt-10">
              <div className="space-y-1">
                <p className="text-[8px] font-bold uppercase tracking-widest text-green-100 opacity-60">Total Orders</p>
                <p className="text-lg font-black">{orders.length}</p>
              </div>
              <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp size={24} />
              </div>
           </div>
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm flex items-center justify-center text-center">
            <div className="space-y-4 max-w-sm">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit mx-auto shadow-inner"><Clock size={24} /></div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-relaxed">Current Payout Policy</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] leading-loose italic">
                   ₹{config.baseSalaryPerDay} Daily Base + ₹{config.commissionPerOrder} Per Delivery + ₹{config.fuelAllowancePerDay} Fuel Allowance.
                   <br/>Update these values in <span className="text-primary font-black">System Settings</span>.
                </p>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-2xl shadow-green-100/20 overflow-hidden">
        <DataTable
          columns={columns}
          data={payoutSummary}
          loading={loading}
        />
        {payoutSummary.length === 0 && !loading && (
          <div className="py-20 text-center text-gray-300">
            <Package size={48} className="mx-auto mb-4 opacity-20" strokeWidth={1} />
            <p className="text-xs font-black uppercase tracking-widest italic">No deliveries recorded in {monthName}</p>
          </div>
        )}
      </div>

      {/* Payout Settlement Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                <div>
                   <h2 className="text-xl font-black text-gray-900 tracking-tight">SETTLE EARNINGS</h2>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{riders[selectedRider?.riderId]?.name}</p>
                </div>
                <div className="h-12 w-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 font-black">
                   ₹{selectedRider?.totalEarnings}
                </div>
             </div>

             <form onSubmit={handleMarkAsPaid} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Method</label>
                   <select
                     value={payoutForm.method}
                     onChange={(e) => setPayoutForm({...payoutForm, method: e.target.value})}
                     className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-gray-800 outline-none focus:border-primary transition-all"
                   >
                      <option value="UPI">UPI (Google Pay/PhonePe)</option>
                      <option value="BANK_TRANSFER">Bank Transfer (IMPS/NEFT)</option>
                      <option value="CASH">Cash Payment</option>
                   </select>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reference / Trans ID</label>
                   <input
                     placeholder="UTR No. or Ref ID"
                     value={payoutForm.reference}
                     onChange={(e) => setPayoutForm({...payoutForm, reference: e.target.value})}
                     className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-gray-800 outline-none focus:border-primary transition-all"
                   />
                </div>

                <div className="flex gap-4 pt-4">
                   <button
                     type="button"
                     onClick={() => setIsModalOpen(false)}
                     className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 rounded-2xl transition-colors"
                   >
                     Cancel
                   </button>
                   <button
                     disabled={saving}
                     className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-green-800 active:scale-95 transition-all flex items-center justify-center"
                   >
                     {saving ? "SAVING..." : "CONFIRM PAY"}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderPayouts;

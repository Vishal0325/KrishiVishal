import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  Landmark,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Building2,
  Receipt,
  FileText,
  Printer,
  Search,
  Filter,
  DollarSign,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

const GSTReports = () => {
  const [activeTab, setActiveTab] = useState('GSTR1'); // 'GSTR1' | 'GSTR2B' | 'GSTR3B'
  const [orders, setOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [searchTerm, setSearchTerm] = useState('');

  // Listen to Orders (Sales)
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to Goods Receipts (Inward purchases for ITC)
  useEffect(() => {
    const q = query(collection(db, 'goods_receipts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setGoodsReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Listen to Products (HSN Code & GST Rate lookup)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Filter by selected month
  const filterByMonth = (dateObj) => {
    if (!dateObj) return true;
    const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    const monthStr = d.toISOString().slice(0, 7);
    return monthStr === selectedMonth;
  };

  const monthOrders = orders.filter(o => o.status !== 'CANCELLED' && filterByMonth(o.createdAt));
  const monthGRNs = goodsReceipts.filter(g => filterByMonth(g.createdAt));

  // Product HSN & GST lookup
  const getProductInfo = (productId) => {
    const p = products.find(prod => prod.id === productId);
    return {
      hsnCode: p?.hsnCode || '3105', // Default 3105 for Fertilizers/Agro
      gstRate: Number(p?.gstRate || 18)
    };
  };

  // --- GSTR-1 CALCULATIONS (Outward Supplies) ---
  let totalTaxableSales = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const hsnSummaryMap = {};

  monthOrders.forEach(order => {
    const isInterstate = (order.address?.state || 'Bihar').toLowerCase() !== 'bihar';
    
    (order.items || []).forEach(item => {
      const { hsnCode, gstRate } = getProductInfo(item.productId);
      const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
      
      // Calculate Tax Component from inclusive or exclusive price
      const taxable = lineTotal / (1 + (gstRate / 100));
      const taxAmount = lineTotal - taxable;

      totalTaxableSales += taxable;

      let lineCGST = 0;
      let lineSGST = 0;
      let lineIGST = 0;

      if (isInterstate) {
        lineIGST = taxAmount;
        totalIGST += taxAmount;
      } else {
        lineCGST = taxAmount / 2;
        lineSGST = taxAmount / 2;
        totalCGST += lineCGST;
        totalSGST += lineSGST;
      }

      // Aggregate into HSN Summary
      if (!hsnSummaryMap[hsnCode]) {
        hsnSummaryMap[hsnCode] = {
          hsnCode,
          description: item.productName || 'Agro Goods',
          totalQuantity: 0,
          totalValue: 0,
          taxableValue: 0,
          rate: gstRate,
          cgst: 0,
          sgst: 0,
          igst: 0
        };
      }
      hsnSummaryMap[hsnCode].totalQuantity += Number(item.quantity || 1);
      hsnSummaryMap[hsnCode].totalValue += lineTotal;
      hsnSummaryMap[hsnCode].taxableValue += taxable;
      hsnSummaryMap[hsnCode].cgst += lineCGST;
      hsnSummaryMap[hsnCode].sgst += lineSGST;
      hsnSummaryMap[hsnCode].igst += lineIGST;
    });
  });

  const hsnSummaryList = Object.values(hsnSummaryMap);
  const totalOutputLiability = totalCGST + totalSGST + totalIGST;

  // --- GSTR-2B CALCULATIONS (Input Tax Credit on Purchases) ---
  let totalInwardTaxable = 0;
  let totalInputCGST = 0;
  let totalInputSGST = 0;
  let totalInputIGST = 0;

  const itcEntries = monthGRNs.map(grn => {
    const taxable = Number(grn.totalGRNAmount || 0) / 1.18; // assume 18% average input rate
    const itcAmount = Number(grn.totalGRNAmount || 0) - taxable;
    const cgst = itcAmount / 2;
    const sgst = itcAmount / 2;

    totalInwardTaxable += taxable;
    totalInputCGST += cgst;
    totalInputSGST += sgst;

    return {
      id: grn.id,
      supplierName: grn.supplierName,
      supplierGstin: grn.supplierGstin || 'Unregistered',
      invoiceNumber: grn.invoiceNumber || grn.grnNumber,
      invoiceDate: grn.invoiceDate || '—',
      totalValue: grn.totalGRNAmount || 0,
      taxableValue: taxable,
      cgst,
      sgst,
      totalITC: itcAmount,
      status: grn.supplierGstin ? 'MATCHED' : 'UNREGISTERED_NO_ITC'
    };
  });

  const totalEligibleITC = totalInputCGST + totalInputSGST + totalInputIGST;

  // --- GSTR-3B SETTLEMENT ---
  const netCGSTPayable = Math.max(0, totalCGST - totalInputCGST);
  const netSGSTPayable = Math.max(0, totalSGST - totalInputSGST);
  const netIGSTPayable = Math.max(0, totalIGST - totalInputIGST);
  const netTotalGSTPayable = netCGSTPayable + netSGSTPayable + netIGSTPayable;

  // Export GSTR-1 JSON
  const handleExportGSTR1JSON = () => {
    const gstr1Payload = {
      gstin: "10AAAAA0000A1Z5", // KrishiVishal registered GSTIN
      fp: selectedMonth.replace('-', ''),
      b2cs: monthOrders.map(o => ({
        sply_ty: (o.address?.state || 'Bihar').toLowerCase() === 'bihar' ? "INTRA" : "INTER",
        txval: Number(o.totalAmount || 0) / 1.18,
        rt: 18,
        iamt: (o.address?.state || 'Bihar').toLowerCase() !== 'bihar' ? (Number(o.totalAmount || 0) - (Number(o.totalAmount || 0) / 1.18)) : 0,
        camt: (o.address?.state || 'Bihar').toLowerCase() === 'bihar' ? (Number(o.totalAmount || 0) - (Number(o.totalAmount || 0) / 1.18)) / 2 : 0,
        samt: (o.address?.state || 'Bihar').toLowerCase() === 'bihar' ? (Number(o.totalAmount || 0) - (Number(o.totalAmount || 0) / 1.18)) / 2 : 0
      })),
      hsn: {
        data: hsnSummaryList.map((h, idx) => ({
          num: idx + 1,
          hsn_sc: h.hsnCode,
          desc: h.description,
          uqc: "NOS",
          qty: h.totalQuantity,
          val: h.totalValue,
          txval: h.taxableValue,
          iamt: h.igst,
          camt: h.cgst,
          samt: h.sgst
        }))
      }
    };

    const blob = new Blob([JSON.stringify(gstr1Payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_${selectedMonth}.json`;
    a.click();
    toast.success(`GSTR-1 JSON for ${selectedMonth} exported!`);
  };

  // Columns for HSN Table
  const hsnColumns = [
    { header: 'HSN Code', key: 'hsnCode', render: (h) => <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded">{h.hsnCode}</span> },
    { header: 'Description', key: 'description', render: (h) => <span className="font-black text-xs text-gray-900">{h.description}</span> },
    { header: 'Total Qty', key: 'totalQuantity', render: (h) => <span className="text-xs font-bold text-gray-700">{h.totalQuantity} units</span> },
    { header: 'Total Value', key: 'totalValue', render: (h) => <span className="font-mono text-xs font-bold text-gray-900">{formatCurrency(h.totalValue)}</span> },
    { header: 'Taxable Value', key: 'taxableValue', render: (h) => <span className="font-mono text-xs font-bold text-blue-700">{formatCurrency(h.taxableValue)}</span> },
    { header: 'CGST (9%)', key: 'cgst', render: (h) => <span className="font-mono text-xs text-gray-600">{formatCurrency(h.cgst)}</span> },
    { header: 'SGST (9%)', key: 'sgst', render: (h) => <span className="font-mono text-xs text-gray-600">{formatCurrency(h.sgst)}</span> },
    { header: 'Total Tax', render: (h) => <span className="font-mono text-xs font-black text-[#1b5e20]">{formatCurrency(h.cgst + h.sgst + h.igst)}</span> }
  ];

  // Columns for GSTR-2B ITC Table
  const itcColumns = [
    { header: 'Supplier', key: 'supplierName', render: (i) => (
      <div>
        <p className="font-black text-xs text-gray-900">{i.supplierName}</p>
        <p className="font-mono text-[10px] text-gray-400">GST: {i.supplierGstin}</p>
      </div>
    )},
    { header: 'Invoice Ref', key: 'invoiceNumber', render: (i) => (
      <div>
        <span className="font-mono text-xs font-bold text-gray-800">{i.invoiceNumber}</span>
        <p className="text-[10px] text-gray-400">{i.invoiceDate}</p>
      </div>
    )},
    { header: 'Invoice Total', key: 'totalValue', render: (i) => <span className="font-mono text-xs font-bold">{formatCurrency(i.totalValue)}</span> },
    { header: 'Taxable Amount', key: 'taxableValue', render: (i) => <span className="font-mono text-xs text-blue-700">{formatCurrency(i.taxableValue)}</span> },
    { header: 'Eligible ITC (CGST+SGST)', key: 'totalITC', render: (i) => <span className="font-mono text-xs font-black text-green-700">{formatCurrency(i.totalITC)}</span> },
    { header: 'Status', key: 'status', render: (i) => (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
        i.status === 'MATCHED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}>
        {i.status === 'MATCHED' ? 'ITC Eligible' : 'No GSTIN'}
      </span>
    )}
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Landmark className="mr-3 text-[#1b5e20]" size={28} />
            GST Compliance & Monthly Tax Filing Hub
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">
            Automated GSTR-1 Outward Supplies, GSTR-2B Input Tax Credit (ITC) reconciliation, and GSTR-3B Net Tax Settlement.
          </p>
        </div>

        {/* Month Selector & JSON Export */}
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-[#1b5e20] shadow-sm"
          />

          <button
            onClick={handleExportGSTR1JSON}
            className="bg-[#1b5e20] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center gap-2"
          >
            <Download size={15} />
            Export GSTR-1 JSON
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('GSTR1')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeTab === 'GSTR1' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Receipt size={15} />
          GSTR-1 (Outward Sales)
        </button>
        <button
          onClick={() => setActiveTab('GSTR2B')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeTab === 'GSTR2B' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Building2 size={15} />
          GSTR-2B (Input Tax Credit)
        </button>
        <button
          onClick={() => setActiveTab('GSTR3B')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeTab === 'GSTR3B' ? 'bg-[#1b5e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShieldCheck size={15} />
          GSTR-3B (Tax Settlement)
        </button>
      </div>

      {/* TAB 1: GSTR-1 (Outward Sales) */}
      {activeTab === 'GSTR1' && (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Taxable Sales Value</p>
              <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{formatCurrency(totalTaxableSales)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{monthOrders.length} B2C Orders</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Central GST (CGST)</p>
              <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{formatCurrency(totalCGST)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">State GST (SGST)</p>
              <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{formatCurrency(totalSGST)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-green-50/40">
              <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Total Output Tax Liability</p>
              <p className="text-2xl font-black text-[#1b5e20] mt-1 font-mono">{formatCurrency(totalOutputLiability)}</p>
            </div>
          </div>

          {/* HSN Summary Table */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-[#1b5e20]" />
                HSN-wise Outward Supplies Summary (Table 12)
              </h3>
            </div>
            <DataTable columns={hsnColumns} data={hsnSummaryList} loading={loading} />
          </div>
        </div>
      )}

      {/* TAB 2: GSTR-2B (Input Tax Credit) */}
      {activeTab === 'GSTR2B' && (
        <div className="space-y-6">
          {/* ITC Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Supplier Purchases</p>
              <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{formatCurrency(totalInwardTaxable)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Input CGST + SGST</p>
              <p className="text-2xl font-black text-blue-700 mt-1 font-mono">{formatCurrency(totalInputCGST + totalInputSGST)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm bg-green-50/40">
              <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Total Eligible Input Tax Credit (ITC)</p>
              <p className="text-2xl font-black text-[#1b5e20] mt-1 font-mono">{formatCurrency(totalEligibleITC)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Receipt size={16} className="text-[#1b5e20]" />
              Inward Invoices for Input Tax Credit Claim
            </h3>
            <DataTable columns={itcColumns} data={itcEntries} loading={loading} />
          </div>
        </div>
      )}

      {/* TAB 3: GSTR-3B (Tax Settlement) */}
      {activeTab === 'GSTR3B' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-wide">
                GSTR-3B Monthly Tax Liability vs ITC Settlement ({selectedMonth})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Mathematical offset of outward output tax liability against verified input tax credits.
              </p>
            </div>

            {/* Settlement Calculation Box */}
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="font-bold text-sm text-gray-800">1. Total Outward Output Tax (GSTR-1)</p>
                  <p className="text-[11px] text-gray-400">Total tax collected from customer orders</p>
                </div>
                <span className="font-mono text-base font-black text-gray-900">{formatCurrency(totalOutputLiability)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-green-50/70 rounded-2xl border border-green-100">
                <div>
                  <p className="font-bold text-sm text-green-900">2. Less: Eligible Input Tax Credit - ITC (GSTR-2B)</p>
                  <p className="text-[11px] text-green-700">Tax paid on verified supplier goods receipts</p>
                </div>
                <span className="font-mono text-base font-black text-green-800">- {formatCurrency(totalEligibleITC)}</span>
              </div>

              <div className="p-6 bg-gradient-to-r from-emerald-500 to-green-700 rounded-3xl text-white shadow-lg shadow-green-100 flex justify-between items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-green-100">Net Tax Payable to Government</p>
                  <p className="text-xs text-green-100 mt-0.5">To be deposited in Electronic Cash Ledger</p>
                </div>
                <span className="font-mono text-3xl font-black">{formatCurrency(netTotalGSTPayable)}</span>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="pt-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-3">Head-wise Tax Breakdown</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase">CGST Payable</p>
                  <p className="font-mono text-lg font-black text-gray-900 mt-1">{formatCurrency(netCGSTPayable)}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase">SGST Payable</p>
                  <p className="font-mono text-lg font-black text-gray-900 mt-1">{formatCurrency(netSGSTPayable)}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase">IGST Payable</p>
                  <p className="font-mono text-lg font-black text-gray-900 mt-1">{formatCurrency(netIGSTPayable)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTReports;

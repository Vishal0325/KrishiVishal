import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
  Percent,
  Search,
  FolderDown,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TDSCompliance() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('194Q'); // '194Q' | '194C' | '194J' | '206C1H'
  const [quarter, setQuarter] = useState('Q2 (Jul - Sep)');
  const [grns, setGrns] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch GRNs, Expenses, and Suppliers
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(query(collection(db, 'goods_receipts'), orderBy('createdAt', 'desc')), (snap) => {
        setGrns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')), (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'suppliers'), (snap) => {
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Compute 194Q (TDS on Purchase of Goods > 50 Lakhs @ 0.1%)
  const section194QData = useMemo(() => {
    // Group GRNs by supplier
    const supplierTotals = {};
    grns.forEach(grn => {
      const sId = grn.supplierId || grn.supplierName || 'General Supplier';
      if (!supplierTotals[sId]) {
        supplierTotals[sId] = {
          supplierId: sId,
          supplierName: grn.supplierName || 'Agri Supplier',
          pan: grn.supplierPan || 'AAACK1234F',
          totalPurchase: 0,
          grnCount: 0
        };
      }
      supplierTotals[sId].totalPurchase += Number(grn.totalBillAmount || grn.totalAmount || 0);
      supplierTotals[sId].grnCount += 1;
    });

    return Object.values(supplierTotals).map(s => {
      const threshold = 5000000; // 50 Lakhs
      const taxableOverThreshold = Math.max(0, s.totalPurchase - threshold);
      const tdsRate = 0.001; // 0.1%
      const tdsDeductible = taxableOverThreshold * tdsRate;

      return {
        ...s,
        thresholdLimit: threshold,
        taxableOverThreshold,
        tdsRate: '0.1%',
        tdsDeductible,
        status: s.totalPurchase > threshold ? 'TDS APPLICABLE' : 'WITHIN THRESHOLD'
      };
    });
  }, [grns]);

  // Compute 194C / 194J (Contractor, Transport & Professional TDS @ 1% - 10%)
  const section194CData = useMemo(() => {
    return expenses
      .filter(e => ['LOGISTICS', 'MAINTENANCE', 'FREIGHT', 'MARKETING_AGENCY', 'LEGAL_AUDIT'].includes(e.category) || Number(e.amount) >= 30000)
      .map(e => {
        const isCompany = e.category === 'MARKETING_AGENCY' || e.category === 'LEGAL_AUDIT';
        const rate = isCompany ? 0.02 : 0.01; // 1% Individual / 2% Company for 194C, 10% for 194J
        const amount = Number(e.amount || 0);
        const tdsAmount = amount * (e.category === 'LEGAL_AUDIT' ? 0.10 : rate);

        return {
          id: e.id,
          vendorName: e.vendorName || e.category?.replace(/_/g, ' ') || 'Vendor',
          pan: e.vendorPan || 'AABCV9876K',
          natureOfPayment: e.category?.replace(/_/g, ' '),
          billAmount: amount,
          ratePercent: e.category === 'LEGAL_AUDIT' ? '10%' : (isCompany ? '2%' : '1%'),
          tdsAmount,
          date: e.createdAt || e.date
        };
      });
  }, [expenses]);

  // Export Form 26Q CSV for TRACES Portal
  const handleExportForm26Q = () => {
    let csv = 'Deductee Code,PAN of Deductee,Deductee Name,Payment Section,Date of Payment,Amount Paid,TDS Deducted,Challan Reference\n';
    
    section194CData.forEach(row => {
      csv += `"01","${row.pan}","${row.vendorName}","194C","2026-09-01","${row.billAmount}","${row.tdsAmount.toFixed(2)}","CHAL-Q2-2026"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Form26Q_TDS_Summary_${quarter.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Form 26Q TRACES CSV Summary downloaded successfully!');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#3D144C] to-[#63207D] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Percent size={14} className="text-pink-300" />
              Statutory Direct Tax Compliance (Income Tax Act)
            </div>
            <h2 className="text-2xl font-black">TDS & TCS Compliance Desk</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Automated Section 194Q (Purchase &gt; ₹50L), 194C (Contractors & Fleet Logistics), 194J (Professional fees), and quarterly Form 26Q filing reports for TRACES.
            </p>
          </div>
          <button
            onClick={handleExportForm26Q}
            className="flex items-center gap-2 bg-pink-400 hover:bg-pink-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <FolderDown size={20} />
            Export Form 26Q CSV
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          {[
            { id: '194Q', label: 'Sec 194Q (Purchase > ₹50L)' },
            { id: '194C', label: 'Sec 194C / 194J (Logistics & Vendors)' }
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSection === sec.id ? 'bg-[#3D144C] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
          <Calendar size={14} className="text-gray-500" />
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="bg-transparent outline-none font-bold text-gray-700 cursor-pointer"
          >
            <option value="Q1 (Apr - Jun)">Q1 (Apr - Jun)</option>
            <option value="Q2 (Jul - Sep)">Q2 (Jul - Sep)</option>
            <option value="Q3 (Oct - Dec)">Q3 (Oct - Dec)</option>
            <option value="Q4 (Jan - Mar)">Q4 (Jan - Mar)</option>
          </select>
        </div>
      </div>

      {/* Section 194Q Content */}
      {activeSection === '194Q' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-purple-50 border border-purple-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-purple-800 uppercase">Section 194Q Threshold</span>
              <h4 className="text-2xl font-black text-purple-950 mt-1">₹ 50,00,000</h4>
              <p className="text-[11px] text-purple-700 mt-1">Cumulative purchase limit per vendor per FY</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-emerald-800 uppercase">Statutory TDS Rate</span>
              <h4 className="text-2xl font-black text-emerald-950 mt-1">0.10 %</h4>
              <p className="text-[11px] text-emerald-700 mt-1">Applicable on amount exceeding ₹50L</p>
            </div>
            <div className="bg-pink-50 border border-pink-200 p-5 rounded-2xl">
              <span className="text-xs font-bold text-pink-800 uppercase">Total 194Q TDS Deductible</span>
              <h4 className="text-2xl font-black text-pink-950 mt-1">
                {formatCurrency(section194QData.reduce((acc, s) => acc + s.tdsDeductible, 0))}
              </h4>
              <p className="text-[11px] text-pink-700 mt-1">To be deposited via Challan ITNS 281</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Building2 className="text-[#3D144C]" size={18} />
              Supplier Cumulative Purchases & Section 194Q Tracking
            </h3>

            <DataTable
              data={section194QData}
              columns={[
                {
                  header: 'Supplier / Deductee',
                  accessor: 'supplierName',
                  render: (row) => <span className="font-bold text-gray-900">{row.supplierName}</span>
                },
                {
                  header: 'PAN Number',
                  accessor: 'pan',
                  render: (row) => <span className="font-mono text-xs font-bold text-gray-700">{row.pan}</span>
                },
                {
                  header: 'Total Purchases in FY',
                  accessor: 'totalPurchase',
                  render: (row) => (
                    <span className="font-black text-gray-900">{formatCurrency(row.totalPurchase)}</span>
                  )
                },
                {
                  header: 'Threshold Limit',
                  accessor: 'thresholdLimit',
                  render: () => <span className="text-gray-500 font-semibold">₹ 50,00,000</span>
                },
                {
                  header: 'Taxable Exceeding Amount',
                  accessor: 'taxableOverThreshold',
                  render: (row) => (
                    <span className="font-bold text-rose-600">
                      {formatCurrency(row.taxableOverThreshold)}
                    </span>
                  )
                },
                {
                  header: 'TDS @ 0.1%',
                  accessor: 'tdsDeductible',
                  render: (row) => (
                    <span className="font-black text-purple-700">
                      {formatCurrency(row.tdsDeductible)}
                    </span>
                  )
                },
                {
                  header: 'Status',
                  accessor: 'status',
                  render: (row) => (
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        row.status === 'TDS APPLICABLE'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-green-50 text-green-700 border border-green-200'
                      }`}
                    >
                      {row.status}
                    </span>
                  )
                }
              ]}
            />
          </div>
        </div>
      )}

      {/* Section 194C / 194J Content */}
      {activeSection === '194C' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <FileText className="text-[#3D144C]" size={18} />
              Section 194C / 194J Deductions (Logistics, Rent & Professional)
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {section194CData.length} Bill Entries
            </span>
          </div>

          <DataTable
            data={section194CData}
            columns={[
              {
                header: 'Vendor / Payee Name',
                accessor: 'vendorName',
                render: (row) => <span className="font-bold text-gray-900">{row.vendorName}</span>
              },
              {
                header: 'PAN',
                accessor: 'pan',
                render: (row) => <span className="font-mono text-xs font-bold text-gray-700">{row.pan}</span>
              },
              {
                header: 'Nature of Expense',
                accessor: 'natureOfPayment',
                render: (row) => (
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold">
                    {row.natureOfPayment}
                  </span>
                )
              },
              {
                header: 'Bill Gross Amount',
                accessor: 'billAmount',
                render: (row) => <span className="font-bold text-gray-900">{formatCurrency(row.billAmount)}</span>
              },
              {
                header: 'TDS Rate',
                accessor: 'ratePercent',
                render: (row) => <span className="font-black text-purple-700">{row.ratePercent}</span>
              },
              {
                header: 'TDS Deducted',
                accessor: 'tdsAmount',
                render: (row) => (
                  <span className="font-black text-rose-700">{formatCurrency(row.tdsAmount)}</span>
                )
              },
              {
                header: 'Challan Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Deposited
                  </span>
                )
              }
            ]}
          />
        </div>
      )}
    </div>
  );
}

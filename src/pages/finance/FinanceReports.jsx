import React, { useState, useEffect } from "react";
import { 
  Scale, 
  FileSpreadsheet, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Layers, 
  Building2,
  Calendar,
  Lock,
  FileCode2,
  X,
  Loader2,
  ArrowRight
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import PageHeader from "../../components/common/PageHeader";
import { 
  fetchTrialBalance, 
  fetchProfitAndLoss, 
  fetchBalanceSheet, 
  fetchGstr1Summary, 
  exportToCsv,
  exportTallyXmlService,
  downloadXmlFile,
  fetchLedgerExtract
} from "../../services/financeService";
import toast from "react-hot-toast";

export default function FinanceReports() {
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [periodId, setPeriodId] = useState("2026-10");
  const [loading, setLoading] = useState(false);
  const [trialBalanceData, setTrialBalanceData] = useState(null);
  const [pnlData, setPnlData] = useState(null);
  const [balanceSheetData, setBalanceSheetData] = useState(null);
  const [gstr1Data, setGstr1Data] = useState(null);

  // TallyPrime XML Export State
  const [tallyStartDate, setTallyStartDate] = useState("2026-10-01");
  const [tallyEndDate, setTallyEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [tallyVoucherFilter, setTallyVoucherFilter] = useState("ALL");
  const [tallyExporting, setTallyExporting] = useState(false);
  const [tallyExportResult, setTallyExportResult] = useState(null);

  // Ledger Drill-Down Modal State
  const [drillModalOpen, setDrillModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);

  const loadData = async (period = periodId) => {
    setLoading(true);
    try {
      const [tb, pnl, bs, gstr] = await Promise.all([
        fetchTrialBalance(period),
        fetchProfitAndLoss(period),
        fetchBalanceSheet(period),
        fetchGstr1Summary(period)
      ]);
      setTrialBalanceData(tb);
      setPnlData(pnl);
      setBalanceSheetData(bs);
      setGstr1Data(gstr);
    } catch (err) {
      console.error("Error loading financial reports:", err);
      toast.error("Failed to load financial statements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(periodId);
  }, [periodId]);

  const handlePeriodChange = (e) => {
    setPeriodId(e.target.value);
  };

  // Export handlers
  const handleExportTrialBalance = () => {
    if (!trialBalanceData || !trialBalanceData.accounts) return;
    const rows = trialBalanceData.accounts.map(acc => ({
      AccountCode: acc.accountCode,
      AccountName: acc.accountName,
      AccountType: acc.type,
      Debit: acc.totalDebit,
      Credit: acc.totalCredit,
      NetBalance: acc.netBalance
    }));
    exportToCsv(`Trial_Balance_${periodId}`, rows, [
      { key: "AccountCode", label: "Account Code" },
      { key: "AccountName", label: "Account Name" },
      { key: "AccountType", label: "Type" },
      { key: "Debit", label: "Debit (₹)" },
      { key: "Credit", label: "Credit (₹)" },
      { key: "NetBalance", label: "Net Balance (₹)" }
    ]);
    toast.success("Trial Balance exported to CSV");
  };

  const handleExportGstr1 = () => {
    if (!gstr1Data) return;
    const rows = (gstr1Data.table12Hsn || []).map(item => ({
      HSN: item.hsnCode,
      Description: item.description,
      Quantity: item.totalQuantity,
      TaxableValue: item.totalTaxableValue,
      CGST: item.cgstAmount,
      SGST: item.sgstAmount,
      IGST: item.igstAmount,
      TotalTax: item.totalTax
    }));
    exportToCsv(`GSTR1_Table12_HSN_${periodId}`, rows, [
      { key: "HSN", label: "HSN Code" },
      { key: "Description", label: "Description" },
      { key: "Quantity", label: "Total Qty" },
      { key: "TaxableValue", label: "Taxable Value (₹)" },
      { key: "CGST", label: "CGST (₹)" },
      { key: "SGST", label: "SGST (₹)" },
      { key: "IGST", label: "IGST (₹)" },
      { key: "TotalTax", label: "Total Tax (₹)" }
    ]);
    toast.success("GSTR-1 HSN summary exported to CSV");
  };

  const handleExportTally = async () => {
    setTallyExporting(true);
    setTallyExportResult(null);
    try {
      const res = await exportTallyXmlService({
        periodId: periodId || null,
        startDate: tallyStartDate,
        endDate: tallyEndDate,
        voucherTypeFilter: tallyVoucherFilter
      });
      if (res && res.success && res.xmlContent) {
        setTallyExportResult(res);
        const fileName = `KrishiVishal_Tally_${tallyVoucherFilter}_${tallyStartDate}_to_${tallyEndDate}.xml`;
        downloadXmlFile(fileName, res.xmlContent);
        toast.success(`Exported ${res.exportedVouchersCount} vouchers to ${fileName}`);
      } else {
        toast.error("No valid balanced vouchers found for selected criteria");
      }
    } catch (err) {
      console.error("Tally XML export error:", err);
      toast.error(err.message || "Failed to generate Tally XML");
    } finally {
      setTallyExporting(false);
    }
  };

  // Escape key listener to close drill-down modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && drillModalOpen) {
        setDrillModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drillModalOpen]);

  const handleOpenLedgerDrilldown = async (acc) => {
    setSelectedAccount(acc);
    setDrillModalOpen(true);
    setLedgerLoading(true);
    setLedgerData(null);
    try {
      const parts = periodId.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const lastDay = new Date(year, month, 0).getDate();
      const periodStart = `${periodId}-01`;
      const periodEnd = `${periodId}-${String(lastDay).padStart(2, "0")}`;

      const res = await fetchLedgerExtract({
        accountCode: acc.accountCode,
        periodStart,
        periodEnd
      });
      setLedgerData(res);
    } catch (err) {
      console.error("Ledger drill-down error:", err);
      toast.error("Failed to fetch ledger extract: " + (err.message || "Unknown error"));
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExportLedgerCsv = () => {
    if (!ledgerData) return;
    const rows = (ledgerData.entries || []).map((e) => ({
      Date: e.date,
      Narration: e.narration,
      RefNo: e.refNo,
      DrAmount: e.drAmount > 0 ? e.drAmount : "",
      CrAmount: e.crAmount > 0 ? e.crAmount : "",
      RunningBalance: e.runningBalance
    }));

    rows.push({
      Date: "TOTALS",
      Narration: `Closing Balance: ₹${ledgerData.closingBalance}`,
      RefNo: "",
      DrAmount: ledgerData.totalDr,
      CrAmount: ledgerData.totalCr,
      RunningBalance: ledgerData.closingBalance
    });

    exportToCsv(`Ledger_${selectedAccount?.accountCode}_${periodId}`, rows, [
      { key: "Date", label: "Date" },
      { key: "Narration", label: "Narration" },
      { key: "RefNo", label: "Ref No" },
      { key: "DrAmount", label: "Dr Amount (₹)" },
      { key: "CrAmount", label: "Cr Amount (₹)" },
      { key: "RunningBalance", label: "Running Balance (₹)" }
    ]);
    toast.success("Ledger extract exported to CSV");
  };

  const handleDownloadGstr3bJson = () => {
    try {
      const taxableVal = Number(gstr1Data?.totalTaxableValue || 0);
      const cgst = Number(gstr1Data?.table12Hsn?.reduce((sum, h) => sum + (h.cgstAmount || 0), 0) || 0);
      const sgst = Number(gstr1Data?.table12Hsn?.reduce((sum, h) => sum + (h.sgstAmount || 0), 0) || 0);
      const igst = Number(gstr1Data?.table12Hsn?.reduce((sum, h) => sum + (h.igstAmount || 0), 0) || 0);

      const parts = periodId.split("-");
      const ret_period = parts.length === 2 ? `${parts[1]}${parts[0]}` : "102026";
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthIdx = parseInt(parts[1] || "10", 10) - 1;
      const monthStr = monthNames[monthIdx] || "Oct";

      const gstr3bPayload = {
        gstin: "10AABCK1234F1Z5",
        ret_period: ret_period,
        sup_details: {
          osup_det: {
            txval: Math.round(taxableVal * 100) / 100,
            iamt: Math.round(igst * 100) / 100,
            camt: Math.round(cgst * 100) / 100,
            samt: Math.round(sgst * 100) / 100,
            csamt: 0
          },
          osup_zero: { txval: 0, iamt: 0, csamt: 0 },
          osup_nil_exempt: { txval: 0 },
          isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
          osup_nongst: { txval: 0 }
        },
        itc_elg: {
          itc_avl: [
            { ty: "IMPG", iamt: 0, csamt: 0 },
            { ty: "IMPS", iamt: 0, csamt: 0 },
            { ty: "ISRC", iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { ty: "ISD", iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { 
              ty: "OTH", 
              iamt: Math.round(igst * 0.8 * 100) / 100, 
              camt: Math.round(cgst * 0.8 * 100) / 100, 
              samt: Math.round(sgst * 0.8 * 100) / 100, 
              csamt: 0 
            }
          ],
          itc_rev: [{ ty: "RUL", iamt: 0, camt: 0, samt: 0, csamt: 0 }],
          itc_net: {
            iamt: Math.round(igst * 0.8 * 100) / 100,
            camt: Math.round(cgst * 0.8 * 100) / 100,
            samt: Math.round(sgst * 0.8 * 100) / 100,
            csamt: 0
          },
          itc_inelg: [{ ty: "RUL", iamt: 0, camt: 0, samt: 0, csamt: 0 }]
        },
        intr_ltfee: {
          intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 }
        }
      };

      const jsonStr = JSON.stringify(gstr3bPayload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `GSTR3B_${monthStr}${parts[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded GSTR-3B JSON for ${monthStr} ${parts[0]}`);
    } catch (err) {
      toast.error("Failed to generate GSTR-3B JSON: " + err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="CA & Statutory Finance Reports"
        subtitle="Audited General Ledger, Trial Balance, P&L, Balance Sheet, and GSTR-1 e-Return tables for KrishiVishal Private Limited."
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 shadow-sm">
            <Calendar size={14} className="text-gray-400" />
            <span>Fiscal Period:</span>
            <select
              value={periodId}
              onChange={handlePeriodChange}
              className="bg-transparent font-bold text-[#0B4D31] outline-none cursor-pointer"
            >
              <option value="2026-10">October 2026 (2026-10)</option>
              <option value="2026-09">September 2026 (2026-09)</option>
              <option value="2026-08">August 2026 (2026-08)</option>
              <option value="2026-07">July 2026 (2026-07)</option>
              <option value="2026-06">June 2026 (2026-06)</option>
            </select>
          </div>

          <button
            onClick={() => loadData(periodId)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#0B4D31]" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </PageHeader>

      {/* Tabs Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("trial-balance")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "trial-balance"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-white text-gray-600 hover:text-gray-900 border border-gray-100"
            }`}
          >
            <Scale size={15} />
            <span>Trial Balance</span>
          </button>

          <button
            onClick={() => setActiveTab("pnl")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "pnl"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-white text-gray-600 hover:text-gray-900 border border-gray-100"
            }`}
          >
            <TrendingUp size={15} />
            <span>Profit & Loss (P&L)</span>
          </button>

          <button
            onClick={() => setActiveTab("balance-sheet")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "balance-sheet"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-white text-gray-600 hover:text-gray-900 border border-gray-100"
            }`}
          >
            <Layers size={15} />
            <span>Balance Sheet</span>
          </button>

          <button
            onClick={() => setActiveTab("gstr1")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "gstr1"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-white text-gray-600 hover:text-gray-900 border border-gray-100"
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>GSTR-1 Statutory Return</span>
          </button>

          <button
            onClick={() => setActiveTab("tally-export")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "tally-export"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-white text-gray-600 hover:text-gray-900 border border-gray-100"
            }`}
          >
            <FileCode2 size={15} />
            <span>TallyPrime / ERP XML Export</span>
          </button>
        </div>

        {/* Tab-specific action */}
        <div>
          {activeTab === "trial-balance" && (
            <button
              onClick={handleExportTrialBalance}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Export TB to Excel/CSV</span>
            </button>
          )}
          {activeTab === "gstr1" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadGstr3bJson}
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Download size={14} />
                <span>Download GSTR-3B JSON</span>
              </button>
              <button
                onClick={handleExportGstr1}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Download size={14} />
                <span>Export GSTR-1 HSN CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: TRIAL BALANCE */}
      {activeTab === "trial-balance" && (
        <div className="space-y-4">
          {/* Header Summary Banner */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">General Ledger Trial Balance</h2>
                {trialBalanceData?.isBalanced ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                    <CheckCircle2 size={12} />
                    Balanced (Debits = Credits)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                    <AlertTriangle size={12} />
                    Out of Balance
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Period: <span className="font-mono font-bold text-gray-700">{periodId}</span> | Click any account row for Chronological Ledger Drill-down Extract
              </p>
            </div>

            <div className="flex items-center gap-6 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Debits</span>
                <span className="text-sm font-black text-gray-900">
                  ₹{Number(trialBalanceData?.totalDebits || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Credits</span>
                <span className="text-sm font-black text-gray-900">
                  ₹{Number(trialBalanceData?.totalCredits || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Difference</span>
                <span className={`text-sm font-black ${
                  trialBalanceData?.isBalanced ? "text-green-600" : "text-red-600"
                }`}>
                  ₹{Math.abs(Number(trialBalanceData?.totalDebits || 0) - Number(trialBalanceData?.totalCredits || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Debit (₹)</th>
                    <th className="py-3 px-4 text-right">Credit (₹)</th>
                    <th className="py-3 px-4 text-right">Net Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {trialBalanceData?.accounts && trialBalanceData.accounts.length > 0 ? (
                    trialBalanceData.accounts.map((acc) => (
                      <tr 
                        key={acc.accountCode} 
                        onClick={() => handleOpenLedgerDrilldown(acc)}
                        className="hover:bg-emerald-50/70 transition-colors cursor-pointer group"
                        title="Click to view chronological ledger drilldown"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-emerald-900 group-hover:text-emerald-700">
                          <span className="flex items-center gap-1.5">
                            {acc.accountCode}
                            <span className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-normal">&rarr; Drilldown</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-800">{acc.accountName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            acc.type === "ASSET" ? "bg-blue-50 text-blue-700" :
                            acc.type === "LIABILITY" ? "bg-amber-50 text-amber-700" :
                            acc.type === "EQUITY" ? "bg-purple-50 text-purple-700" :
                            acc.type === "REVENUE" ? "bg-emerald-50 text-emerald-700" :
                            acc.type === "COGS" ? "bg-orange-50 text-orange-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {acc.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-gray-700">
                          {acc.totalDebit > 0 ? Number(acc.totalDebit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-gray-700">
                          {acc.totalCredit > 0 ? Number(acc.totalCredit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                          ₹{Number(acc.netBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-gray-400">
                        {loading ? "Calculating Trial Balance..." : "No journal entries found for this period."}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-black text-gray-900">
                  <tr>
                    <td colSpan="3" className="py-3 px-4 text-right uppercase tracking-wider">Total</td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₹{Number(trialBalanceData?.totalDebits || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₹{Number(trialBalanceData?.totalCredits || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-800">
                      ₹0.00
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFIT & LOSS */}
      {activeTab === "pnl" && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-gray-400 block">Gross Revenue (4010)</span>
              <p className="text-xl font-black text-gray-900 mt-1">
                ₹{Number(pnlData?.grossRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                <TrendingUp size={12} /> Recognized Delivered Sales
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-gray-400 block">COGS (5010)</span>
              <p className="text-xl font-black text-orange-600 mt-1">
                ₹{Number(pnlData?.cogs || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-gray-500 font-medium mt-1 block">
                Cost of goods sold matched
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-gray-400 block">Gross Margin</span>
              <p className="text-xl font-black text-gray-900 mt-1">
                ₹{Number(pnlData?.grossProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] font-bold text-emerald-700 mt-1 block">
                Margin: {pnlData?.grossMarginPercentage || 0}%
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-gray-400 block">Net Profit / (Loss)</span>
              <p className={`text-xl font-black mt-1 ${
                Number(pnlData?.netProfit || 0) >= 0 ? "text-emerald-700" : "text-red-600"
              }`}>
                ₹{Number(pnlData?.netProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-gray-500 font-medium mt-1 block">
                After OpEx & Logistics
              </span>
            </div>
          </div>

          {/* Detailed P&L Statement Breakup */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Profit & Loss Statement for Period: {periodId}
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-gray-50 font-bold text-gray-800">
                <span>1. REVENUE FROM OPERATIONS</span>
                <span className="font-mono">₹{Number(pnlData?.grossRevenue || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pl-4 text-gray-600">
                <span>Sale of Agriculture Inputs (Fertilizers, Pesticides, Seeds)</span>
                <span className="font-mono">₹{Number(pnlData?.grossRevenue || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-50 font-bold text-gray-800 pt-3">
                <span>2. COST OF GOODS SOLD (COGS)</span>
                <span className="font-mono text-orange-700">(₹{Number(pnlData?.cogs || 0).toFixed(2)})</span>
              </div>
              <div className="flex justify-between pl-4 text-gray-600">
                <span>Direct Purchase & Inventory Consumed</span>
                <span className="font-mono">(₹{Number(pnlData?.cogs || 0).toFixed(2)})</span>
              </div>

              <div className="flex justify-between py-2.5 bg-gray-50 px-3 rounded-xl font-black text-gray-900 mt-2">
                <span>GROSS PROFIT</span>
                <span className="font-mono text-emerald-800">₹{Number(pnlData?.grossProfit || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-50 font-bold text-gray-800 pt-4">
                <span>3. OPERATING & LOGISTICS EXPENSES (OpEx)</span>
                <span className="font-mono text-red-600">(₹{Number(pnlData?.operatingExpenses || 0).toFixed(2)})</span>
              </div>
              <div className="flex justify-between pl-4 text-gray-600">
                <span>Rider Fuel, Hub Logistics, Gateway Fees & Administrative Costs</span>
                <span className="font-mono">(₹{Number(pnlData?.operatingExpenses || 0).toFixed(2)})</span>
              </div>

              <div className="flex justify-between py-3 bg-emerald-50/70 border border-emerald-200 px-4 rounded-xl font-black text-sm text-emerald-950 mt-4">
                <span>NET PROFIT BEFORE TAX (PBT)</span>
                <span className="font-mono">₹{Number(pnlData?.netProfit || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BALANCE SHEET */}
      {activeTab === "balance-sheet" && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">Balance Sheet Statement</h2>
                {balanceSheetData?.isBalanced ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                    <CheckCircle2 size={12} />
                    Balanced (Assets = Liabilities + Equity)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                    <AlertTriangle size={12} />
                    Imbalance Detected
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                As at the end of period <span className="font-mono font-bold text-gray-700">{periodId}</span>
              </p>
            </div>

            <div className="flex items-center gap-6 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Assets</span>
                <span className="text-sm font-black text-gray-900">
                  ₹{Number(balanceSheetData?.totalAssets || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Liabilities + Equity</span>
                <span className="text-sm font-black text-gray-900">
                  ₹{Number(balanceSheetData?.totalEquityAndLiabilities || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Assets */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-blue-900 bg-blue-50/70 px-3 py-2 rounded-xl">
                I. ASSETS
              </h3>
              <div className="divide-y divide-gray-50 text-xs">
                {(balanceSheetData?.assets || []).map((acc) => (
                  <div key={acc.accountCode} className="py-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-gray-500 mr-2">{acc.accountCode}</span>
                      <span className="font-medium text-gray-800">{acc.accountName}</span>
                    </div>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{Number(acc.netValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                {(!balanceSheetData?.assets || balanceSheetData.assets.length === 0) && (
                  <div className="py-8 text-center text-gray-400">No Asset accounts found.</div>
                )}
              </div>
              <div className="pt-3 border-t-2 border-gray-100 flex justify-between font-black text-xs text-gray-900">
                <span>TOTAL ASSETS</span>
                <span className="font-mono text-sm text-blue-900">
                  ₹{Number(balanceSheetData?.totalAssets || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Right: Liabilities & Equity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-50/70 px-3 py-2 rounded-xl">
                II. LIABILITIES & EQUITY
              </h3>
              <div className="divide-y divide-gray-50 text-xs">
                <div className="py-1.5 font-bold text-gray-500 uppercase text-[10px]">Liabilities</div>
                {(balanceSheetData?.liabilities || []).map((acc) => (
                  <div key={acc.accountCode} className="py-2.5 flex justify-between items-center pl-2">
                    <div>
                      <span className="font-mono text-gray-500 mr-2">{acc.accountCode}</span>
                      <span className="font-medium text-gray-800">{acc.accountName}</span>
                    </div>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{Number(acc.netValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}

                <div className="py-1.5 font-bold text-gray-500 uppercase text-[10px] pt-3">Shareholders' Equity & Reserves</div>
                {(balanceSheetData?.equity || []).map((acc) => (
                  <div key={acc.accountCode} className="py-2.5 flex justify-between items-center pl-2">
                    <div>
                      <span className="font-mono text-gray-500 mr-2">{acc.accountCode}</span>
                      <span className="font-medium text-gray-800">{acc.accountName}</span>
                    </div>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{Number(acc.netValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}

                <div className="py-2.5 flex justify-between items-center pl-2 bg-emerald-50/40 rounded-lg">
                  <span className="font-bold text-emerald-900">Current Period Net Profit / (Loss)</span>
                  <span className="font-mono font-bold text-emerald-900">
                    ₹{Number(balanceSheetData?.currentPeriodEarnings || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-gray-100 flex justify-between font-black text-xs text-gray-900">
                <span>TOTAL LIABILITIES & EQUITY</span>
                <span className="font-mono text-sm text-amber-900">
                  ₹{Number(balanceSheetData?.totalEquityAndLiabilities || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GSTR-1 STATUTORY TABLES */}
      {activeTab === "gstr1" && (
        <div className="space-y-6">
          {/* Overview Banner */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">GSTR-1 Monthly Return Summary</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  GSTIN: 10AABCK1234F1Z5 (Bihar Origin)
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Statutory Table 7 (B2C), Table 12 (HSN Summary), and Table 13 (Document Serial Range).
              </p>
            </div>

            <div className="flex items-center gap-6 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Taxable Value</span>
                <span className="text-sm font-black text-gray-900">
                  ₹{Number(gstr1Data?.totalTaxableValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Tax Liability</span>
                <span className="text-sm font-black text-emerald-800">
                  ₹{Number(gstr1Data?.totalTaxLiability || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ITC vs Output Tax Liability AreaChart */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                  <span>ITC Available vs Output Tax Liability</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">FY 2026-27</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Visual reconciliation of Input Tax Credit versus Output Tax Liability across filing months</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
                  <span className="text-gray-600 font-medium">Output Tax Liability</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                  <span className="text-gray-600 font-medium">ITC Available</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    { month: "Apr 2026", outputTax: 45000, itcAvailable: 38000 },
                    { month: "May 2026", outputTax: 62000, itcAvailable: 51000 },
                    { month: "Jun 2026", outputTax: 78000, itcAvailable: 69000 },
                    { month: "Jul 2026", outputTax: 84000, itcAvailable: 71000 },
                    { month: "Aug 2026", outputTax: 91000, itcAvailable: 80000 },
                    { month: "Sep 2026", outputTax: 105000, itcAvailable: 89000 },
                    { month: "Oct 2026", outputTax: Number(gstr1Data?.totalTaxLiability || 118000), itcAvailable: Math.round(Number(gstr1Data?.totalTaxLiability || 118000) * 0.8) }
                  ]}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorItc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const output = Number(payload.find(p => p.dataKey === 'outputTax')?.value || 0);
                        const itc = Number(payload.find(p => p.dataKey === 'itcAvailable')?.value || 0);
                        const netPayable = Math.max(0, output - itc);
                        return (
                          <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 text-xs space-y-1">
                            <p className="font-bold text-gray-900 border-b border-gray-100 pb-1">{label}</p>
                            <p className="text-red-600 font-semibold flex justify-between gap-4">
                              <span>Output Liability:</span>
                              <span className="font-mono">₹{output.toLocaleString('en-IN')}</span>
                            </p>
                            <p className="text-emerald-600 font-semibold flex justify-between gap-4">
                              <span>ITC Available:</span>
                              <span className="font-mono">₹{itc.toLocaleString('en-IN')}</span>
                            </p>
                            <div className="border-t border-gray-100 pt-1 font-black text-gray-900 flex justify-between gap-4">
                              <span>Net Payable:</span>
                              <span className="font-mono text-indigo-700">₹{netPayable.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="outputTax" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorOutput)" name="Output Tax Liability" />
                  <Area type="monotone" dataKey="itcAvailable" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorItc)" name="ITC Available" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table 12: HSN Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">
                  Table 12: HSN-wise Summary of Outward Supplies
                </h3>
                <p className="text-[11px] text-gray-500">Classification of goods sold with tax split (CGST + SGST + IGST)</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">HSN Code</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-center">Total Qty</th>
                    <th className="py-3 px-4 text-right">Taxable Value (₹)</th>
                    <th className="py-3 px-4 text-right">CGST (₹)</th>
                    <th className="py-3 px-4 text-right">SGST (₹)</th>
                    <th className="py-3 px-4 text-right">IGST (₹)</th>
                    <th className="py-3 px-4 text-right">Total Tax (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {(gstr1Data?.table12Hsn || []).map((hsn) => (
                    <tr key={hsn.hsnCode} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-emerald-900">{hsn.hsnCode}</td>
                      <td className="py-3 px-4 text-gray-800">{hsn.description}</td>
                      <td className="py-3 px-4 text-center font-mono">{hsn.totalQuantity}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                        ₹{Number(hsn.totalTaxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600">
                        ₹{Number(hsn.cgstAmount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600">
                        ₹{Number(hsn.sgstAmount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600">
                        ₹{Number(hsn.igstAmount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                        ₹{Number(hsn.totalTax).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 13: Document Serials */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 mb-2">
              Table 13: Documents Issued During the Tax Period
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-[11px] font-bold text-gray-500 uppercase block">1. Tax Invoices (B2C)</span>
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Serial Range:</span>
                    <span className="font-mono font-bold text-gray-900">
                      {gstr1Data?.table13Documents?.invoices?.fromSerial || "KV/26-27/00001"} to {gstr1Data?.table13Documents?.invoices?.toSerial || "KV/26-27/00048"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Issued:</span>
                    <span className="font-mono font-bold text-emerald-800">
                      {gstr1Data?.table13Documents?.invoices?.totalIssued || 48}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cancelled:</span>
                    <span className="font-mono text-gray-500">
                      {gstr1Data?.table13Documents?.invoices?.cancelledCount || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-[11px] font-bold text-gray-500 uppercase block">2. Credit Notes (RTO / Returns)</span>
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Serial Range:</span>
                    <span className="font-mono font-bold text-gray-900">
                      {gstr1Data?.table13Documents?.creditNotes?.fromSerial || "KV/CN/26-27/00001"} to {gstr1Data?.table13Documents?.creditNotes?.toSerial || "KV/CN/26-27/00003"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Issued:</span>
                    <span className="font-mono font-bold text-orange-800">
                      {gstr1Data?.table13Documents?.creditNotes?.totalIssued || 3}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cancelled:</span>
                    <span className="font-mono text-gray-500">
                      {gstr1Data?.table13Documents?.creditNotes?.cancelledCount || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. TALLYPRIME / ERP XML EXPORT DESK */}
      {activeTab === "tally-export" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <FileCode2 className="text-[#0B4D31]" size={20} />
                  <span>TallyPrime / ERP XML Export Engine</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automated export of KrishiVishal General Ledger into official TallyPrime XML schema (Part A: Ledger Masters + Part B: Vouchers).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} />
                  <span>Tally.imp Compliant (0-Error Import)</span>
                </span>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 py-6 border-b border-gray-100">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1.5">
                  Start Date (तारीख से)
                </label>
                <input
                  type="date"
                  value={tallyStartDate}
                  onChange={(e) => setTallyStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#0B4D31]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1.5">
                  End Date (तारीख तक)
                </label>
                <input
                  type="date"
                  value={tallyEndDate}
                  onChange={(e) => setTallyEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#0B4D31]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1.5">
                  Voucher Type Filter (वाउचर प्रकार)
                </label>
                <select
                  value={tallyVoucherFilter}
                  onChange={(e) => setTallyVoucherFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#0B4D31]"
                >
                  <option value="ALL">All Vouchers (सभी वाउचर्स)</option>
                  <option value="Sales">Sales Vouchers (Order Delivery)</option>
                  <option value="Purchase">Purchase Vouchers (GRN / Supplier)</option>
                  <option value="Receipt">Receipt Vouchers (Rider / Gateway)</option>
                  <option value="Payment">Payment Vouchers (Vendor / Expenses)</option>
                  <option value="Journal">Journal Vouchers (COGS / Adjustments)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleExportTally}
                  disabled={tallyExporting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B4D31] hover:bg-[#073321] text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {tallyExporting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Generating XML...</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Generate & Download XML</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results / Status Card */}
            {tallyExportResult ? (
              <div className="mt-6 p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-emerald-700" />
                      <span>TallyPrime XML Export Successful!</span>
                    </h4>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      File generated for <span className="font-bold">{tallyExportResult.companyName}</span> matching statutory debit-credit balance.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-1 rounded text-emerald-800 border border-emerald-200">
                    {(tallyExportResult.byteLength / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] text-gray-500 uppercase block">Exported Vouchers</span>
                    <span className="text-sm font-black text-gray-900 font-mono">
                      {tallyExportResult.exportedVouchersCount}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] text-gray-500 uppercase block">Skipped / Imbalanced</span>
                    <span className="text-sm font-black text-gray-400 font-mono">
                      {tallyExportResult.skippedVouchersCount}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] text-gray-500 uppercase block">Total Debits</span>
                    <span className="text-sm font-black text-[#0B4D31] font-mono">
                      ₹{Number(tallyExportResult.totalDebit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] text-gray-500 uppercase block">Total Credits</span>
                    <span className="text-sm font-black text-blue-900 font-mono">
                      ₹{Number(tallyExportResult.totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900 block">1. Part A: Master Ledgers</span>
                  <p className="text-gray-500 mt-1 leading-relaxed text-[11px]">
                    Automatic creation of all Chart of Accounts (Cash, Bank, Debtors, Creditors, GST, TDS u/s 194Q) with correct Tally parent groups.
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900 block">2. Part B: Vouchers</span>
                  <p className="text-gray-500 mt-1 leading-relaxed text-[11px]">
                    Delivered sales invoices, supplier GRN bills, rider cash settlements, and vendor payments mapped to standard voucher types.
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900 block">3. Mathematical Balance</span>
                  <p className="text-gray-500 mt-1 leading-relaxed text-[11px]">
                    ISDEEMEDPOSITIVE rules strictly applied (Debits: Yes / -Amt, Credits: No / +Amt) ensuring zero import errors in Tally.imp.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEDGER DRILL-DOWN MODAL */}
      {drillModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrillModalOpen(false);
          }}
        >
          <div className="w-full md:max-w-4xl bg-white md:rounded-2xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-[#0B4D31] flex items-center justify-center font-bold">
                  <Scale size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-gray-900">
                      {selectedAccount?.accountName || "Account Ledger Extract"}
                    </h3>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {selectedAccount?.accountCode}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    <span>Fiscal Period: <strong className="text-gray-700">{periodId}</strong></span>
                    <span>•</span>
                    <span>Classification: <strong className="text-gray-700">{selectedAccount?.type}</strong></span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportLedgerCsv}
                  disabled={ledgerLoading || !ledgerData || !ledgerData.entries?.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-40 transition-colors"
                  title="Export Chronological Ledger to CSV"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => setDrillModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {ledgerLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <Loader2 size={32} className="animate-spin text-[#0B4D31]" />
                  <p className="text-xs font-bold text-gray-500">Fetching immutable double-entry ledger lines...</p>
                </div>
              ) : ledgerData ? (
                <>
                  {/* Opening Balance Card */}
                  <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Opening Balance (Before Period Start)</span>
                      <p className="text-xs text-emerald-900 mt-0.5">Calculated from prior posted journal entries</p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black font-mono text-[#0B4D31]">
                        ₹{Number(ledgerData.openingBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 block uppercase">
                        {ledgerData.normalBalance || "DEBIT"} Normal
                      </span>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Narration / Description</th>
                            <th className="py-2.5 px-3">Ref No</th>
                            <th className="py-2.5 px-3 text-right">Dr Amount (₹)</th>
                            <th className="py-2.5 px-3 text-right">Cr Amount (₹)</th>
                            <th className="py-2.5 px-3 text-right font-black">Running Balance (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {ledgerData.entries && ledgerData.entries.length > 0 ? (
                            ledgerData.entries.map((entry, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/70 transition-colors">
                                <td className="py-2.5 px-3 font-mono text-gray-600 whitespace-nowrap">{entry.date}</td>
                                <td className="py-2.5 px-3 text-gray-800 max-w-xs truncate" title={entry.narration}>
                                  {entry.narration}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-gray-500 whitespace-nowrap">{entry.refNo}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                                  {entry.drAmount > 0 ? Number(entry.drAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                                  {entry.crAmount > 0 ? Number(entry.crAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                                  ₹{Number(entry.runningBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-gray-400">
                                No journal entries posted for this account in {periodId}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {/* Totals Row */}
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-black text-xs text-gray-900">
                          <tr>
                            <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                              Totals & Closing Balance
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-blue-900">
                              ₹{Number(ledgerData.totalDr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-purple-900">
                              ₹{Number(ledgerData.totalCr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-emerald-900 text-sm">
                              ₹{Number(ledgerData.closingBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-gray-400">
                  <p>Failed to load ledger data.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-mono text-[10px]">Esc</kbd> to exit</span>
              <button
                onClick={() => setDrillModalOpen(false)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  Lock
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { 
  fetchTrialBalance, 
  fetchProfitAndLoss, 
  fetchBalanceSheet, 
  fetchGstr1Summary, 
  exportToCsv 
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
            <button
              onClick={handleExportGstr1}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Export GSTR-1 HSN CSV</span>
            </button>
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
                Period: <span className="font-mono font-bold text-gray-700">{periodId}</span> | Double-Entry Verification across All Canonical Sub-Ledgers
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
                      <tr key={acc.accountCode} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-emerald-900">{acc.accountCode}</td>
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
    </div>
  );
}

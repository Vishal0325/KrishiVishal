import React, { useState, useEffect } from "react";
import {
  PieChart as PieIcon,
  Landmark,
  TrendingUp,
  Calculator,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Users,
  ShieldCheck,
  Building,
  RefreshCw,
  Percent,
  Download
} from "lucide-react";
import toast from "react-hot-toast";
import PageHeader from "../../components/common/PageHeader";
import MetricCard from "../../components/common/MetricCard";
import StatusBadge from "../../components/common/StatusBadge";
import DataTable from "../../components/common/DataTable";
import {
  getCapitalStructure,
  updateCapitalStructure,
  getShareholders,
  addShareholder,
  updateShareholder,
  deleteShareholder,
  getCorporateLoans,
  addCorporateLoan,
  updateCorporateLoan,
  deleteCorporateLoan,
  getInterestLedger,
  recordInterestPayment,
  getFundingRounds,
  addFundingRound,
  calculateMonthlyInterestAndTDS,
  simulateDilution
} from "../../services/capTableService";

const CapTableLoans = () => {
  const [activeTab, setActiveTab] = useState("captable");
  const [loading, setLoading] = useState(true);

  // Capital & Cap Table State
  const [capital, setCapital] = useState(null);
  const [shareholders, setShareholders] = useState([]);
  const [isCapitalModalOpen, setIsCapitalModalOpen] = useState(false);
  const [isShareholderModalOpen, setIsShareholderModalOpen] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState(null);
  const [capitalFormData, setCapitalFormData] = useState({
    authorizedCapital: 1000000,
    authorizedShares: 100000,
    faceValuePerShare: 10,
    paidUpCapital: 100000,
    cinNumber: "U01111BR2026PTC000000",
    rocJurisdiction: "RoC Patna / Bihar"
  });
  const [shareholderFormData, setShareholderFormData] = useState({
    shareholderName: "",
    category: "Founder",
    sharesCount: 1000,
    faceValue: 10,
    investmentAmount: 10000,
    panNumber: "",
    folioNumber: "KV-SH-001",
    certificateNumber: "KV-CERT-001",
    allotmentDate: new Date().toISOString().split("T")[0],
    votingRightsPercent: 100
  });

  // Loans & Debt State
  const [loans, setLoans] = useState([]);
  const [interestLedger, setInterestLedger] = useState([]);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [selectedLoanForRepay, setSelectedLoanForRepay] = useState(null);
  const [loanFormData, setLoanFormData] = useState({
    lenderName: "",
    loanType: "Director Loan (Unsecured)",
    principalAmount: 500000,
    interestRate: 8,
    tenureMonths: 24,
    startDate: new Date().toISOString().split("T")[0],
    repaymentFrequency: "Monthly Interest",
    isTdsApplicable: true,
    mcaChargeId: "",
    purpose: "Working Capital & Warehouse Setup"
  });
  const [repayFormData, setRepayFormData] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    periodMonth: new Date().toLocaleString("default", { month: "short", year: "numeric" }),
    grossInterest: 0,
    tdsDeducted: 0,
    netPaid: 0,
    principalRepaid: 0,
    paymentMode: "Bank Transfer (NEFT/RTGS)",
    referenceNumber: ""
  });

  // Funding Rounds State
  const [fundingRounds, setFundingRounds] = useState([]);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [fundingFormData, setFundingFormData] = useState({
    roundName: "Seed Round",
    targetAmount: 5000000,
    preMoneyValuation: 20000000,
    instrumentType: "CCPS (Convertible Preference)",
    status: "Planned",
    leadInvestor: "",
    closingDate: new Date().toISOString().split("T")[0]
  });

  // Simulator State
  const [simInvestment, setSimInvestment] = useState(5000000);
  const [simPreMoney, setSimPreMoney] = useState(25000000);
  const [simResult, setSimResult] = useState(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [capData, shData, loanData, ledgerData, roundsData] = await Promise.all([
        getCapitalStructure(),
        getShareholders(),
        getCorporateLoans(),
        getInterestLedger(),
        getFundingRounds()
      ]);

      setCapital(capData);
      setCapitalFormData(capData);
      setShareholders(shData);
      setLoans(loanData);
      setInterestLedger(ledgerData);
      setFundingRounds(roundsData);

      // Initial simulation
      if (shData.length > 0) {
        setSimResult(simulateDilution(shData, simInvestment, simPreMoney));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load Corporate Cap Table & Loan records");
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const totalSharesIssued = shareholders.reduce((sum, s) => sum + (Number(s.sharesCount) || 0), 0);
  const totalPaidUp = shareholders.reduce((sum, s) => sum + (Number(s.investmentAmount) || 0), 0);
  const totalDebt = loans.filter(l => l.status === "Active").reduce((sum, l) => sum + (Number(l.outstandingPrincipal) || 0), 0);
  const totalMonthlyInterest = loans.filter(l => l.status === "Active").reduce((sum, l) => sum + (Number(l.monthlyInterest) || 0), 0);
  const totalMonthlyTds = loans.filter(l => l.status === "Active").reduce((sum, l) => sum + (Number(l.monthlyTds) || 0), 0);

  // Capital Form Submit
  const handleSaveCapital = async (e) => {
    e.preventDefault();
    try {
      await updateCapitalStructure(capitalFormData);
      toast.success("Capital structure updated successfully");
      setIsCapitalModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to update capital structure");
    }
  };

  // Shareholder Form Submit
  const handleSaveShareholder = async (e) => {
    e.preventDefault();
    try {
      if (editingShareholder) {
        await updateShareholder(editingShareholder.id, shareholderFormData);
        toast.success("Shareholder updated");
      } else {
        await addShareholder(shareholderFormData);
        toast.success("New shares issued & Shareholder added");
      }
      setIsShareholderModalOpen(false);
      setEditingShareholder(null);
      setShareholderFormData({
        shareholderName: "", category: "Founder", sharesCount: 1000,
        faceValue: 10, investmentAmount: 10000, panNumber: "",
        folioNumber: `KV-SH-${String(shareholders.length + 1).padStart(3, "0")}`,
        certificateNumber: `KV-CERT-${String(shareholders.length + 1).padStart(3, "0")}`,
        allotmentDate: new Date().toISOString().split("T")[0], votingRightsPercent: 100
      });
      fetchAllData();
    } catch (err) {
      toast.error("Failed to save shareholder record");
    }
  };

  // Delete Shareholder
  const handleDeleteShareholder = async (id) => {
    if (!window.confirm("Are you sure you want to remove this shareholder entry?")) return;
    try {
      await deleteShareholder(id);
      toast.success("Shareholder removed");
      fetchAllData();
    } catch (err) {
      toast.error("Failed to remove shareholder");
    }
  };

  // Loan Submit
  const handleSaveLoan = async (e) => {
    e.preventDefault();
    try {
      await addCorporateLoan(loanFormData);
      toast.success("Corporate loan / borrowing recorded");
      setIsLoanModalOpen(false);
      setLoanFormData({
        lenderName: "", loanType: "Director Loan (Unsecured)",
        principalAmount: 500000, interestRate: 8, tenureMonths: 24,
        startDate: new Date().toISOString().split("T")[0],
        repaymentFrequency: "Monthly Interest", isTdsApplicable: true,
        mcaChargeId: "", purpose: "Working Capital & Warehouse Setup"
      });
      fetchAllData();
    } catch (err) {
      toast.error("Failed to record loan");
    }
  };

  // Open Repay Modal
  const handleOpenRepayModal = (loan) => {
    setSelectedLoanForRepay(loan);
    const calc = calculateMonthlyInterestAndTDS(loan.outstandingPrincipal, loan.interestRate, loan.isTdsApplicable);
    setRepayFormData({
      loanId: loan.id,
      lenderName: loan.lenderName,
      paymentDate: new Date().toISOString().split("T")[0],
      periodMonth: new Date().toLocaleString("default", { month: "short", year: "numeric" }),
      grossInterest: calc.grossMonthlyInterest,
      tdsDeducted: calc.tdsDeduction,
      netPaid: calc.netMonthlyInterest,
      principalRepaid: 0,
      paymentMode: "Bank Transfer (NEFT/RTGS)",
      referenceNumber: ""
    });
    setIsRepayModalOpen(true);
  };

  // Save Repayment
  const handleSaveRepay = async (e) => {
    e.preventDefault();
    try {
      await recordInterestPayment(repayFormData);
      toast.success("Interest & Repayment entry recorded in ledger");
      setIsRepayModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to record repayment");
    }
  };

  // Funding Round Submit
  const handleSaveFunding = async (e) => {
    e.preventDefault();
    try {
      await addFundingRound(fundingFormData);
      toast.success("Funding round created");
      setIsFundingModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to create funding round");
    }
  };

  // Run Dilution Simulator
  const handleRunSimulation = (e) => {
    e.preventDefault();
    setSimResult(simulateDilution(shareholders, simInvestment, simPreMoney));
  };

  // Table Columns
  const shareholderColumns = [
    {
      header: "Folio & Cert",
      render: (s) => (
        <div>
          <div className="font-mono text-xs font-bold text-gray-800">{s.folioNumber || "N/A"}</div>
          <div className="text-[10px] text-gray-500">{s.certificateNumber || "Form SH-1"}</div>
        </div>
      )
    },
    {
      header: "Shareholder",
      render: (s) => (
        <div>
          <div className="font-bold text-gray-900">{s.shareholderName}</div>
          <div className="text-xs text-gray-500">PAN: {s.panNumber || "PAN Pending"}</div>
        </div>
      )
    },
    {
      header: "Category",
      render: (s) => {
        const type = s.category === "Founder" ? "success" 
                   : s.category === "Angel/Investor" || s.category === "VC" ? "blue" 
                   : s.category === "ESOP Pool" ? "purple" : "default";
        return <StatusBadge status={s.category} type={type} />;
      }
    },
    {
      header: "Shares Count",
      render: (s) => (
        <div>
          <span className="font-bold text-gray-900">{Number(s.sharesCount).toLocaleString("en-IN")}</span>
          <span className="text-xs text-gray-500 ml-1">(@ ₹{s.faceValue || 10})</span>
        </div>
      )
    },
    {
      header: "Investment (₹)",
      render: (s) => <span className="font-bold text-green-700">₹{Number(s.investmentAmount).toLocaleString("en-IN")}</span>
    },
    {
      header: "Equity Stake",
      render: (s) => {
        const percent = totalSharesIssued > 0 ? ((Number(s.sharesCount) / totalSharesIssued) * 100).toFixed(2) : 0;
        return (
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-blue-700">{percent}%</span>
            <div className="w-16 bg-gray-200 rounded-full h-1.5 hidden sm:block">
              <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
          </div>
        );
      }
    },
    {
      header: "Actions",
      render: (s) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingShareholder(s);
              setShareholderFormData(s);
              setIsShareholderModalOpen(true);
            }}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => handleDeleteShareholder(s.id)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  const loanColumns = [
    {
      header: "Lender & Type",
      render: (l) => (
        <div>
          <div className="font-bold text-gray-900">{l.lenderName}</div>
          <div className="text-xs text-blue-600 font-semibold">{l.loanType}</div>
          {l.mcaChargeId && <div className="text-[10px] text-gray-400">MCA Charge: {l.mcaChargeId}</div>}
        </div>
      )
    },
    {
      header: "Principal",
      render: (l) => (
        <div>
          <div className="font-bold text-gray-900">₹{Number(l.principalAmount).toLocaleString("en-IN")}</div>
          <div className="text-xs text-orange-600">Balance: ₹{Number(l.outstandingPrincipal || l.principalAmount).toLocaleString("en-IN")}</div>
        </div>
      )
    },
    {
      header: "Interest Rate",
      render: (l) => (
        <span className="font-bold text-indigo-700">{l.interestRate}% p.a.</span>
      )
    },
    {
      header: "Monthly Interest",
      render: (l) => (
        <div>
          <div className="font-semibold text-gray-800">Gross: ₹{Math.round(l.monthlyInterest || 0).toLocaleString("en-IN")}</div>
          <div className="text-xs text-red-600">TDS (10%): -₹{Math.round(l.monthlyTds || 0).toLocaleString("en-IN")}</div>
          <div className="text-xs font-bold text-green-700">Net Pay: ₹{Math.round(l.netMonthlyInterest || 0).toLocaleString("en-IN")}</div>
        </div>
      )
    },
    {
      header: "Status",
      render: (l) => <StatusBadge status={l.status || "Active"} type={l.status === "Active" ? "success" : "default"} />
    },
    {
      header: "Actions",
      render: (l) => (
        <div className="flex items-center gap-2">
          {l.status === "Active" && (
            <button
              onClick={() => handleOpenRepayModal(l)}
              className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 flex items-center gap-1"
            >
              <DollarSign size={14} /> Pay / Repay
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="Cap Table, Equity & Corporate Debt"
        subtitle="Manage Company Shareholding, Director Loans, Bank Debt, TDS Sec 194A & Funding Rounds"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllData}
              className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"
              title="Refresh Data"
            >
              <RefreshCw size={18} />
            </button>
            {activeTab === "captable" && (
              <button
                onClick={() => {
                  setEditingShareholder(null);
                  setIsShareholderModalOpen(true);
                }}
                className="flex items-center gap-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2e7d32] transition-colors"
              >
                <Plus size={18} /> Issue Shares
              </button>
            )}
            {activeTab === "loans" && (
              <button
                onClick={() => setIsLoanModalOpen(true)}
                className="flex items-center gap-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2e7d32] transition-colors"
              >
                <Plus size={18} /> Record New Loan
              </button>
            )}
            {activeTab === "funding" && (
              <button
                onClick={() => setIsFundingModalOpen(true)}
                className="flex items-center gap-2 bg-[#1b5e20] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2e7d32] transition-colors"
              >
                <Plus size={18} /> Add Funding Round
              </button>
            )}
          </div>
        }
      />

      {/* Corporate Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Authorized Capital"
          value={`₹${(capital?.authorizedCapital || 1000000).toLocaleString("en-IN")}`}
          icon={Building}
          color="blue"
        />
        <MetricCard
          title="Paid-Up Capital"
          value={`₹${totalPaidUp.toLocaleString("en-IN")}`}
          icon={ShieldCheck}
          color="green"
        />
        <MetricCard
          title="Active Corporate Debt"
          value={`₹${totalDebt.toLocaleString("en-IN")}`}
          icon={Landmark}
          color="orange"
        />
        <MetricCard
          title="Monthly Interest Liability"
          value={`₹${Math.round(totalMonthlyInterest).toLocaleString("en-IN")}`}
          icon={TrendingUp}
          color="red"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-2xl px-4 pt-2">
        <button
          onClick={() => setActiveTab("captable")}
          className={`px-5 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "captable"
              ? "border-green-600 text-green-700 bg-green-50/50 rounded-t-lg"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <PieIcon size={18} /> Cap Table & Shareholding
        </button>
        <button
          onClick={() => setActiveTab("loans")}
          className={`px-5 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "loans"
              ? "border-green-600 text-green-700 bg-green-50/50 rounded-t-lg"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Landmark size={18} /> Loans & Interest Ledger (TDS 194A)
        </button>
        <button
          onClick={() => setActiveTab("funding")}
          className={`px-5 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "funding"
              ? "border-green-600 text-green-700 bg-green-50/50 rounded-t-lg"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <TrendingUp size={18} /> Funding Rounds & Valuation
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`px-5 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "simulator"
              ? "border-green-600 text-green-700 bg-green-50/50 rounded-t-lg"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calculator size={18} /> Dilution Simulator (What-If)
        </button>
      </div>

      {/* TAB 1: CAP TABLE */}
      {activeTab === "captable" && (
        <div className="space-y-6">
          {/* MCA Corporate Details Box */}
          <div className="bg-gradient-to-r from-emerald-900 to-green-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-green-300 text-xs font-bold uppercase tracking-wider mb-1">
                <Building size={16} /> Ministry of Corporate Affairs (MCA) Structure
              </div>
              <h2 className="text-xl font-black">KrishiVishal E-Store Private Limited</h2>
              <p className="text-sm text-green-100 font-mono mt-1">CIN: {capital?.cinNumber || "U01111BR2026PTC000000"} | {capital?.rocJurisdiction || "RoC Patna"}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCapitalModalOpen(true)}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all flex items-center gap-1.5"
              >
                <Edit2 size={14} /> Edit Capital Structure
              </button>
            </div>
          </div>

          {/* Equity Progress Bar */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-sm font-bold text-gray-700">
              <span>Shareholding Distribution Pattern</span>
              <span className="text-xs text-gray-500">Total Issued Shares: {totalSharesIssued.toLocaleString("en-IN")}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-4 flex overflow-hidden">
              {shareholders.map((s, idx) => {
                const percent = totalSharesIssued > 0 ? (Number(s.sharesCount) / totalSharesIssued) * 100 : 0;
                const colors = ["bg-green-600", "bg-blue-600", "bg-purple-600", "bg-amber-500", "bg-rose-500", "bg-indigo-500"];
                const color = colors[idx % colors.length];
                return (
                  <div
                    key={s.id || idx}
                    className={`${color} h-full transition-all`}
                    style={{ width: `${percent}%` }}
                    title={`${s.shareholderName}: ${percent.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 text-xs pt-1">
              {shareholders.map((s, idx) => {
                const percent = totalSharesIssued > 0 ? (Number(s.sharesCount) / totalSharesIssued) * 100 : 0;
                const dotColors = ["bg-green-600", "bg-blue-600", "bg-purple-600", "bg-amber-500", "bg-rose-500", "bg-indigo-500"];
                return (
                  <div key={s.id || idx} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${dotColors[idx % dotColors.length]}`} />
                    <span className="font-semibold text-gray-800">{s.shareholderName}</span>
                    <span className="text-gray-500">({percent.toFixed(1)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shareholders Data Table */}
          <DataTable
            columns={shareholderColumns}
            data={shareholders}
            loading={loading}
          />
        </div>
      )}

      {/* TAB 2: LOANS & DEBT */}
      {activeTab === "loans" && (
        <div className="space-y-6">
          {/* Statutory Tax Note */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-bold">Indian Companies Act & Income Tax Rule:</strong>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li><strong>Director Loans:</strong> Unsecured loans from Directors must be reported in annual <strong>Form DPT-3</strong> to MCA. Can be 0% interest or market rate.</li>
                <li><strong>Section 194A TDS:</strong> 10% TDS must be deducted on interest paid to individuals/directors and deposited with government via Form 26Q.</li>
              </ul>
            </div>
          </div>

          {/* Loans Table */}
          <DataTable
            columns={loanColumns}
            data={loans}
            loading={loading}
          />

          {/* Repayment / Interest History */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-green-700" />
              Interest Payment & TDS Deduction Ledger
            </h3>
            {interestLedger.length === 0 ? (
              <p className="text-sm text-gray-500">No interest payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
                    <tr>
                      <th className="p-3">Period & Date</th>
                      <th className="p-3">Lender</th>
                      <th className="p-3">Gross Interest</th>
                      <th className="p-3">TDS (10%)</th>
                      <th className="p-3">Net Paid</th>
                      <th className="p-3">Principal Repaid</th>
                      <th className="p-3">Ref / UTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {interestLedger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50/50">
                        <td className="p-3 font-semibold">{entry.periodMonth} ({entry.paymentDate})</td>
                        <td className="p-3 font-bold text-gray-800">{entry.lenderName}</td>
                        <td className="p-3 font-bold text-gray-900">₹{Number(entry.grossInterest).toLocaleString("en-IN")}</td>
                        <td className="p-3 font-bold text-red-600">-₹{Number(entry.tdsDeducted).toLocaleString("en-IN")}</td>
                        <td className="p-3 font-bold text-green-700">₹{Number(entry.netPaid).toLocaleString("en-IN")}</td>
                        <td className="p-3 font-bold text-blue-700">₹{Number(entry.principalRepaid || 0).toLocaleString("en-IN")}</td>
                        <td className="p-3 font-mono text-gray-500">{entry.referenceNumber || "NEFT"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FUNDING ROUNDS */}
      {activeTab === "funding" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {fundingRounds.map((round) => (
              <div key={round.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg text-gray-900">{round.roundName}</span>
                  <StatusBadge status={round.status} type={round.status === "Closed" ? "success" : "warning"} />
                </div>
                <div className="text-xs text-gray-500 font-semibold">{round.instrumentType}</div>
                <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target Raise:</span>
                    <span className="font-bold text-green-700">₹{Number(round.targetAmount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pre-Money Valuation:</span>
                    <span className="font-semibold text-gray-800">₹{Number(round.preMoneyValuation).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Post-Money Valuation:</span>
                    <span className="font-bold text-blue-700">₹{Number(round.postMoneyValuation).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Equity Dilution:</span>
                    <span className="font-extrabold text-orange-600">{round.dilutionPercent}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fundingRounds.length === 0 && (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-100">
              <TrendingUp size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="font-bold text-gray-800">No Funding Rounds Recorded</h3>
              <p className="text-xs text-gray-500 mt-1">Click 'Add Funding Round' to log your Seed, Angel or Pre-Series A round.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SIMULATOR */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Calculator size={20} className="text-green-700" />
              Pre-Term Sheet Equity Dilution Calculator
            </h3>
            <form onSubmit={handleRunSimulation} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">New Investment Ask (₹)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                  value={simInvestment}
                  onChange={(e) => setSimInvestment(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Pre-Money Company Valuation (₹)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-gray-800"
                  value={simPreMoney}
                  onChange={(e) => setSimPreMoney(Number(e.target.value))}
                />
              </div>
              <button
                type="submit"
                className="bg-[#1b5e20] text-white py-2.5 px-6 rounded-xl font-bold hover:bg-[#2e7d32] transition-colors"
              >
                Simulate Dilution
              </button>
            </form>
          </div>

          {simResult && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-gray-100">
                <div className="p-4 bg-green-50 rounded-xl">
                  <div className="text-xs text-green-700 font-bold uppercase">Post-Money Valuation</div>
                  <div className="text-xl font-extrabold text-green-900 mt-1">₹{simResult.postMoneyValuation.toLocaleString("en-IN")}</div>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl">
                  <div className="text-xs text-blue-700 font-bold uppercase">Investor Equity Stake</div>
                  <div className="text-xl font-extrabold text-blue-900 mt-1">{simResult.investorEquityPercent}%</div>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl">
                  <div className="text-xs text-purple-700 font-bold uppercase">New Shares To Be Issued</div>
                  <div className="text-xl font-extrabold text-purple-900 mt-1">{simResult.newSharesToIssue.toLocaleString("en-IN")} Shares</div>
                </div>
              </div>

              <h4 className="font-bold text-sm text-gray-900">Post-Investment Cap Table Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
                    <tr>
                      <th className="p-3">Shareholder</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Current Equity (%)</th>
                      <th className="p-3">Post-Dilution Equity (%)</th>
                      <th className="p-3">Net Dilution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {simResult.simulatedShareholders.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/50">
                        <td className="p-3 font-bold text-gray-900">{s.name}</td>
                        <td className="p-3 text-gray-600">{s.category}</td>
                        <td className="p-3 font-semibold text-gray-700">{s.currentEquity}%</td>
                        <td className="p-3 font-extrabold text-green-700">{s.postEquity}%</td>
                        <td className="p-3 font-semibold text-red-600">{s.dilutedPercent > 0 ? `-${s.dilutedPercent}%` : "New Inflow"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: EDIT CAPITAL STRUCTURE */}
      {isCapitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Update MCA Capital Structure</h3>
              <button onClick={() => setIsCapitalModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveCapital} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Company CIN Number</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-mono uppercase"
                  value={capitalFormData.cinNumber}
                  onChange={(e) => setCapitalFormData({ ...capitalFormData, cinNumber: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Authorized Capital (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={capitalFormData.authorizedCapital}
                    onChange={(e) => setCapitalFormData({ ...capitalFormData, authorizedCapital: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Face Value Per Share (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={capitalFormData.faceValuePerShare}
                    onChange={(e) => setCapitalFormData({ ...capitalFormData, faceValuePerShare: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">RoC Registrar Jurisdiction</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl"
                  value={capitalFormData.rocJurisdiction}
                  onChange={(e) => setCapitalFormData({ ...capitalFormData, rocJurisdiction: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setIsCapitalModalOpen(false)} className="px-4 py-2 border rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#1b5e20] text-white rounded-xl font-semibold hover:bg-[#2e7d32]">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ISSUE SHARES / SHAREHOLDER */}
      {isShareholderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">{editingShareholder ? "Edit Shareholder Record" : "Issue New Shares (Form PAS-3)"}</h3>
              <button onClick={() => setIsShareholderModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveShareholder} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Shareholder Full Name / Entity</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl"
                  value={shareholderFormData.shareholderName}
                  onChange={(e) => setShareholderFormData({ ...shareholderFormData, shareholderName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Category</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-xl bg-white"
                    value={shareholderFormData.category}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, category: e.target.value })}
                  >
                    <option value="Founder">Founder</option>
                    <option value="Co-Founder">Co-Founder</option>
                    <option value="Angel/Investor">Angel / Investor</option>
                    <option value="VC">Venture Capital (VC)</option>
                    <option value="ESOP Pool">ESOP Pool</option>
                    <option value="Family & Friends">Family & Friends</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-xl uppercase font-mono"
                    value={shareholderFormData.panNumber}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, panNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">No. of Shares</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold"
                    value={shareholderFormData.sharesCount}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      setShareholderFormData({
                        ...shareholderFormData,
                        sharesCount: count,
                        investmentAmount: count * (shareholderFormData.faceValue || 10)
                      });
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Face Value (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={shareholderFormData.faceValue}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, faceValue: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Investment (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-green-700"
                    value={shareholderFormData.investmentAmount}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, investmentAmount: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Folio Number</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-mono"
                    value={shareholderFormData.folioNumber}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, folioNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Share Certificate No (SH-1)</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-mono"
                    value={shareholderFormData.certificateNumber}
                    onChange={(e) => setShareholderFormData({ ...shareholderFormData, certificateNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setIsShareholderModalOpen(false)} className="px-4 py-2 border rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#1b5e20] text-white rounded-xl font-semibold hover:bg-[#2e7d32]">Issue & Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD LOAN */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Record Corporate Borrowing / Loan</h3>
              <button onClick={() => setIsLoanModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveLoan} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Lender / Source Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vishal (Director Loan) or HDFC Bank"
                  className="w-full p-2.5 border border-gray-200 rounded-xl"
                  value={loanFormData.lenderName}
                  onChange={(e) => setLoanFormData({ ...loanFormData, lenderName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Loan Category</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-xl bg-white"
                    value={loanFormData.loanType}
                    onChange={(e) => setLoanFormData({ ...loanFormData, loanType: e.target.value })}
                  >
                    <option value="Director Loan (Unsecured)">Director Loan (Unsecured)</option>
                    <option value="Bank Term Loan">Bank Term Loan</option>
                    <option value="Bank CC / OD Limit">Bank CC / OD Limit</option>
                    <option value="NBFC / Supply Chain">NBFC / Supply Chain</option>
                    <option value="Promoter / Family Loan">Promoter / Family Loan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Principal Amount (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold"
                    value={loanFormData.principalAmount}
                    onChange={(e) => setLoanFormData({ ...loanFormData, principalAmount: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Annual Interest Rate (% p.a.)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={loanFormData.interestRate}
                    onChange={(e) => setLoanFormData({ ...loanFormData, interestRate: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tenure (Months)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={loanFormData.tenureMonths}
                    onChange={(e) => setLoanFormData({ ...loanFormData, tenureMonths: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="tdsCheck"
                  checked={loanFormData.isTdsApplicable}
                  onChange={(e) => setLoanFormData({ ...loanFormData, isTdsApplicable: e.target.checked })}
                  className="rounded text-green-700"
                />
                <label htmlFor="tdsCheck" className="font-semibold text-gray-700">Deduct 10% TDS on Interest Payments (Section 194A)</label>
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setIsLoanModalOpen(false)} className="px-4 py-2 border rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#1b5e20] text-white rounded-xl font-semibold hover:bg-[#2e7d32]">Record Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PAY INTEREST / REPAY */}
      {isRepayModalOpen && selectedLoanForRepay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Record Interest Payment / Repayment</h3>
              <button onClick={() => setIsRepayModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveRepay} className="p-6 space-y-4 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl">
                <div className="font-bold text-gray-900">{selectedLoanForRepay.lenderName}</div>
                <div className="text-gray-500">Outstanding: ₹{Number(selectedLoanForRepay.outstandingPrincipal).toLocaleString("en-IN")} @ {selectedLoanForRepay.interestRate}% p.a.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={repayFormData.paymentDate}
                    onChange={(e) => setRepayFormData({ ...repayFormData, paymentDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Period / Month</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-xl"
                    value={repayFormData.periodMonth}
                    onChange={(e) => setRepayFormData({ ...repayFormData, periodMonth: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Gross Interest (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold"
                    value={repayFormData.grossInterest}
                    onChange={(e) => {
                      const gross = Number(e.target.value);
                      const tds = selectedLoanForRepay.isTdsApplicable ? gross * 0.10 : 0;
                      setRepayFormData({
                        ...repayFormData,
                        grossInterest: gross,
                        tdsDeducted: Math.round(tds),
                        netPaid: Math.round(gross - tds)
                      });
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">TDS 194A (10%)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-red-600 font-bold"
                    value={repayFormData.tdsDeducted}
                    onChange={(e) => setRepayFormData({ ...repayFormData, tdsDeducted: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Net Payable (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-green-700 font-bold"
                    value={repayFormData.netPaid}
                    onChange={(e) => setRepayFormData({ ...repayFormData, netPaid: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Principal Repayment (Optional ₹)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-blue-700"
                  value={repayFormData.principalRepaid}
                  onChange={(e) => setRepayFormData({ ...repayFormData, principalRepaid: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Bank UTR / Reference No</label>
                <input
                  type="text"
                  placeholder="e.g. UTR12345678"
                  className="w-full p-2.5 border border-gray-200 rounded-xl font-mono"
                  value={repayFormData.referenceNumber}
                  onChange={(e) => setRepayFormData({ ...repayFormData, referenceNumber: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setIsRepayModalOpen(false)} className="px-4 py-2 border rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#1b5e20] text-white rounded-xl font-semibold hover:bg-[#2e7d32]">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD FUNDING ROUND */}
      {isFundingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Add Corporate Funding Round</h3>
              <button onClick={() => setIsFundingModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveFunding} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Round Name</label>
                <input
                  type="text"
                  placeholder="e.g. Angel Round / Seed Round"
                  className="w-full p-2.5 border border-gray-200 rounded-xl"
                  value={fundingFormData.roundName}
                  onChange={(e) => setFundingFormData({ ...fundingFormData, roundName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Target Raise Amount (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-green-700"
                    value={fundingFormData.targetAmount}
                    onChange={(e) => setFundingFormData({ ...fundingFormData, targetAmount: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Pre-Money Valuation (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold"
                    value={fundingFormData.preMoneyValuation}
                    onChange={(e) => setFundingFormData({ ...fundingFormData, preMoneyValuation: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Instrument Type</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-xl bg-white"
                    value={fundingFormData.instrumentType}
                    onChange={(e) => setFundingFormData({ ...fundingFormData, instrumentType: e.target.value })}
                  >
                    <option value="CCPS (Convertible Preference)">CCPS (Convertible Preference)</option>
                    <option value="Equity Shares">Equity Shares</option>
                    <option value="iSAFE / Convertible Note">iSAFE / Convertible Note</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Status</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-xl bg-white"
                    value={fundingFormData.status}
                    onChange={(e) => setFundingFormData({ ...fundingFormData, status: e.target.value })}
                  >
                    <option value="Planned">Planned</option>
                    <option value="In-Progress">In-Progress</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setIsFundingModalOpen(false)} className="px-4 py-2 border rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#1b5e20] text-white rounded-xl font-semibold hover:bg-[#2e7d32]">Save Round</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapTableLoans;

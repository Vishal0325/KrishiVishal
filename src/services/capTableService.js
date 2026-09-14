import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  runTransaction 
} from "firebase/firestore";
import { db } from "../firebase/config";

const CAPITAL_DOC_ID = "krishivishal_capital_structure";

/**
 * CAPITAL STRUCTURE (Authorized vs Paid-Up)
 */
export const getCapitalStructure = async () => {
  try {
    const docRef = doc(db, "corporate_capital", CAPITAL_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }

    // [FIXED] Point #133: Fetch defaults from global config instead of hardcoding
    const configSnap = await getDoc(doc(db, "settings", "config"));
    const globalConfig = configSnap.exists() ? configSnap.data() : {};

    const defaultConfig = {
      authorizedCapital: 1000000, // ₹10,00,000
      authorizedShares: 100000,
      faceValuePerShare: 10, // ₹10 per share
      paidUpCapital: 100000, // ₹1,00,000
      totalIssuedShares: 10000,
      currency: "INR",
      cinNumber: globalConfig.cinNumber || "U01111BR2026PTC000000",
      rocJurisdiction: globalConfig.rocJurisdiction || "RoC Patna / Bihar",
      updatedAt: new Date().toISOString()
    };
    await setDoc(docRef, defaultConfig);
    return defaultConfig;
  } catch (error) {
    console.error("Error fetching capital structure:", error);
    throw error;
  }
};

export const updateCapitalStructure = async (data) => {
  try {
    const docRef = doc(db, "corporate_capital", CAPITAL_DOC_ID);
    await setDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Error updating capital structure:", error);
    throw error;
  }
};

/**
 * SHAREHOLDERS & CAP TABLE
 */
export const getShareholders = async () => {
  try {
    const colRef = collection(db, "corporate_shareholders");
    const snap = await getDocs(colRef);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return list;
  } catch (error) {
    console.error("Error fetching shareholders:", error);
    return [];
  }
};

export const addShareholder = async (data) => {
  try {
    const { runTransaction, collection, doc } = await import("firebase/firestore");

    // [FIXED] Point #124: Use a transaction to atomically add shareholder and update company paid-up capital
    return await runTransaction(db, async (transaction) => {
      const colRef = collection(db, "corporate_shareholders");
      const capitalDocRef = doc(db, "corporate_capital", CAPITAL_DOC_ID);

      const newShareholderRef = doc(colRef);
      const sharesCount = Number(data.sharesCount) || 0;
      const investmentAmount = Number(data.investmentAmount) || 0;
      const faceValue = Number(data.faceValue) || 10;

      transaction.set(newShareholderRef, {
        ...data,
        sharesCount,
        investmentAmount,
        faceValue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update aggregate paid-up capital
      const capitalSnap = await transaction.get(capitalDocRef);
      if (capitalSnap.exists()) {
        const capData = capitalSnap.data();
        transaction.update(capitalDocRef, {
          paidUpCapital: (Number(capData.paidUpCapital) || 0) + investmentAmount,
          totalIssuedShares: (Number(capData.totalIssuedShares) || 0) + sharesCount,
          updatedAt: new Date().toISOString()
        });
      }

      return newShareholderRef.id;
    });
  } catch (error) {
    console.error("Error adding shareholder:", error);
    throw error;
  }
};

export const updateShareholder = async (id, data) => {
  try {
    const docRef = doc(db, "corporate_shareholders", id);
    await updateDoc(docRef, {
      ...data,
      sharesCount: Number(data.sharesCount) || 0,
      investmentAmount: Number(data.investmentAmount) || 0,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Error updating shareholder:", error);
    throw error;
  }
};

export const deleteShareholder = async (id) => {
  try {
    const docRef = doc(db, "corporate_shareholders", id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting shareholder:", error);
    throw error;
  }
};

/**
 * CORPORATE LOANS & BORROWINGS (Director Loan, Bank CC/OD, NBFC)
 */
export const getCorporateLoans = async () => {
  try {
    const colRef = collection(db, "corporate_loans");
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching corporate loans:", error);
    return [];
  }
};

export const addCorporateLoan = async (data) => {
  try {
    const colRef = collection(db, "corporate_loans");
    // [FIXED] Point #132: Added robust number parsing to prevent NaN in finance modules
    const principal = parseFloat(String(data.principalAmount).replace(/[^0-9.]/g, '')) || 0;
    const rate = parseFloat(String(data.interestRate).replace(/[^0-9.]/g, '')) || 0;
    const tenure = parseInt(String(data.tenureMonths).replace(/[^0-9]/g, '')) || 12;

    // [FIXED] Point #159: Fetch dynamic TDS rate from settings instead of hardcoded 10%
    const configSnap = await getDoc(doc(db, "settings", "config"));
    const tdsRate = configSnap.exists() ? (Number(configSnap.data().tdsRateCorporateLoan) || 10) / 100 : 0.10;

    const isTds = data.isTdsApplicable !== false;
    
    // Monthly interest calculation
    const monthlyInterest = (principal * rate) / (12 * 100);
    const monthlyTds = isTds ? (monthlyInterest * tdsRate) : 0;
    const netMonthlyInterest = monthlyInterest - monthlyTds;

    const docRef = await addDoc(colRef, {
      ...data,
      principalAmount: principal,
      interestRate: rate,
      tenureMonths: tenure,
      monthlyInterest,
      monthlyTds,
      netMonthlyInterest,
      outstandingPrincipal: principal,
      totalInterestPaid: 0,
      totalTdsDeducted: 0,
      status: "Active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding corporate loan:", error);
    throw error;
  }
};

export const updateCorporateLoan = async (id, data) => {
  try {
    const docRef = doc(db, "corporate_loans", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Error updating corporate loan:", error);
    throw error;
  }
};

export const deleteCorporateLoan = async (id) => {
  try {
    const docRef = doc(db, "corporate_loans", id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting corporate loan:", error);
    throw error;
  }
};

/**
 * INTEREST & REPAYMENT LEDGER
 */
export const getInterestLedger = async (loanId = null) => {
  try {
    const colRef = collection(db, "corporate_interest_ledger");
    const snap = await getDocs(colRef);
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (loanId) {
      list = list.filter(item => item.loanId === loanId);
    }
    return list.sort((a, b) => new Date(b.periodDate || b.createdAt) - new Date(a.periodDate || a.createdAt));
  } catch (error) {
    console.error("Error fetching interest ledger:", error);
    return [];
  }
};

export const recordInterestPayment = async (data) => {
  try {
    // [FIXED] Point #70: Use runTransaction to ensure atomic update of ledger and loan outstanding
    return await runTransaction(db, async (transaction) => {
      const colRef = collection(db, "corporate_interest_ledger");
      const ledgerDocRef = doc(colRef);

      const payload = {
        ...data,
        grossInterest: Number(data.grossInterest) || 0,
        tdsDeducted: Number(data.tdsDeducted) || 0,
        netPaid: Number(data.netPaid) || 0,
        principalRepaid: Number(data.principalRepaid) || 0,
        paymentDate: data.paymentDate || new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString()
      };

      transaction.set(ledgerDocRef, payload);

      // Update loan outstanding
      if (data.loanId) {
        const loanRef = doc(db, "corporate_loans", data.loanId);
        const loanSnap = await transaction.get(loanRef);
        if (loanSnap.exists()) {
          const currentLoan = loanSnap.data();
          const newOutstanding = Math.max(0, (currentLoan.outstandingPrincipal || 0) - Number(data.principalRepaid || 0));
          const newTotalInterest = (currentLoan.totalInterestPaid || 0) + Number(data.netPaid || 0);
          const newTotalTds = (currentLoan.totalTdsDeducted || 0) + Number(data.tdsDeducted || 0);

          transaction.update(loanRef, {
            outstandingPrincipal: newOutstanding,
            totalInterestPaid: newTotalInterest,
            totalTdsDeducted: newTotalTds,
            status: newOutstanding === 0 ? "Closed" : "Active",
            updatedAt: new Date().toISOString()
          });
        }
      }

      // [FIXED] Point #127: Record corresponding entry in company's main financial ledger
      const mainLedgerRef = doc(collection(db, "ledger"));
      transaction.set(mainLedgerRef, {
        account: "CORPORATE_DEBT_INTEREST",
        type: "DEBIT",
        amount: Number(data.netPaid) || 0,
        description: `Interest repayment for Loan ID: ${data.loanId}`,
        referenceId: ledgerDocRef.id,
        timestamp: serverTimestamp(),
        actorId: "SYSTEM_FINANCE"
      });

      return ledgerDocRef.id;
    });
  } catch (error) {
    console.error("Error recording interest payment:", error);
    throw error;
  }
};

/**
 * FUNDING ROUNDS & VALUATION
 */
export const getFundingRounds = async () => {
  try {
    const colRef = collection(db, "corporate_funding_rounds");
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching funding rounds:", error);
    return [];
  }
};

export const addFundingRound = async (data) => {
  try {
    const colRef = collection(db, "corporate_funding_rounds");
    // [FIXED] Point #132: Robust number parsing for funding rounds
    const targetAmount = parseFloat(String(data.targetAmount).replace(/[^0-9.]/g, '')) || 0;
    const preMoneyValuation = parseFloat(String(data.preMoneyValuation).replace(/[^0-9.]/g, '')) || 0;
    const postMoneyValuation = preMoneyValuation + targetAmount;
    const dilutionPercent = postMoneyValuation > 0 ? ((targetAmount / postMoneyValuation) * 100) : 0;

    const docRef = await addDoc(colRef, {
      ...data,
      targetAmount,
      preMoneyValuation,
      postMoneyValuation,
      dilutionPercent: parseFloat(dilutionPercent.toFixed(2)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding funding round:", error);
    throw error;
  }
};

/**
 * CALCULATORS & UTILITIES
 */
export const calculateMonthlyInterestAndTDS = (principal, annualRate, isTdsApplicable = true) => {
  const p = Number(principal) || 0;
  const r = Number(annualRate) || 0;
  const monthlyInterest = (p * r) / (12 * 100);
  const monthlyTds = isTdsApplicable ? (monthlyInterest * 0.10) : 0;
  const netMonthlyInterest = monthlyInterest - monthlyTds;

  // [FIXED] Point #71: Removed mid-calculation rounding to preserve financial precision.
  // Values are kept as floating point numbers and should be rounded only at display or final ledger entry.
  return {
    grossMonthlyInterest: parseFloat(monthlyInterest.toFixed(4)),
    tdsDeduction: parseFloat(monthlyTds.toFixed(4)),
    netMonthlyInterest: parseFloat(netMonthlyInterest.toFixed(4)),
    annualGrossInterest: parseFloat((monthlyInterest * 12).toFixed(4)),
    annualTds: parseFloat((monthlyTds * 12).toFixed(4))
  };
};

export const simulateDilution = (shareholders = [], newInvestment = 0, preMoneyValuation = 0) => {
  const investment = Number(newInvestment) || 0;
  const preVal = Number(preMoneyValuation) || 0;
  const postVal = preVal + investment;

  const totalCurrentShares = shareholders.reduce((acc, s) => acc + (Number(s.sharesCount) || 0), 0);
  if (totalCurrentShares === 0 || postVal === 0) return { postMoneyValuation: postVal, simulatedShareholders: [] };

  const investorEquityPercent = (investment / postVal) * 100;
  const newSharesToIssue = Math.round((investorEquityPercent / (100 - investorEquityPercent)) * totalCurrentShares);
  const totalPostShares = totalCurrentShares + newSharesToIssue;

  const simulatedShareholders = shareholders.map(s => {
    const currentShares = Number(s.sharesCount) || 0;
    const currentEquity = totalCurrentShares > 0 ? (currentShares / totalCurrentShares) * 100 : 0;
    const postEquity = totalPostShares > 0 ? (currentShares / totalPostShares) * 100 : 0;
    const dilutedBy = currentEquity - postEquity;

    return {
      id: s.id,
      name: s.shareholderName,
      category: s.category,
      sharesCount: currentShares,
      currentEquity: parseFloat(currentEquity.toFixed(2)),
      postEquity: parseFloat(postEquity.toFixed(2)),
      dilutedPercent: parseFloat(dilutedBy.toFixed(2))
    };
  });

  simulatedShareholders.push({
    id: "new_investor",
    name: "New Investor Pool",
    category: "New Investor",
    sharesCount: newSharesToIssue,
    currentEquity: 0,
    postEquity: parseFloat(investorEquityPercent.toFixed(2)),
    dilutedPercent: 0
  });

  return {
    preMoneyValuation: preVal,
    newInvestment: investment,
    postMoneyValuation: postVal,
    totalPreShares: totalCurrentShares,
    newSharesToIssue,
    totalPostShares,
    investorEquityPercent: parseFloat(investorEquityPercent.toFixed(2)),
    simulatedShareholders
  };
};

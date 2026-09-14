import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import { addAuditLog } from "./logger";

// ==========================================
// 1. STATUTORY FORMULA CALCULATOR
// ==========================================

export function calculateSalaryBreakdown(monthlyGross, options = {}) {
  const gross = Number(monthlyGross) || 0;
  if (gross <= 0) {
    return {
      basic: 0,
      hra: 0,
      conveyance: 0,
      specialAllowance: 0,
      grossEarnings: 0,
      employeePf: 0,
      employerPf: 0,
      employeeEsic: 0,
      employerEsic: 0,
      pt: 0,
      tds: 0,
      totalDeductions: 0,
      netPay: 0,
    };
  }

  // Standard Indian Salary Structure
  // Basic = 50% of Gross
  const basic = Math.round(gross * 0.50);
  // HRA = 40% of Basic
  const hra = Math.round(basic * 0.40);
  // Conveyance = Fixed ₹1,600 (or 0 if gross is low)
  const conveyance = gross > 15000 ? 1600 : 0;
  // Special Allowance = Remaining Balance
  const specialAllowance = Math.max(0, gross - (basic + hra + conveyance));

  // --- STATUTORY DEDUCTIONS ---
  // 1. EPF: 12% of Basic (capped at ₹15,000 basic or actual if opted)
  const pfWage = options.capPfAt15k ? Math.min(15000, basic) : basic;
  const isPfApplicable = options.enablePf !== false;
  const employeePf = isPfApplicable ? Math.round(pfWage * 0.12) : 0;
  const employerPf = isPfApplicable ? Math.round(pfWage * 0.12) : 0; // 3.67% EPF + 8.33% EPS

  // 2. ESIC: 0.75% of Gross (Applicable only if Gross <= ₹21,000/month)
  const isEsicApplicable = options.enableEsic !== false && gross <= 21000;
  const employeeEsic = isEsicApplicable ? Math.ceil(gross * 0.0075) : 0;
  const employerEsic = isEsicApplicable ? Math.ceil(gross * 0.0325) : 0;

  // 3. Professional Tax (PT): State-wise slabs
  let pt = 0;
  if (options.enablePt !== false) {
    // [FIXED] Point #115: Support dynamic state-wise PT slabs from config instead of hardcoded Bihar defaults
    const ptSlabs = options.ptSlabs || [
      { threshold: 25000, amount: 200 },
      { threshold: 15000, amount: 150 },
      { threshold: 10000, amount: 100 }
    ];

    const matchedSlab = ptSlabs.find(s => gross > s.threshold);
    pt = matchedSlab ? matchedSlab.amount : 0;
  }

  // 4. TDS on Salary (Estimated Monthly)
  const tds = Number(options.monthlyTds) || 0;

  const totalDeductions = employeePf + employeeEsic + pt + tds;
  const netPay = gross - totalDeductions;

  return {
    basic,
    hra,
    conveyance,
    specialAllowance,
    grossEarnings: gross,
    employeePf,
    employerPf,
    employeeEsic,
    employerEsic,
    pt,
    tds,
    totalDeductions,
    netPay,
  };
}

// ==========================================
// 2. EMPLOYEE SALARY STRUCTURE CRUD
// ==========================================

export async function getSalaryStructures() {
  try {
    const snapshot = await getDocs(collection(db, "employee_salary_structures"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching salary structures:", error);
    throw error;
  }
}

export async function saveEmployeeSalaryStructure(employeeId, data) {
  try {
    const docRef = doc(db, "employee_salary_structures", employeeId);
    const breakdown = calculateSalaryBreakdown(data.monthlyGross, {
      enablePf: data.enablePf,
      enableEsic: data.enableEsic,
      enablePt: data.enablePt,
      monthlyTds: data.monthlyTds,
      capPfAt15k: data.capPfAt15k,
    });

    const payload = {
      employeeId,
      employeeName: data.employeeName,
      department: data.department || "Operations",
      monthlyGross: Number(data.monthlyGross) || 0,
      annualCtc: (Number(data.monthlyGross) || 0) * 12,
      uanNumber: data.uanNumber || "",
      esicNumber: data.esicNumber || "",
      panNumber: data.panNumber || "",
      bankAccountNumber: data.bankAccountNumber || "",
      bankIfsc: data.bankIfsc || "",
      bankName: data.bankName || "",
      taxRegime: data.taxRegime || "NEW",
      breakdown,
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });
    await addAuditLog("UPDATE_SALARY_STRUCTURE", "SalaryStructure", employeeId, { monthlyGross: data.monthlyGross });
    return true;
  } catch (error) {
    console.error("Error saving salary structure:", error);
    throw error;
  }
}

// ==========================================
// 3. MONTHLY PAYROLL RUNS & PAYSLIPS
// ==========================================

export async function getPayrollRuns(monthStr) {
  try {
    let q = query(collection(db, "monthly_payroll_runs"), orderBy("createdAt", "desc"));
    if (monthStr) {
      q = query(q, where("month", "==", monthStr));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching payroll runs:", error);
    throw error;
  }
}

// [FIXED] Point #102 helper: Fetch payslips from sub-collection
export async function getPayslipsByRun(runId) {
  try {
    const snapshot = await getDocs(collection(db, "monthly_payroll_runs", runId, "payslips"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching payslips for run:", runId, error);
    throw error;
  }
}

export async function generateMonthlyPayroll(monthStr, employeesWithSalaries) {
  try {
    const user = auth.currentUser;
    const runId = `PAY-${monthStr}`;
    const docRef = doc(db, "monthly_payroll_runs", runId);

    const payslips = employeesWithSalaries.map(emp => {
      const breakdown = emp.breakdown || calculateSalaryBreakdown(emp.monthlyGross);
      const lopDays = emp.lopDays || 0;
      const daysInMonth = emp.daysInMonth || 30;
      const lopDeduction = lopDays > 0 ? Math.round((breakdown.grossEarnings / daysInMonth) * lopDays) : 0;
      const adjustedGross = Math.max(0, breakdown.grossEarnings - lopDeduction);
      const adjustedNet = Math.max(0, breakdown.netPay - lopDeduction);

      return {
        payslipId: `SLIP-${emp.employeeId}-${monthStr}`,
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        department: emp.department,
        designation: emp.designation || "Staff",
        panNumber: emp.panNumber || "",
        uanNumber: emp.uanNumber || "",
        esicNumber: emp.esicNumber || "",
        bankAccountNumber: emp.bankAccountNumber || "",
        bankIfsc: emp.bankIfsc || "",
        bankName: emp.bankName || "",
        month: monthStr,
        daysInMonth,
        lopDays,
        lopDeduction,
        earnings: {
          basic: breakdown.basic,
          hra: breakdown.hra,
          conveyance: breakdown.conveyance,
          specialAllowance: breakdown.specialAllowance,
          gross: adjustedGross,
        },
        deductions: {
          pf: breakdown.employeePf,
          esic: breakdown.employeeEsic,
          pt: breakdown.pt,
          tds: breakdown.tds,
          lop: lopDeduction,
          total: breakdown.totalDeductions + lopDeduction,
        },
        netSalary: adjustedNet,
        status: "GENERATED",
      };
    });

    const totalGross = payslips.reduce((sum, p) => sum + p.earnings.gross, 0);
    const totalDeductions = payslips.reduce((sum, p) => sum + p.deductions.total, 0);
    const totalNet = payslips.reduce((sum, p) => sum + p.netSalary, 0);
    const totalPf = payslips.reduce((sum, p) => sum + p.deductions.pf, 0);
    const totalEsic = payslips.reduce((sum, p) => sum + p.deductions.esic, 0);

    const payload = {
      runId,
      month: monthStr,
      status: "COMPLETED", // DRAFT, COMPLETED, DISBURSED
      totalEmployees: payslips.length,
      totalGross,
      totalDeductions,
      totalNet,
      totalPf,
      totalEsic,
      // [FIXED] Point #102: Removed massive payslips array from main document to avoid 1MB limit.
      // Individual payslips are now stored in a sub-collection.
      generatedBy: user?.email || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.set(docRef, payload);

    // Save individual payslips in sub-collection
    payslips.forEach(slip => {
      const slipRef = doc(db, "monthly_payroll_runs", runId, "payslips", slip.payslipId);
      batch.set(slipRef, slip);
    });

    await batch.commit();
    await addAuditLog("GENERATE_PAYROLL", "MonthlyPayroll", runId, { month: monthStr, totalNet });
    return payload;
  } catch (error) {
    console.error("Error generating monthly payroll:", error);
    throw error;
  }
}

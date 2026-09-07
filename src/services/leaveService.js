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
  runTransaction
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import { addAuditLog } from "./logger";

// ==========================================
// 1. LEAVE REQUESTS & APPROVALS
// ==========================================

export async function getLeaveRequests(filters = {}) {
  try {
    let q = query(collection(db, "leave_requests"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    if (filters.employeeId) {
      q = query(q, where("employeeId", "==", filters.employeeId));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    throw error;
  }
}

export async function applyLeave(leaveData) {
  try {
    const user = auth.currentUser;
    const leaveId = `LV-${Date.now().toString().slice(-6)}`;
    const docRef = doc(db, "leave_requests", leaveId);

    // Calculate duration in days
    const start = new Date(leaveData.startDate);
    const end = new Date(leaveData.endDate || leaveData.startDate);
    const daysCount = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    const payload = {
      ...leaveData,
      leaveId,
      daysCount: leaveData.isHalfDay ? 0.5 : daysCount,
      status: "PENDING", // PENDING, APPROVED, REJECTED, CANCELLED
      appliedBy: user?.email || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("APPLY_LEAVE", "LeaveRequest", leaveId, {
      employeeName: leaveData.employeeName,
      leaveType: leaveData.leaveType,
      daysCount: payload.daysCount
    });

    return leaveId;
  } catch (error) {
    console.error("Error applying for leave:", error);
    throw error;
  }
}

export async function updateLeaveStatus(leaveId, status, remarks = "") {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "leave_requests", leaveId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Leave request not found");

    const leaveData = docSnap.data();

    await updateDoc(docRef, {
      status, // APPROVED, REJECTED
      adminRemarks: remarks,
      actionTakenBy: user?.email || "admin",
      actionTakenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // If Approved, deduct from leave balance
    if (status === "APPROVED" && leaveData.employeeId && leaveData.leaveType !== "LOP") {
      const balanceRef = doc(db, "leave_balances", leaveData.employeeId);
      const balanceSnap = await getDoc(balanceRef);
      if (balanceSnap.exists()) {
        const balData = balanceSnap.data();
        const typeKey = leaveData.leaveType.toLowerCase(); // cl, sl, pl
        const currentUsed = balData[`${typeKey}Used`] || 0;
        await updateDoc(balanceRef, {
          [`${typeKey}Used`]: currentUsed + leaveData.daysCount,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await addAuditLog("UPDATE_LEAVE_STATUS", "LeaveRequest", leaveId, { status, remarks });
    return true;
  } catch (error) {
    console.error("Error updating leave status:", error);
    throw error;
  }
}

// ==========================================
// 2. LEAVE BALANCES
// ==========================================

export async function getLeaveBalances() {
  try {
    const snapshot = await getDocs(collection(db, "leave_balances"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching leave balances:", error);
    throw error;
  }
}

export async function initializeLeaveBalance(employeeId, employeeName, department = "Operations") {
  try {
    const docRef = doc(db, "leave_balances", employeeId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      const defaultBalance = {
        employeeId,
        employeeName,
        department,
        clTotal: 12, // Casual Leave
        clUsed: 0,
        slTotal: 12, // Sick Leave
        slUsed: 0,
        plTotal: 15, // Privilege / Earned Leave
        plUsed: 0,
        compOffTotal: 0,
        compOffUsed: 0,
        year: new Date().getFullYear(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, defaultBalance);
      return defaultBalance;
    }
    return docSnap.data();
  } catch (error) {
    console.error("Error initializing leave balance:", error);
    throw error;
  }
}

// ==========================================
// 3. DAILY ATTENDANCE & PUNCH RECORDS
// ==========================================

export async function getAttendanceByDate(dateStr) {
  try {
    const q = query(
      collection(db, "employee_attendance"),
      where("date", "==", dateStr)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching attendance for date:", error);
    throw error;
  }
}

export async function markAttendance(attendanceData) {
  try {
    const user = auth.currentUser;
    const docId = `${attendanceData.employeeId}_${attendanceData.date}`;
    const docRef = doc(db, "employee_attendance", docId);

    const payload = {
      ...attendanceData,
      status: attendanceData.status || "PRESENT", // PRESENT, LATE, HALF_DAY, ON_LEAVE, ABSENT, WEEKLY_OFF
      punchIn: attendanceData.punchIn || "09:00 AM",
      punchOut: attendanceData.punchOut || "06:00 PM",
      workingHours: attendanceData.workingHours || 9,
      overtimeHours: attendanceData.overtimeHours || 0,
      markedBy: user?.email || "admin",
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });
    await addAuditLog("MARK_ATTENDANCE", "EmployeeAttendance", docId, {
      employeeName: attendanceData.employeeName,
      status: payload.status,
      date: attendanceData.date
    });

    return true;
  } catch (error) {
    console.error("Error marking attendance:", error);
    throw error;
  }
}

// ==========================================
// 4. STATUTORY & COMPANY HOLIDAYS
// ==========================================

export async function getCompanyHolidays(year = new Date().getFullYear()) {
  try {
    const docRef = doc(db, "company_holidays", String(year));
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data().holidays || [];
    }

    // Default Bihar/National Statutory Holidays
    const defaultHolidays = [
      { date: `${year}-01-26`, title: "Republic Day", type: "National Holiday" },
      { date: `${year}-03-14`, title: "Holi", type: "Festival" },
      { date: `${year}-03-22`, title: "Bihar Diwas", type: "State Holiday" },
      { date: `${year}-04-14`, title: "Ambedkar Jayanti", type: "Gazetted" },
      { date: `${year}-05-01`, title: "Labour Day", type: "Statutory" },
      { date: `${year}-08-15`, title: "Independence Day", type: "National Holiday" },
      { date: `${year}-10-02`, title: "Gandhi Jayanti", type: "National Holiday" },
      { date: `${year}-10-20`, title: "Durga Puja (Vijayadashami)", type: "Festival" },
      { date: `${year}-11-01`, title: "Diwali (Deepawali)", type: "Festival" },
      { date: `${year}-11-07`, title: "Chhath Puja", type: "State Festival" },
      { date: `${year}-12-25`, title: "Christmas Day", type: "Gazetted" },
    ];

    await setDoc(docRef, { year, holidays: defaultHolidays, updatedAt: serverTimestamp() });
    return defaultHolidays;
  } catch (error) {
    console.error("Error fetching company holidays:", error);
    throw error;
  }
}

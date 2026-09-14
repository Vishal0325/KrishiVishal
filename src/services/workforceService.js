import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { addAuditLog } from "./logger";

// [FIXED] Point #93: Moved ID generation to server-side Cloud Function
export async function generateWorkforceId(type = 'EMP') {
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const functions = getFunctions();
    const generateId = httpsCallable(functions, "generateWorkforceId");
    const result = await generateId({ type });
    return result.data.workforceId;
  } catch (error) {
    console.error("Error generating workforce ID:", error);
    throw new Error("Failed to generate ID");
  }
}

// ----------------- EMPLOYEES -----------------

export async function createEmployee(employeeData) {
  try {
    const employeeId = await generateWorkforceId('EMP');
    const docRef = doc(db, "employees", employeeId);
    
    const payload = {
      ...employeeData,
      employeeId,
      status: employeeData.status || "Draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(docRef, payload);

    // [FIXED] Point #114: Initialize leave balance during employee creation instead of loop in UI
    const { initializeLeaveBalance } = await import("./leaveService");
    await initializeLeaveBalance(employeeId, `${employeeData.firstName} ${employeeData.lastName}`.trim(), employeeData.department);

    await addAuditLog("CREATE_EMPLOYEE", "Employee", employeeId, { employeeId });
    
    return employeeId;
  } catch (error) {
    console.error("Error creating employee:", error);
    throw error;
  }
}

export async function updateEmployee(employeeId, updates) {
  try {
    const docRef = doc(db, "employees", employeeId);
    
    const payload = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_EMPLOYEE", "Employee", employeeId, { updates });
    
    return true;
  } catch (error) {
    console.error("Error updating employee:", error);
    throw error;
  }
}

export async function getEmployees(filters = {}) {
  try {
    let q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
    
    // Apply filters if needed
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    if (filters.departmentId) {
      q = query(q, where("departmentId", "==", filters.departmentId));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching employees:", error);
    throw error;
  }
}

export async function getEmployeeById(employeeId) {
  try {
    const docRef = doc(db, "employees", employeeId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching employee:", error);
    throw error;
  }
}

// ----------------- RIDER HR PROFILES -----------------

export async function createRiderHRProfile(riderData, operationalRiderId) {
  try {
    const hrRiderId = await generateWorkforceId('RDR');
    const docRef = doc(db, "rider_hr_profiles", hrRiderId);
    
    const payload = {
      ...riderData,
      hrRiderId,
      riderId: operationalRiderId, // Link to operational `riders` collection
      status: riderData.status || "Draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(docRef, payload);
    await addAuditLog("CREATE_RIDER_HR", "RiderHR", hrRiderId, { hrRiderId, operationalRiderId });
    
    return hrRiderId;
  } catch (error) {
    console.error("Error creating rider HR profile:", error);
    throw error;
  }
}

export async function updateRiderHRProfile(hrRiderId, updates) {
  try {
    const docRef = doc(db, "rider_hr_profiles", hrRiderId);
    
    const payload = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_RIDER_HR", "RiderHR", hrRiderId, { updates });
    
    return true;
  } catch (error) {
    console.error("Error updating rider HR profile:", error);
    throw error;
  }
}

export async function getRiderHRProfiles() {
  try {
    const q = query(collection(db, "rider_hr_profiles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching rider HR profiles:", error);
    throw error;
  }
}

export async function getRiderHRProfileById(hrRiderId) {
  try {
    const docRef = doc(db, "rider_hr_profiles", hrRiderId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching rider HR profile:", error);
    throw error;
  }
}

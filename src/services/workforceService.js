import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { addAuditLog } from "./logger";

// Generate a sequential ID (e.g., KV-EMP-000001)
export async function generateWorkforceId(type = 'EMP') {
  const counterRef = doc(db, 'system_counters', `workforce_${type.toLowerCase()}`);
  
  // Use a transaction to ensure unique sequential IDs
  // Note: For client-side, we use runTransaction. Since this is an admin panel, 
  // we could use Cloud Functions, but doing it here is fine as long as we use transaction.
  const { runTransaction } = await import("firebase/firestore");
  
  try {
    const newId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let currentSeq = 0;
      
      if (counterDoc.exists()) {
        currentSeq = counterDoc.data().seq || 0;
      }
      
      const nextSeq = currentSeq + 1;
      const formattedSeq = String(nextSeq).padStart(6, '0');
      const generatedId = `KV-${type}-${formattedSeq}`;
      
      transaction.set(counterRef, { seq: nextSeq }, { merge: true });
      
      return generatedId;
    });
    
    return newId;
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

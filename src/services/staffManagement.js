import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db, firebaseConfig, auth } from "../firebase/config";

const functions = getFunctions(initializeApp(firebaseConfig));

/**
 * Creates a new staff member account and saves their role/details in Firestore.
 */
export async function createStaffMember(email, password, name, role, warehouseId = null, hierarchyData = {}) {
  try {
    const createStaff = httpsCallable(functions, 'createStaffMember');
    const result = await createStaff({ email, password, name, role });
    const uid = result?.data?.uid;
    
    const updates = {
      updatedAt: serverTimestamp(),
      ...(warehouseId ? { warehouseId } : {}),
      ...(hierarchyData.reportsTo ? { reportsTo: hierarchyData.reportsTo } : {}),
      ...(hierarchyData.designation ? { designation: hierarchyData.designation } : {}),
      ...(hierarchyData.department ? { department: hierarchyData.department } : {}),
      ...(hierarchyData.hierarchyLevel ? { hierarchyLevel: Number(hierarchyData.hierarchyLevel) } : { hierarchyLevel: 4 })
    };

    if (uid) {
      await updateDoc(doc(db, "users", uid), updates);
    }

    return { success: true, uid };
  } catch (error) {
    console.error("Error creating staff:", error);
    throw error;
  }
}

/**
 * Updates a staff member's role, hub, or reporting hierarchy.
 */
export async function updateStaffDetails(uid, updates) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating staff:", error);
    throw error;
  }
}

/**
 * ADM-4: Fetches admin staff users with targeted Firestore query instead of full collection scan.
 */
export async function getAllStaff() {
  try {
    const staffQuery = query(collection(db, "users"), where("isAdmin", "==", true));
    const usersSnapshot = await getDocs(staffQuery);
    return usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching staff:", error);
    throw error;
  }
}


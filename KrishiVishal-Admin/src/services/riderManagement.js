import { doc, setDoc, updateDoc, collection, getDocs, Timestamp, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Fetches all users who have the role of RIDER.
 */
export async function getAllRiders() {
  try {
    const q = query(collection(db, "users"), where("role", "==", "Rider"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching riders:", error);
    throw error;
  }
}

/**
 * Whitelists a phone number so the user can be promoted to RIDER on registration.
 */
export async function whitelistRiderPhone(phone, name) {
    try {
        await setDoc(doc(db, "whitelisted_riders", phone), {
            phone,
            name,
            whitelistedAt: Timestamp.now(),
            status: 'PENDING_REGISTRATION'
        });
        return { success: true };
    } catch (error) {
        console.error("Whitelisting failed:", error);
        throw error;
    }
}

/**
 * Searches for a user by phone or email in the users collection.
 */
export async function searchUserByQuery(searchQuery) {
  try {
    let q = query(collection(db, "users"), where("phone", "==", searchQuery));
    let snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      q = query(collection(db, "users"), where("email", "==", searchQuery));
      snapshot = await getDocs(q);
    }
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error searching user:", error);
    throw error;
  }
}

/**
 * Promotes a regular user to a RIDER.
 */
export async function makeUserRider(uid) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      role: "Rider",
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error making user rider:", error);
    throw error;
  }
}

/**
 * Revokes Rider role from a user, setting them back to Customer.
 */
export async function revokeRiderAccess(uid) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      role: "Customer",
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error revoking rider access:", error);
    throw error;
  }
}

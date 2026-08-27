import { doc, setDoc, updateDoc, deleteDoc, collection, getDocs, Timestamp, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Fetches all users who have the role of RIDER.
 */
export async function getAllRiders() {
  try {
    const q = query(collection(db, "users"), where("role", "==", "RIDER"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching riders:", error);
    throw error;
  }
}

/**
 * Whitelists a phone number so the user can be promoted to RIDER on registration.
 * Handles both 10-digit ('9876543210') and +91 formatted ('+919876543210') inputs.
 */
export async function whitelistRiderPhone(phone, name) {
    try {
        let cleanPhone = phone.trim();
        if (!cleanPhone.startsWith("+91")) {
            const digits = cleanPhone.replace(/\D/g, "");
            cleanPhone = `+91${digits}`;
        }
        await setDoc(doc(db, "whitelisted_riders", cleanPhone), {
            phone: cleanPhone,
            name: name.trim(),
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
 * Deletes a phone number from the whitelist.
 */
export async function deleteWhitelistedRider(phone) {
    try {
        await deleteDoc(doc(db, "whitelisted_riders", phone));
        return { success: true };
    } catch (error) {
        console.error("Delete whitelisted rider failed:", error);
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
      role: "RIDER",
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error making user rider:", error);
    throw error;
  }
}

/**
 * Revokes RIDER role from a user, setting them back to CUSTOMER.
 */
export async function revokeRiderAccess(uid) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      role: "CUSTOMER",
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error revoking rider access:", error);
    throw error;
  }
}

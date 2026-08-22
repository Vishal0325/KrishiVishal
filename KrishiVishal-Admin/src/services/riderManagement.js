import {
  setDoc,
  collection,
  getDocs,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";

/**
 * Fetches all users who have the canonical Rider role.
 *
 * IMPORTANT:
 * Firestore role is used here only for display/filtering.
 * Authorization remains based on Firebase Auth Custom Claims.
 */
export async function getAllRiders() {
  try {
    const q = query(collection(db, "users"), where("role", "==", "Rider"));

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error fetching riders:", error);
    throw error;
  }
}

/**
 * Whitelists a phone number so the user can be promoted
 * to Rider during registration workflow.
 */
export async function whitelistRiderPhone(phone, name) {
  try {
    await setDoc(doc(db, "whitelisted_riders", phone), {
      phone,
      name,
      whitelistedAt: Timestamp.now(),
      status: "PENDING_REGISTRATION",
    });

    return { success: true };
  } catch (error) {
    console.error("Whitelisting failed:", error);
    throw error;
  }
}

/**
 * Searches for a user by phone or email.
 */
export async function searchUserByQuery(searchQuery) {
  try {
    let q = query(collection(db, "users"), where("phone", "==", searchQuery));

    let snapshot = await getDocs(q);

    if (snapshot.empty) {
      q = query(collection(db, "users"), where("email", "==", searchQuery));

      snapshot = await getDocs(q);
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error searching user:", error);
    throw error;
  }
}

/**
 * Promotes a regular user to Rider.
 *
 * SECURITY:
 * Never update users.role directly from the client.
 * The assignUserRole Cloud Function is the only role-assignment path.
 */
export async function makeUserRider(uid) {
  try {
    if (!uid) {
      throw new Error("User UID is required.");
    }

    const assignUserRole = httpsCallable(functions, "assignUserRole");

    const result = await assignUserRole({
      targetUid: uid,
      role: "Rider",
    });

    return result.data;
  } catch (error) {
    console.error("Error making user rider:", error);
    throw error;
  }
}

/**
 * Revokes Rider role from a user and changes it to Customer.
 *
 * SECURITY:
 * Role changes must go through the protected Cloud Function
 * so Firebase Auth Custom Claims and Firestore profile stay synchronized.
 */
export async function revokeRiderAccess(uid) {
  try {
    if (!uid) {
      throw new Error("User UID is required.");
    }

    const assignUserRole = httpsCallable(functions, "assignUserRole");

    const result = await assignUserRole({
      targetUid: uid,
      role: "Customer",
    });

    return result.data;
  } catch (error) {
    console.error("Error revoking rider access:", error);
    throw error;
  }
}

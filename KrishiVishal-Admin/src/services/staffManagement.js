import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, firebaseConfig, functions } from "../firebase/config";

// Secondary Firebase app so creating staff does not log out SuperAdmin.
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

/**
 * Creates a new staff member.
 * Role assignment is handled ONLY by the secure Cloud Function.
 */
export async function createStaffMember(email, password, name, role) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    const user = userCredential.user;

    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } catch (emailErr) {
      console.warn(
        "Failed to send initial reset email, but user was created.",
        emailErr
      );
    }

    await signOut(secondaryAuth);

    // Only non-protected profile data is written directly.
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      name,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // ONLY Cloud Function may assign the role/custom claim.
    const assignUserRole = httpsCallable(functions, "assignUserRole");

    await assignUserRole({
      targetUid: user.uid,
      role,
    });

    return {
      success: true,
      uid: user.uid,
    };
  } catch (error) {
    console.error("Error creating staff:", error);
    throw error;
  }
}

/**
 * Updates staff details.
 *
 * Role changes MUST go through assignUserRole.
 * Protected fields must NOT be written directly from the client.
 */
export async function updateStaffDetails(uid, updates) {
  try {
    if (updates.role !== undefined) {
      const assignUserRole = httpsCallable(functions, "assignUserRole");

      await assignUserRole({
        targetUid: uid,
        role: updates.role,
      });
    }

    // Do not update protected fields directly.
    // isActive is protected by Firestore Rules and therefore
    // requires a dedicated backend function if this feature is needed.

    const safeUpdates = {};

    if (updates.name !== undefined) {
      safeUpdates.name = updates.name;
    }

    if (updates.phone !== undefined) {
      safeUpdates.phone = updates.phone;
    }

    if (Object.keys(safeUpdates).length > 0) {
      safeUpdates.updatedAt = Timestamp.now();

      const userRef = doc(db, "users", uid);

      await updateDoc(userRef, safeUpdates);
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating staff:", error);
    throw error;
  }
}

/**
 * Fetches staff users using canonical role values.
 *
 * Authorization is NOT based on isAdmin.
 * isAdmin is only legacy/display metadata.
 */
export async function getAllStaff() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));

    const staffRoles = new Set([
      "SuperAdmin",
      "CatalogManager",
      "OrderManager",
      "Viewer",
    ]);

    return usersSnapshot.docs
      .map((userDoc) => ({
        id: userDoc.id,
        ...userDoc.data(),
      }))
      .filter((user) => staffRoles.has(user.role));
  } catch (error) {
    console.error("Error fetching staff:", error);
    throw error;
  }
}
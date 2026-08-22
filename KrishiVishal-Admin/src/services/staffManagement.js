import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, firebaseConfig, functions } from "../firebase/config";

// Initialize a secondary Firebase app instance
// This is necessary so that creating a new staff account doesn't log out the current SuperAdmin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

/**
 * Creates a new staff member account and saves their role/details in Firestore.
 * Role is assigned via secure Cloud Function to ensure Custom Claims are set.
 */
export async function createStaffMember(email, password, name, role) {
  try {
    // Create the user in Firebase Auth using the secondary instance
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const user = userCredential.user;

    // Send a password reset email immediately so they can set their own secure password
    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } catch (emailErr) {
      console.warn("Failed to send initial reset email, but user was created.", emailErr);
    }

    // Immediately sign out from the secondary instance to clear state
    await signOut(secondaryAuth);

    // Save basic name in 'users' collection (Note: rules allow name update if isOwner)
    // Actually, create role via Function immediately after creation
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      name: name,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const assignUserRole = httpsCallable(functions, 'assignUserRole');
    await assignUserRole({ targetUid: user.uid, role });

    return { success: true, uid: user.uid };
  } catch (error) {
    console.error("Error creating staff:", error);
    throw error;
  }
}

/**
 * Updates a staff member's role or status.
 */
export async function updateStaffDetails(uid, updates) {
  try {
    if (updates.role) {
      const assignUserRole = httpsCallable(functions, 'assignUserRole');
      await assignUserRole({ targetUid: uid, role: updates.role });
    }

    // Status (isActive) or other non-protected fields can be updated via Firestore if rules allow
    // But currently Rules block isActive too. Let's update isActive via a function or relax rules.
    // For now, if isActive is present, we update doc.
    if (updates.isActive !== undefined) {
       const userRef = doc(db, "users", uid);
       await updateDoc(userRef, {
         isActive: updates.isActive,
         updatedAt: Timestamp.now(),
       });
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating staff:", error);
    throw error;
  }
}

/**
 * Fetches all admin users (staff).
 */
export async function getAllStaff() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    return usersSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(u => u.isAdmin === true || String(u.isAdmin).toLowerCase() === "true");
  } catch (error) {
    console.error("Error fetching staff:", error);
    throw error;
  }
}

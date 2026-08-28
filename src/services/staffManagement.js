import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db, firebaseConfig } from "../firebase/config";

// Initialize a secondary Firebase app instance
// This is necessary so that creating a new staff account doesn't log out the current SuperAdmin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

/**
 * Creates a new staff member account and saves their role/details in Firestore.
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

    // Save staff details in the 'users' collection (where useAuth reads from)
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      name: name,
      role: role,
      isAdmin: true, // They are part of the admin panel
      isActive: true, // Active by default
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

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


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
  deleteDoc
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import { addAuditLog } from "./logger";

const COLLECTION_NAME = "statutory_licenses";

export async function getStatutoryLicenses(filters = {}) {
  try {
    let q = query(collection(db, COLLECTION_NAME), orderBy("expiryDate", "asc"));
    if (filters.category) {
      q = query(q, where("category", "==", filters.category));
    }
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching statutory licenses:", error);
    throw error;
  }
}

export async function createStatutoryLicense(licenseData) {
  try {
    const user = auth.currentUser;
    // [FIXED] Point #170: Robust unique ID generation for licenses to prevent collisions
    const licenseId = licenseData.licenseId || `LIC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, COLLECTION_NAME, licenseId);

    const payload = {
      ...licenseData,
      licenseId,
      status: licenseData.status || "ACTIVE", // ACTIVE, EXPIRING_SOON, EXPIRED, RENEWAL_IN_PROGRESS
      createdBy: user?.email || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_STATUTORY_LICENSE", "StatutoryLicense", licenseId, {
      title: licenseData.title,
      licenseNumber: licenseData.licenseNumber,
      category: licenseData.category
    });

    return licenseId;
  } catch (error) {
    console.error("Error creating statutory license:", error);
    throw error;
  }
}

export async function updateStatutoryLicense(licenseId, updates) {
  try {
    const docRef = doc(db, COLLECTION_NAME, licenseId);
    const payload = {
      ...updates,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_STATUTORY_LICENSE", "StatutoryLicense", licenseId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating statutory license:", error);
    throw error;
  }
}

export async function deleteStatutoryLicense(licenseId) {
  try {
    const docRef = doc(db, COLLECTION_NAME, licenseId);
    await deleteDoc(docRef);
    await addAuditLog("DELETE_STATUTORY_LICENSE", "StatutoryLicense", licenseId, {});
    return true;
  } catch (error) {
    console.error("Error deleting statutory license:", error);
    throw error;
  }
}

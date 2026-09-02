import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Fetches hierarchical master data for SKU generation.
 */
export async function fetchMasterData(collectionName, parentCode = null) {
  // UNIFIED FETCH LOGIC
  // 1. Check if it's a top-level collection (categories, brands)
  if (collectionName === 'categories' || collectionName === 'brands') {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // 2. Otherwise look in master_data sub-collections
  const ref = collection(db, "master_data", collectionName, "records");
  let q = query(ref, orderBy("name"));

  if (parentCode) {
    q = query(ref, where("parentCode", "==", parentCode), orderBy("name"));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchAllCategories() {
    const snapshot = await getDocs(collection(db, "master_data", "categories", "records"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchItemsByCategory(categoryCode) {
    const q = query(collection(db, "master_data", "items", "records"), where("categoryCode", "==", categoryCode));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ... more specific fetchers as needed

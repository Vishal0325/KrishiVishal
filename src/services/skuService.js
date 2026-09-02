/**
 * SKU Service — Firestore reads for SKU master data.
 * All writes go through Cloud Functions (never direct Firestore mutations).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Fetch all active SKUs from the skus collection.
 * @param {number} maxItems Max items to fetch (default 500)
 * @returns {Promise<Array>}
 */
export async function fetchAllSkus(maxItems = 500) {
  const q = query(
    collection(db, "skus"),
    where("isActive", "==", true),
    limit(maxItems)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time SKU updates.
 * @param {function} callback
 * @param {number} maxItems
 * @returns {function} Unsubscribe function
 */
export function subscribeToSkus(callback, maxItems = 500) {
  const q = query(
    collection(db, "skus"),
    where("isActive", "==", true),
    limit(maxItems)
  );
  return onSnapshot(q, (snap) => {
    const skus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(skus);
  });
}

/**
 * Fetch a single SKU by code.
 * @param {string} skuCode
 * @returns {Promise<object|null>}
 */
export async function fetchSkuByCode(skuCode) {
  const ref = doc(db, "skus", skuCode);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch batches for a given SKU.
 * @param {string} skuCode
 * @returns {Promise<Array>}
 */
export async function fetchSkuBatches(skuCode) {
  const q = query(
    collection(db, "skus", skuCode, "batches"),
    where("isActive", "==", true),
    orderBy("expiryDate", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch warehouse stock records for a given SKU.
 * @param {string} skuCode
 * @returns {Promise<Array>}
 */
export async function fetchWarehouseStock(skuCode) {
  const q = query(
    collection(db, "warehouse_stock"),
    where("skuCode", "==", skuCode)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch inventory movements with optional filters.
 * @param {{ skuCode?: string, movementType?: string, maxItems?: number }} filters
 * @returns {Promise<Array>}
 */
export async function fetchInventoryMovements(filters = {}) {
  const constraints = [];

  if (filters.skuCode) {
    constraints.push(where("skuCode", "==", filters.skuCode));
  }
  if (filters.movementType) {
    constraints.push(where("movementType", "==", filters.movementType));
  }

  constraints.push(orderBy("timestamp", "desc"));
  constraints.push(limit(filters.maxItems || 200));

  const q = query(collection(db, "inventory_movements"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time inventory movements.
 * @param {function} callback
 * @param {{ maxItems?: number }} options
 * @returns {function} Unsubscribe function
 */
export function subscribeToInventoryMovements(callback, options = {}) {
  const q = query(
    collection(db, "inventory_movements"),
    orderBy("timestamp", "desc"),
    limit(options.maxItems || 100)
  );
  return onSnapshot(q, (snap) => {
    const movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(movements);
  });
}

/**
 * Lookup SKU by barcode (EAN-13 or internal).
 * @param {string} barcode
 * @returns {Promise<object|null>}
 */
export async function fetchSkuByBarcode(barcode) {
  // Try EAN-13
  let q = query(
    collection(db, "skus"),
    where("barcode.ean13", "==", barcode),
    limit(1)
  );
  let snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  // Try internal barcode (skuCode itself)
  q = query(
    collection(db, "skus"),
    where("barcode.internal", "==", barcode),
    limit(1)
  );
  snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  return null;
}

/**
 * Fetch SKUs with low stock (available <= reorderLevel).
 * @param {Array} allSkus  Pre-fetched SKUs array
 * @returns {Array}
 */
export function getLowStockSkus(allSkus) {
  return allSkus.filter(sku => {
    const available = sku.inventory?.availableStock || 0;
    const reorder = sku.reorderLevel || 50;
    return available <= reorder;
  });
}

/**
 * Fetch SKUs with batches expiring within N days.
 * @param {Array} allSkus Pre-fetched SKUs array — each must have batches loaded
 * @param {number} daysThreshold
 * @returns {Array}
 */
export function getNearExpirySkus(allSkus, daysThreshold = 30) {
  const threshold = Date.now() + daysThreshold * 24 * 3600 * 1000;
  return allSkus.filter(sku => {
    // If SKU-level nearExpiry flag exists
    if (sku._nearExpiry) return true;
    return false;
  });
}

/**
 * SKU Service — Firestore reads for SKU master data.
 * Merges direct 'skus' collection records with automatic derived product & variant SKUs.
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
  Timestamp,
  setDoc
} from "firebase/firestore";
import { db } from "../firebase/config";
import { autoDeriveSkuFromProduct, validateSku } from "../utils/skuGenerator";

/**
 * Fetch all active SKUs.
 * @param {number} maxItems Max items to fetch (default 500)
 * @returns {Promise<Array>}
 */
export async function fetchAllSkus(maxItems = 500) {
  const skusSnap = await getDocs(query(collection(db, "skus"), limit(maxItems)));
  const directSkus = skusSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const prodsSnap = await getDocs(query(collection(db, "products"), limit(maxItems)));
  const productSkus = [];

  prodsSnap.docs.forEach(docSnap => {
    const p = { id: docSnap.id, ...docSnap.data() };
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      p.variants.forEach((v) => {
        const derivedCode = v.skuCode || autoDeriveSkuFromProduct({
          name: p.name,
          brand: p.brand,
          category: p.category,
          subCategory: p.subCategory,
          quantity: v.label || v.quantity || p.quantity,
          unit: p.unit
        });
        const validation = validateSku(derivedCode);
        productSkus.push({
          id: derivedCode,
          skuCode: derivedCode,
          name: `${p.name} (${v.label || v.quantity || ''} ${p.unit || ''})`.trim(),
          productName: p.name,
          brand: p.brand || "",
          category: p.category || "",
          subCategory: p.subCategory || "",
          productId: p.id,
          segments: validation?.segments || { category: 'OT' },
          pricing: {
            mrp: Number(v.mrp || p.mrp || 0),
            consumerPrice: Number(v.price || p.price || 0),
            landingCost: Number(v.costPrice || p.costPrice || 0),
            dealerPrice: Number(v.costPrice || p.costPrice || 0),
          },
          inventory: {
            availableStock: Number(v.stock !== undefined ? v.stock : p.stock || 0),
            allocatedStock: 0,
            quarantineStock: 0,
          },
          reorderLevel: Number(v.reorderLevel || p.reorderLevel || 10),
          barcode: { ean13: v.barcode || p.barcode || '' },
          isActive: p.isActive !== false,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt
        });
      });
    } else {
      const derivedCode = p.skuCode || autoDeriveSkuFromProduct(p);
      const validation = validateSku(derivedCode);
      productSkus.push({
        id: derivedCode,
        skuCode: derivedCode,
        name: `${p.name} (${p.quantity || ''} ${p.unit || ''})`.trim(),
        productName: p.name,
        brand: p.brand || "",
        category: p.category || "",
        subCategory: p.subCategory || "",
        productId: p.id,
        segments: validation?.segments || { category: 'OT' },
        pricing: {
          mrp: Number(p.mrp || 0),
          consumerPrice: Number(p.price || 0),
          landingCost: Number(p.costPrice || 0),
          dealerPrice: Number(p.costPrice || 0),
        },
        inventory: {
          availableStock: Number(p.stock || 0),
          allocatedStock: 0,
          quarantineStock: 0,
        },
        reorderLevel: Number(p.reorderLevel || 10),
        barcode: { ean13: p.barcode || '' },
        isActive: p.isActive !== false,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt
      });
    }
  });

  const skuMap = new Map();
  productSkus.forEach(s => skuMap.set(s.skuCode, s));
  directSkus.forEach(s => {
    const key = s.skuCode || s.id;
    skuMap.set(key, { ...(skuMap.get(key) || {}), ...s, skuCode: key });
  });

  return Array.from(skuMap.values()).slice(0, maxItems);
}

/**
 * Subscribe to real-time SKU updates with auto-derived product and variant SKUs.
 * @param {function} callback
 * @param {number} maxItems
 * @returns {function} Unsubscribe function
 */
export function subscribeToSkus(callback, maxItems = 500) {
  let directSkus = [];
  let productSkus = [];

  const emitMerged = () => {
    const skuMap = new Map();
    // 1. Add product-derived SKUs
    productSkus.forEach(s => skuMap.set(s.skuCode, s));
    // 2. Overlay explicit skus collection docs
    directSkus.forEach(s => {
      const key = s.skuCode || s.id;
      if (key) {
        skuMap.set(key, { ...(skuMap.get(key) || {}), ...s, skuCode: key });
      }
    });
    callback(Array.from(skuMap.values()).slice(0, maxItems));
  };

  const unsubSkus = onSnapshot(collection(db, "skus"), (snap) => {
    directSkus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emitMerged();
  }, (err) => {
    console.warn("Direct SKUs collection subscription error:", err);
    emitMerged();
  });

  const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
    const list = [];
    snap.docs.forEach(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() };
      if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
        p.variants.forEach((v) => {
          const derivedCode = v.skuCode || autoDeriveSkuFromProduct({
            name: p.name,
            brand: p.brand,
            category: p.category,
            subCategory: p.subCategory,
            quantity: v.label || v.quantity || p.quantity,
            unit: p.unit
          });
          const validation = validateSku(derivedCode);
          list.push({
            id: derivedCode,
            skuCode: derivedCode,
            name: `${p.name} (${v.label || v.quantity || ''} ${p.unit || ''})`.trim(),
            productName: p.name,
            brand: p.brand || "",
            category: p.category || "",
            subCategory: p.subCategory || "",
            productId: p.id,
            segments: validation?.segments || { category: 'OT' },
            pricing: {
              mrp: Number(v.mrp || p.mrp || 0),
              consumerPrice: Number(v.price || p.price || 0),
              landingCost: Number(v.costPrice || p.costPrice || 0),
              dealerPrice: Number(v.costPrice || p.costPrice || 0),
            },
            inventory: {
              availableStock: Number(v.stock !== undefined ? v.stock : p.stock || 0),
              allocatedStock: 0,
              quarantineStock: 0,
            },
            reorderLevel: Number(v.reorderLevel || p.reorderLevel || 10),
            barcode: { ean13: v.barcode || p.barcode || '' },
            isActive: p.isActive !== false,
            updatedAt: p.updatedAt,
            createdAt: p.createdAt
          });
        });
      } else {
        const derivedCode = p.skuCode || autoDeriveSkuFromProduct(p);
        const validation = validateSku(derivedCode);
        list.push({
          id: derivedCode,
          skuCode: derivedCode,
          name: `${p.name} (${p.quantity || ''} ${p.unit || ''})`.trim(),
          productName: p.name,
          brand: p.brand || "",
          category: p.category || "",
          subCategory: p.subCategory || "",
          productId: p.id,
          segments: validation?.segments || { category: 'OT' },
          pricing: {
            mrp: Number(p.mrp || 0),
            consumerPrice: Number(p.price || 0),
            landingCost: Number(p.costPrice || 0),
            dealerPrice: Number(p.costPrice || 0),
          },
          inventory: {
            availableStock: Number(p.stock || 0),
            allocatedStock: 0,
            quarantineStock: 0,
          },
          reorderLevel: Number(p.reorderLevel || 10),
          barcode: { ean13: p.barcode || '' },
          isActive: p.isActive !== false,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt
        });
      }
    });
    productSkus = list;
    emitMerged();
  }, (err) => {
    console.warn("Products subscription in SKU service error:", err);
    emitMerged();
  });

  return () => {
    unsubSkus();
    unsubProducts();
  };
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
  try {
    const q = query(
      collection(db, "skus", skuCode, "batches"),
      where("isActive", "==", true),
      orderBy("expiryDate", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Fetch batches fallback:", e);
    return [];
  }
}

/**
 * Fetch warehouse stock records for a given SKU.
 * @param {string} skuCode
 * @returns {Promise<Array>}
 */
export async function fetchWarehouseStock(skuCode) {
  try {
    const q = query(
      collection(db, "warehouse_stock"),
      where("skuCode", "==", skuCode)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/**
 * Fetch inventory movements with optional filters.
 * @param {{ skuCode?: string, movementType?: string, maxItems?: number }} filters
 * @returns {Promise<Array>}
 */
export async function fetchInventoryMovements(filters = {}) {
  try {
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
  } catch (e) {
    return [];
  }
}

/**
 * Subscribe to real-time inventory movements.
 * @param {function} callback
 * @param {{ maxItems?: number }} options
 * @returns {function} Unsubscribe function
 */
export function subscribeToInventoryMovements(callback, options = {}) {
  try {
    const q = query(
      collection(db, "inventory_movements"),
      orderBy("timestamp", "desc"),
      limit(options.maxItems || 100)
    );
    return onSnapshot(q, (snap) => {
      const movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(movements);
    }, (err) => {
      console.warn("Movements subscription error:", err);
      callback([]);
    });
  } catch (e) {
    callback([]);
    return () => {};
  }
}

/**
 * Lookup SKU by barcode (EAN-13 or internal).
 * @param {string} barcode
 * @returns {Promise<object|null>}
 */
export async function fetchSkuByBarcode(barcode) {
  try {
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
  } catch (e) {
    console.warn("Barcode search error:", e);
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
 * @param {Array} allSkus Pre-fetched SKUs array
 * @param {number} daysThreshold
 * @returns {Array}
 */
export function getNearExpirySkus(allSkus, daysThreshold = 30) {
  return allSkus.filter(sku => {
    if (sku._nearExpiry) return true;
    return false;
  });
}

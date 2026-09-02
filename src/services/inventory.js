import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import * as XLSX from "xlsx";
import Papa from "papaparse";

// ─── Cloud Function Wrappers (all inventory mutations go through CF) ───

/**
 * Bulk import SKUs via Cloud Function.
 * @param {Array} skus Array of SKU row objects
 * @param {boolean} dryRun If true, validates without writing
 * @returns {Promise<object>} Import results with valid/invalid counts and errors
 */
export async function callImportSkus(skus, dryRun = false) {
  const fn = httpsCallable(functions, "importSkus");
  const result = await fn({ skus, dryRun });
  return result.data;
}

/**
 * Create or update a single SKU via Cloud Function.
 * @param {string} skuCode
 * @param {object} data SKU data (name, pricing, barcode, tax, etc.)
 * @returns {Promise<object>}
 */
export async function callUpsertSku(skuCode, data) {
  const fn = httpsCallable(functions, "upsertSku");
  const result = await fn({ skuCode, data });
  return result.data;
}

/**
 * Submit a Goods Receipt Note (GRN) via Cloud Function.
 * @param {object} payload { skuCode, batchNumber, quantity, mfgDate, expiryDate, warehouseId, ... }
 * @returns {Promise<object>}
 */
export async function callReceiveGrn(payload) {
  const fn = httpsCallable(functions, "receiveGrn");
  const result = await fn(payload);
  return result.data;
}

/**
 * Adjust inventory stock via Cloud Function.
 * @param {object} payload { skuCode, adjustment, reason, batchId, warehouseId }
 * @returns {Promise<object>}
 */
export async function callAdjustInventory(payload) {
  const fn = httpsCallable(functions, "adjustInventory");
  const result = await fn(payload);
  return result.data;
}

/**
 * Write off damaged or expired stock via Cloud Function.
 * @param {object} payload { skuCode, batchId, quantity, type, reason, warehouseId }
 * @returns {Promise<object>}
 */
export async function callWriteOffStock(payload) {
  const fn = httpsCallable(functions, "writeOffStock");
  const result = await fn(payload);
  return result.data;
}

/**
 * Fetch inventory report via Cloud Function.
 * @returns {Promise<object>} { total, items[] }
 */
export async function callGetInventoryReport() {
  const fn = httpsCallable(functions, "getInventoryReport");
  const result = await fn({});
  return result.data;
}

export async function recordStockMovement(
  productId,
  type,
  change,
  previousStock,
  newStock,
  note = "",
) {
  return await addDoc(collection(db, "stock_movements"), {
    productId,
    type,
    change,
    previousStock,
    newStock,
    note,
    createdAt: Timestamp.now(),
  });
}

export async function fetchAllProducts() {
  const snapshot = await getDocs(collection(db, "products"));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Serialize variants array to pipe-separated string for CSV/Excel export.
 * Format: label:mrp:price:stock:reorderLevel:batchNo:mfgDate:expiryDate
 * Multiple variants separated by semicolon (;)
 */
function serializeVariants(variants) {
  if (!variants || !variants.length) return "";
  return variants
    .map((v) => {
      const mfg = v.mfgDate
        ? (v.mfgDate.seconds
          ? new Date(v.mfgDate.seconds * 1000).toISOString().split("T")[0]
          : v.mfgDate)
        : "";
      const exp = v.expiryDate
        ? (v.expiryDate.seconds
          ? new Date(v.expiryDate.seconds * 1000).toISOString().split("T")[0]
          : v.expiryDate)
        : "";
      return [
        v.label || "",
        v.mrp || 0,
        v.price || 0,
        v.costPrice || 0,
        v.stock || 0,
        v.reorderLevel || 10,
        v.batchNumber || "",
        mfg,
        exp,
      ].join(":");
    })
    .join(";");
}

function formatDate(dateField) {
  if (!dateField) return "";
  if (dateField.seconds) {
    return new Date(dateField.seconds * 1000).toISOString().split("T")[0];
  }
  return dateField;
}

function buildExportRow(product) {
  const row = {
    name: product.name || "",
    brand: product.brand || "",
    category: product.category || "",
    subCategory: product.subCategory || "",
    mrp: product.mrp || 0,
    price: product.price || 0,
    costPrice: product.costPrice || 0,
    stock: product.stock || 0,
    quantity: product.quantity || "",
    unit: product.unit || "piece",
    reorderLevel: product.reorderLevel || 10,
    batchNumber: product.batchNumber || "",
    mfgDate: formatDate(product.mfgDate),
    expiryDate: formatDate(product.expiryDate),
    chemicalComposition: product.chemicalComposition || "",
    description: product.description || "",
    imageUrl: (product.images || []).join(", "),
    isActive: product.isActive !== false ? "true" : "false",
    variants: serializeVariants(product.variants),
  };

  // Seed Metadata
  const sm = product.seedMetadata;
  if (sm) {
    row.seedVariety = sm.variety || "";
    row.seedClass = sm.seedClass || "";
    row.seedGermination = sm.germination || "";
    row.seedPurity = sm.purity || "";
    row.seedMoisture = sm.moisture || "";
    row.seedLotNumber = sm.lotNumber || "";
    row.seedIsTreated = sm.isTreated ? "true" : "false";
    row.seedChemicalName = sm.chemicalName || "";
  }

  // Agro Metadata
  const am = product.agroMetadata;
  if (am) {
    row.agroTechnicalName = am.technicalName || "";
    row.agroFormulation = am.formulation || "";
    row.agroDosePerAcre = am.dosePerAcre || "";
    row.agroComposition = am.composition || "";
    row.agroRecommendedCrops = Array.isArray(am.recommendedCrops) ? am.recommendedCrops.join(", ") : (am.recommendedCrops || "");
    row.agroToxicityLabel = am.toxicityLabel || "";
    row.agroBatchNumber = am.batchNumber || "";
    row.agroMfgDate = am.mfgDate || "";
    row.agroAntidote = am.antidote || "";
    row.agroTargetPests = Array.isArray(am.targetPests) ? am.targetPests.join(", ") : (am.targetPests || "");
    row.agroSafetyWarning = am.safetyWarning ? "true" : "false";
  }

  // Herbicide Metadata
  const hm = product.herbicideMetadata;
  if (hm) {
    row.herbSelectivity = hm.selectivity || "";
    row.herbTiming = hm.timing || "";
    row.herbTechnicalName = hm.technicalName || "";
    row.herbTargetWeeds = Array.isArray(hm.targetWeeds) ? hm.targetWeeds.join(", ") : (hm.targetWeeds || "");
    row.herbRecommendedCrops = Array.isArray(hm.recommendedCrops) ? hm.recommendedCrops.join(", ") : (hm.recommendedCrops || "");
    row.herbDosePerAcre = hm.dosePerAcre || "";
    row.herbWaterVolume = hm.waterVolume || "";
    row.herbAvoidDrift = hm.avoidDrift ? "true" : "false";
    row.herbToxicityLabel = hm.toxicityLabel || "";
    row.herbRainFastness = hm.rainFastness || "";
  }

  return row;
}

export function exportProductsCsv(products) {
  const data = products.map(buildExportRow);
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "krishivishal-products-export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportProductsXlsx(products) {
  const data = products.map(buildExportRow);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  XLSX.writeFile(workbook, "krishivishal-products-export.xlsx");
}

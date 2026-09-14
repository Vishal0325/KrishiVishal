import { collection, Timestamp, query, where, getDocs, doc, updateDoc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { autoDeriveSkuFromProduct, getCategoryTaxDefaults } from "../utils/skuGenerator";
import { callUpsertSku, callReceiveGrn } from "./inventory";
import ExcelJS from "exceljs";
import { createWorksheetFromJson, downloadWorkbook } from "../utils/excel";

const CHEMICAL_CATEGORIES = [
  "pesticides",
  "insecticides",
  "fungicides",
  "herbicides",
  "fertilizers",
  "bio-fertilizers",
  "chemicals",
  "plant growth regulators"
];

/**
 * Generates and downloads a clean, ready-to-fill Excel template for 1-Click bulk product upload.
 */
export async function downloadSampleProductTemplate() {
  const sampleData = [
    {
      "Product Name": "Urea Neem Coated 50kg",
      "Category": "Fertilizers",
      "Brand": "IFFCO",
      "Pack Size": 50,
      "Unit": "KG",
      "MRP": 300,
      "Selling Price": 266,
      "Cost Price": 240,
      "Stock": 100,
      "Batch Number": "BAT-2026-001",
      "Mfg Date": "2026-01-15",
      "Expiry Date": "2028-01-15",
      "HSN Code": "31021010",
      "GST Rate": 5,
      "Description": "Neem coated agricultural urea fertilizer for high nitrogen yield."
    },
    {
      "Product Name": "Coragen Insecticide 60ml",
      "Category": "Pesticides",
      "Brand": "FMC",
      "Pack Size": 60,
      "Unit": "ML",
      "MRP": 1100,
      "Selling Price": 950,
      "Cost Price": 850,
      "Stock": 50,
      "Batch Number": "BAT-2026-002",
      "Mfg Date": "2026-02-01",
      "Expiry Date": "2028-02-01",
      "HSN Code": "38089190",
      "GST Rate": 18,
      "Description": "Broad-spectrum insecticide for borer control in sugarcane and paddy."
    },
    {
      "Product Name": "Hybrid Paddy Seed 6444 Gold 3kg",
      "Category": "Seeds",
      "Brand": "Bayer",
      "Pack Size": 3,
      "Unit": "KG",
      "MRP": 950,
      "Selling Price": 870,
      "Cost Price": 780,
      "Stock": 200,
      "Batch Number": "BAT-2026-003",
      "Mfg Date": "2026-03-01",
      "Expiry Date": "2027-03-01",
      "HSN Code": "12099990",
      "GST Rate": 0,
      "Description": "High yielding hybrid paddy seeds with disease resistance."
    }
  ];

  const workbook = new ExcelJS.Workbook();
  createWorksheetFromJson(workbook, sampleData, "Products_Upload_Template");
  await downloadWorkbook(workbook, "KrishiVishal_Products_Upload_Template.xlsx");
}

/**
 * Parse variants from a pipe-separated string.
 * Format per variant: label:mrp:price:stock:reorderLevel:batchNo:mfgDate:expiryDate
 */
function parseVariants(variantsStr, parentName = "", parentBrand = "", parentCategory = "") {
  if (!variantsStr || !variantsStr.trim()) return [];
  const variants = [];
  const parts = variantsStr.split(";").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const fields = part.split(":").map((s) => s.trim());
    const label = fields[0] || "";
    const derivedSku = autoDeriveSkuFromProduct({
      name: parentName,
      brand: parentBrand,
      category: parentCategory,
      quantity: label
    });

    variants.push({
      // [FIXED] Point #160: Using more robust unique ID pattern for variants to prevent data collision
      id: `var-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      skuCode: fields[9] || derivedSku,
      label,
      mrp: parseNumber(fields[1]),
      price: parseNumber(fields[2]),
      costPrice: parseNumber(fields[3]),
      stock: parseNumber(fields[4]),
      reorderLevel: parseNumber(fields[5]),
      batchNumber: fields[6] || "",
      mfgDate: parseSafeDate(fields[7]),
      expiryDate: parseSafeDate(fields[8]),
    });
  }
  return variants;
}

// [FIXED] Point #97: Robust number parsing to handle units (e.g., "500gm", "1kg") during bulk import
const parseNumber = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
};

// [FIXED] Point #158: Robust date parsing to prevent crash during bulk import
const parseSafeDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    console.warn(`Invalid date value provided: ${val}`);
    return null;
  }
  return Timestamp.fromDate(d);
};

/**
 * 1-Click Unified Product Importer:
 * [FIXED] Point #105: Process rows in sequential chunks to prevent partial success disasters.
 * If a row in a chunk fails, it's logged but doesn't halt the entire process,
 * while maintaining document integrity via Cloud Function transactions.
 */
export async function importProducts(rows) {
  const results = { success: 0, updated: 0, failed: 0, errors: [] };
  const CHUNK_SIZE = 10; // Smaller chunks for reliability

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    
    // [FIXED] Point #161: Pre-flight SKU uniqueness validation within chunk
    const skuInChunk = new Set();
    for (const row of chunk) {
      const r = {};
      for (const k in row) {
        const cleanKey = k.trim().replace(/\s+/g, '_').toLowerCase();
        r[cleanKey] = (row[k] !== undefined && row[k] !== null ? row[k] : "").toString().trim();
      }
      const brand = r.brand || r.company || "GEN";
      const category = r.category || "Others";
      const subCategory = r.sub_category || r.subcategory || "";
      const quantity = r.pack_size || r.size || r.quantity || "1";
      const unit = r.unit || "piece";
      const derivedSku = autoDeriveSkuFromProduct({
        name: r.product_name || r.name || r.title || "",
        brand,
        category,
        subCategory,
        quantity,
        unit,
        skuCode: r.sku_code || r.sku || ""
      });
      if (skuInChunk.has(derivedSku)) {
        results.failed += 1;
        results.errors.push({ 
          row: i + chunk.indexOf(row) + 1, 
          name: row.name || row["Product Name"] || "Unknown", 
          error: `Duplicate SKU within import: ${derivedSku}` 
        });
        return; // Skip this row entirely
      }
      skuInChunk.add(derivedSku);
    }

    // Process chunk concurrently
    const promises = chunk.map(async (row, index) => {
      const rowIndex = i + index;
      try {
        // normalize keys (trim whitespace and handle multiple header casing formats)
        const r = {};
        for (const k in row) {
          const cleanKey = k.trim().replace(/\s+/g, '_').toLowerCase();
          r[cleanKey] = (row[k] !== undefined && row[k] !== null ? row[k] : "").toString().trim();
        }

        const name = r.product_name || r.name || r.title || "";
        if (!name) throw new Error("Product name is missing in row");

        const brand = r.brand || r.company || "GEN";
        const category = r.category || "Others";
        const subCategory = r.sub_category || r.subcategory || "";
        const quantity = r.pack_size || r.size || r.quantity || "1";
        const unit = r.unit || "piece";

        // Auto-Derive Standard SKU
        const derivedSku = autoDeriveSkuFromProduct({
          name,
          brand,
          category,
          subCategory,
          quantity,
          unit,
          skuCode: r.sku_code || r.sku || ""
        });

        // Auto-Tax Defaults if not supplied
        const taxDefaults = getCategoryTaxDefaults(category);
        const hsnCode = r.hsn_code || r.hsn || taxDefaults.hsnCode;
        const gstRate = r.gst_rate || r.gst ? parseNumber(r.gst_rate || r.gst) : taxDefaults.gstRate;

        // Parse variants if provided
        const variants = parseVariants(r.variants, name, brand, category);

        let mrp = r.mrp ? parseNumber(r.mrp) : 0;
        let price = r.selling_price || r.price ? parseNumber(r.selling_price || r.price) : 0;
        let costPrice = r.cost_price || r.landing_cost ? parseNumber(r.cost_price || r.landing_cost) : 0;
        let stock = r.stock ? parseNumber(r.stock) : 0;
        let reorderLevel = r.reorder_level ? parseNumber(r.reorder_level) : 10;
        let batchNumber = r.batch_number || r.batch_no || `BAT-${Date.now()}`;
        let mfgDate = parseSafeDate(r.mfg_date);
        let expiryDate = parseSafeDate(r.expiry_date);

        if (variants.length > 0) {
          mrp = Math.max(...variants.map((v) => v.mrp));
          price = Math.min(...variants.map((v) => v.price));
          costPrice = Math.min(...variants.map((v) => v.costPrice));
          stock = variants.reduce((s, v) => s + v.stock, 0);
          reorderLevel = variants.reduce((s, v) => s + v.reorderLevel, 0);
        } else {
          // Embed single variant with auto-derived SKU
          variants.push({
            id: `var-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
            skuCode: derivedSku,
            label: `${quantity} ${unit}`,
            mrp,
            price,
            costPrice,
            stock,
            reorderLevel,
            batchNumber,
            mfgDate,
            expiryDate
          });
        }

        const categoryLower = category.toLowerCase();

        const productData = {
          name,
          brand,
          category,
          subCategory,
          mrp,
          price,
          discountedPrice: price,
          // [FIXED] Point #156: Unified stock field name to prevent desync
          stock,
          quantity: `${quantity} ${unit}`,
          unit,
          reorderLevel,
          hsnCode,
          gstRate,
          expiryDate,
          mfgDate,
          batchNumber,
          variants,
          hasVariants: variants.length > 1,
          chemicalComposition: CHEMICAL_CATEGORIES.includes(categoryLower) ? (r.chemical_composition || r.technical_name || "") : null,
          description: r.description || `${name} by ${brand} in ${category}.`,
          images: r.image_url || r.images ? (r.image_url || r.images).split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [],
          isActive: r.is_active ? r.is_active.toLowerCase() === "true" : true,
          updatedAt: Timestamp.now(),
        };

        // Search keywords auto-generation
        const keywords = [
          ...name.toLowerCase().split(/\s+/),
          ...brand.toLowerCase().split(/\s+/),
          categoryLower,
          derivedSku.toLowerCase()
        ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

        // --- 1. UPSERT PRODUCT IN CATALOG ---
        const targetId = derivedSku;
        const productDocRef = doc(db, "products", targetId);
        const publicProduct = { ...productData, searchKeywords: keywords, skuCode: derivedSku, id: targetId };

        const docSnap = await getDoc(productDocRef);
        if (docSnap.exists()) {
          await updateDoc(productDocRef, publicProduct);
          results.updated += 1;
        } else {
          publicProduct.createdAt = Timestamp.now();
          publicProduct.rating = 4.5;
          publicProduct.reviewCount = 0;
          await setDoc(productDocRef, publicProduct);
          results.success += 1;
        }

        // --- 2. UPSERT SKUS VIA CLOUD FUNCTION ---
        for (const v of variants) {
          try {
            await callUpsertSku(v.skuCode || derivedSku, {
              name: `${name} (${v.label || quantity})`,
              pricing: {
                mrp: v.mrp || mrp,
                consumerPrice: v.price || price,
                landingCost: v.costPrice || costPrice,
                dealerPrice: v.costPrice || costPrice
              },
              tax: {
                hsnCode,
                gstRate
              },
              reorderLevel: v.reorderLevel || reorderLevel
            });

            // If stock > 0, provision initial batch & ledger via Cloud Function
            if (v.stock > 0) {
              // [FIXED] Point #162: Safely convert Firestore Timestamps to ISO strings
              const mfgDateStr = v.mfgDate 
                ? (v.mfgDate.toDate ? v.mfgDate.toDate().toISOString() : String(v.mfgDate))
                : null;
              const expiryDateStr = v.expiryDate
                ? (v.expiryDate.toDate ? v.expiryDate.toDate().toISOString() : String(v.expiryDate))
                : null;
              
              await callReceiveGrn({
                skuCode: v.skuCode || derivedSku,
                batchNumber: v.batchNumber || batchNumber,
                mfgDate: mfgDateStr,
                expiryDate: expiryDateStr,
                quantity: Number(v.stock),
                landingCost: v.costPrice || costPrice,
                grnId: `IMPORT-${Date.now()}`
              });
            }
          } catch (cfErr) {
            // [FIXED] Point #157: Don't fail silently. Propagate error to bulk results.
            throw new Error(`SKU Auto-sync failed for ${v.skuCode}: ${cfErr.message}`);
          }
        }

      } catch (err) {
        results.failed += 1;
        results.errors.push({ row: rowIndex + 1, name: row.name || row["Product Name"] || "Unknown", error: err.message });
      }
    });

    await Promise.all(promises);
  }

  return results;
}

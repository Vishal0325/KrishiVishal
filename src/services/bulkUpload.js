import { collection, addDoc, Timestamp, query, where, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { autoDeriveSkuFromProduct, getCategoryTaxDefaults } from "../utils/skuGenerator";
import { callUpsertSku, callReceiveGrn } from "./inventory";
import * as XLSX from "xlsx";

/**
 * Generates and downloads a clean, ready-to-fill Excel template for 1-Click bulk product upload.
 */
export function downloadSampleProductTemplate() {
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

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products_Upload_Template");
  XLSX.writeFile(workbook, "KrishiVishal_Products_Upload_Template.xlsx");
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
      id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      skuCode: fields[9] || derivedSku,
      label,
      mrp: fields[1] ? Number(fields[1]) : 0,
      price: fields[2] ? Number(fields[2]) : 0,
      costPrice: fields[3] ? Number(fields[3]) : 0,
      stock: fields[4] ? Number(fields[4]) : 0,
      reorderLevel: fields[5] ? Number(fields[5]) : 10,
      batchNumber: fields[6] || "",
      mfgDate: fields[7] && !isNaN(Date.parse(fields[7])) ? Timestamp.fromDate(new Date(fields[7])) : null,
      expiryDate: fields[8] && !isNaN(Date.parse(fields[8])) ? Timestamp.fromDate(new Date(fields[8])) : null,
    });
  }
  return variants;
}

const CHEMICAL_CATEGORIES = ["herbicide", "insecticide", "pgr", "plant growth regulator", "fungicide", "pesticide", "pesticides"];

/**
 * 1-Click Unified Product Importer:
 * Creates Product Document + Registers Cloud Function SKUs + Provisions Initial Inventory/Batches automatically.
 */
export async function importProducts(rows) {
  const results = { success: 0, updated: 0, failed: 0, errors: [] };
  const productsRef = collection(db, "products");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
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
      const gstRate = r.gst_rate || r.gst ? Number(r.gst_rate || r.gst) : taxDefaults.gstRate;

      // Parse variants if provided
      const variants = parseVariants(r.variants, name, brand, category);

      let mrp = r.mrp ? Number(r.mrp) : 0;
      let price = r.selling_price || r.price ? Number(r.selling_price || r.price) : 0;
      let costPrice = r.cost_price || r.landing_cost ? Number(r.cost_price || r.landing_cost) : 0;
      let stock = r.stock ? Number(r.stock) : 0;
      let reorderLevel = r.reorder_level ? Number(r.reorder_level) : 10;
      let batchNumber = r.batch_number || r.batch_no || `BAT-${Date.now()}`;
      let mfgDate = r.mfg_date && !isNaN(Date.parse(r.mfg_date)) ? Timestamp.fromDate(new Date(r.mfg_date)) : null;
      let expiryDate = r.expiry_date && !isNaN(Date.parse(r.expiry_date)) ? Timestamp.fromDate(new Date(r.expiry_date)) : null;

      if (variants.length > 0) {
        mrp = Math.max(...variants.map((v) => v.mrp));
        price = Math.min(...variants.map((v) => v.price));
        costPrice = Math.min(...variants.map((v) => v.costPrice));
        stock = variants.reduce((s, v) => s + v.stock, 0);
        reorderLevel = variants.reduce((s, v) => s + v.reorderLevel, 0);
      } else {
        // Embed single variant with auto-derived SKU
        variants.push({
          id: `var_${derivedSku}`,
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
        stock,
        stockQuantity: stock,
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
      const qCheck = query(productsRef, where("name", "==", name), where("brand", "==", brand));
      const querySnapshot = await getDocs(qCheck);

      let targetId = "";
      const publicProduct = { ...productData, searchKeywords: keywords };

      if (!querySnapshot.empty) {
        targetId = querySnapshot.docs[0].id;
        await updateDoc(doc(db, "products", targetId), publicProduct);
        results.updated += 1;
      } else {
        publicProduct.createdAt = Timestamp.now();
        publicProduct.rating = 4.5;
        publicProduct.reviewCount = 0;
        const newDoc = await addDoc(productsRef, publicProduct);
        targetId = newDoc.id;
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
            await callReceiveGrn({
              skuCode: v.skuCode || derivedSku,
              batchNumber: v.batchNumber || batchNumber,
              mfgDate: v.mfgDate ? (v.mfgDate.toDate ? v.mfgDate.toDate().toISOString() : v.mfgDate) : null,
              expiryDate: v.expiryDate ? (v.expiryDate.toDate ? v.expiryDate.toDate().toISOString() : v.expiryDate) : null,
              quantity: Number(v.stock),
              landingCost: v.costPrice || costPrice,
              grnId: `IMPORT-${Date.now()}`
            });
          }
        } catch (cfErr) {
          console.warn(`SKU auto-upsert error for ${v.skuCode}:`, cfErr.message);
        }
      }

    } catch (err) {
      results.failed += 1;
      results.errors.push({ row: i + 1, name: row.name || row["Product Name"] || "Unknown", error: err.message });
    }
  }

  return results;
}

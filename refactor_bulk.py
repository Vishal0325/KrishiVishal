import re

with open('src/services/bulkUpload.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We will completely replace the importProducts and downloadSampleProductTemplate functions.
# Let's just create a new file content but preserving imports at top.

imports = """import { collection, Timestamp, query, where, getDocs, doc, updateDoc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { autoDeriveSkuFromProduct, getCategoryTaxDefaults } from "../utils/skuGenerator";
import { callUpsertSku, callReceiveGrn } from "./inventory";
import ExcelJS from "exceljs";
import { createWorksheetFromJson, downloadWorkbook } from "../utils/excel";
import { groupVariantsByParentSlug } from "../utils/bulkValidation";

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

const parseNumber = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
};

const parseSafeDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    return null;
  }
  return Timestamp.fromDate(d);
};

export async function downloadSampleProductTemplate() {
  const sampleData = [
    {
      "parentSlug": "coragen-fmc-01",
      "name": "Coragen Insecticide",
      "brand": "FMC",
      "category": "Insecticide",
      "subCategory": "Pest Control",
      "quantity": 60,
      "unit": "ml",
      "mrp": 1100,
      "price": 950,
      "costPrice": 850,
      "stock": 50,
      "technicalName": "Chlorantraniliprole 18.5% SC",
      "formulation": "SC",
      "gstRate": 18
    },
    {
      "parentSlug": "coragen-fmc-01",
      "name": "Coragen Insecticide",
      "brand": "FMC",
      "category": "Insecticide",
      "subCategory": "Pest Control",
      "quantity": 150,
      "unit": "ml",
      "mrp": 2500,
      "price": 2300,
      "costPrice": 2000,
      "stock": 30,
      "technicalName": "Chlorantraniliprole 18.5% SC",
      "formulation": "SC",
      "gstRate": 18
    },
    {
      "parentSlug": "paddy-6444-gold",
      "name": "Hybrid Paddy Seed 6444 Gold",
      "brand": "Bayer",
      "category": "Seed",
      "subCategory": "Paddy",
      "quantity": 3,
      "unit": "kg",
      "mrp": 950,
      "price": 870,
      "costPrice": 780,
      "stock": 200,
      "technicalName": "",
      "formulation": "",
      "gstRate": 0
    }
  ];

  const workbook = new ExcelJS.Workbook();
  createWorksheetFromJson(workbook, sampleData, "Products_Upload_Template");
  await downloadWorkbook(workbook, "KrishiVishal_Products_Upload_Template.xlsx");
}

export async function importProducts(validatedRows, targetWarehouseId) {
  const results = {
    total: validatedRows.length,
    success: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  // 1. Fetch existing catalog to avoid duplicates
  const productsRef = collection(db, "products");
  const snapshot = await getDocs(query(productsRef, where("isActive", "==", true)));
  const existingProducts = [];
  snapshot.forEach((doc) => existingProducts.push({ id: doc.id, ...doc.data() }));

  const findExistingProduct = (slug) => {
    return existingProducts.find(
      (p) => p.id === slug || p.slug === slug
    );
  };

  // Group validated rows by parent slug
  const groupedProducts = groupVariantsByParentSlug(validatedRows);

  const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
  const productEntries = Object.entries(groupedProducts);
  const chunks = chunk(productEntries, 10);

  for (const batch of chunks) {
    const promises = batch.map(async ([slug, rows]) => {
      try {
        const primaryRow = rows[0];
        const existing = findExistingProduct(slug);
        const targetId = existing ? existing.id : slug;
        const productDocRef = doc(db, "products", targetId);

        // Map variants from grouped rows
        const variants = rows.map(r => {
          const derivedSku = autoDeriveSkuFromProduct({
            name: r.name,
            brand: r.brand,
            category: r.category,
            quantity: `${r.quantity} ${r.unit}`
          });
          
          return {
            id: `var-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
            skuCode: derivedSku,
            label: `${r.quantity} ${r.unit}`,
            mrp: parseNumber(r.mrp),
            price: parseNumber(r.price),
            costPrice: parseNumber(r.costPrice),
            stock: parseNumber(r.stock),
            reorderLevel: 10,
            batchNumber: r.batchNumber || "",
            mfgDate: parseSafeDate(r.mfgDate),
            expiryDate: parseSafeDate(r.expiryDate),
          };
        });

        // Compute aggregate pricing and stock
        const maxMrp = Math.max(...variants.map(v => v.mrp));
        const posPrices = variants.map(v => v.price).filter(p => p > 0);
        const minPrice = posPrices.length > 0 ? Math.min(...posPrices) : maxMrp;
        const totalStock = variants.reduce((s, v) => s + (v.stock || 0), 0);

        const productData = {
          name: primaryRow.name,
          brand: primaryRow.brand,
          category: primaryRow.category,
          subCategory: primaryRow.subCategory || "",
          mrp: maxMrp,
          price: minPrice,
          discountedPrice: minPrice,
          stock: totalStock,
          quantity: `${primaryRow.quantity} ${primaryRow.unit}`, // fallback for single
          unit: primaryRow.unit,
          formulationType: primaryRow.formulation || "",
          hsnCode: primaryRow.hsnCode || "",
          gstRate: parseNumber(primaryRow.gstRate),
          variants: variants,
          hasVariants: variants.length > 1,
          chemicalComposition: primaryRow.technicalName || "",
          description: existing?.description || `${primaryRow.name} by ${primaryRow.brand} in ${primaryRow.category}.`,
          images: existing?.images || [],
          isActive: true,
          updatedAt: Timestamp.now(),
        };

        const keywords = [
          ...primaryRow.name.toLowerCase().split(/\s+/),
          ...primaryRow.brand.toLowerCase().split(/\s+/),
          primaryRow.category.toLowerCase(),
          slug.toLowerCase()
        ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

        const publicProduct = {
          ...productData,
          searchKeywords: keywords,
          id: targetId,
          slug: slug
        };

        if (existing) {
          if (existing.createdAt) publicProduct.createdAt = existing.createdAt;
          if (existing.rating !== undefined) publicProduct.rating = existing.rating;
          if (existing.reviewCount !== undefined) publicProduct.reviewCount = existing.reviewCount;
          await updateDoc(productDocRef, publicProduct);
          results.updated += rows.length;
        } else {
          publicProduct.createdAt = Timestamp.now();
          publicProduct.rating = 4.5;
          publicProduct.reviewCount = 0;
          await setDoc(productDocRef, publicProduct);
          existingProducts.push(publicProduct);
          results.success += rows.length;
        }

        // --- UPSERT SKUS VIA CLOUD FUNCTION ---
        for (const v of variants) {
          try {
            await callUpsertSku(v.skuCode, {
              name: `${primaryRow.name} (${v.label})`,
              pricing: {
                mrp: v.mrp,
                consumerPrice: v.price,
                landingCost: v.costPrice,
                dealerPrice: v.costPrice
              },
              tax: { hsnCode: publicProduct.hsnCode, gstRate: publicProduct.gstRate },
              reorderLevel: v.reorderLevel
            });

            if (v.stock > 0 && targetWarehouseId) {
              await callReceiveGrn({
                skuCode: v.skuCode,
                batchNumber: v.batchNumber || `BAT-${Date.now()}`,
                quantity: v.stock,
                landingCost: v.costPrice,
                warehouseId: targetWarehouseId,
                grnId: `IMPORT-${Date.now()}`
              });
            }
          } catch (cfErr) {
            console.error(`SKU Auto-sync failed for ${v.skuCode}: ${cfErr.message}`);
          }
        }
      } catch (err) {
        results.failed += rows.length;
        results.errors.push({ row: slug, error: err.message });
      }
    });
    await Promise.all(promises);
  }

  return results;
}
"""

with open('src/services/bulkUpload.js', 'w', encoding='utf-8') as f:
    f.write(imports)

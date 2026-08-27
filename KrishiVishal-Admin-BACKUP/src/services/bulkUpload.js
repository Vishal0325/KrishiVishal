import { collection, addDoc, Timestamp, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Parse variants from a pipe-separated string.
 * Format per variant: label:mrp:price:stock:reorderLevel:batchNo:mfgDate:expiryDate
 */
function parseVariants(variantsStr) {
  if (!variantsStr || !variantsStr.trim()) return [];
  const variants = [];
  const parts = variantsStr.split(";").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const fields = part.split(":").map((s) => s.trim());
    variants.push({
      label: fields[0] || "",
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

const CHEMICAL_CATEGORIES = ["herbicide", "insecticide", "pgr", "plant growth regulator", "fungicide"];

export async function importProducts(rows) {
  const results = { success: 0, updated: 0, failed: 0, errors: [] };
  const productsRef = collection(db, "products");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // normalize keys (trim whitespace)
      const r = {};
      for (const k in row) r[k.trim()] = (row[k] || "").toString().trim();

      if (!r.name) throw new Error("Product name is missing in row");

      // Parse variants
      const variants = parseVariants(r.variants);

      // Calculate aggregated fields
      let mrp, price, stock, quantity, reorderLevel, expiryDate, mfgDate, batchNumber, costPrice;

      if (variants.length > 0) {
        mrp = Math.max(...variants.map((v) => v.mrp));
        price = Math.min(...variants.map((v) => v.price));
        costPrice = Math.min(...variants.map((v) => v.costPrice));
        stock = variants.reduce((s, v) => s + v.stock, 0);
        quantity = variants[0]?.label || "";
        reorderLevel = variants.reduce((s, v) => s + v.reorderLevel, 0);

        const variantExpiries = variants.map((v) => v.expiryDate).filter(Boolean);
        expiryDate = variantExpiries.length
          ? Timestamp.fromDate(new Date(Math.min(...variantExpiries.map((t) => t.toDate()))))
          : null;

        const variantMfgs = variants.map((v) => v.mfgDate).filter(Boolean);
        mfgDate = variantMfgs.length
          ? Timestamp.fromDate(new Date(Math.min(...variantMfgs.map((t) => t.toDate()))))
          : null;

        batchNumber = variants.map((v) => v.batchNumber).filter(Boolean).join(", ");
      } else {
        mrp = r.mrp ? Number(r.mrp) : 0;
        price = r.price ? Number(r.price) : 0;
        costPrice = r.costPrice ? Number(r.costPrice) : 0;
        stock = r.stock ? Number(r.stock) : 0;
        quantity = r.quantity || "";
        reorderLevel = r.reorderLevel ? Number(r.reorderLevel) : 10;
        expiryDate = r.expiryDate && !isNaN(Date.parse(r.expiryDate)) ? Timestamp.fromDate(new Date(r.expiryDate)) : null;
        mfgDate = r.mfgDate && !isNaN(Date.parse(r.mfgDate)) ? Timestamp.fromDate(new Date(r.mfgDate)) : null;
        batchNumber = r.batchNumber || "";
      }

      const categoryLower = (r.category || "").toLowerCase();

      const productData = {
        name: r.name,
        brand: r.brand || "",
        category: r.category || "",
        subCategory: r.subCategory || "",
        isAllCrops: r.isAllCrops ? r.isAllCrops.toLowerCase() === "true" : false,
        associatedCropIds: r.associatedCropIds ? r.associatedCropIds.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [],
        associatedCropNames: r.associatedCropNames ? r.associatedCropNames.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [],
        cropId: r.cropId || "",
        cropName: r.cropName || "",
        mrp,
        price,
        costPrice,
        stock,
        stockQuantity: stock,
        quantity,
        reorderLevel,
        expiryDate,
        mfgDate,
        batchNumber,
        chemicalComposition: CHEMICAL_CATEGORIES.includes(categoryLower) ? (r.chemicalComposition || "") : null,
        description: r.description || "",
        images: r.imageUrl
          ? r.imageUrl.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
          : [],
        isActive: r.isActive ? r.isActive.toLowerCase() === "true" : true,
        unit: r.unit || "piece",
        variants,
        seedMetadata: categoryLower === "seeds" ? {
          variety: r.seedVariety || "",
          seedClass: r.seedClass || "Truthfully Labeled",
          germination: r.seedGermination ? Number(r.seedGermination) : 0,
          purity: r.seedPurity ? Number(r.seedPurity) : 0,
          moisture: r.seedMoisture ? Number(r.seedMoisture) : 0,
          lotNumber: r.seedLotNumber || "",
          isTreated: r.seedIsTreated ? r.seedIsTreated.toLowerCase() === "true" : false,
          chemicalName: r.seedChemicalName || "",
        } : null,
        agroMetadata: ["fungicide", "insecticide", "crop nutrition"].includes(categoryLower) ? {
          technicalName: r.agroTechnicalName || "",
          formulation: r.agroFormulation || "",
          dosePerAcre: r.agroDosePerAcre || "",
          composition: r.agroComposition || "",
          recommendedCrops: r.agroRecommendedCrops ? r.agroRecommendedCrops.split(",").map(s => s.trim()) : [],
          toxicityLabel: r.agroToxicityLabel || "green",
          batchNumber: r.agroBatchNumber || "",
          mfgDate: r.agroMfgDate || "",
          antidote: r.agroAntidote || "",
          targetPests: r.agroTargetPests ? r.agroTargetPests.split(",").map(s => s.trim()) : [],
          safetyWarning: r.agroSafetyWarning ? r.agroSafetyWarning.toLowerCase() === "true" : false,
        } : null,
        herbicideMetadata: categoryLower === "herbicide" ? {
          selectivity: r.herbSelectivity || "Selective",
          timing: r.herbTiming || "Post-Emergent",
          technicalName: r.herbTechnicalName || "",
          targetWeeds: r.herbTargetWeeds ? r.herbTargetWeeds.split(",").map(s => s.trim()) : [],
          recommendedCrops: r.herbRecommendedCrops ? r.herbRecommendedCrops.split(",").map(s => s.trim()) : [],
          dosePerAcre: r.herbDosePerAcre || "",
          waterVolume: r.herbWaterVolume || "",
          avoidDrift: r.herbAvoidDrift ? r.herbAvoidDrift.toLowerCase() === "true" : false,
          toxicityLabel: r.herbToxicityLabel || "green",
          rainFastness: r.herbRainFastness || "",
        } : null,
        updatedAt: Timestamp.now(),
      };

      // --- UPSERT LOGIC ---
      const qCheck = query(productsRef, where("name", "==", r.name), where("brand", "==", r.brand || ""));
      const querySnapshot = await getDocs(qCheck);

      let targetId = "";

      // 1. Save Public Product Data
      const publicProduct = { ...productData };
      delete publicProduct.costPrice;
      if (publicProduct.variants) {
         publicProduct.variants = publicProduct.variants.map(v => {
            const c = { ...v };
            delete c.costPrice;
            return c;
         });
      }

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

      // 2. Save Private Cost Data
      const finalCostData = {
         productId: targetId,
         costPrice: productData.costPrice || 0,
         variantsCost: (productData.variants || []).reduce((acc, v) => {
            if (v.id) acc[v.id] = v.costPrice || 0;
            return acc;
         }, {}),
         updatedAt: Timestamp.now()
      };
      await setDoc(doc(db, "product_costs", targetId), finalCostData, { merge: true });

    } catch (err) {
      results.failed += 1;
      results.errors.push({ row: i + 1, name: row.name || "Unknown", error: err.message });
    }
  }

  return results;
}

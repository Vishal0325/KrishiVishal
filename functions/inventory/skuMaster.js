const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.upsertSku = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { skuCode, data: skuData } = data;
  if (!skuCode || !skuData) {
    throw new HttpsError("invalid-argument", "Missing skuCode or data.");
  }

  const db = admin.firestore();
  
  try {
    const skuRef = db.collection("products").doc(skuCode);
    await skuRef.set({
      ...skuData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.error("Error upserting SKU:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.importSkus = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { skus, dryRun } = data;
  if (!skus || !Array.isArray(skus)) {
    throw new HttpsError("invalid-argument", "SKUs array missing.");
  }

  const db = admin.firestore();
  const batch = db.batch();
  let count = 0;

  try {
    for (const sku of skus) {
      if (!sku.id) continue;
      const skuRef = db.collection("products").doc(sku.id);
      batch.set(skuRef, {
        ...sku,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      count++;
    }

    if (!dryRun && count > 0) {
      await batch.commit();
    }

    return { success: true, count, dryRun };
  } catch (error) {
    console.error("Error importing SKUs:", error);
    throw new HttpsError("internal", error.message);
  }
});

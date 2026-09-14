const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.upsertSku = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true);
  const callerRole = context.auth?.token?.role;
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }
  if (!callerIsAdmin && !['SuperAdmin', 'WarehouseManager', 'Operations', 'Admin'].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Unauthorized. Only admins or catalog managers can modify SKUs.");
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
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true);
  const callerRole = context.auth?.token?.role;
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }
  if (!callerIsAdmin && !['SuperAdmin', 'WarehouseManager', 'Operations', 'Admin'].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Unauthorized. Only admins or catalog managers can import SKUs.");
  }

  const { skus, dryRun } = data;
  if (!skus || !Array.isArray(skus)) {
    throw new HttpsError("invalid-argument", "SKUs array missing.");
  }

  const db = admin.firestore();
  let batch = db.batch();
  let count = 0;
  let batchOps = 0;

  try {
    for (const sku of skus) {
      if (!sku.id) continue;
      const skuRef = db.collection("products").doc(sku.id);
      batch.set(skuRef, {
        ...sku,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      count++;
      batchOps++;

      // [FIXED] Point #46: Handle 500 batch operation limit
      if (batchOps >= 400) {
        if (!dryRun) await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
    }

    return { success: true, count, dryRun };
  } catch (error) {
    console.error("Error importing SKUs:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.getSecureProductCost = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  
  const isSuperAdmin = context.auth && (context.auth.token.isSuperAdmin === true || context.auth.token.role === "SuperAdmin");
  if (!isSuperAdmin) {
    throw new HttpsError("permission-denied", "Only SuperAdmin can view cost data.");
  }

  const { productId } = data;
  if (!productId) {
    throw new HttpsError("invalid-argument", "Missing productId.");
  }

  const db = admin.firestore();
  try {
    const costSnap = await db.collection("product_costs").doc(productId).get();
    if (costSnap.exists) {
      return costSnap.data();
    }
    return { costPrice: 0, variantsCost: {} };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * One-time / Admin migration to populate all catalog products into warehouse_inventory for a designated hub.
 */
exports.migrateCatalogToWarehouseInventory = onCall(async (request) => {
  const data = request.data || {};
  const warehouseId = data.warehouseId || "WH-PURNEA-01";
  const db = admin.firestore();

  try {
    const productsSnapshot = await db.collection("products").get();
    console.log(`Starting migration for ${productsSnapshot.size} products to ${warehouseId}...`);

    let batch = db.batch();
    let count = 0;
    let ops = 0;

    for (const doc of productsSnapshot.docs) {
      const prod = doc.data();
      const skuId = doc.id;
      const stock = Number(prod.stock) || 0;
      const batchId = "LEGACY-INITIAL";

      const invId = `${warehouseId}_${skuId}_${batchId}`;
      const invRef = db.collection("warehouse_inventory").doc(invId);

      batch.set(invRef, {
        warehouseId,
        skuId,
        batchId,
        productName: prod.name || "",
        availableQty: stock,
        reservedQty: 0,
        transferReservedQty: 0,
        damagedQty: 0,
        expiredQty: 0,
        unitCost: Number(prod.costPrice) || 0,
        mfgDate: prod.mfgDate || "2026-01-01",
        expiryDate: prod.expiryDate || "2027-12-31",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        isMigrated: true
      }, { merge: true });

      ops++;
      count++;

      if (ops >= 400) {
        await batch.commit();
        console.log(`Committed ${count} inventory records...`);
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }

    console.log(`Migration complete! Successfully migrated ${count} products.`);
    return { success: true, count, warehouseId };
  } catch (err) {
    console.error("Migration failed:", err);
    throw new HttpsError("internal", err.message);
  }
});

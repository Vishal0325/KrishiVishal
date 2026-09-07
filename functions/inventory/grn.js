const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Validates and processes a Goods Receipt Note (GRN).
 * This must be executed as a transaction to prevent race conditions.
 */
exports.receiveGrn = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  // Authentication check
  if (!context.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Only authenticated users can receive GRN."
    );
  }

  // Input validation
  const {
    skuCode,
    batchNumber,
    quantity,
    mfgDate,
    expiryDate,
    warehouseId,
    supplierId,
    purchaseReference,
    unitCost,
  } = data;

  if (!skuCode || !batchNumber || !quantity || !warehouseId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing required GRN fields: skuCode, batchNumber, quantity, warehouseId"
    );
  }

  if (quantity <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "Quantity must be greater than zero."
    );
  }

  const db = admin.firestore();
  
  // Transaction to ensure atomicity
  try {
    await db.runTransaction(async (transaction) => {
      // 1. Validate SKU exists
      const skuRef = db.collection("products").doc(skuCode);
      const skuDoc = await transaction.get(skuRef);
      if (!skuDoc.exists) {
        throw new HttpsError("not-found", `SKU ${skuCode} not found.`);
      }

      // 2. Validate Warehouse exists
      const warehouseRef = db.collection("warehouses").doc(warehouseId);
      const warehouseDoc = await transaction.get(warehouseRef);
      if (!warehouseDoc.exists) {
        // If it's a migration/default scenario, we might allow it, but strict is better.
        throw new HttpsError("not-found", `Warehouse ${warehouseId} not found.`);
      }

      // 3. Update Warehouse Inventory (Batch Stock)
      // Path: warehouse_inventory/{warehouseId_skuCode_batchNumber}
      const inventoryId = `${warehouseId}_${skuCode}_${batchNumber}`;
      const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
      const inventoryDoc = await transaction.get(inventoryRef);

      const parsedQty = Number(quantity);

      if (inventoryDoc.exists) {
        const currentData = inventoryDoc.data();
        transaction.update(inventoryRef, {
          availableQty: admin.firestore.FieldValue.increment(parsedQty),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
          unitCost: unitCost || currentData.unitCost, // Update cost if provided
        });
      } else {
        transaction.set(inventoryRef, {
          warehouseId,
          skuId: skuCode,
          batchId: batchNumber,
          availableQty: parsedQty,
          reservedQty: 0,
          transferReservedQty: 0,
          damagedQty: 0,
          expiredQty: 0,
          unitCost: unitCost || 0,
          mfgDate: mfgDate || null,
          expiryDate: expiryDate || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 4. Record Inventory Movement (Audit Trail)
      const movementRef = db.collection("inventory_movements").doc();
      transaction.set(movementRef, {
        warehouseId,
        skuId: skuCode,
        batchId: batchNumber,
        quantity: parsedQty,
        movementType: "GRN_RECEIPT",
        referenceId: purchaseReference || "MANUAL_GRN",
        actorId: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Update global SKU stock (Aggregation for fast querying, if needed)
      // We still update the global stock for quick UI displays, but warehouse_inventory is the source of truth.
      transaction.update(skuRef, {
        stock: admin.firestore.FieldValue.increment(parsedQty),
      });

      // Note: Future steps like ledger update and shipment readiness will hook here
    });

    return { success: true, message: "GRN processed successfully." };
  } catch (error) {
    console.error("Error processing GRN:", error);
    throw new HttpsError("internal", error.message);
  }
});

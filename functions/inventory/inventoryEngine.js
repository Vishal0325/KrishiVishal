const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Adjusts inventory stock (can be positive or negative) and logs the movement.
 */
exports.adjustInventory = onCall(async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { skuCode, adjustment, reason, batchId, warehouseId } = data;


  if (!skuCode || adjustment === undefined || !warehouseId || !batchId) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const db = admin.firestore();

  try {
    await db.runTransaction(async (transaction) => {
      // 1. Warehouse Stock Validation
      const inventoryId = `${warehouseId}_${skuCode}_${batchId}`;
      const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
      const inventoryDoc = await transaction.get(inventoryRef);

      const parsedAdjustment = Number(adjustment);

      if (!inventoryDoc.exists) {
        if (parsedAdjustment < 0) {
          throw new HttpsError("failed-precondition", "Insufficient stock.");
        }
        // Create it if it doesn't exist and we're adding stock
        transaction.set(inventoryRef, {
          warehouseId,
          skuId: skuCode,
          batchId: batchId,
          availableQty: parsedAdjustment,
          reservedQty: 0,
          transferReservedQty: 0,
          damagedQty: 0,
          expiredQty: 0,
          unitCost: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const currentData = inventoryDoc.data();
        if (currentData.availableQty + parsedAdjustment < 0) {
          throw new HttpsError("failed-precondition", "Insufficient stock.");
        }
        transaction.update(inventoryRef, {
          availableQty: admin.firestore.FieldValue.increment(parsedAdjustment),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 2. Global SKU update
      const skuRef = db.collection("products").doc(skuCode);
      transaction.update(skuRef, {
        stock: admin.firestore.FieldValue.increment(parsedAdjustment),
      });

      // 3. Movement Log
      const movementRef = db.collection("inventory_movements").doc();
      transaction.set(movementRef, {
        warehouseId,
        skuId: skuCode,
        batchId: batchId,
        quantity: parsedAdjustment,
        movementType: "ADJUSTMENT",
        reason: reason || "Manual Adjustment",
        actorId: auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error adjusting inventory:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Writes off damaged or expired stock.
 */
exports.writeOffStock = onCall(async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { skuCode, batchId, quantity, type, reason, warehouseId } = data;
  
  if (!skuCode || !batchId || !quantity || !warehouseId || !type) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const parsedQty = Number(quantity);
  if (parsedQty <= 0) {
    throw new HttpsError("invalid-argument", "Quantity must be greater than 0.");
  }

  const db = admin.firestore();

  try {
    await db.runTransaction(async (transaction) => {
      const inventoryId = `${warehouseId}_${skuCode}_${batchId}`;
      const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
      const inventoryDoc = await transaction.get(inventoryRef);

      if (!inventoryDoc.exists) {
        throw new HttpsError("failed-precondition", "Inventory not found.");
      }

      const currentData = inventoryDoc.data();
      if (currentData.availableQty < parsedQty) {
        throw new HttpsError("failed-precondition", "Insufficient available stock to write off.");
      }

      // Update warehouse inventory based on type
      const updateData = {
        availableQty: admin.firestore.FieldValue.increment(-parsedQty),
        lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (type === "DAMAGED") {
        updateData.damagedQty = admin.firestore.FieldValue.increment(parsedQty);
      } else if (type === "EXPIRED") {
        updateData.expiredQty = admin.firestore.FieldValue.increment(parsedQty);
      }

      transaction.update(inventoryRef, updateData);

      // Global SKU update
      const skuRef = db.collection("products").doc(skuCode);
      transaction.update(skuRef, {
        stock: admin.firestore.FieldValue.increment(-parsedQty),
      });

      // Movement Log
      const movementRef = db.collection("inventory_movements").doc();
      transaction.set(movementRef, {
        warehouseId,
        skuId: skuCode,
        batchId: batchId,
        quantity: -parsedQty,
        movementType: "WRITE_OFF",
        writeOffType: type,
        reason: reason || "",
        actorId: auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error writing off stock:", error);
    throw new HttpsError("internal", error.message);
  }
});

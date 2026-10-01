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

  const callerIsAdmin = auth && (auth.token.isAdmin === true || auth.token.admin === true);
  const callerRole = auth?.token?.role;
  if (!callerIsAdmin && !['SuperAdmin', 'WarehouseManager', 'Operations', 'Admin'].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Unauthorized. Only warehouse managers or admins can modify stock.");
  }

  const { skuCode, adjustment, reason, batchId, warehouseId, unitCost } = data;

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
        // [FIXED] Point #139: Record unit cost during manual adjustments to maintain accurate inventory valuation
        transaction.set(inventoryRef, {
          warehouseId,
          skuId: skuCode,
          batchId: batchId,
          availableQty: parsedAdjustment,
          reservedQty: 0,
          transferReservedQty: 0,
          damagedQty: 0,
          expiredQty: 0,
          unitCost: Number(unitCost) || 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const currentData = inventoryDoc.data();
        if (currentData.availableQty + parsedAdjustment < 0) {
          throw new HttpsError("failed-precondition", "Insufficient stock.");
        }
        const updatePayload = {
          availableQty: admin.firestore.FieldValue.increment(parsedAdjustment),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Update cost if provided
        if (unitCost !== undefined) {
          updatePayload.unitCost = Number(unitCost);
        }
        transaction.update(inventoryRef, updatePayload);
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

  const callerIsAdmin = auth && (auth.token.isAdmin === true || auth.token.admin === true);
  const callerRole = auth?.token?.role;
  if (!callerIsAdmin && !['SuperAdmin', 'WarehouseManager', 'Operations', 'Admin'].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Unauthorized. Only warehouse managers or admins can write off stock.");
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

/**
 * Concurrency-safe Return QC Pass & Stock Restocking via Backend Cloud Function.
 */
exports.restockReturnedItem = onCall(async (request) => {
  const data = request.data || {};
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const callerIsAdmin = auth && (auth.token.isAdmin === true || auth.token.admin === true);
  const callerRole = auth?.token?.role;
  if (!callerIsAdmin && !['SuperAdmin', 'WarehouseManager', 'Operations', 'Admin'].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Unauthorized. Only warehouse managers or admins can restock returned items.");
  }

  const { returnId, orderId, items, warehouseId, qcStatus = "PASSED", notes = "" } = data;

  if (!returnId) {
    throw new HttpsError("invalid-argument", "Missing returnId parameter.");
  }

  const db = admin.firestore();

  try {
    const returnRef = db.collection("returns").doc(returnId);
    const returnDoc = await returnRef.get();
    if (!returnDoc.exists) {
      throw new HttpsError("not-found", `Return request ${returnId} not found.`);
    }

    const returnData = returnDoc.data();
    const targetWarehouse = warehouseId || returnData.warehouseId || "MAIN_HUB";

    const itemsToRestock = Array.isArray(items) && items.length > 0
      ? items
      : [{
          productId: returnData.productId || returnData.skuId,
          skuCode: returnData.skuCode || returnData.productId,
          batchId: returnData.batchId || "DEFAULT",
          quantity: Number(returnData.quantity || 1)
        }];

    await db.runTransaction(async (transaction) => {
      for (const item of itemsToRestock) {
        const skuId = item.skuCode || item.productId;
        const qty = Number(item.quantity) || 1;
        const batchId = item.batchId || "DEFAULT";

        if (!skuId) continue;

        // 1. Update warehouse inventory
        const inventoryId = `${targetWarehouse}_${skuId}_${batchId}`;
        const invRef = db.collection("warehouse_inventory").doc(inventoryId);
        const invDoc = await transaction.get(invRef);

        if (invDoc.exists) {
          transaction.update(invRef, {
            availableQty: admin.firestore.FieldValue.increment(qty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          transaction.set(invRef, {
            warehouseId: targetWarehouse,
            skuId,
            batchId,
            availableQty: qty,
            reservedQty: 0,
            transferReservedQty: 0,
            damagedQty: 0,
            expiredQty: 0,
            unitCost: Number(item.unitCost) || 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        // 2. Global product stock increment
        const prodRef = db.collection("products").doc(skuId);
        const prodDoc = await transaction.get(prodRef);
        if (prodDoc.exists) {
          transaction.update(prodRef, {
            stock: admin.firestore.FieldValue.increment(qty),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        // 3. Immutable Inventory Movement Log
        const mRef = db.collection("inventory_movements").doc();
        transaction.set(mRef, {
          warehouseId: targetWarehouse,
          skuId,
          batchId,
          quantity: qty,
          movementType: "RETURN_RESTOCK",
          referenceId: returnId,
          orderId: orderId || returnData.orderId || null,
          reason: notes || "Restocked upon QC Approval",
          actorId: auth.uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // 4. Update return status to HUB_RECEIVED and qcStatus to PASSED
      transaction.update(returnRef, {
        status: "HUB_RECEIVED",
        qcStatus: qcStatus,
        hubDepositedAt: admin.firestore.FieldValue.serverTimestamp(),
        restockedAt: admin.firestore.FieldValue.serverTimestamp(),
        restockedBy: auth.uid,
        restockWarehouseId: targetWarehouse,
        adminNotes: notes ? `${returnData.adminNotes || ''}\n[QC RESTOCK]: ${notes}` : (returnData.adminNotes || ''),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Audit log
      const auditRef = db.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "RESTOCK_RETURNED_ITEM",
        resource: "Return",
        resourceId: returnId,
        warehouseId: targetWarehouse,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { orderId: orderId || returnData.orderId, actor: auth.uid, qcStatus }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error restocking returned item:", error);
    throw new HttpsError("internal", error.message);
  }
});

const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.createStockTransfer = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { sourceWarehouseId, destinationWarehouseId, items, reason } = data;

  if (!sourceWarehouseId || !destinationWarehouseId || !items || items.length === 0) {
    throw new HttpsError("invalid-argument", "Missing transfer fields.");
  }

  if (sourceWarehouseId === destinationWarehouseId) {
    throw new HttpsError("invalid-argument", "Source and destination cannot be the same.");
  }

  const db = admin.firestore();

  try {
    const transferRef = db.collection("stock_transfers").doc();
    
    // Status starts as REQUESTED. Stock is NOT yet modified.
    await transferRef.set({
      transferId: transferRef.id,
      sourceWarehouseId,
      destinationWarehouseId,
      items, // array of {skuId, batchId, quantity}
      reason: reason || "",
      status: "REQUESTED",
      createdBy: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, transferId: transferRef.id };
  } catch (error) {
    console.error("Error creating stock transfer:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.approveStockTransfer = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { transferId } = data;
  const db = admin.firestore();

  try {
    await db.runTransaction(async (transaction) => {
      const transferRef = db.collection("stock_transfers").doc(transferId);
      const transferDoc = await transaction.get(transferRef);

      if (!transferDoc.exists) {
        throw new HttpsError("not-found", "Transfer not found.");
      }

      const transferData = transferDoc.data();
      if (transferData.status !== "REQUESTED") {
        throw new HttpsError("failed-precondition", "Transfer must be REQUESTED to be APPROVED.");
      }

      // Check stock availability in source warehouse
      for (const item of transferData.items) {
        const inventoryId = `${transferData.sourceWarehouseId}_${item.skuId}_${item.batchId}`;
        const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
        const invDoc = await transaction.get(inventoryRef);

        if (!invDoc.exists || invDoc.data().availableQty < item.quantity) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient stock for SKU ${item.skuId} (Batch: ${item.batchId}) in source warehouse.`
          );
        }
      }

      // Reserve the stock
      for (const item of transferData.items) {
        const inventoryId = `${transferData.sourceWarehouseId}_${item.skuId}_${item.batchId}`;
        const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
        
        transaction.update(inventoryRef, {
          availableQty: admin.firestore.FieldValue.increment(-item.quantity),
          transferReservedQty: admin.firestore.FieldValue.increment(item.quantity),
          lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Update transfer status
      transaction.update(transferRef, {
        status: "APPROVED",
        approvedBy: context.auth.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error approving stock transfer:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.dispatchStockTransfer = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
    if (!context.auth) throw new HttpsError("unauthenticated", "Unauthorized.");
    
    const { transferId } = data;
    const db = admin.firestore();
  
    try {
      await db.runTransaction(async (transaction) => {
        const transferRef = db.collection("stock_transfers").doc(transferId);
        const transferDoc = await transaction.get(transferRef);
  
        if (!transferDoc.exists) throw new HttpsError("not-found", "Transfer not found.");
        
        const transferData = transferDoc.data();
        if (transferData.status !== "APPROVED" && transferData.status !== "PICKED") {
          throw new HttpsError("failed-precondition", "Transfer must be APPROVED to dispatch.");
        }
  
        // Source warehouse transferReservedQty becomes 0. It is now physically out of the warehouse.
        for (const item of transferData.items) {
          const inventoryId = `${transferData.sourceWarehouseId}_${item.skuId}_${item.batchId}`;
          const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
          
          transaction.update(inventoryRef, {
            transferReservedQty: admin.firestore.FieldValue.increment(-item.quantity),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Log movement for source (Stock left the building)
          const movementRef = db.collection("inventory_movements").doc();
          transaction.set(movementRef, {
            warehouseId: transferData.sourceWarehouseId,
            skuId: item.skuId,
            batchId: item.batchId,
            quantity: -item.quantity,
            movementType: "TRANSFER_OUT",
            referenceId: transferId,
            actorId: context.auth.uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
  
        transaction.update(transferRef, {
          status: "IN_TRANSIT",
          dispatchedBy: context.auth.uid,
          dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true };
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

exports.receiveStockTransfer = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
    if (!context.auth) throw new HttpsError("unauthenticated", "Unauthorized.");
    
    const { transferId } = data;
    const db = admin.firestore();
  
    try {
      await db.runTransaction(async (transaction) => {
        const transferRef = db.collection("stock_transfers").doc(transferId);
        const transferDoc = await transaction.get(transferRef);
  
        if (!transferDoc.exists) throw new HttpsError("not-found", "Transfer not found.");
        
        const transferData = transferDoc.data();
        if (transferData.status !== "IN_TRANSIT") {
          throw new HttpsError("failed-precondition", "Transfer must be IN_TRANSIT to receive.");
        }
  
        // Destination warehouse gains the stock
        for (const item of transferData.items) {
          const inventoryId = `${transferData.destinationWarehouseId}_${item.skuId}_${item.batchId}`;
          const inventoryRef = db.collection("warehouse_inventory").doc(inventoryId);
          const invDoc = await transaction.get(inventoryRef);

          if (invDoc.exists) {
            transaction.update(inventoryRef, {
                availableQty: admin.firestore.FieldValue.increment(item.quantity),
                lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(inventoryRef, {
                warehouseId: transferData.destinationWarehouseId,
                skuId: item.skuId,
                batchId: item.batchId,
                availableQty: item.quantity,
                reservedQty: 0,
                transferReservedQty: 0,
                damagedQty: 0,
                expiredQty: 0,
                unitCost: 0, // Should ideally copy from source if tracking cost strictly
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          
          // Log movement for destination (Stock entered the building)
          const movementRef = db.collection("inventory_movements").doc();
          transaction.set(movementRef, {
            warehouseId: transferData.destinationWarehouseId,
            skuId: item.skuId,
            batchId: item.batchId,
            quantity: item.quantity,
            movementType: "TRANSFER_IN",
            referenceId: transferId,
            actorId: context.auth.uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
  
        transaction.update(transferRef, {
          status: "COMPLETED",
          receivedBy: context.auth.uid,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true };
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

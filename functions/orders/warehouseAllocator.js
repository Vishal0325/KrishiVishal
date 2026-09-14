const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Normalizes an address string for matching.
 */
function normalizeAddressStr(str) {
  if (!str) return "";
  return str.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

/**
 * Allocates a warehouse to an order based on customer pincode/address and stock availability.
 * Triggered automatically when a new order is placed (or can be called via HTTPS).
 */
exports.allocateOrderWarehouse = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const orderData = snap.data();
    const orderId = context.params.orderId;
    const db = admin.firestore();

    // If already allocated (e.g. admin override during creation)
    if (orderData.fulfillmentWarehouseId) return null;

    try {
      const address = orderData.shippingAddress || {};
      const targetPincode = address.pincode || address.zip || "";

      // [FIXED] Point #138: Fetch default warehouse from config instead of hardcoding
      const configSnap = await db.collection("settings").doc("config").get();
      let allocatedWarehouseId = configSnap.exists ? configSnap.data().defaultFulfillmentWarehouse : "WH-PURNEA-01";

      // 1. Fetch Serviceable Warehouses for Pincode
      if (targetPincode) {
        const serviceabilityQuery = await db
          .collection("warehouse_serviceability")
          .where("pincode", "==", targetPincode)
          .where("isActive", "==", true)
          .orderBy("priority", "asc")
          .get();

        if (!serviceabilityQuery.empty) {
          // Just picking the highest priority serviceable warehouse for now
          // (Full FEFO/Availability check can be added here)
          allocatedWarehouseId = serviceabilityQuery.docs[0].data().warehouseId;
        }
      }

      // 2. Assign to order
      await db.collection("orders").doc(orderId).update({
        fulfillmentWarehouseId: allocatedWarehouseId,
        fulfillmentAssignmentType: "AUTO",
        fulfillmentAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 3. Create Shipment Record (Future-proofing mixed carts)
      const shipmentId = `SHP-${orderId}-1`;
      await db.collection("shipments").doc(shipmentId).set({
        shipmentId: shipmentId,
        orderId: orderId,
        warehouseId: allocatedWarehouseId,
        status: "PROCUREMENT_PENDING",
        items: orderData.items || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 4. Real-time Inventory Reservation & Movements Logging (Inside Transaction)
      // [FIXED] Points #48 & #137: Use Firestore Transaction for atomic stock reservation with strict read-before-write order
      let hasInsufficientStock = false;
      await db.runTransaction(async (transaction) => {
        const items = orderData.items || [];
        const invReads = [];

        // All reads must precede all writes in Firestore transactions
        for (const item of items) {
          const skuId = item.productId || item.skuId || item.id;
          const qty = Number(item.quantity) || 1;
          if (!skuId) continue;

          const invQuery = await db.collection("warehouse_inventory")
            .where("warehouseId", "==", allocatedWarehouseId)
            .where("skuId", "==", skuId)
            .limit(1)
            .get();

          if (!invQuery.empty) {
            const invRef = invQuery.docs[0].ref;
            const freshDoc = await transaction.get(invRef);
            invReads.push({ skuId, qty, invRef, freshDoc });
          } else {
            invReads.push({ skuId, qty, invRef: null, freshDoc: null });
          }
        }

        // Now execute all writes
        for (const { skuId, qty, invRef, freshDoc } of invReads) {
          if (invRef && freshDoc && freshDoc.exists) {
            const invData = freshDoc.data();
            const avail = Number(invData.availableQty) || 0;

            if (avail >= qty) {
              transaction.update(invRef, {
                availableQty: admin.firestore.FieldValue.increment(-qty),
                reservedQty: admin.firestore.FieldValue.increment(qty),
                lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
              });

              const movementRef = db.collection("inventory_movements").doc();
              transaction.set(movementRef, {
                warehouseId: allocatedWarehouseId,
                skuId: skuId,
                batchId: invData.batchId || "DEFAULT",
                quantity: -qty,
                movementType: "ORDER_RESERVED",
                referenceId: orderId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
              });
            } else {
              hasInsufficientStock = true;
            }
          } else {
            hasInsufficientStock = true;
          }
        }

        transaction.update(db.collection("orders").doc(orderId), {
          stockReservationStatus: hasInsufficientStock ? "PENDING_STOCK" : "FULLY_RESERVED"
        });
      });

      // 5. Log Audit
      await db.collection("audit_logs").add({
        action: "AUTO_ALLOCATE_WAREHOUSE",
        resource: "Order",
        resourceId: orderId,
        warehouseId: allocatedWarehouseId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { pincode: targetPincode, shipmentCreated: shipmentId, reservation: hasInsufficientStock ? "PARTIAL" : "RESERVED" },
      });

      return null;
    } catch (error) {
      console.error("Error allocating warehouse to order:", error);
      return null;
    }
  });

/**
 * Admin override to change order fulfillment warehouse.
 */
exports.overrideOrderWarehouse = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true);
  const callerRole = context.auth?.token?.role;
  if (!context.auth || (!callerIsAdmin && !['SuperAdmin', 'OrderManager', 'Admin'].includes(callerRole))) {
    throw new HttpsError("permission-denied", "Unauthorized access. Only Order Managers or Admins can override warehouses.");
  }

  const { orderId, newWarehouseId, reason } = data;

  if (!orderId || !newWarehouseId || !reason) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const db = admin.firestore();

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderDoc.data();
    const currentWarehouse = orderData.fulfillmentWarehouseId;

    if (currentWarehouse !== newWarehouseId && !['CANCELLED', 'DELIVERED'].includes(orderData.status)) {
      const items = orderData.items || [];
      const batch = db.batch();

      for (const item of items) {
        const skuId = item.productId || item.skuId || item.id;
        const qty = Number(item.quantity) || 1;
        if (!skuId) continue;

        // 1. Release reserved stock from old warehouse
        if (currentWarehouse) {
          const oldInvQ = await db.collection("warehouse_inventory")
            .where("warehouseId", "==", currentWarehouse)
            .where("skuId", "==", skuId)
            .limit(1)
            .get();

          if (!oldInvQ.empty) {
            const oldDoc = oldInvQ.docs[0];
            const currentReserved = Number(oldDoc.data().reservedQty) || 0;
            const releaseQty = Math.min(qty, currentReserved);
            batch.update(oldDoc.ref, {
              availableQty: admin.firestore.FieldValue.increment(releaseQty),
              reservedQty: admin.firestore.FieldValue.increment(-releaseQty),
              lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const m1 = db.collection("inventory_movements").doc();
            batch.set(m1, {
              warehouseId: currentWarehouse,
              skuId,
              quantity: releaseQty,
              movementType: "OVERRIDE_RELEASE",
              referenceId: orderId,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }

        // 2. Reserve stock in new warehouse
        const newInvQ = await db.collection("warehouse_inventory")
          .where("warehouseId", "==", newWarehouseId)
          .where("skuId", "==", skuId)
          .limit(1)
          .get();

        if (!newInvQ.empty) {
          const newDoc = newInvQ.docs[0];
          batch.update(newDoc.ref, {
            availableQty: admin.firestore.FieldValue.increment(-qty),
            reservedQty: admin.firestore.FieldValue.increment(qty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });

          const m2 = db.collection("inventory_movements").doc();
          batch.set(m2, {
            warehouseId: newWarehouseId,
            skuId,
            quantity: -qty,
            movementType: "OVERRIDE_RESERVE",
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      batch.update(orderRef, {
        fulfillmentWarehouseId: newWarehouseId,
        fulfillmentAssignmentType: "ADMIN_OVERRIDE",
        fulfillmentAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        fulfillmentAssignedBy: context.auth.uid,
      });

      const auditRef = db.collection("audit_logs").doc();
      batch.set(auditRef, {
        action: "OVERRIDE_ORDER_WAREHOUSE",
        resource: "Order",
        resourceId: orderId,
        warehouseId: newWarehouseId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { oldWarehouse: currentWarehouse, newWarehouse: newWarehouseId, reason, actor: context.auth.uid },
      });

      await batch.commit();
    } else {
      await orderRef.update({
        fulfillmentWarehouseId: newWarehouseId,
        fulfillmentAssignmentType: "ADMIN_OVERRIDE",
        fulfillmentAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        fulfillmentAssignedBy: context.auth.uid,
      });

      await db.collection("audit_logs").add({
        action: "OVERRIDE_ORDER_WAREHOUSE",
        resource: "Order",
        resourceId: orderId,
        warehouseId: newWarehouseId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { oldWarehouse: currentWarehouse, newWarehouse: newWarehouseId, reason, actor: context.auth.uid },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error overriding warehouse:", error);
    throw new HttpsError("internal", error.message);
  }
});

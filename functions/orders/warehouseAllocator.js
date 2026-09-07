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

      let allocatedWarehouseId = "WH-PURNEA-01"; // Fallback/Default

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

      // 4. Real-time Inventory Reservation & Movements Logging
      const items = orderData.items || [];
      let hasInsufficientStock = false;

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
          const invDoc = invQuery.docs[0];
          const invData = invDoc.data();
          const avail = Number(invData.availableQty) || 0;

          if (avail >= qty) {
            await invDoc.ref.update({
              availableQty: admin.firestore.FieldValue.increment(-qty),
              reservedQty: admin.firestore.FieldValue.increment(qty),
              lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection("inventory_movements").add({
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

      await db.collection("orders").doc(orderId).update({
        stockReservationStatus: hasInsufficientStock ? "PENDING_STOCK" : "FULLY_RESERVED"
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
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
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

    const currentWarehouse = orderDoc.data().fulfillmentWarehouseId;

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

    return { success: true };
  } catch (error) {
    console.error("Error overriding warehouse:", error);
    throw new HttpsError("internal", error.message);
  }
});

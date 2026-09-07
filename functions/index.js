const functions = require('firebase-functions/v1');
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Helper to compute delta between two objects.
 */
function getChangedFields(before, after) {
  const changes = {};
  for (const key in after) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { old: before[key], new: after[key] };
    }
  }
  return changes;
}

/**
 * Sync User Roles to Custom Claims for faster/cheaper security rules.
 */
exports.onUserRoleUpdate = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    const userId = context.params.userId;

    if (!data || !data.isAdmin) {
      await admin.auth().setCustomUserClaims(userId, { role: null, isAdmin: false });
      return null;
    }

    // Set custom claims: { role: 'SuperAdmin', isAdmin: true }
    await admin.auth().setCustomUserClaims(userId, {
      role: data.role || "Viewer",
      isAdmin: true,
      isActive: data.isActive !== false
    });

    // Log Staff changes
    if (change.before.exists && change.after.exists) {
      const changedFields = getChangedFields(change.before.data(), data);
      if (Object.keys(changedFields).length > 0) {
        await db.collection("audit_logs").add({
          action: "UPDATE_STAFF",
          resource: "Staff",
          resourceId: userId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: { email: data.email, changedFields },
        });
      }
    }
  });

exports.onProductCreate = functions.firestore
  .document("products/{productId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    
    await db.collection("audit_logs").add({
      action: "CREATE_PRODUCT",
      resource: "Product",
      resourceId: context.params.productId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: { name: data.name, price: data.price },
    });
  });

exports.onProductUpdate = functions.firestore
  .document("products/{productId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    
    const changedFields = getChangedFields(beforeData, afterData);
    if (Object.keys(changedFields).length === 0) return null;

    await db.collection("audit_logs").add({
      action: "UPDATE_PRODUCT",
      resource: "Product",
      resourceId: context.params.productId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        name: afterData.name,
        changedFields: changedFields
      },
    });
  });

exports.onProductDelete = functions.firestore
  .document("products/{productId}")
  .onDelete(async (snap, context) => {
    const data = snap.data();

    await db.collection("audit_logs").add({
      action: "DELETE_PRODUCT",
      resource: "Product",
      resourceId: context.params.productId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: { name: data.name },
    });
  });

/**
 * Audit Logs & Multi-Warehouse Stock Release/Fulfillment for Orders
 */
exports.onOrderUpdate = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const orderId = context.params.orderId;

    if (beforeData.status === afterData.status) return null;

    // 1. Audit Log for Status Change
    await db.collection("audit_logs").add({
      action: "UPDATE_ORDER_STATUS",
      resource: "Order",
      resourceId: orderId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        orderNumber: afterData.id || orderId,
        oldStatus: beforeData.status,
        newStatus: afterData.status
      },
    });

    const warehouseId = afterData.fulfillmentWarehouseId || "WH-PURNEA-01";
    const items = afterData.items || [];

    // 2. Cancellation: Release Reserved Stock back to Available Stock
    if (afterData.status === "CANCELLED" && beforeData.status !== "CANCELLED") {
      for (const item of items) {
        const skuId = item.productId || item.skuId || item.id;
        const qty = Number(item.quantity) || 1;
        if (!skuId) continue;

        const invQuery = await db.collection("warehouse_inventory")
          .where("warehouseId", "==", warehouseId)
          .where("skuId", "==", skuId)
          .limit(1)
          .get();

        if (!invQuery.empty) {
          const invDoc = invQuery.docs[0];
          await invDoc.ref.update({
            availableQty: admin.firestore.FieldValue.increment(qty),
            reservedQty: admin.firestore.FieldValue.increment(-qty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await db.collection("inventory_movements").add({
            warehouseId,
            skuId,
            batchId: invDoc.data().batchId || "DEFAULT",
            quantity: qty,
            movementType: "ORDER_CANCELLED_RESTOCK",
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    // 3. Delivered: Finalize deduction of Reserved Stock
    if (afterData.status === "DELIVERED" && beforeData.status !== "DELIVERED") {
      for (const item of items) {
        const skuId = item.productId || item.skuId || item.id;
        const qty = Number(item.quantity) || 1;
        if (!skuId) continue;

        const invQuery = await db.collection("warehouse_inventory")
          .where("warehouseId", "==", warehouseId)
          .where("skuId", "==", skuId)
          .limit(1)
          .get();

        if (!invQuery.empty) {
          const invDoc = invQuery.docs[0];
          await invDoc.ref.update({
            reservedQty: admin.firestore.FieldValue.increment(-qty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await db.collection("inventory_movements").add({
            warehouseId,
            skuId,
            batchId: invDoc.data().batchId || "DEFAULT",
            quantity: -qty,
            movementType: "ORDER_DELIVERED",
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    return null;
  });

// --- NEW MULTI-WAREHOUSE INVENTORY EXPORTS ---
const grn = require("./inventory/grn");
const inventoryEngine = require("./inventory/inventoryEngine");
const reports = require("./inventory/reports");
const skuMaster = require("./inventory/skuMaster");

exports.receiveGrn = grn.receiveGrn;
exports.adjustInventory = inventoryEngine.adjustInventory;
exports.writeOffStock = inventoryEngine.writeOffStock;
exports.getInventoryReport = reports.getInventoryReport;
exports.upsertSku = skuMaster.upsertSku;
exports.importSkus = skuMaster.importSkus;

const allocator = require("./orders/warehouseAllocator");
const transfer = require("./inventory/stockTransfer");

exports.allocateOrderWarehouse = allocator.allocateOrderWarehouse;
exports.overrideOrderWarehouse = allocator.overrideOrderWarehouse;

exports.createStockTransfer = transfer.createStockTransfer;
exports.approveStockTransfer = transfer.approveStockTransfer;
exports.dispatchStockTransfer = transfer.dispatchStockTransfer;
exports.receiveStockTransfer = transfer.receiveStockTransfer;

const migration = require("./inventory/migration");
exports.migrateCatalogToWarehouseInventory = migration.migrateCatalogToWarehouseInventory;

// --- HR & WORKFORCE EXPORTS ---
const documentFunctions = require("./workforce/documentFunctions");
exports.processDocumentExpiry = documentFunctions.processDocumentExpiry;
exports.getSecureDocumentAccess = documentFunctions.getSecureDocumentAccess;

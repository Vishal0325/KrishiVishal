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
  .onUpdate(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    const beforeData = change.before.data();
    const userId = context.params.userId;

    const isAdminBefore = beforeData.isAdmin === true || beforeData.admin === true;
    const isAdminAfter = data && (data.isAdmin === true || data.admin === true);

    if (data.role === beforeData.role &&
        isAdminAfter === isAdminBefore &&
        data.isActive === beforeData.isActive) {
      return null;
    }

    if (!isAdminAfter) {
      await admin.auth().setCustomUserClaims(userId, { role: null, isAdmin: false, admin: false });
      return null;
    }

    // [FIXED] Point #129: Preserve existing custom claims by merging them
    const userRecord = await admin.auth().getUser(userId);
    const existingClaims = userRecord.customClaims || {};

    const newClaims = {
      ...existingClaims,
      role: data.role || "Viewer",
      isAdmin: true,
      admin: true,
      isActive: data.isActive !== false
    };

    await admin.auth().setCustomUserClaims(userId, newClaims);

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

    const batch = db.batch();

    // 1. Audit Log for Status Change (Part of Batch)
    // [FIXED] Point #135: Included audit log in the same atomic batch as stock updates
    const auditRef = db.collection("audit_logs").doc();
    batch.set(auditRef, {
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
    let hasUpdates = false;

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
          const currentReserved = Number(invDoc.data().reservedQty) || 0;
          const releaseQty = Math.min(qty, currentReserved); // [FIXED] Point #143: Prevent negative reserved qty

          batch.update(invDoc.ref, {
            availableQty: admin.firestore.FieldValue.increment(releaseQty),
            reservedQty: admin.firestore.FieldValue.increment(-releaseQty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });

          const movementRef = db.collection("inventory_movements").doc();
          batch.set(movementRef, {
            warehouseId,
            skuId,
            batchId: invDoc.data().batchId || "DEFAULT",
            quantity: releaseQty,
            movementType: "ORDER_CANCELLED_RESTOCK",
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
          hasUpdates = true;
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
          const currentReserved = Number(invDoc.data().reservedQty) || 0;
          const deductQty = Math.min(qty, currentReserved); // [FIXED] Point #143: Prevent negative reserved qty

          batch.update(invDoc.ref, {
            reservedQty: admin.firestore.FieldValue.increment(-deductQty),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp()
          });

          const movementRef = db.collection("inventory_movements").doc();
          batch.set(movementRef, {
            warehouseId,
            skuId,
            batchId: invDoc.data().batchId || "DEFAULT",
            quantity: -deductQty,
            movementType: "ORDER_DELIVERED",
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
          hasUpdates = true;
        }
      }
    }

    // Always commit the audit log, and include stock updates if any
    await batch.commit();
    return null;
  });

/**
 * [FIXED] Point #106: Aggregate total wallet liability to a summary document to prevent massive user collection reads.
 */
exports.onUserWalletUpdate = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const beforeBalance = Number(before.walletBalance) || 0;
    const afterBalance = Number(after.walletBalance) || 0;

    if (beforeBalance === afterBalance) return null;

    const diff = afterBalance - beforeBalance;

    const summaryRef = db.collection("system_summaries").doc("finance");
    await summaryRef.set({
      totalWalletLiability: admin.firestore.FieldValue.increment(diff),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return null;
  });

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
exports.getSecureProductCost = skuMaster.getSecureProductCost;

const allocator = require("./orders/warehouseAllocator");
const cancelOrderFn = require("./orders/cancelOrder");
const couponEngine = require("./orders/couponEngine");
const transfer = require("./inventory/stockTransfer");

exports.allocateOrderWarehouse = allocator.allocateOrderWarehouse;
exports.overrideOrderWarehouse = allocator.overrideOrderWarehouse;
exports.adminCancelOrder = cancelOrderFn.cancelOrder;
exports.validateAndRedeemCoupon = couponEngine.validateAndRedeemCoupon;

const returnRefund = require("./processReturnRefund");
exports.initiateRefund = returnRefund.initiateRefund;
exports.processReturnRefund = returnRefund.processReturnRefund;

exports.createStockTransfer = transfer.createStockTransfer;
exports.approveStockTransfer = transfer.approveStockTransfer;
exports.dispatchStockTransfer = transfer.dispatchStockTransfer;
exports.receiveStockTransfer = transfer.receiveStockTransfer;
exports.cancelStockTransfer = transfer.cancelStockTransfer;

const migration = require("./inventory/migration");
exports.migrateCatalogToWarehouseInventory = migration.migrateCatalogToWarehouseInventory;

// --- HR & WORKFORCE EXPORTS ---
const documentFunctions = require("./workforce/documentFunctions");
const leaveFunctions = require("./workforce/leaveFunctions");
const hrMetrics = require("./workforce/hrMetrics");
exports.processDocumentExpiry = documentFunctions.processDocumentExpiry;
exports.getSecureDocumentAccess = documentFunctions.getSecureDocumentAccess;
exports.applyLeave = leaveFunctions.applyLeave;
exports.syncHRMetrics = hrMetrics.syncHRMetrics;

const notifications = require("./workforce/notifications");
exports.sendAutomatedNotification = notifications.sendAutomatedNotification;

const databaseBackup = require("./databaseBackup");
exports.automatedDatabaseBackup = databaseBackup.automatedDatabaseBackup;

const expenseEngine = require("./expenses/expenseEngine");
const expenseCleanup = require("./expenses/cleanup");
const financeMetrics = require("./finance/metrics");
exports.saveExpense = expenseEngine.saveExpense;
exports.cleanupOrphanedExpenseFiles = expenseCleanup.cleanupOrphanedExpenseFiles;
exports.getFinanceSummary = financeMetrics.getFinanceSummary;

const staffFunctions = require("./workforce/staffFunctions");
exports.createStaffMember = staffFunctions.createStaffMember;
exports.generateWorkforceId = staffFunctions.generateWorkforceId;
exports.searchUsers = staffFunctions.searchUsers;

const logger = require("./logger");
exports.addSecureAuditLog = logger.addSecureAuditLog;

/**
 * 26. Data Source Confusion Fix: Aggregate warehouse_inventory to products.stock
 */
exports.onWarehouseInventoryWrite = functions.firestore
  .document("warehouse_inventory/{docId}")
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    if (!data || !data.skuId) return null;
    const skuId = data.skuId;

    const invQuery = await db.collection("warehouse_inventory")
      .where("skuId", "==", skuId)
      .get();
    
    let totalStock = 0;
    invQuery.forEach(doc => {
      totalStock += Number(doc.data().availableQty || 0);
    });

    const prodRef = db.collection("products").doc(skuId);
    const prodSnap = await prodRef.get();
    if (prodSnap.exists) {
      await prodRef.update({ stockQuantity: totalStock, stock: totalStock, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      const q = await db.collection("products").where("skuCode", "==", skuId).limit(1).get();
      if (!q.empty) {
        await q.docs[0].ref.update({ stockQuantity: totalStock, stock: totalStock, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    return null;
  });

// --- AI CONTROL ROOM EXPORTS ---
const aiSupervisor = require("./ai/aiSupervisor");
exports.getAiSystemHealth = aiSupervisor.getAiSystemHealth;
exports.aiSupervisor = aiSupervisor.aiSupervisor;
exports.approveAiAction = aiSupervisor.approveAiAction;
exports.rejectAiAction = aiSupervisor.rejectAiAction;


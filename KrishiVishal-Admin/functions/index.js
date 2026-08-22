const functions = require("firebase-functions");
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
 * Audit Logs for Orders
 */
exports.onOrderUpdate = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (beforeData.status === afterData.status) return null;

    await db.collection("audit_logs").add({
      action: "UPDATE_ORDER_STATUS",
      resource: "Order",
      resourceId: context.params.orderId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        orderNumber: afterData.id || context.params.orderId,
        oldStatus: beforeData.status,
        newStatus: afterData.status
      },
    });
  });

import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db, auth } from "../firebase/config";

/**
 * Valid Action Types:
 * - CREATE_PRODUCT
 * - UPDATE_PRODUCT
 * - DELETE_PRODUCT
 * - UPDATE_STOCK
 * - CREATE_CATEGORY
 * - UPDATE_CATEGORY
 * - DELETE_CATEGORY
 * - UPDATE_ORDER
 */

export async function addAuditLog(action, resource, resourceId, details = {}) {
  try {
    const user = auth.currentUser;
    if (!user) return; // Silent return if not logged in (e.g. system actions)

    await addDoc(collection(db, "audit_logs"), {
      userId: user.uid,
      userEmail: user.email,
      action,
      resource, // e.g. "Product", "Category", "Order"
      resourceId, // e.g. "prod_123"
      details, // object containing old/new values
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't throw, we don't want to crash the main operation if logging fails
  }
}

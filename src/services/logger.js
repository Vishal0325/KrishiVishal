import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";

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
 * - UPLOAD_DOCUMENT
 * - VERIFY_DOCUMENT
 * - REJECT_DOCUMENT
 * - ARCHIVE_DOCUMENT
 * - CREATE_EMPLOYEE
 * - UPDATE_EMPLOYEE
 * - CREATE_RIDER_HR
 * - UPDATE_RIDER_HR
 * - INITIATE_EXIT
 * - FINALIZE_EXIT
 * - APPLY_LEAVE
 * - UPDATE_LEAVE_STATUS
 * - MARK_ATTENDANCE
 * - CREATE_TRAINING
 * - UPDATE_TRAINING
 * - UPDATE_SETTINGS
 * - CREATE_SUPPORT_TICKET
 * - UPDATE_CAPITAL_STRUCTURE
 * - ADD_SHAREHOLDER
 * - ADD_CORPORATE_LOAN
 * - RECORD_INTEREST_PAYMENT
 * - UPDATE_SALARY_STRUCTURE
 * - GENERATE_PAYROLL
 */

export async function addAuditLog(action, resource, resourceId, details = {}) {
  try {
    const addSecureAuditLog = httpsCallable(functions, "addSecureAuditLog");
    await addSecureAuditLog({
      action,
      module: resource,
      entityId: resourceId,
      details,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't throw, we don't want to crash the main operation if logging fails
  }
}

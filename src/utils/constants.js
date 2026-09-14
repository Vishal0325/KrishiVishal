/**
 * KRISHIVISHAL ERP - CENTRAL CONSTANTS
 */

export const AUDIT_ACTIONS = {
  // Inventory & Catalog
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  UPDATE_PRODUCT: 'UPDATE_PRODUCT',
  DELETE_PRODUCT: 'DELETE_PRODUCT',
  UPDATE_STOCK: 'UPDATE_STOCK',
  CREATE_CATEGORY: 'CREATE_CATEGORY',
  UPDATE_CATEGORY: 'UPDATE_CATEGORY',
  DELETE_CATEGORY: 'DELETE_CATEGORY',
  MANUAL_STOCK_ADJUSTMENT: 'MANUAL_STOCK_ADJUSTMENT',
  CREATE_GRN: 'CREATE_GRN',
  CREATE_PURCHASE_ORDER: 'CREATE_PURCHASE_ORDER',

  // Orders
  UPDATE_ORDER_STATUS: 'UPDATE_ORDER_STATUS',
  PACK_ORDER: 'PACK_ORDER',
  CANCEL_ORDER: 'CANCEL_ORDER',
  ASSIGN_RIDER: 'RIDER_ASSIGNED',

  // HR & Workforce
  CREATE_EMPLOYEE: 'CREATE_EMPLOYEE',
  UPDATE_EMPLOYEE: 'UPDATE_EMPLOYEE',
  CREATE_RIDER_HR: 'CREATE_RIDER_HR',
  UPDATE_RIDER_HR: 'UPDATE_RIDER_HR',
  INITIATE_EXIT: 'INITIATE_EXIT',
  FINALIZE_EXIT: 'FINALIZE_EXIT',
  APPLY_LEAVE: 'APPLY_LEAVE',
  UPDATE_LEAVE_STATUS: 'UPDATE_LEAVE_STATUS',
  MARK_ATTENDANCE: 'MARK_ATTENDANCE',
  CREATE_TRAINING: 'CREATE_TRAINING',
  UPDATE_TRAINING: 'UPDATE_TRAINING',

  // Documents
  UPLOAD_DOCUMENT: 'UPLOAD_DOCUMENT',
  VERIFY_DOCUMENT: 'VERIFY_DOCUMENT',
  REJECT_DOCUMENT: 'REJECT_DOCUMENT',
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
  UPDATE_DOCUMENT_SETTINGS: 'UPDATE_DOCUMENT_SETTINGS',

  // CRM & Support
  CREATE_SUPPORT_TICKET: 'CREATE_SUPPORT_TICKET',
  UPDATE_SUPPORT_TICKET: 'UPDATE_SUPPORT_TICKET',

  // Finance & Corporate
  UPDATE_CAPITAL_STRUCTURE: 'UPDATE_CAPITAL_STRUCTURE',
  ADD_SHAREHOLDER: 'ADD_SHAREHOLDER',
  ADD_CORPORATE_LOAN: 'ADD_CORPORATE_LOAN',
  RECORD_INTEREST_PAYMENT: 'RECORD_INTEREST_PAYMENT',
  UPDATE_SALARY_STRUCTURE: 'UPDATE_SALARY_STRUCTURE',
  GENERATE_PAYROLL: 'GENERATE_PAYROLL',

  // Settings
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
};

export const ORDER_STATUS = {
  PLACED: { label: 'Placed', color: '#8b5cf6' },
  PENDING: { label: 'Pending', color: '#f59e0b' },
  CONFIRMED: { label: 'Confirmed', color: '#3b82f6' },
  PACKED: { label: 'Packed', color: '#0284c7' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', color: '#f97316' },
  'Ready for Pickup': { label: 'Ready for Pickup', color: '#f97316' },
  SHIPPED: { label: 'Shipped', color: '#06b6d4' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: '#d97706' },
  DELIVERED: { label: 'Delivered', color: '#10b981' },
  Delivered: { label: 'Delivered', color: '#10b981' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444' },
  Cancelled: { label: 'Cancelled', color: '#ef4444' },
  RETURNED: { label: 'Returned', color: '#6b7280' },
  REFUNDED: { label: 'Refunded', color: '#ec4899' },
  PAID: { label: 'Paid', color: '#10b981' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  ACTIVE: { label: 'Active', color: '#10b981' },
  Active: { label: 'Active', color: '#10b981' },
  VERIFIED: { label: 'Verified', color: '#10b981' },
  REJECTED: { label: 'Rejected', color: '#ef4444' },
  EXPIRED: { label: 'Expired', color: '#dc2626' }
};


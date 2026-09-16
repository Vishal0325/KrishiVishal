import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * 9 Core Business Modules with their granular permissions
 */
export const PERMISSION_MODULES = [
  {
    id: "dashboard",
    name: "Dashboard & AI Analytics",
    icon: "LayoutDashboard",
    description: "Executive dashboards, KPIs, and AI-driven control rooms",
    permissions: [
      { key: "view_overview", label: "View Main Dashboard", desc: "Access high-level revenue and operational KPIs" },
      { key: "view_ai_control", label: "Access AI Control Room", desc: "View AI predictions and autonomous operational controls" },
      { key: "export_analytics", label: "Export Dashboard Reports", desc: "Download aggregate Excel/CSV summary reports" },
    ]
  },
  {
    id: "orders",
    name: "Orders & Fulfillment",
    icon: "ShoppingCart",
    description: "Live orders, packing station, auto-batching, and returns",
    permissions: [
      { key: "view_orders", label: "View Live Orders", desc: "Access incoming customer orders and details" },
      { key: "update_order_status", label: "Update Order Status", desc: "Change order workflow status (Packed, Dispatched, Delivered)" },
      { key: "manage_auto_batching", label: "Execute Auto-Batching", desc: "Trigger automated trip and order clustering algorithms" },
      { key: "operate_packing_station", label: "Operate Packing Station", desc: "Barcode scan items and generate packing slips" },
      { key: "handle_returns_rto", label: "Manage Returns & RTO", desc: "Process customer return approvals and RTO reconciliation" },
      { key: "cancel_override_orders", label: "Cancel / Force Override Orders", desc: "Admin override to cancel orders or bypass validations" },
    ]
  },
  {
    id: "catalog",
    name: "Catalog & SKU Inventory",
    icon: "Grid3X3",
    description: "Products, SKUs, pricing, expiry monitor, and liquidation",
    permissions: [
      { key: "view_catalog", label: "View Products & SKUs", desc: "Browse catalog products, variants, and stock levels" },
      { key: "create_edit_products", label: "Create / Edit Products", desc: "Add or update product master details, media, and prices" },
      { key: "delete_products", label: "Delete Products", desc: "Archive or permanently delete products and SKUs" },
      { key: "manage_categories_brands", label: "Manage Categories & Brands", desc: "Add/edit category hierarchy and brand partnerships" },
      { key: "monitor_expiry_deadstock", label: "Manage Expiry & Dead Stock", desc: "Trigger clearance discounts and FEFO stock liquidations" },
      { key: "manage_coupons_promos", label: "Manage Coupons & Banners", desc: "Configure promotional discounts, banners, and referral rules" },
    ]
  },
  {
    id: "supply_chain",
    name: "Supply Chain & Hubs",
    icon: "Building2",
    description: "Procurement, purchase orders, GRN inwarding, and warehouses",
    permissions: [
      { key: "view_supply_chain", label: "View Supply Chain Overview", desc: "View warehouse stock levels and procurement pipelines" },
      { key: "create_po", label: "Create Purchase Orders", desc: "Draft and submit POs to agri-input suppliers" },
      { key: "approve_po", label: "Approve Purchase Orders", desc: "Authorize high-value procurement expenditure" },
      { key: "perform_grn", label: "Process Goods Receipt (GRN)", desc: "Inward physical supplier deliveries and record lot/batch details" },
      { key: "inter_hub_transfers", label: "Execute Inter-Hub Transfers", desc: "Initiate and receive stock transfers between regional hubs" },
      { key: "manage_suppliers", label: "Manage Suppliers & Ledgers", desc: "Add/edit vendor profiles, credit terms, and ledger adjustments" },
      { key: "manage_warehouses", label: "Configure Hubs & Warehouses", desc: "Create new hubs, set serviceability radii, and pin codes" },
    ]
  },
  {
    id: "fleet",
    name: "Fleet & Delivery Logistics",
    icon: "Bike",
    description: "Delivery riders, live tracking, trips, cash recon, and SOS",
    permissions: [
      { key: "view_fleet", label: "View Fleet & Riders", desc: "View rider database, shift statuses, and online availability" },
      { key: "assign_dispatch_trips", label: "Assign & Dispatch Trips", desc: "Allocate order batches and trigger route dispatch to riders" },
      { key: "live_gps_tracking", label: "Live GPS Tracking", desc: "Real-time rider geofencing and delivery map visualization" },
      { key: "manage_rider_onboarding", label: "Onboard & Edit Riders", desc: "Approve rider KYC, driving licenses, and vehicle details" },
      { key: "reconcile_cod_cash", label: "Reconcile COD Cash Handovers", desc: "Verify and settle physical cash collected by delivery riders" },
      { key: "approve_rider_payouts", label: "Approve Rider Payouts", desc: "Calculate and authorize weekly/monthly delivery commissions" },
      { key: "handle_sos_alerts", label: "Handle Emergency SOS Alerts", desc: "Acknowledge and resolve live rider breakdown/emergency pings" },
    ]
  },
  {
    id: "support_crm",
    name: "Customers & Support Desk",
    icon: "Users",
    description: "Customer database, support tickets, complaints, and CRM pipeline",
    permissions: [
      { key: "view_customers", label: "View Customer Profiles", desc: "Access farmer profiles, address book, and order histories" },
      { key: "manage_support_tickets", label: "Manage Support Tickets", desc: "Assign, reply to, and resolve farmer queries & calls" },
      { key: "handle_complaints", label: "Handle Formal Complaints", desc: "Process product quality complaints and issue resolutions" },
      { key: "crm_sales_pipeline", label: "CRM & Tele-Agronomy Pipeline", desc: "Manage bulk order leads, farmer advisory, and sales funnel" },
      { key: "manage_customer_wallet", label: "Wallet & Credits Adjustment", desc: "Issue goodwill wallet refunds or loyalty credit adjustments" },
    ]
  },
  {
    id: "finance",
    name: "Finance & Accounts",
    icon: "Landmark",
    description: "Financial statements, GST reports, payments, and unit economics",
    permissions: [
      { key: "view_finance_overview", label: "View Financial Overview", desc: "Access revenue, COGS, gross margin, and burn rates" },
      { key: "view_financial_statements", label: "View P&L & Balance Sheet", desc: "Generate full statutory P&L, balance sheets, and cash flow" },
      { key: "manage_expenses", label: "Record & Approve Expenses", desc: "Enter operational expenses, upload invoices, and approve claims" },
      { key: "export_gst_reports", label: "Export GST & Tax Reports", desc: "Download GSTR-1, GSTR-3B compliant tax reconciliation sheets" },
      { key: "view_unit_economics", label: "Analyze Unit Economics", desc: "Inspect per-order contribution margins and packaging costs" },
      { key: "manage_bank_accounts", label: "Bank Account & Tally Sync", desc: "Configure settlement bank accounts and Tally ERP integrations" },
    ]
  },
  {
    id: "hr_compliance",
    name: "HR & Statutory Compliance",
    icon: "Briefcase",
    description: "Employee records, attendance, payroll runs, and legal compliance",
    permissions: [
      { key: "view_employees", label: "View Employee Directory", desc: "Access staff directory, designations, and departmental rosters" },
      { key: "manage_attendance", label: "Manage Shift Attendance", desc: "Review biometric/app check-ins and approve leave requests" },
      { key: "process_monthly_payroll", label: "Process Monthly Payroll", desc: "Generate salary sheets, PF/ESI deductions, and payslips" },
      { key: "verify_documents_bgv", label: "Verify HR Documents & BGV", desc: "Approve Aadhaar/PAN verification and background check reports" },
      { key: "statutory_licenses", label: "Manage Licenses & Form O/A", desc: "Monitor fertilizer/pesticide retail licenses and renewals" },
    ]
  },
  {
    id: "administration",
    name: "System Administration & Security",
    icon: "Settings",
    description: "Staff management, custom RBAC permissions, audit logs, and settings",
    permissions: [
      { key: "manage_staff_accounts", label: "Manage Staff Accounts", desc: "Create, activate, or deactivate admin and operator accounts" },
      { key: "configure_rbac_roles", label: "Configure RBAC Roles & Permissions", desc: "Create custom roles and modify granular permission matrix" },
      { key: "view_audit_logs", label: "View Security Audit Logs", desc: "Inspect immutable audit logs for all administrative actions" },
      { key: "global_system_settings", label: "Modify Global App Settings", desc: "Update delivery charges, minimum order limits, and app flags" },
      { key: "broadcast_notifications", label: "Broadcast Push Notifications", desc: "Send targeted or mass FCM push notifications to app users" },
    ]
  }
];

/**
 * Built-in default system roles with their pre-configured permission sets
 */
export const DEFAULT_SYSTEM_ROLES = [
  {
    id: "SuperAdmin",
    name: "Super Administrator",
    department: "EXECUTIVE",
    description: "Full, unrestricted access to all modules, financial data, and system configurations.",
    badgeColor: "emerald",
    isSystem: true,
    isImmutable: true,
    permissions: PERMISSION_MODULES.flatMap(m => m.permissions.map(p => p.key))
  },
  {
    id: "HubManager",
    name: "Hub / Warehouse Manager",
    department: "OPERATIONS",
    description: "Manages regional warehouse stock, order packing, dispatching, and local fleet logistics.",
    badgeColor: "blue",
    isSystem: true,
    permissions: [
      "view_overview", "export_analytics",
      "view_orders", "update_order_status", "manage_auto_batching", "operate_packing_station", "handle_returns_rto",
      "view_catalog", "monitor_expiry_deadstock",
      "view_supply_chain", "perform_grn", "inter_hub_transfers",
      "view_fleet", "assign_dispatch_trips", "live_gps_tracking", "reconcile_cod_cash", "handle_sos_alerts",
      "view_customers", "manage_support_tickets"
    ]
  },
  {
    id: "CatalogManager",
    name: "Catalog & Merchandising Manager",
    department: "COMMERCIAL",
    description: "Oversees crop categories, product listings, pricing, promotions, and brand partnerships.",
    badgeColor: "purple",
    isSystem: true,
    permissions: [
      "view_overview", "export_analytics",
      "view_catalog", "create_edit_products", "manage_categories_brands", "monitor_expiry_deadstock", "manage_coupons_promos",
      "broadcast_notifications"
    ]
  },
  {
    id: "OrderManager",
    name: "Order Fulfillment Specialist",
    department: "OPERATIONS",
    description: "Handles live order processing, dispatch queue, packing coordination, and returns handling.",
    badgeColor: "indigo",
    isSystem: true,
    permissions: [
      "view_overview",
      "view_orders", "update_order_status", "manage_auto_batching", "operate_packing_station", "handle_returns_rto",
      "view_catalog", "view_fleet", "assign_dispatch_trips", "live_gps_tracking"
    ]
  },
  {
    id: "FinanceAdmin",
    name: "Finance & Accounts Head",
    department: "FINANCE",
    description: "Manages general ledger, COD cash reconciliation, vendor payouts, GST filing, and unit economics.",
    badgeColor: "amber",
    isSystem: true,
    permissions: [
      "view_overview", "export_analytics",
      "view_orders",
      "reconcile_cod_cash", "approve_rider_payouts",
      "view_finance_overview", "view_financial_statements", "manage_expenses", "export_gst_reports", "view_unit_economics", "manage_bank_accounts"
    ]
  },
  {
    id: "HRAdmin",
    name: "HR & Compliance Director",
    department: "HUMAN_RESOURCES",
    description: "Full control over staff profiles, attendance rosters, payroll processing, and statutory compliance.",
    badgeColor: "rose",
    isSystem: true,
    permissions: [
      "view_overview",
      "view_employees", "manage_attendance", "process_monthly_payroll", "verify_documents_bgv", "statutory_licenses",
      "manage_staff_accounts"
    ]
  },
  {
    id: "RiderManager",
    name: "Fleet & Dispatch Supervisor",
    department: "LOGISTICS",
    description: "Manages on-field delivery riders, shift attendance, live tracking, and emergency SOS resolution.",
    badgeColor: "cyan",
    isSystem: true,
    permissions: [
      "view_overview",
      "view_orders", "manage_auto_batching",
      "view_fleet", "assign_dispatch_trips", "live_gps_tracking", "manage_rider_onboarding", "reconcile_cod_cash", "handle_sos_alerts"
    ]
  },
  {
    id: "OperationsAdmin",
    name: "Operations Administrator",
    department: "OPERATIONS",
    description: "Coordinates multi-hub procurement, stock movements, and overall supply chain health.",
    badgeColor: "teal",
    isSystem: true,
    permissions: [
      "view_overview", "export_analytics",
      "view_orders", "update_order_status", "manage_auto_batching",
      "view_catalog", "monitor_expiry_deadstock",
      "view_supply_chain", "create_po", "perform_grn", "inter_hub_transfers", "manage_suppliers", "manage_warehouses",
      "view_fleet", "live_gps_tracking"
    ]
  },
  {
    id: "Viewer",
    name: "Read-Only Auditor / Viewer",
    department: "AUDIT",
    description: "Read-only visibility into operational metrics and orders without permission to edit or mutate.",
    badgeColor: "slate",
    isSystem: true,
    permissions: [
      "view_overview",
      "view_orders",
      "view_catalog",
      "view_supply_chain",
      "view_fleet"
    ]
  }
];

const ROLES_SETTING_DOC = "rbac_roles";

/**
 * Fetch all role definitions from Firestore with fallback to defaults
 */
export async function fetchRoleDefinitions() {
  try {
    const docRef = doc(db, "system_settings", ROLES_SETTING_DOC);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && Array.isArray(docSnap.data().roles)) {
      const storedRoles = docSnap.data().roles;
      // Merge system defaults with any custom roles created
      const roleMap = new Map();
      DEFAULT_SYSTEM_ROLES.forEach(r => roleMap.set(r.id, r));
      storedRoles.forEach(r => roleMap.set(r.id, { ...roleMap.get(r.id), ...r }));
      return Array.from(roleMap.values());
    }

    // Initialize document with default system roles if not present
    await setDoc(docRef, {
      roles: DEFAULT_SYSTEM_ROLES,
      updatedAt: serverTimestamp(),
      version: "2.5.0"
    }, { merge: true });

    return DEFAULT_SYSTEM_ROLES;
  } catch (error) {
    console.error("Error fetching RBAC roles:", error);
    // Return default system roles safely in case of network or permissions error
    return DEFAULT_SYSTEM_ROLES;
  }
}

/**
 * Save / Update a role definition in Firestore
 */
export async function saveRoleDefinition(roleData) {
  try {
    const docRef = doc(db, "system_settings", ROLES_SETTING_DOC);
    const currentRoles = await fetchRoleDefinitions();
    
    // Prevent modifying SuperAdmin's locked state
    if (roleData.id === "SuperAdmin") {
      roleData.permissions = PERMISSION_MODULES.flatMap(m => m.permissions.map(p => p.key));
    }

    const existingIndex = currentRoles.findIndex(r => r.id === roleData.id);
    let updatedRoles;

    if (existingIndex >= 0) {
      updatedRoles = [...currentRoles];
      updatedRoles[existingIndex] = {
        ...updatedRoles[existingIndex],
        ...roleData,
        updatedAt: new Date().toISOString()
      };
    } else {
      updatedRoles = [
        ...currentRoles,
        {
          ...roleData,
          isSystem: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
    }

    await setDoc(docRef, {
      roles: updatedRoles,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true, roles: updatedRoles };
  } catch (error) {
    console.error("Error saving RBAC role:", error);
    throw error;
  }
}

/**
 * Delete a custom role (Cannot delete system default roles)
 */
export async function deleteRoleDefinition(roleId) {
  try {
    const defaultRole = DEFAULT_SYSTEM_ROLES.find(r => r.id === roleId);
    if (defaultRole?.isSystem) {
      throw new Error(`Cannot delete built-in system role '${roleId}'. You can modify its permissions instead.`);
    }

    const docRef = doc(db, "system_settings", ROLES_SETTING_DOC);
    const currentRoles = await fetchRoleDefinitions();
    const updatedRoles = currentRoles.filter(r => r.id !== roleId);

    await setDoc(docRef, {
      roles: updatedRoles,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true, roles: updatedRoles };
  } catch (error) {
    console.error("Error deleting RBAC role:", error);
    throw error;
  }
}

/**
 * Check if a role has a specific permission key
 */
export function hasRolePermission(roleObject, permissionKey) {
  if (!roleObject) return false;
  if (roleObject.id === "SuperAdmin") return true;
  return Array.isArray(roleObject.permissions) && roleObject.permissions.includes(permissionKey);
}

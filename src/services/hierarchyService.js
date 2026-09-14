/**
 * Hierarchy & Escalation Service for KrishiVishal-Admin
 * Manages Reporting Lines, Org Tree Traversal, Approval Routing, and Escalation Matrix.
 */

export const HIERARCHY_LEVELS = [
  { level: 1, title: "Executive / Board of Directors", code: "L1", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { level: 2, title: "Department Head / VP", code: "L2", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { level: 3, title: "Hub Manager / Regional Lead", code: "L3", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { level: 4, title: "Shift Supervisor / Senior Exec", code: "L4", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { level: 5, title: "Field Executive / Fleet Lead", code: "L5", color: "bg-gray-100 text-gray-800 border-gray-200" },
];

export const DEPARTMENTS = [
  { id: "EXECUTIVE", name: "Executive & Board", icon: "Crown" },
  { id: "OPERATIONS", name: "Operations & Multi-Hub Logistics", icon: "Truck" },
  { id: "FINANCE", name: "Finance, Accounts & Audit", icon: "Landmark" },
  { id: "HR_COMPLIANCE", name: "HR, Legal & Compliance", icon: "Briefcase" },
  { id: "CATALOG_SOURCING", name: "Catalog, Agri-Sourcing & Quality", icon: "Package" },
  { id: "CUSTOMER_SUPPORT", name: "Customer CRM & Farmer Helpdesk", icon: "Headphones" },
];

/**
 * Builds an Org Tree from a flat list of staff members.
 */
export function buildOrgTree(staffList) {
  if (!Array.isArray(staffList) || staffList.length === 0) return [];

  const staffMap = {};
  const rootNodes = [];

  // Index all staff
  staffList.forEach(staff => {
    staffMap[staff.id] = {
      ...staff,
      children: []
    };
  });

  // Connect children to parents
  staffList.forEach(staff => {
    const reportsTo = staff.reportsTo;
    if (reportsTo && staffMap[reportsTo] && reportsTo !== staff.id) {
      staffMap[reportsTo].children.push(staffMap[staff.id]);
    } else {
      rootNodes.push(staffMap[staff.id]);
    }
  });

  // Sort root nodes by hierarchy level ascending (Level 1 first)
  rootNodes.sort((a, b) => (Number(a.hierarchyLevel || 4) - Number(b.hierarchyLevel || 4)));

  return rootNodes;
}

/**
 * Returns all direct subordinates for a manager.
 */
export function getDirectReportees(managerId, staffList) {
  if (!managerId || !Array.isArray(staffList)) return [];
  return staffList.filter(s => s.reportsTo === managerId);
}

/**
 * Traverses upward to get the full management approval chain.
 */
export function getReportingChain(staffId, staffList) {
  if (!staffId || !Array.isArray(staffList)) return [];
  const staffMap = new Map(staffList.map(s => [s.id, s]));
  const chain = [];
  const visited = new Set();

  let current = staffMap.get(staffId);
  while (current && current.reportsTo && !visited.has(current.reportsTo)) {
    visited.add(current.id);
    const manager = staffMap.get(current.reportsTo);
    if (manager) {
      chain.push(manager);
      current = manager;
    } else {
      break;
    }
  }

  return chain;
}

/**
 * Default Escalation Matrix Rules
 */
export const DEFAULT_ESCALATION_RULES = [
  {
    id: "ESC-OPS-01",
    department: "OPERATIONS",
    category: "Order Dispatch Delay",
    condition: "Order stuck in processing > 4 hours",
    level1: "Shift Supervisor (Immediate)",
    level2: "Hub Manager (+2 hours)",
    level3: "VP Operations (+4 hours)",
    sla: "4h SLA",
    severity: "HIGH"
  },
  {
    id: "ESC-FIN-01",
    department: "FINANCE",
    category: "Cash Reconciliation Variance",
    condition: "Rider cash variance > ₹500 or bank deposit delayed > 24h",
    level1: "Cashier / Recon Exec",
    level2: "Finance Auditor (+6 hours)",
    level3: "Head of Finance / CFO (+12 hours)",
    sla: "12h SLA",
    severity: "CRITICAL"
  },
  {
    id: "ESC-PROC-01",
    department: "OPERATIONS",
    category: "Purchase Order Dual Approval",
    condition: "PO > ₹50,000 pending approval > 24 hours",
    level1: "Procurement Manager",
    level2: "Head of Supply Chain (+12 hours)",
    level3: "Managing Director (+24 hours)",
    sla: "24h SLA",
    severity: "MEDIUM"
  },
  {
    id: "ESC-HR-01",
    department: "HR_COMPLIANCE",
    category: "Driver KYC / License Expiry",
    condition: "Rider license expires within 7 days & unrenewed",
    level1: "HR Onboarding Exec",
    level2: "Fleet Manager (+24 hours)",
    level3: "Head of HR (+48 hours)",
    sla: "48h SLA",
    severity: "HIGH"
  },
  {
    id: "ESC-TECH-01",
    department: "EXECUTIVE",
    category: "Delivery Boy SOS / Emergency Alert",
    condition: "Rider presses SOS or vehicle breakdown reported",
    level1: "Fleet Support Room (0-5 min)",
    level2: "Hub Manager (5-15 min)",
    level3: "Operations Director (15+ min)",
    sla: "15m SLA",
    severity: "CRITICAL"
  }
];

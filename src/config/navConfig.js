export const navConfig = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    allowedRoles: ['SuperAdmin', 'FinanceAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'hr-desk',
    path: '/hr-desk',
    label: 'HR Desk',
    icon: 'Users',
    allowedRoles: ['SuperAdmin', 'HRAdmin', 'HRExecutive', 'DepartmentManager'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'orders',
    path: '/orders',
    label: 'Orders',
    icon: 'ShoppingCart',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'returns',
    path: '/returns',
    label: 'Returns / RTO',
    icon: 'RotateCcw',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'auto-batching',
    path: '/auto-batching',
    label: 'AutoBatching',
    icon: 'Layers',
    allowedRoles: ['SuperAdmin', 'HubManager'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'procurement',
    path: '/procurement',
    label: 'Procurement Queue',
    icon: 'ClipboardList',
    allowedRoles: ['SuperAdmin', 'HubManager'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'grn',
    path: '/grn',
    label: 'Goods Receipt',
    icon: 'PackageCheck',
    allowedRoles: ['SuperAdmin', 'HubManager'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'transfers',
    path: '/transfers',
    label: 'Inter-Hub Transfers',
    icon: 'ArrowLeftRight',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'expiry',
    path: '/expiry',
    label: 'Expiry Monitor',
    icon: 'AlertTriangle',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'skus',
    path: '/sku-dashboard',
    label: 'SKU Dashboard',
    icon: 'Boxes',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'customers',
    path: '/customers',
    label: 'Customers',
    icon: 'Users',
    allowedRoles: ['SuperAdmin', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'tickets',
    path: '/support-tickets',
    label: 'Support Tickets',
    icon: 'Headphones',
    allowedRoles: ['SuperAdmin', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'riders',
    path: '/riders',
    label: 'Riders / Workforce',
    icon: 'Bike',
    allowedRoles: ['SuperAdmin', 'HubManager', 'Viewer'],
    requiresFinance: false,
    readOnlyFor: ['Viewer']
  },
  {
    id: 'finance',
    path: '/finance',
    label: 'Finance / Ledger',
    icon: 'Landmark',
    allowedRoles: ['SuperAdmin', 'FinanceAdmin'],
    requiresFinance: true,
    readOnlyFor: []
  },
  {
    id: 'expenses',
    path: '/expenses',
    label: 'Expenses',
    icon: 'Receipt',
    allowedRoles: ['SuperAdmin', 'FinanceAdmin'],
    requiresFinance: true,
    readOnlyFor: []
  },
  {
    id: 'accounts',
    path: '/chart-of-accounts',
    label: 'Accounts / GST',
    icon: 'FileText',
    allowedRoles: ['SuperAdmin', 'FinanceAdmin'],
    requiresFinance: true,
    readOnlyFor: []
  },
  {
    id: 'ai-control',
    path: '/ai-control',
    label: 'AI Control Room',
    icon: 'Bot',
    allowedRoles: ['SuperAdmin'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'staff',
    path: '/staff',
    label: 'Staff Management',
    icon: 'UserCog',
    allowedRoles: ['SuperAdmin'],
    requiresFinance: false,
    readOnlyFor: []
  },
  {
    id: 'warehouses',
    path: '/warehouses',
    label: 'Warehouse Settings',
    icon: 'Building2',
    allowedRoles: ['SuperAdmin', 'HubManager'],
    requiresFinance: false,
    readOnlyFor: ['HubManager']
  }
];

export default navConfig;

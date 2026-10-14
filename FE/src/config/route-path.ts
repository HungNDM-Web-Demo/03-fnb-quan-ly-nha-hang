/** Đường dẫn FE (kebab-case). Không gõ đường dẫn trực tiếp trong component. */
export const routePath = {
  root: '/',
  login: '/login',
  forbidden: '/forbidden',
  profile: '/profile',

  dashboard: '/dashboard',
  tables: '/tables',
  tableService: (id: string) => `/tables/${id}`,
  tableCheckout: (id: string) => `/tables/${id}/checkout`,
  kitchen: '/kitchen',
  orders: '/orders',
  orderPrint: (id: string) => `/orders/${id}/print`,
  reservations: '/reservations',
  menuItems: '/menu-items',
  reports: '/reports',

  settingsUsers: '/settings/users',
  settingsRoles: '/settings/roles',
  settingsGeneral: '/settings/general',
  settingsAuditLogs: '/settings/audit-logs',
} as const

export type RoutePath = Extract<(typeof routePath)[keyof typeof routePath], string>

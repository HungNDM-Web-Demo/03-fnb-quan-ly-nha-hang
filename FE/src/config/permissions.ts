/**
 * Mã quyền, khai báo giống hệt BE `Application/Constants/Permissions.cs`
 * và danh sách seed `src/mock/seed/system.json` (+ project.json).
 * Định dạng `{resource}.{action}`. Không gõ chuỗi mã quyền trực tiếp trong component.
 */
export const permissions = {
  dashboard: {
    view: 'dashboard.view',
  },
  users: {
    view: 'users.view',
    create: 'users.create',
    update: 'users.update',
    delete: 'users.delete',
  },
  roles: {
    view: 'roles.view',
    create: 'roles.create',
    update: 'roles.update',
    delete: 'roles.delete',
  },
  settings: {
    view: 'settings.view',
    update: 'settings.update',
  },
  auditLogs: {
    view: 'audit-logs.view',
  },
  // Quyền nghiệp vụ (docs/07-DANH-SACH-API.md §1, 02-SRS §7), khớp BE Permissions.cs và project.json
  tables: {
    view: 'tables.view',
    create: 'tables.create',
    update: 'tables.update',
    delete: 'tables.delete',
    open: 'tables.open',
    transfer: 'tables.transfer',
  },
  menuItems: {
    view: 'menu-items.view',
    create: 'menu-items.create',
    update: 'menu-items.update',
    delete: 'menu-items.delete',
    availability: 'menu-items.availability',
  },
  orders: {
    view: 'orders.view',
    create: 'orders.create',
    prebill: 'orders.prebill',
    split: 'orders.split',
    discount: 'orders.discount',
    discountOverride: 'orders.discount-override',
    checkout: 'orders.checkout',
    reprint: 'orders.reprint',
    cancel: 'orders.cancel',
  },
  orderItems: {
    cancel: 'order-items.cancel',
    voidApprove: 'order-items.void-approve',
  },
  kitchenTickets: {
    view: 'kitchen-tickets.view',
    update: 'kitchen-tickets.update',
  },
  reservations: {
    view: 'reservations.view',
    create: 'reservations.create',
    update: 'reservations.update',
    delete: 'reservations.delete',
    checkIn: 'reservations.check-in',
  },
  reports: {
    view: 'reports.view',
  },
} as const

/** Mã vai trò hệ thống (BR-SYS-06). */
export const roleCodes = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  staff: 'STAFF',
  waiter: 'WAITER',
  kitchen: 'KITCHEN',
  cashier: 'CASHIER',
} as const

type Leaves<T> = T extends string ? T : { [K in keyof T]: Leaves<T[K]> }[keyof T]
export type PermissionCode = Leaves<typeof permissions>

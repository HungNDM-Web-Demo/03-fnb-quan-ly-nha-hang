/**
 * Kiểu dữ liệu nghiệp vụ nhà hàng, khớp từng trường với DTO BE (docs/07-DANH-SACH-API.md §2).
 * Enum là chuỗi PascalCase không dấu (06 §4).
 */
import type { PaginatedResult, PaginationQuery } from '@/types/api'

// ───────────────────────── Enum ─────────────────────────

export type TableShape = 'Vuong' | 'Tron' | 'ChuNhat'
export type TableStatus = 'Trong' | 'DaDat' | 'DangPhucVu' | 'ChoThanhToan' | 'ChoDon' | 'DaGop'
export type PricingType = 'TheoSuat' | 'TheoTrongLuong'
export type KitchenStation = 'BepNong' | 'BepNguoi' | 'QuayBar' | 'KhongQuaBep'
export type MenuItemStatus = 'DangBan' | 'TamHet' | 'An'
export type OrderStatus = 'DangMo' | 'DangThu' | 'DaThanhToan' | 'DaGop' | 'DaHuy'
export type OrderItemStatus = 'ChuaGui' | 'ChoGoi' | 'ChoLam' | 'DangLam' | 'Xong' | 'DaPhucVu' | 'DaHuy'
export type CancelReason = 'KhachDoiY' | 'GoiNham' | 'ChoLau' | 'Khac' | 'HetMon'
export type KitchenTicketStatus = 'DangCho' | 'DaXong'
export type PaymentMethod = 'TienMat' | 'ChuyenKhoan' | 'The' | 'TienCoc'
export type DiscountType = 'PhanTram' | 'SoTien'
export type ReservationStatus = 'ChoDen' | 'DaNhanBan' | 'KhongDen' | 'DaHuy'
export type ApprovalAction = 'HuyMon' | 'GiamGia'

// ───────────────────────── Thực đơn (§2.1–2.4) ─────────────────────────

export type CategoryDto = {
  id: string
  code: string
  name: string
  color: string
  sortOrder: number
  isHidden: boolean
  /** Món chưa xóa, kể cả ẩn */
  itemCount: number
}
export type SaveCategoryRequest = { code: string; name: string; color: string; isHidden: boolean }

export type MenuItemDto = {
  id: string
  code: string
  name: string
  categoryId: string
  categoryName: string
  imageUrl?: string
  description?: string
  unit: string
  pricingType: PricingType
  price: number
  station: KitchenStation
  prepMinutes?: number
  isSoldOut: boolean
  isHidden: boolean
  status: MenuItemStatus
  sortOrder: number
  everOrdered: boolean
  updatedAt: string
}

export type SaveMenuItemRequest = {
  code: string
  name: string
  categoryId: string
  description?: string
  unit: string
  pricingType: PricingType
  price: number
  station: KitchenStation
  prepMinutes?: number
  sortOrder?: number
}

export type MenuItemQuery = PaginationQuery & {
  categoryId?: string
  status?: MenuItemStatus
  station?: KitchenStation
}

export type QuickNoteDto = { id: string; content: string; sortOrder: number }

export type MenuBundle = {
  categories: CategoryDto[]
  items: MenuItemDto[]
  quickNotes: QuickNoteDto[]
}

// ───────────────────────── Khu vực, bàn (§2.5–2.7) ─────────────────────────

export type AreaDto = {
  id: string
  code: string
  name: string
  sortOrder: number
  isHidden: boolean
  tableCount: number
}
export type SaveAreaRequest = { code: string; name: string; isHidden: boolean }

export type DiningTableDto = {
  id: string
  code: string
  areaId: string
  areaCode: string
  areaName: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  isHidden: boolean
  everUsed: boolean
}
export type SaveTableRequest = {
  code: string
  areaId: string
  capacity: number
  shape: TableShape
  x: number
  y: number
}
export type TableLayoutRequest = { items: { id: string; x: number; y: number }[] }

export type TableReservationInfo = {
  id: string
  code: string
  customerName: string
  arrivalAt: string
  guestCount: number
  deposit: number
  note?: string
  isLate: boolean
}

export type TableCardDto = {
  id: string
  code: string
  areaId: string
  areaCode: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  status: TableStatus
  orderIds: string[]
  guestCount?: number
  openedAt?: string
  waiterId?: string
  waiterName?: string
  subtotal?: number
  readyCount: number
  hasLateItems: boolean
  unsentCount: number
  isLocked: boolean
  mergedIntoTableId?: string
  mergedIntoTableCode?: string
  mergedTableCodes: string[]
  lastPaidOrderId?: string
  reservation?: TableReservationInfo
}

export type FloorPlanDto = {
  asOf: string
  areas: AreaDto[]
  tables: TableCardDto[]
  counts: Record<TableStatus, number>
  totalTables: number
}

export type TableServiceDto = {
  table: TableCardDto
  viewedTableId: string
  orders: OrderDto[]
}

export type OpenTableRequest = { guestCount: number; clientRequestId: string }

// ───────────────────────── Hóa đơn (§2.8) ─────────────────────────

export type OrderItemCancelDto = {
  reason: CancelReason
  reasonText: string
  note?: string
  cancelledAt: string
  cancelledByName: string
  cancelledByUsername: string
  approvedByUsername?: string
  statusAtCancel: OrderItemStatus
  acknowledged: boolean
}

export type OrderItemDto = {
  id: string
  menuItemId: string
  itemCode: string
  itemName: string
  unit: string
  pricingType: PricingType
  station: KitchenStation
  unitPrice: number
  quantity: number
  lineTotal: number
  note?: string
  quickNotes: string[]
  isRush: boolean
  status: OrderItemStatus
  batchNo?: number
  kitchenTicketId?: string
  kitchenTicketCode?: string
  prepMinutes?: number
  sentAt?: string
  startedAt?: string
  doneAt?: string
  servedAt?: string
  isLate: boolean
  isSoldOut: boolean
  cancel?: OrderItemCancelDto
}

export type PaymentDto = {
  id: string
  method: PaymentMethod
  amount: number
  cashReceived?: number
  changeAmount?: number
  cardLast4?: string
  shareNo?: number
  qrContent?: string
  paidAt: string
  cashierName?: string
}

export type OrderDiscountDto = {
  type: DiscountType
  value: number
  amount: number
  reason: string
  approvedByUsername?: string
}

export type OrderShareDto = { no: number; amount: number; paid: boolean }

export type OrderDto = {
  id: string
  code: string
  status: OrderStatus
  version: number
  tableId: string
  tableCode: string
  areaName: string
  mergedTableCodes: string[]
  mergedIntoOrderId?: string
  mergedIntoTableCode?: string
  splitFromOrderId?: string
  splitFromCode?: string
  reservationId?: string
  reservationCode?: string
  waiterId: string
  waiterName: string
  guestCount: number
  note?: string
  openedAt: string
  batchCount: number
  prebillPrintedAt?: string
  items: OrderItemDto[]
  subtotal: number
  discount?: OrderDiscountDto
  serviceChargeRate: number
  serviceCharge: number
  vatRate: number
  vatAmount: number
  grossTotal: number
  rounding: number
  total: number
  deposit: number
  depositRefund: number
  paidAmount: number
  remaining: number
  splitCount?: number
  shares?: OrderShareDto[]
  payments: PaymentDto[]
  counts: { unsent: number; pending: number; ready: number; late: number }
  isLocked: boolean
  paidAt?: string
  cashierName?: string
  cancelledAt?: string
  cancelledByUsername?: string
  cancelReason?: string
  asOf: string
}

export type OrderListItem = {
  id: string
  code: string
  status: OrderStatus
  tableCode: string
  areaName: string
  guestCount: number
  waiterName: string
  cashierName?: string
  openedAt: string
  paidAt?: string
  itemCount: number
  subtotal: number
  discountAmount: number
  total: number
  paymentMethods: PaymentMethod[]
  splitFromCode?: string
  cancelReason?: string
}

export type OrderQuery = PaginationQuery & {
  tableId?: string
  from?: string
  to?: string
  status?: OrderStatus
  paymentMethod?: PaymentMethod
}

export type AddItemRequest = {
  menuItemId: string
  quantity: number
  note?: string
  quickNotes?: string[]
  isRush?: boolean
}
export type UpdateDraftItemRequest = {
  quantity: number
  note?: string
  quickNotes?: string[]
  isRush: boolean
}
export type SendToKitchenRequest = { clientRequestId: string; version: number }
export type SendResultDto = {
  order: OrderDto
  tickets: { id: string; code: string; station: KitchenStation }[]
  directItemCount: number
  skippedSoldOutItemIds: string[]
  prebillInvalidated: boolean
}
export type CancelItemRequest = {
  quantity: number
  reason: Exclude<CancelReason, 'HetMon'>
  note?: string
  approvalToken?: string
  version: number
}

// ───────────────────────── Chuyển, gộp, chuyển món (§2.9) ─────────────────────────

export type TransferRequest = { targetTableId: string; version: number }
export type MergeRequest = { sourceTableIds: string[]; version: number }
export type MoveItemsRequest = {
  targetTableId: string
  items: { itemId: string; quantity: number }[]
  version: number
}
export type MoveItemsResultDto = { source: OrderDto; target: OrderDto }

// ───────────────────────── Bếp (§2.10–2.11) ─────────────────────────

export type KitchenTicketItemDto = {
  id: string
  menuItemId: string
  itemName: string
  quantity: number
  unit: string
  pricingType: PricingType
  note?: string
  quickNotes: string[]
  isRush: boolean
  status: OrderItemStatus
  prepMinutes: number
  startedAt?: string
  doneAt?: string
  cancel?: { reasonText: string; acknowledged: boolean }
  movedToTableCode?: string
}

export type KitchenTicketDto = {
  id: string
  code: string
  station: Exclude<KitchenStation, 'KhongQuaBep'>
  batchNo: number
  orderId: string
  orderCode: string
  tableCode: string
  fromTableCode?: string
  waiterName: string
  sentAt: string
  status: KitchenTicketStatus
  isRush: boolean
  hasUnacknowledgedCancel: boolean
  completedAt?: string
  items: KitchenTicketItemDto[]
}

export type KitchenBoardDto = { asOf: string; tickets: KitchenTicketDto[] }
export type KitchenView = 'DangCho' | 'DaXong'

export type KitchenSummaryLine = {
  ticketId: string
  ticketCode: string
  tableCode: string
  itemId: string
  quantity: number
  status: OrderItemStatus
  sentAt: string
  isRush: boolean
}
export type KitchenSummaryItem = {
  menuItemId: string
  itemName: string
  unit: string
  station: KitchenStation
  totalQuantity: number
  lines: KitchenSummaryLine[]
}

export type ReadyGroupDto = {
  tableId: string
  tableCode: string
  orderId: string
  orderCode: string
  waiterId: string
  waiterName: string
  items: {
    itemId: string
    itemName: string
    quantity: number
    unit: string
    note?: string
    doneAt: string
  }[]
}

// ───────────────────────── Quản lý xác nhận (§2.12) ─────────────────────────

export type ApprovalRequest = { username: string; password: string; action: ApprovalAction }
export type ApprovalDto = {
  token: string
  approvedById: string
  approvedByUsername: string
  expiresAt: string
}

// ───────────────────────── Tạm tính, giảm giá, tách (§2.13) ─────────────────────────

export type VersionRequest = { version: number }
export type DiscountRequest = {
  type: DiscountType
  value: number
  reason: string
  approvalToken?: string
  version: number
}
export type SplitOrderRequest = {
  parts: { items: { itemId: string; quantity: number }[] }[]
  version: number
}
export type SplitEqualRequest = { count: number; version: number }

// ───────────────────────── Thu tiền (§2.14) ─────────────────────────

export type CreatePaymentRequest = {
  clientRequestId: string
  version: number
  method: Exclude<PaymentMethod, 'TienCoc'>
  amount?: number
  cashReceived?: number
  allowPartial?: boolean
  cardLast4?: string
  shareNo?: number
  qrContent?: string
}
export type PaymentResultDto = {
  order: OrderDto
  payment: PaymentDto
  changeAmount: number
  completed: boolean
}

// ───────────────────────── Đặt bàn (§2.15) ─────────────────────────

export type ReservationDto = {
  id: string
  code: string
  customerName: string
  phone: string
  arrivalAt: string
  holdUntil: string
  guestCount: number
  tableId: string
  tableCode: string
  areaName: string
  note?: string
  deposit: number
  status: ReservationStatus
  isLate: boolean
  orderId?: string
  orderCode?: string
  checkedInAt?: string
  cancelledAt?: string
  cancelledByName?: string
  cancelReason?: string
  createdAt: string
}

export type SaveReservationRequest = {
  customerName: string
  phone: string
  arrivalAt: string
  guestCount: number
  tableId: string
  note?: string
  deposit: number
}

export type ReservationQuery = PaginationQuery & {
  from?: string
  to?: string
  status?: ReservationStatus
  tableId?: string
}

export type AvailableTablesQuery = { arrivalAt: string; guestCount: number; excludeId?: string }
export type CheckInRequest = { clientRequestId: string; guestCount?: number }

// ───────────────────────── Báo cáo (§2.16) ─────────────────────────

export type DateRangeQuery = { from?: string; to?: string }

export type DashboardReport = {
  date: string
  asOf: string
  servingTables: number
  totalTables: number
  guestsSeated: number
  revenue: number
  paidOrderCount: number
  paidGuestCount: number
  revenuePerGuest: number
  pendingItems: number
  lateItems: number
  avgPrepMinutes?: number
  longestTables: {
    tableId: string
    tableCode: string
    areaName: string
    orderId: string
    openedAt: string
    minutesSeated: number
    guestCount: number
    subtotal: number
  }[]
}

export type RevenueTotals = {
  revenue: number
  orderCount: number
  guestCount: number
  revenuePerGuest: number
  discount: number
  serviceCharge: number
  vatAmount: number
  total: number
}
export type RevenueReport = {
  from: string
  to: string
  totals: RevenueTotals
  previous: RevenueTotals & { from: string; to: string }
  revenueChangePercent?: number
  daily: (RevenueTotals & { date: string; previousRevenue: number })[]
}

export type TopItemsQuery = DateRangeQuery & {
  categoryId?: string
  sortBy?: 'quantity' | 'revenue'
  limit?: number
}
export type TopItemsReport = {
  totalRevenue: number
  items: {
    menuItemId: string
    code: string
    name: string
    categoryId: string
    categoryName: string
    unit: string
    quantity: number
    revenue: number
    share: number
  }[]
}

export type VoidedItemsQuery = DateRangeQuery & {
  reason?: CancelReason
  userId?: string
  page?: number
  pageSize?: number
}
export type VoidedItemRow = {
  itemId: string
  orderId: string
  orderCode: string
  tableCode: string
  cancelledAt: string
  itemName: string
  quantity: number
  unit: string
  value: number
  reason: CancelReason
  reasonText: string
  note?: string
  cancelledByName: string
  cancelledByUsername: string
  approvedByUsername?: string
  statusAtCancel: OrderItemStatus
}
export type VoidedItemsReport = {
  totalCount: number
  totalValue: number
  byReason: { reason: CancelReason; reasonText: string; count: number; value: number }[]
  page: PaginatedResult<VoidedItemRow>
}

export type KitchenReportQuery = DateRangeQuery & { station?: KitchenStation }
export type KitchenReport = {
  totals: { itemCount: number; avgMinutes: number; lateCount: number; lateRate: number }
  byStation: {
    station: KitchenStation
    itemCount: number
    avgMinutes: number
    lateCount: number
    lateRate: number
  }[]
  byItem: {
    menuItemId: string
    code: string
    name: string
    station: KitchenStation
    prepMinutes: number
    itemCount: number
    avgMinutes: number
    lateRate: number
  }[]
  byHour: { hour: number; itemCount: number; lateCount: number; lateRate: number }[]
}

export type TableReportQuery = DateRangeQuery & { areaId?: string }
export type TableReport = {
  days: number
  byArea: {
    areaId: string
    areaName: string
    tableCount: number
    revenue: number
    sessions: number
    turnover: number
    avgSeatMinutes: number
  }[]
  byTable: {
    tableId: string
    tableCode: string
    areaName: string
    capacity: number
    revenue: number
    sessions: number
    turnover: number
    avgSeatMinutes: number
  }[]
}

// ───────────────────────── Thông tin nhà hàng (§2.17) ─────────────────────────

export type StoreProfile = {
  name: string
  address: string
  phone: string
  taxCode: string
  receiptFooter: string
  bankBin: string
  bankAccount: string
  bankAccountName: string
  openTime: string
  closeTime: string
  serviceChargeRate: number
  vatRate: number
  cashierDiscountLimit: number
}

// ───────────────────────── Thời gian thực (§2.18) ─────────────────────────

export type PosEventMap = {
  'tables-changed': { tableIds: string[] }
  'order-changed': { orderId: string; tableId: string; version: number }
  'kitchen-changed': { ticketIds: string[]; stations: KitchenStation[]; newTicketIds: string[] }
  'items-ready': { tableId: string; tableCode: string; orderId: string; waiterId: string; count: number }
  'item-out-of-stock': { tableCode: string; itemName: string; waiterId: string; message: string }
  'item-cancelled': { tableCode: string; itemName: string; waiterId: string }
  'menu-changed': { menuItemIds: string[] }
  'reservations-changed': { reservationIds: string[] }
}
export type PosEventName = keyof PosEventMap

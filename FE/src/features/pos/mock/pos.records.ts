import type {
  CancelReason,
  DiscountType,
  KitchenStation,
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PricingType,
  ReservationStatus,
  TableShape,
} from '../types/pos.types'

/**
 * Bản ghi lưu trong kho mock (tương ứng bảng Pos_* ở 06 §4). DTO trả ra giao diện dựng từ đây
 * trong `pos.mappers.ts` (trường suy ra như tiền, đếm món, trạng thái "Đã đặt" tính lúc đọc).
 */

export type AreaRecord = {
  id: string
  code: string
  name: string
  sortOrder: number
  isHidden: boolean
  isDeleted?: boolean
  createdAt: string
  updatedAt: string
}

/** Trạng thái lưu của bàn; `DaDat` không lưu (suy ra theo đặt bàn, 07 §3.9) */
export type StoredTableStatus = 'Trong' | 'DangPhucVu' | 'ChoThanhToan' | 'ChoDon' | 'DaGop'

export type TableRecord = {
  id: string
  code: string
  areaId: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  isHidden: boolean
  isDeleted?: boolean
  status: StoredTableStatus
  mergedIntoTableId?: string
  statusChangedAt?: string
  version: number
  createdAt: string
}

export type CategoryRecord = {
  id: string
  code: string
  name: string
  color: string
  sortOrder: number
  isHidden: boolean
  isDeleted?: boolean
  createdAt: string
}

export type MenuItemRecord = {
  id: string
  code: string
  name: string
  categoryId: string
  imageUrl?: string
  description?: string
  unit: string
  pricingType: PricingType
  price: number
  station: KitchenStation
  prepMinutes?: number
  isSoldOut: boolean
  isHidden: boolean
  isDeleted?: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type QuickNoteRecord = { id: string; content: string; sortOrder: number }

export type ItemCancelRecord = {
  reason: CancelReason
  note?: string
  cancelledAt: string
  cancelledById?: string
  cancelledByName: string
  cancelledByUsername: string
  approvedById?: string
  approvedByUsername?: string
  statusAtCancel: OrderItemStatus
  acknowledgedAt?: string
}

export type OrderItemRecord = {
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
  prepMinutes?: number
  sendRequestId?: string
  sentAt?: string
  startedAt?: string
  doneAt?: string
  servedAt?: string
  sortOrder: number
  cancel?: ItemCancelRecord
}

export type PaymentRecord = {
  id: string
  method: PaymentMethod
  amount: number
  cashReceived?: number
  changeAmount?: number
  cardLast4?: string
  shareNo?: number
  qrContent?: string
  paidAt: string
  cashierId?: string
  cashierName?: string
  clientRequestId?: string
}

export type OrderDiscountRecord = {
  type: DiscountType
  value: number
  reason: string
  approvedById?: string
  approvedByUsername?: string
}

export type OrderRecord = {
  id: string
  code: string
  status: OrderStatus
  version: number
  clientRequestId?: string
  tableId: string
  guestCount: number
  note?: string
  waiterId: string
  waiterName: string
  openedAt: string
  batchCount: number
  prebillPrintedAt?: string
  items: OrderItemRecord[]
  payments: PaymentRecord[]
  discount?: OrderDiscountRecord
  /** Chốt ở lượt thu đầu tiên không phải tiền cọc (07 §3.4); chưa chốt thì lấy cài đặt hiện tại */
  serviceChargeRate?: number
  vatRate?: number
  deposit: number
  depositRefund: number
  splitCount?: number
  reservationId?: string
  splitFromOrderId?: string
  mergedIntoOrderId?: string
  mergedAt?: string
  paidAt?: string
  cashierId?: string
  cashierName?: string
  cancelledAt?: string
  cancelledById?: string
  cancelledByUsername?: string
  cancelReason?: string
  createdAt: string
}

export type TicketRecord = {
  id: string
  code: string
  /** Ngày giờ Việt Nam của sentAt (yyyy-MM-dd) */
  businessDate: string
  ticketNo: number
  /** Hóa đơn lúc gửi (không đổi khi gộp) */
  orderId: string
  station: Exclude<KitchenStation, 'KhongQuaBep'>
  batchNo: number
  tableId: string
  tableCode: string
  originalTableCode: string
  waiterId: string
  waiterName: string
  sentAt: string
  status: KitchenTicketStatus
  completedAt?: string
}

export type ReservationRecord = {
  id: string
  code: string
  customerName: string
  phone: string
  arrivalAt: string
  guestCount: number
  tableId: string
  note?: string
  deposit: number
  status: ReservationStatus
  orderId?: string
  checkedInAt?: string
  cancelledAt?: string
  cancelledById?: string
  cancelledByName?: string
  cancelReason?: string
  clientRequestId?: string
  createdAt: string
}

/** Mốc nạp dữ liệu mẫu: mọi giờ tương đối tính theo `seededAt` (06 §5.3) */
export type MetaRecord = { id: string; seededAt: string }

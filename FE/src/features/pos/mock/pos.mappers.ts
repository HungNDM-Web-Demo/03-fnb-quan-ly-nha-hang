import { mockDb } from '@/mock/mock-db'
import { cancelReasonText } from '../lib/labels'
import { PosRules } from '../lib/pos-rules'
import { priceOrder, splitEqualShares } from '../lib/pricing'
import { vnDateKey } from '../lib/vn-time'
import type {
  AreaDto,
  CategoryDto,
  DiningTableDto,
  KitchenTicketDto,
  MenuItemDto,
  OrderDto,
  OrderItemDto,
  OrderListItem,
  PaymentDto,
  PaymentMethod,
  ReservationDto,
  TableCardDto,
  TableReservationInfo,
  TableStatus,
} from '../types/pos.types'
import {
  areasDb,
  billingSettings,
  categoriesDb,
  everOrderedMenuIds,
  everUsedTableIds,
  findOrder,
  menuItemsDb,
  ordersDb,
  reservationsDb,
  tablesDb,
  ticketsDb,
  type BillingSettings,
} from './pos.db'
import type {
  AreaRecord,
  CategoryRecord,
  MenuItemRecord,
  OrderItemRecord,
  OrderRecord,
  ReservationRecord,
  TableRecord,
  TicketRecord,
} from './pos.records'

/**
 * Dựng DTO (07 §2) từ bản ghi mock. Trường suy ra tính lúc đọc giống BE:
 * tiền (§3), trạng thái "Đã đặt" (§3.9), món trễ (§3.8), khóa hóa đơn (BR-22).
 */

const MIN = 60_000
export const isOpenStatus = (o: Pick<OrderRecord, 'status'>) => o.status === 'DangMo' || o.status === 'DangThu'

/** Ngữ cảnh đọc dùng chung trong một lần gọi handler (tránh đọc kho nhiều lần) */
export type ReadContext = {
  now: number
  settings: BillingSettings
  tables: Map<string, TableRecord>
  areas: Map<string, AreaRecord>
  menu: Map<string, MenuItemRecord>
  tickets: Map<string, TicketRecord>
  liveOrders: OrderRecord[]
  reservations: ReservationRecord[]
}

export function readContext(): ReadContext {
  return {
    now: Date.now(),
    settings: billingSettings(),
    tables: new Map(tablesDb.all().map((t) => [t.id, t])),
    areas: new Map(areasDb.all().map((a) => [a.id, a])),
    menu: new Map(menuItemsDb.all().map((m) => [m.id, m])),
    tickets: new Map(ticketsDb.all().map((t) => [t.id, t])),
    liveOrders: ordersDb.all(),
    reservations: reservationsDb.all(),
  }
}

// ───────────────────────── Thực đơn ─────────────────────────

export function toCategoryDto(c: CategoryRecord, items: MenuItemRecord[]): CategoryDto {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    color: c.color,
    sortOrder: c.sortOrder,
    isHidden: c.isHidden,
    itemCount: items.filter((i) => i.categoryId === c.id && !i.isDeleted).length,
  }
}

export function toMenuItemDto(
  m: MenuItemRecord,
  categories: Map<string, CategoryRecord>,
  everOrdered: Set<string>
): MenuItemDto {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    categoryId: m.categoryId,
    categoryName: categories.get(m.categoryId)?.name ?? '',
    imageUrl: m.imageUrl,
    description: m.description,
    unit: m.unit,
    pricingType: m.pricingType,
    price: m.price,
    station: m.station,
    prepMinutes: m.prepMinutes,
    isSoldOut: m.isSoldOut,
    isHidden: m.isHidden,
    status: m.isHidden ? 'An' : m.isSoldOut ? 'TamHet' : 'DangBan',
    sortOrder: m.sortOrder,
    everOrdered: everOrdered.has(m.id),
    updatedAt: m.updatedAt,
  }
}

export function menuDtoContext() {
  return {
    categories: new Map(categoriesDb.all().map((c) => [c.id, c])),
    everOrdered: everOrderedMenuIds(),
  }
}

// ───────────────────────── Khu vực, bàn ─────────────────────────

export function toAreaDto(a: AreaRecord, tables: TableRecord[]): AreaDto {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    sortOrder: a.sortOrder,
    isHidden: a.isHidden,
    tableCount: tables.filter((t) => t.areaId === a.id && !t.isDeleted).length,
  }
}

export function toDiningTableDto(t: TableRecord, areas: Map<string, AreaRecord>, used = everUsedTableIds()): DiningTableDto {
  const area = areas.get(t.areaId)
  return {
    id: t.id,
    code: t.code,
    areaId: t.areaId,
    areaCode: area?.code ?? '',
    areaName: area?.name ?? '',
    capacity: t.capacity,
    shape: t.shape,
    x: t.x,
    y: t.y,
    isHidden: t.isHidden,
    everUsed: used.has(t.id),
  }
}

/** Đặt bàn `ChoDen` quá giờ đến 30 phút → `KhongDen` (đổi lười khi đọc, 06 §4) */
export function applyNoShows(now = Date.now()): string[] {
  const changed = reservationsDb.filter(
    (r) => r.status === 'ChoDen' && now > new Date(r.arrivalAt).getTime() + PosRules.noShowAfterMinutes * MIN
  )
  if (!changed.length) return []
  mockDb.batch(() => {
    for (const r of changed) reservationsDb.update(r.id, { status: 'KhongDen' })
  })
  return changed.map((r) => r.id)
}

/** §3.9: đặt bàn `ChoDen` gần nhất hôm nay của bàn, còn hiệu lực (giờ đến + 30 phút ≥ now) */
export function tableReservation(tableId: string, ctx: ReadContext): ReservationRecord | undefined {
  const today = vnDateKey(ctx.now)
  return ctx.reservations
    .filter(
      (r) =>
        r.tableId === tableId &&
        r.status === 'ChoDen' &&
        vnDateKey(r.arrivalAt) === today &&
        new Date(r.arrivalAt).getTime() + PosRules.noShowAfterMinutes * MIN >= ctx.now
    )
    .sort((a, b) => (a.arrivalAt < b.arrivalAt ? -1 : 1))[0]
}

export function isReservedWindow(r: ReservationRecord, now: number): boolean {
  const arrival = new Date(r.arrivalAt).getTime()
  return arrival - PosRules.reservedBeforeMinutes * MIN <= now && now <= arrival + PosRules.noShowAfterMinutes * MIN
}

/** Trạng thái bàn trả về API: `Trong` + đặt bàn trong cửa sổ → `DaDat` */
export function tableStatusOf(t: TableRecord, ctx: ReadContext): TableStatus {
  if (t.status !== 'Trong') return t.status
  const r = tableReservation(t.id, ctx)
  return r && isReservedWindow(r, ctx.now) ? 'DaDat' : 'Trong'
}

export function openOrdersOfTable(tableId: string, ctx: ReadContext): OrderRecord[] {
  return ctx.liveOrders
    .filter((o) => o.tableId === tableId && isOpenStatus(o))
    .sort((a, b) => (a.code < b.code ? -1 : 1))
}

export function toTableCard(t: TableRecord, ctx: ReadContext): TableCardDto {
  const area = ctx.areas.get(t.areaId)
  const status = tableStatusOf(t, ctx)
  const orders = t.status === 'DaGop' ? [] : openOrdersOfTable(t.id, ctx)
  const dtos = orders.map((o) => toOrderDto(o, ctx))
  const first = [...orders].sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))[0]
  const mainTable = t.mergedIntoTableId ? ctx.tables.get(t.mergedIntoTableId) : undefined
  const r = tableReservation(t.id, ctx)
  let lastPaidOrderId: string | undefined
  if (t.status === 'ChoDon') {
    const target = mainTable && t.mergedIntoTableId ? t.mergedIntoTableId : t.id
    lastPaidOrderId = ctx.liveOrders
      .filter((o) => o.tableId === target && o.status === 'DaThanhToan' && o.paidAt)
      .sort((a, b) => (a.paidAt! < b.paidAt! ? 1 : -1))[0]?.id
  }
  const reservation: TableReservationInfo | undefined = r && {
    id: r.id,
    code: r.code,
    customerName: r.customerName,
    arrivalAt: r.arrivalAt,
    guestCount: r.guestCount,
    deposit: r.deposit,
    note: r.note,
    isLate: ctx.now > new Date(r.arrivalAt).getTime() + PosRules.lateAfterMinutes * MIN,
  }
  return {
    id: t.id,
    code: t.code,
    areaId: t.areaId,
    areaCode: area?.code ?? '',
    capacity: t.capacity,
    shape: t.shape,
    x: t.x,
    y: t.y,
    status,
    orderIds: orders.map((o) => o.id),
    guestCount: orders.length ? orders.reduce((s, o) => s + o.guestCount, 0) : undefined,
    openedAt: first?.openedAt,
    waiterId: first?.waiterId,
    waiterName: first?.waiterName,
    subtotal: orders.length ? dtos.reduce((s, o) => s + o.subtotal, 0) : undefined,
    readyCount: dtos.reduce((s, o) => s + o.counts.ready, 0),
    hasLateItems: dtos.some((o) => o.counts.late > 0),
    unsentCount: dtos.reduce((s, o) => s + o.counts.unsent, 0),
    isLocked: dtos.some((o) => o.isLocked),
    mergedIntoTableId: t.status === 'DaGop' ? t.mergedIntoTableId : undefined,
    mergedIntoTableCode: t.status === 'DaGop' ? mainTable?.code : undefined,
    mergedTableCodes: [...ctx.tables.values()]
      .filter((x) => x.mergedIntoTableId === t.id && x.status === 'DaGop' && !x.isDeleted)
      .map((x) => x.code)
      .sort(),
    lastPaidOrderId,
    reservation,
  }
}

// ───────────────────────── Hóa đơn ─────────────────────────

export function isItemLate(item: OrderItemRecord, now: number): boolean {
  if (item.status !== 'ChoLam' && item.status !== 'DangLam') return false
  if (!item.sentAt || !item.prepMinutes) return false
  return (now - new Date(item.sentAt).getTime()) / MIN >= item.prepMinutes
}

export function toOrderItemDto(item: OrderItemRecord, ctx: ReadContext): OrderItemDto {
  const ticket = item.kitchenTicketId ? ctx.tickets.get(item.kitchenTicketId) : undefined
  const menu = ctx.menu.get(item.menuItemId)
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    itemCode: item.itemCode,
    itemName: item.itemName,
    unit: item.unit,
    pricingType: item.pricingType,
    station: item.station,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
    note: item.note,
    quickNotes: item.quickNotes,
    isRush: item.isRush,
    status: item.status,
    batchNo: item.batchNo,
    kitchenTicketId: item.kitchenTicketId,
    kitchenTicketCode: ticket?.code,
    prepMinutes: item.prepMinutes,
    sentAt: item.sentAt,
    startedAt: item.startedAt,
    doneAt: item.doneAt,
    servedAt: item.servedAt,
    isLate: isItemLate(item, ctx.now),
    isSoldOut: item.status === 'ChuaGui' && !!menu && (menu.isSoldOut || menu.isHidden || !!menu.isDeleted),
    cancel: item.cancel && {
      reason: item.cancel.reason,
      reasonText: cancelReasonText(item.cancel.reason, item.cancel.note),
      note: item.cancel.note,
      cancelledAt: item.cancel.cancelledAt,
      cancelledByName: item.cancel.cancelledByName,
      cancelledByUsername: item.cancel.cancelledByUsername,
      approvedByUsername: item.cancel.approvedByUsername,
      statusAtCancel: item.cancel.statusAtCancel,
      acknowledged: !!item.cancel.acknowledgedAt,
    },
  }
}

/** Tỉ lệ đang áp: đã chốt thì dùng số chốt, chưa thì cài đặt hiện tại (07 §3.4) */
export function ratesOf(order: OrderRecord, settings: BillingSettings) {
  // Hóa đơn đang mở (kể cả đang thu tiền) luôn tính theo cài đặt hiện tại; chốt khi thu đủ (BE)
  if (isOpenStatus(order)) return { serviceChargeRate: settings.serviceChargeRate, vatRate: settings.vatRate }
  return {
    serviceChargeRate: order.serviceChargeRate ?? settings.serviceChargeRate,
    vatRate: order.vatRate ?? settings.vatRate,
  }
}

export const isLockedOrder = (order: OrderRecord) => order.payments.some((p) => p.method !== 'TienCoc')

/** Tiền của hóa đơn (§3.2–3.5) */
export function moneyOf(order: OrderRecord, settings: BillingSettings) {
  const rates = ratesOf(order, settings)
  const totals =
    order.status === 'DaGop'
      ? { subtotal: 0, discountAmount: 0, serviceCharge: 0, vatAmount: 0, grossTotal: 0, rounding: 0, total: 0 }
      : priceOrder({ lines: order.items, discount: order.discount, ...rates })
  const paidAmount = order.payments.reduce((s, p) => s + p.amount, 0)
  const remaining = isOpenStatus(order) ? Math.max(0, totals.total - paidAmount) : 0
  const depositRefund = isOpenStatus(order) ? Math.max(0, order.deposit - totals.total) : order.depositRefund
  const shares = order.splitCount
    ? splitEqualShares(totals.total, order.deposit, order.splitCount).map((amount, i) => ({
        no: i + 1,
        amount,
        paid: order.payments.some((p) => p.shareNo === i + 1),
      }))
    : undefined
  return { ...rates, ...totals, paidAmount, remaining, depositRefund, shares }
}

export function toPaymentDto(p: OrderRecord['payments'][number]): PaymentDto {
  return {
    id: p.id,
    method: p.method,
    amount: p.amount,
    cashReceived: p.cashReceived,
    changeAmount: p.changeAmount,
    cardLast4: p.cardLast4,
    shareNo: p.shareNo,
    qrContent: p.qrContent,
    paidAt: p.paidAt,
    cashierName: p.cashierName,
  }
}

export function toOrderDto(order: OrderRecord, ctx: ReadContext): OrderDto {
  const table = ctx.tables.get(order.tableId)
  const area = table ? ctx.areas.get(table.areaId) : undefined
  const items = [...order.items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => toOrderItemDto(i, ctx))
  const money = moneyOf(order, ctx.settings)
  const main = order.mergedIntoOrderId ? findOrder(order.mergedIntoOrderId)?.order : undefined
  const splitFrom = order.splitFromOrderId ? findOrder(order.splitFromOrderId)?.order : undefined
  const reservation = order.reservationId ? ctx.reservations.find((r) => r.id === order.reservationId) : undefined
  const mergedTableCodes = ctx.liveOrders
    .filter((o) => o.mergedIntoOrderId === order.id)
    .map((o) => ctx.tables.get(o.tableId)?.code ?? '')
    .filter(Boolean)
    .sort()
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    version: order.version,
    tableId: order.tableId,
    tableCode: table?.code ?? '',
    areaName: area?.name ?? '',
    mergedTableCodes,
    mergedIntoOrderId: order.mergedIntoOrderId,
    mergedIntoTableCode: main ? ctx.tables.get(main.tableId)?.code : undefined,
    splitFromOrderId: order.splitFromOrderId,
    splitFromCode: splitFrom?.code,
    reservationId: order.reservationId,
    reservationCode: reservation?.code,
    waiterId: order.waiterId,
    waiterName: order.waiterName,
    guestCount: order.guestCount,
    note: order.note,
    openedAt: order.openedAt,
    batchCount: order.batchCount,
    prebillPrintedAt: order.prebillPrintedAt,
    items,
    subtotal: money.subtotal,
    discount: order.discount && {
      type: order.discount.type,
      value: order.discount.value,
      amount: money.discountAmount,
      reason: order.discount.reason,
      approvedByUsername: order.discount.approvedByUsername,
    },
    serviceChargeRate: money.serviceChargeRate,
    serviceCharge: money.serviceCharge,
    vatRate: money.vatRate,
    vatAmount: money.vatAmount,
    grossTotal: money.grossTotal,
    rounding: money.rounding,
    total: money.total,
    deposit: order.deposit,
    depositRefund: money.depositRefund,
    paidAmount: money.paidAmount,
    remaining: money.remaining,
    splitCount: order.splitCount,
    shares: money.shares,
    payments: [...order.payments].sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : 0)).map(toPaymentDto),
    counts: {
      unsent: items.filter((i) => i.status === 'ChuaGui').length,
      pending: items.filter((i) => i.status === 'ChoLam' || i.status === 'DangLam').length,
      ready: items.filter((i) => i.status === 'Xong').length,
      late: items.filter((i) => i.isLate).length,
    },
    isLocked: isLockedOrder(order),
    paidAt: order.paidAt,
    cashierName: order.cashierName,
    cancelledAt: order.cancelledAt,
    cancelledByUsername: order.cancelledByUsername,
    cancelReason: order.cancelReason,
    asOf: new Date(ctx.now).toISOString(),
  }
}

export function toOrderListItem(order: OrderRecord, ctx: ReadContext): OrderListItem {
  const table = ctx.tables.get(order.tableId)
  const area = table ? ctx.areas.get(table.areaId) : undefined
  const money = moneyOf(order, ctx.settings)
  const splitFrom = order.splitFromOrderId ? findOrder(order.splitFromOrderId)?.order : undefined
  const methods: PaymentMethod[] = []
  for (const p of [...order.payments].sort((a, b) => (a.paidAt < b.paidAt ? -1 : 1))) {
    if (!methods.includes(p.method)) methods.push(p.method)
  }
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    tableCode: table?.code ?? '',
    areaName: area?.name ?? '',
    guestCount: order.guestCount,
    waiterName: order.waiterName,
    cashierName: order.cashierName,
    openedAt: order.openedAt,
    paidAt: order.paidAt,
    itemCount: order.items.filter((i) => i.status !== 'DaHuy' && i.status !== 'ChuaGui').length,
    subtotal: money.subtotal,
    discountAmount: money.discountAmount,
    total: money.total,
    paymentMethods: methods,
    splitFromCode: splitFrom?.code,
    cancelReason: order.cancelReason,
  }
}

// ───────────────────────── Phiếu bếp ─────────────────────────

/** Món của phiếu: dò mọi hóa đơn hôm nay theo kitchenTicketId (món có thể đã chuyển, gộp) */
export function ticketItems(ticketId: string, ctx: ReadContext): { item: OrderItemRecord; order: OrderRecord }[] {
  const result: { item: OrderItemRecord; order: OrderRecord }[] = []
  for (const order of ctx.liveOrders) {
    for (const item of order.items) if (item.kitchenTicketId === ticketId) result.push({ item, order })
  }
  return result.sort((a, b) => a.item.sortOrder - b.item.sortOrder || (a.order.code < b.order.code ? -1 : 1))
}

export function toTicketDto(t: TicketRecord, ctx: ReadContext): KitchenTicketDto {
  const entries = ticketItems(t.id, ctx)
  const order = findOrder(t.orderId)?.order
  return {
    id: t.id,
    code: t.code,
    station: t.station,
    batchNo: t.batchNo,
    orderId: t.orderId,
    orderCode: order?.code ?? '',
    tableCode: t.tableCode,
    fromTableCode: t.originalTableCode !== t.tableCode ? t.originalTableCode : undefined,
    waiterName: t.waiterName,
    sentAt: t.sentAt,
    status: t.status,
    isRush: entries.some(({ item }) => item.isRush),
    hasUnacknowledgedCancel: entries.some(({ item }) => item.status === 'DaHuy' && !item.cancel?.acknowledgedAt),
    completedAt: t.completedAt,
    items: entries.map(({ item, order: o }) => {
      const currentTable = ctx.tables.get(o.tableId)
      return {
        id: item.id,
        menuItemId: item.menuItemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        pricingType: item.pricingType,
        note: item.note,
        quickNotes: item.quickNotes,
        isRush: item.isRush,
        status: item.status,
        prepMinutes: item.prepMinutes ?? 0,
        startedAt: item.startedAt,
        doneAt: item.doneAt,
        cancel: item.cancel && {
          reasonText: cancelReasonText(item.cancel.reason, item.cancel.note),
          acknowledged: !!item.cancel.acknowledgedAt,
        },
        movedToTableCode: o.tableId !== t.tableId ? currentTable?.code : undefined,
      }
    }),
  }
}

// ───────────────────────── Đặt bàn ─────────────────────────

export function toReservationDto(r: ReservationRecord, ctx: Pick<ReadContext, 'tables' | 'areas' | 'now'>): ReservationDto {
  const table = ctx.tables.get(r.tableId)
  const area = table ? ctx.areas.get(table.areaId) : undefined
  const arrival = new Date(r.arrivalAt).getTime()
  const order = r.orderId ? findOrder(r.orderId)?.order : undefined
  return {
    id: r.id,
    code: r.code,
    customerName: r.customerName,
    phone: r.phone,
    arrivalAt: r.arrivalAt,
    holdUntil: new Date(arrival + PosRules.holdMinutes * MIN).toISOString(),
    guestCount: r.guestCount,
    tableId: r.tableId,
    tableCode: table?.code ?? '',
    areaName: area?.name ?? '',
    note: r.note,
    deposit: r.deposit,
    status: r.status,
    isLate: r.status === 'ChoDen' && ctx.now > arrival + PosRules.lateAfterMinutes * MIN,
    orderId: r.orderId,
    orderCode: order?.code,
    checkedInAt: r.checkedInAt,
    cancelledAt: r.cancelledAt,
    cancelledByName: r.cancelledByName,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt,
  }
}

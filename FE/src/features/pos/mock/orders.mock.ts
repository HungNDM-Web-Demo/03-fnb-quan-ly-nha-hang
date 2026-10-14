import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { publishPosEvent } from '@/lib/realtime'
import { auditCreate, auditUpdate } from '@/mock/mock-audit'
import { requirePermission, type MockSessionContext } from '@/mock/mock-auth'
import { forbidden, notFound, validation } from '@/mock/mock-errors'
import { newId, paginate, search, sortItems } from '@/mock/mock-helpers'
import type { PaginatedResult } from '@/types/api'
import { PosRules } from '../lib/pos-rules'
import { discountAmountOf, discountLimitOf, isBillable, lineTotal, splitEqualShares } from '../lib/pricing'
import { buildQrContent } from '../lib/vietqr'
import { addDaysKey, diffDaysKey, vnDateKey, vnStartOfDay } from '../lib/vn-time'
import type {
  AddItemRequest,
  CancelItemRequest,
  CreatePaymentRequest,
  DiscountRequest,
  KitchenStation,
  MergeRequest,
  MoveItemsRequest,
  MoveItemsResultDto,
  OrderDto,
  OrderListItem,
  OrderQuery,
  PaymentResultDto,
  ReadyGroupDto,
  SendResultDto,
  SendToKitchenRequest,
  SplitEqualRequest,
  SplitOrderRequest,
  TransferRequest,
  UpdateDraftItemRequest,
  VersionRequest,
} from '../types/pos.types'
import { consumeApproval } from './approvals.mock'
import { billingSettings, findOrder, historyOrders, menuItemsDb, nextOrderCode, nextTicketNo, ordersDb } from './pos.db'
import { bizError, fieldError, money, PosErrors } from './pos.errors'
import {
  isLockedOrder,
  isOpenStatus,
  moneyOf,
  readContext,
  tableStatusOf,
  toOrderDto,
  toOrderListItem,
  toPaymentDto,
} from './pos.mappers'
import type { OrderItemRecord, OrderRecord, PaymentRecord, TicketRecord } from './pos.records'
import { PosTx } from './pos.tx'

const has = (session: MockSessionContext, code: string) => session.isSuperAdmin || session.permissions.includes(code)

function orderDto(id: string): OrderDto {
  const ctx = readContext()
  const found = findOrder(id)
  if (!found) throw notFound('Không tìm thấy hóa đơn')
  return toOrderDto(found.order, ctx)
}

/** Phát sự kiện sau khi ghi (07 §2.18) */
function notifyOrder(order: OrderRecord, tableIds: string[] = [order.tableId]) {
  publishPosEvent('order-changed', { orderId: order.id, tableId: order.tableId, version: order.version })
  publishPosEvent('tables-changed', { tableIds: [...new Set(tableIds)] })
}
function notifyKitchen(ticketIds: string[], stations: KitchenStation[], newTicketIds: string[] = []) {
  publishPosEvent('kitchen-changed', { ticketIds, stations: [...new Set(stations)], newTicketIds })
}

function validateQuantity(pricingType: OrderItemRecord['pricingType'], quantity: number) {
  if (pricingType === 'TheoTrongLuong') {
    const tenth = Math.round(quantity * 10)
    if (!(quantity >= 0.1 && quantity <= 20) || Math.abs(tenth - quantity * 10) > 1e-6) {
      throw validation({ quantity: 'Trọng lượng từ 0,1 đến 20 kg' })
    }
  } else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw validation({ quantity: 'Số lượng từ 1 đến 99' })
  }
}

const sameNotes = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
const normalizeQuickNotes = (list?: string[]) => [...new Set((list ?? []).map((x) => x.trim()).filter(Boolean))]

/** Tách dòng: dòng cũ giữ phần còn lại, dòng mới chép mọi cột với số lượng tách (06 §4) */
function splitLine(order: OrderRecord, item: OrderItemRecord, quantity: number): OrderItemRecord {
  if (quantity >= item.quantity) return item
  item.quantity = item.quantity - quantity
  item.lineTotal = lineTotal(item.pricingType, item.unitPrice, item.quantity)
  const copy: OrderItemRecord = {
    ...structuredClone(item),
    id: newId(),
    quantity,
    lineTotal: lineTotal(item.pricingType, item.unitPrice, quantity),
    sortOrder: item.sortOrder + 0.001 * (order.items.length + 1),
  }
  order.items.push(copy)
  return copy
}

const nextSort = (order: OrderRecord) => order.items.reduce((m, i) => Math.max(m, Math.floor(i.sortOrder)), -1) + 1

/** Chốt hóa đơn khi đã đủ tiền (lượt thu cuối hoặc `complete`) */
function finalizeOrder(tx: PosTx, order: OrderRecord, session: MockSessionContext) {
  const settings = billingSettings()
  order.serviceChargeRate = settings.serviceChargeRate
  order.vatRate = settings.vatRate
  const m = moneyOf(order, settings)
  // BR-25: cọc lớn hơn tổng → lượt cọc giảm về tổng, phần dư hoàn tiền mặt
  if (order.deposit > m.total) {
    const deposit = order.payments.find((p) => p.method === 'TienCoc')
    if (deposit) deposit.amount = m.total
    order.depositRefund = order.deposit - m.total
  } else {
    order.depositRefund = 0
  }
  order.status = 'DaThanhToan'
  order.paidAt = tx.nowIso
  order.cashierId = session.user.id
  order.cashierName = session.user.fullName
  // Bàn → Chờ dọn khi không còn hóa đơn đang mở; bàn phụ đã gộp cùng chờ dọn (BR-16, TC-29)
  const table = tx.table(order.tableId)
  if (tx.openOrdersOfTable(table.id).filter((o) => o.id !== order.id).length === 0) {
    tx.setTableStatus(table, 'ChoDon')
    for (const sub of tx.tables.filter((t) => t.mergedIntoTableId === table.id && t.status === 'DaGop')) {
      tx.setTableStatus(sub, 'ChoDon', table.id)
    }
  }
}

function dateRange(query: { from?: string; to?: string }) {
  const today = vnDateKey(Date.now())
  const from = query.from || today
  const to = query.to || (query.from ? query.from : today)
  if (diffDaysKey(from, to) < 0) throw validation({ to: 'Ngày kết thúc phải sau ngày bắt đầu' })
  if (diffDaysKey(from, to) + 1 > PosRules.maxReportDays) throw validation({ from: 'Khoảng ngày tối đa 366 ngày' })
  return { start: vnStartOfDay(from), end: vnStartOfDay(addDaysKey(to, 1)) }
}

export const ordersMock = {
  /** GET /api/orders (FR-33) */
  async list(query: OrderQuery): Promise<PaginatedResult<OrderListItem>> {
    await mockDelay()
    const session = requirePermission(permissions.orders.view)
    const { start, end } = dateRange(query)
    const startIso = new Date(start).toISOString()
    const endIso = new Date(end).toISOString()
    let orders = [...historyOrders(), ...ordersDb.all()].filter((o) => o.openedAt >= startIso && o.openedAt < endIso)
    if (!has(session, permissions.orders.checkout)) orders = orders.filter(isOpenStatus)
    if (query.status) orders = orders.filter((o) => o.status === query.status)
    if (query.tableId) orders = orders.filter((o) => o.tableId === query.tableId)
    if (query.paymentMethod) orders = orders.filter((o) => o.payments.some((p) => p.method === query.paymentMethod))
    orders = search(orders, query.search, ['code'])
    const ctx = readContext()
    const items = orders.map((o) => toOrderListItem(o, ctx))
    const sorted = sortItems(items, query.sortBy || 'openedAt', query.sortDir || 'desc')
    return paginate(sorted, query)
  },

  async get(id: string): Promise<OrderDto> {
    await mockDelay(100, 200)
    const session = requirePermission(permissions.orders.view)
    const found = findOrder(id)
    if (!found) throw notFound('Không tìm thấy hóa đơn')
    if (!isOpenStatus(found.order) && !has(session, permissions.orders.checkout)) throw forbidden()
    return toOrderDto(found.order, readContext())
  },

  // ───── Món nháp (§2.8) ─────
  async addItem(id: string, input: AddItemRequest): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkUnlocked(order)
    const menu = menuItemsDb.get(input.menuItemId)
    if (!menu || menu.isDeleted || menu.isHidden) throw validation({ menuItemId: 'Món không còn trong thực đơn' })
    if (menu.isSoldOut) throw bizError(`${menu.name} đang tạm hết`, 'MonTamHet')
    validateQuantity(menu.pricingType, input.quantity)
    const note = input.note?.trim() || undefined
    if (note && note.length > 200) throw validation({ note: 'Ghi chú tối đa 200 ký tự' })
    const quickNotes = normalizeQuickNotes(input.quickNotes)
    const isRush = !!input.isRush
    const same =
      menu.pricingType === 'TheoSuat'
        ? order.items.find(
            (i) =>
              i.status === 'ChuaGui' &&
              i.menuItemId === menu.id &&
              (i.note ?? '') === (note ?? '') &&
              sameNotes(i.quickNotes, quickNotes) &&
              i.isRush === isRush
          )
        : undefined
    if (same) {
      const quantity = same.quantity + input.quantity
      if (quantity > 99) throw validation({ quantity: 'Số lượng từ 1 đến 99' })
      same.quantity = quantity
      same.lineTotal = lineTotal(same.pricingType, same.unitPrice, quantity)
    } else {
      order.items.push({
        id: newId(),
        menuItemId: menu.id,
        itemCode: menu.code,
        itemName: menu.name,
        unit: menu.unit,
        pricingType: menu.pricingType,
        station: menu.station,
        unitPrice: menu.price,
        quantity: input.quantity,
        lineTotal: lineTotal(menu.pricingType, menu.price, input.quantity),
        note,
        quickNotes,
        isRush,
        status: 'ChuaGui',
        prepMinutes: menu.prepMinutes,
        sortOrder: nextSort(order),
      })
    }
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  async updateDraft(id: string, itemId: string, input: UpdateDraftItemRequest): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkUnlocked(order)
    const item = order.items.find((i) => i.id === itemId)
    if (!item) throw notFound('Không tìm thấy món')
    if (item.status !== 'ChuaGui') throw bizError('Chỉ sửa được món chưa gửi bếp')
    validateQuantity(item.pricingType, input.quantity)
    const note = input.note?.trim() || undefined
    if (note && note.length > 200) throw validation({ note: 'Ghi chú tối đa 200 ký tự' })
    item.quantity = input.quantity
    item.lineTotal = lineTotal(item.pricingType, item.unitPrice, input.quantity)
    item.note = note
    item.quickNotes = normalizeQuickNotes(input.quickNotes)
    item.isRush = !!input.isRush
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  /** Xóa món "Chưa gửi", không lưu (BR-13, TC-25) */
  async deleteDraft(id: string, itemId: string): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    const item = order.items.find((i) => i.id === itemId)
    if (!item) throw notFound('Không tìm thấy món')
    if (item.status !== 'ChuaGui') throw bizError('Món đã gửi bếp, dùng "Hủy món"')
    order.items = order.items.filter((i) => i.id !== itemId)
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  /** POST /api/orders/{id}/send: gửi bếp (FR-13, BR-09, BR-21) */
  async send(id: string, input: SendToKitchenRequest): Promise<SendResultDto> {
    await mockDelay(200, 400)
    const session = requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.order(id)
    // Chống bấm lặp (§3.7, TC-15): cùng mã → dựng lại kết quả cũ
    const sentBefore = input.clientRequestId ? order.items.filter((i) => i.sendRequestId === input.clientRequestId) : []
    if (sentBefore.length) {
      const ctx = readContext()
      const ticketIds = [...new Set(sentBefore.map((i) => i.kitchenTicketId).filter(Boolean) as string[])]
      return {
        order: toOrderDto(order, ctx),
        tickets: ticketIds
          .map((tid) => ctx.tickets.get(tid))
          .filter((t): t is TicketRecord => !!t)
          .map((t) => ({ id: t.id, code: t.code, station: t.station })),
        directItemCount: sentBefore.filter((i) => i.station === 'KhongQuaBep').length,
        skippedSoldOutItemIds: [],
        prebillInvalidated: false,
      }
    }
    if (!isOpenStatus(order)) throw PosErrors.orderClosed()
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    const menus = new Map(menuItemsDb.all().map((m) => [m.id, m]))
    const drafts = order.items.filter((i) => i.status === 'ChuaGui')
    const blocked = (i: OrderItemRecord) => {
      const m = menus.get(i.menuItemId)
      return !m || m.isSoldOut || m.isHidden || !!m.isDeleted
    }
    const sendable = drafts.filter((i) => !blocked(i))
    const skipped = drafts.filter(blocked)
    if (!sendable.length) throw bizError('Chưa có món mới để gửi bếp', 'KhongCoMonMoi')

    const table = tx.table(order.tableId)
    order.batchCount += 1
    const batchNo = order.batchCount
    const stations = (['BepNong', 'BepNguoi', 'QuayBar'] as const).filter((s) => sendable.some((i) => i.station === s))
    const tickets: TicketRecord[] = []
    for (const station of stations) {
      const no = nextTicketNoAfter(tx, tickets)
      const ticket: TicketRecord = {
        id: newId(),
        code: no.code,
        businessDate: no.businessDate,
        ticketNo: no.ticketNo,
        orderId: order.id,
        station,
        batchNo,
        tableId: table.id,
        tableCode: table.code,
        originalTableCode: table.code,
        waiterId: session.user.id,
        waiterName: session.user.fullName,
        sentAt: tx.nowIso,
        status: 'DangCho',
      }
      tickets.push(ticket)
      tx.addTicket(ticket)
    }
    let direct = 0
    for (const item of sendable) {
      const m = menus.get(item.menuItemId)!
      item.batchNo = batchNo
      item.sentAt = tx.nowIso
      item.sendRequestId = input.clientRequestId
      item.prepMinutes = item.station === 'KhongQuaBep' ? undefined : m.prepMinutes
      if (item.station === 'KhongQuaBep') {
        item.status = 'Xong'
        item.doneAt = tx.nowIso
        direct++
      } else {
        item.status = 'ChoLam'
        item.kitchenTicketId = tickets.find((t) => t.station === item.station)!.id
      }
    }
    const prebillInvalidated = !!order.prebillPrintedAt
    order.prebillPrintedAt = undefined
    if (table.status === 'ChoThanhToan') tx.setTableStatus(table, 'DangPhucVu')
    tx.touchOrder(order)
    tx.commit()

    notifyKitchen(tickets.map((t) => t.id), tickets.map((t) => t.station), tickets.map((t) => t.id))
    notifyOrder(order)
    if (direct > 0) {
      publishPosEvent('items-ready', {
        tableId: table.id,
        tableCode: table.code,
        orderId: order.id,
        waiterId: order.waiterId,
        count: direct,
      })
    }
    return {
      order: orderDto(id),
      tickets: tickets.map((t) => ({ id: t.id, code: t.code, station: t.station })),
      directItemCount: direct,
      skippedSoldOutItemIds: skipped.map((i) => i.id),
      prebillInvalidated,
    }
  },

  // ───── Ra món (§2.8, UC-07) ─────
  async serve(id: string, itemId: string): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    const item = order.items.find((i) => i.id === itemId)
    if (!item) throw notFound('Không tìm thấy món')
    if (item.status !== 'Xong') throw bizError('Món chưa xong, chưa ra được')
    item.status = 'DaPhucVu'
    item.servedAt = tx.nowIso
    tx.touchOrder(order, false)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  async serveAll(id: string): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    const ready = order.items.filter((i) => i.status === 'Xong')
    if (!ready.length) throw bizError('Không có món chờ ra')
    for (const item of ready) {
      item.status = 'DaPhucVu'
      item.servedAt = tx.nowIso
    }
    tx.touchOrder(order, false)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  async unserve(id: string, itemId: string): Promise<OrderDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    const item = order.items.find((i) => i.id === itemId)
    if (!item) throw notFound('Không tìm thấy món')
    if (item.status !== 'DaPhucVu' || !item.servedAt) throw bizError('Món chưa ra, không hoàn tác được')
    if (
      !item.servedAt ||
      tx.now - new Date(item.servedAt).getTime() > PosRules.unserveSeconds * 1000
    ) {
      throw bizError('Hết thời gian hoàn tác')
    }
    item.status = 'Xong'
    item.servedAt = undefined
    tx.touchOrder(order, false)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  /** POST /api/orders/{id}/items/{itemId}/cancel (UC-08, BR-13) */
  async cancelItem(id: string, itemId: string, input: CancelItemRequest): Promise<OrderDto> {
    await mockDelay(150, 300)
    const session = requirePermission(permissions.orderItems.cancel)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    const item = order.items.find((i) => i.id === itemId)
    if (!item) throw notFound('Không tìm thấy món')
    if (item.status === 'ChuaGui') throw bizError('Món chưa gửi bếp, xóa trực tiếp')
    if (item.status === 'DaHuy') throw bizError('Món đã hủy trước đó')
    const reasons = ['KhachDoiY', 'GoiNham', 'ChoLau', 'Khac']
    if (!input.reason || !reasons.includes(input.reason)) throw validation({ reason: 'Chọn lý do hủy' })
    const note = input.note?.trim() || undefined
    if (input.reason === 'Khac' && !note) throw validation({ note: 'Nhập ghi chú cho lý do Khác' })
    if (item.pricingType === 'TheoTrongLuong' && input.quantity !== item.quantity) {
      throw validation({ quantity: 'Món theo trọng lượng chỉ hủy nguyên dòng' })
    }
    if (item.pricingType === 'TheoSuat' && (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > item.quantity)) {
      throw validation({ quantity: `Số lượng hủy từ 1 đến ${item.quantity}` })
    }
    const statusAtCancel = item.status
    let approver: { id: string; username: string } | undefined
    if (['DangLam', 'Xong', 'DaPhucVu'].includes(statusAtCancel)) {
      if (has(session, permissions.orderItems.voidApprove)) {
        approver = { id: session.user.id, username: session.user.username }
      } else if (!input.approvalToken) {
        throw bizError('Món bếp đã làm, cần quản lý xác nhận', 'CanQuanLyDuyet')
      } else {
        const entry = consumeApproval(input.approvalToken, 'HuyMon')
        approver = { id: entry.userId, username: entry.username }
      }
    }
    const target = splitLine(order, item, input.quantity)
    target.status = 'DaHuy'
    target.cancel = {
      reason: input.reason,
      note: input.reason === 'Khac' ? note : note,
      cancelledAt: tx.nowIso,
      cancelledById: session.user.id,
      cancelledByName: session.user.fullName,
      cancelledByUsername: session.user.username,
      approvedById: approver?.id,
      approvedByUsername: approver?.username,
      statusAtCancel,
      acknowledgedAt: target.station === 'KhongQuaBep' || !target.kitchenTicketId ? tx.nowIso : undefined,
    }
    tx.touchOrder(order)
    if (target.kitchenTicketId) tx.refreshTicket(target.kitchenTicketId)
    tx.commit()
    const table = tx.table(order.tableId)
    if (target.kitchenTicketId) {
      const ticket = tx.tickets.find((t) => t.id === target.kitchenTicketId)
      notifyKitchen([target.kitchenTicketId], ticket ? [ticket.station] : [])
    }
    notifyOrder(order)
    // Chỉ khi món đang chờ ra (07 §5 #38)
    if (statusAtCancel === 'Xong') {
      publishPosEvent('item-cancelled', { tableCode: table.code, itemName: target.itemName, waiterId: order.waiterId })
    }
    auditUpdate('OrderItem', { id: item.id, status: statusAtCancel }, { id: item.id, status: 'DaHuy' })
    return orderDto(id)
  },

  /** Đóng bàn mở nhầm (UC-02 5a, BR-03, TC-10) */
  async close(id: string, input: VersionRequest): Promise<OrderDto> {
    await mockDelay()
    const session = requirePermission(permissions.tables.open)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    if (order.items.some((i) => i.status !== 'ChuaGui')) {
      throw bizError('Bàn đã gửi bếp, không đóng được', 'BanDaGuiBep')
    }
    order.items = []
    order.status = 'DaHuy'
    order.cancelReason = 'Mở nhầm'
    order.cancelledAt = tx.nowIso
    order.cancelledById = session.user.id
    order.cancelledByUsername = session.user.username
    tx.touchOrder(order)
    const table = tx.table(order.tableId)
    if (tx.openOrdersOfTable(table.id).filter((o) => o.id !== order.id).length === 0) {
      tx.setTableStatus(table, 'Trong')
    }
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  // ───── Chuyển, gộp, chuyển món (§2.9) ─────
  async transfer(id: string, input: TransferRequest): Promise<OrderDto> {
    await mockDelay(150, 300)
    requirePermission(permissions.tables.transfer)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    const source = tx.table(order.tableId)
    if (tx.openOrdersOfTable(source.id).length > 1) throw PosErrors.splitTable()
    const target = tx.table(input.targetTableId)
    const ctx = readContext()
    const targetStatus = tableStatusOf(target, ctx)
    if (target.id === source.id || (targetStatus !== 'Trong' && targetStatus !== 'DaDat')) {
      throw bizError('Chỉ chuyển sang bàn đang trống', 'BanDichKhongHopLe')
    }
    const status = source.status === 'ChoThanhToan' ? 'ChoThanhToan' : 'DangPhucVu'
    order.tableId = target.id
    tx.touchOrder(order)
    // Phiếu bếp hôm nay của bàn cũ hiện mã bàn mới (giữ bàn gốc) (BR-15, TC-26)
    const changedTickets: TicketRecord[] = []
    for (const ticket of tx.tickets.filter((t) => t.tableId === source.id && t.status === 'DangCho')) {
      ticket.tableId = target.id
      ticket.tableCode = target.code
      tx.touchTicket(ticket)
      changedTickets.push(ticket)
    }
    for (const ticket of tx.tickets.filter((t) => t.tableId === source.id && t.status === 'DaXong' && t.orderId === order.id)) {
      ticket.tableId = target.id
      ticket.tableCode = target.code
      tx.touchTicket(ticket)
      changedTickets.push(ticket)
    }
    for (const sub of tx.tables.filter((t) => t.mergedIntoTableId === source.id && t.status === 'DaGop')) {
      sub.mergedIntoTableId = target.id
      tx.touchTable(sub)
    }
    tx.setTableStatus(target, status)
    tx.setTableStatus(source, 'Trong')
    tx.commit()
    if (changedTickets.length) notifyKitchen(changedTickets.map((t) => t.id), changedTickets.map((t) => t.station))
    notifyOrder(order, [source.id, target.id])
    return orderDto(id)
  },

  async merge(id: string, input: MergeRequest): Promise<OrderDto> {
    await mockDelay(150, 300)
    requirePermission(permissions.tables.transfer)
    const tx = new PosTx()
    const main = tx.openOrder(id)
    tx.checkVersion(main, input.version)
    tx.checkUnlocked(main)
    const mainTable = tx.table(main.tableId)
    if (tx.openOrdersOfTable(mainTable.id).length > 1) throw PosErrors.splitTable()
    const ids = [...new Set(input.sourceTableIds ?? [])].filter((x) => x !== mainTable.id)
    if (!ids.length) throw validation({ sourceTableIds: 'Chọn bàn cần gộp' })
    const invalidTarget = () => bizError('Chỉ gộp bàn đang phục vụ hoặc chờ thanh toán', 'BanDichKhongHopLe')
    if (mainTable.status !== 'DangPhucVu' && mainTable.status !== 'ChoThanhToan') throw invalidTarget()
    const sources = ids.map((tableId) => {
      const table = tx.table(tableId)
      if (table.status !== 'DangPhucVu' && table.status !== 'ChoThanhToan') throw invalidTarget()
      const orders = tx.openOrdersOfTable(table.id)
      if (orders.length !== 1) throw PosErrors.splitTable()
      if (isLockedOrder(orders[0])) throw PosErrors.orderLocked()
      return { table, order: orders[0] }
    })
    const changedTickets: TicketRecord[] = []
    for (const { table, order } of sources) {
      let sort = nextSort(main)
      for (const item of [...order.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
        main.items.push({ ...item, sortOrder: sort++ })
      }
      main.guestCount += order.guestCount
      if (order.deposit > 0) {
        main.deposit += order.deposit
        main.payments.push(...order.payments.filter((p) => p.method === 'TienCoc'))
      }
      order.items = []
      order.payments = order.payments.filter((p) => p.method !== 'TienCoc')
      order.deposit = 0
      order.status = 'DaGop'
      order.mergedIntoOrderId = main.id
      order.mergedAt = tx.nowIso
      tx.touchOrder(order)
      tx.setTableStatus(table, 'DaGop', mainTable.id)
      for (const sub of tx.tables.filter((t) => t.mergedIntoTableId === table.id && t.status === 'DaGop')) {
        sub.mergedIntoTableId = mainTable.id
        tx.touchTable(sub)
      }
      // Cùng quy tắc chuyển bàn (07 §5 #46): phiếu "Đang chờ" ở bàn phụ và phiếu "Đã xong" của hóa đơn bàn phụ
      for (const ticket of tx.tickets.filter(
        (t) => t.tableId === table.id && (t.status === 'DangCho' || (t.status === 'DaXong' && t.orderId === order.id))
      )) {
        ticket.tableId = mainTable.id
        ticket.tableCode = mainTable.code
        tx.touchTicket(ticket)
        changedTickets.push(ticket)
      }
    }
    if (mainTable.status === 'ChoThanhToan') tx.setTableStatus(mainTable, 'DangPhucVu')
    main.prebillPrintedAt = undefined
    tx.touchOrder(main)
    tx.commit()
    if (changedTickets.length) notifyKitchen(changedTickets.map((t) => t.id), changedTickets.map((t) => t.station))
    notifyOrder(main, [mainTable.id, ...sources.map((s) => s.table.id)])
    return orderDto(id)
  },

  async moveItems(id: string, input: MoveItemsRequest): Promise<MoveItemsResultDto> {
    await mockDelay(150, 300)
    requirePermission(permissions.tables.transfer)
    const tx = new PosTx()
    const source = tx.openOrder(id)
    tx.checkVersion(source, input.version)
    tx.checkUnlocked(source)
    const targetTable = tx.table(input.targetTableId)
    if (
      targetTable.id === source.tableId ||
      (targetTable.status !== 'DangPhucVu' && targetTable.status !== 'ChoThanhToan')
    ) {
      throw bizError('Bàn nhận món phải đang phục vụ hoặc chờ thanh toán', 'BanDichKhongHopLe')
    }
    const target = tx.openOrdersOfTable(targetTable.id)[0]
    if (!target) throw bizError('Bàn nhận món phải đang phục vụ hoặc chờ thanh toán', 'BanDichKhongHopLe')
    tx.checkUnlocked(target)
    if (!input.items?.length) throw validation({ items: 'Chọn món cần chuyển' })
    const moves = input.items.map((m, index) => {
      const item = source.items.find((i) => i.id === m.itemId)
      if (!item) throw notFound('Không tìm thấy món')
      if (item.status === 'DaHuy') throw bizError('Món đã hủy không chuyển được')
      if (item.pricingType === 'TheoTrongLuong' && m.quantity !== item.quantity) {
        throw validation({ [`items[${index}].quantity`]: 'Món theo trọng lượng chỉ chuyển nguyên dòng' })
      }
      if (item.pricingType === 'TheoSuat' && (!Number.isInteger(m.quantity) || m.quantity < 1 || m.quantity > item.quantity)) {
        throw validation({ [`items[${index}].quantity`]: `Số lượng chuyển từ 1 đến ${item.quantity}` })
      }
      return { item, quantity: m.quantity }
    })
    let sort = nextSort(target)
    for (const { item, quantity } of moves) {
      const moved = splitLine(source, item, quantity)
      source.items = source.items.filter((i) => i.id !== moved.id)
      target.items.push({ ...moved, sortOrder: sort++ })
    }
    if (targetTable.status === 'ChoThanhToan') {
      tx.setTableStatus(targetTable, 'DangPhucVu')
      target.prebillPrintedAt = undefined
    }
    tx.touchOrder(source)
    tx.touchOrder(target)
    tx.commit()
    const ticketIds = [...new Set(moves.map((m) => m.item.kitchenTicketId).filter(Boolean) as string[])]
    if (ticketIds.length) notifyKitchen(ticketIds, moves.map((m) => m.item.station))
    notifyOrder(source, [source.tableId, targetTable.id])
    notifyOrder(target, [targetTable.id])
    return { source: orderDto(source.id), target: orderDto(target.id) }
  },

  // ───── Tạm tính, giảm giá, tách, chia đều (§2.13) ─────
  async prebill(id: string, input: VersionRequest): Promise<OrderDto> {
    await mockDelay()
    requirePermission(permissions.orders.prebill)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    const unsent = order.items.filter((i) => i.status === 'ChuaGui').length
    if (unsent) throw PosErrors.unsent(unsent)
    if (!order.items.some((i) => isBillable(i.status))) throw PosErrors.noItems()
    order.prebillPrintedAt = tx.nowIso
    tx.touchOrder(order)
    const table = tx.table(order.tableId)
    if (table.status === 'DangPhucVu') tx.setTableStatus(table, 'ChoThanhToan')
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  async setDiscount(id: string, input: DiscountRequest): Promise<OrderDto> {
    await mockDelay()
    const session = requirePermission(permissions.orders.discount)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    if (input.type === 'PhanTram') {
      if (!Number.isInteger(input.value) || input.value < 1 || input.value > 100) {
        throw validation({ value: 'Phần trăm từ 1 đến 100' })
      }
    } else if (input.type === 'SoTien') {
      if (!(input.value > 0) || input.value % 1000 !== 0) throw validation({ value: 'Số tiền là bội số 1.000 ₫' })
    } else {
      throw validation({ type: 'Chọn cách giảm giá' })
    }
    const reason = input.reason?.trim()
    if (!reason) throw validation({ reason: 'Chọn lý do giảm giá' })
    if (reason.length > 200) throw validation({ reason: 'Lý do tối đa 200 ký tự' })
    const settings = billingSettings()
    const m = moneyOf(order, settings)
    const amount = discountAmountOf(m.subtotal, input.type, input.value)
    const limit = discountLimitOf(m.subtotal, settings.cashierDiscountLimit)
    let approver: { id: string; username: string } | undefined
    if (amount > limit) {
      if (has(session, permissions.orders.discountOverride)) {
        approver = { id: session.user.id, username: session.user.username }
      } else if (!input.approvalToken) {
        throw bizError(`Giảm giá vượt hạn mức ${settings.cashierDiscountLimit}%, cần quản lý xác nhận`, 'VuotHanMucGiamGia', {
          discountLimit: limit,
          requestedDiscount: amount,
        })
      } else {
        const entry = consumeApproval(input.approvalToken, 'GiamGia')
        approver = { id: entry.userId, username: entry.username }
      }
    }
    order.discount = {
      type: input.type,
      value: input.value,
      reason,
      approvedById: approver?.id,
      approvedByUsername: approver?.username,
    }
    tx.touchOrder(order)
    tx.commit()
    auditUpdate('Order', { id: order.id, discount: null }, { id: order.id, discount: `${input.value}${input.type === 'PhanTram' ? '%' : ' ₫'} – ${reason}` })
    notifyOrder(order)
    return orderDto(id)
  },

  async removeDiscount(id: string, version: number): Promise<OrderDto> {
    await mockDelay()
    requirePermission(permissions.orders.discount)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, version)
    tx.checkUnlocked(order)
    order.discount = undefined
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  /** Tách theo món (FR-25, BR-18) */
  async split(id: string, input: SplitOrderRequest): Promise<OrderDto[]> {
    await mockDelay(200, 350)
    requirePermission(permissions.orders.split)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    if (order.splitCount) throw bizError('Hóa đơn đang chia đều, hủy chia đều trước khi tách', 'DangChiaDeu')
    const unsent = order.items.filter((i) => i.status === 'ChuaGui').length
    if (unsent) throw PosErrors.unsent(unsent)
    const parts = (input.parts ?? []).filter((p) => p.items?.some((x) => x.quantity > 0))
    if (!parts.length) throw validation({ parts: 'Chọn món cần tách sang hóa đơn mới' })
    const taken = new Map<string, number>()
    parts.forEach((part, pi) =>
      part.items.forEach((entry, ii) => {
        if (!(entry.quantity > 0)) return
        const item = order.items.find((i) => i.id === entry.itemId)
        if (!item || item.status === 'ChuaGui' || item.status === 'DaHuy') {
          throw validation({ [`parts[${pi}].items[${ii}].itemId`]: 'Chỉ tách món đã gửi bếp, chưa hủy' })
        }
        if (item.pricingType === 'TheoTrongLuong' && entry.quantity !== item.quantity) {
          throw validation({ [`parts[${pi}].items[${ii}].quantity`]: 'Món theo trọng lượng chỉ tách nguyên dòng' })
        }
        const total = (taken.get(item.id) ?? 0) + entry.quantity
        if (item.pricingType === 'TheoSuat' && (!Number.isInteger(entry.quantity) || total > item.quantity)) {
          throw validation({ [`parts[${pi}].items[${ii}].quantity`]: `Số lượng tách từ 1 đến ${item.quantity}` })
        }
        taken.set(item.id, total)
      })
    )
    const remainingLines = order.items.filter(
      (i) => i.status !== 'DaHuy' && i.status !== 'ChuaGui' && (taken.get(i.id) ?? 0) < i.quantity
    )
    if (!remainingLines.length) throw bizError('Hóa đơn gốc phải còn ít nhất 1 món', 'HoaDonGocHetMon')
    if (tx.openOrdersOfTable(order.tableId).length + parts.length > PosRules.maxOrdersPerTable) {
      throw bizError('Tối đa 10 hóa đơn mỗi bàn', 'QuaSoHoaDon')
    }
    const created: OrderRecord[] = []
    let codeSeq = 0
    for (const part of parts) {
      const code = nextOrderCodeAfter(tx, codeSeq++)
      const child: OrderRecord = {
        id: newId(),
        code,
        status: 'DangMo',
        version: 1,
        tableId: order.tableId,
        guestCount: 0,
        waiterId: order.waiterId,
        waiterName: order.waiterName,
        openedAt: order.openedAt,
        batchCount: order.batchCount,
        prebillPrintedAt: order.prebillPrintedAt,
        items: [],
        payments: [],
        deposit: 0,
        depositRefund: 0,
        splitFromOrderId: order.id,
        createdAt: tx.nowIso,
      }
      let sort = 0
      for (const entry of part.items) {
        if (!(entry.quantity > 0)) continue
        const item = order.items.find((i) => i.id === entry.itemId)!
        const moved = splitLine(order, item, entry.quantity)
        order.items = order.items.filter((i) => i.id !== moved.id)
        child.items.push({ ...moved, sortOrder: sort++ })
      }
      tx.addOrder(child)
      created.push(child)
    }
    order.discount = undefined
    tx.touchOrder(order)
    tx.commit()
    for (const child of created) auditCreate('Order', { id: child.id, code: child.code, splitFrom: order.code })
    notifyOrder(order)
    return [orderDto(order.id), ...created.map((c) => orderDto(c.id))]
  },

  async splitEqual(id: string, input: SplitEqualRequest): Promise<OrderDto> {
    await mockDelay()
    requirePermission(permissions.orders.split)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, input.version)
    tx.checkUnlocked(order)
    if (!Number.isInteger(input.count) || input.count < PosRules.minSplit || input.count > PosRules.maxSplit) {
      throw validation({ count: 'Số người từ 2 đến 20' })
    }
    const unsent = order.items.filter((i) => i.status === 'ChuaGui').length
    if (unsent) throw PosErrors.unsent(unsent)
    const m = moneyOf(order, billingSettings())
    if (!splitEqualShares(m.total, order.deposit, input.count).length) throw bizError('Tiền cọc đã đủ, không cần chia')
    order.splitCount = input.count
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  async cancelSplitEqual(id: string, version: number): Promise<OrderDto> {
    await mockDelay()
    requirePermission(permissions.orders.split)
    const tx = new PosTx()
    const order = tx.openOrder(id)
    tx.checkVersion(order, version)
    tx.checkUnlocked(order)
    order.splitCount = undefined
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  // ───── Thu tiền (§2.14) ─────
  async pay(id: string, input: CreatePaymentRequest): Promise<PaymentResultDto> {
    await mockDelay(200, 400)
    const session = requirePermission(permissions.orders.checkout)
    const tx = new PosTx()
    const order = tx.order(id)
    // 1. Cùng clientRequestId → kết quả cũ (TC-35, UC-11 E5)
    const previous = input.clientRequestId
      ? order.payments.find((p) => p.clientRequestId === input.clientRequestId)
      : undefined
    if (previous) {
      return {
        order: orderDto(id),
        payment: toPaymentDto(previous),
        changeAmount: previous.changeAmount ?? 0,
        completed: order.status === 'DaThanhToan',
      }
    }
    // 2. Hóa đơn đã đóng
    if (!isOpenStatus(order)) throw PosErrors.orderClosed()
    // 3. Dữ liệu cũ
    tx.checkVersion(order, input.version)
    // 4. Còn món chưa gửi
    const unsent = order.items.filter((i) => i.status === 'ChuaGui').length
    if (unsent) throw PosErrors.unsent(unsent)
    if (!order.items.some((i) => isBillable(i.status))) throw PosErrors.noItems()
    // 5. Thiếu trường theo phương thức
    if (input.method === 'TienMat') {
      if (!(Number(input.cashReceived) > 0)) throw validation({ cashReceived: 'Nhập tiền khách đưa' })
    } else if (input.method === 'ChuyenKhoan' || input.method === 'The') {
      if (!(Number(input.amount) > 0)) throw validation({ amount: 'Nhập số tiền' })
      if (input.method === 'The' && !/^\d{4}$/.test(input.cardLast4 ?? '')) {
        throw validation({ cardLast4: 'Nhập 4 số cuối thẻ' })
      }
    } else {
      throw validation({ method: 'Chọn phương thức thanh toán' })
    }
    const settings = billingSettings()
    const m = moneyOf(order, settings)
    if (m.remaining <= 0) throw bizError('Hóa đơn đã thu đủ tiền')
    // 6. Chia đều
    let target = m.remaining
    let share: { no: number; amount: number; paid: boolean } | undefined
    if (order.splitCount) {
      share = m.shares?.find((s) => s.no === input.shareNo)
      if (!input.shareNo || !share) throw validation({ shareNo: 'Chọn phần cần thu' })
      if (share.paid) throw validation({ shareNo: `Phần ${share.no} đã thu` })
      target = share.amount
    }
    // 7, 8. Số tiền
    let amount: number
    let cashReceived: number | undefined
    let changeAmount = 0
    if (input.method === 'TienMat') {
      cashReceived = Number(input.cashReceived)
      if (cashReceived < target) {
        if (share) {
          throw bizError(`Phần ${share.no} cần thu ${money(share.amount)}`, 'SaiTienPhan', {}, {
            cashReceived: `Phần ${share.no} cần thu ${money(share.amount)}`,
          })
        }
        if (!input.allowPartial) {
          throw bizError('Tiền khách đưa ít hơn số còn phải thu', 'TienMatThieu', {}, {
            cashReceived: 'Tiền khách đưa ít hơn số còn phải thu',
          })
        }
      }
      amount = Math.min(cashReceived, target)
      changeAmount = cashReceived - amount
    } else {
      amount = Number(input.amount)
      if (share && amount !== share.amount) {
        throw bizError(`Phần ${share.no} cần thu ${money(share.amount)}`, 'SaiTienPhan', {}, {
          amount: `Phần ${share.no} cần thu ${money(share.amount)}`,
        })
      }
      if (amount > m.remaining) {
        throw bizError(`Số tiền vượt số còn phải thu ${money(m.remaining)}`, 'VuotSoConPhaiThu', {}, {
          amount: `Số tiền vượt số còn phải thu ${money(m.remaining)}`,
        })
      }
    }
    // Lượt thu đầu không phải tiền cọc khóa hóa đơn (BR-22); tỉ lệ phí phục vụ, thuế chốt lúc thu đủ (07 §5 #4, BE)
    const payment: PaymentRecord = {
      id: newId(),
      method: input.method,
      amount,
      cashReceived,
      changeAmount: input.method === 'TienMat' ? changeAmount : undefined,
      cardLast4: input.method === 'The' ? input.cardLast4 : undefined,
      shareNo: share?.no,
      qrContent:
        input.method === 'ChuyenKhoan'
          ? (input.qrContent ??
            buildQrContent({ bankBin: settings.bankBin, bankAccount: settings.bankAccount, amount, orderCode: order.code }))
          : undefined,
      paidAt: tx.nowIso,
      cashierId: session.user.id,
      cashierName: session.user.fullName,
      clientRequestId: input.clientRequestId,
    }
    order.payments.push(payment)
    order.status = 'DangThu'
    const after = moneyOf(order, settings)
    const completed = after.remaining <= 0
    if (completed) finalizeOrder(tx, order, session)
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return { order: orderDto(id), payment: toPaymentDto(payment), changeAmount, completed }
  },

  /** Chốt hóa đơn đã đủ tiền nhờ tiền cọc (BR-25, 07 §5 #18) */
  async complete(id: string, input: VersionRequest): Promise<OrderDto> {
    await mockDelay()
    const session = requirePermission(permissions.orders.checkout)
    const tx = new PosTx()
    const order = tx.order(id)
    if (order.status === 'DaThanhToan') return orderDto(id)
    if (!isOpenStatus(order)) throw PosErrors.orderClosed()
    tx.checkVersion(order, input.version)
    const unsent = order.items.filter((i) => i.status === 'ChuaGui').length
    if (unsent) throw PosErrors.unsent(unsent)
    if (!order.items.some((i) => isBillable(i.status))) throw PosErrors.noItems()
    const m = moneyOf(order, billingSettings())
    if (m.remaining > 0) throw bizError(`Hóa đơn còn phải thu ${money(m.remaining)}`)
    finalizeOrder(tx, order, session)
    tx.touchOrder(order)
    tx.commit()
    notifyOrder(order)
    return orderDto(id)
  },

  /** Hủy hóa đơn đã thanh toán trong ngày (FR-33, BR-23, TC-40) */
  async cancel(id: string, reason: string): Promise<OrderDto> {
    await mockDelay()
    const session = requirePermission(permissions.orders.cancel)
    const found = findOrder(id)
    if (!found) throw notFound('Không tìm thấy hóa đơn')
    if (found.order.status === 'DaHuy') throw bizError('Hóa đơn đã hủy trước đó')
    const today = vnDateKey(Date.now())
    if (found.readonly || found.order.status !== 'DaThanhToan' || !found.order.paidAt || vnDateKey(found.order.paidAt) !== today) {
      throw bizError('Chỉ hủy được hóa đơn thanh toán trong ngày', 'KhongHuyDuocHoaDon')
    }
    const text = reason?.trim()
    if (!text) throw fieldError('reason', 'Nhập lý do hủy')
    const tx = new PosTx()
    const order = tx.order(id)
    order.status = 'DaHuy'
    order.cancelledAt = tx.nowIso
    order.cancelledById = session.user.id
    order.cancelledByUsername = session.user.username
    order.cancelReason = text
    tx.touchOrder(order)
    tx.commit()
    auditUpdate('Order', { id, status: 'DaThanhToan' }, { id, status: 'DaHuy', cancelReason: text })
    notifyOrder(order)
    return orderDto(id)
  },

  /** GET /api/ready-items (UC-07) */
  async readyItems(mine: boolean): Promise<ReadyGroupDto[]> {
    await mockDelay(80, 160)
    const session = requirePermission(permissions.orders.create)
    const ctx = readContext()
    const groups: (ReadyGroupDto & { first: string })[] = []
    for (const order of ctx.liveOrders) {
      if (!isOpenStatus(order)) continue
      if (mine && order.waiterId !== session.user.id) continue
      const items = order.items
        .filter((i) => i.status === 'Xong')
        .sort((a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? -1 : 1))
      if (!items.length) continue
      const table = ctx.tables.get(order.tableId)
      groups.push({
        tableId: order.tableId,
        tableCode: table?.code ?? '',
        orderId: order.id,
        orderCode: order.code,
        waiterId: order.waiterId,
        waiterName: order.waiterName,
        first: items[0].doneAt ?? '',
        items: items.map((i) => ({
          itemId: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note,
          doneAt: i.doneAt ?? '',
        })),
      })
    }
    return groups.sort((a, b) => (a.first < b.first ? -1 : 1)).map(({ first: _first, ...g }) => {
      void _first
      return g
    })
  },
}

/** Số phiếu tiếp theo, tính cả phiếu vừa tạo trong cùng thao tác */
function nextTicketNoAfter(tx: PosTx, created: TicketRecord[]) {
  const base = nextTicketNo(tx.now)
  const extra = created.filter((t) => t.businessDate === base.businessDate).length
  const ticketNo = base.ticketNo + extra
  return { businessDate: base.businessDate, ticketNo, code: `#${String(ticketNo).padStart(3, '0')}` }
}

/** Mã hóa đơn tiếp theo, tính cả hóa đơn vừa tạo trong cùng thao tác */
function nextOrderCodeAfter(tx: PosTx, offset: number) {
  const base = nextOrderCode(tx.now)
  const prefix = base.slice(0, 8)
  const n = Number(base.slice(8)) + offset
  return `${prefix}${String(n).padStart(4, '0')}`
}

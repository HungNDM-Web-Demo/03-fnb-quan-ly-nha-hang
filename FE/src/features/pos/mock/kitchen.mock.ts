import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { publishPosEvent } from '@/lib/realtime'
import { requirePermission } from '@/mock/mock-auth'
import { mockDb } from '@/mock/mock-db'
import { notFound } from '@/mock/mock-errors'
import { vnDateKey } from '../lib/vn-time'
import type {
  KitchenBoardDto,
  KitchenStation,
  KitchenSummaryItem,
  KitchenTicketDto,
  KitchenView,
} from '../types/pos.types'
import { menuItemsDb } from './pos.db'
import { bizError, PosErrors } from './pos.errors'
import { isLockedOrder, isOpenStatus, readContext, toTicketDto } from './pos.mappers'
import type { OrderItemRecord, OrderRecord, TicketRecord } from './pos.records'
import { PosTx } from './pos.tx'

/**
 * Màn hình bếp (07 §2.10, UC-06). Thao tác bếp không đổi `version` của hóa đơn,
 * trừ báo hết món (đổi tiền món).
 */

function ticketDto(id: string): KitchenTicketDto {
  const ctx = readContext()
  const ticket = ctx.tickets.get(id)
  if (!ticket) throw notFound('Không tìm thấy phiếu bếp')
  return toTicketDto(ticket, ctx)
}

function locate(tx: PosTx, ticketId: string, itemId: string): { ticket: TicketRecord; order: OrderRecord; item: OrderItemRecord } {
  const ticket = tx.ticket(ticketId)
  for (const order of tx.orders) {
    const item = order.items.find((i) => i.id === itemId && i.kitchenTicketId === ticketId)
    if (item) return { ticket, order, item }
  }
  throw notFound('Món không thuộc phiếu bếp')
}

function notify(tx: PosTx, ticket: TicketRecord, order: OrderRecord) {
  publishPosEvent('kitchen-changed', { ticketIds: [ticket.id], stations: [ticket.station], newTicketIds: [] })
  publishPosEvent('order-changed', { orderId: order.id, tableId: order.tableId, version: order.version })
  publishPosEvent('tables-changed', { tableIds: [order.tableId] })
  void tx
}

function readyEvent(tx: PosTx, order: OrderRecord, count: number) {
  if (count <= 0) return
  const table = tx.tables.find((t) => t.id === order.tableId)
  publishPosEvent('items-ready', {
    tableId: order.tableId,
    tableCode: table?.code ?? '',
    orderId: order.id,
    waiterId: order.waiterId,
    count,
  })
}

const isCooking = (i: OrderItemRecord) => i.status === 'ChoLam' || i.status === 'DangLam'

export const kitchenMock = {
  /** GET /api/kitchen-tickets?station&view */
  async board(station?: KitchenStation, view: KitchenView = 'DangCho'): Promise<KitchenBoardDto> {
    await mockDelay(80, 180)
    requirePermission(permissions.kitchenTickets.view)
    const ctx = readContext()
    let tickets = [...ctx.tickets.values()].filter((t) => !station || t.station === station)
    let dtos: KitchenTicketDto[]
    if (view === 'DaXong') {
      const today = vnDateKey(ctx.now)
      tickets = tickets.filter((t) => t.status === 'DaXong' && t.businessDate === today)
      dtos = tickets
        .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1))
        .slice(0, 50)
        .map((t) => toTicketDto(t, ctx))
    } else {
      dtos = tickets
        .filter((t) => t.status === 'DangCho')
        .map((t) => toTicketDto(t, ctx))
        .sort(
          (a, b) =>
            Number(b.isRush) - Number(a.isRush) ||
            (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0) ||
            (a.code < b.code ? -1 : 1)
        )
    }
    return { asOf: new Date(ctx.now).toISOString(), tickets: dtos }
  },

  /** Chế độ tổng hợp (FR-18) */
  async summary(station?: KitchenStation): Promise<KitchenSummaryItem[]> {
    await mockDelay(80, 180)
    requirePermission(permissions.kitchenTickets.view)
    const ctx = readContext()
    const map = new Map<string, KitchenSummaryItem>()
    for (const order of ctx.liveOrders) {
      if (!isOpenStatus(order)) continue
      for (const item of order.items) {
        if (!isCooking(item) || item.station === 'KhongQuaBep') continue
        if (station && item.station !== station) continue
        const ticket = item.kitchenTicketId ? ctx.tickets.get(item.kitchenTicketId) : undefined
        if (!ticket) continue
        let entry = map.get(item.menuItemId)
        if (!entry) {
          entry = {
            menuItemId: item.menuItemId,
            itemName: item.itemName,
            unit: item.unit,
            station: item.station,
            totalQuantity: 0,
            lines: [],
          }
          map.set(item.menuItemId, entry)
        }
        entry.totalQuantity = Math.round((entry.totalQuantity + item.quantity) * 1000) / 1000
        entry.lines.push({
          ticketId: ticket.id,
          ticketCode: ticket.code,
          tableCode: ctx.tables.get(order.tableId)?.code ?? ticket.tableCode,
          itemId: item.id,
          quantity: item.quantity,
          status: item.status,
          sentAt: item.sentAt ?? ticket.sentAt,
          isRush: item.isRush,
        })
      }
    }
    return [...map.values()]
      .map((e) => ({ ...e, lines: e.lines.sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1)) }))
      // Món có dòng gửi sớm nhất xếp trước, cùng giờ thì theo tên (07 §5 #32)
      .sort((a, b) => (a.lines[0].sentAt < b.lines[0].sentAt ? -1 : a.lines[0].sentAt > b.lines[0].sentAt ? 1 : a.itemName.localeCompare(b.itemName, 'vi')))
  },

  async start(ticketId: string, itemId: string): Promise<KitchenTicketDto> {
    await mockDelay(80, 160)
    requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const { ticket, order, item } = locate(tx, ticketId, itemId)
    if (item.status !== 'ChoLam') throw bizError('Món không ở trạng thái chờ làm')
    item.status = 'DangLam'
    item.startedAt = tx.nowIso
    tx.touchOrder(order, false)
    tx.refreshTicket(ticket.id)
    tx.commit()
    notify(tx, ticket, order)
    return ticketDto(ticketId)
  },

  async done(ticketId: string, itemId: string): Promise<KitchenTicketDto> {
    await mockDelay(80, 160)
    requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const { ticket, order, item } = locate(tx, ticketId, itemId)
    if (!isCooking(item)) throw bizError('Món không ở trạng thái chờ làm hoặc đang làm')
    item.status = 'Xong'
    item.startedAt ??= tx.nowIso
    item.doneAt = tx.nowIso
    tx.touchOrder(order, false)
    tx.refreshTicket(ticket.id)
    tx.commit()
    notify(tx, ticket, order)
    readyEvent(tx, order, 1)
    return ticketDto(ticketId)
  },

  /** "Xong cả phiếu" (UC-06 4a) */
  async doneAll(ticketId: string): Promise<KitchenTicketDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const ticket = tx.ticket(ticketId)
    const byOrder = new Map<OrderRecord, number>()
    for (const order of tx.orders) {
      for (const item of order.items) {
        if (item.kitchenTicketId !== ticketId || !isCooking(item)) continue
        item.status = 'Xong'
        item.startedAt ??= tx.nowIso
        item.doneAt = tx.nowIso
        byOrder.set(order, (byOrder.get(order) ?? 0) + 1)
      }
    }
    if (!byOrder.size) throw bizError('Phiếu không còn món chờ làm')
    for (const order of byOrder.keys()) tx.touchOrder(order, false)
    tx.refreshTicket(ticketId)
    tx.commit()
    for (const [order, count] of byOrder) {
      notify(tx, ticket, order)
      readyEvent(tx, order, count)
    }
    return ticketDto(ticketId)
  },

  /** Hoàn tác "Xong" → "Đang làm" (BR-10, TC-20) */
  async undo(ticketId: string, itemId: string): Promise<KitchenTicketDto> {
    await mockDelay(80, 160)
    requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const { ticket, order, item } = locate(tx, ticketId, itemId)
    if (item.status === 'DaPhucVu') throw bizError('Món đã ra cho khách', 'MonDaRa')
    if (item.status !== 'Xong') throw bizError('Chỉ hoàn tác món đã xong')
    item.status = 'DangLam'
    item.doneAt = undefined
    tx.touchOrder(order, false)
    tx.refreshTicket(ticket.id)
    tx.commit()
    notify(tx, ticket, order)
    return ticketDto(ticketId)
  },

  /** Báo hết món đang chờ làm (FR-10, BR-14, TC-07) */
  async outOfStock(ticketId: string, itemId: string): Promise<KitchenTicketDto> {
    await mockDelay(120, 240)
    const session = requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const { ticket, order, item } = locate(tx, ticketId, itemId)
    if (item.status !== 'ChoLam') throw bizError('Chỉ báo hết món đang chờ làm')
    if (isLockedOrder(order)) throw PosErrors.orderLocked()
    item.status = 'DaHuy'
    item.cancel = {
      reason: 'HetMon',
      cancelledAt: tx.nowIso,
      cancelledById: session.user.id,
      cancelledByName: session.user.fullName,
      cancelledByUsername: session.user.username,
      statusAtCancel: 'ChoLam',
      acknowledgedAt: tx.nowIso,
    }
    tx.touchOrder(order)
    tx.refreshTicket(ticket.id)
    tx.commit()
    const menu = menuItemsDb.get(item.menuItemId)
    if (menu && !menu.isSoldOut) {
      mockDb.batch(() => menuItemsDb.update(menu.id, { isSoldOut: true, updatedAt: tx.nowIso }))
    }
    const tableCode = tx.tables.find((t) => t.id === order.tableId)?.code ?? ticket.tableCode
    notify(tx, ticket, order)
    publishPosEvent('menu-changed', { menuItemIds: [item.menuItemId] })
    publishPosEvent('item-out-of-stock', {
      tableCode,
      itemName: item.itemName,
      waiterId: order.waiterId,
      message: `${tableCode}: ${item.itemName} đã hết, mời khách đổi món`,
    })
    return ticketDto(ticketId)
  },

  /** "Đã biết" món hủy (BR-13) */
  async acknowledge(ticketId: string, itemId: string): Promise<KitchenTicketDto> {
    await mockDelay(80, 160)
    requirePermission(permissions.kitchenTickets.update)
    const tx = new PosTx()
    const { ticket, order, item } = locate(tx, ticketId, itemId)
    if (item.status !== 'DaHuy' || !item.cancel || item.cancel.acknowledgedAt) {
      throw bizError('Món không ở trạng thái hủy chờ xác nhận')
    }
    item.cancel.acknowledgedAt = tx.nowIso
    tx.touchOrder(order, false)
    tx.refreshTicket(ticket.id)
    tx.commit()
    notify(tx, ticket, order)
    return ticketDto(ticketId)
  },
}

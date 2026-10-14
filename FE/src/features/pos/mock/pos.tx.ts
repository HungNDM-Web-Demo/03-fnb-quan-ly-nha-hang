import { mockDb } from '@/mock/mock-db'
import { notFound } from '@/mock/mock-errors'
import { ordersDb, tablesDb, ticketsDb } from './pos.db'
import { PosErrors } from './pos.errors'
import { isOpenStatus, isLockedOrder } from './pos.mappers'
import type { OrderRecord, StoredTableStatus, TableRecord, TicketRecord } from './pos.records'

/**
 * Đơn vị thao tác của handler mock: đọc hóa đơn, bàn, phiếu bếp hôm nay vào bộ nhớ, sửa trực tiếp,
 * rồi ghi một lần (giống transaction của BE). Chỉ hóa đơn trong mock-db sửa được (lịch sử chỉ đọc).
 */
export class PosTx {
  readonly now = Date.now()
  readonly nowIso = new Date(this.now).toISOString()
  readonly orders: OrderRecord[] = ordersDb.all()
  readonly tables: TableRecord[] = tablesDb.all()
  readonly tickets: TicketRecord[] = ticketsDb.all()
  private dirtyOrders = new Set<string>()
  private newOrders = new Set<string>()
  private dirtyTables = new Set<string>()
  private dirtyTickets = new Set<string>()
  private newTickets = new Set<string>()

  order(id: string): OrderRecord {
    const order = this.orders.find((o) => o.id === id)
    if (!order) throw notFound('Không tìm thấy hóa đơn')
    return order
  }

  /** Hóa đơn đang mở (DangMo, DangThu); đã đóng → 400 "Hóa đơn đã đóng" */
  openOrder(id: string): OrderRecord {
    const order = this.order(id)
    if (!isOpenStatus(order)) throw PosErrors.orderClosed()
    return order
  }

  table(id: string): TableRecord {
    const table = this.tables.find((t) => t.id === id && !t.isDeleted)
    if (!table) throw notFound('Không tìm thấy bàn')
    return table
  }

  ticket(id: string): TicketRecord {
    const ticket = this.tickets.find((t) => t.id === id)
    if (!ticket) throw notFound('Không tìm thấy phiếu bếp')
    return ticket
  }

  openOrdersOfTable(tableId: string): OrderRecord[] {
    return this.orders
      .filter((o) => o.tableId === tableId && isOpenStatus(o))
      .sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.code < b.code ? -1 : 1))
  }

  checkVersion(order: OrderRecord, version: number | undefined) {
    if (version !== order.version) throw PosErrors.staleVersion(order.version)
  }

  checkUnlocked(order: OrderRecord) {
    if (isLockedOrder(order)) throw PosErrors.orderLocked()
  }

  /** Đánh dấu hóa đơn đã đổi; `bump` tăng version (07 §3.6) */
  touchOrder(order: OrderRecord, bump = true) {
    if (bump) order.version += 1
    this.dirtyOrders.add(order.id)
  }

  addOrder(order: OrderRecord) {
    this.orders.push(order)
    this.newOrders.add(order.id)
  }

  setTableStatus(table: TableRecord, status: StoredTableStatus, mergedIntoTableId?: string) {
    table.status = status
    table.mergedIntoTableId = status === 'Trong' ? undefined : (mergedIntoTableId ?? table.mergedIntoTableId)
    if (status !== 'DaGop' && status !== 'ChoDon') table.mergedIntoTableId = undefined
    table.statusChangedAt = this.nowIso
    table.version += 1
    this.dirtyTables.add(table.id)
  }

  touchTable(table: TableRecord) {
    this.dirtyTables.add(table.id)
  }

  addTicket(ticket: TicketRecord) {
    this.tickets.push(ticket)
    this.newTickets.add(ticket.id)
  }

  touchTicket(ticket: TicketRecord) {
    this.dirtyTickets.add(ticket.id)
  }

  /** BR-10: phiếu vào "Đã xong" khi mọi món Xong/Đã phục vụ/Đã hủy và món hủy đã được bếp "Đã biết" */
  refreshTicket(ticketId: string) {
    const ticket = this.tickets.find((t) => t.id === ticketId)
    if (!ticket) return
    const items = this.orders.flatMap((o) => o.items.filter((i) => i.kitchenTicketId === ticketId))
    const pending = items.some(
      (i) => i.status === 'ChoLam' || i.status === 'DangLam' || (i.status === 'DaHuy' && !i.cancel?.acknowledgedAt)
    )
    const status = pending ? 'DangCho' : 'DaXong'
    if (ticket.status !== status) {
      ticket.status = status
      ticket.completedAt = pending ? undefined : this.nowIso
      this.dirtyTickets.add(ticket.id)
    }
  }

  /** Bàn: còn hóa đơn đang mở thì giữ, không còn thì chuyển trạng thái chỉ định */
  commit() {
    mockDb.batch(() => {
      for (const id of this.newOrders) ordersDb.insert(this.orders.find((o) => o.id === id)!)
      for (const id of this.dirtyOrders) {
        if (this.newOrders.has(id)) continue
        const order = this.orders.find((o) => o.id === id)!
        ordersDb.update(id, () => order)
      }
      for (const id of this.dirtyTables) {
        const table = this.tables.find((t) => t.id === id)!
        tablesDb.update(id, () => table)
      }
      for (const id of this.newTickets) ticketsDb.insert(this.tickets.find((t) => t.id === id)!)
      for (const id of this.dirtyTickets) {
        if (this.newTickets.has(id)) continue
        const ticket = this.tickets.find((t) => t.id === id)!
        ticketsDb.update(id, () => ticket)
      }
    })
  }
}

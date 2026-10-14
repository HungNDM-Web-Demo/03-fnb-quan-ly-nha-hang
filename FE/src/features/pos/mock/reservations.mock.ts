import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { publishPosEvent } from '@/lib/realtime'
import { auditCreate, auditUpdate } from '@/mock/mock-audit'
import { requirePermission } from '@/mock/mock-auth'
import { notFound, validation } from '@/mock/mock-errors'
import { newId, paginate, search, sortItems } from '@/mock/mock-helpers'
import type { PaginatedResult } from '@/types/api'
import { PosRules } from '../lib/pos-rules'
import { addDaysKey, vnDateKey, vnHhmm, vnMinuteOfDay, vnStartOfDay } from '../lib/vn-time'
import type {
  AvailableTablesQuery,
  CheckInRequest,
  DiningTableDto,
  OrderDto,
  ReservationDto,
  ReservationQuery,
  SaveReservationRequest,
} from '../types/pos.types'
import {
  areasDb,
  billingSettings,
  everUsedTableIds,
  nextOrderCode,
  nextReservationCode,
  ordersDb,
  reservationsDb,
  tablesDb,
} from './pos.db'
import { bizError, conflictError } from './pos.errors'
import { applyNoShows, readContext, toDiningTableDto, toOrderDto, toReservationDto } from './pos.mappers'
import type { OrderRecord, ReservationRecord } from './pos.records'
import { PosTx } from './pos.tx'

const MIN = 60_000
const holds = (r: ReservationRecord) => r.status === 'ChoDen' || r.status === 'DaNhanBan'
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function dto(r: ReservationRecord): ReservationDto {
  return toReservationDto(r, readContext())
}

function notify(ids: string[], tableIds: string[] = []) {
  publishPosEvent('reservations-changed', { reservationIds: ids })
  publishPosEvent('tables-changed', { tableIds })
}

/** Đặt bàn khác cùng bàn chồng khung 120 phút (BR-24) */
function conflictOf(tableId: string, arrival: number, excludeId?: string) {
  return reservationsDb.find(
    (r) =>
      r.id !== excludeId &&
      r.tableId === tableId &&
      holds(r) &&
      Math.abs(new Date(r.arrivalAt).getTime() - arrival) < PosRules.holdMinutes * MIN
  )
}

function validateInput(input: SaveReservationRequest, options: { excludeId?: string; checkLead: boolean }) {
  const errors: Record<string, string> = {}
  if (!input.customerName?.trim()) errors.customerName = 'Nhập tên khách'
  const phone = (input.phone ?? '').replace(/\D/g, '')
  if (!/^0\d{9}$/.test(phone)) errors.phone = 'Số điện thoại không hợp lệ'
  if (!Number.isInteger(input.guestCount) || input.guestCount < 1 || input.guestCount > 50) {
    errors.guestCount = 'Số khách từ 1 đến 50'
  }
  const deposit = Number(input.deposit ?? 0)
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > PosRules.maxDeposit || deposit % 1000 !== 0) {
    errors.deposit = 'Tiền cọc từ 0 đến 5.000.000 ₫, bội số 1.000 ₫'
  }
  if ((input.note ?? '').length > 500) errors.note = 'Ghi chú tối đa 500 ký tự'
  const arrival = new Date(input.arrivalAt).getTime()
  if (!input.arrivalAt || Number.isNaN(arrival)) errors.arrivalAt = 'Chọn giờ đến'
  const table = tablesDb.get(input.tableId)
  if (!table || table.isDeleted) errors.tableId = 'Chọn bàn'
  if (Object.keys(errors).length) throw validation(errors)

  const settings = billingSettings()
  const minute = vnMinuteOfDay(arrival)
  if (minute < toMinutes(settings.openTime) || minute > toMinutes(settings.closeTime)) {
    throw validation({ arrivalAt: `Giờ đến trong giờ mở cửa ${settings.openTime}–${settings.closeTime}` })
  }
  if (options.checkLead && arrival < Date.now() + PosRules.minLeadMinutes * MIN) {
    throw validation({ arrivalAt: 'Giờ đến phải sau hiện tại ít nhất 30 phút' })
  }
  const clash = conflictOf(table!.id, arrival, options.excludeId)
  if (clash) {
    const from = new Date(clash.arrivalAt).getTime()
    const message = `Bàn ${table!.code} đã được giữ từ ${vnHhmm(from)} đến ${vnHhmm(from + PosRules.holdMinutes * MIN)}`
    throw conflictError(message, 'TrungDatBan', {}, { tableId: message })
  }
  return { phone, arrival, deposit, table: table! }
}

export const reservationsMock = {
  async list(query: ReservationQuery): Promise<PaginatedResult<ReservationDto>> {
    await mockDelay()
    requirePermission(permissions.reservations.view)
    applyNoShows()
    let list = reservationsDb.all()
    if (query.from || query.to) {
      const from = query.from ? vnStartOfDay(query.from) : -Infinity
      const to = query.to ? vnStartOfDay(addDaysKey(query.to, 1)) : Infinity
      list = list.filter((r) => {
        const t = new Date(r.arrivalAt).getTime()
        return t >= from && t < to
      })
    }
    if (query.status) list = list.filter((r) => r.status === query.status)
    if (query.tableId) list = list.filter((r) => r.tableId === query.tableId)
    list = search(list, query.search, ['customerName', 'phone', 'code'])
    const ctx = readContext()
    const dtos = list.map((r) => toReservationDto(r, ctx))
    return paginate(sortItems(dtos, query.sortBy || 'arrivalAt', query.sortDir || 'asc'), query)
  },

  async get(id: string): Promise<ReservationDto> {
    await mockDelay(80, 160)
    requirePermission(permissions.reservations.view)
    applyNoShows()
    const r = reservationsDb.get(id)
    if (!r) throw notFound('Không tìm thấy đặt bàn')
    return dto(r)
  },

  /** Bàn trống đủ chỗ trong khung 120 phút (UC-13 bước 2) */
  async availableTables(query: AvailableTablesQuery): Promise<DiningTableDto[]> {
    await mockDelay(80, 160)
    requirePermission(permissions.reservations.create, permissions.reservations.update)
    const arrival = new Date(query.arrivalAt).getTime()
    const guests = Number(query.guestCount) || 1
    const areas = new Map(areasDb.all().map((a) => [a.id, a]))
    const used = everUsedTableIds()
    return tablesDb
      .filter((t) => {
        const area = areas.get(t.areaId)
        return !t.isDeleted && !t.isHidden && !!area && !area.isDeleted && !area.isHidden && t.capacity >= guests
      })
      .filter((t) => Number.isNaN(arrival) || !conflictOf(t.id, arrival, query.excludeId))
      .sort((a, b) => a.capacity - b.capacity || (a.code < b.code ? -1 : 1))
      .map((t) => toDiningTableDto(t, areas, used))
  },

  async create(input: SaveReservationRequest): Promise<ReservationDto> {
    await mockDelay()
    requirePermission(permissions.reservations.create)
    const { phone, arrival, deposit } = validateInput(input, { checkLead: true })
    const record: ReservationRecord = {
      id: newId(),
      code: nextReservationCode(),
      customerName: input.customerName.trim(),
      phone,
      arrivalAt: new Date(arrival).toISOString(),
      guestCount: input.guestCount,
      tableId: input.tableId,
      note: input.note?.trim() || undefined,
      deposit,
      status: 'ChoDen',
      createdAt: new Date().toISOString(),
    }
    reservationsDb.insert(record)
    auditCreate('Reservation', record)
    notify([record.id], [record.tableId])
    return dto(record)
  },

  async update(id: string, input: SaveReservationRequest): Promise<ReservationDto> {
    await mockDelay()
    requirePermission(permissions.reservations.update)
    applyNoShows()
    const before = reservationsDb.get(id)
    if (!before) throw notFound('Không tìm thấy đặt bàn')
    if (before.status !== 'ChoDen') throw bizError('Đặt bàn không còn ở trạng thái chờ đến')
    const changedTime = new Date(input.arrivalAt).getTime() !== new Date(before.arrivalAt).getTime()
    const { phone, arrival, deposit } = validateInput(input, { excludeId: id, checkLead: changedTime })
    const after = reservationsDb.update(id, {
      customerName: input.customerName.trim(),
      phone,
      arrivalAt: new Date(arrival).toISOString(),
      guestCount: input.guestCount,
      tableId: input.tableId,
      note: input.note?.trim() || undefined,
      deposit,
    })!
    auditUpdate('Reservation', before, after)
    notify([id], [before.tableId, after.tableId])
    return dto(after)
  },

  async cancel(id: string, reason: string): Promise<ReservationDto> {
    await mockDelay()
    const session = requirePermission(permissions.reservations.delete)
    applyNoShows()
    const before = reservationsDb.get(id)
    if (!before) throw notFound('Không tìm thấy đặt bàn')
    if (before.status !== 'ChoDen') throw bizError('Đặt bàn không còn ở trạng thái chờ đến')
    const text = reason?.trim()
    if (!text) throw validation({ reason: 'Nhập lý do hủy' })
    const after = reservationsDb.update(id, {
      status: 'DaHuy',
      cancelledAt: new Date().toISOString(),
      cancelledById: session.user.id,
      cancelledByName: session.user.fullName,
      cancelReason: text,
    })!
    auditUpdate('Reservation', before, after)
    notify([id], [before.tableId])
    return dto(after)
  },

  /** Nhận bàn (FR-36, TC-42) */
  async checkIn(id: string, input: CheckInRequest): Promise<OrderDto> {
    await mockDelay(150, 300)
    const session = requirePermission(permissions.reservations.checkIn)
    const existing = input.clientRequestId
      ? ordersDb.find((o) => o.clientRequestId === input.clientRequestId)
      : undefined
    if (existing) return toOrderDto(existing, readContext())
    applyNoShows()
    const reservation = reservationsDb.get(id)
    if (!reservation) throw notFound('Không tìm thấy đặt bàn')
    if (reservation.status !== 'ChoDen') throw bizError('Đặt bàn không còn ở trạng thái chờ đến')
    if (vnDateKey(reservation.arrivalAt) !== vnDateKey(Date.now())) {
      throw bizError('Chỉ nhận bàn cho đặt bàn hôm nay')
    }
    const guestCount = input.guestCount ?? reservation.guestCount
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 50) {
      throw validation({ guestCount: 'Số khách từ 1 đến 50' })
    }
    const tx = new PosTx()
    const table = tx.table(reservation.tableId)
    if (table.status === 'ChoDon') throw bizError('Bàn chưa dọn xong', 'BanChoDon')
    if (table.status !== 'Trong') throw bizError(`Bàn ${table.code} đang có khách, chuyển đặt bàn sang bàn khác`)
    const order: OrderRecord = {
      id: newId(),
      code: nextOrderCode(tx.now),
      status: 'DangMo',
      version: 1,
      clientRequestId: input.clientRequestId,
      tableId: table.id,
      guestCount,
      note: reservation.note,
      waiterId: session.user.id,
      waiterName: session.user.fullName,
      openedAt: tx.nowIso,
      batchCount: 0,
      items: [],
      payments:
        reservation.deposit > 0
          ? [{ id: newId(), method: 'TienCoc', amount: reservation.deposit, paidAt: tx.nowIso }]
          : [],
      deposit: reservation.deposit,
      depositRefund: 0,
      reservationId: reservation.id,
      createdAt: tx.nowIso,
    }
    tx.addOrder(order)
    tx.setTableStatus(table, 'DangPhucVu')
    tx.commit()
    reservationsDb.update(id, { status: 'DaNhanBan', orderId: order.id, checkedInAt: tx.nowIso })
    notify([id], [table.id])
    publishPosEvent('order-changed', { orderId: order.id, tableId: table.id, version: order.version })
    return toOrderDto(ordersDb.get(order.id)!, readContext())
  },
}

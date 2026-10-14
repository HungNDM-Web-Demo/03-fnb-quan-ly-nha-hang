import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { publishPosEvent } from '@/lib/realtime'
import { auditCreate, auditDelete, auditUpdate } from '@/mock/mock-audit'
import { requirePermission } from '@/mock/mock-auth'
import { mockDb } from '@/mock/mock-db'
import { forbidden, notFound, validation } from '@/mock/mock-errors'
import { newId } from '@/mock/mock-helpers'
import { PosRules, tableSize } from '../lib/pos-rules'
import type {
  AreaDto,
  DiningTableDto,
  FloorPlanDto,
  OpenTableRequest,
  OrderDto,
  SaveAreaRequest,
  SaveTableRequest,
  TableCardDto,
  TableLayoutRequest,
  TableServiceDto,
  TableStatus,
} from '../types/pos.types'
import { areasDb, everUsedTableIds, nextOrderCode, ordersDb, tablesDb } from './pos.db'
import { bizError, conflictError } from './pos.errors'
import {
  applyNoShows,
  openOrdersOfTable,
  readContext,
  toAreaDto,
  toDiningTableDto,
  toOrderDto,
  toTableCard,
} from './pos.mappers'
import type { OrderRecord, TableRecord } from './pos.records'

const nowIso = () => new Date().toISOString()

const liveAreas = () => areasDb.filter((a) => !a.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder)
const liveTables = () => tablesDb.filter((t) => !t.isDeleted)

function hasGuests(t: TableRecord) {
  return t.status !== 'Trong'
}

function validateTable(input: SaveTableRequest, excludeId?: string) {
  const area = areasDb.get(input.areaId)
  if (!area || area.isDeleted) throw validation({ areaId: 'Khu vực không tồn tại' })
  const errors: Record<string, string> = {}
  const code = (input.code ?? '').trim().toUpperCase()
  if (!new RegExp(`^${area.code}-\\d{2}$`).test(code)) errors.code = `Mã bàn dạng ${area.code}-01`
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 20) {
    errors.capacity = 'Sức chứa từ 1 đến 20'
  }
  const size = tableSize(input.shape)
  if (
    !Number.isInteger(input.x) ||
    !Number.isInteger(input.y) ||
    input.x < 0 ||
    input.y < 0 ||
    input.x + size.w > PosRules.gridCols ||
    input.y + size.h > PosRules.gridRows
  ) {
    errors.x = 'Vị trí bàn nằm ngoài sơ đồ'
    errors.y = 'Vị trí bàn nằm ngoài sơ đồ'
  }
  if (Object.keys(errors).length) throw validation(errors)
  if (liveTables().some((t) => t.code === code && t.id !== excludeId)) {
    throw conflictError('Mã bàn đã tồn tại', undefined, {}, { code: 'Mã bàn đã tồn tại' })
  }
  return code
}

const tableBusy = () => bizError('Bàn đang có khách', 'BanDangCoKhach')

export const tablesMock = {
  // ───── Khu vực (§2.5) ─────
  async areas(includeHidden?: boolean): Promise<AreaDto[]> {
    await mockDelay()
    const ctx = requirePermission(permissions.tables.view)
    if (includeHidden && !ctx.isSuperAdmin && !ctx.permissions.includes(permissions.tables.update)) throw forbidden()
    const tables = liveTables()
    return liveAreas()
      .filter((a) => includeHidden || !a.isHidden)
      .map((a) => toAreaDto(a, tables))
  },

  async createArea(input: SaveAreaRequest): Promise<AreaDto> {
    await mockDelay()
    requirePermission(permissions.tables.create)
    const code = (input.code ?? '').trim().toUpperCase()
    const errors: Record<string, string> = {}
    if (!/^[A-Z0-9]{2}$/.test(code)) errors.code = 'Mã khu vực 2 ký tự chữ in hoa hoặc số'
    if (!input.name?.trim()) errors.name = 'Nhập tên khu vực'
    if (Object.keys(errors).length) throw validation(errors)
    if (liveAreas().some((a) => a.code === code)) {
      throw conflictError('Mã khu vực đã tồn tại', undefined, {}, { code: 'Mã khu vực đã tồn tại' })
    }
    const max = liveAreas().reduce((m, a) => Math.max(m, a.sortOrder), 0)
    const record = areasDb.insert({
      id: newId(),
      code,
      name: input.name.trim(),
      sortOrder: max + 10,
      isHidden: !!input.isHidden,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    auditCreate('Area', record)
    publishPosEvent('tables-changed', { tableIds: [] })
    return toAreaDto(record, liveTables())
  },

  async updateArea(id: string, input: SaveAreaRequest): Promise<AreaDto> {
    await mockDelay()
    requirePermission(permissions.tables.update)
    const before = areasDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy khu vực')
    if (input.code && input.code.trim().toUpperCase() !== before.code) {
      throw validation({ code: 'Không đổi được mã khu vực' })
    }
    if (!input.name?.trim()) throw validation({ name: 'Nhập tên khu vực' })
    if (input.isHidden && !before.isHidden && liveTables().some((t) => t.areaId === id && hasGuests(t))) {
      throw bizError('Khu vực đang có bàn có khách')
    }
    const after = areasDb.update(id, { name: input.name.trim(), isHidden: !!input.isHidden, updatedAt: nowIso() })!
    auditUpdate('Area', before, after)
    publishPosEvent('tables-changed', { tableIds: [] })
    return toAreaDto(after, liveTables())
  },

  async reorderAreas(ids: string[]): Promise<void> {
    await mockDelay()
    requirePermission(permissions.tables.update)
    const all = liveAreas()
    const set = new Set(ids)
    if (ids.length !== all.length || !all.every((a) => set.has(a.id))) {
      throw validation({ ids: 'Danh sách phải gồm đủ mọi khu vực' })
    }
    mockDb.batch(() => ids.forEach((id, i) => areasDb.update(id, { sortOrder: (i + 1) * 10 })))
    publishPosEvent('tables-changed', { tableIds: [] })
  },

  async deleteArea(id: string): Promise<void> {
    await mockDelay()
    requirePermission(permissions.tables.delete)
    const before = areasDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy khu vực')
    const count = liveTables().filter((t) => t.areaId === id).length
    if (count > 0) throw bizError(`Khu vực đang có ${count} bàn`, undefined, { tableCount: count })
    areasDb.update(id, { isDeleted: true, updatedAt: nowIso() })
    auditDelete('Area', before)
    publishPosEvent('tables-changed', { tableIds: [] })
  },

  // ───── Bàn (§2.6) ─────
  async tables(areaId?: string, includeHidden?: boolean): Promise<DiningTableDto[]> {
    await mockDelay()
    const ctx = requirePermission(permissions.tables.view)
    if (includeHidden && !ctx.isSuperAdmin && !ctx.permissions.includes(permissions.tables.update)) throw forbidden()
    const areas = new Map(areasDb.all().map((a) => [a.id, a]))
    const order = new Map(liveAreas().map((a, i) => [a.id, i]))
    const used = everUsedTableIds()
    return liveTables()
      .filter((t) => (!areaId || t.areaId === areaId) && (includeHidden || !t.isHidden))
      .sort((a, b) => (order.get(a.areaId) ?? 99) - (order.get(b.areaId) ?? 99) || (a.code < b.code ? -1 : 1))
      .map((t) => toDiningTableDto(t, areas, used))
  },

  async createTable(input: SaveTableRequest): Promise<DiningTableDto> {
    await mockDelay(100, 200)
    requirePermission(permissions.tables.create)
    const code = validateTable(input)
    const record = tablesDb.insert({
      id: newId(),
      code,
      areaId: input.areaId,
      capacity: input.capacity,
      shape: input.shape,
      x: input.x,
      y: input.y,
      isHidden: false,
      status: 'Trong',
      version: 1,
      createdAt: nowIso(),
    })
    auditCreate('DiningTable', record)
    publishPosEvent('tables-changed', { tableIds: [record.id] })
    return toDiningTableDto(record, new Map(areasDb.all().map((a) => [a.id, a])))
  },

  async updateTable(id: string, input: SaveTableRequest): Promise<DiningTableDto> {
    await mockDelay()
    requirePermission(permissions.tables.update)
    const before = tablesDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy bàn')
    const code = validateTable(input, id)
    if (input.areaId !== before.areaId && hasGuests(before)) throw tableBusy()
    const after = tablesDb.update(id, {
      code,
      areaId: input.areaId,
      capacity: input.capacity,
      shape: input.shape,
      x: input.x,
      y: input.y,
    })!
    auditUpdate('DiningTable', before, after)
    publishPosEvent('tables-changed', { tableIds: [id] })
    return toDiningTableDto(after, new Map(areasDb.all().map((a) => [a.id, a])))
  },

  /** PUT /api/tables/layout: "Lưu sơ đồ" */
  async saveLayout(input: TableLayoutRequest): Promise<void> {
    await mockDelay()
    requirePermission(permissions.tables.update)
    for (const item of input.items) {
      const t = tablesDb.get(item.id)
      if (!t || t.isDeleted) throw notFound('Không tìm thấy bàn')
      const size = tableSize(t.shape)
      if (item.x < 0 || item.y < 0 || item.x + size.w > PosRules.gridCols || item.y + size.h > PosRules.gridRows) {
        throw validation({ x: 'Vị trí bàn nằm ngoài sơ đồ', y: 'Vị trí bàn nằm ngoài sơ đồ' }, `Bàn ${t.code}: vị trí bàn nằm ngoài sơ đồ`)
      }
    }
    mockDb.batch(() => {
      for (const item of input.items) tablesDb.update(item.id, { x: item.x, y: item.y })
    })
    publishPosEvent('tables-changed', { tableIds: input.items.map((i) => i.id) })
  },

  async setTableHidden(id: string, isHidden: boolean): Promise<void> {
    await mockDelay()
    requirePermission(permissions.tables.update)
    const before = tablesDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy bàn')
    if (isHidden && hasGuests(before)) throw tableBusy()
    const after = tablesDb.update(id, { isHidden })!
    auditUpdate('DiningTable', before, after)
    publishPosEvent('tables-changed', { tableIds: [id] })
  },

  async deleteTable(id: string): Promise<void> {
    await mockDelay()
    requirePermission(permissions.tables.delete)
    const before = tablesDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy bàn')
    if (hasGuests(before)) throw tableBusy()
    tablesDb.update(id, { isDeleted: true })
    auditDelete('DiningTable', before)
    publishPosEvent('tables-changed', { tableIds: [id] })
  },

  // ───── Sơ đồ bàn, phục vụ tại bàn (§2.7) ─────
  async floorPlan(): Promise<FloorPlanDto> {
    await mockDelay(100, 250)
    requirePermission(permissions.tables.view)
    const changed = applyNoShows()
    if (changed.length) publishPosEvent('reservations-changed', { reservationIds: changed })
    const ctx = readContext()
    const areas = liveAreas().filter((a) => !a.isHidden)
    const areaOrder = new Map(areas.map((a, i) => [a.id, i]))
    const tables = [...ctx.tables.values()]
      .filter((t) => !t.isDeleted && !t.isHidden && areaOrder.has(t.areaId))
      .sort((a, b) => areaOrder.get(a.areaId)! - areaOrder.get(b.areaId)! || (a.code < b.code ? -1 : 1))
      .map((t) => toTableCard(t, ctx))
    const counts: Record<TableStatus, number> = { Trong: 0, DaDat: 0, DangPhucVu: 0, ChoThanhToan: 0, ChoDon: 0, DaGop: 0 }
    for (const t of tables) counts[t.status]++
    const allTables = liveTables()
    return {
      asOf: new Date(ctx.now).toISOString(),
      areas: areas.map((a) => toAreaDto(a, allTables)),
      tables,
      counts,
      totalTables: tables.length,
    }
  },

  async service(id: string): Promise<TableServiceDto> {
    await mockDelay(100, 250)
    requirePermission(permissions.tables.view, permissions.orders.view)
    const ctx = readContext()
    const viewed = ctx.tables.get(id)
    if (!viewed || viewed.isDeleted) throw notFound('Không tìm thấy bàn')
    const table = viewed.status === 'DaGop' && viewed.mergedIntoTableId ? ctx.tables.get(viewed.mergedIntoTableId)! : viewed
    return {
      table: toTableCard(table, ctx),
      viewedTableId: id,
      orders: openOrdersOfTable(table.id, ctx).map((o) => toOrderDto(o, ctx)),
    }
  },

  /** POST /api/tables/{id}/open (UC-02) */
  async open(id: string, input: OpenTableRequest): Promise<OrderDto> {
    await mockDelay(150, 300)
    const session = requirePermission(permissions.tables.open)
    const existing = input.clientRequestId
      ? ordersDb.find((o) => o.clientRequestId === input.clientRequestId)
      : undefined
    if (existing) return toOrderDto(existing, readContext())
    if (!Number.isInteger(input.guestCount) || input.guestCount < PosRules.minGuests || input.guestCount > PosRules.maxGuests) {
      throw validation({ guestCount: 'Số khách từ 1 đến 50' })
    }
    const table = tablesDb.get(id)
    if (!table || table.isDeleted) throw notFound('Không tìm thấy bàn')
    if (table.status === 'ChoDon') throw bizError('Bàn chưa dọn xong', 'BanChoDon')
    if (table.status !== 'Trong') {
      const ctx = readContext()
      const targetId = table.status === 'DaGop' && table.mergedIntoTableId ? table.mergedIntoTableId : table.id
      const opened = openOrdersOfTable(targetId, ctx)[0]
      throw conflictError(
        `Bàn ${table.code} vừa được mở bởi ${opened?.waiterName ?? 'người khác'}`,
        'BanVuaDuocMo',
        { orderId: opened?.id }
      )
    }
    const now = nowIso()
    const order: OrderRecord = {
      id: newId(),
      code: nextOrderCode(),
      status: 'DangMo',
      version: 1,
      clientRequestId: input.clientRequestId,
      tableId: id,
      guestCount: input.guestCount,
      waiterId: session.user.id,
      waiterName: session.user.fullName,
      openedAt: now,
      batchCount: 0,
      items: [],
      payments: [],
      deposit: 0,
      depositRefund: 0,
      createdAt: now,
    }
    mockDb.batch(() => {
      ordersDb.insert(order)
      tablesDb.update(id, { status: 'DangPhucVu', statusChangedAt: now, version: table.version + 1 })
    })
    auditCreate('Order', { id: order.id, code: order.code, tableCode: table.code, guestCount: order.guestCount })
    publishPosEvent('tables-changed', { tableIds: [id] })
    publishPosEvent('order-changed', { orderId: order.id, tableId: id, version: order.version })
    return toOrderDto(order, readContext())
  },

  /** POST /api/tables/{id}/clear: "Dọn xong" (FR-31) */
  async clear(id: string): Promise<TableCardDto> {
    await mockDelay()
    requirePermission(permissions.tables.open)
    const table = tablesDb.get(id)
    if (!table || table.isDeleted) throw notFound('Không tìm thấy bàn')
    if (table.status !== 'ChoDon') throw bizError('Bàn không ở trạng thái chờ dọn')
    tablesDb.update(id, {
      status: 'Trong',
      mergedIntoTableId: undefined,
      statusChangedAt: nowIso(),
      version: table.version + 1,
    })
    publishPosEvent('tables-changed', { tableIds: [id] })
    const ctx = readContext()
    return toTableCard(ctx.tables.get(id)!, ctx)
  },
}


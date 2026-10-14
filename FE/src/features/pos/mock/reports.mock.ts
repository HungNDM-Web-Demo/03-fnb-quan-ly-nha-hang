import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { requirePermission } from '@/mock/mock-auth'
import { validation } from '@/mock/mock-errors'
import { paginate } from '@/mock/mock-helpers'
import { cancelReasonText } from '../lib/labels'
import { PosRules } from '../lib/pos-rules'
import { isBillable } from '../lib/pricing'
import { addDaysKey, diffDaysKey, vnDateKey, vnParts } from '../lib/vn-time'
import type {
  CancelReason,
  DashboardReport,
  DateRangeQuery,
  KitchenReport,
  KitchenReportQuery,
  KitchenStation,
  RevenueReport,
  RevenueTotals,
  TableReport,
  TableReportQuery,
  TopItemsQuery,
  TopItemsReport,
  VoidedItemRow,
  VoidedItemsQuery,
  VoidedItemsReport,
} from '../types/pos.types'
import { allOrders, areasDb, billingSettings, categoriesDb, menuItemsDb, tablesDb } from './pos.db'
import { isItemLate, isOpenStatus, moneyOf, readContext } from './pos.mappers'
import type { OrderRecord } from './pos.records'

/**
 * Báo cáo (07 §2.16). Doanh thu chỉ tính hóa đơn `DaThanhToan` theo `paidAt` (BR-26).
 * Hợp hai nguồn: kho lịch sử trong bộ nhớ + mock-db hôm nay.
 */

const MIN = 60_000
const round1 = (n: number) => Math.round(n * 10) / 10

function range(query: DateRangeQuery, defaultDays = 30) {
  const today = vnDateKey(Date.now())
  const to = query.to || today
  const from = query.from || addDaysKey(to, -(defaultDays - 1))
  if (diffDaysKey(from, to) < 0) throw validation({ to: 'Ngày kết thúc phải sau ngày bắt đầu' })
  const days = diffDaysKey(from, to) + 1
  if (days > PosRules.maxReportDays) throw validation({ from: 'Khoảng ngày tối đa 366 ngày' })
  return { from, to, days, inRange: (iso?: string) => !!iso && (() => { const k = vnDateKey(iso); return k >= from && k <= to })() }
}

const settings = () => billingSettings()

function paidOrders(inRange: (iso?: string) => boolean) {
  return allOrders().filter((o) => o.status === 'DaThanhToan' && inRange(o.paidAt))
}

function totalsOf(orders: OrderRecord[]): RevenueTotals {
  const s = settings()
  let revenue = 0
  let discount = 0
  let serviceCharge = 0
  let vatAmount = 0
  let total = 0
  let guestCount = 0
  for (const o of orders) {
    const m = moneyOf(o, s)
    revenue += m.subtotal - m.discountAmount
    discount += m.discountAmount
    serviceCharge += m.serviceCharge
    vatAmount += m.vatAmount
    total += m.total
    guestCount += o.guestCount
  }
  return {
    revenue,
    orderCount: orders.length,
    guestCount,
    revenuePerGuest: guestCount ? Math.round(revenue / guestCount) : 0,
    discount,
    serviceCharge,
    vatAmount,
    total,
  }
}

export const reportsMock = {
  /** Tổng quan hôm nay (FR-01) */
  async dashboard(): Promise<DashboardReport> {
    await mockDelay()
    requirePermission(permissions.reports.view, permissions.dashboard.view)
    const ctx = readContext()
    const today = vnDateKey(ctx.now)
    const areas = new Map(areasDb.all().map((a) => [a.id, a]))
    const visible = [...ctx.tables.values()].filter((t) => {
      const area = areas.get(t.areaId)
      return !t.isDeleted && !t.isHidden && !!area && !area.isHidden && !area.isDeleted
    })
    const open = ctx.liveOrders.filter(isOpenStatus)
    const paid = allOrders().filter((o) => o.status === 'DaThanhToan' && o.paidAt && vnDateKey(o.paidAt) === today)
    const totals = totalsOf(paid)
    const items = open.flatMap((o) => o.items)
    const doneToday = allOrders()
      .flatMap((o) => o.items)
      .filter((i) => i.station !== 'KhongQuaBep' && i.status !== 'DaHuy' && i.doneAt && i.sentAt && vnDateKey(i.doneAt) === today)
    const avg = doneToday.length
      ? round1(
          doneToday.reduce((s, i) => s + (new Date(i.doneAt!).getTime() - new Date(i.sentAt!).getTime()) / MIN, 0) /
            doneToday.length
        )
      : undefined
    const byTable = new Map<string, OrderRecord[]>()
    for (const o of open) byTable.set(o.tableId, [...(byTable.get(o.tableId) ?? []), o])
    const s = settings()
    const longest = [...byTable.entries()]
      .map(([tableId, orders]) => {
        const first = [...orders].sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))[0]
        const table = ctx.tables.get(tableId)
        return {
          tableId,
          tableCode: table?.code ?? '',
          areaName: table ? (areas.get(table.areaId)?.name ?? '') : '',
          orderId: first.id,
          openedAt: first.openedAt,
          minutesSeated: Math.max(0, Math.floor((ctx.now - new Date(first.openedAt).getTime()) / MIN)),
          guestCount: orders.reduce((sum, o) => sum + o.guestCount, 0),
          subtotal: orders.reduce((sum, o) => sum + moneyOf(o, s).subtotal, 0),
        }
      })
      .sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))
      .slice(0, 5)
    return {
      date: today,
      asOf: new Date(ctx.now).toISOString(),
      servingTables: visible.filter((t) => ['DangPhucVu', 'ChoThanhToan', 'DaGop'].includes(t.status)).length,
      totalTables: visible.length,
      guestsSeated: open.reduce((sum, o) => sum + o.guestCount, 0),
      revenue: totals.revenue,
      paidOrderCount: totals.orderCount,
      paidGuestCount: totals.guestCount,
      revenuePerGuest: totals.revenuePerGuest,
      pendingItems: items.filter((i) => i.status === 'ChoLam' || i.status === 'DangLam').length,
      lateItems: items.filter((i) => isItemLate(i, ctx.now)).length,
      avgPrepMinutes: avg,
      longestTables: longest,
    }
  },

  /** Doanh thu theo ngày, so kỳ liền trước (FR-37) */
  async revenue(query: DateRangeQuery): Promise<RevenueReport> {
    await mockDelay(200, 400)
    requirePermission(permissions.reports.view)
    const r = range(query)
    const prevTo = addDaysKey(r.from, -1)
    const prevFrom = addDaysKey(prevTo, -(r.days - 1))
    const all = allOrders().filter((o) => o.status === 'DaThanhToan' && o.paidAt)
    const byDay = new Map<string, OrderRecord[]>()
    for (const o of all) {
      const key = vnDateKey(o.paidAt!)
      if (key < prevFrom || key > r.to) continue
      byDay.set(key, [...(byDay.get(key) ?? []), o])
    }
    const collect = (from: string, days: number) =>
      Array.from({ length: days }, (_, i) => byDay.get(addDaysKey(from, i)) ?? []).flat()
    const totals = totalsOf(collect(r.from, r.days))
    const previous = totalsOf(collect(prevFrom, r.days))
    const daily = Array.from({ length: r.days }, (_, i) => {
      const date = addDaysKey(r.from, i)
      return {
        ...totalsOf(byDay.get(date) ?? []),
        date,
        previousRevenue: totalsOf(byDay.get(addDaysKey(prevFrom, i)) ?? []).revenue,
      }
    })
    return {
      from: r.from,
      to: r.to,
      totals,
      previous: { ...previous, from: prevFrom, to: prevTo },
      revenueChangePercent: previous.revenue ? round1(((totals.revenue - previous.revenue) / previous.revenue) * 100) : undefined,
      daily,
    }
  },

  /** Món bán chạy (FR-38) */
  async topItems(query: TopItemsQuery): Promise<TopItemsReport> {
    await mockDelay(200, 400)
    requirePermission(permissions.reports.view)
    const r = range(query)
    const menus = new Map(menuItemsDb.all().map((m) => [m.id, m]))
    const categories = new Map(categoriesDb.all().map((c) => [c.id, c]))
    const map = new Map<string, TopItemsReport['items'][number]>()
    for (const o of paidOrders(r.inRange)) {
      for (const item of o.items) {
        if (!isBillable(item.status)) continue
        const menu = menus.get(item.menuItemId)
        const categoryId = menu?.categoryId ?? ''
        if (query.categoryId && categoryId !== query.categoryId) continue
        let entry = map.get(item.menuItemId)
        if (!entry) {
          entry = {
            menuItemId: item.menuItemId,
            code: item.itemCode,
            name: menu?.name ?? item.itemName,
            categoryId,
            categoryName: categories.get(categoryId)?.name ?? '',
            unit: item.unit,
            quantity: 0,
            revenue: 0,
            share: 0,
          }
          map.set(item.menuItemId, entry)
        }
        entry.quantity = Math.round((entry.quantity + item.quantity) * 1000) / 1000
        entry.revenue += item.lineTotal
      }
    }
    const items = [...map.values()]
    const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
    for (const i of items) i.share = totalRevenue ? round1((i.revenue / totalRevenue) * 100) : 0
    const key = query.sortBy === 'revenue' ? 'revenue' : 'quantity'
    items.sort((a, b) => b[key] - a[key] || b.revenue - a.revenue)
    return { totalRevenue, items: items.slice(0, Number(query.limit) || 20) }
  },

  /** Món hủy (FR-38, TC-44) */
  async voidedItems(query: VoidedItemsQuery): Promise<VoidedItemsReport> {
    await mockDelay(200, 400)
    requirePermission(permissions.reports.view)
    const r = range(query)
    const tables = new Map(tablesDb.all().map((t) => [t.id, t]))
    let rows: VoidedItemRow[] = []
    for (const o of allOrders()) {
      for (const item of o.items) {
        if (item.status !== 'DaHuy' || !item.cancel || !r.inRange(item.cancel.cancelledAt)) continue
        rows.push({
          itemId: item.id,
          orderId: o.id,
          orderCode: o.code,
          tableCode: tables.get(o.tableId)?.code ?? '',
          cancelledAt: item.cancel.cancelledAt,
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          value: item.lineTotal,
          reason: item.cancel.reason,
          reasonText: cancelReasonText(item.cancel.reason, item.cancel.note),
          note: item.cancel.note,
          cancelledByName: item.cancel.cancelledByName,
          cancelledByUsername: item.cancel.cancelledByUsername,
          approvedByUsername: item.cancel.approvedByUsername,
          statusAtCancel: item.cancel.statusAtCancel,
        })
      }
    }
    if (query.reason) rows = rows.filter((x) => x.reason === query.reason)
    if (query.userId) {
      const users = new Set(
        allOrders()
          .flatMap((o) => o.items)
          .filter((i) => i.cancel?.cancelledById === query.userId)
          .map((i) => i.id)
      )
      rows = rows.filter((x) => users.has(x.itemId))
    }
    rows.sort((a, b) => (a.cancelledAt < b.cancelledAt ? 1 : -1))
    const reasons: CancelReason[] = ['KhachDoiY', 'GoiNham', 'ChoLau', 'Khac', 'HetMon']
    return {
      totalCount: rows.length,
      totalValue: rows.reduce((s, x) => s + x.value, 0),
      byReason: reasons
        .map((reason) => {
          const list = rows.filter((x) => x.reason === reason)
          return {
            reason,
            reasonText: cancelReasonText(reason),
            count: list.length,
            value: list.reduce((s, x) => s + x.value, 0),
          }
        })
        .filter((x) => x.count > 0),
      page: paginate(rows, { page: query.page, pageSize: query.pageSize ?? 20 }),
    }
  },

  /** Vận hành bếp (FR-39, BR-27) */
  async kitchen(query: KitchenReportQuery): Promise<KitchenReport> {
    await mockDelay(200, 400)
    requirePermission(permissions.reports.view)
    const r = range(query)
    const menus = new Map(menuItemsDb.all().map((m) => [m.id, m]))
    type Row = { menuItemId: string; code: string; name: string; station: KitchenStation; prep: number; minutes: number; late: boolean; hour: number }
    const rows: Row[] = []
    for (const o of allOrders()) {
      for (const item of o.items) {
        if (item.station === 'KhongQuaBep' || item.status === 'DaHuy' || !item.doneAt || !item.sentAt) continue
        if (!r.inRange(item.sentAt)) continue
        if (query.station && item.station !== query.station) continue
        const minutes = (new Date(item.doneAt).getTime() - new Date(item.sentAt).getTime()) / MIN
        const prep = item.prepMinutes ?? 15
        rows.push({
          menuItemId: item.menuItemId,
          code: item.itemCode,
          name: menus.get(item.menuItemId)?.name ?? item.itemName,
          station: item.station,
          prep,
          minutes,
          late: minutes >= prep,
          hour: vnParts(item.sentAt).hour,
        })
      }
    }
    const agg = (list: Row[]) => {
      const lateCount = list.filter((x) => x.late).length
      return {
        itemCount: list.length,
        avgMinutes: list.length ? round1(list.reduce((s, x) => s + x.minutes, 0) / list.length) : 0,
        lateCount,
        lateRate: list.length ? round1((lateCount / list.length) * 100) : 0,
      }
    }
    const stations: KitchenStation[] = ['BepNong', 'BepNguoi', 'QuayBar']
    const byItemMap = new Map<string, Row[]>()
    for (const row of rows) byItemMap.set(row.menuItemId, [...(byItemMap.get(row.menuItemId) ?? []), row])
    return {
      totals: agg(rows),
      byStation: stations
        .filter((s) => !query.station || s === query.station)
        .map((station) => ({ station, ...agg(rows.filter((x) => x.station === station)) })),
      byItem: [...byItemMap.values()]
        .map((list) => {
          const a = agg(list)
          return {
            menuItemId: list[0].menuItemId,
            code: list[0].code,
            name: list[0].name,
            station: list[0].station,
            prepMinutes: menus.get(list[0].menuItemId)?.prepMinutes ?? list[0].prep,
            itemCount: a.itemCount,
            avgMinutes: a.avgMinutes,
            lateRate: a.lateRate,
          }
        })
        .sort((a, b) => b.avgMinutes - a.avgMinutes),
      byHour: Array.from({ length: 13 }, (_, i) => i + 10).map((hour) => {
        const a = agg(rows.filter((x) => x.hour === hour))
        return { hour, itemCount: a.itemCount, lateCount: a.lateCount, lateRate: a.lateRate }
      }),
    }
  },

  /** Khu vực và bàn (FR-40) */
  async tables(query: TableReportQuery): Promise<TableReport> {
    await mockDelay(200, 400)
    requirePermission(permissions.reports.view)
    const r = range(query)
    const s = settings()
    const areas = areasDb.filter((a) => !a.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder)
    const areaById = new Map(areas.map((a) => [a.id, a]))
    const tables = tablesDb
      .filter((t) => !t.isDeleted && areaById.has(t.areaId) && (!query.areaId || t.areaId === query.areaId))
      .sort((a, b) => (a.code < b.code ? -1 : 1))
    const paid = paidOrders(r.inRange)
    const stat = (tableId: string) => {
      const orders = paid.filter((o) => o.tableId === tableId)
      const sessions = orders.filter((o) => !o.splitFromOrderId)
      return {
        revenue: orders.reduce((sum, o) => {
          const m = moneyOf(o, s)
          return sum + m.subtotal - m.discountAmount
        }, 0),
        sessions: sessions.length,
        seatMinutes: sessions.map((o) => (new Date(o.paidAt!).getTime() - new Date(o.openedAt).getTime()) / MIN),
      }
    }
    const tableStats = tables.map((t) => ({ table: t, ...stat(t.id) }))
    const avg = (list: number[]) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : 0)
    return {
      days: r.days,
      byArea: areas
        .filter((a) => !query.areaId || a.id === query.areaId)
        .map((a) => {
          const list = tableStats.filter((x) => x.table.areaId === a.id)
          const sessions = list.reduce((sum, x) => sum + x.sessions, 0)
          const used = list.filter((x) => x.sessions > 0).length
          return {
            areaId: a.id,
            areaName: a.name,
            tableCount: list.length,
            revenue: list.reduce((sum, x) => sum + x.revenue, 0),
            sessions,
            turnover: used ? round1(sessions / used / r.days) : 0,
            avgSeatMinutes: avg(list.flatMap((x) => x.seatMinutes)),
          }
        }),
      byTable: tableStats.map((x) => ({
        tableId: x.table.id,
        tableCode: x.table.code,
        areaName: areaById.get(x.table.areaId)?.name ?? '',
        capacity: x.table.capacity,
        revenue: x.revenue,
        sessions: x.sessions,
        turnover: round1(x.sessions / r.days),
        avgSeatMinutes: avg(x.seatMinutes),
      })),
    }
  },
}

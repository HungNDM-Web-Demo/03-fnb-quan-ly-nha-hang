import demoData from '@/mock/seed/demo-data.json'
import { mockDb } from '@/mock/mock-db'
import { getSettingsMap, syncSeedEntries } from '@/mock/system-data'
import { vnDateKey, vnYyMMdd } from '../lib/vn-time'
import type {
  AreaRecord,
  CategoryRecord,
  MenuItemRecord,
  MetaRecord,
  OrderRecord,
  QuickNoteRecord,
  ReservationRecord,
  TableRecord,
  TicketRecord,
} from './pos.records'
import { buildSeedBundle, type SeedBundle } from './pos.seed'

/**
 * Kho dữ liệu nghiệp vụ ở chế độ mock (07 §4 "Mock"):
 * - mock-db (localStorage) chỉ giữ dữ liệu nhỏ: khu vực, bàn, thực đơn, đặt bàn, hóa đơn và phiếu bếp
 *   HÔM NAY (`liveOrders`, hóa đơn `d: 0`) cùng mọi thứ tạo trong phiên demo.
 * - Hóa đơn, phiếu bếp TRƯỚC HÔM NAY là dữ liệu chỉ đọc, dựng lại từ seed trong bộ nhớ mỗi lần tải
 *   trang theo cùng mốc nạp (`pos-meta.seededAt`), không ghi localStorage (giới hạn ~5 MB).
 * Đặt lại dữ liệu xóa mock-db, mốc nạp mới làm kho lịch sử dựng lại.
 */

mockDb.registerSeed('demo-data', demoData)

const META_ID = 'meta'

export const metaDb = mockDb.collection<MetaRecord>('pos-meta', () => [
  { id: META_ID, seededAt: new Date().toISOString() },
])

let cachedBundle: { anchor: string; bundle: SeedBundle } | null = null

/** Bộ dữ liệu mẫu theo mốc nạp hiện tại (tính một lần cho mỗi mốc) */
export function seedBundle(): SeedBundle {
  const anchor = metaDb.get(META_ID)?.seededAt ?? new Date().toISOString()
  if (!cachedBundle || cachedBundle.anchor !== anchor) {
    cachedBundle = { anchor, bundle: buildSeedBundle(new Date(anchor).getTime()) }
  }
  return cachedBundle.bundle
}

mockDb.onReset(() => {
  cachedBundle = null
})

export const areasDb = mockDb.collection<AreaRecord>('areas', () => seedBundle().areas)
export const tablesDb = mockDb.collection<TableRecord>('dining-tables', () => seedBundle().tables)
export const categoriesDb = mockDb.collection<CategoryRecord>('categories', () => seedBundle().categories)
export const menuItemsDb = mockDb.collection<MenuItemRecord>('menu-items', () => seedBundle().menuItems)
export const quickNotesDb = mockDb.collection<QuickNoteRecord>('quick-notes', () => seedBundle().quickNotes)
export const ordersDb = mockDb.collection<OrderRecord>('orders', () => seedBundle().todayOrders)
export const ticketsDb = mockDb.collection<TicketRecord>('kitchen-tickets', () => seedBundle().todayTickets)
export const reservationsDb = mockDb.collection<ReservationRecord>('reservations', () => seedBundle().reservations)

/** Hóa đơn lịch sử (chỉ đọc, trong bộ nhớ) */
export const historyOrders = (): OrderRecord[] => seedBundle().historyOrders
export const historyTickets = (): TicketRecord[] => seedBundle().historyTickets

/** Mọi hóa đơn: lịch sử + mock-db. Bản lịch sử dùng chung, KHÔNG sửa. */
export function allOrders(): OrderRecord[] {
  return [...historyOrders(), ...ordersDb.all()]
}

export function findOrder(id: string): { order: OrderRecord; readonly: boolean } | undefined {
  const live = ordersDb.get(id)
  if (live) return { order: live, readonly: false }
  const past = historyOrders().find((o) => o.id === id)
  return past ? { order: past, readonly: true } : undefined
}

export function findTicket(id: string): TicketRecord | undefined {
  return ticketsDb.get(id) ?? historyTickets().find((t) => t.id === id)
}

// ───────────────────────── Cài đặt tính tiền ─────────────────────────

export type BillingSettings = {
  serviceChargeRate: number
  vatRate: number
  cashierDiscountLimit: number
  openTime: string
  closeTime: string
  bankBin: string
  bankAccount: string
}

export function billingSettings(): BillingSettings {
  syncSeedEntries()
  const s = getSettingsMap()
  const int = (key: string, fallback: number) => {
    const n = Number(s[key])
    return Number.isFinite(n) ? n : fallback
  }
  return {
    serviceChargeRate: int('Billing.ServiceChargeRate', 5),
    vatRate: int('Billing.VatRate', 8),
    cashierDiscountLimit: int('Billing.CashierDiscountLimit', 10),
    openTime: s['Store.OpenTime'] || '10:00',
    closeTime: s['Store.CloseTime'] || '22:00',
    bankBin: s['Store.BankBin'] ?? '',
    bankAccount: s['Store.BankAccount'] ?? '',
  }
}

// ───────────────────────── Mã chứng từ (06 §3) ─────────────────────────

const maxSeq = (codes: string[], prefix: string) =>
  codes.reduce((max, code) => {
    if (!code.startsWith(prefix)) return max
    const n = Number(code.slice(prefix.length))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)

/** HD + yyMMdd + 4 số, nối tiếp số đã có trong hai nguồn */
export function nextOrderCode(at = Date.now()): string {
  const prefix = `HD${vnYyMMdd(at)}`
  const codes = [...historyOrders(), ...ordersDb.all()].map((o) => o.code)
  return `${prefix}${String(maxSeq(codes, prefix) + 1).padStart(4, '0')}`
}

/** #nnn đánh lại mỗi ngày theo ngày giờ Việt Nam */
export function nextTicketNo(at = Date.now()): { businessDate: string; ticketNo: number; code: string } {
  const businessDate = vnDateKey(at)
  const max = [...historyTickets(), ...ticketsDb.all()]
    .filter((t) => t.businessDate === businessDate)
    .reduce((m, t) => Math.max(m, t.ticketNo), 0)
  const ticketNo = max + 1
  return { businessDate, ticketNo, code: `#${String(ticketNo).padStart(3, '0')}` }
}

/** DB + yyMMdd ngày tạo + 3 số */
export function nextReservationCode(at = Date.now()): string {
  const prefix = `DB${vnYyMMdd(at)}`
  return `${prefix}${String(maxSeq(reservationsDb.all().map((r) => r.code), prefix) + 1).padStart(3, '0')}`
}

// ───────────────────────── Món đã từng gọi (BR-28) ─────────────────────────

let historyMenuIds: { anchor: SeedBundle; ids: Set<string> } | null = null

export function everOrderedMenuIds(): Set<string> {
  const bundle = seedBundle()
  if (!historyMenuIds || historyMenuIds.anchor !== bundle) {
    historyMenuIds = {
      anchor: bundle,
      ids: new Set(bundle.historyOrders.flatMap((o) => o.items.map((i) => i.menuItemId))),
    }
  }
  const ids = new Set(historyMenuIds.ids)
  for (const order of ordersDb.all()) for (const item of order.items) ids.add(item.menuItemId)
  return ids
}

export function everUsedTableIds(): Set<string> {
  const ids = new Set(historyOrders().map((o) => o.tableId))
  for (const order of ordersDb.all()) ids.add(order.tableId)
  return ids
}

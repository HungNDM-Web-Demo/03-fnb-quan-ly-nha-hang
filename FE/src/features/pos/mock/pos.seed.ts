import demoData from '@/mock/seed/demo-data.json'
import { stableId } from '@/mock/mock-helpers'
import { systemSeed } from '@/mock/system-seed'
import { userIdOf } from '@/mock/system-data'
import { lineTotal, priceOrder } from '../lib/pricing'
import { buildQrContent } from '../lib/vietqr'
import { addDaysKey, vnAt, vnDateKey, vnParts, vnYyMMdd } from '../lib/vn-time'
import type {
  CancelReason,
  DiscountType,
  KitchenStation,
  OrderItemStatus,
  PaymentMethod,
  PricingType,
  ReservationStatus,
  TableShape,
} from '../types/pos.types'
import type {
  AreaRecord,
  CategoryRecord,
  ItemCancelRecord,
  MenuItemRecord,
  OrderItemRecord,
  OrderRecord,
  PaymentRecord,
  QuickNoteRecord,
  ReservationRecord,
  StoredTableStatus,
  TableRecord,
  TicketRecord,
} from './pos.records'

/**
 * Nạp `src/mock/seed/demo-data.json` (nguồn duy nhất, BE DemoDataSeeder đọc cùng file) theo đúng
 * cách suy ra ở docs/06-THIET-KE-CSDL.md §5. Hàm thuần: cùng mốc nạp cho cùng kết quả, nhờ vậy
 * kho lịch sử dựng lại mỗi lần tải trang vẫn khớp hóa đơn hôm nay đã lưu trong mock-db.
 */

// ───────────────────────── Kiểu JSON ─────────────────────────

type SeedItemExtra = {
  s?: 'ChoLam' | 'DangLam' | 'Xong'
  n?: string
  qn?: string[]
  r?: boolean
  cx?: { r: CancelReason; by: string; ap?: string; st: OrderItemStatus; m: number; nt?: string }
}
type SeedItem = [string, number, (number | null)?, SeedItemExtra?]
type TimeValue = string | number
type SeedBatch = [TimeValue, SeedItem[], { from?: string }?]
type SeedOrder = {
  key?: string
  d?: number
  o: TimeValue
  tb: string
  g: number
  w: string
  rv?: string
  b?: SeedBatch[]
  c?: TimeValue
  cs?: string
  pm?: [Exclude<PaymentMethod, 'TienCoc'>, number | null, (number | string)?][]
  dc?: { type: DiscountType; value: number; reason: string; by?: string }
  cx?: { at: TimeValue; by: string; reason: string }
  mx?: TimeValue
  pb?: number
  cd?: boolean
  mg?: { tb: string; g: number; o: number; w: string; at: number }[]
}
type SeedReservation = {
  key: string
  name: string
  phone: string
  arrival?: string
  arrivalIn?: number
  guests: number
  table: string
  deposit: number
  note?: string
  status: ReservationStatus
  created: string
  cancelled?: { at: string; by: string; reason: string }
}
type SeedPastReservation = {
  key: string
  name: string
  phone: string
  d: number
  t: string
  guests: number
  table: string
  deposit: number
  status: ReservationStatus
  cb: number
  ct: string
  cx?: { t: string; by: string; reason: string }
}
type SeedFile = {
  areas: { code: string; name: string; sortOrder: number }[]
  tables: { code: string; area: string; capacity: number; shape: TableShape; x: number; y: number }[]
  categories: { code: string; name: string; color: string; sortOrder: number }[]
  menuItems: {
    code: string
    name: string
    category: string
    unit: string
    pricing: PricingType
    price: number
    station: KitchenStation
    prepMinutes?: number
    image?: string
    description?: string
    soldOut?: boolean
    hidden?: boolean
    sortOrder: number
  }[]
  quickNotes: { content: string; sortOrder: number }[]
  reservations: SeedReservation[]
  liveOrders: SeedOrder[]
  pastReservations: SeedPastReservation[]
  orders: SeedOrder[]
}

export const seedFile = demoData as unknown as SeedFile

// ───────────────────────── Id cố định ─────────────────────────

export const areaIdOf = (code: string) => stableId('area', code)
export const tableIdOf = (code: string) => stableId('dining-table', code)
export const categoryIdOf = (code: string) => stableId('category', code)
export const menuItemIdOf = (code: string) => stableId('menu-item', code)
export const quickNoteIdOf = (content: string) => stableId('quick-note', content)
export const reservationIdOf = (key: string) => stableId('reservation', key)
export const orderIdOf = (code: string) => stableId('order', code)

/** Ô ngày → số ngày lệch so với hôm nay (06 §5.3, BE cài giống hệt) */
export function dayOffsetOfSlot(d: number, isoToday: number): number {
  if (d >= 0 || d < -84) return d
  const block = Math.floor((-d - 1) / 7)
  const role = (-d - 1) % 7
  const base = -(7 * block + 7)
  const baseIdx = (((isoToday - 1 + base) % 7) + 7) % 7
  return base + ((((role - baseIdx) % 7) + 7) % 7)
}

const SEED_SERVICE_RATE = 5
const SEED_VAT_RATE = 8
const MIN = 60_000
const STATION_ORDER: Record<KitchenStation, number> = { BepNong: 0, BepNguoi: 1, QuayBar: 2, KhongQuaBep: 3 }

const userName = (username: string) =>
  systemSeed.users.find((u) => u.username === username)?.fullName ?? username

export type SeedBundle = {
  now: number
  areas: AreaRecord[]
  tables: TableRecord[]
  categories: CategoryRecord[]
  menuItems: MenuItemRecord[]
  quickNotes: QuickNoteRecord[]
  reservations: ReservationRecord[]
  /** Hóa đơn, phiếu bếp hôm nay (`liveOrders`, hóa đơn `d: 0`) → lưu mock-db */
  todayOrders: OrderRecord[]
  todayTickets: TicketRecord[]
  /** Hóa đơn, phiếu bếp trước hôm nay → kho chỉ đọc trong bộ nhớ (07 §4) */
  historyOrders: OrderRecord[]
  historyTickets: TicketRecord[]
}

/** Dựng toàn bộ dữ liệu mẫu theo mốc nạp `anchor` (ms). */
export function buildSeedBundle(anchor: number): SeedBundle {
  const now = Math.floor(anchor / MIN) * MIN
  const iso = (ms: number) => new Date(ms).toISOString()
  const todayKey = vnDateKey(now)
  const isoToday = vnParts(now).isoWeekday
  const dateOfSlot = (d: number) => addDaysKey(todayKey, dayOffsetOfSlot(d, isoToday))
  const createdAt = iso(now - 90 * 86_400_000)

  // "dayOffset:N@HH:mm" theo giờ Việt Nam
  const parseDayOffset = (value: string): number => {
    const match = /^dayOffset:(-?\d+)@(\d{1,2}:\d{2})$/.exec(value)
    if (!match) return now
    return vnAt(addDaysKey(todayKey, Number(match[1])), match[2])
  }

  // ───── Danh mục, bàn, thực đơn ─────
  const areas: AreaRecord[] = seedFile.areas.map((a) => ({
    id: areaIdOf(a.code),
    code: a.code,
    name: a.name,
    sortOrder: a.sortOrder,
    isHidden: false,
    createdAt,
    updatedAt: createdAt,
  }))
  const tables: TableRecord[] = seedFile.tables.map((t) => ({
    id: tableIdOf(t.code),
    code: t.code,
    areaId: areaIdOf(t.area),
    capacity: t.capacity,
    shape: t.shape,
    x: t.x,
    y: t.y,
    isHidden: false,
    status: 'Trong',
    version: 1,
    createdAt,
  }))
  const tableByCode = new Map(tables.map((t) => [t.code, t]))
  const categories: CategoryRecord[] = seedFile.categories.map((c) => ({
    id: categoryIdOf(c.code),
    code: c.code,
    name: c.name,
    color: c.color,
    sortOrder: c.sortOrder,
    isHidden: false,
    createdAt,
  }))
  const menuItems: MenuItemRecord[] = seedFile.menuItems.map((m) => ({
    id: menuItemIdOf(m.code),
    code: m.code,
    name: m.name,
    categoryId: categoryIdOf(m.category),
    imageUrl: m.image ? `/seed/menu/${m.image}` : undefined,
    description: m.description,
    unit: m.pricing === 'TheoTrongLuong' ? 'kg' : m.unit,
    pricingType: m.pricing,
    price: m.price,
    station: m.station,
    prepMinutes: m.station === 'KhongQuaBep' ? undefined : m.prepMinutes,
    isSoldOut: !!m.soldOut,
    isHidden: !!m.hidden,
    sortOrder: m.sortOrder,
    createdAt,
    updatedAt: createdAt,
  }))
  const menuByCode = new Map(menuItems.map((m) => [m.code, m]))
  const quickNotes: QuickNoteRecord[] = seedFile.quickNotes.map((q) => ({
    id: quickNoteIdOf(q.content),
    content: q.content,
    sortOrder: q.sortOrder,
  }))

  // ───── Đặt bàn ─────
  type RawReservation = Omit<ReservationRecord, 'code'> & { key: string }
  const rawReservations: RawReservation[] = []
  for (const r of seedFile.reservations) {
    const arrival =
      r.arrivalIn !== undefined
        ? Math.floor((now + r.arrivalIn * MIN) / (5 * MIN)) * (5 * MIN)
        : parseDayOffset(r.arrival ?? '')
    rawReservations.push({
      key: r.key,
      id: reservationIdOf(r.key),
      customerName: r.name,
      phone: r.phone,
      arrivalAt: iso(arrival),
      guestCount: r.guests,
      tableId: tableIdOf(r.table),
      note: r.note,
      deposit: r.deposit,
      status: r.status,
      createdAt: iso(parseDayOffset(r.created)),
      ...(r.cancelled
        ? {
            cancelledAt: iso(parseDayOffset(r.cancelled.at)),
            cancelledById: userIdOf(r.cancelled.by),
            cancelledByName: userName(r.cancelled.by),
            cancelReason: r.cancelled.reason,
          }
        : {}),
    })
  }
  for (const r of seedFile.pastReservations) {
    const day = dateOfSlot(r.d)
    rawReservations.push({
      key: r.key,
      id: reservationIdOf(r.key),
      customerName: r.name,
      phone: r.phone,
      arrivalAt: iso(vnAt(day, r.t)),
      guestCount: r.guests,
      tableId: tableIdOf(r.table),
      deposit: r.deposit,
      status: r.status,
      createdAt: iso(vnAt(addDaysKey(day, -r.cb), r.ct)),
      ...(r.cx
        ? {
            cancelledAt: iso(vnAt(addDaysKey(day, -1), r.cx.t)),
            cancelledById: userIdOf(r.cx.by),
            cancelledByName: userName(r.cx.by),
            cancelReason: r.cx.reason,
          }
        : {}),
    })
  }
  // Mã DB + yyMMdd ngày tạo + số thứ tự theo (CreatedAt, key) trong ngày
  const reservationCodes = new Map<string, string>()
  {
    const sorted = [...rawReservations].sort((a, b) =>
      a.createdAt === b.createdAt ? (a.key < b.key ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1
    )
    const seqByDay = new Map<string, number>()
    for (const r of sorted) {
      const day = vnYyMMdd(r.createdAt)
      const seq = (seqByDay.get(day) ?? 0) + 1
      seqByDay.set(day, seq)
      reservationCodes.set(r.key, `DB${day}${String(seq).padStart(3, '0')}`)
    }
  }
  const reservationByKey = new Map(rawReservations.map((r) => [r.key, r]))

  // ───── Hóa đơn: bước 1 dựng thô, bước 2 đánh mã theo ngày, bước 3 món, phiếu, lượt thu ─────
  type Raw = {
    entry: SeedOrder
    source: 'history' | 'today'
    /** Bàn phụ đã gộp: { main, merge } */
    secondary?: { main: Raw; merge: NonNullable<SeedOrder['mg']>[number] }
    openedAt: number
    tableCode: string
    code?: string
    time: (value: TimeValue) => number
  }
  const raws: Raw[] = []
  const pushEntry = (entry: SeedOrder, live: boolean) => {
    const d = live ? 0 : (entry.d ?? 0)
    const day = d === 0 ? todayKey : dateOfSlot(d)
    const time = (value: TimeValue) => (typeof value === 'number' ? now + value * MIN : vnAt(day, value))
    const raw: Raw = {
      entry,
      source: live || d === 0 ? 'today' : 'history',
      openedAt: time(entry.o),
      tableCode: entry.tb,
      time,
    }
    raws.push(raw)
    for (const merge of entry.mg ?? []) {
      raws.push({
        entry: { o: merge.o, tb: merge.tb, g: merge.g, w: merge.w },
        source: raw.source,
        secondary: { main: raw, merge },
        openedAt: time(merge.o),
        tableCode: merge.tb,
        time,
      })
    }
  }
  for (const entry of seedFile.orders) pushEntry(entry, false)
  for (const entry of seedFile.liveOrders) pushEntry(entry, true)

  {
    const byDay = new Map<string, Raw[]>()
    for (const raw of raws) {
      const day = vnYyMMdd(raw.openedAt)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(raw)
    }
    for (const [day, list] of byDay) {
      list.sort((a, b) => a.openedAt - b.openedAt || (a.tableCode < b.tableCode ? -1 : a.tableCode > b.tableCode ? 1 : 0))
      list.forEach((raw, index) => (raw.code = `HD${day}${String(index + 1).padStart(4, '0')}`))
    }
  }

  const orders: { raw: Raw; record: OrderRecord }[] = []
  type RawTicket = Omit<TicketRecord, 'code' | 'ticketNo' | 'businessDate' | 'id'> & {
    orderCode: string
    items: OrderItemRecord[]
    source: Raw['source']
  }
  const rawTickets: RawTicket[] = []
  const orderByRaw = new Map<Raw, OrderRecord>()

  // Hóa đơn chính trước để bàn phụ biết id hóa đơn chính
  const ordered = [...raws.filter((r) => !r.secondary), ...raws.filter((r) => r.secondary)]
  for (const raw of ordered) {
    const e = raw.entry
    const code = raw.code!
    const id = orderIdOf(code)
    const table = tableByCode.get(e.tb)!
    const record: OrderRecord = {
      id,
      code,
      status: 'DangMo',
      version: 1,
      tableId: table.id,
      guestCount: e.g,
      waiterId: userIdOf(e.w),
      waiterName: userName(e.w),
      openedAt: iso(raw.openedAt),
      batchCount: 0,
      items: [],
      payments: [],
      deposit: 0,
      depositRefund: 0,
      createdAt: iso(raw.openedAt),
    }
    orderByRaw.set(raw, record)
    orders.push({ raw, record })

    if (raw.secondary) {
      const main = orderByRaw.get(raw.secondary.main)!
      record.status = 'DaGop'
      record.mergedIntoOrderId = main.id
      record.mergedAt = iso(raw.time(raw.secondary.merge.at))
      record.batchCount = (raw.secondary.main.entry.b ?? []).filter(([, , ex]) => ex?.from === e.tb).length
      continue
    }

    if (e.rv) {
      const rv = reservationByKey.get(e.rv)
      if (rv) {
        record.reservationId = rv.id
        record.deposit = rv.deposit
        record.note = rv.note
        rv.orderId = id
        rv.checkedInAt = record.openedAt
      }
    }

    if (e.mx !== undefined) {
      record.status = 'DaHuy'
      record.cancelReason = 'Mở nhầm'
      record.cancelledAt = iso(raw.time(e.mx))
      record.cancelledById = userIdOf(e.w)
      record.cancelledByUsername = e.w
      continue
    }

    // Món theo lần gọi
    let sort = 0
    let mainBatch = 0
    const fromBatchCount = new Map<string, number>()
    for (const [t, items, extra] of e.b ?? []) {
      const sentAt = raw.time(t)
      const from = extra?.from
      let batchNo: number
      if (from) {
        batchNo = (fromBatchCount.get(from) ?? 0) + 1
        fromBatchCount.set(from, batchNo)
      } else {
        batchNo = ++mainBatch
      }
      const batchItems: OrderItemRecord[] = []
      for (const [itemCode, qty, prep, ex] of items) {
        const m = menuByCode.get(itemCode)!
        const kitchen = m.station !== 'KhongQuaBep'
        const cx = ex?.cx
        const status: OrderItemStatus = cx ? 'DaHuy' : (ex?.s ?? 'DaPhucVu')
        const effective: OrderItemStatus = cx ? cx.st : status
        const item: OrderItemRecord = {
          id: stableId('order-item', code, sort),
          menuItemId: m.id,
          itemCode: m.code,
          itemName: m.name,
          unit: m.unit,
          pricingType: m.pricingType,
          station: m.station,
          unitPrice: m.price,
          quantity: qty,
          lineTotal: lineTotal(m.pricingType, m.price, qty),
          note: ex?.n,
          quickNotes: ex?.qn ?? [],
          isRush: !!ex?.r,
          status,
          batchNo,
          prepMinutes: kitchen ? m.prepMinutes : undefined,
          sentAt: iso(sentAt),
          sortOrder: sort++,
        }
        if (!kitchen) {
          item.doneAt = item.sentAt
          if (effective === 'DaPhucVu') item.servedAt = iso(sentAt + 2 * MIN)
        } else {
          if (['DangLam', 'Xong', 'DaPhucVu'].includes(effective)) item.startedAt = iso(sentAt + MIN)
          if (prep !== null && prep !== undefined) {
            item.doneAt = iso(sentAt + prep * MIN)
            if (effective === 'DaPhucVu') item.servedAt = iso(sentAt + (prep + 2) * MIN)
          }
        }
        if (cx) {
          const cancelledAt = sentAt + cx.m * MIN
          const cancel: ItemCancelRecord = {
            reason: cx.r,
            note: cx.nt,
            cancelledAt: iso(cancelledAt),
            cancelledById: userIdOf(cx.by),
            cancelledByName: userName(cx.by),
            cancelledByUsername: cx.by,
            approvedById: cx.ap ? userIdOf(cx.ap) : undefined,
            approvedByUsername: cx.ap,
            statusAtCancel: cx.st,
            acknowledgedAt: iso(kitchen ? cancelledAt + MIN : cancelledAt),
          }
          item.cancel = cancel
        }
        batchItems.push(item)
        record.items.push(item)
      }
      // Phiếu bếp: mỗi khu chế biến có món trong lần gọi
      const fromRaw = from ? raws.find((r) => r.secondary?.main === raw && r.secondary.merge.tb === from) : undefined
      const stations = [...new Set(batchItems.map((i) => i.station))].filter(
        (s): s is Exclude<KitchenStation, 'KhongQuaBep'> => s !== 'KhongQuaBep'
      )
      for (const station of stations) {
        const ticketItems = batchItems.filter((i) => i.station === station)
        const waiter = from ? (raw.entry.mg?.find((x) => x.tb === from)?.w ?? e.w) : e.w
        rawTickets.push({
          orderId: fromRaw ? orderIdOf(fromRaw.code!) : id,
          orderCode: fromRaw ? fromRaw.code! : code,
          station,
          batchNo,
          tableId: table.id,
          tableCode: table.code,
          originalTableCode: from ?? table.code,
          waiterId: userIdOf(waiter),
          waiterName: userName(waiter),
          sentAt: iso(sentAt),
          status: 'DangCho',
          items: ticketItems,
          source: raw.source,
        })
      }
    }
    record.batchCount = mainBatch

    // Tiền, lượt thu
    if (e.dc) {
      record.discount = {
        type: e.dc.type,
        value: e.dc.value,
        reason: e.dc.reason,
        approvedById: e.dc.by ? userIdOf(e.dc.by) : undefined,
        approvedByUsername: e.dc.by,
      }
    }
    if (e.pb !== undefined) record.prebillPrintedAt = iso(now + e.pb * MIN)
    if (e.c === undefined && record.deposit > 0) {
      // Hóa đơn đang mở nhận bàn có cọc: lượt "Tiền cọc" tạo lúc nhận bàn (06 §5.4 bước 6)
      record.payments.push({ id: stableId('payment', code, 0), method: 'TienCoc', amount: record.deposit, paidAt: record.openedAt })
    }
    if (e.c !== undefined) {
      record.serviceChargeRate = SEED_SERVICE_RATE
      record.vatRate = SEED_VAT_RATE
      const totals = priceOrder({
        lines: record.items,
        discount: record.discount,
        serviceChargeRate: SEED_SERVICE_RATE,
        vatRate: SEED_VAT_RATE,
      })
      const paidAt = raw.time(e.c)
      let paid = 0
      let index = 0
      const payments: PaymentRecord[] = []
      if (record.deposit > 0) {
        const amount = Math.min(record.deposit, totals.total)
        record.depositRefund = Math.max(0, record.deposit - totals.total)
        payments.push({
          id: stableId('payment', code, index++),
          method: 'TienCoc',
          amount,
          paidAt: record.openedAt,
        })
        paid += amount
      }
      const pm = e.pm ?? []
      pm.forEach(([method, amountValue, extra], i) => {
        const amount = amountValue ?? Math.max(0, totals.total - paid)
        paid += amount
        const payment: PaymentRecord = {
          id: stableId('payment', code, index++),
          method,
          amount,
          paidAt: iso(paidAt - (pm.length - 1 - i) * MIN),
          cashierId: e.cs ? userIdOf(e.cs) : undefined,
          cashierName: e.cs ? userName(e.cs) : undefined,
        }
        if (method === 'TienMat') {
          const cash = typeof extra === 'number' ? extra : amount
          payment.cashReceived = cash
          payment.changeAmount = cash - amount
        } else if (method === 'The') {
          payment.cardLast4 = typeof extra === 'string' ? extra : '0000'
        } else if (method === 'ChuyenKhoan') {
          const bin = systemSeed.settings.find((s) => s.key === 'Store.BankBin')?.value ?? ''
          const account = systemSeed.settings.find((s) => s.key === 'Store.BankAccount')?.value ?? ''
          payment.qrContent = buildQrContent({ bankBin: bin, bankAccount: account, amount, orderCode: code })
        }
        payments.push(payment)
      })
      record.payments = payments
      record.status = 'DaThanhToan'
      record.paidAt = iso(paidAt)
      record.cashierId = e.cs ? userIdOf(e.cs) : undefined
      record.cashierName = e.cs ? userName(e.cs) : undefined
      if (e.cx) {
        record.status = 'DaHuy'
        record.cancelledAt = iso(raw.time(e.cx.at))
        record.cancelledById = userIdOf(e.cx.by)
        record.cancelledByUsername = e.cx.by
        record.cancelReason = e.cx.reason
      }
    }
  }

  // Phiếu bếp: trạng thái, số phiếu theo ngày (SentAt, mã hóa đơn, khu chế biến)
  const tickets: { ticket: TicketRecord; source: Raw['source'] }[] = []
  {
    const byDay = new Map<string, RawTicket[]>()
    for (const t of rawTickets) {
      const day = vnDateKey(t.sentAt)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(t)
    }
    for (const [day, list] of byDay) {
      list.sort(
        (a, b) =>
          (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0) ||
          (a.orderCode < b.orderCode ? -1 : a.orderCode > b.orderCode ? 1 : 0) ||
          STATION_ORDER[a.station] - STATION_ORDER[b.station]
      )
      list.forEach((raw, index) => {
        const ticketNo = index + 1
        const id = stableId('ticket', day, ticketNo)
        const pending = raw.items.some(
          (i) => i.status === 'ChoLam' || i.status === 'DangLam' || (i.status === 'DaHuy' && !i.cancel?.acknowledgedAt)
        )
        let completedAt: string | undefined
        if (!pending) {
          completedAt = raw.items
            .map((i) => (i.status === 'DaHuy' ? i.cancel?.acknowledgedAt : i.doneAt) ?? raw.sentAt)
            .sort()
            .at(-1)
        }
        for (const item of raw.items) item.kitchenTicketId = id
        const { items: _items, orderCode: _code, source, ...rest } = raw
        void _items
        void _code
        tickets.push({
          ticket: {
            ...rest,
            id,
            code: `#${String(ticketNo).padStart(3, '0')}`,
            businessDate: day,
            ticketNo,
            status: pending ? 'DangCho' : 'DaXong',
            completedAt,
          },
          source,
        })
      })
    }
  }

  // Trạng thái bàn lúc nạp (06 §5.4 bước 8)
  for (const { raw, record } of orders) {
    if (raw.source !== 'today' || raw.secondary) continue
    const e = raw.entry
    const table = tableByCode.get(e.tb)!
    const isLive = seedFile.liveOrders.includes(e)
    if (!isLive) continue
    let status: StoredTableStatus | undefined
    let changedAt = record.openedAt
    if (record.status === 'DangMo') {
      status = record.prebillPrintedAt ? 'ChoThanhToan' : 'DangPhucVu'
      changedAt = record.prebillPrintedAt ?? record.openedAt
    } else if (record.status === 'DaThanhToan' && e.cd) {
      status = 'ChoDon'
      changedAt = record.paidAt!
    }
    if (status) {
      table.status = status
      table.statusChangedAt = changedAt
    }
    for (const merge of e.mg ?? []) {
      const sub = tableByCode.get(merge.tb)!
      sub.status = status === 'ChoDon' ? 'ChoDon' : 'DaGop'
      sub.mergedIntoTableId = table.id
      sub.statusChangedAt = iso(raw.time(merge.at))
    }
  }

  const reservations: ReservationRecord[] = rawReservations.map(({ key, ...r }) => ({
    ...r,
    code: reservationCodes.get(key)!,
  }))

  return {
    now,
    areas,
    tables,
    categories,
    menuItems,
    quickNotes,
    reservations,
    todayOrders: orders.filter((o) => o.raw.source === 'today').map((o) => o.record),
    todayTickets: tickets.filter((t) => t.source === 'today').map((t) => t.ticket),
    historyOrders: orders.filter((o) => o.raw.source === 'history').map((o) => o.record),
    historyTickets: tickets.filter((t) => t.source === 'history').map((t) => t.ticket),
  }
}

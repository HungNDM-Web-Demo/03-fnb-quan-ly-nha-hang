// Sinh hóa đơn 90 ngày (orders) và đặt bàn đã qua (pastReservations) cho src/mock/seed/demo-data.json.
// Xác định: bộ sinh số ngẫu nhiên có hạt giống cố định, chạy lại cho đúng kết quả cũ.
// Giữ nguyên phần viết tay (areas, tables, categories, menuItems, quickNotes, reservations, liveOrders),
// chỉ ghi đè pastReservations và orders.
// Khóa gọn của hóa đơn, cách suy ra trường, ánh xạ thứ trong tuần: docs/06-THIET-KE-CSDL.md §5.
// Tiền không ghi vào file: seeder và FE mock tính lại theo docs/07-DANH-SACH-API.md §3 (script tính
// cùng công thức để in số đối chiếu).
// Chạy: pnpm seed:orders  (hoặc node scripts/generate-orders.mjs)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mock', 'seed', 'demo-data.json')
const data = JSON.parse(readFileSync(file, 'utf8'))

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261014)
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
function weighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [value, w] of entries) {
    r -= w
    if (r < 0) return value
  }
  return entries[entries.length - 1][0]
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ---------- Công thức tiền (docs/07 §3) ----------
const round1000 = (x) => Math.floor((x + 500) / 1000) * 1000 // làm tròn tới 1.000 gần nhất, 500 lên
const floor1000 = (x) => Math.floor(x / 1000) * 1000
const roundHalfUp = (x) => Math.floor(x + 0.5)
const RATE_SERVICE = 5
const RATE_VAT = 8
const itemByCode = new Map(data.menuItems.map((m) => [m.code, m]))
function lineTotal(code, qty) {
  const m = itemByCode.get(code)
  if (m.pricing === 'TheoTrongLuong') return round1000((m.price * Math.round(qty * 1000)) / 1000)
  return m.price * qty
}
function price(order) {
  // order.lines: [{ code, qty, cancelled }]
  const subtotal = order.lines.filter((l) => !l.cancelled).reduce((s, l) => s + lineTotal(l.code, l.qty), 0)
  let discount = 0
  if (order.dc) {
    discount = order.dc.type === 'PhanTram' ? floor1000((subtotal * order.dc.value) / 100) : Math.min(order.dc.value, subtotal)
  }
  const base = subtotal - discount
  const service = roundHalfUp((base * RATE_SERVICE) / 100)
  const vat = roundHalfUp(((base + service) * RATE_VAT) / 100)
  const gross = base + service + vat
  const total = round1000(gross)
  return { subtotal, discount, service, vat, rounding: total - gross, total }
}

// ---------- Kiểm tra ràng buộc test (docs/05 §1) trước khi sinh ----------
const tableByCode = new Map(data.tables.map((t) => [t.code, t]))
const item = (code) => itemByCode.get(code)
const checks = [
  [data.areas.length === 3, '3 khu vực'],
  [data.tables.length === 30, '30 bàn'],
  [data.menuItems.length === 60, '60 món'],
  [new Set(data.menuItems.map((m) => m.code)).size === 60 && !itemByCode.has('M061'), 'mã món không trùng, M061 chưa có'],
  [!tableByCode.has('SV-09') && !tableByCode.has('T1-13'), 'SV-09, T1-13 chưa có'],
  [item('M008')?.name === 'Gỏi ngó sen tôm thịt' && item('M008').price === 125000 && item('M008').station === 'BepNguoi' && item('M008').prepMinutes === 10, 'M008 Gỏi ngó sen'],
  [item('M021')?.name === 'Bò lúc lắc khoai tây' && item('M021').price === 185000 && item('M021').station === 'BepNong' && item('M021').prepMinutes === 15, 'M021 Bò lúc lắc'],
  [item('M014')?.name === 'Cá chẽm hấp Hồng Kông' && item('M014').price === 450000 && item('M014').pricing === 'TheoTrongLuong' && item('M014').prepMinutes === 20, 'M014 Cá chẽm'],
  [item('M039')?.name === 'Rau muống xào tỏi' && item('M039').price === 65000 && item('M039').prepMinutes === 8, 'M039 Rau muống'],
  [item('M028')?.name === 'Lẩu thái hải sản' && item('M028').price === 365000 && item('M028').prepMinutes === 15, 'M028 Lẩu thái'],
  [item('M048')?.name === 'Nước ép cam' && item('M048').price === 45000 && item('M048').station === 'QuayBar' && item('M048').prepMinutes === 5, 'M048 Nước ép cam'],
  [item('M055')?.name === 'Bia Tiger lon' && item('M055').price === 25000 && item('M055').station === 'KhongQuaBep', 'M055 Bia Tiger'],
  [data.categories.some((c) => c.name === 'Hải sản'), 'có danh mục Hải sản'],
  [tableByCode.get('T1-05')?.capacity === 4 && tableByCode.get('T1-06')?.capacity === 4 && tableByCode.get('T1-10')?.capacity === 4 && tableByCode.get('T2-01')?.capacity === 10, 'sức chứa T1-05, T1-06, T1-10 = 4; T2-01 = 10'],
  [data.menuItems.every((m) => m.price > 0 && m.price % 1000 === 0), 'giá bội số 1.000'],
  [data.menuItems.every((m) => (m.station === 'KhongQuaBep' ? m.prepMinutes == null : m.prepMinutes >= 1 && m.prepMinutes <= 120)), 'thời gian chuẩn 1–120, không qua bếp để trống'],
  [data.menuItems.every((m) => data.categories.some((c) => c.code === m.category)), 'danh mục của món tồn tại'],
  [data.tables.every((t) => t.capacity >= 1 && t.capacity <= 20 && t.code.startsWith(t.area + '-')), 'bàn: sức chứa 1–20, mã theo khu vực'],
  [round1000((450000 * 1200) / 1000) === 540000, 'Cá chẽm 1,2 kg = 540.000'],
]
// Đơn chuẩn T1-05 (05 §1) và các số test tính sẵn
const std = { lines: [{ code: 'M008', qty: 1 }, { code: 'M021', qty: 1 }, { code: 'M014', qty: 1.2 }, { code: 'M039', qty: 1 }, { code: 'M055', qty: 6 }] }
const p0 = price(std)
checks.push([p0.subtotal === 1065000 && p0.service === 53250 && p0.vat === 89460 && p0.rounding === 290 && p0.total === 1208000, 'Đơn chuẩn: 1.065.000 / 53.250 / 89.460 / +290 / 1.208.000'])
const p37 = price({ ...std, dc: { type: 'PhanTram', value: 10 } })
checks.push([p37.discount === 106000 && p37.service === 47950 && p37.vat === 80556 && p37.rounding === 494 && p37.total === 1088000, 'TC-37'])
const p38 = price({ ...std, dc: { type: 'PhanTram', value: 15 } })
checks.push([p38.discount === 159000 && p38.service === 45300 && p38.vat === 76104 && p38.rounding === -404 && p38.total === 1027000, 'TC-38'])
const p29 = price({ lines: [...std.lines, { code: 'M048', qty: 2 }] })
checks.push([p29.total === 1310000 && p29.service === 57750 && p29.vat === 97020 && p29.rounding === 230, 'TC-29'])
const p30a = price({ lines: [{ code: 'M014', qty: 1.2 }, { code: 'M055', qty: 2 }] })
const p30b = price({ lines: [{ code: 'M008', qty: 1 }, { code: 'M021', qty: 1 }, { code: 'M039', qty: 1 }, { code: 'M055', qty: 4 }] })
checks.push([p30a.total === 669000 && p30a.rounding === -60 && p30a.vat === 49560 && p30b.total === 539000 && p30b.rounding === 350 && p30b.vat === 39900, 'TC-30'])
const share = floor1000(1208000 / 3)
checks.push([share === 402000 && 1208000 - 2 * share === 404000, 'TC-32 chia đều 404.000 / 402.000 / 402.000'])
const p42 = price({ lines: [{ code: 'M028', qty: 2 }] })
checks.push([p42.total === 828000, 'TC-42 tổng 828.000'])
const rv01 = data.reservations.find((r) => r.key === 'RV01')
checks.push([rv01?.name === 'Trần Minh Quân' && rv01.phone === '0903456789' && rv01.arrival === 'dayOffset:0@19:00' && rv01.guests === 8 && rv01.table === 'T2-01' && rv01.deposit === 500000 && rv01.status === 'ChoDen', 'Đặt bàn anh Trần Minh Quân'])
checks.push([!data.reservations.some((r) => r.table === 'T2-01' && r.arrival?.startsWith('dayOffset:1@')), 'T2-01 ngày mai chưa có đặt bàn (TC-41)'])

// Trạng thái lúc nạp của liveOrders (NFR-07, TC-17, TC-26…)
const live = data.liveOrders
const liveByTable = new Map(live.map((o) => [o.tb, o]))
const isOpen = (o) => o.c == null
const kitchenItems = (o) => o.b.flatMap(([t, items]) => items.map(([code, qty, prep, ex]) => ({ code, qty, prep, sent: t, s: ex?.s ?? 'DaPhucVu' })))
function lateItems(o) {
  return kitchenItems(o).filter((x) => (x.s === 'ChoLam' || x.s === 'DangLam') && -x.sent >= item(x.code).prepMinutes)
}
function timer(o) {
  // màu nặng nhất của các món chờ làm/đang làm theo BR-11
  let level = 0
  for (const x of kitchenItems(o)) {
    if (x.s !== 'ChoLam' && x.s !== 'DangLam') continue
    const r = -x.sent / item(x.code).prepMinutes
    level = Math.max(level, r >= 1 ? 2 : r >= 0.8 ? 1 : 0)
  }
  return level
}
const openLive = live.filter(isOpen)
const servingTables = openLive.length + openLive.reduce((s, o) => s + (o.mg?.length ?? 0), 0)
const lateCount = openLive.reduce((s, o) => s + lateItems(o).length, 0)
const pendingRau = openLive.reduce((s, o) => s + kitchenItems(o).filter((x) => x.code === 'M039' && x.s === 'ChoLam').reduce((a, x) => a + x.qty, 0), 0)
checks.push([servingTables >= 12 && servingTables <= 15, `12–15 bàn đang phục vụ (thực tế ${servingTables})`])
checks.push([lateCount === 2, `2 món trễ lúc nạp (thực tế ${lateCount})`])
checks.push([timer(liveByTable.get('T2-03')) === 2 && timer(liveByTable.get('T2-04')) === 1, 'T2-03 đỏ, T2-04 vàng'])
checks.push([!liveByTable.has('T1-05') && !liveByTable.has('T1-10') && !liveByTable.has('T2-01'), 'T1-05, T1-10, T2-01 trống'])
const t106 = liveByTable.get('T1-06')
checks.push([t106?.g === 2 && kitchenItems(t106).length === 1 && kitchenItems(t106)[0].code === 'M048' && kitchenItems(t106)[0].qty === 2 && kitchenItems(t106)[0].s === 'DaPhucVu', 'T1-06: 2 khách, 2 Nước ép cam đã ra'])
const sv01 = liveByTable.get('SV-01')
const sv01Kitchen = kitchenItems(sv01).filter((x) => item(x.code).station !== 'KhongQuaBep')
checks.push([sv01?.g === 3 && sv01Kitchen.length === 1 && item(sv01Kitchen[0].code).station === 'BepNong' && sv01Kitchen[0].s === 'ChoLam', 'SV-01: 3 khách, 1 phiếu Bếp nóng Chờ làm'])
const t203 = liveByTable.get('T2-03').b.find(([t]) => t === -16)
checks.push([t203 && t203[1].length === 1 && t203[1][0][0] === 'M028' && t203[1][0][3]?.s === 'DangLam', 'T2-03: phiếu Bếp nóng 16 phút, Lẩu thái Đang làm'])
const t204 = kitchenItems(liveByTable.get('T2-04')).filter((x) => item(x.code).station !== 'KhongQuaBep')
checks.push([t204.length === 1 && t204[0].code === 'M021' && t204[0].sent === -13 && t204[0].s === 'ChoLam', 'T2-04: Bò lúc lắc Chờ làm 13 phút'])
checks.push([pendingRau === 5, `5 đĩa Rau muống đang chờ (thực tế ${pendingRau})`])
checks.push([live.every((o) => o.b.every(([, its]) => its.every((i) => !i[3]?.r))), 'không có món Gấp trong bàn đang phục vụ (TC-18)'])
checks.push([live.some((o) => o.mg?.length) && live.some((o) => o.pb != null) && live.some((o) => o.cd), 'có bàn đã gộp, chờ thanh toán, chờ dọn'])
const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  console.error('Dữ liệu viết tay chưa đạt ràng buộc:\n' + failed.map(([, msg]) => ` - ${msg}`).join('\n'))
  process.exit(1)
}

// ---------- Tham số ----------
const SLOTS = 89 // ngày lịch sử d = -89..-1; d = 0 là hôm nay (giờ tương đối theo phút)
const BASE_ORDERS_PER_DAY = 26.4
// Hệ số theo "vai thứ" của ô ngày (1 = Thứ Hai … 7 = Chủ nhật), 0 = ô lẻ không ánh xạ (docs/06 §5.3)
const roleFactor = { 0: 1.0, 1: 0.85, 2: 0.8, 3: 0.85, 4: 0.92, 5: 1.12, 6: 1.45, 7: 1.35 }
const roleOf = (d) => (d <= -1 && d >= -84 ? ((-d - 1) % 7) + 1 : 0)
// Giờ mở bàn, đông 11–13h và 18–21h (NFR-07)
const hourWeights = [[10, 0.3], [11, 2.2], [12, 2.4], [13, 0.8], [14, 0.3], [15, 0.2], [16, 0.25], [17, 0.7], [18, 2.2], [19, 2.6], [20, 1.4], [21, 0.35]]
const isPeak = (min) => (min >= 660 && min < 810) || (min >= 1080 && min < 1260)
const guestWeights = [[1, 4], [2, 26], [3, 14], [4, 24], [5, 8], [6, 10], [7, 4], [8, 5], [9, 2], [10, 3]]
const areaWeight = { T1: 0.45, T2: 0.32, SV: 0.23 }
const areaWaiter = { T1: 'phucvu', T2: 'phucvu2', SV: 'phucvu3' }
const waiters = ['phucvu', 'phucvu2', 'phucvu3']

const foodCodes = data.menuItems.filter((m) => ['KV', 'GO', 'HS', 'TH', 'CO', 'RC'].includes(m.category) && m.code !== 'M034' && m.pricing === 'TheoSuat')
const popularity = { M008: 3, M021: 3, M039: 3.5, M001: 2, M009: 2, M003: 2, M024: 2, M033: 2, M036: 2, M017: 1.8, M025: 1.6, M023: 1.6, M040: 1.6, M005: 1.4, M010: 1.4, M020: 1.3, M041: 1.3 }
const weightCodes = [['M014', 4], ['M019', 3], ['M015', 2.5], ['M016', 1.5]]
const hotpots = [['M028', 4], ['M029', 2.5], ['M030', 2.5], ['M031', 2]]
const beers = [['M055', 4], ['M056', 3], ['M057', 3]]
const softs = [['M048', 3], ['M049', 2], ['M050', 2], ['M051', 2.5], ['M052', 2], ['M053', 1.5], ['M054', 1], ['M058', 2.5], ['M059', 2]]
const desserts = [['M044', 3], ['M045', 2], ['M046', 3], ['M047', 1.5]]
const cancelReasonsWaiter = [['KhachDoiY', 4], ['GoiNham', 3], ['ChoLau', 3]]
const discountChoices = [['P5', 35], ['P10', 30], ['S50', 15], ['P15', 12], ['S200', 8]]
const orderCancelReasons = ['Nhập nhầm', 'Thanh toán trùng', 'Khách đổi phương thức thanh toán']

function prepFor(code, peak) {
  const s = item(code).prepMinutes
  const late = rand() < (peak ? 0.16 : 0.06)
  if (late) return s + randInt(0, Math.max(2, Math.round(s * 0.4)))
  return randInt(Math.max(1, Math.round(s * 0.45)), Math.max(1, s - 1))
}

// Món của một lượt khách → các lượt gọi (batch)
function buildItems(g, allowHidden) {
  const foods = []
  const used = new Set()
  const nFood = g <= 2 ? randInt(2, 3) : g <= 4 ? randInt(3, 5) : g <= 6 ? randInt(4, 6) : randInt(5, 8)
  const pool = foodCodes.filter((m) => (allowHidden || !m.hidden)).map((m) => [m.code, popularity[m.code] ?? 1])
  if (g >= 3 && rand() < 0.45) {
    const hp = weighted(hotpots)
    foods.push([hp, g >= 8 ? 2 : 1])
    used.add(hp)
    if (rand() < 0.4) foods.push(['M032', randInt(1, 2)])
  }
  if (g >= 3 && rand() < 0.25) {
    const w = weighted(weightCodes)
    const kg = w === 'M015' ? randInt(5, 12) / 10 : randInt(6, 20) / 10
    foods.push([w, kg])
    used.add(w)
  }
  while (foods.filter(([c]) => !['M032'].includes(c)).length < nFood) {
    const code = weighted(pool)
    if (used.has(code)) continue
    used.add(code)
    foods.push([code, g >= 6 && rand() < 0.3 ? 2 : 1])
  }
  if (rand() < 0.35) foods.push(['M034', Math.max(1, Math.ceil(g * 0.75))])
  const drinks = []
  if (g >= 2 && rand() < 0.55) {
    drinks.push([weighted(beers), Math.max(2, Math.round(g * (1 + rand() * 1.5)))])
    if (rand() < 0.3) drinks.push([weighted(softs), randInt(1, 2)])
  } else {
    let left = g
    while (left > 0) {
      const q = Math.min(left, randInt(1, 2))
      const code = weighted(softs)
      const existing = drinks.find(([c]) => c === code)
      if (existing) existing[1] += q
      else drinks.push([code, q])
      left -= q
    }
  }
  if (g >= 4 && rand() < 0.03) drinks.push(['M060', 1])
  const dessert = rand() < 0.25 ? [[weighted(desserts), Math.max(1, Math.round(g * 0.6))]] : []
  return { foods, drinks, dessert }
}

const statusPrep = (code, peak) => (item(code).station === 'KhongQuaBep' ? undefined : prepFor(code, peak))

// Sinh một hóa đơn: trả về { entry (JSON gọn), lines (cho tính tiền), close (phút) , stats }
function makeOrder({ d, open, g, tb, w, rv, allowHidden, relative }) {
  const { foods, drinks, dessert } = buildItems(g, allowHidden)
  const peak = relative ? rand() < 0.5 : isPeak(open)
  const batches = []
  const cut = Math.max(1, Math.ceil(foods.length * (0.55 + rand() * 0.45)))
  const b1Time = open + randInt(2, 5)
  batches.push({ t: b1Time, items: [...drinks, ...foods.slice(0, cut)] })
  if (cut < foods.length || rand() < 0.3) {
    const extra = foods.slice(cut)
    if (rand() < 0.3 && drinks.length) extra.push([drinks[0][0], randInt(1, 3)])
    if (extra.length) batches.push({ t: open + randInt(15, 35), items: extra })
  }
  let lastServed = b1Time
  const lines = []
  const entryBatches = []
  for (const batch of batches) {
    const out = []
    for (const [code, qty] of batch.items) {
      const prep = statusPrep(code, peak)
      out.push(prep === undefined ? [code, qty] : [code, qty, prep])
      lastServed = Math.max(lastServed, batch.t + (prep ?? 0) + 2)
    }
    entryBatches.push([batch.t, out])
  }
  if (dessert.length) {
    const t = lastServed + randInt(5, 15)
    const out = dessert.map(([code, qty]) => {
      const prep = statusPrep(code, peak)
      lastServed = Math.max(lastServed, t + prep + 2)
      return [code, qty, prep]
    })
    entryBatches.push([t, out])
  }
  // Hủy món (~4% hóa đơn)
  if (rand() < 0.04) {
    const candidates = []
    entryBatches.forEach(([, its], bi) => its.forEach((it, ii) => { if (it[2] !== undefined) candidates.push([bi, ii]) }))
    const lineCount = entryBatches.reduce((s, [, its]) => s + its.length, 0)
    if (candidates.length && lineCount >= 2) {
      const [bi, ii] = pick(candidates)
      const it = entryBatches[bi][1][ii]
      const [code, qty, prep] = it
      const kind = weighted([['ChoLam', 50], ['DangLam', 25], ['HetMon', 15], ['DaPhucVu', 10]])
      const weight = item(code).pricing === 'TheoTrongLuong'
      let cx
      if (kind === 'ChoLam') cx = { r: weighted(cancelReasonsWaiter), by: w, st: 'ChoLam', m: Math.max(1, Math.min(prep - 1, randInt(1, 4))) }
      else if (kind === 'DangLam') cx = { r: weighted([['ChoLau', 3], ['KhachDoiY', 1]]), by: w, ap: 'quanly', st: 'DangLam', m: Math.max(2, Math.min(prep, item(code).prepMinutes + randInt(0, 5))) }
      else if (kind === 'HetMon') cx = { r: 'HetMon', by: 'bep', st: 'ChoLam', m: 1 }
      else cx = { r: 'Khac', nt: 'Món bị lỗi, khách không dùng', by: w, ap: 'quanly', st: 'DaPhucVu', m: prep + randInt(5, 15) }
      const partial = kind === 'ChoLam' && !weight && qty > 1 && rand() < 0.4
      if (partial) {
        const k = randInt(1, qty - 1)
        entryBatches[bi][1].splice(ii, 1, [code, qty - k, prep], [code, k, null, { cx }])
      } else {
        entryBatches[bi][1].splice(ii, 1, [code, qty, cx.st === 'DaPhucVu' ? prep : null, { cx }])
      }
    }
  }
  for (const [, its] of entryBatches) for (const it of its) lines.push({ code: it[0], qty: it[1], cancelled: !!it[3]?.cx })
  const close = lastServed + randInt(15, 40) + (foods.some(([c]) => hotpots.some(([h]) => h === c)) ? 15 : 0)
  const entry = { d, o: open, tb, g, w }
  if (rv) entry.rv = rv
  entry.b = entryBatches
  entry.c = close
  return { entry, lines, close }
}

function pickCash(amount) {
  const up = (unit) => Math.ceil(amount / unit) * unit
  return weighted([[amount, 20], [up(50000), 30], [up(100000), 30], [up(500000), 15], [up(1000000), 5]])
}

function finishOrder(o, { cashier, deposit, allowCancel }) {
  // giảm giá (~4,5%)
  if (rand() < 0.045) {
    const sub = price({ lines: o.lines }).subtotal
    const choice = weighted(discountChoices)
    let dc
    if (choice === 'P5') dc = { type: 'PhanTram', value: 5, reason: 'Khách quen' }
    else if (choice === 'P10') dc = { type: 'PhanTram', value: 10, reason: 'Khách quen' }
    else if (choice === 'S50') dc = { type: 'SoTien', value: 50000, reason: 'Món ra chậm' }
    else if (choice === 'P15') dc = { type: 'PhanTram', value: 15, reason: 'Khách quen' }
    else dc = { type: 'SoTien', value: 200000, reason: 'Khác: khách đoàn' }
    const amount = dc.type === 'PhanTram' ? floor1000((sub * dc.value) / 100) : Math.min(dc.value, sub)
    if (amount > sub * 0.1) dc.by = 'quanly'
    o.entry.dc = dc
  }
  const pr = price({ lines: o.lines, dc: o.entry.dc })
  const dep = deposit ? Math.min(deposit, pr.total) : 0
  const remaining = pr.total - dep
  o.entry.cs = cashier
  const method = weighted([['TienMat', 38], ['ChuyenKhoan', 40], ['The', 17], ['Mix', 5]])
  if (remaining <= 0) o.entry.pm = []
  else if (method === 'TienMat') o.entry.pm = [['TienMat', null, pickCash(remaining)]]
  else if (method === 'ChuyenKhoan') o.entry.pm = [['ChuyenKhoan', null]]
  else if (method === 'The') o.entry.pm = [['The', null, String(randInt(0, 9999)).padStart(4, '0')]]
  else {
    const x = Math.min(remaining - 1000, floor1000(remaining * (0.4 + rand() * 0.3)))
    o.entry.pm = x > 0 ? [['ChuyenKhoan', x], ['TienMat', null, pickCash(remaining - x)]] : [['TienMat', null, pickCash(remaining)]]
  }
  let cancelled = false
  if (allowCancel && rand() < 0.006) {
    o.entry.cx = { at: Math.min(o.close + randInt(5, 60), 1430), by: 'quanly', reason: pick(orderCancelReasons) }
    cancelled = true
  }
  return { pr, cancelled }
}

// ---------- Đặt bàn đã qua (sinh) ----------
const pastNames = [
  'Nguyễn Thị Hạnh', 'Trần Văn Lộc', 'Lê Thị Bích Ngọc', 'Phạm Quốc Bảo', 'Hoàng Thị Thu Hằng', 'Võ Văn Toàn', 'Đặng Ngọc Hân',
  'Bùi Văn Sơn', 'Đỗ Thị Mai Anh', 'Huỳnh Tấn Lực', 'Ngô Thị Thanh Tâm', 'Dương Văn Khải', 'Lý Thị Kim Chi', 'Phan Văn Nghĩa',
  'Trương Thị Diệu', 'Hồ Minh Nhật', 'Châu Thị Bảo Trâm', 'Lưu Văn Thịnh', 'Tô Thị Hồng Gấm', 'Nguyễn Hữu Phước', 'Trần Thị Thúy Vy',
  'Lê Văn Hậu', 'Phạm Thị Ngọc Hà', 'Võ Thành Danh', 'Đinh Thị Lệ Thu', 'Kiều Văn Phong', 'Mạc Thị Yến Nhi', 'Tăng Văn Quý',
  'Nguyễn Thị Kim Thoa', 'Trần Quang Vinh', 'Lê Thị Hoài Thương', 'Phạm Văn Duy', 'Hà Thị Minh Thư', 'Quách Văn Tài',
]
const phonePrefixes = ['090', '091', '093', '094', '097', '098', '035', '036', '077', '085', '088', '070']
const reservationTimes = [[690, 3], [720, 2], [1080, 2], [1110, 3], [1140, 4], [1170, 3], [1200, 2]]
const pastReservations = []
const reservationBySlot = new Map()
const statusPlan = [...Array(27).fill('DaNhanBan'), ...Array(4).fill('KhongDen'), ...Array(3).fill('DaHuy')]
// đảo thứ tự xác định
for (let i = statusPlan.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[statusPlan[i], statusPlan[j]] = [statusPlan[j], statusPlan[i]]
}
const usedSlots = new Set()
pastNames.forEach((name, i) => {
  let d
  do d = -randInt(1, 30)
  while (usedSlots.has(`${d}`) && rand() < 0.7)
  usedSlots.add(`${d}`)
  const g = weighted([[4, 2], [5, 2], [6, 3], [7, 1], [8, 2], [10, 1]])
  const fits = data.tables.filter((t) => t.capacity >= g && t.capacity <= g + 4 && !usedSlots.has(`${d}|${t.code}`))
  const tb = pick(fits).code
  usedSlots.add(`${d}|${tb}`) // một bàn tối đa một đặt bàn mỗi ngày (BR-24)
  const t = weighted(reservationTimes)
  const status = statusPlan[i]
  const cb = status === 'DaHuy' ? randInt(2, 5) : randInt(0, 4)
  const ct = cb === 0 ? randInt(480, t - 60) : randInt(540, 1260)
  const deposit = g >= 8 ? weighted([[300000, 1], [500000, 2], [1000000, 1]]) : weighted([[0, 6], [200000, 2], [300000, 1]])
  const phone = pick(phonePrefixes) + String(randInt(0, 9999999)).padStart(7, '0')
  const r = { key: `RP${String(i + 1).padStart(2, '0')}`, name, phone, d, t: hhmm(t), guests: g, table: tb, deposit, status, cb, ct: hhmm(ct) }
  if (status === 'DaHuy') r.cx = { t: hhmm(randInt(540, 1200)), by: 'thungan', reason: pick(['Khách đổi lịch', 'Khách báo bận', 'Đổi sang ngày khác']) }
  pastReservations.push(r)
  if (!reservationBySlot.has(d)) reservationBySlot.set(d, [])
  reservationBySlot.get(d).push({ ...r, arrivalMin: t })
})

// ---------- Hóa đơn ----------
const orders = []
const stats = { paid: 0, orderCancelled: 0, mistaken: 0, lines: 0, cancelledLines: 0, tickets: 0, subtotal: 0, discount: 0, service: 0, vat: 0, rounding: 0, total: 0, guests: 0, discountOrders: 0, overrideOrders: 0, kitchenDone: 0, kitchenLate: 0, prepSum: 0, withDeposit: 0 }
const todayStats = { paid: 0, net: 0 }

function countTickets(entry) {
  let n = 0
  for (const [, its] of entry.b) {
    const stations = new Set(its.map((it) => item(it[0]).station).filter((s) => s !== 'KhongQuaBep'))
    n += stations.size
  }
  return n
}
function collectKitchen(entry) {
  for (const [, its] of entry.b) {
    for (const it of its) {
      stats.lines++
      if (it[3]?.cx) {
        stats.cancelledLines++
        continue
      }
      if (item(it[0]).station === 'KhongQuaBep') continue
      stats.kitchenDone++
      stats.prepSum += it[2]
      if (it[2] >= item(it[0]).prepMinutes) stats.kitchenLate++
    }
  }
}
function overlaps(list, a, b) {
  return list.some(([x, y]) => a < y && x < b)
}
function chooseTable(g, occupancy, from, to) {
  const cands = data.tables.filter((t) => t.capacity >= g && t.capacity <= g + 4 && !overlaps(occupancy.get(t.code) ?? [], from, to))
  if (!cands.length) return null
  const area = weighted(Object.entries(areaWeight).filter(([a]) => cands.some((t) => t.area === a)))
  return pick(cands.filter((t) => t.area === area))
}
function occupy(occupancy, tb, from, to) {
  if (!occupancy.has(tb)) occupancy.set(tb, [])
  occupancy.get(tb).push([from, to])
}
function record(o, fin) {
  stats.tickets += countTickets(o.entry)
  collectKitchen(o.entry)
  if (fin.cancelled) {
    stats.orderCancelled++
    return
  }
  stats.paid++
  stats.guests += o.entry.g
  stats.subtotal += fin.pr.subtotal
  stats.discount += fin.pr.discount
  stats.service += fin.pr.service
  stats.vat += fin.pr.vat
  stats.rounding += fin.pr.rounding
  stats.total += fin.pr.total
  if (o.entry.dc) {
    stats.discountOrders++
    if (o.entry.dc.by) stats.overrideOrders++
  }
}
const cashierPick = () => weighted([['thungan', 72], ['thungan2', 28]])
const toEntryTimes = (entry, fmt) => {
  entry.o = fmt(entry.o)
  entry.b = entry.b.map(([t, its]) => [fmt(t), its])
  entry.c = fmt(entry.c)
  if (entry.cx) entry.cx.at = fmt(entry.cx.at)
  return entry
}

for (let d = -SLOTS; d <= -1; d++) {
  const progress = (d + SLOTS + 1) / (SLOTS + 1)
  const trend = 0.9 + 0.2 * progress
  const noise = 0.88 + rand() * 0.24
  const count = Math.round(BASE_ORDERS_PER_DAY * roleFactor[roleOf(d)] * trend * noise)
  const occupancy = new Map()
  const dayOrders = []
  // Đặt bàn của ô ngày này trước (giữ đúng bàn)
  for (const r of reservationBySlot.get(d) ?? []) {
    if (r.status !== 'DaNhanBan') continue
    const open = r.arrivalMin + randInt(-5, 12)
    const o = makeOrder({ d, open, g: r.guests, tb: r.table, w: areaWaiter[tableByCode.get(r.table).area], rv: r.key, allowHidden: d < -30 })
    let pr = price({ lines: o.lines })
    if (r.deposit >= pr.total) {
      r.deposit = floor1000(pr.total * 0.4)
      pastReservations.find((x) => x.key === r.key).deposit = r.deposit
    }
    const fin = finishOrder(o, { cashier: cashierPick(), deposit: r.deposit, allowCancel: false })
    if (r.deposit) stats.withDeposit++
    occupy(occupancy, r.table, open - 5, o.close + 10)
    record(o, fin)
    dayOrders.push(o.entry)
  }
  let made = 0
  let guard = 0
  while (made < count && guard++ < count * 6) {
    const hour = weighted(hourWeights)
    const open = hour * 60 + randInt(0, 59)
    const g = weighted(guestWeights)
    const estClose = open + 60 + g * 5
    const table = chooseTable(g, occupancy, open - 5, estClose + 10)
    if (!table) continue
    const waiter = rand() < 0.8 ? areaWaiter[table.area] : pick(waiters)
    if (rand() < 0.005) {
      // mở nhầm: hóa đơn Đã hủy lý do "Mở nhầm", không có món
      dayOrders.push({ d, o: hhmm(open), tb: table.code, g, w: waiter, mx: hhmm(open + randInt(1, 3)) })
      stats.mistaken++
      made++
      continue
    }
    const o = makeOrder({ d, open, g, tb: table.code, w: waiter, allowHidden: d < -30 })
    if (overlaps(occupancy.get(table.code) ?? [], open - 5, o.close + 10) || o.close > 1395) continue
    const fin = finishOrder(o, { cashier: cashierPick(), allowCancel: true })
    occupy(occupancy, table.code, open - 5, o.close + 10)
    record(o, fin)
    dayOrders.push(o.entry)
    made++
  }
  dayOrders.forEach((e) => typeof e.o === 'number' && toEntryTimes(e, hhmm))
  dayOrders.sort((a, b) => (a.o < b.o ? -1 : a.o > b.o ? 1 : a.tb < b.tb ? -1 : 1))
  orders.push(...dayOrders)
}

// ---------- Hôm nay: hóa đơn đã đóng, giờ tính bằng phút so với lúc nạp (số âm) ----------
const todayOcc = new Map()
for (const o of live) {
  occupy(todayOcc, o.tb, o.o - 5, 1)
  for (const m of o.mg ?? []) occupy(todayOcc, m.tb, m.o - 5, 1)
}
const todayOrders = []
let todayMade = 0
let todayGuard = 0
while (todayMade < 16 && todayGuard++ < 300) {
  const open = -randInt(70, 200)
  const g = weighted(guestWeights.filter(([n]) => n <= 6))
  const table = chooseTable(g, todayOcc, open - 5, open + 90)
  if (!table) continue
  const o = makeOrder({ d: 0, open, g, tb: table.code, w: areaWaiter[table.area], allowHidden: false, relative: true })
  if (o.close > -10) continue
  if (overlaps(todayOcc.get(table.code) ?? [], open - 5, o.close + 10)) continue
  const fin = finishOrder(o, { cashier: 'thungan', allowCancel: false })
  occupy(todayOcc, table.code, open - 5, o.close + 10)
  record(o, fin)
  todayStats.paid++
  todayStats.net += fin.pr.subtotal - fin.pr.discount
  todayOrders.push(o.entry)
  todayMade++
}
todayOrders.sort((a, b) => a.o - b.o || (a.tb < b.tb ? -1 : 1))
orders.push(...todayOrders)

// liveOrders: thống kê để đối chiếu (không ghi lại)
let liveLines = 0
let liveTickets = 0
let liveDone = null
for (const o of live) {
  liveTickets += countTickets(o)
  liveLines += o.b.reduce((s, [, its]) => s + its.length, 0)
  if (o.c != null) {
    const lines = o.b.flatMap(([, its]) => its.map((it) => ({ code: it[0], qty: it[1] })))
    liveDone = price({ lines })
  }
}
todayStats.paid += 1
todayStats.net += liveDone.subtotal

// ---------- Ghi file: phần viết tay giữ dạng đẹp, mỗi hóa đơn và đặt bàn sinh ra một dòng ----------
const rest = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'pastReservations' && key !== 'orders'))
let out = JSON.stringify(rest, null, 2)
// liveOrders viết tay: mỗi hóa đơn một dòng cho gọn
out = out.replace(/"liveOrders": \[[\s\S]*\]\s*}\s*$/, () => '"liveOrders": [\n' + data.liveOrders.map((o) => '    ' + JSON.stringify(o)).join(',\n') + '\n  ]\n}')
out = out.replace(/\n}\s*$/, '')
out += ',\n  "pastReservations": [\n' + pastReservations.map((r) => '    ' + JSON.stringify(r)).join(',\n') + '\n  ],\n'
out += '  "orders": [\n' + orders.map((o) => '    ' + JSON.stringify(o)).join(',\n') + '\n  ]\n}\n'
writeFileSync(file, out, 'utf8')
const written = JSON.parse(readFileSync(file, 'utf8')) // kiểm tra JSON hợp lệ

// Kiểm tra sau khi ghi
const errors = []
for (const o of written.orders) {
  if (!tableByCode.has(o.tb)) errors.push(`bàn lạ ${o.tb}`)
  for (const [, its] of o.b ?? []) for (const it of its) {
    const m = itemByCode.get(it[0])
    if (!m) errors.push(`món lạ ${it[0]}`)
    else if (m.pricing === 'TheoSuat' && (!Number.isInteger(it[1]) || it[1] < 1 || it[1] > 99)) errors.push(`số lượng sai ${JSON.stringify(it)}`)
    else if (m.pricing === 'TheoTrongLuong' && (it[1] < 0.1 || it[1] > 20 || Math.round(it[1] * 10) !== it[1] * 10)) errors.push(`trọng lượng sai ${JSON.stringify(it)}`)
  }
  if (o.mx == null && !(o.b?.some(([, its]) => its.some((it) => !it[3]?.cx)))) errors.push(`hóa đơn không còn món ${JSON.stringify(o).slice(0, 80)}`)
}
if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'))
  process.exit(1)
}

const rsv = [...written.reservations, ...written.pastReservations]
const byStatus = (list, key) => Object.entries(list.reduce((acc, x) => ((acc[x[key]] = (acc[x[key]] ?? 0) + 1), acc), {})).map(([k, v]) => `${k} ${v}`).join(', ')
const vnd = (n) => n.toLocaleString('vi-VN') + ' ₫'
const openLiveCount = live.filter((o) => o.c == null).length
const mergedCount = live.reduce((s, o) => s + (o.mg?.length ?? 0), 0)
console.log(`Thực đơn: ${data.categories.length} danh mục, ${data.menuItems.length} món, ${data.quickNotes.length} ghi chú nhanh; khu vực ${data.areas.length}, bàn ${data.tables.length}`)
console.log(`Đặt bàn: ${rsv.length} (${byStatus(rsv, 'status')}); viết tay ${written.reservations.length}, sinh ${written.pastReservations.length}`)
console.log(`Hóa đơn sinh (orders): ${orders.length} = lịch sử ${orders.length - todayOrders.length} + hôm nay đã đóng ${todayOrders.length}`)
console.log(`  đã thanh toán ${stats.paid}, hủy sau thanh toán ${stats.orderCancelled}, mở nhầm ${stats.mistaken}; có tiền cọc ${stats.withDeposit}`)
console.log(`  giảm giá ${stats.discountOrders} hóa đơn (vượt hạn mức do quanly duyệt ${stats.overrideOrders})`)
console.log(`liveOrders: ${live.length} (đang mở ${openLiveCount}, chờ dọn ${live.filter((o) => o.cd).length}) + bàn phụ đã gộp ${mergedCount} → tổng hóa đơn ${orders.length + live.length + mergedCount}`)
console.log(`Dòng món (orders): ${stats.lines} (đã hủy ${stats.cancelledLines}); liveOrders ${liveLines}`)
console.log(`Phiếu bếp: orders ${stats.tickets}, liveOrders ${liveTickets}, tổng ${stats.tickets + liveTickets}`)
console.log(`Bếp (orders, món đã xong qua bếp): ${stats.kitchenDone} món, ra món TB ${(stats.prepSum / stats.kitchenDone).toFixed(2)} phút, tỉ lệ trễ ${((stats.kitchenLate / stats.kitchenDone) * 100).toFixed(1)}%`)
console.log(`Σ hóa đơn đã thanh toán trong orders (không gồm hủy): tiền món ${vnd(stats.subtotal)}, giảm ${vnd(stats.discount)}, doanh thu thuần ${vnd(stats.subtotal - stats.discount)}, phí phục vụ ${vnd(stats.service)}, thuế ${vnd(stats.vat)}, làm tròn ${vnd(stats.rounding)}, tổng thanh toán ${vnd(stats.total)}, số khách ${stats.guests}`)
console.log(`Hôm nay (nạp sau 03:30): ${todayStats.paid} hóa đơn đã thanh toán, doanh thu thuần ${vnd(todayStats.net)} (gồm T1-03 ${vnd(liveDone.subtotal)}, tổng ${vnd(liveDone.total)})`)
console.log(`Kích thước file: ${(Buffer.byteLength(out, 'utf8') / 1024).toFixed(0)} KB`)

/**
 * Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) dùng cho ngày lịch, mã chứng từ, báo cáo
 * (06 §3: "Ngày" tính theo giờ Việt Nam, VietnamTime ở BE). Không phụ thuộc múi giờ của máy.
 */

const OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 86_400_000

export type VnParts = { year: number; month: number; day: number; hour: number; minute: number; isoWeekday: number }

/** Tách ngày giờ Việt Nam của một thời điểm */
export function vnParts(date: Date | number | string): VnParts {
  const t = new Date(date).getTime() + OFFSET_MS
  const d = new Date(t)
  const weekday = d.getUTCDay() // 0 = CN
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    isoWeekday: weekday === 0 ? 7 : weekday,
  }
}

/** Khóa ngày "yyyy-MM-dd" theo giờ Việt Nam */
export function vnDateKey(date: Date | number | string): string {
  const p = vnParts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** "yyMMdd" theo giờ Việt Nam (mã hóa đơn, mã đặt bàn) */
export function vnYyMMdd(date: Date | number | string): string {
  return vnDateKey(date).slice(2).replace(/-/g, '')
}

/** Thời điểm UTC (ms) của 00:00 ngày "yyyy-MM-dd" giờ Việt Nam */
export function vnStartOfDay(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - OFFSET_MS
}

/** Thời điểm (ms) của "HH:mm" giờ Việt Nam ngày dateKey */
export function vnAt(dateKey: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return vnStartOfDay(dateKey) + (h * 60 + m) * 60_000
}

/** Cộng n ngày vào khóa ngày */
export function addDaysKey(dateKey: string, days: number): string {
  return vnDateKey(vnStartOfDay(dateKey) + days * DAY_MS + 12 * 3600_000)
}

/** Số ngày giữa hai khóa ngày (to − from) */
export function diffDaysKey(from: string, to: string): number {
  return Math.round((vnStartOfDay(to) - vnStartOfDay(from)) / DAY_MS)
}

/** "HH:mm" giờ Việt Nam */
export function vnHhmm(date: Date | number | string): string {
  const p = vnParts(date)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** Phút trong ngày (giờ Việt Nam) */
export function vnMinuteOfDay(date: Date | number | string): number {
  const p = vnParts(date)
  return p.hour * 60 + p.minute
}

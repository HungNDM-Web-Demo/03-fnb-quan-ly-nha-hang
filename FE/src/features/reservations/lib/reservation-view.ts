import { PosRules } from '@/features/pos/lib/pos-rules'
import { vnDateKey, vnParts } from '@/features/pos/lib/vn-time'
import type { ReservationDto, ReservationStatus } from '@/features/pos/types/pos.types'

/** Hiển thị dùng chung cho màn Đặt bàn (SCR-13, UC-13). */

const WEEKDAYS = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']
const pad = (n: number) => String(n).padStart(2, '0')

/** "yyyy-MM-dd" → "15/10/2026" */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${d}/${m}/${y}`
}

/** "yyyy-MM-dd" → "Thứ Năm, 15/10/2026" */
export function formatDateKeyLong(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAYS[weekday === 0 ? 7 : weekday]}, ${formatDateKey(dateKey)}`
}

/** Ngày giờ theo giờ Việt Nam: "15/10/2026 19:00" */
export function formatVnDateTime(value: string | undefined | null): string {
  if (!value) return '—'
  const p = vnParts(value)
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`
}

/** Khóa ngày ↔ Date theo lịch máy (cho Calendar) */
export function keyToLocalDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function localDateToKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
export const fromMinutes = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

/** Giờ đến chọn được: giờ mở cửa → giờ đóng cửa (nhận cả giờ đóng cửa), bước 15 phút (BR-24) */
export function timeSlots(openTime: string, closeTime: string, step = 15): string[] {
  const list: string[] = []
  for (let m = toMinutes(openTime); m <= toMinutes(closeTime); m += step) list.push(fromMinutes(m))
  return list
}

/** Nhận bàn: chỉ đặt bàn "Chờ đến" có giờ đến trong hôm nay (07 §2.15) */
export function canCheckInToday(r: ReservationDto, now: number): boolean {
  return r.status === 'ChoDen' && vnDateKey(r.arrivalAt) === vnDateKey(now)
}

export const holdUntilMs = (r: ReservationDto) =>
  r.holdUntil ? new Date(r.holdUntil).getTime() : new Date(r.arrivalAt).getTime() + PosRules.holdMinutes * 60_000

/** Màu khối đặt bàn trên dòng thời gian, chỉ dùng token (theme.css) */
export const reservationBlockClass: Record<ReservationStatus, string> = {
  ChoDen: 'bg-info/12 border-info/45 hover:bg-info/20',
  DaNhanBan: 'bg-success/12 border-success/45 hover:bg-success/20',
  KhongDen: 'bg-muted border-border hover:bg-muted/70',
  DaHuy: 'bg-destructive/8 border-destructive/35 border-dashed hover:bg-destructive/12',
}
export const reservationAccentClass: Record<ReservationStatus, string> = {
  ChoDen: 'bg-info',
  DaNhanBan: 'bg-success',
  KhongDen: 'bg-muted-foreground',
  DaHuy: 'bg-destructive',
}
export const reservationTextClass: Record<ReservationStatus, string> = {
  ChoDen: 'text-info',
  DaNhanBan: 'text-success',
  KhongDen: 'text-muted-foreground',
  DaHuy: 'text-destructive',
}

export const RESERVATION_STATUSES: ReservationStatus[] = ['ChoDen', 'DaNhanBan', 'KhongDen', 'DaHuy']

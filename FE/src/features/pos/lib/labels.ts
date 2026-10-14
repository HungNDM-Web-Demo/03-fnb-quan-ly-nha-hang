import type { StatusTone } from '@/components/shared/StatusBadge'
import { formatNumber, formatVnd } from '@/lib/format'
import type {
  CancelReason,
  KitchenStation,
  MenuItemStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PricingType,
  ReservationStatus,
  TableShape,
  TableStatus,
} from '../types/pos.types'

/** Chữ hiển thị của enum (docs/07 §2, 06 §4). */

export const tableStatusLabels: Record<TableStatus, string> = {
  Trong: 'Trống',
  DaDat: 'Đã đặt',
  DangPhucVu: 'Đang phục vụ',
  ChoThanhToan: 'Chờ thanh toán',
  ChoDon: 'Chờ dọn',
  DaGop: 'Đã gộp',
}
export const TABLE_STATUS_ORDER: TableStatus[] = ['Trong', 'DaDat', 'DangPhucVu', 'ChoThanhToan', 'ChoDon', 'DaGop']

export const tableShapeLabels: Record<TableShape, string> = {
  Vuong: 'Vuông',
  Tron: 'Tròn',
  ChuNhat: 'Chữ nhật',
}

export const pricingTypeLabels: Record<PricingType, string> = {
  TheoSuat: 'Theo suất',
  TheoTrongLuong: 'Theo trọng lượng',
}

export const stationLabels: Record<KitchenStation, string> = {
  BepNong: 'Bếp nóng',
  BepNguoi: 'Bếp nguội',
  QuayBar: 'Quầy bar',
  KhongQuaBep: 'Không qua bếp',
}
export const KITCHEN_STATIONS: Exclude<KitchenStation, 'KhongQuaBep'>[] = ['BepNong', 'BepNguoi', 'QuayBar']
export const ALL_STATIONS: KitchenStation[] = ['BepNong', 'BepNguoi', 'QuayBar', 'KhongQuaBep']

export const menuItemStatusLabels: Record<MenuItemStatus, { label: string; tone: StatusTone }> = {
  DangBan: { label: 'Đang bán', tone: 'success' },
  TamHet: { label: 'Tạm hết', tone: 'warning' },
  An: { label: 'Ẩn', tone: 'neutral' },
}

export const orderItemStatusLabels: Record<OrderItemStatus, { label: string; tone: StatusTone }> = {
  ChuaGui: { label: 'Chưa gửi', tone: 'neutral' },
  ChoGoi: { label: 'Chờ gọi', tone: 'neutral' },
  ChoLam: { label: 'Chờ làm', tone: 'warning' },
  DangLam: { label: 'Đang làm', tone: 'info' },
  Xong: { label: 'Xong', tone: 'success' },
  DaPhucVu: { label: 'Đã phục vụ', tone: 'primary' },
  DaHuy: { label: 'Đã hủy', tone: 'danger' },
}

export const orderStatusLabels: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  DangMo: { label: 'Đang mở', tone: 'info' },
  DangThu: { label: 'Đang thu tiền', tone: 'warning' },
  DaThanhToan: { label: 'Đã thanh toán', tone: 'success' },
  DaGop: { label: 'Đã gộp', tone: 'neutral' },
  DaHuy: { label: 'Đã hủy', tone: 'danger' },
}

export const cancelReasonLabels: Record<CancelReason, string> = {
  KhachDoiY: 'Khách đổi ý',
  GoiNham: 'Gọi nhầm',
  ChoLau: 'Chờ lâu',
  Khac: 'Khác',
  HetMon: 'Hết món',
}
/** "Chờ lâu" hoặc "Khác: {ghi chú}" */
export const cancelReasonText = (reason: CancelReason, note?: string | null) =>
  reason === 'Khac' && note ? `Khác: ${note}` : cancelReasonLabels[reason]

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  TienMat: 'Tiền mặt',
  ChuyenKhoan: 'Chuyển khoản',
  The: 'Thẻ',
  TienCoc: 'Tiền cọc',
}

export const reservationStatusLabels: Record<ReservationStatus, { label: string; tone: StatusTone }> = {
  ChoDen: { label: 'Chờ đến', tone: 'info' },
  DaNhanBan: { label: 'Đã nhận bàn', tone: 'success' },
  KhongDen: { label: 'Không đến', tone: 'neutral' },
  DaHuy: { label: 'Đã hủy', tone: 'danger' },
}

/** Lý do giảm giá gợi ý (07 §2.13) */
export const DISCOUNT_REASONS = ['Khách quen', 'Món ra chậm'] as const

/** "1,2 kg" (dấu phẩy thập phân), "6 lon" */
export function formatQuantity(quantity: number, unit: string, pricingType?: PricingType): string {
  const n = pricingType === 'TheoTrongLuong' ? formatNumber(quantity, 3) : formatNumber(quantity, 0)
  return `${n} ${unit}`
}

/** "450.000 ₫/kg" cho món theo trọng lượng, "125.000 ₫" cho món theo suất */
export function formatUnitPrice(price: number, pricingType: PricingType, unit = 'kg'): string {
  return pricingType === 'TheoTrongLuong' ? `${formatVnd(price)}/${unit}` : formatVnd(price)
}

/** Làm tròn có dấu: "+290 ₫", "−60 ₫" (07 §4) */
export function formatSignedVnd(value: number): string {
  if (value === 0) return formatVnd(0)
  return `${value > 0 ? '+' : '−'}${formatVnd(Math.abs(value))}`
}

/** Thời gian ngồi: "45 phút", "1 giờ 05 phút" (07 §4) */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  if (m < 60) return `${m} phút`
  const h = Math.floor(m / 60)
  return `${h} giờ ${String(m % 60).padStart(2, '0')} phút`
}

/** Đồng hồ chờ "mm:ss" hoặc "1:05:30" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

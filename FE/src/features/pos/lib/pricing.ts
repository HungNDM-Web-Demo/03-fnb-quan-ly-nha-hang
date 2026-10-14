/**
 * Công thức tính tiền dùng chung cho giao diện và handler mock (docs/07-DANH-SACH-API.md §3).
 * BE tính cùng công thức trong OrderPricingService; số BE trả là chính thức.
 * Mọi số tiền là số nguyên đồng; tỉ lệ là số nguyên phần trăm.
 */
import type { DiscountType, OrderItemStatus, PricingType } from '../types/pos.types'

/** Làm tròn tới bội số 1.000 gần nhất, phần lẻ từ 500 lên (BR-07) */
export const round1000 = (x: number) => Math.floor((x + 500) / 1000) * 1000
/** Làm tròn xuống tới bội số 1.000 (BR-08, BR-19) */
export const floor1000 = (x: number) => Math.floor(x / 1000) * 1000
/** Làm tròn tới 1 ₫, phần lẻ từ 0,5 lên (BR-06) */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5)

/** §3.1: thành tiền một dòng (BR-04). Cá chẽm 1,2 kg × 450.000 = 540.000 */
export function lineTotal(pricingType: PricingType, unitPrice: number, quantity: number): number {
  if (pricingType === 'TheoTrongLuong') {
    return round1000((unitPrice * Math.round(quantity * 1000)) / 1000)
  }
  return unitPrice * quantity
}

/** Trạng thái được tính vào tiền món (§3.2, BR-05) */
export const BILLABLE_STATUSES: OrderItemStatus[] = ['ChoGoi', 'ChoLam', 'DangLam', 'Xong', 'DaPhucVu']
export const isBillable = (status: OrderItemStatus) => BILLABLE_STATUSES.includes(status)

export type PricingLine = { status: OrderItemStatus; lineTotal: number }

/** §3.2: tiền món = Σ thành tiền dòng đã gửi, chưa hủy */
export const subtotalOf = (lines: PricingLine[]) =>
  lines.reduce((sum, line) => (isBillable(line.status) ? sum + line.lineTotal : sum), 0)

/** §3.3 bước 1: số tiền giảm theo tiền món hiện tại */
export function discountAmountOf(subtotal: number, type: DiscountType, value: number): number {
  if (subtotal <= 0) return 0
  if (type === 'PhanTram') return Math.min(subtotal, floor1000((subtotal * value) / 100))
  return Math.min(value, subtotal)
}

/** §3.3 bước 2: hạn mức thu ngân (không làm tròn) */
export const discountLimitOf = (subtotal: number, cashierDiscountLimit: number) =>
  (subtotal * cashierDiscountLimit) / 100

export type TotalsInput = {
  subtotal: number
  discountAmount: number
  serviceChargeRate: number
  vatRate: number
}

export type Totals = {
  subtotal: number
  discountAmount: number
  serviceCharge: number
  vatAmount: number
  grossTotal: number
  rounding: number
  total: number
}

/** §3.4: phí phục vụ, thuế GTGT, làm tròn (BR-06, BR-07) */
export function computeTotals({ subtotal, discountAmount, serviceChargeRate, vatRate }: TotalsInput): Totals {
  const base = Math.max(0, subtotal - discountAmount)
  const serviceCharge = roundHalfUp((base * serviceChargeRate) / 100)
  const vatAmount = roundHalfUp(((base + serviceCharge) * vatRate) / 100)
  const grossTotal = base + serviceCharge + vatAmount
  const total = round1000(grossTotal)
  return {
    subtotal,
    discountAmount,
    serviceCharge,
    vatAmount,
    grossTotal,
    rounding: total - grossTotal,
    total,
  }
}

/** Tổng tiền đầy đủ của một hóa đơn từ dòng món và giảm giá */
export function priceOrder(input: {
  lines: PricingLine[]
  discount?: { type: DiscountType; value: number } | null
  serviceChargeRate: number
  vatRate: number
}): Totals {
  const subtotal = subtotalOf(input.lines)
  const discountAmount = input.discount
    ? discountAmountOf(subtotal, input.discount.type, input.discount.value)
    : 0
  return computeTotals({
    subtotal,
    discountAmount,
    serviceChargeRate: input.serviceChargeRate,
    vatRate: input.vatRate,
  })
}

/**
 * §3.5 chia đều N phần: toSplit = total − deposit; phần 2…N = floor1000(toSplit / N);
 * phần 1 = toSplit − (N − 1) × phần 2. TC-32: 1.208.000 ÷ 3 → 404.000, 402.000, 402.000.
 */
export function splitEqualShares(total: number, deposit: number, count: number): number[] {
  const toSplit = total - deposit
  if (toSplit <= 0 || count < 1) return []
  const share = floor1000(toSplit / count)
  const first = toSplit - (count - 1) * share
  return Array.from({ length: count }, (_, i) => (i === 0 ? first : share))
}

/** Nút mệnh giá nhanh ở màn thu tiền mặt (§3.5) */
export const QUICK_CASH = [500_000, 1_000_000, 2_000_000]

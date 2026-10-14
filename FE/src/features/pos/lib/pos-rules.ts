/**
 * Hằng số nghiệp vụ dùng chung BE và FE (06 §3 "PosRules").
 */
export const PosRules = {
  /** Bàn hiện "Đã đặt" từ 60 phút trước giờ đến (BR-02) */
  reservedBeforeMinutes: 60,
  /** Mỗi đặt bàn giữ bàn 120 phút (BR-24) */
  holdMinutes: 120,
  /** Nhãn "Trễ" sau giờ đến 15 phút */
  lateAfterMinutes: 15,
  /** Quá giờ đến 30 phút → "Không đến" */
  noShowAfterMinutes: 30,
  /** Đặt trước tối thiểu 30 phút */
  minLeadMinutes: 30,
  /** Tối đa 10 hóa đơn mỗi bàn (BR-18) */
  maxOrdersPerTable: 10,
  /** Chia đều 2–20 (BR-19) */
  minSplit: 2,
  maxSplit: 20,
  /** Tiền cọc tối đa (BR-25) */
  maxDeposit: 5_000_000,
  /** Token quản lý xác nhận sống 5 phút */
  approvalMinutes: 5,
  /** Hoàn tác "Đã ra" phía máy chủ 60 giây, FE hiện nút 10 giây (07 §5 #19) */
  unserveSeconds: 60,
  unserveToastSeconds: 10,
  /** Số khách 1–50 (BR-01) */
  minGuests: 1,
  maxGuests: 50,
  /** Lưới sơ đồ 12 × 8 ô */
  gridCols: 12,
  gridRows: 8,
  /** Khoảng báo cáo tối đa 366 ngày */
  maxReportDays: 366,
} as const

/** Kích thước thẻ bàn theo ô lưới: Vuông, Tròn 2×2; Chữ nhật 3×2 (07 §2.6) */
export const tableSize = (shape: 'Vuong' | 'Tron' | 'ChuNhat') =>
  shape === 'ChuNhat' ? { w: 3, h: 2 } : { w: 2, h: 2 }

/** BR-11: mức màu theo tỉ lệ thời gian chờ / thời gian chuẩn. 0 xanh, 1 vàng, 2 đỏ */
export function waitLevel(waitMinutes: number, prepMinutes: number): 0 | 1 | 2 {
  if (!prepMinutes || prepMinutes <= 0) return 0
  const ratio = waitMinutes / prepMinutes
  if (ratio >= 1) return 2
  if (ratio >= 0.8) return 1
  return 0
}

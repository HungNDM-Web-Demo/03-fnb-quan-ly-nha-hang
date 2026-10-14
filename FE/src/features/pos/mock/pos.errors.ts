import { ApiError } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'

/**
 * Lỗi nghiệp vụ có `code` (07 §2.20): FE rẽ nhánh theo `code`, hiển thị nguyên văn `detail`.
 */

type Extra = Record<string, unknown>
const toErrors = (errors?: Record<string, string>) =>
  errors ? Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])) : undefined

/** 400 vi phạm nghiệp vụ */
export function bizError(detail: string, code?: string, extra: Extra = {}, errors?: Record<string, string>): ApiError {
  return ApiError.fromStatus(400, detail, {
    ...(code ? { code } : {}),
    ...extra,
    ...(errors ? { errors: toErrors(errors) } : {}),
  })
}

/** 400 lỗi theo trường */
export function fieldError(field: string, message: string, extra: Extra = {}): ApiError {
  return ApiError.fromStatus(400, message, { errors: { [field]: [message] }, ...extra })
}

/** 409 */
export function conflictError(detail: string, code?: string, extra: Extra = {}, errors?: Record<string, string>): ApiError {
  return ApiError.fromStatus(409, detail, {
    ...(code ? { code } : {}),
    ...extra,
    ...(errors ? { errors: toErrors(errors) } : {}),
  })
}

export const PosErrors = {
  staleVersion: (currentVersion: number) =>
    conflictError('Bàn vừa được cập nhật, đang tải lại', 'DuLieuCu', { currentVersion }),
  orderLocked: () => bizError('Hóa đơn đang thu tiền', 'HoaDonDangThuTien'),
  orderClosed: () => bizError('Hóa đơn đã đóng'),
  unsent: (n: number) => bizError(`Còn ${n} món chưa gửi bếp`, 'ConMonChuaGui', { unsentCount: n }),
  noItems: () => bizError('Hóa đơn chưa có món'),
  splitTable: () => bizError('Bàn đang tách hóa đơn, không chuyển hoặc gộp được', 'BanDangTachHoaDon'),
  invalidApproval: () => bizError('Mã xác nhận của quản lý không hợp lệ, xác nhận lại', 'MaXacNhanKhongHopLe'),
}

/** Số tiền trong câu lỗi: "208.000 ₫" */
export const money = (n: number) => formatVnd(n)

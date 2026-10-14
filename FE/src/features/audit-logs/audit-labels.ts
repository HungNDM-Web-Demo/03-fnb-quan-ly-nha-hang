import type { StatusTone } from '@/components/shared/StatusBadge'
import type { AuditAction } from './types/audit-log.types'

/** Nhãn hiển thị cho nhật ký. Dự án thêm tên entity và tên cột nghiệp vụ của mình vào đây. */

export const auditActionLabels: Record<AuditAction, { label: string; tone: StatusTone }> = {
  Create: { label: 'Thêm', tone: 'success' },
  Update: { label: 'Sửa', tone: 'info' },
  Delete: { label: 'Xóa', tone: 'danger' },
  Login: { label: 'Đăng nhập', tone: 'neutral' },
}

/** Tên entity (BE) → tên tiếng Việt; cũng là danh sách cho bộ lọc "Đối tượng". */
export const auditEntityLabels: Record<string, string> = {
  User: 'Tài khoản',
  Role: 'Vai trò',
  Setting: 'Cài đặt',
  Area: 'Khu vực',
  DiningTable: 'Bàn',
  Category: 'Danh mục món',
  MenuItem: 'Món',
  QuickNote: 'Ghi chú nhanh',
  Order: 'Hóa đơn',
  OrderItem: 'Món gọi',
  Reservation: 'Đặt bàn',
}

/** Tên cột (camelCase) → nhãn tiếng Việt trong bảng "trước / sau". */
export const auditFieldLabels: Record<string, string> = {
  username: 'Tên đăng nhập',
  fullName: 'Họ tên',
  email: 'Email',
  phone: 'Số điện thoại',
  avatarUrl: 'Ảnh đại diện',
  isActive: 'Đang hoạt động',
  isDemoAccount: 'Tài khoản demo',
  lastLoginAt: 'Đăng nhập gần nhất',
  roleIds: 'Vai trò',
  code: 'Mã',
  name: 'Tên',
  description: 'Mô tả',
  isSystem: 'Vai trò hệ thống',
  permissions: 'Quyền',
  key: 'Khóa',
  value: 'Giá trị',
  groupName: 'Nhóm',
  quickLogin: 'Đăng nhập nhanh',
  sortOrder: 'Thứ tự',
  status: 'Trạng thái',
  createdAt: 'Ngày tạo',
  updatedAt: 'Ngày sửa',
  // Nghiệp vụ nhà hàng
  isHidden: 'Ẩn',
  isDeleted: 'Đã xóa',
  isSoldOut: 'Tạm hết',
  areaId: 'Khu vực',
  capacity: 'Sức chứa',
  shape: 'Hình dạng',
  x: 'Cột',
  y: 'Hàng',
  version: 'Phiên bản',
  color: 'Màu',
  categoryId: 'Danh mục',
  imageUrl: 'Ảnh',
  unit: 'Đơn vị tính',
  pricingType: 'Cách tính',
  price: 'Đơn giá',
  station: 'Khu chế biến',
  prepMinutes: 'Thời gian chuẩn (phút)',
  content: 'Nội dung',
  tableCode: 'Bàn',
  guestCount: 'Số khách',
  discount: 'Giảm giá',
  cancelReason: 'Lý do hủy',
  splitFrom: 'Tách từ',
  customerName: 'Tên khách',
  arrivalAt: 'Giờ đến',
  tableId: 'Bàn',
  note: 'Ghi chú',
  deposit: 'Tiền cọc',
  cancelledAt: 'Thời điểm hủy',
  cancelledById: 'Người hủy',
  cancelledByName: 'Người hủy',
}

export const entityLabel = (name: string) => auditEntityLabels[name] ?? name
export const fieldLabel = (name: string) => auditFieldLabels[name] ?? name

import {
  BarChart3,
  CalendarClock,
  ChefHat,
  LayoutDashboard,
  LayoutGrid,
  ReceiptText,
  UtensilsCrossed,
} from 'lucide-react'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import type { NavGroup } from './index'

/**
 * Nhóm menu chính (docs/07-DANH-SACH-API.md §4). Thứ tự quyết định trang chủ theo quyền
 * (`resolveHomePath`): Quản lý → Tổng quan; Phục vụ, Thu ngân → Sơ đồ bàn; Bếp → Màn hình bếp.
 */
export const mainRoutes: NavGroup = {
  id: 'main',
  items: [
    {
      title: 'Tổng quan',
      href: routePath.dashboard,
      icon: LayoutDashboard,
      permission: permissions.dashboard.view,
      description: 'Bàn đang phục vụ, doanh thu hôm nay, bếp',
    },
    {
      title: 'Sơ đồ bàn',
      href: routePath.tables,
      icon: LayoutGrid,
      permission: permissions.tables.view,
      description: 'Mở bàn, gọi món, ra món, thanh toán',
    },
    {
      title: 'Màn hình bếp',
      href: routePath.kitchen,
      icon: ChefHat,
      permission: permissions.kitchenTickets.view,
      description: 'Phiếu bếp theo khu chế biến, báo xong',
    },
    {
      title: 'Hóa đơn',
      href: routePath.orders,
      icon: ReceiptText,
      permission: permissions.orders.checkout,
      description: 'Tra cứu, in lại, hủy hóa đơn',
    },
    {
      title: 'Đặt bàn',
      href: routePath.reservations,
      icon: CalendarClock,
      permission: permissions.reservations.view,
      description: 'Dòng thời gian đặt bàn theo ngày',
    },
    {
      title: 'Thực đơn',
      href: routePath.menuItems,
      icon: UtensilsCrossed,
      permission: permissions.menuItems.update,
      description: 'Món, danh mục, ghi chú nhanh',
    },
    {
      title: 'Báo cáo',
      href: routePath.reports,
      icon: BarChart3,
      permission: permissions.reports.view,
      description: 'Doanh thu, món bán chạy, món hủy, bếp, bàn',
    },
  ],
}

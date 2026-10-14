'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { menuService } from '@/features/pos/services/menu.service'
import { reportService } from '@/features/pos/services/report.service'
import type {
  DateRangeQuery,
  KitchenReportQuery,
  TableReportQuery,
  TopItemsQuery,
  VoidedItemsQuery,
} from '@/features/pos/types/pos.types'

/** Khóa bắt đầu bằng 'pos' để sự kiện thời gian thực tự làm mới báo cáo */
export const reportKeys = {
  all: ['pos', 'reports'] as const,
  categories: ['pos', 'reports', 'categories'] as const,
  revenue: (q: DateRangeQuery) => ['pos', 'reports', 'revenue', q] as const,
  topItems: (q: TopItemsQuery) => ['pos', 'reports', 'top-items', q] as const,
  voidedItems: (q: VoidedItemsQuery) => ['pos', 'reports', 'voided-items', q] as const,
  kitchen: (q: KitchenReportQuery) => ['pos', 'reports', 'kitchen', q] as const,
  tables: (q: TableReportQuery) => ['pos', 'reports', 'tables', q] as const,
}

type Opt = { enabled?: boolean }
const common = { placeholderData: keepPreviousData, staleTime: 60_000 }

export const useRevenueReport = (q: DateRangeQuery, o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.revenue(q),
    queryFn: () => reportService.revenue(q),
    enabled: o.enabled ?? true,
    ...common,
  })

export const useTopItemsReport = (q: TopItemsQuery, o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.topItems(q),
    queryFn: () => reportService.topItems(q),
    enabled: o.enabled ?? true,
    ...common,
  })

export const useVoidedItemsReport = (q: VoidedItemsQuery, o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.voidedItems(q),
    queryFn: () => reportService.voidedItems(q),
    enabled: o.enabled ?? true,
    ...common,
  })

export const useKitchenReport = (q: KitchenReportQuery, o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.kitchen(q),
    queryFn: () => reportService.kitchen(q),
    enabled: o.enabled ?? true,
    ...common,
  })

export const useTableReport = (q: TableReportQuery, o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.tables(q),
    queryFn: () => reportService.tables(q),
    enabled: o.enabled ?? true,
    ...common,
  })

/** Danh mục cho bộ lọc Món bán chạy */
export const useReportCategories = (o: Opt = {}) =>
  useQuery({
    queryKey: reportKeys.categories,
    queryFn: () => menuService.categories(),
    enabled: o.enabled ?? true,
    staleTime: 5 * 60_000,
  })

/** Tải đủ mọi trang món hủy để xuất Excel (pageSize tối đa 100) */
export async function fetchAllVoidedItems(q: Omit<VoidedItemsQuery, 'page' | 'pageSize'>) {
  const first = await reportService.voidedItems({ ...q, page: 1, pageSize: 100 })
  const items = [...first.page.items]
  for (let page = 2; page <= first.page.totalPages; page++) {
    const next = await reportService.voidedItems({ ...q, page, pageSize: 100 })
    items.push(...next.page.items)
  }
  return items
}

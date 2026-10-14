import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import { reportsMock } from '../mock/reports.mock'
import type {
  DashboardReport,
  DateRangeQuery,
  KitchenReport,
  KitchenReportQuery,
  RevenueReport,
  TableReport,
  TableReportQuery,
  TopItemsQuery,
  TopItemsReport,
  VoidedItemsQuery,
  VoidedItemsReport,
} from '../types/pos.types'

const r = apiRoutes.reports

/** Tổng quan, báo cáo (07 §2.16) */
export const reportService = {
  dashboard: (): Promise<DashboardReport> => (isMockMode() ? reportsMock.dashboard() : apiCall.get(r.dashboard)),
  revenue: (query: DateRangeQuery): Promise<RevenueReport> =>
    isMockMode() ? reportsMock.revenue(query) : apiCall.get(r.revenue, { params: query }),
  topItems: (query: TopItemsQuery): Promise<TopItemsReport> =>
    isMockMode() ? reportsMock.topItems(query) : apiCall.get(r.topItems, { params: query }),
  voidedItems: (query: VoidedItemsQuery): Promise<VoidedItemsReport> =>
    isMockMode() ? reportsMock.voidedItems(query) : apiCall.get(r.voidedItems, { params: query }),
  kitchen: (query: KitchenReportQuery): Promise<KitchenReport> =>
    isMockMode() ? reportsMock.kitchen(query) : apiCall.get(r.kitchen, { params: query }),
  tables: (query: TableReportQuery): Promise<TableReport> =>
    isMockMode() ? reportsMock.tables(query) : apiCall.get(r.tables, { params: query }),
}

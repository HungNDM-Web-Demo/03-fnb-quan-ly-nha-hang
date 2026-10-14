'use client'

import { useQuery } from '@tanstack/react-query'
import { reportService } from '@/features/pos/services/report.service'

/** Khóa bắt đầu bằng 'pos' để sự kiện thời gian thực (thanh toán, bếp báo xong…) tự làm mới */
export const dashboardKeys = {
  today: ['pos', 'dashboard'] as const,
}

/** Tổng quan hôm nay (FR-01, UC-14); tự làm mới mỗi 30 giây */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.today,
    queryFn: () => reportService.dashboard(),
    refetchInterval: 30_000,
  })
}

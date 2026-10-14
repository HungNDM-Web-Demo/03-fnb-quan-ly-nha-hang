'use client'

import { useQuery } from '@tanstack/react-query'
import { kitchenService } from '@/features/pos/services/kitchen.service'
import type { KitchenStation, KitchenView } from '@/features/pos/types/pos.types'

/** Phiếu bếp theo khu và chế độ xem; tự làm mới mỗi 30 giây phòng lỡ sự kiện (07 §2.18) */
export function useKitchenBoard(station: KitchenStation | undefined, view: KitchenView, enabled = true) {
  return useQuery({
    queryKey: ['pos', 'kitchen', station ?? 'all', view],
    queryFn: () => kitchenService.board(station, view),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useKitchenSummary(station: KitchenStation | undefined, enabled = true) {
  return useQuery({
    queryKey: ['pos', 'kitchen-summary', station ?? 'all'],
    queryFn: () => kitchenService.summary(station),
    refetchInterval: 30_000,
    enabled,
  })
}

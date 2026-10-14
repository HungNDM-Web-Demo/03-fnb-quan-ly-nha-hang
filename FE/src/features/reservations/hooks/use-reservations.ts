'use client'

import { useQuery } from '@tanstack/react-query'
import { posKeys, usePosMutation } from '@/features/pos/hooks/use-pos'
import { reservationService } from '@/features/pos/services/reservation.service'
import type { AvailableTablesQuery, CheckInRequest, SaveReservationRequest } from '@/features/pos/types/pos.types'

/** Bàn trống đủ chỗ trong khung 120 phút (UC-13 bước 2); null thì chưa gọi */
export function useAvailableTables(query: AvailableTablesQuery | null) {
  return useQuery({
    queryKey: [...posKeys.all, 'available-tables', query] as const,
    queryFn: () => reservationService.availableTables(query!),
    enabled: !!query,
    placeholderData: (previous) => previous,
  })
}

export function useCreateReservation() {
  return usePosMutation((input: SaveReservationRequest) => reservationService.create(input))
}

export function useUpdateReservation() {
  return usePosMutation(({ id, input }: { id: string; input: SaveReservationRequest }) =>
    reservationService.update(id, input)
  )
}

export function useCancelReservation() {
  return usePosMutation(({ id, reason }: { id: string; reason: string }) => reservationService.cancel(id, reason))
}

/** Nhận bàn (FR-36); clientRequestId giữ nguyên khi thử lại (NFR-05) */
export function useCheckInReservation() {
  return usePosMutation(({ id, input }: { id: string; input: CheckInRequest }) => reservationService.checkIn(id, input))
}

/** Chi tiết một đặt bàn (bản mới nhất cho khung chi tiết) */
export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: [...posKeys.all, 'reservation', id ?? ''] as const,
    queryFn: () => reservationService.get(id!),
    enabled: !!id,
  })
}

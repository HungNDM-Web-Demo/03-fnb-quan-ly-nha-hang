'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/lib/api-error'
import { menuService } from '../services/menu.service'
import { orderService } from '../services/order.service'
import { reservationService } from '../services/reservation.service'
import { tableService } from '../services/table.service'
import type { OrderQuery, ReservationQuery } from '../types/pos.types'

/**
 * Hook TanStack Query cho nghiệp vụ nhà hàng. Mọi khóa bắt đầu bằng 'pos' để sự kiện
 * thời gian thực (lib/realtime.ts) làm mới gọn bằng một lệnh.
 */
export const posKeys = {
  all: ['pos'] as const,
  storeProfile: ['pos', 'store-profile'] as const,
  menu: ['pos', 'menu'] as const,
  floorPlan: ['pos', 'floor-plan'] as const,
  tableService: (id: string) => ['pos', 'table-service', id] as const,
  areas: (includeHidden: boolean) => ['pos', 'areas', includeHidden] as const,
  tables: (includeHidden: boolean) => ['pos', 'tables', includeHidden] as const,
  orders: (query: OrderQuery) => ['pos', 'orders', query] as const,
  order: (id: string) => ['pos', 'order', id] as const,
  readyItems: (mine: boolean) => ['pos', 'ready-items', mine] as const,
  reservations: (query: ReservationQuery) => ['pos', 'reservations', query] as const,
}

export const invalidatePos = (client: QueryClient) => client.invalidateQueries({ queryKey: posKeys.all })

/** Lỗi 409 "Bàn vừa được cập nhật, đang tải lại" (NFR-04) */
export const isStaleError = (error: unknown) => isApiError(error) && error.problem.code === 'DuLieuCu'
export const errorCode = (error: unknown): string | undefined =>
  isApiError(error) && typeof error.problem.code === 'string' ? error.problem.code : undefined

/** Mutation nghiệp vụ: xong (kể cả lỗi dữ liệu cũ) thì làm mới mọi query 'pos' */
export function usePosMutation<TVariables, TResult>(fn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidatePos(client),
    onError: (error) => {
      if (isApiError(error) && (error.status === 409 || error.status === 400)) void invalidatePos(client)
    },
  })
}

export function useStoreProfile() {
  return useQuery({ queryKey: posKeys.storeProfile, queryFn: menuService.storeProfile, staleTime: 60_000 })
}

export function useMenuBundle() {
  return useQuery({ queryKey: posKeys.menu, queryFn: menuService.bundle, staleTime: 60_000 })
}

export function useFloorPlan() {
  return useQuery({ queryKey: posKeys.floorPlan, queryFn: tableService.floorPlan, refetchInterval: 30_000 })
}

export function useTableService(id: string) {
  return useQuery({ queryKey: posKeys.tableService(id), queryFn: () => tableService.service(id), refetchInterval: 30_000 })
}

export function useAreas(includeHidden = false, enabled = true) {
  return useQuery({ queryKey: posKeys.areas(includeHidden), queryFn: () => tableService.areas(includeHidden), enabled })
}

export function useDiningTables(includeHidden = false, enabled = true) {
  return useQuery({
    queryKey: posKeys.tables(includeHidden),
    queryFn: () => tableService.tables({ includeHidden }),
    enabled,
  })
}

export function useOrders(query: OrderQuery) {
  return useQuery({ queryKey: posKeys.orders(query), queryFn: () => orderService.list(query), placeholderData: (p) => p })
}

export function useOrder(id: string | undefined) {
  return useQuery({ queryKey: posKeys.order(id ?? ''), queryFn: () => orderService.get(id!), enabled: !!id })
}

export function useReadyItems(mine: boolean, enabled = true) {
  return useQuery({
    queryKey: posKeys.readyItems(mine),
    queryFn: () => orderService.readyItems(mine),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useReservations(query: ReservationQuery) {
  return useQuery({
    queryKey: posKeys.reservations(query),
    queryFn: () => reservationService.list(query),
    placeholderData: (p) => p,
  })
}

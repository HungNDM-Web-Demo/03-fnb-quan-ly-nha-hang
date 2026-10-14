import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import type { PaginatedResult } from '@/types/api'
import { reservationsMock } from '../mock/reservations.mock'
import type {
  AvailableTablesQuery,
  CheckInRequest,
  DiningTableDto,
  OrderDto,
  ReservationDto,
  ReservationQuery,
  SaveReservationRequest,
} from '../types/pos.types'

const r = apiRoutes.reservations

/** Đặt bàn (07 §2.15) */
export const reservationService = {
  list: (query: ReservationQuery): Promise<PaginatedResult<ReservationDto>> =>
    isMockMode() ? reservationsMock.list(query) : apiCall.get(r.list, { params: query }),
  get: (id: string): Promise<ReservationDto> => (isMockMode() ? reservationsMock.get(id) : apiCall.get(r.detail(id))),
  availableTables: (query: AvailableTablesQuery): Promise<DiningTableDto[]> =>
    isMockMode() ? reservationsMock.availableTables(query) : apiCall.get(r.availableTables, { params: query }),
  create: (input: SaveReservationRequest): Promise<ReservationDto> =>
    isMockMode() ? reservationsMock.create(input) : apiCall.post(r.list, input),
  update: (id: string, input: SaveReservationRequest): Promise<ReservationDto> =>
    isMockMode() ? reservationsMock.update(id, input) : apiCall.put(r.detail(id), input),
  cancel: (id: string, reason: string): Promise<ReservationDto> =>
    isMockMode() ? reservationsMock.cancel(id, reason) : apiCall.post(r.cancel(id), { reason }),
  checkIn: (id: string, input: CheckInRequest): Promise<OrderDto> =>
    isMockMode() ? reservationsMock.checkIn(id, input) : apiCall.post(r.checkIn(id), input),
}

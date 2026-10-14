import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import { kitchenMock } from '../mock/kitchen.mock'
import type {
  KitchenBoardDto,
  KitchenStation,
  KitchenSummaryItem,
  KitchenTicketDto,
  KitchenView,
} from '../types/pos.types'

const r = apiRoutes.kitchenTickets

/** Màn hình bếp (07 §2.10) */
export const kitchenService = {
  board: (station: KitchenStation | undefined, view: KitchenView): Promise<KitchenBoardDto> =>
    isMockMode() ? kitchenMock.board(station, view) : apiCall.get(r.list, { params: { station, view } }),
  summary: (station?: KitchenStation): Promise<KitchenSummaryItem[]> =>
    isMockMode() ? kitchenMock.summary(station) : apiCall.get(r.summary, { params: { station } }),
  start: (ticketId: string, itemId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.start(ticketId, itemId) : apiCall.post(r.start(ticketId, itemId)),
  done: (ticketId: string, itemId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.done(ticketId, itemId) : apiCall.post(r.done(ticketId, itemId)),
  doneAll: (ticketId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.doneAll(ticketId) : apiCall.post(r.doneAll(ticketId)),
  undo: (ticketId: string, itemId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.undo(ticketId, itemId) : apiCall.post(r.undo(ticketId, itemId)),
  outOfStock: (ticketId: string, itemId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.outOfStock(ticketId, itemId) : apiCall.post(r.outOfStock(ticketId, itemId)),
  acknowledge: (ticketId: string, itemId: string): Promise<KitchenTicketDto> =>
    isMockMode() ? kitchenMock.acknowledge(ticketId, itemId) : apiCall.post(r.acknowledge(ticketId, itemId)),
}

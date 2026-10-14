import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import type { PaginatedResult } from '@/types/api'
import { approvalsMock } from '../mock/approvals.mock'
import { ordersMock } from '../mock/orders.mock'
import type {
  AddItemRequest,
  ApprovalDto,
  ApprovalRequest,
  CancelItemRequest,
  CreatePaymentRequest,
  DiscountRequest,
  MergeRequest,
  MoveItemsRequest,
  MoveItemsResultDto,
  OrderDto,
  OrderListItem,
  OrderQuery,
  PaymentResultDto,
  ReadyGroupDto,
  SendResultDto,
  SendToKitchenRequest,
  SplitEqualRequest,
  SplitOrderRequest,
  TransferRequest,
  UpdateDraftItemRequest,
  VersionRequest,
} from '../types/pos.types'

const r = apiRoutes.orders

/** Hóa đơn, món gọi, chuyển/gộp, tạm tính, giảm giá, tách, thu tiền (07 §2.8–2.14) */
export const orderService = {
  list: (query: OrderQuery): Promise<PaginatedResult<OrderListItem>> =>
    isMockMode() ? ordersMock.list(query) : apiCall.get(r.list, { params: query }),
  get: (id: string): Promise<OrderDto> => (isMockMode() ? ordersMock.get(id) : apiCall.get(r.detail(id))),

  addItem: (id: string, input: AddItemRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.addItem(id, input) : apiCall.post(r.items(id), input),
  updateDraft: (id: string, itemId: string, input: UpdateDraftItemRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.updateDraft(id, itemId, input) : apiCall.put(r.item(id, itemId), input),
  deleteDraft: (id: string, itemId: string): Promise<OrderDto> =>
    isMockMode() ? ordersMock.deleteDraft(id, itemId) : apiCall.delete(r.item(id, itemId)),
  send: (id: string, input: SendToKitchenRequest): Promise<SendResultDto> =>
    isMockMode() ? ordersMock.send(id, input) : apiCall.post(r.send(id), input),
  serve: (id: string, itemId: string): Promise<OrderDto> =>
    isMockMode() ? ordersMock.serve(id, itemId) : apiCall.post(r.serve(id, itemId)),
  serveAll: (id: string): Promise<OrderDto> => (isMockMode() ? ordersMock.serveAll(id) : apiCall.post(r.serveAll(id))),
  unserve: (id: string, itemId: string): Promise<OrderDto> =>
    isMockMode() ? ordersMock.unserve(id, itemId) : apiCall.post(r.unserve(id, itemId)),
  cancelItem: (id: string, itemId: string, input: CancelItemRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.cancelItem(id, itemId, input) : apiCall.post(r.cancelItem(id, itemId), input),
  close: (id: string, input: VersionRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.close(id, input) : apiCall.post(r.close(id), input),

  transfer: (id: string, input: TransferRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.transfer(id, input) : apiCall.post(r.transfer(id), input),
  merge: (id: string, input: MergeRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.merge(id, input) : apiCall.post(r.merge(id), input),
  moveItems: (id: string, input: MoveItemsRequest): Promise<MoveItemsResultDto> =>
    isMockMode() ? ordersMock.moveItems(id, input) : apiCall.post(r.moveItems(id), input),

  prebill: (id: string, input: VersionRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.prebill(id, input) : apiCall.post(r.prebill(id), input),
  setDiscount: (id: string, input: DiscountRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.setDiscount(id, input) : apiCall.put(r.discount(id), input),
  removeDiscount: (id: string, version: number): Promise<OrderDto> =>
    isMockMode() ? ordersMock.removeDiscount(id, version) : apiCall.delete(r.discount(id), { params: { version } }),
  split: (id: string, input: SplitOrderRequest): Promise<OrderDto[]> =>
    isMockMode() ? ordersMock.split(id, input) : apiCall.post(r.split(id), input),
  splitEqual: (id: string, input: SplitEqualRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.splitEqual(id, input) : apiCall.post(r.splitEqual(id), input),
  cancelSplitEqual: (id: string, version: number): Promise<OrderDto> =>
    isMockMode() ? ordersMock.cancelSplitEqual(id, version) : apiCall.delete(r.splitEqual(id), { params: { version } }),

  pay: (id: string, input: CreatePaymentRequest): Promise<PaymentResultDto> =>
    isMockMode() ? ordersMock.pay(id, input) : apiCall.post(r.payments(id), input),
  complete: (id: string, input: VersionRequest): Promise<OrderDto> =>
    isMockMode() ? ordersMock.complete(id, input) : apiCall.post(r.complete(id), input),
  cancel: (id: string, reason: string): Promise<OrderDto> =>
    isMockMode() ? ordersMock.cancel(id, reason) : apiCall.post(r.cancel(id), { reason }),

  readyItems: (mine: boolean): Promise<ReadyGroupDto[]> =>
    isMockMode() ? ordersMock.readyItems(mine) : apiCall.get(apiRoutes.readyItems, { params: { mine } }),
  approve: (input: ApprovalRequest): Promise<ApprovalDto> =>
    isMockMode() ? approvalsMock.approve(input) : apiCall.post(apiRoutes.approvals, input),
}

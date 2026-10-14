import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import { tablesMock } from '../mock/tables.mock'
import type {
  AreaDto,
  DiningTableDto,
  FloorPlanDto,
  OpenTableRequest,
  OrderDto,
  SaveAreaRequest,
  SaveTableRequest,
  TableCardDto,
  TableLayoutRequest,
  TableServiceDto,
} from '../types/pos.types'

/** Khu vực, bàn, sơ đồ bàn, mở bàn (07 §2.5–2.7) */
export const tableService = {
  areas: (includeHidden = false): Promise<AreaDto[]> =>
    isMockMode()
      ? tablesMock.areas(includeHidden)
      : apiCall.get(apiRoutes.areas.list, { params: includeHidden ? { includeHidden } : undefined }),
  createArea: (input: SaveAreaRequest): Promise<AreaDto> =>
    isMockMode() ? tablesMock.createArea(input) : apiCall.post(apiRoutes.areas.list, input),
  updateArea: (id: string, input: SaveAreaRequest): Promise<AreaDto> =>
    isMockMode() ? tablesMock.updateArea(id, input) : apiCall.put(apiRoutes.areas.detail(id), input),
  reorderAreas: (ids: string[]): Promise<void> =>
    isMockMode() ? tablesMock.reorderAreas(ids) : apiCall.put(apiRoutes.areas.order, { ids }),
  deleteArea: (id: string): Promise<void> =>
    isMockMode() ? tablesMock.deleteArea(id) : apiCall.delete(apiRoutes.areas.detail(id)),

  tables: (params: { areaId?: string; includeHidden?: boolean } = {}): Promise<DiningTableDto[]> =>
    isMockMode()
      ? tablesMock.tables(params.areaId, params.includeHidden)
      : apiCall.get(apiRoutes.tables.list, { params }),
  createTable: (input: SaveTableRequest): Promise<DiningTableDto> =>
    isMockMode() ? tablesMock.createTable(input) : apiCall.post(apiRoutes.tables.list, input),
  updateTable: (id: string, input: SaveTableRequest): Promise<DiningTableDto> =>
    isMockMode() ? tablesMock.updateTable(id, input) : apiCall.put(apiRoutes.tables.detail(id), input),
  saveLayout: (input: TableLayoutRequest): Promise<void> =>
    isMockMode() ? tablesMock.saveLayout(input) : apiCall.put(apiRoutes.tables.layout, input),
  setTableHidden: (id: string, isHidden: boolean): Promise<void> =>
    isMockMode() ? tablesMock.setTableHidden(id, isHidden) : apiCall.patch(apiRoutes.tables.hidden(id), { isHidden }),
  deleteTable: (id: string): Promise<void> =>
    isMockMode() ? tablesMock.deleteTable(id) : apiCall.delete(apiRoutes.tables.detail(id)),

  floorPlan: (): Promise<FloorPlanDto> => (isMockMode() ? tablesMock.floorPlan() : apiCall.get(apiRoutes.floorPlan)),
  service: (id: string): Promise<TableServiceDto> =>
    isMockMode() ? tablesMock.service(id) : apiCall.get(apiRoutes.tables.service(id)),
  open: (id: string, input: OpenTableRequest): Promise<OrderDto> =>
    isMockMode() ? tablesMock.open(id, input) : apiCall.post(apiRoutes.tables.open(id), input),
  clear: (id: string): Promise<TableCardDto> =>
    isMockMode() ? tablesMock.clear(id) : apiCall.post(apiRoutes.tables.clear(id)),
}

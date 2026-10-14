import { apiRoutes } from '@/config/api-routes'
import { apiCall } from '@/lib/axios'
import { isMockMode } from '@/lib/data-source'
import type { PaginatedResult } from '@/types/api'
import { menuMock } from '../mock/menu.mock'
import type {
  CategoryDto,
  MenuBundle,
  MenuItemDto,
  MenuItemQuery,
  QuickNoteDto,
  SaveCategoryRequest,
  SaveMenuItemRequest,
  StoreProfile,
} from '../types/pos.types'

/** Thực đơn, danh mục, ghi chú nhanh, thông tin nhà hàng (07 §2.1–2.4, §2.17) */
export const menuService = {
  storeProfile: (): Promise<StoreProfile> =>
    isMockMode() ? menuMock.storeProfile() : apiCall.get(apiRoutes.storeProfile),

  bundle: (): Promise<MenuBundle> => (isMockMode() ? menuMock.bundle() : apiCall.get(apiRoutes.menu)),

  categories: (): Promise<CategoryDto[]> =>
    isMockMode() ? menuMock.categories() : apiCall.get(apiRoutes.categories.list),
  createCategory: (input: SaveCategoryRequest): Promise<CategoryDto> =>
    isMockMode() ? menuMock.createCategory(input) : apiCall.post(apiRoutes.categories.list, input),
  updateCategory: (id: string, input: SaveCategoryRequest): Promise<CategoryDto> =>
    isMockMode() ? menuMock.updateCategory(id, input) : apiCall.put(apiRoutes.categories.detail(id), input),
  reorderCategories: (ids: string[]): Promise<void> =>
    isMockMode() ? menuMock.reorderCategories(ids) : apiCall.put(apiRoutes.categories.order, { ids }),
  deleteCategory: (id: string): Promise<void> =>
    isMockMode() ? menuMock.deleteCategory(id) : apiCall.delete(apiRoutes.categories.detail(id)),

  menuItems: (query: MenuItemQuery): Promise<PaginatedResult<MenuItemDto>> =>
    isMockMode() ? menuMock.menuItems(query) : apiCall.get(apiRoutes.menuItems.list, { params: query }),
  menuItem: (id: string): Promise<MenuItemDto> =>
    isMockMode() ? menuMock.menuItem(id) : apiCall.get(apiRoutes.menuItems.detail(id)),
  createMenuItem: (input: SaveMenuItemRequest): Promise<MenuItemDto> =>
    isMockMode() ? menuMock.createMenuItem(input) : apiCall.post(apiRoutes.menuItems.list, input),
  updateMenuItem: (id: string, input: SaveMenuItemRequest): Promise<MenuItemDto> =>
    isMockMode() ? menuMock.updateMenuItem(id, input) : apiCall.put(apiRoutes.menuItems.detail(id), input),
  setAvailability: (id: string, isSoldOut: boolean): Promise<void> =>
    isMockMode()
      ? menuMock.setAvailability(id, isSoldOut)
      : apiCall.patch(apiRoutes.menuItems.availability(id), { isSoldOut }),
  setHidden: (id: string, isHidden: boolean): Promise<void> =>
    isMockMode() ? menuMock.setHidden(id, isHidden) : apiCall.patch(apiRoutes.menuItems.hidden(id), { isHidden }),
  uploadImage: (id: string, file: File): Promise<{ imageUrl: string }> => {
    if (isMockMode()) return menuMock.uploadImage(id, file)
    const form = new FormData()
    form.append('file', file)
    return apiCall.post(apiRoutes.menuItems.image(id), form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteMenuItem: (id: string): Promise<void> =>
    isMockMode() ? menuMock.deleteMenuItem(id) : apiCall.delete(apiRoutes.menuItems.detail(id)),

  quickNotes: (): Promise<QuickNoteDto[]> =>
    isMockMode() ? menuMock.quickNotes() : apiCall.get(apiRoutes.quickNotes.list),
  createQuickNote: (content: string): Promise<QuickNoteDto> =>
    isMockMode() ? menuMock.createQuickNote(content) : apiCall.post(apiRoutes.quickNotes.list, { content }),
  updateQuickNote: (id: string, content: string): Promise<QuickNoteDto> =>
    isMockMode() ? menuMock.updateQuickNote(id, content) : apiCall.put(apiRoutes.quickNotes.detail(id), { content }),
  reorderQuickNotes: (ids: string[]): Promise<void> =>
    isMockMode() ? menuMock.reorderQuickNotes(ids) : apiCall.put(apiRoutes.quickNotes.order, { ids }),
  deleteQuickNote: (id: string): Promise<void> =>
    isMockMode() ? menuMock.deleteQuickNote(id) : apiCall.delete(apiRoutes.quickNotes.detail(id)),
}

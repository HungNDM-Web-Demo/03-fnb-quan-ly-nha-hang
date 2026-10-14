import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { publishPosEvent } from '@/lib/realtime'
import { auditCreate, auditDelete, auditUpdate } from '@/mock/mock-audit'
import { requirePermission, requireSession } from '@/mock/mock-auth'
import { mockBlobs } from '@/mock/mock-blobs'
import { mockDb } from '@/mock/mock-db'
import { notFound, validation } from '@/mock/mock-errors'
import { listQuery, newId } from '@/mock/mock-helpers'
import { getSettingsMap, syncSeedEntries } from '@/mock/system-data'
import type { PaginatedResult } from '@/types/api'
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
import { billingSettings, categoriesDb, menuItemsDb, quickNotesDb } from './pos.db'
import { bizError, conflictError } from './pos.errors'
import { menuDtoContext, toCategoryDto, toMenuItemDto } from './pos.mappers'
import type { MenuItemRecord } from './pos.records'

const nowIso = () => new Date().toISOString()
const HEX = /^#[0-9A-Fa-f]{6}$/
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function liveCategories() {
  return categoriesDb.filter((c) => !c.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder)
}
function liveMenuItems() {
  return menuItemsDb.filter((m) => !m.isDeleted)
}
function categoryOrder() {
  return new Map(liveCategories().map((c, i) => [c.id, i]))
}
function sortMenu(items: MenuItemRecord[]) {
  const order = categoryOrder()
  return [...items].sort(
    (a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999) || a.sortOrder - b.sortOrder
  )
}

/** Đánh lại thứ tự 10, 20, 30… theo danh sách id gửi lên (đủ, không thừa) */
function reorder<T extends { id: string }>(all: T[], ids: string[], apply: (id: string, sortOrder: number) => void) {
  const set = new Set(ids)
  if (ids.length !== all.length || set.size !== ids.length || !all.every((x) => set.has(x.id))) {
    throw validation({ ids: 'Danh sách phải gồm đủ mọi mục, không trùng' })
  }
  mockDb.batch(() => ids.forEach((id, i) => apply(id, (i + 1) * 10)))
}

function validateMenuItem(input: SaveMenuItemRequest, excludeId?: string) {
  const errors: Record<string, string> = {}
  if (!/^M\d{3}$/.test(input.code ?? '')) errors.code = 'Mã món dạng M001'
  if (!input.name?.trim()) errors.name = 'Nhập tên món'
  if (!input.unit?.trim() && input.pricingType !== 'TheoTrongLuong') errors.unit = 'Chọn đơn vị tính'
  if (!(input.price > 0)) errors.price = 'Đơn giá phải lớn hơn 0'
  else if (input.price % 1000 !== 0) errors.price = 'Đơn giá phải là bội số 1.000 ₫'
  if (input.station !== 'KhongQuaBep') {
    const p = input.prepMinutes
    if (p === undefined || p === null || !Number.isInteger(p) || p < 1 || p > 120) {
      errors.prepMinutes = 'Thời gian chuẩn từ 1 đến 120 phút'
    }
  }
  if (Object.keys(errors).length) throw validation(errors)
  if (!categoriesDb.some((c) => c.id === input.categoryId && !c.isDeleted)) {
    throw validation({ categoryId: 'Danh mục không tồn tại' })
  }
  if (liveMenuItems().some((m) => m.code === input.code && m.id !== excludeId)) {
    throw conflictError('Mã món đã tồn tại', undefined, {}, { code: 'Mã món đã tồn tại' })
  }
}

function menuItemDto(m: MenuItemRecord): MenuItemDto {
  const { categories, everOrdered } = menuDtoContext()
  return toMenuItemDto(m, categories, everOrdered)
}

export const menuMock = {
  /** GET /api/store-profile (§2.17) */
  async storeProfile(): Promise<StoreProfile> {
    await mockDelay(50, 120)
    requireSession()
    syncSeedEntries()
    const s = getSettingsMap()
    const b = billingSettings()
    return {
      name: s['Store.Name'] ?? '',
      address: s['Store.Address'] ?? '',
      phone: s['Store.Phone'] ?? '',
      taxCode: s['Store.TaxCode'] ?? '',
      receiptFooter: s['Store.ReceiptFooter'] ?? '',
      bankBin: b.bankBin,
      bankAccount: b.bankAccount,
      bankAccountName: s['Store.BankAccountName'] ?? '',
      openTime: b.openTime,
      closeTime: b.closeTime,
      serviceChargeRate: b.serviceChargeRate,
      vatRate: b.vatRate,
      cashierDiscountLimit: b.cashierDiscountLimit,
    }
  },

  /** GET /api/menu (§2.1) */
  async bundle(): Promise<MenuBundle> {
    await mockDelay(100, 200)
    requirePermission(permissions.orders.create, permissions.menuItems.view)
    const { categories, everOrdered } = menuDtoContext()
    const items = liveMenuItems()
    const visibleCats = liveCategories().filter((c) => !c.isHidden)
    const visibleIds = new Set(visibleCats.map((c) => c.id))
    return {
      categories: visibleCats.map((c) => toCategoryDto(c, items)),
      items: sortMenu(items.filter((m) => !m.isHidden && visibleIds.has(m.categoryId))).map((m) =>
        toMenuItemDto(m, categories, everOrdered)
      ),
      quickNotes: quickNotesDb.all().sort((a, b) => a.sortOrder - b.sortOrder),
    }
  },

  // ───── Danh mục (§2.2) ─────
  async categories(): Promise<CategoryDto[]> {
    await mockDelay()
    requirePermission(permissions.menuItems.view)
    const items = liveMenuItems()
    return liveCategories().map((c) => toCategoryDto(c, items))
  },

  async createCategory(input: SaveCategoryRequest): Promise<CategoryDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.create)
    const errors: Record<string, string> = {}
    if (!input.code?.trim()) errors.code = 'Nhập mã danh mục'
    if (!input.name?.trim()) errors.name = 'Nhập tên danh mục'
    if (!HEX.test(input.color ?? '')) errors.color = 'Màu dạng #RRGGBB'
    if (Object.keys(errors).length) throw validation(errors)
    const code = input.code.trim().toUpperCase()
    if (liveCategories().some((c) => c.code === code)) {
      throw conflictError('Mã danh mục đã tồn tại', undefined, {}, { code: 'Mã danh mục đã tồn tại' })
    }
    const max = liveCategories().reduce((m, c) => Math.max(m, c.sortOrder), 0)
    const record = categoriesDb.insert({
      id: newId(),
      code,
      name: input.name.trim(),
      color: input.color.toUpperCase(),
      sortOrder: max + 10,
      isHidden: !!input.isHidden,
      createdAt: nowIso(),
    })
    auditCreate('Category', record)
    publishPosEvent('menu-changed', { menuItemIds: [] })
    return toCategoryDto(record, liveMenuItems())
  },

  async updateCategory(id: string, input: SaveCategoryRequest): Promise<CategoryDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.update)
    const before = categoriesDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy danh mục')
    const errors: Record<string, string> = {}
    if (!input.name?.trim()) errors.name = 'Nhập tên danh mục'
    if (!HEX.test(input.color ?? '')) errors.color = 'Màu dạng #RRGGBB'
    if (Object.keys(errors).length) throw validation(errors)
    const code = (input.code ?? before.code).trim().toUpperCase()
    if (liveCategories().some((c) => c.code === code && c.id !== id)) {
      throw conflictError('Mã danh mục đã tồn tại', undefined, {}, { code: 'Mã danh mục đã tồn tại' })
    }
    const after = categoriesDb.update(id, {
      code,
      name: input.name.trim(),
      color: input.color.toUpperCase(),
      isHidden: !!input.isHidden,
    })!
    auditUpdate('Category', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [] })
    return toCategoryDto(after, liveMenuItems())
  },

  async reorderCategories(ids: string[]): Promise<void> {
    await mockDelay()
    requirePermission(permissions.menuItems.update)
    reorder(liveCategories(), ids, (id, sortOrder) => categoriesDb.update(id, { sortOrder }))
    publishPosEvent('menu-changed', { menuItemIds: [] })
  },

  async deleteCategory(id: string): Promise<void> {
    await mockDelay()
    requirePermission(permissions.menuItems.delete)
    const before = categoriesDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy danh mục')
    const count = liveMenuItems().filter((m) => m.categoryId === id).length
    if (count > 0) {
      throw bizError(`Danh mục đang có ${count} món, chuyển món sang danh mục khác trước`, undefined, {
        itemCount: count,
      })
    }
    categoriesDb.update(id, { isDeleted: true })
    auditDelete('Category', before)
    publishPosEvent('menu-changed', { menuItemIds: [] })
  },

  // ───── Món (§2.3) ─────
  async menuItems(query: MenuItemQuery): Promise<PaginatedResult<MenuItemDto>> {
    await mockDelay()
    requirePermission(permissions.menuItems.view)
    let items = liveMenuItems()
    if (query.categoryId) items = items.filter((m) => m.categoryId === query.categoryId)
    if (query.station) items = items.filter((m) => m.station === query.station)
    if (query.status) {
      items = items.filter((m) =>
        query.status === 'An' ? m.isHidden : query.status === 'TamHet' ? !m.isHidden && m.isSoldOut : !m.isHidden && !m.isSoldOut
      )
    }
    const { categories, everOrdered } = menuDtoContext()
    const order = categoryOrder()
    const dtos = sortMenu(items).map((m) => ({
      ...toMenuItemDto(m, categories, everOrdered),
      // Khóa sắp xếp mặc định: thứ tự danh mục rồi thứ tự món
      _menuOrder: (order.get(m.categoryId) ?? 999) * 100_000 + m.sortOrder,
    }))
    const sortBy = query.sortBy && query.sortBy !== 'sortOrder' ? query.sortBy : '_menuOrder'
    const result = listQuery(dtos, { ...query, sortBy, sortDir: query.sortDir ?? 'asc' }, {
      searchFields: ['code', 'name'],
    })
    return {
      ...result,
      items: result.items.map(({ _menuOrder, ...dto }) => {
        void _menuOrder
        return dto
      }),
    }
  },

  async menuItem(id: string): Promise<MenuItemDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.view)
    const m = menuItemsDb.get(id)
    if (!m || m.isDeleted) throw notFound('Không tìm thấy món')
    return menuItemDto(m)
  },

  async createMenuItem(input: SaveMenuItemRequest): Promise<MenuItemDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.create)
    validateMenuItem(input)
    const sameCategory = liveMenuItems().filter((m) => m.categoryId === input.categoryId)
    const record = menuItemsDb.insert({
      id: newId(),
      code: input.code,
      name: input.name.trim(),
      categoryId: input.categoryId,
      description: input.description?.trim() || undefined,
      unit: input.pricingType === 'TheoTrongLuong' ? 'kg' : input.unit.trim(),
      pricingType: input.pricingType,
      price: input.price,
      station: input.station,
      prepMinutes: input.station === 'KhongQuaBep' ? undefined : input.prepMinutes,
      isSoldOut: false,
      isHidden: false,
      sortOrder: input.sortOrder ?? sameCategory.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 10,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    auditCreate('MenuItem', record)
    publishPosEvent('menu-changed', { menuItemIds: [record.id] })
    return menuItemDto(record)
  },

  async updateMenuItem(id: string, input: SaveMenuItemRequest): Promise<MenuItemDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.update)
    const before = menuItemsDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy món')
    validateMenuItem(input, id)
    const after = menuItemsDb.update(id, {
      code: input.code,
      name: input.name.trim(),
      categoryId: input.categoryId,
      description: input.description?.trim() || undefined,
      unit: input.pricingType === 'TheoTrongLuong' ? 'kg' : input.unit.trim(),
      pricingType: input.pricingType,
      price: input.price,
      station: input.station,
      prepMinutes: input.station === 'KhongQuaBep' ? undefined : input.prepMinutes,
      sortOrder: input.sortOrder ?? before.sortOrder,
      updatedAt: nowIso(),
    })!
    auditUpdate('MenuItem', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [id] })
    return menuItemDto(after)
  },

  /** PATCH availability (UC-04): bếp, quản lý */
  async setAvailability(id: string, isSoldOut: boolean): Promise<void> {
    await mockDelay(100, 200)
    requirePermission(permissions.menuItems.availability)
    const before = menuItemsDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy món')
    const after = menuItemsDb.update(id, { isSoldOut, updatedAt: nowIso() })!
    auditUpdate('MenuItem', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [id] })
  },

  async setHidden(id: string, isHidden: boolean): Promise<void> {
    await mockDelay(100, 200)
    requirePermission(permissions.menuItems.update)
    const before = menuItemsDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy món')
    const after = menuItemsDb.update(id, { isHidden, updatedAt: nowIso() })!
    auditUpdate('MenuItem', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [id] })
  },

  async uploadImage(id: string, file: File): Promise<{ imageUrl: string }> {
    await mockDelay(300, 600)
    requirePermission(permissions.menuItems.update)
    const before = menuItemsDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy món')
    if (!IMAGE_TYPES.includes(file.type)) throw validation({ file: 'Chỉ nhận ảnh JPG, PNG hoặc WebP' })
    if (file.size > 2 * 1024 * 1024) throw validation({ file: 'Ảnh tối đa 2 MB' })
    const stored = await mockBlobs.put(file, file.name)
    const after = menuItemsDb.update(id, { imageUrl: stored.url, updatedAt: nowIso() })!
    auditUpdate('MenuItem', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [id] })
    return { imageUrl: stored.url }
  },

  async deleteMenuItem(id: string): Promise<void> {
    await mockDelay()
    requirePermission(permissions.menuItems.delete)
    const before = menuItemsDb.get(id)
    if (!before || before.isDeleted) throw notFound('Không tìm thấy món')
    if (menuDtoContext().everOrdered.has(id)) throw bizError('Món đã có trong hóa đơn, chỉ có thể ẩn')
    menuItemsDb.update(id, { isDeleted: true, updatedAt: nowIso() })
    auditDelete('MenuItem', before)
    publishPosEvent('menu-changed', { menuItemIds: [id] })
  },

  // ───── Ghi chú nhanh (§2.4) ─────
  async quickNotes(): Promise<QuickNoteDto[]> {
    await mockDelay()
    requirePermission(permissions.menuItems.view, permissions.orders.create)
    return quickNotesDb.all().sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async createQuickNote(content: string): Promise<QuickNoteDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.create)
    const text = content?.trim() ?? ''
    if (!text) throw validation({ content: 'Nhập nội dung ghi chú' })
    if (text.length > 50) throw validation({ content: 'Ghi chú tối đa 50 ký tự' })
    if (quickNotesDb.some((q) => q.content.toLowerCase() === text.toLowerCase())) {
      throw conflictError('Ghi chú đã có', undefined, {}, { content: 'Ghi chú đã có' })
    }
    const max = quickNotesDb.all().reduce((m, q) => Math.max(m, q.sortOrder), 0)
    const record = quickNotesDb.insert({ id: newId(), content: text, sortOrder: max + 10 })
    auditCreate('QuickNote', record)
    publishPosEvent('menu-changed', { menuItemIds: [] })
    return record
  },

  async updateQuickNote(id: string, content: string): Promise<QuickNoteDto> {
    await mockDelay()
    requirePermission(permissions.menuItems.update)
    const before = quickNotesDb.get(id)
    if (!before) throw notFound('Không tìm thấy ghi chú')
    const text = content?.trim() ?? ''
    if (!text) throw validation({ content: 'Nhập nội dung ghi chú' })
    if (text.length > 50) throw validation({ content: 'Ghi chú tối đa 50 ký tự' })
    if (quickNotesDb.some((q) => q.id !== id && q.content.toLowerCase() === text.toLowerCase())) {
      throw conflictError('Ghi chú đã có', undefined, {}, { content: 'Ghi chú đã có' })
    }
    const after = quickNotesDb.update(id, { content: text })!
    auditUpdate('QuickNote', before, after)
    publishPosEvent('menu-changed', { menuItemIds: [] })
    return after
  },

  async reorderQuickNotes(ids: string[]): Promise<void> {
    await mockDelay()
    requirePermission(permissions.menuItems.update)
    reorder(quickNotesDb.all(), ids, (id, sortOrder) => quickNotesDb.update(id, { sortOrder }))
    publishPosEvent('menu-changed', { menuItemIds: [] })
  },

  async deleteQuickNote(id: string): Promise<void> {
    await mockDelay()
    requirePermission(permissions.menuItems.delete)
    const before = quickNotesDb.get(id)
    if (!before) throw notFound('Không tìm thấy ghi chú')
    quickNotesDb.remove(id)
    auditDelete('QuickNote', before)
    publishPosEvent('menu-changed', { menuItemIds: [] })
  },
}

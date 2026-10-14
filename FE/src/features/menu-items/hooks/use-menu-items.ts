'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { menuService } from '@/features/pos/services/menu.service'
import type {
  MenuItemQuery,
  SaveCategoryRequest,
  SaveMenuItemRequest,
} from '@/features/pos/types/pos.types'

/**
 * Hook màn Thực đơn (SCR-11). Khóa bắt đầu bằng 'pos' để `usePosMutation` và sự kiện
 * thời gian thực `menu-changed` làm mới cùng lúc.
 */
export const menuItemKeys = {
  list: (query: MenuItemQuery) => ['pos', 'menu-items', 'list', query] as const,
  nextCode: ['pos', 'menu-items', 'next-code'] as const,
  categories: ['pos', 'categories'] as const,
  quickNotes: ['pos', 'quick-notes'] as const,
}

// ───── Món (07 §2.3) ─────

export function useMenuItems(query: MenuItemQuery) {
  return useQuery({
    queryKey: menuItemKeys.list(query),
    queryFn: () => menuService.menuItems(query),
    placeholderData: keepPreviousData,
  })
}

/** Gợi ý mã món kế tiếp: lấy mã lớn nhất hiện có rồi cộng 1 (M060 → M061) */
export function useNextMenuItemCode(enabled: boolean) {
  return useQuery({
    queryKey: menuItemKeys.nextCode,
    queryFn: async () => {
      const result = await menuService.menuItems({
        page: 1,
        pageSize: 1,
        sortBy: 'code',
        sortDir: 'desc',
      })
      const max = result.items.reduce((acc, item) => {
        const match = /^M(\d{3})$/.exec(item.code)
        return match ? Math.max(acc, Number(match[1])) : acc
      }, 0)
      return max >= 999 ? '' : `M${String(max + 1).padStart(3, '0')}`
    },
    enabled,
    staleTime: 0,
    // Không giữ mã cũ trong cache: mỗi lần mở hộp thêm món đều lấy mã mới nhất
    gcTime: 0,
  })
}

export const useSaveMenuItem = () =>
  usePosMutation(({ id, input }: { id?: string; input: SaveMenuItemRequest }) =>
    id ? menuService.updateMenuItem(id, input) : menuService.createMenuItem(input)
  )

export const useSetMenuItemAvailability = () =>
  usePosMutation(({ id, isSoldOut }: { id: string; isSoldOut: boolean }) =>
    menuService.setAvailability(id, isSoldOut)
  )

export const useSetMenuItemHidden = () =>
  usePosMutation(({ id, isHidden }: { id: string; isHidden: boolean }) =>
    menuService.setHidden(id, isHidden)
  )

export const useUploadMenuItemImage = () =>
  usePosMutation(({ id, file }: { id: string; file: File }) => menuService.uploadImage(id, file))

export const useDeleteMenuItem = () =>
  usePosMutation((id: string) => menuService.deleteMenuItem(id))

// ───── Danh mục (07 §2.2) ─────

export function useCategories() {
  return useQuery({ queryKey: menuItemKeys.categories, queryFn: menuService.categories })
}

export const useSaveCategory = () =>
  usePosMutation(({ id, input }: { id?: string; input: SaveCategoryRequest }) =>
    id ? menuService.updateCategory(id, input) : menuService.createCategory(input)
  )

export const useReorderCategories = () =>
  usePosMutation((ids: string[]) => menuService.reorderCategories(ids))

export const useDeleteCategory = () =>
  usePosMutation((id: string) => menuService.deleteCategory(id))

// ───── Ghi chú nhanh (07 §2.4) ─────

export function useQuickNotes() {
  return useQuery({ queryKey: menuItemKeys.quickNotes, queryFn: menuService.quickNotes })
}

export const useSaveQuickNote = () =>
  usePosMutation(({ id, content }: { id?: string; content: string }) =>
    id ? menuService.updateQuickNote(id, content) : menuService.createQuickNote(content)
  )

export const useReorderQuickNotes = () =>
  usePosMutation((ids: string[]) => menuService.reorderQuickNotes(ids))

export const useDeleteQuickNote = () =>
  usePosMutation((id: string) => menuService.deleteQuickNote(id))

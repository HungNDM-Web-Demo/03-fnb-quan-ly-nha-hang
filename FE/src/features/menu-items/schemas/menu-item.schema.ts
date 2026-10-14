import { z } from 'zod'
import type { KitchenStation, PricingType } from '@/features/pos/types/pos.types'

/**
 * Schema form màn Thực đơn. Câu lỗi giống hệt BE và mock (07 §2.2–§2.4, BR-28)
 * để kiểm tra phía FE và lỗi trả về từ API hiện cùng một chữ.
 */

export const MENU_ITEM_CODE_PATTERN = /^M\d{3}$/
export const MENU_ITEM_MESSAGES = {
  code: 'Mã món dạng M001',
  name: 'Nhập tên món',
  categoryId: 'Chọn danh mục',
  unit: 'Chọn đơn vị tính',
  pricePositive: 'Đơn giá phải lớn hơn 0',
  priceStep: 'Đơn giá phải là bội số 1.000 ₫',
  prepMinutes: 'Thời gian chuẩn từ 1 đến 120 phút',
} as const

/** Đơn vị gợi ý cho món theo suất (UC-03 3a); món theo trọng lượng luôn "kg" */
export const PORTION_UNITS = ['đĩa', 'phần', 'nồi', 'ly', 'lon', 'chai'] as const
export const WEIGHT_UNIT = 'kg'

/** Thời gian chuẩn mặc định khi chọn khu chế biến (06 Pos_MenuItems.PrepMinutes) */
export const defaultPrepMinutes = (station: KitchenStation): number | null =>
  station === 'KhongQuaBep' ? null : station === 'QuayBar' ? 5 : 15

const PRICING_TYPES = ['TheoSuat', 'TheoTrongLuong'] as const satisfies readonly PricingType[]
const STATIONS = [
  'BepNong',
  'BepNguoi',
  'QuayBar',
  'KhongQuaBep',
] as const satisfies readonly KitchenStation[]

export const menuItemSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(MENU_ITEM_CODE_PATTERN, MENU_ITEM_MESSAGES.code),
    name: z.string().trim().min(1, MENU_ITEM_MESSAGES.name).max(150, 'Tên món tối đa 150 ký tự'),
    categoryId: z.string().min(1, MENU_ITEM_MESSAGES.categoryId),
    description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự'),
    pricingType: z.enum(PRICING_TYPES),
    unit: z.string().trim().max(20, 'Đơn vị tối đa 20 ký tự'),
    price: z.number().nullable(),
    station: z.enum(STATIONS),
    prepMinutes: z.number().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.pricingType === 'TheoSuat' && !v.unit) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: MENU_ITEM_MESSAGES.unit })
    }
    if (v.price === null || !(v.price > 0)) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: MENU_ITEM_MESSAGES.pricePositive })
    } else if (v.price % 1000 !== 0) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: MENU_ITEM_MESSAGES.priceStep })
    }
    if (v.station !== 'KhongQuaBep') {
      const p = v.prepMinutes
      if (p === null || !Number.isInteger(p) || p < 1 || p > 120) {
        ctx.addIssue({
          code: 'custom',
          path: ['prepMinutes'],
          message: MENU_ITEM_MESSAGES.prepMinutes,
        })
      }
    }
  })
export type MenuItemFormValues = z.infer<typeof menuItemSchema>

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Nhập mã danh mục')
    .max(10, 'Mã danh mục tối đa 10 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Mã danh mục gồm chữ in hoa không dấu, số'),
  name: z.string().trim().min(1, 'Nhập tên danh mục').max(100, 'Tên danh mục tối đa 100 ký tự'),
  color: z.string().trim().regex(HEX_COLOR_PATTERN, 'Màu dạng #RRGGBB'),
  isHidden: z.boolean(),
})
export type CategoryFormValues = z.infer<typeof categorySchema>

export const QUICK_NOTE_MAX = 50
export const quickNoteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung ghi chú')
    .max(QUICK_NOTE_MAX, `Ghi chú tối đa ${QUICK_NOTE_MAX} ký tự`),
})
export type QuickNoteFormValues = z.infer<typeof quickNoteSchema>

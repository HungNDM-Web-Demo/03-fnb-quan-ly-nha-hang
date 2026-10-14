import { z } from 'zod'
import { PosRules } from '@/features/pos/lib/pos-rules'

export const DEPOSIT_MESSAGE = 'Tiền cọc từ 0 đến 5.000.000 ₫, bội số 1.000 ₫'
export const GUEST_MESSAGE = 'Số khách từ 1 đến 50'
export const PHONE_RESERVATION_MESSAGE = 'Số điện thoại không hợp lệ'

/** Chỉ giữ chữ số: "0903 456 789" → "0903456789" */
export const phoneDigits = (value: string) => value.replace(/\D/g, '')

/** Form thêm/sửa đặt bàn (FR-34, BR-24, BR-25; câu lỗi theo 07 §2.15) */
export const reservationFormSchema = z.object({
  customerName: z.string().trim().min(1, 'Nhập tên khách').max(150, 'Tên khách tối đa 150 ký tự'),
  phone: z
    .string()
    .trim()
    .refine((v) => /^0\d{9}$/.test(phoneDigits(v)) && /^[\d\s.]+$/.test(v), PHONE_RESERVATION_MESSAGE),
  date: z.string().min(1, 'Chọn ngày đến'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Chọn giờ đến'),
  guestCount: z
    .number({ error: GUEST_MESSAGE })
    .int(GUEST_MESSAGE)
    .min(PosRules.minGuests, GUEST_MESSAGE)
    .max(PosRules.maxGuests, GUEST_MESSAGE),
  deposit: z
    .number()
    .nullable()
    .refine((v) => v === null || (v >= 0 && v <= PosRules.maxDeposit && v % 1000 === 0), DEPOSIT_MESSAGE),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
  tableId: z.string().min(1, 'Chọn bàn'),
})

export type ReservationFormValues = z.infer<typeof reservationFormSchema>

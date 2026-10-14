import type { TableStatus } from '@/features/pos/types/pos.types'

/**
 * Lớp màu theo trạng thái bàn (token `--table-*` trong theme.css, 07 §4). Chuỗi lớp viết đủ để Tailwind quét được.
 * card: thẻ bàn; solid: chấm/nhãn nền đặc; text: chữ cùng màu; ring: viền khi chọn lọc.
 */
export const tableStatusStyle: Record<TableStatus, { card: string; solid: string; text: string; soft: string }> = {
  Trong: {
    card: 'border-table-empty/35 bg-card',
    solid: 'bg-table-empty text-table-foreground',
    text: 'text-table-empty',
    soft: 'bg-table-empty/10 text-table-empty border-table-empty/30',
  },
  DaDat: {
    card: 'border-table-reserved/60 bg-table-reserved/8',
    solid: 'bg-table-reserved text-table-foreground',
    text: 'text-table-reserved',
    soft: 'bg-table-reserved/10 text-table-reserved border-table-reserved/30',
  },
  DangPhucVu: {
    card: 'border-table-serving/60 bg-table-serving/8',
    solid: 'bg-table-serving text-table-foreground',
    text: 'text-table-serving',
    soft: 'bg-table-serving/10 text-table-serving border-table-serving/30',
  },
  ChoThanhToan: {
    card: 'border-table-billing/70 bg-table-billing/10',
    solid: 'bg-table-billing text-table-foreground',
    text: 'text-table-billing',
    soft: 'bg-table-billing/10 text-table-billing border-table-billing/30',
  },
  ChoDon: {
    card: 'border-table-cleaning/60 bg-table-cleaning/8',
    solid: 'bg-table-cleaning text-table-foreground',
    text: 'text-table-cleaning',
    soft: 'bg-table-cleaning/10 text-table-cleaning border-table-cleaning/30',
  },
  DaGop: {
    card: 'border-dashed border-table-merged/60 bg-table-merged/8',
    solid: 'bg-table-merged text-table-foreground',
    text: 'text-table-merged',
    soft: 'bg-table-merged/10 text-table-merged border-table-merged/30',
  },
}

/** Bo góc theo hình dạng bàn */
export const tableShapeClass = {
  Vuong: 'rounded-xl',
  Tron: 'rounded-[2.25rem]',
  ChuNhat: 'rounded-xl',
} as const

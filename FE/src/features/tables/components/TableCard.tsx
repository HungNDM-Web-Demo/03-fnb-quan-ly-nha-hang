'use client'

import { BellRing, CalendarClock, Clock3, Flame, Link2, Lock, Sparkles, Users } from 'lucide-react'
import { formatTime, formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatDuration, tableStatusLabels } from '@/features/pos/lib/labels'
import { tableSize } from '@/features/pos/lib/pos-rules'
import type { TableCardDto } from '@/features/pos/types/pos.types'
import { tableShapeClass, tableStatusStyle } from '../lib/table-style'

type TableCardProps = {
  table: TableCardDto
  /** Giờ máy chủ (ms) để tính thời gian ngồi */
  now: number
  onSelect?: (table: TableCardDto) => void
  dimmed?: boolean
  className?: string
}

/**
 * Thẻ bàn trên sơ đồ (FR-04): mã bàn, số khách, thời gian ngồi, tạm tính, huy hiệu món chờ ra,
 * biểu tượng món trễ; bàn đã gộp hiện "Đã gộp → T1-05"; bàn trống có đặt hiện giờ đến.
 * Vị trí theo ô lưới 12 × 8 (`x`, `y`), Vuông/Tròn 2×2, Chữ nhật 3×2.
 */
export function TableCard({ table, now, onSelect, dimmed, className }: TableCardProps) {
  const style = tableStatusStyle[table.status]
  const size = tableSize(table.shape)
  const seated = table.openedAt ? (now - new Date(table.openedAt).getTime()) / 60_000 : 0
  const busy = table.status === 'DangPhucVu' || table.status === 'ChoThanhToan'
  const label = [
    `Bàn ${table.code}`,
    tableStatusLabels[table.status],
    table.guestCount ? `${table.guestCount} khách` : '',
    table.readyCount ? `${table.readyCount} món chờ ra` : '',
    table.hasLateItems ? 'có món trễ' : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onClick={() => onSelect?.(table)}
      aria-label={label}
      style={{ gridColumn: `${table.x + 1} / span ${size.w}`, gridRow: `${table.y + 1} / span ${size.h}` }}
      className={cn(
        'group relative m-1 flex min-h-0 min-w-0 flex-col overflow-hidden border-2 p-2.5 text-left shadow-xs transition-[transform,box-shadow,opacity] duration-150',
        'hover:shadow-md focus-visible:ring-ring/60 focus-visible:ring-[3px] focus-visible:outline-none active:scale-[0.98]',
        tableShapeClass[table.shape],
        style.card,
        dimmed && 'opacity-30',
        className
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className={cn('text-lg leading-tight font-bold tracking-tight', style.text)}>{table.code}</span>
        <span className="ml-auto flex items-center gap-1">
          {table.hasLateItems && (
            <span className="bg-destructive text-destructive-foreground flex size-6 items-center justify-center rounded-full" title="Có món trễ">
              <Flame className="size-3.5" aria-hidden="true" />
            </span>
          )}
          {table.isLocked && (
            <span className="bg-warning/15 text-warning flex size-6 items-center justify-center rounded-full" title="Đang thu tiền">
              <Lock className="size-3.5" aria-hidden="true" />
            </span>
          )}
          {table.readyCount > 0 && (
            <span
              className="bg-cta text-cta-foreground flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-xs font-bold tabular-nums"
              title={`${table.readyCount} món chờ ra`}
            >
              <BellRing className="size-3" aria-hidden="true" />
              {table.readyCount}
            </span>
          )}
        </span>
      </div>

      {busy ? (
        <div className="mt-auto space-y-0.5 text-sm">
          <div className="text-foreground flex items-center gap-2">
            <span className="flex items-center gap-1 font-medium">
              <Users className="size-3.5 opacity-70" aria-hidden="true" />
              {table.guestCount ?? 0}
            </span>
            <span className="text-muted-foreground flex min-w-0 items-center gap-1 truncate text-xs">
              <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
              {formatDuration(seated)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-semibold tabular-nums">{formatVnd(table.subtotal ?? 0)}</span>
            {table.unsentCount > 0 && (
              <span className="text-warning shrink-0 text-xs font-medium" title="Món chưa gửi bếp">
                +{table.unsentCount} chưa gửi
              </span>
            )}
          </div>
          {table.mergedTableCodes.length > 0 && (
            <div className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <Link2 className="size-3" aria-hidden="true" />
              gộp {table.mergedTableCodes.join(', ')}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-auto space-y-0.5 text-xs">
          <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 font-semibold', style.soft)}>
            {table.status === 'DaGop' && table.mergedIntoTableCode
              ? `Đã gộp → ${table.mergedIntoTableCode}`
              : tableStatusLabels[table.status]}
          </span>
          {table.status === 'ChoDon' && (
            <div className="text-table-cleaning flex items-center gap-1 font-medium">
              <Sparkles className="size-3" aria-hidden="true" /> Chạm để báo dọn xong
            </div>
          )}
          {table.reservation && (table.status === 'Trong' || table.status === 'DaDat') && (
            <div className={cn('flex min-w-0 items-center gap-1 font-medium', table.reservation.isLate ? 'text-destructive' : 'text-table-reserved')}>
              <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {formatTime(table.reservation.arrivalAt)} · {table.reservation.customerName}
                {table.reservation.isLate ? ' · Trễ' : ''}
              </span>
            </div>
          )}
          {table.status === 'Trong' && !table.reservation && (
            <div className="text-muted-foreground">{table.capacity} chỗ</div>
          )}
        </div>
      )}
    </button>
  )
}

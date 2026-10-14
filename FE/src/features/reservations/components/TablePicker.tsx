'use client'

import { forwardRef } from 'react'
import { AlertCircle, AlertTriangle, Check, Info, Users } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { DiningTableDto } from '@/features/pos/types/pos.types'
import { cn } from '@/lib/utils'

type TablePickerProps = {
  value: string
  onChange: (tableId: string) => void
  /** Bàn gợi ý từ available-tables; undefined là chưa đủ thông tin để gợi ý */
  suggestions: DiningTableDto[] | undefined
  suggestionsLoading?: boolean
  /** Mọi bàn chưa ẩn (chọn bàn ngoài gợi ý) */
  allTables: DiningTableDto[] | undefined
  guestCount: number
  /** "19:00–21:00" */
  windowLabel?: string
  error?: string
}

/**
 * Chọn bàn cho đặt bàn (UC-13 bước 2): lưới bàn gợi ý trống đủ chỗ trong khung 120 phút,
 * kèm ô chọn từ mọi bàn để vẫn chọn được bàn ngoài gợi ý (máy chủ kiểm tra trùng, TC-41).
 */
export const TablePicker = forwardRef<HTMLDivElement, TablePickerProps>(function TablePicker(
  { value, onChange, suggestions, suggestionsLoading, allTables, guestCount, windowLabel, error },
  ref
) {
  const selected = allTables?.find((t) => t.id === value) ?? suggestions?.find((t) => t.id === value)
  const inSuggestions = !!suggestions?.some((t) => t.id === value)
  const overCapacity = !!selected && Number.isFinite(guestCount) && selected.capacity < guestCount

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="grid gap-2 outline-none"
      role="group"
      aria-labelledby="table-picker-label"
      aria-describedby={error ? 'table-picker-error' : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span id="table-picker-label" className="text-sm font-medium">
          Bàn <span className="text-destructive" aria-hidden="true">*</span>
        </span>
        <span className="text-muted-foreground text-[0.8125rem]">
          {windowLabel ? `Bàn trống đủ chỗ, giữ bàn ${windowLabel}` : 'Chọn ngày, giờ đến và số khách để xem bàn trống'}
        </span>
      </div>

      {suggestionsLoading && !suggestions ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : suggestions && suggestions.length > 0 ? (
        <div
          className={cn(
            'grid max-h-60 grid-cols-3 gap-2 overflow-y-auto rounded-lg p-0.5 transition-opacity sm:grid-cols-4',
            suggestionsLoading && 'opacity-60'
          )}
        >
          {suggestions.map((t) => {
            const active = t.id === value
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(t.id)}
                className={cn(
                  'focus-visible:ring-ring/50 relative flex min-h-16 cursor-pointer flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors duration-150 outline-none focus-visible:ring-3',
                  active ? 'border-primary bg-primary/10 ring-primary/40 ring-1' : 'bg-background hover:bg-muted/60'
                )}
              >
                <span className="font-semibold tabular-nums">{t.code}</span>
                <span className="text-muted-foreground flex w-full items-center gap-1 text-xs">
                  <span className="truncate">{t.areaName}</span>
                  <span aria-hidden="true">·</span>
                  <Users className="size-3 shrink-0" aria-hidden="true" />
                  <span className="shrink-0 tabular-nums">{t.capacity} chỗ</span>
                </span>
                {active && (
                  <Check className="text-primary absolute top-2 right-2 size-4" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      ) : suggestions ? (
        <p className="bg-muted/60 text-muted-foreground rounded-lg px-3 py-2.5 text-sm">
          Không còn bàn trống đủ chỗ trong khung giờ này. Đổi giờ đến hoặc chọn bàn khác bên dưới.
        </p>
      ) : null}

      <Select value={inSuggestions ? '' : value} onValueChange={onChange} disabled={!allTables?.length}>
        <SelectTrigger className="h-11" aria-label="Chọn bàn khác ngoài gợi ý">
          <SelectValue placeholder="Chọn bàn khác ngoài gợi ý" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {(allTables ?? []).map((t) => (
            <SelectItem key={t.id} value={t.id} className="min-h-10">
              {t.code} · {t.areaName} · {t.capacity} chỗ
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && !inSuggestions && suggestions && !error && (
        <p className="text-info flex items-start gap-1.5 text-[0.8125rem]">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Bàn {selected.code} không có trong gợi ý: có thể đã được giữ trong khung giờ này hoặc không đủ chỗ. Hệ thống kiểm tra khi lưu.
        </p>
      )}
      {overCapacity && (
        <p className="text-warning flex items-start gap-1.5 text-[0.8125rem] font-medium">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Bàn {selected.capacity} chỗ, đặt cho {guestCount} khách
        </p>
      )}
      {error && (
        <p id="table-picker-error" role="alert" className="text-destructive flex items-start gap-1 text-[0.8125rem]">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
})

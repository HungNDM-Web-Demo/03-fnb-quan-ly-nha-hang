'use client'

import { cn } from '@/lib/utils'
import { TABLE_STATUS_ORDER, tableStatusLabels } from '@/features/pos/lib/labels'
import type { TableStatus } from '@/features/pos/types/pos.types'
import { tableStatusStyle } from '../lib/table-style'

type StatusCountBarProps = {
  counts: Record<TableStatus, number>
  total: number
  filter: TableStatus | null
  onFilter: (status: TableStatus | null) => void
}

/** Thanh đếm theo trạng thái (FR-04, UC-02 1a): chạm một ô để chỉ hiện bàn trạng thái đó */
export function StatusCountBar({ counts, total, filter, onFilter }: StatusCountBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo trạng thái bàn">
      <button
        type="button"
        onClick={() => onFilter(null)}
        aria-pressed={filter === null}
        className={cn(
          'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
          filter === null ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent'
        )}
      >
        Tất cả
        <span className="tabular-nums font-bold">{total}</span>
      </button>
      {TABLE_STATUS_ORDER.map((status) => {
        const active = filter === status
        return (
          <button
            key={status}
            type="button"
            onClick={() => onFilter(active ? null : status)}
            aria-pressed={active}
            className={cn(
              'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
              active ? tableStatusStyle[status].soft : 'bg-card hover:bg-accent',
              active && 'ring-2 ring-current/30'
            )}
          >
            <span className={cn('size-2.5 rounded-full', tableStatusStyle[status].solid)} aria-hidden="true" />
            {tableStatusLabels[status]}
            <span className="tabular-nums font-bold">{counts[status] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

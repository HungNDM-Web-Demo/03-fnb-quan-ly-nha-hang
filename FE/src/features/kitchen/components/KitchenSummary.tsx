'use client'

import { useState } from 'react'
import { ChevronDown, Flame } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatQuantity, orderItemStatusLabels, stationLabels } from '@/features/pos/lib/labels'
import type { KitchenSummaryItem } from '@/features/pos/types/pos.types'

/** Chế độ tổng hợp (FR-18, UC-06 2b): số lượng từng món đang chờ để làm theo mẻ; chạm một món xem các bàn */
export function KitchenSummary({ items }: { items: KitchenSummaryItem[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!items.length) return <EmptyState title="Không còn món đang chờ" description="Bếp đã làm xong mọi món." />
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] items-start gap-3">
      {items.map((item) => {
        const expanded = open === item.menuItemId
        return (
          <li key={item.menuItemId} className="bg-card rounded-xl border-2">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : item.menuItemId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-primary min-w-16 text-4xl font-extrabold tabular-nums">
                {formatQuantity(item.totalQuantity, '', item.unit === 'kg' ? 'TheoTrongLuong' : 'TheoSuat').trim()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold">{item.itemName}</span>
                <span className="text-muted-foreground text-sm">
                  {item.unit} · {stationLabels[item.station]} · {item.lines.length} bàn
                </span>
              </span>
              <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
            {expanded && (
              <ul className="divide-y border-t">
                {item.lines.map((line) => (
                  <li key={line.itemId} className="flex items-center gap-3 px-4 py-2 text-base">
                    <span className="w-20 font-bold">{line.tableCode}</span>
                    <span className="tabular-nums">{formatQuantity(line.quantity, item.unit, item.unit === 'kg' ? 'TheoTrongLuong' : 'TheoSuat')}</span>
                    {line.isRush && <Flame className="text-destructive size-4" aria-label="Gấp" />}
                    <span className="text-muted-foreground ml-auto text-sm">
                      {orderItemStatusLabels[line.status].label} · {line.ticketCode} · {formatTime(line.sentAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

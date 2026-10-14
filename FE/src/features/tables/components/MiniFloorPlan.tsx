'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useFloorPlan } from '@/features/pos/hooks/use-pos'
import { tableStatusLabels } from '@/features/pos/lib/labels'
import { tableSize } from '@/features/pos/lib/pos-rules'
import type { TableCardDto } from '@/features/pos/types/pos.types'
import { tableShapeClass, tableStatusStyle } from '../lib/table-style'
import { FloorGrid } from './FloorGrid'

type MiniFloorPlanProps = {
  /** Bàn chọn được; bàn khác hiện mờ (UC-09 bước 2) */
  selectable: (table: TableCardDto) => boolean
  selected: string[]
  onToggle: (table: TableCardDto) => void
  initialAreaId?: string
}

/** Sơ đồ thu nhỏ từ `GET /api/floor-plan` cho hộp chuyển bàn, gộp bàn, chuyển món (SCR-05) */
export function MiniFloorPlan({ selectable, selected, onToggle, initialAreaId }: MiniFloorPlanProps) {
  const plan = useFloorPlan()
  const [areaId, setAreaId] = useState(initialAreaId)
  const areas = plan.data?.areas ?? []
  const current = areaId && areas.some((a) => a.id === areaId) ? areaId : areas[0]?.id
  if (plan.isLoading) return <Skeleton className="h-72 rounded-xl" />
  return (
    <div className="grid gap-2">
      <Tabs value={current ?? ''} onValueChange={setAreaId}>
        <TabsList className="h-10">
          {areas.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="h-8 px-3">
              {a.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FloorGrid className="h-[min(52svh,24rem)]">
        {(plan.data?.tables ?? [])
          .filter((t) => t.areaId === current)
          .map((t) => {
            const ok = selectable(t)
            const on = selected.includes(t.id)
            const size = tableSize(t.shape)
            return (
              <button
                key={t.id}
                type="button"
                disabled={!ok}
                onClick={() => onToggle(t)}
                aria-pressed={on}
                aria-label={`Bàn ${t.code}, ${tableStatusLabels[t.status]}${ok ? '' : ', không chọn được'}`}
                style={{ gridColumn: `${t.x + 1} / span ${size.w}`, gridRow: `${t.y + 1} / span ${size.h}` }}
                className={cn(
                  'relative m-0.5 flex min-h-0 min-w-0 flex-col items-start justify-between overflow-hidden border-2 p-1.5 text-left text-xs',
                  tableShapeClass[t.shape],
                  tableStatusStyle[t.status].card,
                  !ok && 'cursor-not-allowed opacity-30',
                  on && 'ring-primary ring-offset-background ring-[3px] ring-offset-1'
                )}
              >
                <span className={cn('text-sm font-bold', tableStatusStyle[t.status].text)}>{t.code}</span>
                <span className="text-muted-foreground w-full truncate">
                  {tableStatusLabels[t.status]}
                  {t.guestCount ? ` · ${t.guestCount} khách` : ` · ${t.capacity} chỗ`}
                </span>
                {on && (
                  <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-5 items-center justify-center rounded-full">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            )
          })}
      </FloorGrid>
    </div>
  )
}

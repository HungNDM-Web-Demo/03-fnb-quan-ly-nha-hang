'use client'

import { forwardRef } from 'react'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { cn } from '@/lib/utils'

type FloorGridProps = {
  children: React.ReactNode
  /** Hiện lưới nền (chế độ thiết lập) */
  showGrid?: boolean
  className?: string
}

/** Lưới sơ đồ 12 cột × 8 hàng (07 §2.6); thẻ bàn đặt bằng grid-column/grid-row */
export const FloorGrid = forwardRef<HTMLDivElement, FloorGridProps>(function FloorGrid(
  { children, showGrid, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative grid rounded-xl border p-1',
        showGrid ? 'bg-muted/40 border-dashed' : 'bg-muted/25',
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${PosRules.gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${PosRules.gridRows}, minmax(0, 1fr))`,
      }}
    >
      {showGrid &&
        Array.from({ length: PosRules.gridCols * PosRules.gridRows }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="border-border/70 pointer-events-none rounded-sm border border-dashed"
            style={{ gridColumn: (i % PosRules.gridCols) + 1, gridRow: Math.floor(i / PosRules.gridCols) + 1 }}
          />
        ))}
      {children}
    </div>
  )
})

'use client'

import { useMemo, useState } from 'react'
import { Scale, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { matchesSearch } from '@/lib/normalize'
import { cn } from '@/lib/utils'
import { MenuImage } from '@/features/pos/components/MenuImage'
import { formatUnitPrice } from '@/features/pos/lib/labels'
import type { MenuBundle, MenuItemDto } from '@/features/pos/types/pos.types'

type MenuPanelProps = {
  menu: MenuBundle | undefined
  isLoading: boolean
  disabled?: boolean
  disabledReason?: string
  onPick: (item: MenuItemDto) => void
}

/**
 * Thực đơn dạng lưới có ảnh (FR-11): lọc danh mục, tìm mã/tên không dấu; món tạm hết hiện mờ,
 * nhãn "Tạm hết", chạm không thêm được (FR-09, UC-05 E1).
 */
export function MenuPanel({ menu, isLoading, disabled, disabledReason, onPick }: MenuPanelProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const colors = useMemo(() => new Map((menu?.categories ?? []).map((c) => [c.id, c.color])), [menu])
  const items = useMemo(
    () =>
      (menu?.items ?? []).filter(
        (m) => (!categoryId || m.categoryId === categoryId) && (!keyword.trim() || matchesSearch(`${m.code} ${m.name}`, keyword))
      ),
    [menu, categoryId, keyword]
  )

  return (
    <section aria-label="Thực đơn" className="bg-card flex min-h-0 flex-col rounded-xl border">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo mã hoặc tên món…"
            aria-label="Tìm món"
            className="h-11 pr-10 pl-9"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md"
              aria-label="Xóa từ khóa"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Danh mục">
          <CategoryChip active={!categoryId} onClick={() => setCategoryId(null)}>
            Tất cả
          </CategoryChip>
          {(menu?.categories ?? []).map((c) => (
            <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} color={c.color}>
              {c.name}
            </CategoryChip>
          ))}
        </div>
      </div>
      {disabled && disabledReason && (
        <p className="bg-warning/12 text-warning border-b px-3 py-2 text-sm font-medium" role="status">
          {disabledReason}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Không có món phù hợp</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {items.map((item) => {
              const soldOut = item.isSoldOut
              const off = disabled || soldOut
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={off}
                    onClick={() => onPick(item)}
                    aria-label={`${item.name}, ${formatUnitPrice(item.price, item.pricingType)}${soldOut ? ', tạm hết' : ''}`}
                    className={cn(
                      'bg-background group flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition-[box-shadow,transform] duration-150',
                      off ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/50 hover:shadow-md active:scale-[0.98]'
                    )}
                  >
                    <div className="relative">
                      <MenuImage
                        imageUrl={item.imageUrl}
                        name={item.name}
                        color={colors.get(item.categoryId)}
                        className="aspect-[4/3] w-full"
                        textClassName="text-2xl"
                      />
                      {soldOut && (
                        <span className="bg-destructive text-destructive-foreground absolute top-1.5 left-1.5 rounded-md px-2 py-0.5 text-xs font-bold">
                          Tạm hết
                        </span>
                      )}
                      {item.pricingType === 'TheoTrongLuong' && (
                        <span className="bg-background/90 text-foreground absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold">
                          <Scale className="size-3" aria-hidden="true" />
                          kg
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-2">
                      <span className="line-clamp-2 text-sm leading-snug font-medium">{item.name}</span>
                      <span className="text-primary mt-auto text-sm font-bold tabular-nums">
                        {formatUnitPrice(item.price, item.pricingType)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function CategoryChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
      )}
    >
      {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
      {children}
    </button>
  )
}

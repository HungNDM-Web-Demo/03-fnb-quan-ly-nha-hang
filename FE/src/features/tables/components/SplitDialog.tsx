'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Minus, Plus, Split, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { formatQuantity, formatSignedVnd } from '@/features/pos/lib/labels'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { computeTotals, lineTotal } from '@/features/pos/lib/pricing'
import { orderService } from '@/features/pos/services/order.service'
import type { OrderDto, OrderItemDto } from '@/features/pos/types/pos.types'

type SplitDialogProps = {
  open: boolean
  order: OrderDto
  /** Số hóa đơn đang mở của bàn (tối đa 10, BR-18) */
  openOrderCount: number
  onOpenChange: (open: boolean) => void
  onSplit?: (orders: OrderDto[]) => void
}

/**
 * SCR-06 tách hóa đơn theo món (UC-10, FR-25, BR-18): cột trái hóa đơn gốc, cột phải hóa đơn mới; chạm món
 * để chuyển, dòng nhiều suất có +/−, món cân chỉ nguyên dòng. Mỗi cột tự tính phí phục vụ, thuế, làm tròn.
 */
export function SplitDialog({ open, order, openOrderCount, onOpenChange, onSplit }: SplitDialogProps) {
  const lines = order.items.filter((i) => i.status !== 'DaHuy' && i.status !== 'ChuaGui')
  const [columns, setColumns] = useState<Record<string, number>[]>([{}])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const nextKey = open ? `${order.id}:${order.version}` : ''
  if (nextKey !== key) {
    setKey(nextKey)
    setColumns([{}])
    setActive(0)
    setError(null)
  }
  const split = usePosMutation((parts: { items: { itemId: string; quantity: number }[] }[]) =>
    orderService.split(order.id, { parts, version: order.version })
  )
  if (!open) return null

  const taken = (id: string) => columns.reduce((s, c) => s + (c[id] ?? 0), 0)
  const left = (item: OrderItemDto) => item.quantity - taken(item.id)
  const maxColumns = PosRules.maxOrdersPerTable - openOrderCount

  const moveTo = (item: OrderItemDto, column: number, delta: number) => {
    setError(null)
    setColumns((cols) =>
      cols.map((c, i) => {
        if (i !== column) return c
        const current = c[item.id] ?? 0
        const weight = item.pricingType === 'TheoTrongLuong'
        const free = item.quantity - cols.reduce((s, x) => s + (x[item.id] ?? 0), 0)
        let next = weight ? (delta > 0 ? item.quantity : 0) : current + delta
        if (delta > 0 && !weight) next = Math.min(current + Math.min(delta, free), item.quantity)
        if (weight && delta > 0 && free < item.quantity) next = current
        return { ...c, [item.id]: Math.max(0, next) }
      })
    )
  }

  const totalsOf = (entries: { item: OrderItemDto; qty: number }[]) =>
    computeTotals({
      subtotal: entries.reduce((s, e) => s + lineTotal(e.item.pricingType, e.item.unitPrice, e.qty), 0),
      discountAmount: 0,
      serviceChargeRate: order.serviceChargeRate,
      vatRate: order.vatRate,
    })

  const originalEntries = lines.map((item) => ({ item, qty: left(item) })).filter((e) => e.qty > 0)
  const columnEntries = columns.map((c) =>
    lines.map((item) => ({ item, qty: c[item.id] ?? 0 })).filter((e) => e.qty > 0)
  )

  const submit = () => {
    if (!originalEntries.length) return setError('Hóa đơn gốc phải còn ít nhất 1 món')
    const parts = columnEntries
      .filter((entries) => entries.length)
      .map((entries) => ({ items: entries.map((e) => ({ itemId: e.item.id, quantity: e.qty })) }))
    if (!parts.length) return setError('Chọn món cần tách sang hóa đơn mới')
    split.mutate(parts, {
      onSuccess: (orders) => {
        toast.success(`Đã tách thành ${orders.length} hóa đơn`, { description: orders.map((o) => o.code).join(', ') })
        onOpenChange(false)
        onSplit?.(orders)
      },
      onError: (err) => setError(getErrorMessage(err)),
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !split.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[94svh] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="size-5" aria-hidden="true" />
            Tách hóa đơn {order.code}
          </DialogTitle>
          <DialogDescription>Chạm món ở cột gốc để chuyển sang hóa đơn mới đang chọn. Mỗi hóa đơn tính phí phục vụ, thuế, làm tròn riêng.</DialogDescription>
        </DialogHeader>
        {order.discount && (
          <p className="bg-warning/12 text-warning flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Giảm giá sẽ bị gỡ, cần áp lại sau khi tách
          </p>
        )}
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
          <SplitColumn title={`Hóa đơn gốc ${order.code}`} totals={totalsOf(originalEntries)}>
            {originalEntries.map(({ item, qty }) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => moveTo(item, active, 1)}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.itemName}</span>
                    <span className="text-muted-foreground text-xs">{formatQuantity(qty, item.unit, item.pricingType)}</span>
                  </span>
                  <span className="text-sm tabular-nums">{formatVnd(lineTotal(item.pricingType, item.unitPrice, qty))}</span>
                </button>
              </li>
            ))}
          </SplitColumn>
          {columns.map((_, index) => (
            <SplitColumn
              key={index}
              title={`Hóa đơn mới ${columns.length > 1 ? index + 1 : ''}`}
              totals={totalsOf(columnEntries[index])}
              active={active === index}
              onActivate={() => setActive(index)}
              onRemove={
                columns.length > 1
                  ? () => {
                      setColumns((cols) => cols.filter((__, i) => i !== index))
                      setActive(0)
                    }
                  : undefined
              }
            >
              {columnEntries[index].length === 0 && (
                <li className="text-muted-foreground px-2 py-6 text-center text-sm">Chạm món ở cột gốc để chuyển sang đây</li>
              )}
              {columnEntries[index].map(({ item, qty }) => {
                const weight = item.pricingType === 'TheoTrongLuong'
                return (
                  <li key={item.id} className="flex items-center gap-1.5 px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.itemName}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatVnd(lineTotal(item.pricingType, item.unitPrice, qty))}
                      </span>
                    </span>
                    {weight ? (
                      <span className="text-sm">{formatQuantity(qty, item.unit, item.pricingType)}</span>
                    ) : (
                      <>
                        <Button variant="outline" size="icon" className="size-9" aria-label="Bớt" onClick={() => moveTo(item, index, -1)}>
                          <Minus aria-hidden="true" />
                        </Button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
                        <Button variant="outline" size="icon" className="size-9" aria-label="Thêm" disabled={left(item) <= 0} onClick={() => moveTo(item, index, 1)}>
                          <Plus aria-hidden="true" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Trả ${item.itemName} về hóa đơn gốc`}
                      onClick={() => setColumns((cols) => cols.map((c, i) => (i === index ? { ...c, [item.id]: 0 } : c)))}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </SplitColumn>
          ))}
          {columns.length < maxColumns && (
            <button
              type="button"
              onClick={() => {
                setColumns((cols) => [...cols, {}])
                setActive(columns.length)
              }}
              className="text-muted-foreground hover:bg-accent flex w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm font-medium"
            >
              <Plus className="size-5" aria-hidden="true" />
              Thêm hóa đơn
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={split.isPending}>
            Hủy
          </Button>
          <Button className="h-11" onClick={submit} disabled={split.isPending}>
            {split.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Xác nhận tách
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SplitColumn({
  title,
  totals,
  active,
  onActivate,
  onRemove,
  children,
}: {
  title: string
  totals: ReturnType<typeof computeTotals>
  active?: boolean
  onActivate?: () => void
  onRemove?: () => void
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'bg-card flex w-72 shrink-0 flex-col rounded-xl border-2',
        active ? 'border-primary' : 'border-border'
      )}
      onClick={onActivate}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="flex-1 truncate text-sm font-semibold">{title}</h3>
        {active && <span className="bg-primary text-primary-foreground rounded px-1.5 text-xs">Đang chọn</span>}
        {onRemove && (
          <Button variant="ghost" size="icon" className="size-8" aria-label="Bỏ cột" onClick={(e) => { e.stopPropagation(); onRemove() }}>
            <X aria-hidden="true" />
          </Button>
        )}
      </header>
      <ul className="min-h-24 flex-1 overflow-y-auto p-1">{children}</ul>
      <dl className="space-y-0.5 border-t px-3 py-2 text-xs">
        <Row label="Tiền món" value={formatVnd(totals.subtotal)} />
        <Row label="Phí phục vụ" value={formatVnd(totals.serviceCharge)} />
        <Row label="Thuế GTGT" value={formatVnd(totals.vatAmount)} />
        <Row label="Làm tròn" value={formatSignedVnd(totals.rounding)} />
        <div className="flex justify-between pt-1 text-sm font-bold">
          <dt>Tổng</dt>
          <dd className="tabular-nums">{formatVnd(totals.total)}</dd>
        </div>
      </dl>
    </section>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="text-muted-foreground flex justify-between">
    <dt>{label}</dt>
    <dd className="tabular-nums">{value}</dd>
  </div>
)

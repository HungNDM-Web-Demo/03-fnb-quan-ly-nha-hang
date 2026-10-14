'use client'

import { useState } from 'react'
import { Loader2, Minus, MoveRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/api-error'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { formatQuantity, orderItemStatusLabels } from '@/features/pos/lib/labels'
import { orderService } from '@/features/pos/services/order.service'
import type { OrderDto, TableCardDto } from '@/features/pos/types/pos.types'
import { MiniFloorPlan } from './MiniFloorPlan'

type MoveItemsDialogProps = {
  open: boolean
  order: OrderDto
  /** Món chọn sẵn khi mở từ một dòng */
  initialItemId?: string
  areaId?: string
  onOpenChange: (open: boolean) => void
}

/** Chuyển món sang bàn khác đang phục vụ (UC-09 1b, FR-24, BR-17): giữ trạng thái chế biến, món cân chuyển nguyên dòng */
export function MoveItemsDialog({ open, order, initialItemId, areaId, onOpenChange }: MoveItemsDialogProps) {
  const lines = order.items.filter((i) => i.status !== 'DaHuy')
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [target, setTarget] = useState<TableCardDto | null>(null)
  const [key, setKey] = useState('')
  const nextKey = open ? `${order.id}:${initialItemId ?? ''}` : ''
  if (nextKey !== key) {
    setKey(nextKey)
    const item = lines.find((i) => i.id === initialItemId)
    setPicked(item ? { [item.id]: item.quantity } : {})
    setTarget(null)
  }
  const move = usePosMutation((v: { targetTableId: string; items: { itemId: string; quantity: number }[] }) =>
    orderService.moveItems(order.id, { ...v, version: order.version })
  )
  if (!open) return null
  const items = Object.entries(picked)
    .filter(([, q]) => q > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }))

  const submit = () => {
    if (!target || !items.length) return
    move.mutate(
      { targetTableId: target.id, items },
      {
        onSuccess: () => {
          toast.success(`Đã chuyển ${items.length} món sang ${target.code}`)
          onOpenChange(false)
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !move.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoveRight className="size-5" aria-hidden="true" />
            Chuyển món từ {order.tableCode}
          </DialogTitle>
          <DialogDescription>Chọn món, số lượng và bàn nhận đang phục vụ. Món giữ nguyên trạng thái chế biến.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <ul className="max-h-[50svh] divide-y overflow-y-auto rounded-lg border">
            {lines.map((item) => {
              const q = picked[item.id] ?? 0
              const weight = item.pricingType === 'TheoTrongLuong'
              return (
                <li key={item.id} className="flex items-center gap-2 p-2">
                  <Checkbox
                    checked={q > 0}
                    onCheckedChange={(on) => setPicked((p) => ({ ...p, [item.id]: on ? item.quantity : 0 }))}
                    aria-label={`Chọn ${item.itemName}`}
                    className="size-5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.itemName}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatQuantity(item.quantity, item.unit, item.pricingType)} · {orderItemStatusLabels[item.status].label}
                    </p>
                  </div>
                  {q > 0 && !weight && item.quantity > 1 && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="size-9" aria-label="Giảm" onClick={() => setPicked((p) => ({ ...p, [item.id]: Math.max(1, q - 1) }))}>
                        <Minus aria-hidden="true" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{q}</span>
                      <Button variant="outline" size="icon" className="size-9" aria-label="Tăng" onClick={() => setPicked((p) => ({ ...p, [item.id]: Math.min(item.quantity, q + 1) }))}>
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <MiniFloorPlan
            selectable={(t) => t.id !== order.tableId && (t.status === 'DangPhucVu' || t.status === 'ChoThanhToan')}
            selected={target ? [target.id] : []}
            onToggle={setTarget}
            initialAreaId={areaId}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Hủy
          </Button>
          <Button className="h-11" onClick={submit} disabled={!target || !items.length || move.isPending}>
            {move.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {target ? `Chuyển sang ${target.code}` : 'Chọn bàn nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

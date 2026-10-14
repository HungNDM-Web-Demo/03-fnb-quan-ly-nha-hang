'use client'

import { useState } from 'react'
import { Loader2, Minus, Plus, Users } from 'lucide-react'
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
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { splitEqualShares } from '@/features/pos/lib/pricing'
import { orderService } from '@/features/pos/services/order.service'
import type { OrderDto } from '@/features/pos/types/pos.types'

/** SCR-06 chia đều N phần (UC-10 1a, 1b; FR-26, BR-19; TC-32): phần dư cộng vào phần 1 */
export function SplitEqualDialog({ open, order, onOpenChange }: { open: boolean; order: OrderDto; onOpenChange: (open: boolean) => void }) {
  const [count, setCount] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCount(order.splitCount ?? 2)
      setError(null)
    }
  }
  const apply = usePosMutation((n: number) => orderService.splitEqual(order.id, { count: n, version: order.version }))
  const cancel = usePosMutation(() => orderService.cancelSplitEqual(order.id, order.version))
  if (!open) return null
  const valid = Number.isInteger(count) && count >= PosRules.minSplit && count <= PosRules.maxSplit
  const shares = valid ? splitEqualShares(order.total, order.deposit, count) : []
  const pending = apply.isPending || cancel.isPending

  const submit = () => {
    setError(null)
    if (!valid) return setError('Số người từ 2 đến 20')
    apply.mutate(count, {
      onSuccess: () => {
        toast.success(`Đã chia đều ${count} phần`)
        onOpenChange(false)
      },
      onError: (err) => setError(getFieldErrors(err).count ?? getErrorMessage(err)),
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" aria-hidden="true" />
            Chia đều hóa đơn {order.code}
          </DialogTitle>
          <DialogDescription>
            Tổng thanh toán {formatVnd(order.total)}
            {order.deposit ? `, trừ tiền cọc ${formatVnd(order.deposit)}` : ''}. Mỗi phần thu riêng bằng phương thức riêng.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="size-12" aria-label="Bớt một người" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            <Minus aria-hidden="true" />
          </Button>
          <input
            aria-label="Số người"
            inputMode="numeric"
            value={Number.isNaN(count) ? '' : count}
            onChange={(e) => setCount(e.target.value === '' ? NaN : Number(e.target.value.replace(/\D/g, '')))}
            className="bg-muted h-14 w-24 rounded-xl text-center text-3xl font-bold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button variant="outline" size="icon" className="size-12" aria-label="Thêm một người" onClick={() => setCount((c) => Math.min(99, (c || 0) + 1))}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
        {shares.length > 0 && (
          <ul className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
            {shares.map((amount, i) => (
              <li key={i} className="bg-muted/60 flex justify-between rounded-md px-3 py-2 text-sm">
                <span>Phần {i + 1}</span>
                <span className="font-semibold tabular-nums">{formatVnd(amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {order.splitCount ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Đã hủy chia đều')
                    onOpenChange(false)
                  },
                  onError: (err) => setError(getErrorMessage(err)),
                })
              }
            >
              Hủy chia đều
            </Button>
          ) : (
            <span />
          )}
          <Button className="h-11 min-w-28" onClick={submit} disabled={pending}>
            {apply.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Chia {valid ? count : ''} phần
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

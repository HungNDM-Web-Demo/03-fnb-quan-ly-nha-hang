'use client'

import { useState } from 'react'
import { Loader2, Percent, ShieldAlert } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ManagerApprovalDialog } from '@/features/pos/components/ManagerApprovalDialog'
import { MoneyInput } from '@/features/pos/components/MoneyInput'
import { errorCode, usePosMutation, useStoreProfile } from '@/features/pos/hooks/use-pos'
import { DISCOUNT_REASONS } from '@/features/pos/lib/labels'
import { discountAmountOf, discountLimitOf } from '@/features/pos/lib/pricing'
import { orderService } from '@/features/pos/services/order.service'
import type { DiscountType, OrderDto } from '@/features/pos/types/pos.types'

/**
 * Giảm giá hóa đơn (UC-11 2a, FR-29, BR-08): theo % (làm tròn xuống 1.000 ₫) hoặc số tiền, bắt buộc lý do;
 * vượt hạn mức thu ngân thì mở hộp Quản lý xác nhận (TC-37, TC-38).
 */
export function DiscountDialog({ open, order, onOpenChange }: { open: boolean; order: OrderDto; onOpenChange: (open: boolean) => void }) {
  const { can } = usePermissions()
  const profile = useStoreProfile()
  const [type, setType] = useState<DiscountType>('PhanTram')
  const [value, setValue] = useState<number | null>(null)
  const [reasonKind, setReasonKind] = useState<string>('')
  const [other, setOther] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setType(order.discount?.type ?? 'PhanTram')
      setValue(order.discount?.value ?? null)
      const r = order.discount?.reason ?? ''
      const known = (DISCOUNT_REASONS as readonly string[]).includes(r)
      setReasonKind(r ? (known ? r : 'Khac') : '')
      setOther(r && !known ? r.replace(/^Khác:\s*/, '') : '')
      setError(null)
    }
  }
  const reason = reasonKind === 'Khac' ? (other.trim() ? `Khác: ${other.trim()}` : '') : reasonKind
  const apply = usePosMutation((token: string | undefined) =>
    orderService.setDiscount(order.id, { type, value: value ?? 0, reason, approvalToken: token, version: order.version })
  )
  const remove = usePosMutation(() => orderService.removeDiscount(order.id, order.version))

  const limitRate = profile.data?.cashierDiscountLimit ?? 10
  const amount = value ? discountAmountOf(order.subtotal, type, value) : 0
  const limit = discountLimitOf(order.subtotal, limitRate)
  const over = amount > limit
  const needsApproval = over && !can(permissions.orders.discountOverride)

  const run = (token?: string) =>
    apply.mutate(token, {
      onSuccess: (o) => {
        toast.success(`Đã giảm ${formatVnd(o.discount?.amount ?? 0)}`, {
          description: o.discount?.approvedByUsername ? `Người duyệt: ${o.discount.approvedByUsername}` : undefined,
        })
        onOpenChange(false)
      },
      onError: (err) => {
        if (errorCode(err) === 'VuotHanMucGiamGia') return setApprovalOpen(true)
        const fields = getFieldErrors(err)
        setError(fields.value ?? fields.reason ?? getErrorMessage(err))
      },
    })

  const submit = () => {
    setError(null)
    if (!value) return setError(type === 'PhanTram' ? 'Phần trăm từ 1 đến 100' : 'Số tiền là bội số 1.000 ₫')
    if (type === 'PhanTram' && (!Number.isInteger(value) || value < 1 || value > 100)) return setError('Phần trăm từ 1 đến 100')
    if (type === 'SoTien' && value % 1000 !== 0) return setError('Số tiền là bội số 1.000 ₫')
    if (!reason) return setError('Chọn lý do giảm giá')
    if (needsApproval) return setApprovalOpen(true)
    run()
  }

  if (!open) return null
  const pending = apply.isPending || remove.isPending
  return (
    <>
      <Dialog open={!approvalOpen} onOpenChange={(next) => !pending && onOpenChange(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="size-5" aria-hidden="true" />
              Giảm giá hóa đơn {order.code}
            </DialogTitle>
            <DialogDescription>
              Tiền món {formatVnd(order.subtotal)} · thu ngân tự giảm tối đa {limitRate}% ({formatVnd(limit)})
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cách giảm">
            {(['PhanTram', 'SoTien'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => {
                  setType(t)
                  setValue(null)
                }}
                className={cn('h-11 rounded-lg border text-sm font-medium', type === t ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}
              >
                {t === 'PhanTram' ? 'Theo phần trăm' : 'Theo số tiền'}
              </button>
            ))}
          </div>
          {type === 'PhanTram' ? (
            <div className="relative">
              <Input
                aria-label="Phần trăm giảm"
                inputMode="numeric"
                value={value ?? ''}
                onChange={(e) => setValue(e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)}
                className="h-11 pr-8 text-right text-lg tabular-nums"
              />
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2">%</span>
            </div>
          ) : (
            <MoneyInput aria-label="Số tiền giảm" value={value} onChange={setValue} className="h-11 text-lg" />
          )}
          <div className="flex flex-wrap gap-1.5">
            {type === 'PhanTram' &&
              [5, 10, 15, 20].map((p) => (
                <Button key={p} type="button" variant="outline" size="sm" className="h-10" onClick={() => setValue(p)}>
                  {p}%
                </Button>
              ))}
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">
              Lý do <span className="text-destructive">*</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[...DISCOUNT_REASONS, 'Khac'].map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reasonKind === r}
                  onClick={() => setReasonKind(r)}
                  className={cn('h-11 rounded-lg border text-sm font-medium', reasonKind === r ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}
                >
                  {r === 'Khac' ? 'Khác' : r}
                </button>
              ))}
            </div>
            {reasonKind === 'Khac' && (
              <Input aria-label="Lý do khác" value={other} maxLength={190} onChange={(e) => setOther(e.target.value)} placeholder="Nhập lý do" className="h-11" />
            )}
          </div>
          <div className="bg-muted/60 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span>Số tiền giảm</span>
              <strong className="tabular-nums">{formatVnd(amount)}</strong>
            </div>
            {over && (
              <p className="text-warning mt-1 flex items-center gap-1.5 font-medium">
                <ShieldAlert className="size-4" aria-hidden="true" />
                Vượt hạn mức {limitRate}%{needsApproval ? ', cần quản lý xác nhận' : ''}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {order.discount ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => {
                      toast.success('Đã gỡ giảm giá')
                      onOpenChange(false)
                    },
                    onError: (err) => setError(getErrorMessage(err)),
                  })
                }
              >
                Gỡ giảm giá
              </Button>
            ) : (
              <span />
            )}
            <Button className="h-11 min-w-28" onClick={submit} disabled={pending}>
              {apply.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ManagerApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        action="GiamGia"
        description={`Giảm ${formatVnd(amount)} vượt hạn mức thu ngân ${formatVnd(limit)} (${limitRate}% tiền món). Quản lý nhập tài khoản để duyệt; tên người duyệt ghi trên hóa đơn.`}
        onApproved={(approval) => run(approval.token)}
      />
    </>
  )
}

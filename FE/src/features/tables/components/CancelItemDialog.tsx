'use client'

import { useState } from 'react'
import { Loader2, Minus, Plus, ShieldAlert } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ManagerApprovalDialog } from '@/features/pos/components/ManagerApprovalDialog'
import { errorCode, usePosMutation } from '@/features/pos/hooks/use-pos'
import { cancelReasonLabels, formatQuantity, orderItemStatusLabels } from '@/features/pos/lib/labels'
import { lineTotal } from '@/features/pos/lib/pricing'
import { orderService } from '@/features/pos/services/order.service'
import type { CancelReason, OrderDto, OrderItemDto } from '@/features/pos/types/pos.types'

const REASONS: Exclude<CancelReason, 'HetMon'>[] = ['KhachDoiY', 'GoiNham', 'ChoLau', 'Khac']
const NEEDS_APPROVAL = ['DangLam', 'Xong', 'DaPhucVu']

type CancelItemDialogProps = {
  order: OrderDto
  item: OrderItemDto | null
  onOpenChange: (open: boolean) => void
}

/**
 * Hủy món đã gửi bếp (UC-08, BR-13): chọn số lượng (món theo trọng lượng nguyên dòng) và lý do; món
 * "Đang làm", "Xong", "Đã phục vụ" cần quản lý xác nhận (SCR-07) trừ khi người dùng có `order-items.void-approve`.
 */
export function CancelItemDialog({ order, item, onOpenChange }: CancelItemDialogProps) {
  const { can } = usePermissions()
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState<Exclude<CancelReason, 'HetMon'> | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  if (item && item.id !== currentId) {
    setCurrentId(item.id)
    setQty(item.quantity)
    setReason(null)
    setNote('')
    setError(null)
  }
  if (!item && currentId) setCurrentId(null)

  const cancel = usePosMutation((token: string | undefined) =>
    orderService.cancelItem(order.id, item!.id, {
      quantity: qty,
      reason: reason!,
      note: note.trim() || undefined,
      approvalToken: token,
      version: order.version,
    })
  )
  if (!item) return null

  const weight = item.pricingType === 'TheoTrongLuong'
  const needsApproval = NEEDS_APPROVAL.includes(item.status) && !can(permissions.orderItems.voidApprove)
  const canSubmit = !!reason && (reason !== 'Khac' || !!note.trim())

  const run = (token?: string) =>
    cancel.mutate(token, {
      onSuccess: () => {
        toast.success(`Đã hủy ${formatQuantity(qty, item.unit, item.pricingType)} ${item.itemName}`)
        onOpenChange(false)
      },
      onError: (err) => {
        if (errorCode(err) === 'CanQuanLyDuyet') return setApprovalOpen(true)
        const fields = getFieldErrors(err)
        setError(fields.reason ?? fields.note ?? fields.quantity ?? getErrorMessage(err))
      },
    })

  const submit = () => {
    setError(null)
    if (!reason) return setError('Chọn lý do hủy')
    if (reason === 'Khac' && !note.trim()) return setError('Nhập ghi chú cho lý do Khác')
    if (needsApproval) return setApprovalOpen(true)
    run()
  }

  return (
    <>
      <Dialog open={!!item && !approvalOpen} onOpenChange={(next) => !cancel.isPending && onOpenChange(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy món</DialogTitle>
            <DialogDescription>
              {item.itemName} · {orderItemStatusLabels[item.status].label}
            </DialogDescription>
          </DialogHeader>
          {needsApproval && (
            <p className="bg-warning/12 text-warning flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Món bếp đã làm, cần quản lý xác nhận
            </p>
          )}
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Số lượng hủy</span>
            {weight ? (
              <p className="text-sm">
                {formatQuantity(item.quantity, item.unit, item.pricingType)} (món theo trọng lượng chỉ hủy nguyên dòng)
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="size-11" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Giảm">
                  <Minus aria-hidden="true" />
                </Button>
                <span className="min-w-16 text-center text-2xl font-bold tabular-nums">
                  {qty}/{item.quantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  onClick={() => setQty((q) => Math.min(item.quantity, q + 1))}
                  aria-label="Tăng"
                >
                  <Plus aria-hidden="true" />
                </Button>
                <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                  −{formatVnd(lineTotal(item.pricingType, item.unitPrice, qty))}
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">
              Lý do <span className="text-destructive">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Lý do hủy">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => {
                    setReason(r)
                    setError(null)
                  }}
                  className={cn(
                    'h-11 rounded-lg border text-sm font-medium',
                    reason === r ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {cancelReasonLabels[r]}
                </button>
              ))}
            </div>
            {reason === 'Khac' && (
              <Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú cho lý do Khác" aria-label="Ghi chú lý do" />
            )}
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
              Đóng
            </Button>
            <Button variant="destructive" className="h-11" onClick={submit} disabled={!canSubmit || cancel.isPending}>
              {cancel.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ManagerApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        action="HuyMon"
        description={`Hủy ${formatQuantity(qty, item.unit, item.pricingType)} ${item.itemName} (${orderItemStatusLabels[item.status].label.toLowerCase()}). Quản lý nhập tài khoản để duyệt; tên người duyệt được lưu cùng món hủy.`}
        onApproved={(approval) => run(approval.token)}
      />
    </>
  )
}

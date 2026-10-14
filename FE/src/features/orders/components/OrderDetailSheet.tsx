'use client'

import { useState } from 'react'
import { Ban, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage } from '@/lib/api-error'
import { formatDateTime, formatTime, formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOrder, usePosMutation } from '@/features/pos/hooks/use-pos'
import {
  formatQuantity,
  formatSignedVnd,
  orderItemStatusLabels,
  orderStatusLabels,
  paymentMethodLabels,
} from '@/features/pos/lib/labels'
import { vnDateKey } from '@/features/pos/lib/vn-time'
import { orderService } from '@/features/pos/services/order.service'
import { openPrint } from '@/features/tables/lib/print'

/** Chi tiết hóa đơn (UC-12 bước 3–5): món, món hủy, lượt thu, phục vụ, thu ngân; In lại; Hủy hóa đơn trong ngày */
export function OrderDetailSheet({ orderId, onOpenChange }: { orderId: string | null; onOpenChange: (open: boolean) => void }) {
  const { can } = usePermissions()
  const query = useOrder(orderId ?? undefined)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = usePosMutation((v: { id: string; reason: string }) => orderService.cancel(v.id, v.reason))
  const order = query.data
  const [today] = useState(() => vnDateKey(Date.now()))
  const canCancel =
    !!order && order.status === 'DaThanhToan' && !!order.paidAt && vnDateKey(order.paidAt) === today

  return (
    <Sheet open={!!orderId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Hóa đơn {order?.code ?? ''}
            {order && <StatusBadge tone={orderStatusLabels[order.status].tone}>{orderStatusLabels[order.status].label}</StatusBadge>}
          </SheetTitle>
          <SheetDescription>
            {order ? `Bàn ${order.tableCode} · ${order.areaName} · ${order.guestCount} khách` : 'Đang tải…'}
          </SheetDescription>
        </SheetHeader>
        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isLoading || !order ? (
          <div className="space-y-2 px-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-4 px-4 pb-6 text-sm">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Giờ mở</dt>
              <dd>{formatDateTime(order.openedAt)}</dd>
              <dt className="text-muted-foreground">Thanh toán</dt>
              <dd>{formatDateTime(order.paidAt)}</dd>
              <dt className="text-muted-foreground">Phục vụ</dt>
              <dd>{order.waiterName}</dd>
              <dt className="text-muted-foreground">Thu ngân</dt>
              <dd>{order.cashierName ?? '—'}</dd>
              {order.splitFromCode && (
                <>
                  <dt className="text-muted-foreground">Tách từ</dt>
                  <dd>{order.splitFromCode}</dd>
                </>
              )}
              {order.mergedTableCodes.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Bàn gộp</dt>
                  <dd>{order.mergedTableCodes.join(', ')}</dd>
                </>
              )}
              {order.cancelReason && (
                <>
                  <dt className="text-muted-foreground">Lý do hủy</dt>
                  <dd className="text-destructive">
                    {order.cancelReason}
                    {order.cancelledByUsername ? ` (${order.cancelledByUsername}, ${formatDateTime(order.cancelledAt)})` : ''}
                  </dd>
                </>
              )}
            </dl>
            <div>
              <h3 className="mb-1 font-semibold">Món</h3>
              <ul className="divide-y rounded-lg border">
                {order.items.map((item) => {
                  const cancelled = item.status === 'DaHuy'
                  return (
                    <li key={item.id} className={cn('flex gap-2 px-3 py-2', cancelled && 'text-muted-foreground')}>
                      <span className="w-14 shrink-0 tabular-nums">{formatQuantity(item.quantity, item.unit, item.pricingType)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn(cancelled && 'line-through')}>{item.itemName}</span>
                        {cancelled && item.cancel && (
                          <span className="text-destructive block text-xs">
                            Hủy: {item.cancel.reasonText} · {item.cancel.cancelledByUsername}
                            {item.cancel.approvedByUsername ? ` · duyệt ${item.cancel.approvedByUsername}` : ''} · lúc{' '}
                            {orderItemStatusLabels[item.cancel.statusAtCancel].label.toLowerCase()}
                          </span>
                        )}
                      </span>
                      <span className={cn('tabular-nums', cancelled && 'line-through')}>{formatVnd(item.lineTotal)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <dl className="space-y-1 rounded-lg border p-3">
              <Row label="Tiền món" value={formatVnd(order.subtotal)} />
              {order.discount && (
                <Row
                  label={`Giảm giá · ${order.discount.reason}${order.discount.approvedByUsername ? ` (duyệt ${order.discount.approvedByUsername})` : ''}`}
                  value={`−${formatVnd(order.discount.amount)}`}
                />
              )}
              <Row label={`Phí phục vụ ${order.serviceChargeRate}%`} value={formatVnd(order.serviceCharge)} />
              <Row label={`Thuế GTGT ${order.vatRate}%`} value={formatVnd(order.vatAmount)} />
              <Row label="Làm tròn" value={formatSignedVnd(order.rounding)} />
              <div className="flex justify-between border-t pt-1 font-bold">
                <dt>Tổng thanh toán</dt>
                <dd className="tabular-nums">{formatVnd(order.total)}</dd>
              </div>
              {order.depositRefund > 0 && <Row label="Hoàn cọc" value={formatVnd(order.depositRefund)} />}
            </dl>
            {order.payments.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Lượt thu</h3>
                <ul className="space-y-1">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>
                        {formatTime(p.paidAt)} · {paymentMethodLabels[p.method]}
                        {p.shareNo ? ` · phần ${p.shareNo}` : ''}
                        {p.cardLast4 ? ` · ****${p.cardLast4}` : ''}
                        {p.cashReceived ? ` · khách đưa ${formatVnd(p.cashReceived)}` : ''}
                        {p.changeAmount ? ` · thối ${formatVnd(p.changeAmount)}` : ''}
                      </span>
                      <span className="font-medium tabular-nums">{formatVnd(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {can(permissions.orders.reprint) && (order.status === 'DaThanhToan' || order.status === 'DaHuy') && (
                <Button variant="outline" className="h-11" onClick={() => openPrint(order.id, { reprint: true })}>
                  <Printer aria-hidden="true" /> In lại
                </Button>
              )}
              {can(permissions.orders.cancel) && order.status === 'DaThanhToan' && (
                <Button
                  variant="outline"
                  className="text-destructive h-11"
                  disabled={!canCancel}
                  title={canCancel ? undefined : 'Chỉ hủy được hóa đơn thanh toán trong ngày'}
                  onClick={() => {
                    setReason('')
                    setError(null)
                    setCancelOpen(true)
                  }}
                >
                  <Ban aria-hidden="true" /> Hủy hóa đơn
                </Button>
              )}
            </div>
            {can(permissions.orders.cancel) && order.status === 'DaThanhToan' && !canCancel && (
              <p className="text-muted-foreground text-xs">Chỉ hủy được hóa đơn thanh toán trong ngày.</p>
            )}
          </div>
        )}
        {order && (
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title={`Hủy hóa đơn ${order.code}?`}
            description="Hóa đơn chuyển “Đã hủy”, không tính doanh thu. Lượt thu vẫn được lưu."
            confirmText="Hủy hóa đơn"
            variant="destructive"
            loading={cancel.isPending}
            onConfirm={async () => {
              if (!reason.trim()) {
                setError('Nhập lý do hủy')
                throw new Error('Nhập lý do hủy')
              }
              try {
                await cancel.mutateAsync({ id: order.id, reason: reason.trim() })
                toast.success(`Đã hủy hóa đơn ${order.code}`)
              } catch (err) {
                setError(getErrorMessage(err))
                throw err
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="order-cancel-reason">
                Lý do hủy <span className="text-destructive">*</span>
              </Label>
              <Textarea id="order-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: Nhập nhầm" />
              {error && <p className="text-destructive text-sm">{error}</p>}
              {cancel.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            </div>
          </ConfirmDialog>
        )}
      </SheetContent>
    </Sheet>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="shrink-0 tabular-nums">{value}</dd>
  </div>
)

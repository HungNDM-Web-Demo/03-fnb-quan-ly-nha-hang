'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Lock, Percent, Printer, Split, Users } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { usePermissions } from '@/hooks/use-permissions'
import { formatTime, formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useTableService } from '@/features/pos/hooks/use-pos'
import { formatQuantity, formatSignedVnd, orderStatusLabels, paymentMethodLabels } from '@/features/pos/lib/labels'
import type { OrderDto, PaymentResultDto } from '@/features/pos/types/pos.types'
import { DiscountDialog } from '../components/DiscountDialog'
import { PaymentPanel } from '../components/PaymentPanel'
import { SplitDialog } from '../components/SplitDialog'
import { SplitEqualDialog } from '../components/SplitEqualDialog'
import { useTabletLayout } from '../hooks/use-tablet-layout'
import { openPrint } from '../lib/print'

/**
 * SCR-08 Thanh toán (UC-10, UC-11; FR-28..31): món, tiền món, giảm giá, phí phục vụ, thuế GTGT, làm tròn,
 * tiền cọc, tổng thanh toán, số còn phải thu; thu nhiều lượt; đủ tiền thì chốt, mở bản in, bàn "Chờ dọn".
 */
export function CheckoutPage({ tableId, initialOrderId }: { tableId: string; initialOrderId?: string }) {
  useTabletLayout()
  const router = useRouter()
  const { can } = usePermissions()
  const service = useTableService(tableId)
  const [orderId, setOrderId] = useState(initialOrderId)
  const [done, setDone] = useState<PaymentResultDto | null>(null)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitEqualOpen, setSplitEqualOpen] = useState(false)

  const orders = service.data?.orders ?? []
  const order: OrderDto | undefined = orders.find((o) => o.id === orderId) ?? orders[0]
  const table = service.data?.table

  const onPaid = (result: PaymentResultDto) => {
    if (result.completed) {
      setDone(result)
      toast.success(`Đã thanh toán ${result.order.code}`, {
        description: result.changeAmount ? `Tiền thối ${formatVnd(result.changeAmount)}` : undefined,
      })
      openPrint(result.order.id, {}, false)
    } else {
      toast.success(`Đã thu ${formatVnd(result.payment.amount)} (${paymentMethodLabels[result.payment.method]})`, {
        description: [
          result.changeAmount ? `Tiền thối ${formatVnd(result.changeAmount)}` : '',
          `Còn phải thu ${formatVnd(result.order.remaining)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }
  }

  let body: React.ReactNode
  if (service.error) body = <ErrorState error={service.error} onRetry={() => void service.refetch()} />
  else if (service.isLoading) body = <Skeleton className="h-[70svh] rounded-xl" />
  else if (done) {
    const o = done.order
    body = (
      <div className="bg-card mx-auto max-w-lg space-y-4 rounded-xl border p-6 text-center">
        <CheckCircle2 className="text-success mx-auto size-14" aria-hidden="true" />
        <h2 className="text-xl font-bold">Đã thanh toán {o.code}</h2>
        <p className="text-3xl font-bold tabular-nums">{formatVnd(o.total)}</p>
        {done.changeAmount > 0 && (
          <p className="text-success text-lg font-semibold">Tiền thối {formatVnd(done.changeAmount)}</p>
        )}
        {o.depositRefund > 0 && <p className="font-medium">Hoàn cọc tiền mặt {formatVnd(o.depositRefund)}</p>}
        <p className="text-muted-foreground text-sm">
          {orders.length > 0 ? `Bàn còn ${orders.length} hóa đơn chưa thu.` : `Bàn ${o.tableCode} chuyển “Chờ dọn”.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-12" onClick={() => openPrint(o.id)}>
            <Printer aria-hidden="true" /> In hóa đơn
          </Button>
          {orders.length > 0 ? (
            <Button className="h-12" onClick={() => { setDone(null); setOrderId(orders[0].id) }}>
              Thu hóa đơn tiếp theo
            </Button>
          ) : (
            <Button className="h-12" onClick={() => router.push(routePath.tables)}>
              Về sơ đồ bàn
            </Button>
          )}
        </div>
      </div>
    )
  } else if (!order) {
    body = (
      <EmptyState
        title="Bàn không có hóa đơn cần thu"
        description="Hóa đơn đã thanh toán hoặc bàn đang trống."
        action={
          <Button asChild className="h-11">
            <Link href={routePath.tables}>Về sơ đồ bàn</Link>
          </Button>
        }
      />
    )
  } else {
    const sent = order.items.filter((i) => i.status !== 'ChuaGui')
    const unsent = order.counts.unsent
    body = (
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_27rem]">
        <section className="bg-card flex min-h-0 flex-col rounded-xl border">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <h2 className="font-semibold">Hóa đơn {order.code}</h2>
            <StatusBadge tone={orderStatusLabels[order.status].tone}>{orderStatusLabels[order.status].label}</StatusBadge>
            {order.splitFromCode && <span className="text-muted-foreground text-xs">tách từ {order.splitFromCode}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              {can(permissions.orders.discount) && (
                <Button variant="outline" className="h-10" disabled={order.isLocked} onClick={() => setDiscountOpen(true)}>
                  <Percent aria-hidden="true" /> Giảm giá
                </Button>
              )}
              {can(permissions.orders.split) && (
                <>
                  <Button variant="outline" className="h-10" disabled={order.isLocked} onClick={() => setSplitOpen(true)}>
                    <Split aria-hidden="true" /> Tách hóa đơn
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => setSplitEqualOpen(true)}>
                    <Users aria-hidden="true" /> Chia đều
                  </Button>
                </>
              )}
            </div>
          </header>
          {unsent > 0 && (
            <p className="bg-warning/12 text-warning px-4 py-2 text-sm font-medium" role="alert">
              Còn {unsent} món chưa gửi bếp. Quay lại màn gọi món để gửi hoặc xóa trước khi thu tiền.
            </p>
          )}
          {order.isLocked && (
            <p className="bg-warning/10 text-warning flex items-center gap-2 px-4 py-2 text-sm font-medium">
              <Lock className="size-4" aria-hidden="true" /> Hóa đơn đang thu tiền: không thêm món, hủy món, giảm giá, tách, chia lại.
            </p>
          )}
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {sent.map((item) => {
              const cancelled = item.status === 'DaHuy'
              return (
                <li key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-sm', cancelled && 'text-muted-foreground')}>
                  <span className="w-16 shrink-0 tabular-nums">{formatQuantity(item.quantity, item.unit, item.pricingType)}</span>
                  <span className={cn('min-w-0 flex-1', cancelled && 'line-through')}>
                    {item.itemName}
                    {item.pricingType === 'TheoTrongLuong' && (
                      <span className="text-muted-foreground block text-xs">× {formatVnd(item.unitPrice)}/kg</span>
                    )}
                    {cancelled && item.cancel && <span className="text-destructive block text-xs no-underline">Đã hủy · {item.cancel.reasonText}</span>}
                  </span>
                  <span className={cn('tabular-nums', cancelled && 'line-through')}>{formatVnd(item.lineTotal)}</span>
                </li>
              )
            })}
          </ul>
          {order.payments.length > 0 && (
            <div className="border-t px-4 py-3">
              <h3 className="mb-1.5 text-sm font-semibold">Các lượt thu</h3>
              <ul className="space-y-1 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {formatTime(p.paidAt)} · {paymentMethodLabels[p.method]}
                      {p.shareNo ? ` · phần ${p.shareNo}` : ''}
                      {p.cardLast4 ? ` · thẻ ****${p.cardLast4}` : ''}
                      {p.changeAmount ? ` · thối ${formatVnd(p.changeAmount)}` : ''}
                    </span>
                    <span className="font-medium tabular-nums">{formatVnd(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <dl className="bg-card space-y-1 rounded-xl border p-4 text-sm">
            <SummaryRow label="Tiền món" value={formatVnd(order.subtotal)} />
            {order.discount && (
              <SummaryRow
                label={`Giảm giá${order.discount.type === 'PhanTram' ? ` ${order.discount.value}%` : ''} · ${order.discount.reason}${
                  order.discount.approvedByUsername ? ` (duyệt: ${order.discount.approvedByUsername})` : ''
                }`}
                value={`−${formatVnd(order.discount.amount)}`}
              />
            )}
            <SummaryRow label={`Phí phục vụ ${order.serviceChargeRate}%`} value={formatVnd(order.serviceCharge)} />
            <SummaryRow label={`Thuế GTGT ${order.vatRate}%`} value={formatVnd(order.vatAmount)} />
            <SummaryRow label="Làm tròn" value={formatSignedVnd(order.rounding)} />
            <div className="flex items-baseline justify-between border-t pt-2">
              <dt className="font-semibold">Tổng thanh toán</dt>
              <dd className="text-2xl font-bold tabular-nums">{formatVnd(order.total)}</dd>
            </div>
            {order.deposit > 0 && <SummaryRow label="Tiền cọc" value={`−${formatVnd(Math.min(order.deposit, order.total))}`} />}
            {order.paidAmount > 0 && <SummaryRow label="Đã thu (gồm cọc)" value={formatVnd(order.paidAmount)} />}
            <div className="flex items-baseline justify-between">
              <dt className="font-semibold">Còn phải thu</dt>
              <dd className="text-primary text-xl font-bold tabular-nums">{formatVnd(order.remaining)}</dd>
            </div>
          </dl>
          {unsent === 0 && order.items.some((i) => i.status !== 'ChuaGui' && i.status !== 'DaHuy') && (
            <PaymentPanel order={order} onPaid={onPaid} />
          )}
        </aside>
      </div>
    )
  }

  return (
    <PermissionGuard permission={permissions.orders.checkout} redirect>
      <div className="-mx-1 -mb-20 flex h-[calc(100svh-6.5rem)] min-h-[36rem] flex-col gap-3 sm:-mx-2 lg:-mx-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Về màn gọi món">
            <Link href={routePath.tableService(tableId)}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Thanh toán {table?.code ?? ''}</h1>
          {table?.guestCount ? <span className="text-muted-foreground text-sm">{table.guestCount} khách</span> : null}
          {!done && orders.length > 1 && (
            <div className="ml-2 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Hóa đơn của bàn">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={o.id === order?.id}
                  onClick={() => setOrderId(o.id)}
                  className={cn(
                    'flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                    o.id === order?.id ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent'
                  )}
                >
                  {o.code} <span className="tabular-nums">{formatVnd(o.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {body}
      </div>
      {order && <DiscountDialog open={discountOpen} order={order} onOpenChange={setDiscountOpen} />}
      {order && (
        <SplitDialog
          open={splitOpen}
          order={order}
          openOrderCount={orders.length}
          onOpenChange={setSplitOpen}
          onSplit={(list) => setOrderId(list[list.length - 1]?.id)}
        />
      )}
      {order && <SplitEqualDialog open={splitEqualOpen} order={order} onOpenChange={setSplitEqualOpen} />}
    </PermissionGuard>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}

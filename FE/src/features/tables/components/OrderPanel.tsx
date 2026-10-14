'use client'

import { ChefHat, CreditCard, Flame, Loader2, MoreVertical, MoveRight, Printer, Send, Trash2, XCircle } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatTime, formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatQuantity, formatSignedVnd, orderItemStatusLabels } from '@/features/pos/lib/labels'
import { isBillable } from '@/features/pos/lib/pricing'
import type { OrderDto, OrderItemDto } from '@/features/pos/types/pos.types'

export type OrderPanelProps = {
  order: OrderDto
  can: {
    edit: boolean
    cancelItem: boolean
    moveItem: boolean
    prebill: boolean
    checkout: boolean
  }
  pending: { send: boolean; prebill: boolean; serve: boolean }
  onEditDraft: (item: OrderItemDto) => void
  onDeleteDraft: (item: OrderItemDto) => void
  onServe: (item: OrderItemDto) => void
  onCancelItem: (item: OrderItemDto) => void
  onMoveItem: (item: OrderItemDto) => void
  onSend: () => void
  onPrebill: () => void
  onCheckout: () => void
}

/**
 * Danh sách món của bàn (FR-11): "Chưa gửi bếp" và "Đã gửi bếp" theo lần gọi, trạng thái từng món;
 * tạm tính cập nhật ngay; nút Gửi bếp / In tạm tính / Thanh toán vô hiệu kèm lý do bằng chữ (07 §4).
 */
export function OrderPanel({ order, can, pending, ...on }: OrderPanelProps) {
  const drafts = order.items.filter((i) => i.status === 'ChuaGui')
  const sent = order.items.filter((i) => i.status !== 'ChuaGui')
  const draftTotal = drafts.reduce((s, i) => s + i.lineTotal, 0)
  const batches = [...new Set(sent.map((i) => i.batchNo ?? 0))].sort((a, b) => a - b)
  const unsentReason = order.counts.unsent > 0 ? `Còn ${order.counts.unsent} món chưa gửi bếp` : null
  const lockedReason = order.isLocked ? 'Hóa đơn đang thu tiền' : null
  const noItemsReason = !order.items.some((i) => isBillable(i.status)) ? 'Hóa đơn chưa có món' : null
  const sendReason = lockedReason ?? (drafts.length === 0 ? 'Chưa có món mới để gửi bếp' : null)
  const prebillReason = unsentReason ?? lockedReason ?? noItemsReason
  const checkoutReason = unsentReason ?? noItemsReason
  const hint = unsentReason ?? lockedReason ?? (sent.length ? null : noItemsReason)

  return (
    <section aria-label="Món của bàn" className="bg-card flex min-h-0 flex-col rounded-xl border">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bg-muted/60 sticky top-0 z-10 flex items-center justify-between border-b px-3 py-2 backdrop-blur">
          <h2 className="text-sm font-semibold">Chưa gửi bếp ({drafts.length})</h2>
          {drafts.length > 0 && <span className="text-muted-foreground text-xs tabular-nums">+{formatVnd(draftTotal)}</span>}
        </div>
        {drafts.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Chạm món bên trái để thêm.</p>
        ) : (
          <ul className="divide-y">
            {drafts.map((item) => (
              <li key={item.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!can.edit}
                  onClick={() => on.onEditDraft(item)}
                  className="hover:bg-accent flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                >
                  <ItemText item={item} />
                  <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{formatVnd(item.lineTotal)}</span>
                </button>
                {can.edit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive mr-1 size-11 shrink-0"
                    aria-label={`Xóa ${item.itemName}`}
                    onClick={() => on.onDeleteDraft(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="bg-muted/60 sticky top-0 z-10 flex items-center justify-between border-y px-3 py-2 backdrop-blur">
          <h2 className="text-sm font-semibold">Đã gửi bếp</h2>
          {order.counts.ready > 0 && <StatusBadge tone="success">{order.counts.ready} món chờ ra</StatusBadge>}
        </div>
        {sent.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Chưa gửi món nào.</p>
        ) : (
          batches.map((batch) => {
            const items = sent.filter((i) => (i.batchNo ?? 0) === batch)
            return (
              <div key={batch}>
                <p className="text-muted-foreground px-3 pt-2 text-xs font-semibold tracking-wide uppercase">
                  Lần {batch} · {formatTime(items[0]?.sentAt)}
                </p>
                <ul className="divide-y">
                  {items.map((item) => {
                    const cancelled = item.status === 'DaHuy'
                    const actions = !cancelled && !order.isLocked && (can.cancelItem || can.moveItem)
                    return (
                      <li key={item.id} className={cn('flex min-h-14 items-center gap-2 px-3 py-2', cancelled && 'opacity-60')}>
                        <ItemText item={item} />
                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                          <span className={cn('text-sm tabular-nums', cancelled && 'line-through')}>{formatVnd(item.lineTotal)}</span>
                          {item.status === 'Xong' && can.edit && (
                            <Button size="sm" className="h-9" disabled={pending.serve} onClick={() => on.onServe(item)}>
                              Đã ra
                            </Button>
                          )}
                          {actions && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-10" aria-label={`Thao tác với ${item.itemName}`}>
                                  <MoreVertical aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {can.cancelItem && (
                                  <DropdownMenuItem className="text-destructive h-11" onSelect={() => on.onCancelItem(item)}>
                                    <XCircle aria-hidden="true" />
                                    Hủy món
                                  </DropdownMenuItem>
                                )}
                                {can.moveItem && (
                                  <DropdownMenuItem className="h-11" onSelect={() => on.onMoveItem(item)}>
                                    <MoveRight aria-hidden="true" />
                                    Chuyển món
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        <dl className="space-y-0.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tiền món (đã gửi)</dt>
            <dd className="font-semibold tabular-nums">{formatVnd(order.subtotal)}</dd>
          </div>
          {order.discount && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Giảm giá</dt>
              <dd className="tabular-nums">−{formatVnd(order.discount.amount)}</dd>
            </div>
          )}
          <div className="text-muted-foreground flex justify-between text-xs">
            <dt>
              Phí phục vụ {order.serviceChargeRate}%, thuế GTGT {order.vatRate}%, làm tròn {formatSignedVnd(order.rounding)}
            </dt>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-semibold">Tạm tính</dt>
            <dd className="text-primary text-lg font-bold tabular-nums">{formatVnd(order.total)}</dd>
          </div>
          {order.deposit > 0 && (
            <div className="text-muted-foreground flex justify-between text-xs">
              <dt>Tiền cọc đặt bàn</dt>
              <dd className="tabular-nums">−{formatVnd(order.deposit)}</dd>
            </div>
          )}
        </dl>
        {can.edit && (
          <ActionButton
            label={`Gửi bếp${drafts.length ? ` (${drafts.length} món)` : ''}`}
            icon={pending.send ? Loader2 : Send}
            spin={pending.send}
            reason={sendReason}
            disabled={pending.send}
            onClick={on.onSend}
            className="bg-cta text-cta-foreground hover:bg-cta/90 h-12 w-full text-base"
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {can.prebill && (
            <ActionButton
              label="In tạm tính"
              icon={pending.prebill ? Loader2 : Printer}
              spin={pending.prebill}
              reason={prebillReason}
              disabled={pending.prebill}
              onClick={on.onPrebill}
              variant="outline"
              className="h-12"
            />
          )}
          {can.checkout && (
            <ActionButton
              label="Thanh toán"
              icon={CreditCard}
              reason={checkoutReason}
              onClick={on.onCheckout}
              className="h-12"
            />
          )}
        </div>
        {hint && (
          <p className="text-warning text-xs font-medium" role="status">
            {hint}
          </p>
        )}
      </div>
    </section>
  )
}

function ItemText({ item }: { item: OrderItemDto }) {
  const status = orderItemStatusLabels[item.status]
  const cancelled = item.status === 'DaHuy'
  return (
    <span className="min-w-0 flex-1">
      <span className={cn('flex items-start gap-1.5 text-sm font-medium', cancelled && 'line-through')}>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{formatQuantity(item.quantity, item.unit, item.pricingType)}</span>
        <span className="line-clamp-2 min-w-0">{item.itemName}</span>
        {item.isRush && <Flame className="text-destructive size-3.5 shrink-0" aria-label="Gấp" />}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
        {item.status !== 'ChuaGui' && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        {item.isLate && <StatusBadge tone="danger">Trễ</StatusBadge>}
        {item.isSoldOut && <StatusBadge tone="danger">Tạm hết</StatusBadge>}
        {item.station === 'KhongQuaBep' && item.status !== 'ChuaGui' && !cancelled && (
          <span className="text-muted-foreground">không qua bếp</span>
        )}
        {item.kitchenTicketCode && (
          <span className="text-muted-foreground flex items-center gap-0.5">
            <ChefHat className="size-3" aria-hidden="true" />
            {item.kitchenTicketCode}
          </span>
        )}
        {[...item.quickNotes, item.note].filter(Boolean).map((n) => (
          <span key={n} className="bg-muted rounded px-1.5 py-0.5 font-medium">
            {n}
          </span>
        ))}
        {item.cancel && <span className="text-destructive">{item.cancel.reasonText}</span>}
      </span>
    </span>
  )
}

function ActionButton({
  label,
  icon: Icon,
  spin,
  reason,
  disabled,
  onClick,
  variant,
  className,
}: {
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  spin?: boolean
  reason: string | null
  disabled?: boolean
  onClick: () => void
  variant?: 'outline'
  className?: string
}) {
  return (
    <Button
      variant={variant}
      className={className}
      disabled={!!reason || disabled}
      onClick={onClick}
      title={reason ?? undefined}
      aria-describedby={undefined}
    >
      <Icon className={cn(spin && 'animate-spin')} aria-hidden={true} />
      {label}
    </Button>
  )
}

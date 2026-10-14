'use client'

import { useRef } from 'react'
import { ArrowRight, Check, CheckCheck, Flame, MoreHorizontal, Play, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatClock, formatQuantity, stationLabels } from '@/features/pos/lib/labels'
import { waitLevel } from '@/features/pos/lib/pos-rules'
import type { KitchenTicketDto, KitchenTicketItemDto } from '@/features/pos/types/pos.types'

export type TicketAction = 'start' | 'done' | 'undo' | 'out-of-stock' | 'acknowledge'

type KitchenTicketCardProps = {
  ticket: KitchenTicketDto
  now: number
  flash?: boolean
  canUpdate: boolean
  busy?: boolean
  onItem: (ticket: KitchenTicketDto, item: KitchenTicketItemDto, action: TicketAction) => void
  onDoneAll: (ticket: KitchenTicketDto) => void
}

const LEVEL_STYLE = [
  { header: 'bg-kds-ok/18 text-kds-ok border-kds-ok/50', border: 'border-kds-ok/50', label: '' },
  { header: 'bg-kds-warn/20 text-kds-warn border-kds-warn/60', border: 'border-kds-warn/70', label: 'Sắp trễ' },
  { header: 'bg-kds-late/22 text-kds-late border-kds-late/70', border: 'border-kds-late', label: 'Trễ' },
] as const

const isCooking = (i: KitchenTicketItemDto) => i.status === 'ChoLam' || i.status === 'DangLam'

/**
 * Thẻ phiếu bếp (FR-15, FR-16, FR-17; BR-10..BR-13): mã bàn, lần gọi, phục vụ, giờ gửi, đồng hồ chờ,
 * món ≥ 20 px kèm ghi chú tô đậm, nhãn "GẤP"; màu phiếu là màu nặng nhất của các món đang chờ.
 * Nhấn giữ 500 ms dòng "Chờ làm" mở menu "Hết món" (07 §4).
 */
export function KitchenTicketCard({ ticket, now, flash, canUpdate, busy, onItem, onDoneAll }: KitchenTicketCardProps) {
  const waitMs = now - new Date(ticket.sentAt).getTime()
  const level = ticket.items
    .filter(isCooking)
    .reduce<0 | 1 | 2>((max, i) => {
      const l = waitLevel(waitMs / 60_000, i.prepMinutes)
      return (l > max ? l : max) as 0 | 1 | 2
    }, 0)
  const done = ticket.status === 'DaXong'
  const style = LEVEL_STYLE[done ? 0 : level]
  const cooking = ticket.items.some(isCooking)

  return (
    <article
      aria-label={`Phiếu ${ticket.code} bàn ${ticket.tableCode}`}
      className={cn(
        'bg-card flex flex-col overflow-hidden rounded-xl border-2 shadow-sm',
        done ? 'border-border opacity-90' : style.border,
        ticket.hasUnacknowledgedCancel && 'border-destructive ring-destructive/60 ring-2',
        flash && 'kds-flash'
      )}
    >
      <header className={cn('border-b-2 px-3 py-2', done ? 'bg-muted text-muted-foreground' : style.header)}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-2xl leading-tight font-extrabold">
              {ticket.tableCode}
              {ticket.fromTableCode && <span className="text-base font-semibold"> (từ {ticket.fromTableCode})</span>}
            </p>
            <p className="text-foreground/80 text-sm font-medium">
              Lần {ticket.batchNo} · {ticket.code} · {stationLabels[ticket.station]}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums" aria-label="Thời gian chờ">
              {done && ticket.completedAt ? formatTime(ticket.completedAt) : formatClock(waitMs)}
            </p>
            {!done && style.label && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-bold uppercase',
                  level === 2 ? 'bg-kds-late text-background' : 'bg-kds-warn text-background'
                )}
              >
                {style.label}
              </span>
            )}
          </div>
        </div>
        <div className="text-foreground/75 mt-1 flex items-center gap-2 text-xs">
          <span>{ticket.waiterName}</span>
          <span>· gửi {formatTime(ticket.sentAt)}</span>
          {ticket.isRush && (
            <span className="bg-destructive text-destructive-foreground ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-extrabold">
              <Flame className="size-3.5" aria-hidden="true" />
              GẤP
            </span>
          )}
        </div>
      </header>
      <ul className="divide-border/70 flex-1 divide-y">
        {ticket.items.map((item) => (
          <TicketItemRow key={item.id} ticket={ticket} item={item} now={now} canUpdate={canUpdate} busy={busy} onItem={onItem} />
        ))}
      </ul>
      {canUpdate && cooking && (
        <footer className="border-t p-2">
          <Button className="h-12 w-full text-base font-semibold" disabled={busy} onClick={() => onDoneAll(ticket)}>
            <CheckCheck aria-hidden="true" />
            Xong cả phiếu
          </Button>
        </footer>
      )}
    </article>
  )
}

function TicketItemRow({
  ticket,
  item,
  now,
  canUpdate,
  busy,
  onItem,
}: {
  ticket: KitchenTicketDto
  item: KitchenTicketItemDto
  now: number
  canUpdate: boolean
  busy?: boolean
  onItem: KitchenTicketCardProps['onItem']
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const cancelled = item.status === 'DaHuy'
  const doneItem = item.status === 'Xong' || item.status === 'DaPhucVu'
  const late = isCooking(item) && waitLevel((now - new Date(ticket.sentAt).getTime()) / 60_000, item.prepMinutes) === 2

  const startPress = () => {
    if (!canUpdate || item.status !== 'ChoLam') return
    timer.current = setTimeout(() => menuTrigger.current?.click(), 500)
  }
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <li
      className={cn('flex flex-col gap-1.5 px-3 py-2.5 select-none', cancelled && 'bg-destructive/8')}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onContextMenu={(e) => {
        if (canUpdate && item.status === 'ChoLam') {
          e.preventDefault()
          menuTrigger.current?.click()
        }
      }}
    >
      <div className="min-w-0">
        <p className={cn('text-xl leading-snug font-bold', (cancelled || doneItem) && 'line-through', doneItem && 'text-kds-ok', late && 'text-kds-late')}>
          <span className="tabular-nums">{formatQuantity(item.quantity, item.unit, item.pricingType)}</span> {item.itemName}
          {item.isRush && <Flame className="text-destructive ml-1 inline size-5 align-[-3px]" aria-label="Gấp" />}
        </p>
        {(item.note || item.quickNotes.length > 0) && (
          <p className="text-foreground mt-0.5 text-base font-extrabold">{[...item.quickNotes, item.note].filter(Boolean).join(' · ')}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {item.status === 'DangLam' && <span className="bg-info/20 text-info rounded px-1.5 py-0.5">Đang làm</span>}
          {item.status === 'Xong' && <span className="bg-kds-ok/20 text-kds-ok rounded px-1.5 py-0.5">Xong</span>}
          {item.status === 'DaPhucVu' && <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">Đã ra</span>}
          {cancelled && (
            <span className="bg-destructive text-destructive-foreground rounded px-1.5 py-0.5 uppercase">
              Đã hủy{item.cancel ? ` · ${item.cancel.reasonText}` : ''}
            </span>
          )}
          {item.movedToTableCode && (
            <span className="bg-warning/20 text-warning flex items-center gap-0.5 rounded px-1.5 py-0.5">
              <ArrowRight className="size-3" aria-hidden="true" />
              {item.movedToTableCode}
            </span>
          )}
          {isCooking(item) && <span className="text-muted-foreground">chuẩn {item.prepMinutes} phút</span>}
        </div>
      </div>
      {canUpdate && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 empty:hidden">
          {item.status === 'ChoLam' && (
            <Button variant="outline" className="h-12 px-3" disabled={busy} onClick={() => onItem(ticket, item, 'start')}>
              <Play aria-hidden="true" />
              Bắt đầu
            </Button>
          )}
          {isCooking(item) && (
            <Button className="bg-kds-ok text-background hover:bg-kds-ok/90 h-12 px-3" disabled={busy} onClick={() => onItem(ticket, item, 'done')}>
              <Check aria-hidden="true" />
              Xong
            </Button>
          )}
          {item.status === 'Xong' && ticket.status === 'DaXong' && (
            <Button variant="outline" className="h-12 px-3" disabled={busy} onClick={() => onItem(ticket, item, 'undo')}>
              <Undo2 aria-hidden="true" />
              Hoàn tác
            </Button>
          )}
          {item.status === 'DaPhucVu' && ticket.status === 'DaXong' && (
            <Button variant="outline" className="h-12 px-3" disabled={busy} onClick={() => onItem(ticket, item, 'undo')}>
              <Undo2 aria-hidden="true" />
              Hoàn tác
            </Button>
          )}
          {cancelled && item.cancel && !item.cancel.acknowledged && (
            <Button variant="destructive" className="h-12 px-3" disabled={busy} onClick={() => onItem(ticket, item, 'acknowledge')}>
              Đã biết
            </Button>
          )}
          {item.status === 'ChoLam' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={menuTrigger} variant="ghost" size="icon" className="size-12" aria-label={`Thêm thao tác cho ${item.itemName}`}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive h-12 text-base" onSelect={() => onItem(ticket, item, 'out-of-stock')}>
                  Hết món
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </li>
  )
}

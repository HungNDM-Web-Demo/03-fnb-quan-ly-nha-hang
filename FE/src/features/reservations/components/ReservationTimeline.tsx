'use client'

import { useEffect, useMemo, useRef } from 'react'
import { CalendarX2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { reservationStatusLabels } from '@/features/pos/lib/labels'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { vnDateKey, vnHhmm, vnMinuteOfDay } from '@/features/pos/lib/vn-time'
import type { DiningTableDto, ReservationDto } from '@/features/pos/types/pos.types'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  RESERVATION_STATUSES,
  fromMinutes,
  holdUntilMs,
  reservationAccentClass,
  reservationBlockClass,
  reservationTextClass,
  toMinutes,
} from '../lib/reservation-view'

const HOUR_PX = 104
const ROW_H = 64
const LABEL_W = 112
const HEADER_H = 40

type ReservationTimelineProps = {
  dateKey: string
  reservations: ReservationDto[] | undefined
  tables: DiningTableDto[] | undefined
  isLoading?: boolean
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  openTime: string
  closeTime: string
  now: number
  onlyBooked: boolean
  onOnlyBookedChange: (value: boolean) => void
  onSelect: (reservation: ReservationDto) => void
}

type TimelineRow = {
  tableId: string
  code: string
  areaName: string
  capacity?: number
  lanes: { reservation: ReservationDto; start: number; end: number; lane: number }[]
  laneCount: number
}

const px = (minutes: number) => (minutes / 60) * HOUR_PX

/** Dòng thời gian đặt bàn theo bàn trong một ngày (FR-35, UC-13 bước 1). */
export function ReservationTimeline({
  dateKey,
  reservations,
  tables,
  isLoading,
  isFetching,
  error,
  onRetry,
  openTime,
  closeTime,
  now,
  onlyBooked,
  onOnlyBookedChange,
  onSelect,
}: ReservationTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)

  const list = useMemo(() => reservations ?? [], [reservations])
  const isToday = dateKey === vnDateKey(now)

  // Trục giờ: từ giờ mở cửa tới giờ đóng cửa, kéo dài thêm nếu khối giữ bàn vượt giờ đóng cửa
  const axis = useMemo(() => {
    const open = toMinutes(openTime)
    const close = toMinutes(closeTime)
    const start = Math.floor(open / 60) * 60
    let end = Math.ceil(close / 60) * 60
    for (const r of list) {
      const until = vnDateKey(holdUntilMs(r)) === dateKey ? vnMinuteOfDay(holdUntilMs(r)) : 24 * 60
      end = Math.max(end, Math.ceil(until / 60) * 60)
    }
    end = Math.min(Math.max(end, start + 60), 24 * 60)
    return { start, end, close, hours: Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60) }
  }, [openTime, closeTime, list, dateKey])

  const trackWidth = px(axis.end - axis.start)

  const groups = useMemo(() => {
    const byTable = new Map<string, ReservationDto[]>()
    for (const r of list) byTable.set(r.tableId, [...(byTable.get(r.tableId) ?? []), r])

    const rows: TimelineRow[] = []
    const known = new Set<string>()
    const makeRow = (tableId: string, code: string, areaName: string, capacity?: number): TimelineRow => {
      const items = [...(byTable.get(tableId) ?? [])].sort(
        (a, b) => new Date(a.arrivalAt).getTime() - new Date(b.arrivalAt).getTime()
      )
      const laneEnds: number[] = []
      const lanes = items.map((reservation) => {
        const start = Math.max(vnMinuteOfDay(reservation.arrivalAt), axis.start)
        const end = Math.min(start + PosRules.holdMinutes, axis.end)
        let lane = laneEnds.findIndex((e) => e <= start)
        if (lane === -1) lane = laneEnds.length
        laneEnds[lane] = end
        return { reservation, start, end, lane }
      })
      return { tableId, code, areaName, capacity, lanes, laneCount: Math.max(1, laneEnds.length) }
    }
    for (const t of tables ?? []) {
      known.add(t.id)
      rows.push(makeRow(t.id, t.code, t.areaName, t.capacity))
    }
    // Bàn đã ẩn nhưng còn đặt bàn trong ngày vẫn phải hiện
    for (const r of list) {
      if (known.has(r.tableId)) continue
      known.add(r.tableId)
      rows.push(makeRow(r.tableId, r.tableCode, r.areaName))
    }

    const visible = onlyBooked ? rows.filter((r) => r.lanes.length > 0) : rows
    const result: { areaName: string; rows: TimelineRow[] }[] = []
    for (const row of visible) {
      const group = result.find((g) => g.areaName === row.areaName)
      if (group) group.rows.push(row)
      else result.push({ areaName: row.areaName, rows: [row] })
    }
    return result
  }, [list, tables, onlyBooked, axis.start, axis.end])

  const nowMinute = vnMinuteOfDay(now)
  const showNow = isToday && nowMinute >= axis.start && nowMinute <= axis.end

  // Cuộn ngang tới "bây giờ" (hôm nay) hoặc tới đặt bàn sớm nhất, một lần cho mỗi ngày
  const ready = !isLoading && !!reservations && !!tables
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !ready || scrolledFor.current === dateKey) return
    scrolledFor.current = dateKey
    let target: number | null = null
    if (isToday) target = vnMinuteOfDay(Date.now())
    else if (list.length) target = Math.min(...list.map((r) => vnMinuteOfDay(r.arrivalAt)))
    el.scrollLeft = target === null ? 0 : Math.max(0, px(target - axis.start) - 120)
  }, [ready, dateKey, isToday, list, axis.start])

  const counts = useMemo(() => {
    const c = { ChoDen: 0, DaNhanBan: 0, KhongDen: 0, DaHuy: 0, guests: 0 }
    for (const r of list) {
      c[r.status] += 1
      if (r.status === 'ChoDen' || r.status === 'DaNhanBan') c.guests += r.guestCount
    }
    return c
  }, [list])

  if (error) {
    return (
      <div className="bg-card rounded-xl border">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  }

  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-xl border shadow-xs">
      <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Chú thích trạng thái">
          {RESERVATION_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('size-3 rounded-sm border', reservationBlockClass[s])} aria-hidden="true">
                <span className={cn('block h-full w-1 rounded-l-sm', reservationAccentClass[s])} />
              </span>
              <span>
                {reservationStatusLabels[s].label}{' '}
                <span className="text-muted-foreground tabular-nums">({counts[s]})</span>
              </span>
            </li>
          ))}
          <li className="text-muted-foreground">
            <span className="text-foreground font-medium tabular-nums">{counts.guests}</span> khách đã đặt
          </li>
        </ul>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id="only-booked" checked={onlyBooked} onCheckedChange={onOnlyBookedChange} />
          <Label htmlFor="only-booked" className="cursor-pointer">
            Chỉ bàn có đặt
          </Label>
        </div>
      </div>

      {isLoading || !tables ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rowCount === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="Chưa có đặt bàn trong ngày này"
          description="Tắt “Chỉ bàn có đặt” để xem mọi bàn, hoặc thêm đặt bàn mới."
        />
      ) : (
        <div
          ref={scrollRef}
          className={cn(
            'relative max-h-[calc(100dvh-17rem)] min-h-80 overflow-auto overscroll-contain transition-opacity duration-200',
            isFetching && 'opacity-70'
          )}
          aria-busy={isFetching}
        >
          <div className="relative" style={{ width: LABEL_W + trackWidth }}>
            {/* Trục giờ */}
            <div className="bg-card sticky top-0 z-20 flex border-b" style={{ height: HEADER_H }}>
              <div
                className="bg-card text-muted-foreground sticky left-0 z-30 flex items-center border-r px-3 text-xs font-semibold tracking-wide uppercase"
                style={{ width: LABEL_W, minWidth: LABEL_W }}
              >
                Bàn
              </div>
              <div className="relative" style={{ width: trackWidth }}>
                {axis.hours.map((h) => (
                  <span
                    key={h}
                    className="text-muted-foreground absolute top-0 flex h-full items-center pl-1.5 text-xs font-medium tabular-nums"
                    style={{ left: px(h - axis.start) }}
                  >
                    {fromMinutes(h)}
                  </span>
                ))}
                {showNow && (
                  <span
                    className="bg-destructive text-destructive-foreground absolute bottom-1 z-10 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                    style={{ left: px(nowMinute - axis.start) }}
                  >
                    {vnHhmm(now)}
                  </span>
                )}
              </div>
            </div>

            {/* Lưới giờ, vùng sau giờ đóng cửa, vạch bây giờ */}
            <div
              className="pointer-events-none absolute bottom-0 z-0"
              style={{ top: HEADER_H, left: LABEL_W, width: trackWidth }}
              aria-hidden="true"
            >
              {axis.close < axis.end && (
                <div
                  className="bg-muted/50 absolute inset-y-0"
                  style={{ left: px(axis.close - axis.start), right: 0 }}
                />
              )}
              {axis.hours.map((h) => (
                <div key={h} className="border-border absolute inset-y-0 border-l" style={{ left: px(h - axis.start) }}>
                  <div className="border-border/60 absolute inset-y-0 border-l border-dashed" style={{ left: HOUR_PX / 2 }} />
                </div>
              ))}
              {showNow && (
                <div className="bg-destructive absolute inset-y-0 z-[6] w-0.5" style={{ left: px(nowMinute - axis.start) - 1 }} />
              )}
            </div>

            {groups.map((group) => (
              <div key={group.areaName || '—'}>
                <div className="bg-muted/70 relative z-10 flex h-8 items-center border-b">
                  <span className="text-foreground sticky left-0 px-3 text-xs font-semibold">
                    {group.areaName || 'Khác'}{' '}
                    <span className="text-muted-foreground font-normal">· {group.rows.length} bàn</span>
                  </span>
                </div>
                {group.rows.map((row) => (
                  <div key={row.tableId} className="flex border-b last:border-b-0" style={{ height: row.laneCount * ROW_H }}>
                    <div
                      className="bg-card sticky left-0 z-10 flex flex-col justify-center border-r px-3"
                      style={{ width: LABEL_W, minWidth: LABEL_W }}
                    >
                      <span className="font-semibold tabular-nums">{row.code}</span>
                      {row.capacity !== undefined && (
                        <span className="text-muted-foreground text-xs">{row.capacity} chỗ</span>
                      )}
                    </div>
                    <div className="relative" style={{ width: trackWidth }}>
                      {row.lanes.map(({ reservation: r, start, end, lane }) => {
                        const status = reservationStatusLabels[r.status]
                        const until = vnHhmm(holdUntilMs(r))
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => onSelect(r)}
                            aria-label={`${r.code}: ${r.customerName}, ${vnHhmm(r.arrivalAt)} đến ${until}, ${r.guestCount} khách, bàn ${r.tableCode}, ${status.label}${r.isLate ? ', trễ' : ''}`}
                            className={cn(
                              'focus-visible:ring-ring/50 absolute z-[5] flex cursor-pointer flex-col justify-center overflow-hidden rounded-md border py-1 pr-2 pl-3 text-left text-xs leading-[1.3] shadow-xs transition-colors duration-150 outline-none focus-visible:ring-3',
                              reservationBlockClass[r.status],
                              r.isLate && 'bg-warning/12 border-warning/50 hover:bg-warning/20'
                            )}
                            style={{
                              left: px(start - axis.start) + 2,
                              width: Math.max(px(end - start) - 4, 40),
                              top: lane * ROW_H + 4,
                              height: ROW_H - 8,
                            }}
                          >
                            <span
                              className={cn(
                                'absolute inset-y-0 left-0 w-1',
                                r.isLate ? 'bg-warning' : reservationAccentClass[r.status]
                              )}
                              aria-hidden="true"
                            />
                            <span className="text-foreground truncate text-[13px] font-semibold">{r.customerName}</span>
                            <span className="text-muted-foreground truncate tabular-nums">
                              {vnHhmm(r.arrivalAt)}–{until} · {r.guestCount} khách
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className={cn('shrink-0 font-semibold', reservationTextClass[r.status])}>{status.label}</span>
                              {r.isLate && (
                                <span className="bg-warning text-warning-foreground shrink-0 rounded px-1 text-[10px] leading-4 font-semibold">
                                  Trễ
                                </span>
                              )}
                              {r.deposit > 0 && (
                                <span className="text-muted-foreground truncate tabular-nums">· Cọc {formatVnd(r.deposit)}</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isLoading && tables && list.length === 0 && !onlyBooked && (
        <p className="text-muted-foreground border-t px-4 py-3 text-sm">Chưa có đặt bàn nào trong ngày này.</p>
      )}
    </div>
  )
}

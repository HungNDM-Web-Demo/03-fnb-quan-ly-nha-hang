'use client'

import { AlertCircle, CalendarClock, DoorOpen, Loader2, Pencil, Phone, Users, XCircle } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { reservationStatusLabels } from '@/features/pos/lib/labels'
import { vnDateKey, vnHhmm } from '@/features/pos/lib/vn-time'
import type { ReservationDto } from '@/features/pos/types/pos.types'
import { getErrorMessage } from '@/lib/api-error'
import { formatPhone, formatVnd } from '@/lib/format'
import { canCheckInToday, formatDateKeyLong, formatVnDateTime, holdUntilMs } from '../lib/reservation-view'

type ReservationDetailSheetProps = {
  reservation: ReservationDto | null
  onOpenChange: (open: boolean) => void
  now: number
  canUpdate: boolean
  canDelete: boolean
  canCheckIn: boolean
  onEdit: (reservation: ReservationDto) => void
  onCancel: (reservation: ReservationDto) => void
  onCheckIn: (reservation: ReservationDto) => void
  checkInPending?: boolean
  /** Lỗi nhận bàn gần nhất của đặt bàn này (hiện nguyên văn) */
  checkInError?: unknown
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** Chi tiết một đặt bàn, kèm Sửa, Hủy, Nhận bàn (UC-13 bước 5, FR-36). */
export function ReservationDetailSheet({
  reservation: r,
  onOpenChange,
  now,
  canUpdate,
  canDelete,
  canCheckIn,
  onEdit,
  onCancel,
  onCheckIn,
  checkInPending,
  checkInError,
}: ReservationDetailSheetProps) {
  const status = r ? reservationStatusLabels[r.status] : null
  const waiting = r?.status === 'ChoDen'
  const checkInAllowed = !!r && canCheckInToday(r, now)
  const showActions = !!r && waiting && (canUpdate || canDelete || canCheckIn)

  return (
    <Sheet open={!!r} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        {r && status && (
          <>
            <SheetHeader className="border-b px-6 py-5 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground font-mono text-sm">{r.code}</span>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {r.isLate && (
                  <StatusBadge tone="warning" dot={false}>
                    Trễ
                  </StatusBadge>
                )}
              </div>
              <SheetTitle className="text-xl">{r.customerName}</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5">
                <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">
                  {vnHhmm(r.arrivalAt)}–{vnHhmm(holdUntilMs(r))}, {formatDateKeyLong(vnDateKey(r.arrivalAt))}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <dl className="divide-y">
                <InfoRow label="Số điện thoại">
                  <a href={`tel:${r.phone}`} className="text-primary inline-flex items-center gap-1.5 font-medium tabular-nums hover:underline">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {formatPhone(r.phone)}
                  </a>
                </InfoRow>
                <InfoRow label="Bàn">
                  <span className="font-semibold">{r.tableCode}</span>
                  {r.areaName && <span className="text-muted-foreground"> · {r.areaName}</span>}
                </InfoRow>
                <InfoRow label="Số khách">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Users className="text-muted-foreground size-3.5" aria-hidden="true" />
                    {r.guestCount} khách
                  </span>
                </InfoRow>
                <InfoRow label="Tiền cọc">
                  <span className="font-medium tabular-nums">{r.deposit > 0 ? formatVnd(r.deposit) : 'Không cọc'}</span>
                </InfoRow>
                <InfoRow label="Ghi chú">
                  {r.note ? <span className="whitespace-pre-line">{r.note}</span> : <span className="text-muted-foreground">Không có</span>}
                </InfoRow>
                <InfoRow label="Giữ bàn đến">
                  <span className="tabular-nums">{vnHhmm(holdUntilMs(r))}</span>
                </InfoRow>
                {r.status === 'DaNhanBan' && (
                  <>
                    <InfoRow label="Nhận bàn lúc">
                      <span className="tabular-nums">{formatVnDateTime(r.checkedInAt)}</span>
                    </InfoRow>
                    {r.orderCode && (
                      <InfoRow label="Hóa đơn">
                        <span className="font-mono">{r.orderCode}</span>
                      </InfoRow>
                    )}
                  </>
                )}
                {r.status === 'DaHuy' && (
                  <>
                    <InfoRow label="Hủy lúc">
                      <span className="tabular-nums">{formatVnDateTime(r.cancelledAt)}</span>
                      {r.cancelledByName && <span className="text-muted-foreground"> · {r.cancelledByName}</span>}
                    </InfoRow>
                    <InfoRow label="Lý do hủy">{r.cancelReason || '—'}</InfoRow>
                  </>
                )}
                <InfoRow label="Tạo lúc">
                  <span className="tabular-nums">{formatVnDateTime(r.createdAt)}</span>
                </InfoRow>
              </dl>

              {waiting && canCheckIn && !checkInAllowed && (
                <p className="bg-muted/60 text-muted-foreground mt-4 rounded-lg px-3 py-2.5 text-sm">
                  Chỉ nhận bàn vào đúng ngày khách đến.
                </p>
              )}
              {!!checkInError && (
                <p role="alert" className="bg-destructive/10 text-destructive mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {getErrorMessage(checkInError)}
                </p>
              )}
            </div>

            {showActions && (
              <>
                <Separator />
                <SheetFooter className="bg-muted/30 grid gap-2 px-6 py-4 sm:grid-cols-2">
                  {canCheckIn && (
                    <Button
                      variant="cta"
                      size="lg"
                      className="sm:col-span-2"
                      disabled={!checkInAllowed || checkInPending}
                      onClick={() => onCheckIn(r)}
                    >
                      {checkInPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <DoorOpen aria-hidden="true" />}
                      Nhận bàn {r.tableCode}
                    </Button>
                  )}
                  {canUpdate && (
                    <Button variant="outline" size="lg" onClick={() => onEdit(r)} disabled={checkInPending}>
                      <Pencil aria-hidden="true" />
                      Sửa
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="lg"
                      className={canUpdate ? undefined : 'sm:col-span-2'}
                      onClick={() => onCancel(r)}
                      disabled={checkInPending}
                    >
                      <XCircle aria-hidden="true" />
                      Hủy đặt bàn
                    </Button>
                  )}
                </SheetFooter>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

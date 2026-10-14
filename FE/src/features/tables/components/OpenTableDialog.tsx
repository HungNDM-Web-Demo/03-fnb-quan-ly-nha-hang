'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarCheck, Loader2, Minus, Plus, Users } from 'lucide-react'
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
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors, isApiError } from '@/lib/api-error'
import { formatTime, formatVnd } from '@/lib/format'
import { NumericKeypad } from '@/features/pos/components/NumericKeypad'
import { errorCode, usePosMutation } from '@/features/pos/hooks/use-pos'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { reservationService } from '@/features/pos/services/reservation.service'
import { tableService } from '@/features/pos/services/table.service'
import type { TableCardDto } from '@/features/pos/types/pos.types'

type OpenTableDialogProps = {
  table: TableCardDto | null
  onOpenChange: (open: boolean) => void
}

const newRequestId = () => crypto.randomUUID()

/**
 * Hộp "Mở bàn" (UC-02, BR-01): bàn phím số lớn, gợi ý số khách bằng sức chứa; vượt sức chứa thì cảnh báo,
 * xác nhận vẫn mở (TC-09). Bàn có đặt: chọn "Nhận bàn cho khách đặt" (UC-13) hoặc "Mở cho khách khác" (UC-02 2b).
 */
export function OpenTableDialog({ table, onOpenChange }: OpenTableDialogProps) {
  const router = useRouter()
  const { can } = usePermissions()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmOver, setConfirmOver] = useState(false)
  /** Số gợi ý sẵn: phím đầu tiên thay số gợi ý thay vì nối thêm */
  const [pristine, setPristine] = useState(true)
  const [mode, setMode] = useState<'choose' | 'open'>('open')
  const [requestId, setRequestId] = useState(newRequestId)
  const [current, setCurrent] = useState<TableCardDto | null>(null)

  if (table && table.id !== current?.id) {
    setCurrent(table)
    setValue(String(table.reservation ? table.reservation.guestCount : table.capacity))
    setError(null)
    setConfirmOver(false)
    setPristine(true)
    setMode(table.reservation && can(permissions.reservations.checkIn) ? 'choose' : 'open')
    setRequestId(newRequestId())
  }
  if (!table && current) setCurrent(null)

  const open = usePosMutation((v: { id: string; guestCount: number; clientRequestId: string }) =>
    tableService.open(v.id, { guestCount: v.guestCount, clientRequestId: v.clientRequestId })
  )
  const checkIn = usePosMutation((v: { id: string; clientRequestId: string }) =>
    reservationService.checkIn(v.id, { clientRequestId: v.clientRequestId })
  )

  if (!table) return null
  const guests = Number(value || 0)
  const over = guests > table.capacity
  const reservation = table.reservation

  const goTable = () => {
    onOpenChange(false)
    router.push(routePath.tableService(table.id))
  }

  const submit = () => {
    setError(null)
    if (!Number.isInteger(guests) || guests < PosRules.minGuests || guests > PosRules.maxGuests) {
      return setError('Số khách từ 1 đến 50')
    }
    if (over && !confirmOver) return setConfirmOver(true)
    open.mutate(
      { id: table.id, guestCount: guests, clientRequestId: requestId },
      {
        onSuccess: (order) => {
          setRequestId(newRequestId())
          toast.success(`Đã mở bàn ${table.code} cho ${guests} khách`, { description: `Hóa đơn ${order.code}` })
          goTable()
        },
        onError: (err) => {
          if (errorCode(err) === 'BanVuaDuocMo') {
            toast.warning(getErrorMessage(err))
            return goTable()
          }
          const fields = getFieldErrors(err)
          setError(fields.guestCount ?? getErrorMessage(err))
          if (isApiError(err) && err.status >= 400 && err.status < 500) setRequestId(newRequestId())
        },
      }
    )
  }

  const submitCheckIn = () => {
    if (!reservation) return
    checkIn.mutate(
      { id: reservation.id, clientRequestId: requestId },
      {
        onSuccess: (order) => {
          setRequestId(newRequestId())
          toast.success(`Đã nhận bàn ${table.code} cho khách ${reservation.customerName}`, {
            description: `Hóa đơn ${order.code}${reservation.deposit ? ` · cọc ${formatVnd(reservation.deposit)}` : ''}`,
          })
          goTable()
        },
        onError: (err) => {
          setError(getErrorMessage(err))
          if (isApiError(err) && err.status >= 400 && err.status < 500) setRequestId(newRequestId())
        },
      }
    )
  }

  const pending = open.isPending || checkIn.isPending
  const step = (delta: number) => {
    setPristine(false)
    setValue(String(Math.min(PosRules.maxGuests, Math.max(0, guests + delta))))
  }

  return (
    <Dialog open={!!table} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Mở bàn {table.code}</DialogTitle>
          <DialogDescription>
            Bàn {table.capacity} chỗ{reservation ? ' · có khách đặt hôm nay' : ''}
          </DialogDescription>
        </DialogHeader>

        {reservation && (
          <div className="border-table-reserved/40 bg-table-reserved/8 rounded-lg border p-3 text-sm">
            <p className="text-table-reserved flex items-center gap-2 font-semibold">
              <CalendarCheck className="size-4" aria-hidden="true" />
              Bàn có khách đặt lúc {formatTime(reservation.arrivalAt)}
              {reservation.isLate && <span className="text-destructive">· Trễ</span>}
            </p>
            <p className="mt-1">
              {reservation.customerName} · {reservation.guestCount} khách
              {reservation.deposit ? ` · cọc ${formatVnd(reservation.deposit)}` : ''}
            </p>
            {reservation.note && <p className="text-muted-foreground mt-0.5">{reservation.note}</p>}
          </div>
        )}

        {mode === 'choose' && reservation ? (
          <div className="grid gap-2">
            <Button size="lg" className="h-12" onClick={submitCheckIn} disabled={pending}>
              {checkIn.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CalendarCheck aria-hidden="true" />}
              Nhận bàn cho khách đặt
            </Button>
            <Button size="lg" variant="outline" className="h-12" onClick={() => setMode('open')} disabled={pending}>
              Mở cho khách khác
            </Button>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-3">
              <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => step(-1)} aria-label="Bớt một khách">
                <Minus aria-hidden="true" />
              </Button>
              <div className="bg-muted flex h-16 min-w-32 items-center justify-center gap-2 rounded-xl px-4 text-4xl font-bold tabular-nums" aria-live="polite">
                <Users className="text-muted-foreground size-6" aria-hidden="true" />
                {value || '0'}
              </div>
              <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => step(1)} aria-label="Thêm một khách">
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <NumericKeypad
              value={value}
              maxLength={2}
              onChange={(v) => {
                setValue(pristine && v.length > value.length ? v.slice(value.length) : v)
                setPristine(false)
                setConfirmOver(false)
                setError(null)
              }}
            />
            {error && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {error}
              </p>
            )}
            {over && guests <= PosRules.maxGuests && (
              <p role="status" className="bg-warning/12 text-warning flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                Bàn {table.capacity} chỗ, đang mở cho {guests} khách
              </p>
            )}
            {reservation && (
              <p className="text-table-reserved text-xs">
                Lưu ý: bàn đã có khách đặt lúc {formatTime(reservation.arrivalAt)}.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={pending}>
                Hủy
              </Button>
              <Button className="h-11 min-w-32" onClick={submit} disabled={pending}>
                {open.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {over && confirmOver ? 'Vẫn mở bàn' : 'Mở bàn'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

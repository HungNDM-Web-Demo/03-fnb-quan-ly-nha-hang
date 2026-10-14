'use client'

import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/features/pos/components/MoneyInput'
import { errorCode, useDiningTables } from '@/features/pos/hooks/use-pos'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { vnAt, vnDateKey, vnHhmm, vnMinuteOfDay } from '@/features/pos/lib/vn-time'
import type { ReservationDto, SaveReservationRequest } from '@/features/pos/types/pos.types'
import { useDebounce } from '@/hooks/use-debounce'
import { applyFieldErrors, getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { formatPhone } from '@/lib/format'
import { fromMinutes, timeSlots, toMinutes } from '../lib/reservation-view'
import { useAvailableTables, useCreateReservation, useUpdateReservation } from '../hooks/use-reservations'
import { phoneDigits, reservationFormSchema, type ReservationFormValues } from '../schemas/reservation.schema'
import { DatePickerButton } from './DatePickerButton'
import { TablePicker } from './TablePicker'

type ReservationFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có là sửa, không có là thêm mới */
  reservation?: ReservationDto | null
  /** Ngày đang xem trên màn Đặt bàn, làm ngày mặc định khi thêm */
  defaultDate: string
  openTime: string
  closeTime: string
  now: number
}

/** Trường của form nhận lỗi từ API (07 §2.15); arrivalAt gắn vào ô giờ đến */
const API_FIELDS = ['customerName', 'phone', 'guestCount', 'deposit', 'note', 'tableId'] as const

function defaultTime(dateKey: string, now: number, openTime: string, closeTime: string): string {
  const open = toMinutes(openTime)
  const close = toMinutes(closeTime)
  let minute = 19 * 60
  if (dateKey === vnDateKey(now)) minute = Math.ceil((vnMinuteOfDay(now) + PosRules.minLeadMinutes) / 15) * 15
  return fromMinutes(Math.min(Math.max(minute, open), close))
}

function initialValues(
  reservation: ReservationDto | null | undefined,
  defaultDate: string,
  now: number,
  openTime: string,
  closeTime: string
): ReservationFormValues {
  if (reservation) {
    return {
      customerName: reservation.customerName,
      phone: formatPhone(reservation.phone, ''),
      date: vnDateKey(reservation.arrivalAt),
      time: vnHhmm(reservation.arrivalAt),
      guestCount: reservation.guestCount,
      deposit: reservation.deposit,
      note: reservation.note ?? '',
      tableId: reservation.tableId,
    }
  }
  const today = vnDateKey(now)
  const date = defaultDate < today ? today : defaultDate
  return {
    customerName: '',
    phone: '',
    date,
    time: defaultTime(date, now, openTime, closeTime),
    guestCount: 2,
    deposit: 0,
    note: '',
    tableId: '',
  }
}

/** Thêm/sửa đặt bàn (UC-13 bước 2–3, FR-34, BR-24, BR-25, TC-41). */
export function ReservationFormDialog({
  open,
  onOpenChange,
  reservation,
  defaultDate,
  openTime,
  closeTime,
  now,
}: ReservationFormDialogProps) {
  const createReservation = useCreateReservation()
  const updateReservation = useUpdateReservation()
  const pending = createReservation.isPending || updateReservation.isPending
  const tables = useDiningTables(false, open)

  const form = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: initialValues(reservation, defaultDate, now, openTime, closeTime),
  })
  const { errors } = form.formState

  useEffect(() => {
    if (!open) return
    form.reset(initialValues(reservation, defaultDate, Date.now(), openTime, closeTime))
    // Chỉ đặt lại khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservation])

  const [date, time, guestCount] = useWatch({
    control: form.control,
    name: ['date', 'time', 'guestCount'],
  })
  const guests = useDebounce(guestCount, 300)

  const slots = useMemo(() => {
    const list = timeSlots(openTime, closeTime)
    return time && !list.includes(time) ? [...list, time].sort() : list
  }, [openTime, closeTime, time])

  const arrivalIso = date && /^\d{2}:\d{2}$/.test(time) ? new Date(vnAt(date, time)).toISOString() : null
  const guestsValid = Number.isInteger(guests) && guests >= PosRules.minGuests && guests <= PosRules.maxGuests
  const available = useAvailableTables(
    open && arrivalIso && guestsValid
      ? { arrivalAt: arrivalIso, guestCount: guests, excludeId: reservation?.id }
      : null
  )
  const windowLabel = arrivalIso
    ? `${time}–${vnHhmm(new Date(arrivalIso).getTime() + PosRules.holdMinutes * 60_000)}`
    : undefined

  const onError = (error: unknown) => {
    // 409 TrungDatBan: câu nguyên văn "Bàn T2-01 đã được giữ từ 19:00 đến 21:00" gắn vào ô bàn (TC-41)
    if (errorCode(error) === 'TrungDatBan') {
      form.setError('tableId', { type: 'server', message: getErrorMessage(error) }, { shouldFocus: true })
      return
    }
    const fieldErrors = getFieldErrors(error)
    let applied = false
    if (fieldErrors.arrivalAt) {
      form.setError('time', { type: 'server', message: fieldErrors.arrivalAt }, { shouldFocus: true })
      applied = true
    }
    applied = applyFieldErrors(form.setError, error, API_FIELDS) || applied
    if (!applied) toast.error(getErrorMessage(error))
  }

  const onSubmit = form.handleSubmit((values) => {
    const input: SaveReservationRequest = {
      customerName: values.customerName.trim(),
      phone: phoneDigits(values.phone),
      arrivalAt: new Date(vnAt(values.date, values.time)).toISOString(),
      guestCount: values.guestCount,
      tableId: values.tableId,
      note: values.note.trim() || undefined,
      deposit: values.deposit ?? 0,
    }
    const onSuccess = (saved: ReservationDto) => {
      toast.success(`Đã lưu đặt bàn ${saved.code}`)
      onOpenChange(false)
    }
    if (reservation) updateReservation.mutate({ id: reservation.id, input }, { onSuccess, onError })
    else createReservation.mutate(input, { onSuccess, onError })
  })

  const today = vnDateKey(now)

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{reservation ? `Sửa đặt bàn ${reservation.code}` : 'Thêm đặt bàn'}</DialogTitle>
          <DialogDescription>
            Mỗi đặt bàn giữ bàn {PosRules.holdMinutes} phút từ giờ đến. Giờ đến trong giờ mở cửa {openTime}–{closeTime}, cách hiện
            tại ít nhất {PosRules.minLeadMinutes} phút.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-col">
          <div className="grid max-h-[calc(100dvh-14rem)] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <FormField label="Tên khách" required error={errors.customerName?.message}>
              <Input className="h-11" autoComplete="off" placeholder="vd: Đoàn Thị Mỹ Duyên" {...form.register('customerName')} />
            </FormField>

            <FormField label="Số điện thoại" required error={errors.phone?.message}>
              <Input
                className="h-11 tabular-nums"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="vd: 0903 456 789"
                {...form.register('phone')}
              />
            </FormField>

            <FormField label="Ngày đến" required error={errors.date?.message}>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <DatePickerButton
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v)
                      form.clearErrors('time')
                    }}
                    minDate={reservation && vnDateKey(reservation.arrivalAt) < today ? undefined : today}
                    long
                    className="w-full"
                  />
                )}
              />
            </FormField>

            <FormField label="Giờ đến" required error={errors.time?.message} hint={windowLabel && `Giữ bàn ${windowLabel}`}>
              <Controller
                control={form.control}
                name="time"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger ref={field.ref} className="h-11 tabular-nums">
                      <SelectValue placeholder="Chọn giờ" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {slots.map((s) => (
                        <SelectItem key={s} value={s} className="min-h-10 tabular-nums">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label="Số khách" required error={errors.guestCount?.message}>
              <Controller
                control={form.control}
                name="guestCount"
                render={({ field }) => {
                  const value = Number.isFinite(field.value) ? field.value : NaN
                  const set = (n: number) => field.onChange(Math.min(PosRules.maxGuests, Math.max(PosRules.minGuests, n)))
                  return (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label="Bớt 1 khách"
                        disabled={Number.isFinite(value) && value <= PosRules.minGuests}
                        onClick={() => set((Number.isFinite(value) ? value : 1) - 1)}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                      <Input
                        ref={field.ref}
                        className="h-11 w-20 text-center text-base tabular-nums"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label="Số khách"
                        value={Number.isFinite(value) ? String(value) : ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 3)
                          field.onChange(digits ? Number(digits) : NaN)
                        }}
                        onBlur={field.onBlur}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label="Thêm 1 khách"
                        disabled={Number.isFinite(value) && value >= PosRules.maxGuests}
                        onClick={() => set((Number.isFinite(value) ? value : 0) + 1)}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>
                  )
                }}
              />
            </FormField>

            <FormField label="Tiền cọc" error={errors.deposit?.message} hint="Chỉ ghi nhận, tự trừ khi thanh toán. Tối đa 5.000.000 ₫">
              <Controller
                control={form.control}
                name="deposit"
                render={({ field }) => (
                  <MoneyInput
                    ref={field.ref}
                    className="h-11"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="0"
                  />
                )}
              />
            </FormField>

            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="tableId"
                render={({ field }) => (
                  <TablePicker
                    ref={field.ref}
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id)
                      form.clearErrors('tableId')
                    }}
                    suggestions={available.data}
                    suggestionsLoading={available.isFetching}
                    allTables={tables.data}
                    guestCount={guestCount}
                    windowLabel={windowLabel}
                    error={errors.tableId?.message}
                  />
                )}
              />
              {available.error && (
                <p className="text-destructive mt-1 text-[0.8125rem]">{getErrorMessage(available.error)}</p>
              )}
            </div>

            <FormField label="Ghi chú" error={errors.note?.message} className="sm:col-span-2" hint="vd: sinh nhật, cần ghế trẻ em, gần cửa sổ">
              <Textarea rows={2} maxLength={500} className="min-h-16" {...form.register('note')} />
            </FormField>
          </div>

          <DialogFooter className="bg-muted/30 border-t px-6 py-4">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {reservation ? 'Lưu thay đổi' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

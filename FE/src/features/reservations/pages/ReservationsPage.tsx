'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronLeft, ChevronRight, GanttChart, List, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { useDiningTables, useReservations, useStoreProfile } from '@/features/pos/hooks/use-pos'
import { useServerNow } from '@/features/pos/hooks/use-server-now'
import { addDaysKey, vnDateKey } from '@/features/pos/lib/vn-time'
import type { ReservationDto } from '@/features/pos/types/pos.types'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage } from '@/lib/api-error'
import { CancelReservationDialog } from '../components/CancelReservationDialog'
import { DatePickerButton } from '../components/DatePickerButton'
import { ReservationDetailSheet } from '../components/ReservationDetailSheet'
import { ReservationFormDialog } from '../components/ReservationFormDialog'
import { ReservationList } from '../components/ReservationList'
import { ReservationTimeline } from '../components/ReservationTimeline'
import { useCheckInReservation, useReservation } from '../hooks/use-reservations'

type View = 'timeline' | 'list'
type FormState = { open: boolean; reservation: ReservationDto | null; seq: number }

/** SCR-13 Đặt bàn (UC-13, FR-34–36, BR-24, BR-25). */
export function ReservationsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const canCreate = can(permissions.reservations.create)
  const canUpdate = can(permissions.reservations.update)
  const canDelete = can(permissions.reservations.delete)
  const canCheckIn = can(permissions.reservations.checkIn)

  const now = useServerNow(30_000)
  const todayKey = vnDateKey(now)
  const [dateKey, setDateKey] = useState(todayKey)
  const [view, setView] = useState<View>('timeline')
  const [onlyBooked, setOnlyBooked] = useState(false)

  const store = useStoreProfile()
  const openTime = store.data?.openTime ?? '10:00'
  const closeTime = store.data?.closeTime ?? '22:00'
  const tables = useDiningTables()
  const timeline = useReservations({ from: dateKey, to: dateKey, pageSize: 100 })

  const [selected, setSelected] = useState<ReservationDto | null>(null)
  const [form, setForm] = useState<FormState>({ open: false, reservation: null, seq: 0 })
  const [cancelTarget, setCancelTarget] = useState<ReservationDto | null>(null)

  // Nhận bàn: một clientRequestId cho mỗi lần bắt đầu, giữ nguyên khi thử lại sau lỗi (NFR-05)
  const checkIn = useCheckInReservation()
  const checkInKey = useRef<{ id: string; key: string } | null>(null)
  const [checkInErrorFor, setCheckInErrorFor] = useState<{ id: string; error: unknown } | null>(null)

  // Bản mới nhất của đặt bàn đang xem (dữ liệu tự làm mới sau thao tác, thời gian thực)
  const detail = useReservation(selected?.id)
  const current = selected
    ? (detail.data?.id === selected.id ? detail.data : (timeline.data?.items.find((r) => r.id === selected.id) ?? selected))
    : null

  const openCreate = useCallback(() => setForm((s) => ({ open: true, reservation: null, seq: s.seq + 1 })), [])
  const openEdit = useCallback((r: ReservationDto) => {
    setSelected(null)
    setForm((s) => ({ open: true, reservation: r, seq: s.seq + 1 }))
  }, [])
  const openCancel = useCallback((r: ReservationDto) => setCancelTarget(r), [])
  const openDetail = useCallback((r: ReservationDto) => setSelected(r), [])

  const handleCheckIn = useCallback(
    (r: ReservationDto) => {
      if (checkIn.isPending) return
      if (checkInKey.current?.id !== r.id) checkInKey.current = { id: r.id, key: crypto.randomUUID() }
      const clientRequestId = checkInKey.current.key
      setCheckInErrorFor(null)
      checkIn.mutate(
        { id: r.id, input: { clientRequestId } },
        {
          onSuccess: () => {
            checkInKey.current = null
            toast.success(`Đã nhận bàn ${r.tableCode} cho ${r.customerName}, ${r.guestCount} khách`)
            router.push(routePath.tableService(r.tableId))
          },
          onError: (error) => {
            setCheckInErrorFor({ id: r.id, error })
            toast.error(getErrorMessage(error))
          },
        }
      )
    },
    [checkIn, router]
  )

  const isToday = dateKey === todayKey

  return (
    <PermissionGuard permission={permissions.reservations.view} redirect>
      <div className="space-y-4">
        <PageHeader
          title="Đặt bàn"
          icon={CalendarClock}
          description="Ghi nhận khách đặt trước, giữ bàn 120 phút từ giờ đến và nhận bàn một chạm khi khách tới."
          actions={
            canCreate && (
              <Button size="lg" onClick={openCreate}>
                <Plus aria-hidden="true" />
                Thêm đặt bàn
              </Button>
            )
          }
        />

        <Tabs value={view} onValueChange={(v) => setView(v as View)} className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Chọn ngày">
              <Button variant="outline" size="icon-lg" aria-label="Ngày trước" onClick={() => setDateKey((d) => addDaysKey(d, -1))}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                variant={isToday ? 'secondary' : 'outline'}
                size="lg"
                onClick={() => setDateKey(todayKey)}
                aria-pressed={isToday}
              >
                Hôm nay
              </Button>
              <Button variant="outline" size="icon-lg" aria-label="Ngày sau" onClick={() => setDateKey((d) => addDaysKey(d, 1))}>
                <ChevronRight aria-hidden="true" />
              </Button>
              <DatePickerButton value={dateKey} onChange={setDateKey} long aria-label="Chọn ngày xem đặt bàn" className="min-w-52" />
            </div>
            <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11 md:w-auto">
              <TabsTrigger value="timeline" className="px-4">
                <GanttChart aria-hidden="true" />
                Dòng thời gian
              </TabsTrigger>
              <TabsTrigger value="list" className="px-4">
                <List aria-hidden="true" />
                Danh sách
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="timeline">
            <ReservationTimeline
              dateKey={dateKey}
              reservations={timeline.data?.items}
              tables={tables.data}
              isLoading={timeline.isLoading || tables.isLoading}
              isFetching={timeline.isFetching && !timeline.isLoading}
              error={timeline.error ?? tables.error}
              onRetry={() => {
                void timeline.refetch()
                void tables.refetch()
              }}
              openTime={openTime}
              closeTime={closeTime}
              now={now}
              onlyBooked={onlyBooked}
              onOnlyBookedChange={setOnlyBooked}
              onSelect={openDetail}
            />
          </TabsContent>
          <TabsContent value="list">
            <ReservationList
              dateKey={dateKey}
              now={now}
              canCreate={canCreate}
              canUpdate={canUpdate}
              canDelete={canDelete}
              canCheckIn={canCheckIn}
              onCreate={openCreate}
              onSelect={openDetail}
              onEdit={openEdit}
              onCancel={openCancel}
              onCheckIn={handleCheckIn}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ReservationDetailSheet
        reservation={current}
        onOpenChange={(open) => !open && setSelected(null)}
        now={now}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canCheckIn={canCheckIn}
        onEdit={openEdit}
        onCancel={openCancel}
        onCheckIn={handleCheckIn}
        checkInPending={checkIn.isPending}
        checkInError={current && checkInErrorFor?.id === current.id ? checkInErrorFor.error : undefined}
      />
      <ReservationFormDialog
        key={form.seq}
        open={form.open}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
        reservation={form.reservation}
        defaultDate={dateKey}
        openTime={openTime}
        closeTime={closeTime}
        now={now}
      />
      <CancelReservationDialog
        key={cancelTarget?.id ?? 'none'}
        reservation={cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      />
    </PermissionGuard>
  )
}

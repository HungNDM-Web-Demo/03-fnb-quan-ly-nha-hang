'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChefHat, CheckCircle2, LayoutDashboard, ListChecks, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { UserMenu } from '@/components/shared/UserMenu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { permissions } from '@/config/permissions'
import { getVisibleNavGroups } from '@/config/routes'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage } from '@/lib/api-error'
import { subscribePosEvents } from '@/lib/realtime'
import { readJson, storageKey, writeJson } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { ConnectionBanner } from '@/features/pos/components/RealtimeBridge'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { useServerNow, useSyncAsOf } from '@/features/pos/hooks/use-server-now'
import { KITCHEN_STATIONS, stationLabels } from '@/features/pos/lib/labels'
import { isSoundUnlocked, playSound, unlockSound } from '@/features/pos/lib/sound'
import { kitchenService } from '@/features/pos/services/kitchen.service'
import type { KitchenStation, KitchenTicketDto, KitchenTicketItemDto } from '@/features/pos/types/pos.types'
import { AvailabilitySheet } from '../components/AvailabilitySheet'
import { KitchenSummary } from '../components/KitchenSummary'
import { KitchenTicketCard, type TicketAction } from '../components/KitchenTicketCard'
import { useKitchenBoard, useKitchenSummary } from '../hooks/use-kitchen'
import '../components/kitchen.css'

/** Khu chế biến đã chọn lưu localStorage khóa `kitchen.station` (07 §4) */
const STATION_KEY = storageKey('kitchen.station')
type Mode = 'board' | 'summary' | 'done'

/**
 * SCR-10 Màn hình bếp (UC-04, UC-06): toàn màn hình nền tối (NFR-02), lọc khu chế biến, phiếu theo BR-12,
 * màu theo BR-11 (tính lại mỗi 15 giây), âm báo và viền nhấp nháy khi có phiếu mới, chế độ tổng hợp, "Đã xong".
 */
export function KitchenPage() {
  const { can } = usePermissions()
  const canUpdate = can(permissions.kitchenTickets.update)
  const [station, setStationState] = useState<KitchenStation | undefined>(() => {
    const saved = readJson<KitchenStation | 'all'>('local', STATION_KEY)
    return saved && saved !== 'all' ? saved : undefined
  })
  const [mode, setMode] = useState<Mode>('board')
  const [menuOpen, setMenuOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [flash, setFlash] = useState<string[]>([])

  const board = useKitchenBoard(station, mode === 'done' ? 'DaXong' : 'DangCho', mode !== 'summary')
  const summary = useKitchenSummary(station, mode === 'summary')
  const counts = useKitchenBoard(station, 'DangCho', mode !== 'board')
  useSyncAsOf(board.data?.asOf)
  const now = useServerNow(1_000)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const setStation = (value: KitchenStation | undefined) => {
    setStationState(value)
    writeJson('local', STATION_KEY, value ?? 'all')
  }

  // Phiếu mới: âm báo + viền nhấp nháy 5 giây (FR-15, TC-16)
  useEffect(() => {
    return subscribePosEvents((event) => {
      if (event.name !== 'kitchen-changed' || !event.payload.newTicketIds.length) return
      if (station && !event.payload.stations.includes(station)) return
      playSound('ticket')
      const ids = event.payload.newTicketIds
      setFlash((list) => [...list, ...ids])
      setTimeout(() => setFlash((list) => list.filter((x) => !ids.includes(x))), 5_000)
    })
  }, [station])

  const action = usePosMutation((v: { ticket: KitchenTicketDto; item: KitchenTicketItemDto; action: TicketAction }) => {
    const { ticket, item } = v
    switch (v.action) {
      case 'start':
        return kitchenService.start(ticket.id, item.id)
      case 'done':
        return kitchenService.done(ticket.id, item.id)
      case 'undo':
        return kitchenService.undo(ticket.id, item.id)
      case 'out-of-stock':
        return kitchenService.outOfStock(ticket.id, item.id)
      default:
        return kitchenService.acknowledge(ticket.id, item.id)
    }
  })
  const doneAll = usePosMutation((ticket: KitchenTicketDto) => kitchenService.doneAll(ticket.id))

  const onItem = (ticket: KitchenTicketDto, item: KitchenTicketItemDto, kind: TicketAction) =>
    action.mutate(
      { ticket, item, action: kind },
      {
        onSuccess: () => {
          if (kind === 'out-of-stock') toast.success(`Đã báo hết ${item.itemName}, phục vụ bàn ${ticket.tableCode} nhận thông báo`)
          if (kind === 'undo') toast.success(`${item.itemName} về "Đang làm"`)
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )

  const enableSound = async () => {
    const ok = await unlockSound()
    setSoundOn(ok)
    if (ok) playSound('ready')
    else toast.error('Trình duyệt chưa cho phát âm thanh')
  }

  const homeLinks = getVisibleNavGroups(can)
    .flatMap((g) => g.items)
    .filter((i) => i.href !== '/kitchen')
  const pendingCount = (mode === 'board' ? board.data : counts.data)?.tickets.length ?? 0
  const tickets = board.data?.tickets ?? []

  return (
    <PermissionGuard permission={permissions.kitchenTickets.view} redirect>
      <div className="bg-background text-foreground flex min-h-svh flex-col">
        <ConnectionBanner />
        <header className="bg-card sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="mr-2 flex items-center gap-2">
            <ChefHat className="text-primary size-7" aria-hidden="true" />
            <h1 className="text-xl font-bold">Màn hình bếp</h1>
          </div>
          <div className="bg-muted flex rounded-lg p-1" role="group" aria-label="Khu chế biến">
            {[undefined, ...KITCHEN_STATIONS].map((s) => (
              <button
                key={s ?? 'all'}
                type="button"
                aria-pressed={station === s}
                onClick={() => setStation(s)}
                className={cn(
                  'h-11 rounded-md px-4 text-base font-semibold transition-colors',
                  station === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                {s ? stationLabels[s] : 'Tất cả'}
              </button>
            ))}
          </div>
          <div className="bg-muted flex rounded-lg p-1" role="group" aria-label="Chế độ xem">
            {(
              [
                ['board', `Đang chờ (${pendingCount})`, ChefHat],
                ['summary', 'Tổng hợp', ListChecks],
                ['done', 'Đã xong', CheckCircle2],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex h-11 items-center gap-1.5 rounded-md px-4 text-base font-semibold',
                  mode === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" className="h-11" onClick={() => setMenuOpen(true)}>
              <BookOpen aria-hidden="true" />
              Thực đơn
            </Button>
            {soundOn || isSoundUnlocked() ? (
              <span className="text-kds-ok flex items-center gap-1 px-2 text-sm font-medium">
                <Volume2 className="size-4" aria-hidden="true" /> Âm thanh bật
              </span>
            ) : (
              <Button variant="cta" className="h-11" onClick={() => void enableSound()}>
                <VolumeX aria-hidden="true" />
                Bật âm thanh
              </Button>
            )}
            {homeLinks.length > 0 && (
              <Button asChild variant="ghost" size="icon" className="size-11" aria-label={`Về ${homeLinks[0].title}`}>
                <Link href={homeLinks[0].href}>
                  <LayoutDashboard aria-hidden="true" />
                </Link>
              </Button>
            )}
            <span className="text-muted-foreground px-1 text-lg font-semibold tabular-nums" aria-label="Giờ hiện tại">
              {new Date(now).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-3 pb-24">
          {mode === 'summary' ? (
            summary.isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : summary.error ? (
              <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
            ) : (
              <KitchenSummary items={summary.data ?? []} />
            )
          ) : board.error ? (
            <ErrorState error={board.error} onRetry={() => void board.refetch()} />
          ) : board.isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(18.5rem,1fr))] gap-3">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={mode === 'done' ? CheckCircle2 : ChefHat}
              title={mode === 'done' ? 'Chưa có phiếu xong hôm nay' : 'Không có phiếu đang chờ'}
              description={mode === 'done' ? undefined : 'Phiếu mới sẽ hiện ngay khi phục vụ gửi bếp.'}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(18.5rem,1fr))] items-start gap-3">
              {tickets.map((ticket) => (
                <KitchenTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  now={now}
                  flash={flash.includes(ticket.id)}
                  canUpdate={canUpdate}
                  busy={action.isPending || doneAll.isPending}
                  onItem={onItem}
                  onDoneAll={(t) =>
                    doneAll.mutate(t, {
                      onSuccess: () => toast.success(`Phiếu ${t.code} (${t.tableCode}) đã xong`),
                      onError: (error) => toast.error(getErrorMessage(error)),
                    })
                  }
                />
              ))}
            </div>
          )}
        </main>
      </div>
      <AvailabilitySheet open={menuOpen} onOpenChange={setMenuOpen} canUpdate={can(permissions.menuItems.availability)} />
    </PermissionGuard>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  Clock3,
  Combine,
  DoorClosed,
  Link2,
  Lock,
  MoveRight,
  NotebookPen,
  Split,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors, isApiError } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMenuBundle, usePosMutation, useTableService } from '@/features/pos/hooks/use-pos'
import { useServerNow, useSyncAsOf } from '@/features/pos/hooks/use-server-now'
import { formatDuration, stationLabels, tableStatusLabels } from '@/features/pos/lib/labels'
import { PosRules } from '@/features/pos/lib/pos-rules'
import { orderService } from '@/features/pos/services/order.service'
import type { MenuItemDto, OrderDto, OrderItemDto, UpdateDraftItemRequest } from '@/features/pos/types/pos.types'
import { CancelItemDialog } from '../components/CancelItemDialog'
import { CleanTableDialog } from '../components/CleanTableDialog'
import { DraftItemDialog } from '../components/DraftItemDialog'
import { MenuPanel } from '../components/MenuPanel'
import { MoveItemsDialog } from '../components/MoveItemsDialog'
import { OpenTableDialog } from '../components/OpenTableDialog'
import { OrderPanel } from '../components/OrderPanel'
import { SplitDialog } from '../components/SplitDialog'
import { SplitEqualDialog } from '../components/SplitEqualDialog'
import { TransferMergeDialog } from '../components/TransferMergeDialog'
import { WeightDialog } from '../components/WeightDialog'
import { useTabletLayout } from '../hooks/use-tablet-layout'
import { tableStatusStyle } from '../lib/table-style'
import { preparePrintWindow } from '../lib/print'

const newRequestId = () => crypto.randomUUID()

/**
 * SCR-04 Gọi món theo bàn (UC-05, UC-07, UC-08), SCR-05 chuyển/gộp/chuyển món (UC-09), SCR-06 tách, chia đều (UC-10).
 * Trái: thực đơn lưới có ảnh; phải: "Chưa gửi bếp" và "Đã gửi bếp". Bàn có nhiều hóa đơn → tab theo mã.
 */
export function TableServicePage({ tableId }: { tableId: string }) {
  useTabletLayout()
  const router = useRouter()
  const { can } = usePermissions()
  const service = useTableService(tableId)
  const menu = useMenuBundle()
  useSyncAsOf(service.data?.orders[0]?.asOf)
  const now = useServerNow(30_000)

  const [orderId, setOrderId] = useState<string | undefined>()
  const [weightItem, setWeightItem] = useState<MenuItemDto | null>(null)
  const [editItem, setEditItem] = useState<OrderItemDto | null>(null)
  const [cancelItem, setCancelItem] = useState<OrderItemDto | null>(null)
  const [moveItemId, setMoveItemId] = useState<string | null | undefined>(undefined)
  const [transferMode, setTransferMode] = useState<'transfer' | 'merge' | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitEqualOpen, setSplitEqualOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<null | 'prebill' | 'checkout'>(null)
  const [openTable, setOpenTable] = useState(false)
  const [cleanTable, setCleanTable] = useState(false)
  const [sendRequestId, setSendRequestId] = useState(newRequestId)

  const data = service.data
  const orders = data?.orders ?? []
  const order: OrderDto | undefined = orders.find((o) => o.id === orderId) ?? orders[0]

  const addItem = usePosMutation((v: { menuItemId: string; quantity: number }) => orderService.addItem(order!.id, v))
  const updateDraft = usePosMutation((v: { itemId: string; input: UpdateDraftItemRequest }) =>
    orderService.updateDraft(order!.id, v.itemId, v.input)
  )
  const deleteDraft = usePosMutation((itemId: string) => orderService.deleteDraft(order!.id, itemId))
  const send = usePosMutation((v: { clientRequestId: string; version: number }) => orderService.send(order!.id, v))
  const serve = usePosMutation((itemId: string) => orderService.serve(order!.id, itemId))
  const unserve = usePosMutation((v: { orderId: string; itemId: string }) => orderService.unserve(v.orderId, v.itemId))
  const prebill = usePosMutation((version: number) => orderService.prebill(order!.id, { version }))
  const close = usePosMutation((version: number) => orderService.close(order!.id, { version }))

  const onError = (error: unknown) => toast.error(getErrorMessage(error))

  // ───── Thêm món (UC-05 bước 2, 4) ─────
  const pick = (item: MenuItemDto) => {
    if (!order) return
    if (item.pricingType === 'TheoTrongLuong') return setWeightItem(item)
    addItem.mutate(
      { menuItemId: item.id, quantity: 1 },
      { onSuccess: () => toast.success(`Đã thêm ${item.name}`, { id: 'add-item', duration: 1200 }), onError }
    )
  }

  // ───── Gửi bếp (UC-05 bước 6–7, NFR-05) ─────
  const sendToKitchen = () => {
    if (!order) return
    send.mutate(
      { clientRequestId: sendRequestId, version: order.version },
      {
        onSuccess: (result) => {
          setSendRequestId(newRequestId())
          const stations = result.tickets.map((t) => stationLabels[t.station])
          const parts = [
            result.tickets.length ? `Đã gửi ${result.tickets.length} phiếu: ${stations.join(', ')}` : 'Đã gửi món',
            result.directItemCount ? `${result.directItemCount} món không qua bếp chờ ra` : '',
          ].filter(Boolean)
          toast.success(parts.join(' · '))
          if (result.skippedSoldOutItemIds.length) {
            toast.warning(`${result.skippedSoldOutItemIds.length} món tạm hết giữ lại ở "Chưa gửi bếp"`)
          }
          if (result.prebillInvalidated) toast.info('Phiếu tạm tính đã in hết hiệu lực')
        },
        onError: (error) => {
          if (isApiError(error) && error.status === 0) toast.error('Chưa gửi được, thử lại')
          else onError(error)
        },
      }
    )
  }

  // ───── In tạm tính, thanh toán (UC-11, BR-21) ─────
  const doPrebill = () => {
    if (!order) return
    const win = preparePrintWindow()
    prebill.mutate(order.version, {
      onSuccess: (o) => {
        win.go(o.id, { prebill: true })
        toast.success(`Đã in tạm tính, bàn ${o.tableCode} chờ thanh toán`)
      },
      onError: (error) => {
        win.cancel()
        onError(error)
      },
    })
  }
  const goCheckout = () => order && router.push(`${routePath.tableCheckout(tableId)}?order=${order.id}`)
  const withPendingCheck = (action: 'prebill' | 'checkout') => {
    if (order && order.counts.pending > 0) return setPendingConfirm(action)
    if (action === 'prebill') doPrebill()
    else goCheckout()
  }

  const serveItem = (item: OrderItemDto) => {
    if (!order) return
    const id = order.id
    serve.mutate(item.id, {
      onSuccess: () =>
        toast.success(`Đã ra: ${item.itemName}`, {
          duration: PosRules.unserveToastSeconds * 1000,
          action: { label: 'Hoàn tác', onClick: () => unserve.mutate({ orderId: id, itemId: item.id }, { onError }) },
        }),
      onError,
    })
  }

  if (service.error) {
    return <ErrorState error={service.error} onRetry={() => void service.refetch()} />
  }
  if (service.isLoading || !data) {
    return (
      <div className="grid h-[calc(100svh-7.5rem)] gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <Skeleton className="rounded-xl" />
        <Skeleton className="rounded-xl" />
      </div>
    )
  }

  const table = data.table
  const viewedOther = data.viewedTableId !== table.id
  const seated = table.openedAt ? (now - new Date(table.openedAt).getTime()) / 60_000 : 0
  const canEdit = can(permissions.orders.create)
  const locked = !!order?.isLocked

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Về sơ đồ bàn">
        <Link href={routePath.tables}>
          <ArrowLeft aria-hidden="true" />
        </Link>
      </Button>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{table.code}</h1>
        <span className={cn('rounded-md border px-2 py-0.5 text-xs font-semibold', tableStatusStyle[table.status].soft)}>
          {tableStatusLabels[table.status]}
        </span>
      </div>
      {order && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-1">
            <Users className="size-4" aria-hidden="true" />
            {table.guestCount ?? order.guestCount} khách
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="size-4" aria-hidden="true" />
            {formatDuration(seated)}
          </span>
          <span className="flex items-center gap-1">
            <UserRound className="size-4" aria-hidden="true" />
            {order.waiterName}
          </span>
          {table.mergedTableCodes.length > 0 && (
            <span className="flex items-center gap-1">
              <Link2 className="size-4" aria-hidden="true" />
              gộp {table.mergedTableCodes.join(', ')}
            </span>
          )}
          {locked && (
            <span className="text-warning flex items-center gap-1 font-medium">
              <Lock className="size-4" aria-hidden="true" />
              Đang thu tiền
            </span>
          )}
        </div>
      )}
      {order && (
        <div className="ml-auto flex items-center gap-2">
          {(can(permissions.tables.transfer) || can(permissions.orders.split) || can(permissions.tables.open)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11">
                  Thao tác
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {can(permissions.tables.transfer) && (
                  <>
                    <DropdownMenuItem className="h-11" disabled={locked} onSelect={() => setTransferMode('transfer')}>
                      <ArrowRightLeft aria-hidden="true" /> Chuyển bàn
                    </DropdownMenuItem>
                    <DropdownMenuItem className="h-11" disabled={locked} onSelect={() => setTransferMode('merge')}>
                      <Combine aria-hidden="true" /> Gộp bàn
                    </DropdownMenuItem>
                    <DropdownMenuItem className="h-11" disabled={locked} onSelect={() => setMoveItemId(null)}>
                      <MoveRight aria-hidden="true" /> Chuyển món
                    </DropdownMenuItem>
                  </>
                )}
                {can(permissions.orders.split) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="h-11" disabled={locked} onSelect={() => setSplitOpen(true)}>
                      <Split aria-hidden="true" /> Tách hóa đơn
                    </DropdownMenuItem>
                    <DropdownMenuItem className="h-11" disabled={locked} onSelect={() => setSplitEqualOpen(true)}>
                      <Users aria-hidden="true" /> Chia đều
                    </DropdownMenuItem>
                  </>
                )}
                {can(permissions.tables.open) && order.items.every((i) => i.status === 'ChuaGui') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive h-11" onSelect={() => setConfirmClose(true)}>
                      <DoorClosed aria-hidden="true" /> Đóng bàn (mở nhầm)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  )

  return (
    <PermissionGuard permission={[permissions.tables.view, permissions.orders.view]} redirect>
      <div className="-mx-1 -mb-20 flex h-[calc(100svh-6.5rem)] min-h-[36rem] flex-col gap-2 sm:-mx-2 lg:-mx-4">
        {header}
        {viewedOther && (
          <p className="bg-table-merged/10 text-table-merged border-table-merged/30 rounded-lg border px-3 py-2 text-sm font-medium">
            Bàn đã gộp vào {table.code}: đang xem hóa đơn bàn chính.
          </p>
        )}
        {order?.note && (
          <p className="bg-info/10 text-info flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <NotebookPen className="size-4 shrink-0" aria-hidden="true" />
            {order.note}
          </p>
        )}
        {orders.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Hóa đơn của bàn">
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
                {o.code}
                <span className="tabular-nums">{formatVnd(o.total)}</span>
                {o.isLocked && <Lock className="size-3.5" aria-label="Đang thu tiền" />}
              </button>
            ))}
          </div>
        )}

        {!order ? (
          <div className="bg-card flex flex-1 items-center justify-center rounded-xl border">
            <EmptyState
              title={table.status === 'ChoDon' ? `Bàn ${table.code} chờ dọn` : `Bàn ${table.code} đang trống`}
              description={
                table.status === 'ChoDon'
                  ? 'Khách đã thanh toán. Bấm “Dọn xong” để đón khách mới.'
                  : 'Mở bàn để bắt đầu gọi món.'
              }
              action={
                table.status === 'ChoDon' ? (
                  <Button className="h-11" onClick={() => setCleanTable(true)}>
                    Dọn xong
                  </Button>
                ) : (table.status === 'Trong' || table.status === 'DaDat') && can(permissions.tables.open) ? (
                  <Button className="h-11" onClick={() => setOpenTable(true)}>
                    Mở bàn
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
            <MenuPanel
              menu={menu.data}
              isLoading={menu.isLoading}
              disabled={!canEdit || locked || addItem.isPending}
              disabledReason={locked ? 'Hóa đơn đang thu tiền: không thêm món' : !canEdit ? 'Bạn không có quyền gọi món' : undefined}
              onPick={pick}
            />
            <OrderPanel
              order={order}
              can={{
                edit: canEdit && !locked,
                cancelItem: can(permissions.orderItems.cancel),
                moveItem: can(permissions.tables.transfer),
                prebill: can(permissions.orders.prebill),
                checkout: can(permissions.orders.checkout),
              }}
              pending={{ send: send.isPending, prebill: prebill.isPending, serve: serve.isPending }}
              onEditDraft={setEditItem}
              onDeleteDraft={(item) =>
                deleteDraft.mutate(item.id, { onSuccess: () => toast.success(`Đã xóa ${item.itemName}`), onError })
              }
              onServe={serveItem}
              onCancelItem={setCancelItem}
              onMoveItem={(item) => setMoveItemId(item.id)}
              onSend={sendToKitchen}
              onPrebill={() => withPendingCheck('prebill')}
              onCheckout={() => withPendingCheck('checkout')}
            />
          </div>
        )}
      </div>

      {/* ───── Hộp thoại ───── */}
      <WeightDialog
        open={!!weightItem}
        onOpenChange={(open) => !open && setWeightItem(null)}
        itemName={weightItem?.name ?? ''}
        price={weightItem?.price ?? 0}
        pending={addItem.isPending}
        onConfirm={(kg) =>
          weightItem &&
          addItem.mutate(
            { menuItemId: weightItem.id, quantity: kg },
            {
              onSuccess: () => {
                toast.success(`Đã thêm ${weightItem.name} ${String(kg).replace('.', ',')} kg`)
                setWeightItem(null)
              },
              onError: (error) => toast.error(getFieldErrors(error).quantity ?? getErrorMessage(error)),
            }
          )
        }
      />
      <DraftItemDialog
        item={editItem}
        quickNotes={menu.data?.quickNotes ?? []}
        pending={updateDraft.isPending || deleteDraft.isPending}
        onOpenChange={(open) => !open && setEditItem(null)}
        onSave={(input) =>
          editItem &&
          updateDraft.mutate({ itemId: editItem.id, input }, { onSuccess: () => setEditItem(null), onError })
        }
        onDelete={() =>
          editItem &&
          deleteDraft.mutate(editItem.id, {
            onSuccess: () => {
              toast.success(`Đã xóa ${editItem.itemName}`)
              setEditItem(null)
            },
            onError,
          })
        }
      />
      {order && <CancelItemDialog order={order} item={cancelItem} onOpenChange={(open) => !open && setCancelItem(null)} />}
      {order && (
        <MoveItemsDialog
          open={moveItemId !== undefined}
          order={order}
          initialItemId={moveItemId ?? undefined}
          areaId={table.areaId}
          onOpenChange={(open) => !open && setMoveItemId(undefined)}
        />
      )}
      {order && transferMode && (
        <TransferMergeDialog
          mode={transferMode}
          order={order}
          areaId={table.areaId}
          onOpenChange={(open) => !open && setTransferMode(null)}
          onTransferred={(target) => router.replace(routePath.tableService(target))}
        />
      )}
      {order && (
        <SplitDialog
          open={splitOpen}
          order={order}
          openOrderCount={orders.length}
          onOpenChange={setSplitOpen}
          onSplit={(list) => setOrderId(list[0]?.id)}
        />
      )}
      {order && <SplitEqualDialog open={splitEqualOpen} order={order} onOpenChange={setSplitEqualOpen} />}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Đóng bàn ${table.code}?`}
        description="Bàn mở nhầm, chưa gửi bếp món nào. Hóa đơn chuyển “Đã hủy” lý do “Mở nhầm”, bàn về “Trống”."
        confirmText="Đóng bàn"
        variant="destructive"
        loading={close.isPending}
        onConfirm={async () => {
          if (!order) return
          try {
            await close.mutateAsync(order.version)
            toast.success(`Đã đóng bàn ${table.code}`)
            router.push(routePath.tables)
          } catch (error) {
            onError(error)
          }
        }}
      />
      <ConfirmDialog
        open={!!pendingConfirm}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={`Còn ${order?.counts.pending ?? 0} món bếp chưa xong`}
        description="Khách vẫn muốn tính tiền? Có thể tiếp tục hoặc hủy món theo quy trình hủy món."
        confirmText="Vẫn tiếp tục"
        icon={AlertTriangle}
        onConfirm={() => {
          const action = pendingConfirm
          setPendingConfirm(null)
          if (action === 'prebill') doPrebill()
          else if (action === 'checkout') goCheckout()
        }}
      />
      <OpenTableDialog table={openTable ? table : null} onOpenChange={setOpenTable} />
      <CleanTableDialog table={cleanTable ? table : null} onOpenChange={setCleanTable} />
    </PermissionGuard>
  )
}

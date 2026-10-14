'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarPlus, DoorOpen, Eye, MoreHorizontal, Pencil, Plus, SearchX, X, XCircle } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useReservations } from '@/features/pos/hooks/use-pos'
import { reservationStatusLabels } from '@/features/pos/lib/labels'
import { vnDateKey, vnHhmm } from '@/features/pos/lib/vn-time'
import type { ReservationDto, ReservationStatus } from '@/features/pos/types/pos.types'
import { useTableQuery } from '@/hooks/use-table-query'
import { formatPhone, formatVnd } from '@/lib/format'
import { RESERVATION_STATUSES, canCheckInToday, formatDateKey } from '../lib/reservation-view'

type ReservationListProps = {
  dateKey: string
  now: number
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canCheckIn: boolean
  onCreate: () => void
  onSelect: (r: ReservationDto) => void
  onEdit: (r: ReservationDto) => void
  onCancel: (r: ReservationDto) => void
  onCheckIn: (r: ReservationDto) => void
}

/** Danh sách đặt bàn (SCR-13 tab Danh sách): tìm tên, SĐT, mã; lọc trạng thái, theo ngày hoặc mọi ngày. */
export function ReservationList({
  dateKey,
  now,
  canCreate,
  canUpdate,
  canDelete,
  canCheckIn,
  onCreate,
  onSelect,
  onEdit,
  onCancel,
  onCheckIn,
}: ReservationListProps) {
  const table = useTableQuery<{ status: ReservationStatus }>({ pageSize: 20, sortBy: 'arrivalAt', sortDir: 'asc' })
  const [allDays, setAllDays] = useState(false)
  const [searchKey, setSearchKey] = useState(0)

  const query = useMemo(
    () => (allDays ? table.query : { ...table.query, from: dateKey, to: dateKey }),
    [allDays, table.query, dateKey]
  )
  const reservations = useReservations(query)
  const todayKey = vnDateKey(now)

  const hasFilters = !!table.state.search || !!table.state.status
  const clearFilters = () => {
    table.resetFilters()
    setSearchKey((k) => k + 1)
  }

  const columns = useMemo<ColumnDef<ReservationDto>[]>(() => {
    const list: ColumnDef<ReservationDto>[] = [
      {
        id: 'code',
        header: 'Mã',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
      },
      {
        id: 'arrivalAt',
        header: 'Giờ đến',
        enableSorting: true,
        cell: ({ row }) => {
          const key = vnDateKey(row.original.arrivalAt)
          return (
            <div className="leading-tight tabular-nums">
              <div className="font-semibold">{vnHhmm(row.original.arrivalAt)}</div>
              <div className="text-muted-foreground text-xs">{key === todayKey ? 'Hôm nay' : formatDateKey(key)}</div>
            </div>
          )
        },
      },
      {
        id: 'customerName',
        header: 'Khách',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium">{row.original.customerName}</div>
            <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">{formatPhone(row.original.phone)}</div>
          </div>
        ),
      },
      {
        id: 'guestCount',
        header: 'Số khách',
        meta: { className: 'text-right tabular-nums', headerClassName: 'text-right' },
        cell: ({ row }) => row.original.guestCount,
      },
      {
        id: 'table',
        header: 'Bàn',
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="font-semibold">{row.original.tableCode}</div>
            <div className="text-muted-foreground text-xs">{row.original.areaName}</div>
          </div>
        ),
      },
      {
        id: 'deposit',
        header: 'Cọc',
        meta: { className: 'text-right tabular-nums', headerClassName: 'text-right' },
        cell: ({ row }) =>
          row.original.deposit > 0 ? formatVnd(row.original.deposit) : <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => {
          const s = reservationStatusLabels[row.original.status]
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              {row.original.isLate && (
                <StatusBadge tone="warning" dot={false}>
                  Trễ
                </StatusBadge>
              )}
            </div>
          )
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Thao tác</span>,
        meta: { className: 'w-16 text-right', headerClassName: 'w-16' },
        cell: ({ row }) => {
          const r = row.original
          const waiting = r.status === 'ChoDen'
          return (
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-lg" aria-label={`Thao tác với đặt bàn ${r.code}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-muted-foreground truncate text-xs font-normal">
                    {r.code} · {r.customerName}
                  </DropdownMenuLabel>
                  <DropdownMenuItem className="h-11" onSelect={() => onSelect(r)}>
                    <Eye aria-hidden="true" /> Xem chi tiết
                  </DropdownMenuItem>
                  {canCheckIn && waiting && (
                    <DropdownMenuItem className="h-11" disabled={!canCheckInToday(r, now)} onSelect={() => onCheckIn(r)}>
                      <DoorOpen aria-hidden="true" /> Nhận bàn {r.tableCode}
                    </DropdownMenuItem>
                  )}
                  {canUpdate && waiting && (
                    <DropdownMenuItem className="h-11" onSelect={() => onEdit(r)}>
                      <Pencil aria-hidden="true" /> Sửa
                    </DropdownMenuItem>
                  )}
                  {canDelete && waiting && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className="h-11" onSelect={() => onCancel(r)}>
                        <XCircle aria-hidden="true" /> Hủy đặt bàn
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]
    return list
  }, [todayKey, now, canCheckIn, canUpdate, canDelete, onSelect, onCheckIn, onEdit, onCancel])

  const data = reservations.data

  return (
    <DataTable
      columns={columns}
      data={data?.items}
      getRowId={(r) => r.id}
      onRowClick={onSelect}
      isLoading={reservations.isLoading}
      isFetching={reservations.isFetching}
      error={reservations.error}
      onRetry={() => void reservations.refetch()}
      minWidth={980}
      sorting={{ sortBy: table.state.sortBy, sortDir: table.state.sortDir, onSortChange: table.setSort }}
      pagination={
        data && {
          page: data.page,
          pageSize: data.pageSize,
          totalCount: data.totalCount,
          totalPages: data.totalPages,
          onPageChange: table.setPage,
          onPageSizeChange: table.setPageSize,
        }
      }
      toolbar={
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            key={searchKey}
            value={table.state.search}
            onSearch={table.setSearch}
            placeholder="Tìm tên khách, SĐT, mã đặt bàn"
            className="lg:max-w-sm"
          />
          <Select
            value={table.state.status ?? 'all'}
            onValueChange={(v) => table.setFilter('status', v === 'all' ? undefined : (v as ReservationStatus))}
          >
            <SelectTrigger className="h-11 lg:w-48" aria-label="Lọc theo trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi trạng thái</SelectItem>
              {RESERVATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {reservationStatusLabels[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex min-h-11 items-center gap-3 px-1">
            <Switch
              id="all-days"
              checked={allDays}
              onCheckedChange={(v) => {
                setAllDays(v)
                table.setPage(1)
              }}
            />
            <Label htmlFor="all-days" className="cursor-pointer">
              Tất cả ngày
            </Label>
            {!allDays && <span className="text-muted-foreground text-sm tabular-nums">(ngày {formatDateKey(dateKey)})</span>}
          </div>
          {hasFilters && (
            <Button variant="ghost" size="lg" onClick={clearFilters} className="text-muted-foreground lg:ml-auto">
              <X aria-hidden="true" />
              Xóa lọc
            </Button>
          )}
        </div>
      }
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={SearchX}
            title="Không tìm thấy đặt bàn phù hợp"
            description="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
            action={
              <Button variant="outline" size="lg" onClick={clearFilters}>
                Xóa bộ lọc
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarPlus}
            title={allDays ? 'Chưa có đặt bàn nào' : `Chưa có đặt bàn ngày ${formatDateKey(dateKey)}`}
            description="Ghi nhận khách gọi điện đặt bàn để giữ chỗ trước."
            action={
              canCreate && (
                <Button size="lg" onClick={onCreate}>
                  <Plus aria-hidden="true" />
                  Thêm đặt bàn
                </Button>
              )
            }
          />
        )
      }
    />
  )
}

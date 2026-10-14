'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ReceiptText } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { permissions } from '@/config/permissions'
import { useTableQuery } from '@/hooks/use-table-query'
import { formatDateTime, formatTime, formatVnd } from '@/lib/format'
import { useDiningTables, useOrders } from '@/features/pos/hooks/use-pos'
import { orderStatusLabels, paymentMethodLabels } from '@/features/pos/lib/labels'
import { diffDaysKey, vnDateKey } from '@/features/pos/lib/vn-time'
import type { OrderListItem, OrderStatus, PaymentMethod } from '@/features/pos/types/pos.types'
import { OrderDetailSheet } from '../components/OrderDetailSheet'

type Filters = { status: OrderStatus; paymentMethod: PaymentMethod; tableId: string; from: string; to: string }
const ALL = '__all__'

/**
 * SCR-12 Danh sách hóa đơn (UC-12, FR-33): mặc định hôm nay, mới nhất trước; tìm theo mã, lọc bàn,
 * khoảng ngày (theo giờ mở), trạng thái, phương thức. Chạm dòng xem chi tiết, in lại, hủy trong ngày.
 */
export function OrdersPage() {
  const [today] = useState(() => vnDateKey(Date.now()))
  const table = useTableQuery<Filters>({ pageSize: 20, from: today, to: today })
  const orders = useOrders(table.query)
  const tables = useDiningTables(false)
  const [selected, setSelected] = useState<string | null>(null)
  const from = table.state.from ?? today
  const to = table.state.to ?? today
  const rangeError =
    diffDaysKey(from, to) < 0 ? 'Ngày kết thúc phải sau ngày bắt đầu' : diffDaysKey(from, to) + 1 > 366 ? 'Khoảng ngày tối đa 366 ngày' : null

  const columns = useMemo<ColumnDef<OrderListItem>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã hóa đơn', enableSorting: true, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
      {
        accessorKey: 'tableCode',
        header: 'Bàn',
        cell: ({ row }) => (
          <span>
            {row.original.tableCode}
            <span className="text-muted-foreground block text-xs">{row.original.areaName}</span>
          </span>
        ),
      },
      { accessorKey: 'openedAt', header: 'Giờ mở', enableSorting: true, cell: ({ row }) => formatDateTime(row.original.openedAt) },
      { accessorKey: 'paidAt', header: 'Thanh toán', enableSorting: true, cell: ({ row }) => formatTime(row.original.paidAt) },
      { accessorKey: 'guestCount', header: 'Khách', cell: ({ row }) => row.original.guestCount },
      {
        accessorKey: 'waiterName',
        header: 'Phục vụ / Thu ngân',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.waiterName}
            <span className="text-muted-foreground block text-xs">{row.original.cashierName ?? '—'}</span>
          </span>
        ),
      },
      {
        accessorKey: 'paymentMethods',
        header: 'Phương thức',
        cell: ({ row }) => row.original.paymentMethods.map((m) => paymentMethodLabels[m]).join(', ') || '—',
      },
      {
        accessorKey: 'total',
        header: 'Tổng thanh toán',
        enableSorting: true,
        cell: ({ row }) => <span className="font-semibold tabular-nums">{formatVnd(row.original.total)}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => (
          <span className="space-y-0.5">
            <StatusBadge tone={orderStatusLabels[row.original.status].tone}>{orderStatusLabels[row.original.status].label}</StatusBadge>
            {row.original.cancelReason && <span className="text-muted-foreground block text-xs">{row.original.cancelReason}</span>}
            {row.original.splitFromCode && <span className="text-muted-foreground block text-xs">tách từ {row.original.splitFromCode}</span>}
          </span>
        ),
      },
    ],
    []
  )

  const toolbar = (
    <div className="flex flex-wrap items-end gap-2">
      <SearchInput onSearch={table.setSearch} placeholder="Tìm mã hóa đơn…" className="w-full sm:w-56" aria-label="Tìm mã hóa đơn" />
      <label className="grid gap-1 text-xs font-medium">
        Từ ngày
        <Input type="date" value={from} max={today} onChange={(e) => table.setFilter('from', e.target.value || today)} className="h-11 w-40" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Đến ngày
        <Input type="date" value={to} max={today} onChange={(e) => table.setFilter('to', e.target.value || today)} className="h-11 w-40" />
      </label>
      <Select value={table.state.tableId ?? ALL} onValueChange={(v) => table.setFilter('tableId', v === ALL ? undefined : v)}>
        <SelectTrigger className="h-11 w-32" aria-label="Lọc theo bàn">
          <SelectValue placeholder="Bàn" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Mọi bàn</SelectItem>
          {(tables.data ?? []).map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={table.state.status ?? ALL} onValueChange={(v) => table.setFilter('status', v === ALL ? undefined : (v as OrderStatus))}>
        <SelectTrigger className="h-11 w-40" aria-label="Lọc theo trạng thái">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
          {(Object.keys(orderStatusLabels) as OrderStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {orderStatusLabels[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={table.state.paymentMethod ?? ALL}
        onValueChange={(v) => table.setFilter('paymentMethod', v === ALL ? undefined : (v as PaymentMethod))}
      >
        <SelectTrigger className="h-11 w-40" aria-label="Lọc theo phương thức">
          <SelectValue placeholder="Phương thức" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Mọi phương thức</SelectItem>
          {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
            <SelectItem key={m} value={m}>
              {paymentMethodLabels[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rangeError && <p className="text-destructive w-full text-sm">{rangeError}</p>}
    </div>
  )

  return (
    <PermissionGuard permission={permissions.orders.checkout} redirect>
      <div className="space-y-5">
        <PageHeader title="Hóa đơn" icon={ReceiptText} description="Tra cứu hóa đơn theo mã, bàn, ngày, trạng thái; xem chi tiết, in lại, hủy hóa đơn trong ngày." />
        <DataTable
          columns={columns}
          data={rangeError ? [] : orders.data?.items}
          isLoading={orders.isLoading}
          isFetching={orders.isFetching}
          error={rangeError ? undefined : orders.error}
          onRetry={() => void orders.refetch()}
          toolbar={toolbar}
          sorting={{ sortBy: table.state.sortBy, sortDir: table.state.sortDir, onSortChange: table.setSort }}
          pagination={orders.data && !rangeError ? { ...orders.data, onPageChange: table.setPage, onPageSizeChange: table.setPageSize } : undefined}
          getRowId={(row) => row.id}
          onRowClick={(row) => setSelected(row.id)}
          emptyState={<EmptyState title="Không có hóa đơn" description="Thử đổi ngày hoặc bộ lọc." />}
          minWidth={1000}
        />
      </div>
      <OrderDetailSheet orderId={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </PermissionGuard>
  )
}

'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cancelReasonLabels, orderItemStatusLabels } from '@/features/pos/lib/labels'
import type { CancelReason, VoidedItemRow } from '@/features/pos/types/pos.types'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { fetchAllVoidedItems, useVoidedItemsReport } from '../hooks/use-reports'
import { displayDateKey } from '../lib/date-range'
import { excelSheet, reportFileName } from '../lib/export-excel'
import { ExportButton, Stat, TabLoading, TabToolbar, type ReportTabProps } from './ReportParts'

const REASONS = Object.keys(cancelReasonLabels) as CancelReason[]

/** Tab Món hủy (FR-38, SRS §6, TC-44): lý do, người hủy, người duyệt, trạng thái lúc hủy */
export function VoidedItemsTab({ range, enabled }: ReportTabProps) {
  const [reason, setReason] = useState<'all' | CancelReason>('all')
  const [pageSize, setPageSize] = useState(20)
  const filterKey = `${range.from}|${range.to}|${reason}|${pageSize}`
  const [paging, setPaging] = useState({ key: filterKey, page: 1 })
  // Đổi khoảng ngày, lý do hoặc cỡ trang thì quay về trang 1
  const page = paging.key === filterKey ? paging.page : 1

  const filter = { ...range, reason: reason === 'all' ? undefined : reason }
  const report = useVoidedItemsReport({ ...filter, page, pageSize }, { enabled })
  const data = report.data

  if (report.error && !data) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  }
  if (!data) return <TabLoading cards={3} />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Số dòng món hủy" value={formatNumber(data.totalCount)} />
        <Stat
          label="Tổng giá trị hủy"
          value={formatVnd(data.totalValue)}
          sub="Không tính vào doanh thu"
        />
        <div className="bg-card rounded-xl border p-4 shadow-xs lg:col-span-2">
          <p className="text-muted-foreground text-sm">Theo lý do</p>
          {data.byReason.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">Chưa có món hủy.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.byReason.map((r) => {
                const pct = data.totalValue ? (r.value / data.totalValue) * 100 : 0
                return (
                  <li key={r.reason} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{r.reasonText}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatNumber(r.count)} dòng ·{' '}
                        <span className="text-foreground font-medium">{formatVnd(r.value)}</span>
                      </span>
                    </div>
                    <div
                      className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full"
                      aria-hidden="true"
                    >
                      <div
                        className="bg-chart-1 h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="text-destructive size-4" aria-hidden="true" />
              Danh sách món hủy
            </CardTitle>
            <CardDescription>Theo giờ hủy, mới nhất trước.</CardDescription>
          </div>
          <TabToolbar>
            <Select value={reason} onValueChange={(v) => setReason(v as 'all' | CancelReason)}>
              <SelectTrigger className="h-11 w-44" aria-label="Lọc lý do hủy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi lý do</SelectItem>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {cancelReasonLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportButton
              fileName={reportFileName('mon-huy', range.from, range.to)}
              disabled={data.totalCount === 0}
              build={async () => [
                excelSheet(
                  'Món hủy',
                  `Món hủy ${displayDateKey(range.from)} - ${displayDateKey(range.to)}${
                    reason === 'all' ? '' : `, lý do ${cancelReasonLabels[reason]}`
                  }`,
                  [
                    {
                      header: 'Giờ hủy',
                      value: (r: VoidedItemRow) => formatDateTime(r.cancelledAt),
                      width: 18,
                    },
                    { header: 'Mã hóa đơn', value: (r) => r.orderCode, width: 16 },
                    { header: 'Bàn', value: (r) => r.tableCode, width: 8 },
                    { header: 'Món', value: (r) => r.itemName, width: 28 },
                    {
                      header: 'Số lượng',
                      value: (r) => r.quantity,
                      format: '#,##0.###',
                      width: 10,
                    },
                    { header: 'Đơn vị', value: (r) => r.unit, width: 10 },
                    { header: 'Giá trị', value: (r) => r.value },
                    { header: 'Lý do', value: (r) => r.reasonText, width: 26 },
                    { header: 'Người hủy', value: (r) => r.cancelledByUsername, width: 14 },
                    { header: 'Họ tên người hủy', value: (r) => r.cancelledByName, width: 22 },
                    { header: 'Người duyệt', value: (r) => r.approvedByUsername ?? '', width: 14 },
                    {
                      header: 'Trạng thái lúc hủy',
                      value: (r) => orderItemStatusLabels[r.statusAtCancel].label,
                      width: 18,
                    },
                  ],
                  await fetchAllVoidedItems(filter)
                ),
              ]}
            />
          </TabToolbar>
        </CardHeader>
        {data.page.items.length === 0 ? (
          <EmptyState
            compact
            icon={Ban}
            title="Không có món hủy"
            description="Khoảng ngày và lý do này không có món nào bị hủy."
            className="border-t"
          />
        ) : (
          <>
            <div className="overflow-x-auto border-t">
              <Table className="min-w-[1080px]">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Giờ hủy</TableHead>
                    <TableHead>Mã HĐ</TableHead>
                    <TableHead>Bàn</TableHead>
                    <TableHead>Món</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead>Người hủy</TableHead>
                    <TableHead>Người duyệt</TableHead>
                    <TableHead>Trạng thái lúc hủy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.page.items.map((r) => {
                    const status = orderItemStatusLabels[r.statusAtCancel]
                    return (
                      <TableRow key={r.itemId}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDateTime(r.cancelledAt)}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {r.orderCode}
                        </TableCell>
                        <TableCell>{r.tableCode}</TableCell>
                        <TableCell className="font-medium">{r.itemName}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {formatNumber(r.quantity, 3)} {r.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatVnd(r.value)}
                        </TableCell>
                        <TableCell>{r.reasonText}</TableCell>
                        <TableCell>
                          <span className="font-medium">{r.cancelledByUsername}</span>
                          <span className="text-muted-foreground block text-xs">
                            {r.cancelledByName}
                          </span>
                        </TableCell>
                        <TableCell>
                          {r.approvedByUsername ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="border-t">
              <DataTablePagination
                page={data.page.page}
                pageSize={data.page.pageSize}
                totalCount={data.page.totalCount}
                totalPages={data.page.totalPages}
                onPageChange={(p) => setPaging({ key: filterKey, page: p })}
                onPageSizeChange={setPageSize}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Armchair } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAreas } from '@/features/pos/hooks/use-pos'
import { formatDuration } from '@/features/pos/lib/labels'
import type { TableReport } from '@/features/pos/types/pos.types'
import { formatNumber, formatVnd } from '@/lib/format'
import { useTableReport } from '../hooks/use-reports'
import { displayDateKey } from '../lib/date-range'
import { excelSheet, reportFileName } from '../lib/export-excel'
import { ExportButton, TabLoading, TabToolbar, type ReportTabProps } from './ReportParts'

type AreaRow = TableReport['byArea'][number]
type TableRowData = TableReport['byTable'][number]

/** Vòng quay bàn 1 chữ số thập phân: 1.4 → "1,4" */
const formatTurnover = (v: number) => `${formatNumber(v, 1)}`

/** Tab Khu vực và bàn (FR-40, BR-27): doanh thu, lượt phục vụ, vòng quay, thời gian ngồi TB */
export function TablesTab({ range, enabled }: ReportTabProps) {
  const [areaId, setAreaId] = useState('all')
  const areas = useAreas(false, enabled)
  const report = useTableReport(
    { ...range, areaId: areaId === 'all' ? undefined : areaId },
    { enabled }
  )
  const data = report.data
  const areaName = areas.data?.find((a) => a.id === areaId)?.name

  if (report.error && !data) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  }
  if (!data) return <TabLoading cards={0} />

  const hasData = data.byTable.some((t) => t.sessions > 0)

  return (
    <div className="space-y-4">
      <TabToolbar>
        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger className="h-11 w-48" aria-label="Lọc khu vực">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi khu vực</SelectItem>
            {(areas.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          Vòng quay = lượt phục vụ ÷ số bàn đang dùng ÷ {formatNumber(data.days)} ngày.
        </p>
        <div className="ml-auto">
          <ExportButton
            fileName={reportFileName('khu-vuc-ban', range.from, range.to)}
            disabled={!data.byTable.length}
            build={() => {
              const period = `${displayDateKey(range.from)} - ${displayDateKey(range.to)}${
                areaName ? `, ${areaName}` : ''
              }`
              return [
                excelSheet(
                  'Theo khu vực',
                  `Doanh thu theo khu vực ${period}`,
                  [
                    { header: 'Khu vực', value: (a: AreaRow) => a.areaName, width: 18 },
                    { header: 'Số bàn', value: (a) => a.tableCount, width: 10 },
                    { header: 'Doanh thu thuần', value: (a) => a.revenue, width: 18 },
                    { header: 'Lượt phục vụ', value: (a) => a.sessions, width: 14 },
                    {
                      header: 'Vòng quay/ngày',
                      value: (a) => a.turnover,
                      format: '0.0',
                      width: 16,
                    },
                    {
                      header: 'Ngồi TB (phút)',
                      value: (a) => a.avgSeatMinutes,
                      format: '0.0',
                      width: 16,
                    },
                  ],
                  data.byArea
                ),
                excelSheet(
                  'Theo bàn',
                  `Doanh thu theo bàn ${period}`,
                  [
                    { header: 'Bàn', value: (t: TableRowData) => t.tableCode, width: 10 },
                    { header: 'Khu vực', value: (t) => t.areaName, width: 18 },
                    { header: 'Sức chứa', value: (t) => t.capacity, width: 10 },
                    { header: 'Doanh thu thuần', value: (t) => t.revenue, width: 18 },
                    { header: 'Lượt phục vụ', value: (t) => t.sessions, width: 14 },
                    {
                      header: 'Vòng quay/ngày',
                      value: (t) => t.turnover,
                      format: '0.0',
                      width: 16,
                    },
                    {
                      header: 'Ngồi TB (phút)',
                      value: (t) => t.avgSeatMinutes,
                      format: '0.0',
                      width: 16,
                    },
                  ],
                  data.byTable
                ),
              ]
            }}
          />
        </div>
      </TabToolbar>

      {!hasData ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Armchair}
              title="Chưa có lượt phục vụ"
              description="Khoảng ngày và khu vực này chưa có hóa đơn đã thanh toán."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Theo khu vực</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto border-t">
              <Table className="min-w-[640px]">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Khu vực</TableHead>
                    <TableHead className="text-right">Số bàn</TableHead>
                    <TableHead className="text-right">Doanh thu thuần</TableHead>
                    <TableHead className="text-right">Lượt phục vụ</TableHead>
                    <TableHead className="text-right">Vòng quay/ngày</TableHead>
                    <TableHead className="text-right">Ngồi TB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byArea.map((a) => (
                    <TableRow key={a.areaId}>
                      <TableCell className="font-medium">{a.areaName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(a.tableCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVnd(a.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(a.sessions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTurnover(a.turnover)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.sessions ? formatDuration(a.avgSeatMinutes) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Theo bàn</CardTitle>
              <CardDescription>Vòng quay của một bàn = lượt phục vụ ÷ số ngày.</CardDescription>
            </CardHeader>
            <div className="max-h-[32rem] overflow-auto border-t">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Bàn</TableHead>
                    <TableHead>Khu vực</TableHead>
                    <TableHead className="text-right">Sức chứa</TableHead>
                    <TableHead className="text-right">Doanh thu thuần</TableHead>
                    <TableHead className="text-right">Lượt phục vụ</TableHead>
                    <TableHead className="text-right">Vòng quay/ngày</TableHead>
                    <TableHead className="text-right">Ngồi TB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byTable.map((t) => (
                    <TableRow key={t.tableId}>
                      <TableCell className="font-medium">{t.tableCode}</TableCell>
                      <TableCell>{t.areaName}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.capacity} khách</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVnd(t.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(t.sessions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTurnover(t.turnover)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.sessions ? formatDuration(t.avgSeatMinutes) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

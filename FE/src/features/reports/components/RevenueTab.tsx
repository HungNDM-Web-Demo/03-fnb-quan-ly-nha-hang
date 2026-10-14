'use client'

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartColumn } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RevenueTotals } from '@/features/pos/types/pos.types'
import { formatNumber, formatVnd } from '@/lib/format'
import { useRevenueReport } from '../hooks/use-reports'
import { displayDateKey, shortDateKey } from '../lib/date-range'
import { excelSheet, reportFileName, type ExcelColumn } from '../lib/export-excel'
import {
  ChangeText,
  ExportButton,
  Stat,
  TabLoading,
  TabToolbar,
  compactVnd,
  type ReportTabProps,
} from './ReportParts'

const revenueConfig = {
  revenue: { label: 'Kỳ này', color: 'var(--chart-1)' },
  previousRevenue: { label: 'Kỳ trước', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

type DailyRow = RevenueTotals & { date: string; previousRevenue?: number }

const COLUMNS: ExcelColumn<DailyRow>[] = [
  { header: 'Ngày', value: (d) => (d.date ? displayDateKey(d.date) : 'Tổng'), width: 12 },
  { header: 'Doanh thu thuần', value: (d) => d.revenue, width: 18 },
  { header: 'Số hóa đơn', value: (d) => d.orderCount, width: 12 },
  { header: 'Số khách', value: (d) => d.guestCount, width: 10 },
  { header: 'TB mỗi khách', value: (d) => d.revenuePerGuest, width: 14 },
  { header: 'Giảm giá', value: (d) => d.discount },
  { header: 'Phí phục vụ', value: (d) => d.serviceCharge },
  { header: 'Thuế GTGT', value: (d) => d.vatAmount },
  { header: 'Tổng thanh toán', value: (d) => d.total, width: 18 },
  { header: 'Doanh thu kỳ trước', value: (d) => d.previousRevenue, width: 18 },
]

/** Tab Doanh thu (FR-37, BR-26, UC-15 bước 2) */
export function RevenueTab({ range, enabled }: ReportTabProps) {
  const report = useRevenueReport(range, { enabled })
  const data = report.data
  if (report.error && !data) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  }
  if (!data) return <TabLoading cards={8} />

  const t = data.totals
  const hasData = t.orderCount > 0 || data.previous.orderCount > 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Doanh thu thuần"
          value={formatVnd(t.revenue)}
          sub={<ChangeText value={data.revenueChangePercent} />}
        />
        <Stat
          label="Số hóa đơn"
          value={formatNumber(t.orderCount)}
          sub={`Kỳ trước ${formatNumber(data.previous.orderCount)}`}
        />
        <Stat
          label="Số khách"
          value={formatNumber(t.guestCount)}
          sub={`Kỳ trước ${formatNumber(data.previous.guestCount)}`}
        />
        <Stat
          label="Trung bình mỗi khách"
          value={formatVnd(t.revenuePerGuest)}
          sub={`Kỳ trước ${formatVnd(data.previous.revenuePerGuest)}`}
        />
        <Stat label="Giảm giá" value={formatVnd(t.discount)} />
        <Stat
          label="Phí phục vụ"
          value={formatVnd(t.serviceCharge)}
          sub="Không tính vào doanh thu thuần"
        />
        <Stat
          label="Thuế GTGT"
          value={formatVnd(t.vatAmount)}
          sub="Không tính vào doanh thu thuần"
        />
        <Stat
          label="Tổng thanh toán"
          value={formatVnd(t.total)}
          sub="Khách đã trả, gồm phí và thuế"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Doanh thu thuần theo ngày</CardTitle>
            <CardDescription>
              Cột là kỳ này; đường đứt nét là kỳ trước cùng độ dài (
              {displayDateKey(data.previous.from)} → {displayDateKey(data.previous.to)}).
            </CardDescription>
          </div>
          <TabToolbar>
            <ExportButton
              fileName={reportFileName('doanh-thu', data.from, data.to)}
              disabled={!data.daily.length}
              build={() => [
                excelSheet(
                  'Doanh thu theo ngày',
                  `Doanh thu theo ngày ${displayDateKey(data.from)} - ${displayDateKey(data.to)}`,
                  COLUMNS,
                  [...data.daily, { ...t, date: '', previousRevenue: data.previous.revenue }]
                ),
              ]}
            />
          </TabToolbar>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <EmptyState
              icon={ChartColumn}
              title="Chưa có doanh thu"
              description="Khoảng ngày này và kỳ trước chưa có hóa đơn đã thanh toán."
            />
          ) : (
            <ChartContainer
              config={revenueConfig}
              className="aspect-auto h-80 w-full"
              aria-label="Biểu đồ doanh thu thuần theo ngày, so với kỳ trước"
            >
              <ComposedChart data={data.daily} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDateKey}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis tickFormatter={compactVnd} tickLine={false} axisLine={false} width={52} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => displayDateKey(String(v))}
                      formatter={(value, name) => (
                        <div className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">
                            {revenueConfig[name as keyof typeof revenueConfig]?.label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatVnd(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="revenue"
                  fill="var(--color-revenue)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Line
                  dataKey="previousRevenue"
                  type="monotone"
                  stroke="var(--color-previousRevenue)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {hasData && (
        <Card className="gap-0 py-0">
          <div className="max-h-[28rem] overflow-auto">
            <Table className="min-w-[960px]">
              <TableHeader className="bg-muted sticky top-0 z-10">
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-right">Doanh thu thuần</TableHead>
                  <TableHead className="text-right">Số HĐ</TableHead>
                  <TableHead className="text-right">Khách</TableHead>
                  <TableHead className="text-right">TB/khách</TableHead>
                  <TableHead className="text-right">Giảm giá</TableHead>
                  <TableHead className="text-right">Phí phục vụ</TableHead>
                  <TableHead className="text-right">Thuế GTGT</TableHead>
                  <TableHead className="text-right">Tổng thanh toán</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.daily].reverse().map((d) => (
                  <RevenueRow key={d.date} label={displayDateKey(d.date)} row={d} />
                ))}
              </TableBody>
              <tfoot className="bg-muted sticky bottom-0 border-t font-semibold">
                <RevenueRow label="Tổng" row={t} />
              </tfoot>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}

function RevenueRow({ label, row }: { label: string; row: RevenueTotals }) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{label}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatVnd(row.revenue)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(row.orderCount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(row.guestCount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(row.revenuePerGuest)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(row.discount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(row.serviceCharge)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(row.vatAmount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(row.total)}</TableCell>
    </TableRow>
  )
}

'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { UtensilsCrossed } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TopItemsReport } from '@/features/pos/types/pos.types'
import { formatNumber, formatVnd } from '@/lib/format'
import { useReportCategories, useTopItemsReport } from '../hooks/use-reports'
import { displayDateKey } from '../lib/date-range'
import { excelSheet, reportFileName } from '../lib/export-excel'
import {
  ExportButton,
  TabToolbar,
  compactVnd,
  formatPercent,
  type ReportTabProps,
} from './ReportParts'

type SortBy = 'quantity' | 'revenue'
type Item = TopItemsReport['items'][number]

const SORT_LABELS: Record<SortBy, string> = { quantity: 'Số lượng', revenue: 'Doanh thu' }

const chartConfig = {
  quantity: { label: 'Số lượng', color: 'var(--chart-1)' },
  revenue: { label: 'Doanh thu', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** "1,25 kg", "12 phần" (dấu phẩy thập phân) */
const formatQty = (i: Pick<Item, 'quantity' | 'unit'>) => `${formatNumber(i.quantity, 3)} ${i.unit}`

/** Tab Món bán chạy (FR-38): lọc danh mục, sắp theo số lượng hoặc doanh thu */
export function TopItemsTab({ range, enabled }: ReportTabProps) {
  const [categoryId, setCategoryId] = useState('all')
  const [sortBy, setSortBy] = useState<SortBy>('quantity')
  const categories = useReportCategories({ enabled })
  const report = useTopItemsReport(
    { ...range, categoryId: categoryId === 'all' ? undefined : categoryId, sortBy, limit: 20 },
    { enabled }
  )
  const data = report.data
  const top10 = data?.items.slice(0, 10) ?? []
  const categoryName = categories.data?.find((c) => c.id === categoryId)?.name

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Món bán chạy</CardTitle>
          <CardDescription>
            Hóa đơn đã thanh toán; doanh thu món sau giảm giá; tỉ trọng theo doanh thu.
          </CardDescription>
        </div>
        <TabToolbar>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-11 w-48" aria-label="Lọc danh mục">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi danh mục</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-11 w-44" aria-label="Sắp xếp theo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                <SelectItem key={k} value={k}>
                  Theo {SORT_LABELS[k].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton
            fileName={reportFileName('mon-ban-chay', range.from, range.to)}
            disabled={!data?.items.length}
            build={() => [
              excelSheet(
                'Món bán chạy',
                `Món bán chạy ${displayDateKey(range.from)} - ${displayDateKey(range.to)}${
                  categoryName ? `, danh mục ${categoryName}` : ''
                }`,
                [
                  { header: 'Mã', value: (i: Item) => i.code, width: 10 },
                  { header: 'Món', value: (i) => i.name, width: 30 },
                  { header: 'Danh mục', value: (i) => i.categoryName, width: 18 },
                  { header: 'Số lượng', value: (i) => i.quantity, format: '#,##0.###', width: 10 },
                  { header: 'Đơn vị', value: (i) => i.unit, width: 10 },
                  { header: 'Doanh thu', value: (i) => i.revenue },
                  { header: 'Tỉ trọng %', value: (i) => i.share, format: '0.0', width: 12 },
                ],
                data?.items ?? []
              ),
            ]}
          />
        </TabToolbar>
      </CardHeader>
      <CardContent>
        {report.error && !data ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : !data ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="Chưa bán món nào"
            description="Khoảng ngày và danh mục này chưa có món trên hóa đơn đã thanh toán."
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Top {top10.length} theo {SORT_LABELS[sortBy].toLowerCase()}
              </p>
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[26rem] w-full"
                aria-label={`Biểu đồ top ${top10.length} món theo ${SORT_LABELS[sortBy].toLowerCase()}`}
              >
                <BarChart data={top10} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      sortBy === 'revenue' ? compactVnd(v) : formatNumber(v, 1)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _name, item) => {
                          const row = item.payload as Item
                          return (
                            <div className="flex w-full flex-col gap-0.5">
                              <span className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Số lượng</span>
                                <span className="font-medium tabular-nums">{formatQty(row)}</span>
                              </span>
                              <span className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Doanh thu</span>
                                <span className="font-medium tabular-nums">
                                  {formatVnd(row.revenue)}
                                </span>
                              </span>
                              <span className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Tỉ trọng</span>
                                <span className="font-medium tabular-nums">
                                  {formatPercent(row.share)}
                                </span>
                              </span>
                              <span className="sr-only">{String(value)}</span>
                            </div>
                          )
                        }}
                      />
                    }
                  />
                  <Bar
                    dataKey={sortBy}
                    fill={`var(--color-${sortBy})`}
                    radius={4}
                    maxBarSize={28}
                  />
                </BarChart>
              </ChartContainer>
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <Table className="min-w-[560px]">
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Món</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">Tỉ trọng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((i) => (
                    <TableRow key={i.menuItemId}>
                      <TableCell className="text-muted-foreground tabular-nums">{i.code}</TableCell>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-muted-foreground">{i.categoryName}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatQty(i)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVnd(i.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(i.share)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

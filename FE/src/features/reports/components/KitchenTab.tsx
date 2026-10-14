'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChefHat } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KITCHEN_STATIONS, stationLabels } from '@/features/pos/lib/labels'
import type { KitchenReport, KitchenStation } from '@/features/pos/types/pos.types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useKitchenReport } from '../hooks/use-reports'
import { displayDateKey } from '../lib/date-range'
import { excelSheet, reportFileName } from '../lib/export-excel'
import {
  ExportButton,
  Stat,
  TabLoading,
  TabToolbar,
  formatMinutes,
  formatPercent,
  type ReportTabProps,
} from './ReportParts'

type HourRow = KitchenReport['byHour'][number]

const countConfig = {
  itemCount: { label: 'Số món', color: 'var(--chart-1)' },
} satisfies ChartConfig
const lateConfig = {
  lateRate: { label: 'Tỉ lệ trễ', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** Tab Vận hành bếp (FR-39, BR-27): thời gian ra món theo khu, theo món; tỉ lệ trễ theo khung giờ */
export function KitchenTab({ range, enabled }: ReportTabProps) {
  const [station, setStation] = useState<'all' | KitchenStation>('all')
  const report = useKitchenReport(
    { ...range, station: station === 'all' ? undefined : station },
    { enabled }
  )
  const data = report.data

  if (report.error && !data) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  }
  if (!data) return <TabLoading />

  const t = data.totals
  const hours = data.byHour.map((h) => ({ ...h, label: `${h.hour}h` }))
  const stationText = station === 'all' ? '' : `, ${stationLabels[station]}`

  return (
    <div className="space-y-4">
      <TabToolbar>
        <Select value={station} onValueChange={(v) => setStation(v as 'all' | KitchenStation)}>
          <SelectTrigger className="h-11 w-48" aria-label="Lọc khu chế biến">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi khu chế biến</SelectItem>
            {KITCHEN_STATIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {stationLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          Tính món đã xong, không gồm món không qua bếp và món hủy.
        </p>
        <div className="ml-auto">
          <ExportButton
            fileName={reportFileName('van-hanh-bep', range.from, range.to)}
            disabled={t.itemCount === 0}
            build={() => {
              const period = `${displayDateKey(range.from)} - ${displayDateKey(range.to)}${stationText}`
              return [
                excelSheet(
                  'Theo khu chế biến',
                  `Vận hành bếp theo khu chế biến ${period}`,
                  [
                    {
                      header: 'Khu chế biến',
                      value: (s: KitchenReport['byStation'][number]) => stationLabels[s.station],
                      width: 18,
                    },
                    { header: 'Số món', value: (s) => s.itemCount, width: 10 },
                    { header: 'TB phút', value: (s) => s.avgMinutes, format: '0.0', width: 10 },
                    { header: 'Số món trễ', value: (s) => s.lateCount, width: 12 },
                    { header: 'Tỉ lệ trễ %', value: (s) => s.lateRate, format: '0.0', width: 12 },
                  ],
                  data.byStation
                ),
                excelSheet(
                  'Theo món',
                  `Vận hành bếp theo món ${period}`,
                  [
                    {
                      header: 'Mã',
                      value: (i: KitchenReport['byItem'][number]) => i.code,
                      width: 10,
                    },
                    { header: 'Món', value: (i) => i.name, width: 30 },
                    { header: 'Khu chế biến', value: (i) => stationLabels[i.station], width: 16 },
                    { header: 'Chuẩn (phút)', value: (i) => i.prepMinutes, width: 12 },
                    { header: 'Số món', value: (i) => i.itemCount, width: 10 },
                    { header: 'TB phút', value: (i) => i.avgMinutes, format: '0.0', width: 10 },
                    { header: 'Tỉ lệ trễ %', value: (i) => i.lateRate, format: '0.0', width: 12 },
                  ],
                  data.byItem
                ),
                excelSheet(
                  'Theo khung giờ',
                  `Vận hành bếp theo khung giờ ${period}`,
                  [
                    {
                      header: 'Khung giờ',
                      value: (h: HourRow) => `${h.hour}:00-${h.hour + 1}:00`,
                      width: 14,
                    },
                    { header: 'Số món', value: (h) => h.itemCount, width: 10 },
                    { header: 'Số món trễ', value: (h) => h.lateCount, width: 12 },
                    { header: 'Tỉ lệ trễ %', value: (h) => h.lateRate, format: '0.0', width: 12 },
                  ],
                  data.byHour
                ),
              ]
            }}
          />
        </div>
      </TabToolbar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Số món đã xong" value={formatNumber(t.itemCount)} />
        <Stat
          label="Thời gian ra món TB"
          value={formatMinutes(t.itemCount ? t.avgMinutes : null)}
        />
        <Stat
          label="Số món trễ"
          value={formatNumber(t.lateCount)}
          tone={t.lateCount > 0 ? 'destructive' : undefined}
        />
        <Stat
          label="Tỉ lệ trễ"
          value={formatPercent(t.itemCount ? t.lateRate : null)}
          tone={t.lateCount > 0 ? 'destructive' : undefined}
          sub="Món có thời gian ra món từ thời gian chuẩn trở lên"
        />
      </div>

      {t.itemCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ChefHat}
              title="Chưa có món đã xong"
              description="Khoảng ngày và khu chế biến này chưa có món nào bếp báo xong."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <HourChart
              title="Số món theo khung giờ"
              description="Theo giờ gửi bếp, 10h đến 22h."
              data={hours}
              config={countConfig}
              dataKey="itemCount"
              format={(v) => `${formatNumber(v)} món`}
            />
            <HourChart
              title="Tỉ lệ món trễ theo khung giờ"
              description="Phần trăm món trễ trên số món đã xong của khung giờ."
              data={hours}
              config={lateConfig}
              dataKey="lateRate"
              format={formatPercent}
              unit="%"
            />
          </div>

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Theo khu chế biến</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto border-t">
              <Table className="min-w-[560px]">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Khu chế biến</TableHead>
                    <TableHead className="text-right">Số món</TableHead>
                    <TableHead className="text-right">TB ra món</TableHead>
                    <TableHead className="text-right">Số món trễ</TableHead>
                    <TableHead className="text-right">Tỉ lệ trễ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byStation.map((s) => (
                    <TableRow key={s.station}>
                      <TableCell className="font-medium">{stationLabels[s.station]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(s.itemCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinutes(s.avgMinutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(s.lateCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(s.lateRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Theo món</CardTitle>
              <CardDescription>
                Sắp theo thời gian ra món trung bình, chậm nhất trước. Số đỏ là vượt thời gian
                chuẩn.
              </CardDescription>
            </CardHeader>
            <div className="max-h-[28rem] overflow-auto border-t">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Món</TableHead>
                    <TableHead>Khu chế biến</TableHead>
                    <TableHead className="text-right">Chuẩn</TableHead>
                    <TableHead className="text-right">Số món</TableHead>
                    <TableHead className="text-right">TB ra món</TableHead>
                    <TableHead className="text-right">Tỉ lệ trễ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byItem.map((i) => {
                    const over = i.avgMinutes >= i.prepMinutes
                    return (
                      <TableRow key={i.menuItemId}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {i.code}
                        </TableCell>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell>{stationLabels[i.station]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.prepMinutes} phút
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(i.itemCount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            over && 'text-destructive font-semibold'
                          )}
                        >
                          {formatMinutes(i.avgMinutes)}
                          {over && <span className="sr-only"> (vượt chuẩn)</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(i.lateRate)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function HourChart({
  title,
  description,
  data,
  config,
  dataKey,
  format,
  unit,
}: {
  title: string
  description: string
  data: (HourRow & { label: string })[]
  config: ChartConfig
  dataKey: 'itemCount' | 'lateRate'
  format: (v: number) => string
  unit?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-label={title}>
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) => `${formatNumber(v, 0)}${unit ?? ''}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const h = (payload?.[0]?.payload as HourRow | undefined)?.hour
                    return h === undefined ? '' : `${h}:00 - ${h + 1}:00`
                  }}
                  formatter={(value, _name, item) => {
                    const row = item.payload as HourRow
                    return (
                      <div className="flex w-full flex-col gap-0.5">
                        <span className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{config[dataKey]?.label}</span>
                          <span className="font-medium tabular-nums">{format(Number(value))}</span>
                        </span>
                        <span className="text-muted-foreground flex justify-between gap-4">
                          <span>Món trễ / đã xong</span>
                          <span className="tabular-nums">
                            {formatNumber(row.lateCount)} / {formatNumber(row.itemCount)}
                          </span>
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Bar
              dataKey={dataKey}
              fill={`var(--color-${dataKey})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

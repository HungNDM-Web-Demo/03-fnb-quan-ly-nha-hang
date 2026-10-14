'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  AlarmClock,
  ArrowRight,
  Armchair,
  ChefHat,
  Hourglass,
  ReceiptText,
  RefreshCw,
  Timer,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { mainRoutes } from '@/config/routes/main.routes'
import { formatDuration } from '@/features/pos/lib/labels'
import { usePermissions } from '@/hooks/use-permissions'
import { formatNumber, formatTime, formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard } from '../components/KpiCard'
import { useDashboard } from '../hooks/use-dashboard'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Lối tắt trên Tổng quan: Sơ đồ bàn, Màn hình bếp, Báo cáo (ẩn theo quyền) */
const SHORTCUT_PATHS: string[] = [routePath.tables, routePath.kitchen, routePath.reports]

/**
 * SCR-01 Tổng quan (UC-14, FR-01, BR-11, BR-26): tình hình phục vụ, doanh thu, bếp hôm nay;
 * 5 bàn ngồi lâu nhất, chạm để mở màn Gọi món. Tự làm mới 30 giây và theo sự kiện thời gian thực.
 */
export function DashboardPage() {
  const router = useRouter()
  const { can, canAny } = usePermissions()
  const report = useDashboard()
  const data = report.data
  const loading = !data
  const canOpenTable = can(permissions.tables.view)

  const shortcuts = mainRoutes.items.filter(
    (item) =>
      SHORTCUT_PATHS.includes(item.href) &&
      (!item.permission ||
        (Array.isArray(item.permission) ? canAny(item.permission) : can(item.permission)))
  )

  const openTable = (tableId: string) => {
    if (canOpenTable) router.push(routePath.tableService(tableId))
  }

  return (
    <PermissionGuard permission={permissions.dashboard.view} redirect>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-sm">
              {capitalize(format(new Date(), "EEEE, 'ngày' dd/MM/yyyy", { locale: vi }))}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Tổng quan hôm nay</h1>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <p className="text-muted-foreground text-sm">Cập nhật lúc {formatTime(data.asOf)}</p>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={() => void report.refetch()}
              disabled={report.isFetching}
            >
              <RefreshCw className={cn(report.isFetching && 'animate-spin')} aria-hidden="true" />
              Làm mới
            </Button>
          </div>
        </div>

        {report.error && !data ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : (
          <>
            <section
              aria-label="Phục vụ và doanh thu"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
            >
              <KpiCard
                label="Bàn đang phục vụ"
                icon={Armchair}
                isLoading={loading}
                value={
                  data && (
                    <>
                      {formatNumber(data.servingTables)}
                      <span className="text-muted-foreground text-lg font-medium">
                        /{formatNumber(data.totalTables)}
                      </span>
                    </>
                  )
                }
              />
              <KpiCard
                label="Khách đang ngồi"
                icon={Users}
                isLoading={loading}
                value={data && formatNumber(data.guestsSeated)}
              />
              <KpiCard
                label="Doanh thu thuần hôm nay"
                icon={Wallet}
                isLoading={loading}
                value={data && formatVnd(data.revenue)}
              />
              <KpiCard
                label="Hóa đơn đã thanh toán"
                icon={ReceiptText}
                isLoading={loading}
                value={data && formatNumber(data.paidOrderCount)}
              />
              <KpiCard
                label="Doanh thu TB mỗi khách"
                icon={UserRound}
                isLoading={loading}
                value={data && (data.paidGuestCount ? formatVnd(data.revenuePerGuest) : '—')}
              />
            </section>

            <section aria-label="Bếp" className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Món đang chờ bếp"
                icon={Hourglass}
                isLoading={loading}
                value={data && formatNumber(data.pendingItems)}
              />
              <KpiCard
                label="Món trễ"
                icon={AlarmClock}
                isLoading={loading}
                className={cn(
                  data && data.lateItems > 0 && 'border-destructive/50 bg-destructive/5'
                )}
                value={
                  data && (
                    <span className={cn(data.lateItems > 0 && 'text-destructive')}>
                      {formatNumber(data.lateItems)}
                      {data.lateItems > 0 && (
                        <span className="ml-2 text-sm font-medium">quá thời gian chuẩn</span>
                      )}
                    </span>
                  )
                }
              />
              <KpiCard
                label="Thời gian ra món TB hôm nay"
                icon={Timer}
                isLoading={loading}
                value={
                  data &&
                  (data.avgPrepMinutes === undefined || data.avgPrepMinutes === null
                    ? '—'
                    : `${formatNumber(data.avgPrepMinutes, 1)} phút`)
                }
              />
            </section>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="gap-0 pb-0 xl:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">5 bàn ngồi lâu nhất</CardTitle>
                  <CardDescription>
                    {canOpenTable
                      ? 'Chạm một bàn để mở màn Gọi món của bàn đó.'
                      : 'Bàn đang mở, ngồi lâu nhất trước.'}
                  </CardDescription>
                </CardHeader>
                {!data ? (
                  <div className="space-y-2 border-t p-4">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : data.longestTables.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Armchair}
                    title="Chưa có bàn đang phục vụ"
                    description="Bàn mở sẽ hiện ở đây theo thời gian ngồi."
                    className="border-t"
                  />
                ) : (
                  <div className="overflow-x-auto border-t">
                    <Table className="min-w-[640px]">
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>Bàn</TableHead>
                          <TableHead>Khu vực</TableHead>
                          <TableHead>Giờ mở</TableHead>
                          <TableHead>Thời gian ngồi</TableHead>
                          <TableHead className="text-right">Khách</TableHead>
                          <TableHead className="text-right">Tạm tính</TableHead>
                          {canOpenTable && (
                            <TableHead className="w-10">
                              <span className="sr-only">Mở</span>
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.longestTables.map((t) => (
                          <TableRow
                            key={t.orderId}
                            tabIndex={canOpenTable ? 0 : undefined}
                            role={canOpenTable ? 'link' : undefined}
                            aria-label={
                              canOpenTable
                                ? `Mở bàn ${t.tableCode}, ngồi ${formatDuration(t.minutesSeated)}`
                                : undefined
                            }
                            onClick={() => openTable(t.tableId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openTable(t.tableId)
                              }
                            }}
                            className={cn(
                              'h-12',
                              canOpenTable &&
                                'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-inset'
                            )}
                          >
                            <TableCell className="font-semibold">{t.tableCode}</TableCell>
                            <TableCell>{t.areaName}</TableCell>
                            <TableCell className="tabular-nums">{formatTime(t.openedAt)}</TableCell>
                            <TableCell className="tabular-nums">
                              {formatDuration(t.minutesSeated)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(t.guestCount)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatVnd(t.subtotal)}
                            </TableCell>
                            {canOpenTable && (
                              <TableCell>
                                <ArrowRight
                                  className="text-muted-foreground size-4"
                                  aria-hidden="true"
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lối tắt</CardTitle>
                </CardHeader>
                <CardContent>
                  {shortcuts.length === 0 ? (
                    <EmptyState compact icon={ChefHat} title="Chưa có lối tắt theo quyền của bạn" />
                  ) : (
                    <div className="grid gap-3">
                      {shortcuts.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="group hover:border-primary/40 focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-xl border p-3 transition-[border-color,box-shadow] duration-200 outline-none hover:shadow-sm focus-visible:ring-3"
                        >
                          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                            <item.icon className="size-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{item.title}</span>
                            {item.description && (
                              <span className="text-muted-foreground block text-sm">
                                {item.description}
                              </span>
                            )}
                          </span>
                          <ArrowRight
                            className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PermissionGuard>
  )
}

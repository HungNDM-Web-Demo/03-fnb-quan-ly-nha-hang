'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage } from '@/lib/api-error'
import { formatTime } from '@/lib/format'
import { useReadyItems, usePosMutation } from '../hooks/use-pos'
import { formatQuantity } from '../lib/labels'
import { PosRules } from '../lib/pos-rules'
import { orderService } from '../services/order.service'

/**
 * Chuông "Món chờ ra" trên header của vai trò có `orders.create` (UC-07, FR-19).
 * Mặc định lọc "Bàn của tôi"; "Đã ra" có thông báo kèm nút "Hoàn tác" 10 giây (UC-07 E1).
 */
export function ReadyItemsBell() {
  const { can } = usePermissions()
  const enabled = can(permissions.orders.create)
  const [mine, setMine] = useState(true)
  const [open, setOpen] = useState(false)
  const ready = useReadyItems(mine, enabled)
  const serve = usePosMutation((v: { orderId: string; itemId: string }) => orderService.serve(v.orderId, v.itemId))
  const serveAll = usePosMutation((orderId: string) => orderService.serveAll(orderId))
  const unserve = usePosMutation((v: { orderId: string; itemId: string }) => orderService.unserve(v.orderId, v.itemId))

  if (!enabled) return null
  const groups = ready.data ?? []
  const count = groups.reduce((s, g) => s + g.items.length, 0)

  const onServe = (orderId: string, itemId: string, name: string) =>
    serve.mutate(
      { orderId, itemId },
      {
        onSuccess: () =>
          toast.success(`Đã ra: ${name}`, {
            duration: PosRules.unserveToastSeconds * 1000,
            action: {
              label: 'Hoàn tác',
              onClick: () =>
                unserve.mutate({ orderId, itemId }, { onError: (error) => toast.error(getErrorMessage(error)) }),
            },
          }),
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10" aria-label={`Món chờ ra: ${count} món`}>
          <Bell className="size-5" aria-hidden="true" />
          {count > 0 && (
            <Badge className="bg-cta text-cta-foreground absolute -top-0.5 -right-0.5 h-5 min-w-5 rounded-full px-1 text-xs tabular-nums">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="font-semibold">Món chờ ra</p>
            <p className="text-muted-foreground text-xs">Món xong sớm xếp trước</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ready-mine" checked={mine} onCheckedChange={setMine} />
            <Label htmlFor="ready-mine" className="text-sm">
              Bàn của tôi
            </Label>
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {ready.isLoading ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 p-6 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Đang tải…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Chưa có món chờ ra</p>
          ) : (
            <ul className="divide-y">
              {groups.map((group) => (
                <li key={group.orderId} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={routePath.tableService(group.tableId)}
                      onClick={() => setOpen(false)}
                      className="text-primary text-base font-bold hover:underline"
                    >
                      {group.tableCode}
                    </Link>
                    <span className="text-muted-foreground truncate text-xs">{group.waiterName}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-9"
                      disabled={serveAll.isPending}
                      onClick={() =>
                        serveAll.mutate(group.orderId, {
                          onSuccess: () => toast.success(`${group.tableCode}: đã ra hết ${group.items.length} món`),
                          onError: (error) => toast.error(getErrorMessage(error)),
                        })
                      }
                    >
                      <CheckCheck aria-hidden="true" />
                      Ra hết
                    </Button>
                  </div>
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item.itemId} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {formatQuantity(item.quantity, item.unit, item.unit === 'kg' ? 'TheoTrongLuong' : 'TheoSuat')} ·{' '}
                            {item.itemName}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Xong lúc {formatTime(item.doneAt)}
                            {item.note ? ` · ${item.note}` : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="h-9"
                          disabled={serve.isPending}
                          onClick={() => onServe(group.orderId, item.itemId, item.itemName)}
                        >
                          Đã ra
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

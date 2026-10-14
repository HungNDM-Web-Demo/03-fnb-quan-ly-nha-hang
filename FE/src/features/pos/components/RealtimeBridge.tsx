'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { subscribePosEvents, useRealtimeStore, type PosEvent } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { invalidatePos } from '../hooks/use-pos'
import { playSound, unlockSound } from '../lib/sound'

/**
 * Nối sự kiện thời gian thực (07 §2.18) vào giao diện:
 * - mọi sự kiện → làm mới query 'pos' (gom trong 150 ms);
 * - tablet của phục vụ phụ trách bàn: âm báo món xong (FR-19), thông báo hết món (TC-07), món bị hủy (UC-07 E2).
 */
export function RealtimeBridge({ waiterAlerts = true }: { waiterAlerts?: boolean }) {
  const client = useQueryClient()
  const { user, can } = usePermissions()
  const userId = user?.id
  const isWaiter = waiterAlerts && can(permissions.orders.create)
  const reconnectCount = useRealtimeStore((s) => s.reconnectCount)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void invalidatePos(client), 150)
    }
    const unsubscribe = subscribePosEvents((event: PosEvent) => {
      refresh()
      if (!isWaiter) return
      if (event.name === 'items-ready' && event.payload.waiterId === userId) {
        playSound('ready')
        toast.success(`${event.payload.tableCode}: ${event.payload.count} món đã xong, mời ra món`, {
          id: `ready-${event.payload.orderId}`,
        })
      } else if (event.name === 'item-out-of-stock' && event.payload.waiterId === userId) {
        playSound('alert')
        toast.warning(event.payload.message, { duration: 10_000 })
      } else if (event.name === 'item-cancelled' && event.remote && event.payload.waiterId === userId) {
        toast.info(`${event.payload.tableCode}: ${event.payload.itemName} đã hủy`)
      }
    })
    return () => {
      unsubscribe()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [client, userId, isWaiter])

  // Trình duyệt chỉ cho phát âm thanh sau lần chạm đầu tiên vào trang
  useEffect(() => {
    if (!isWaiter) return
    const unlock = () => void unlockSound()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [isWaiter])

  // Nối lại sau khi mất kết nối: làm mới toàn bộ (UC-06 E1)
  useEffect(() => {
    if (reconnectCount > 0) void invalidatePos(client)
  }, [reconnectCount, client])

  return null
}

/** Thanh đỏ "Mất kết nối, đang thử lại" (UC-06 E1) */
export function ConnectionBanner({ className }: { className?: string }) {
  const status = useRealtimeStore((s) => s.status)
  if (status === 'connected') return null
  return (
    <div
      role="alert"
      className={cn(
        'bg-destructive text-destructive-foreground flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold',
        className
      )}
    >
      <WifiOff className="size-4" aria-hidden="true" />
      Mất kết nối, đang thử lại
    </div>
  )
}

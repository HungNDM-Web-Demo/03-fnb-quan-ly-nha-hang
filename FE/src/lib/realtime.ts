'use client'

import { create } from 'zustand'
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr'
import { apiRoutes } from '@/config/api-routes'
import { appConfig } from '@/config/app.config'
import { isMockMode } from '@/lib/data-source'
import { storageKey } from '@/lib/storage'
import { getAccessToken } from '@/stores/auth.store'
import type { PosEventMap, PosEventName } from '@/features/pos/types/pos.types'

/**
 * Lớp thời gian thực dùng chung hai chế độ (docs/07-DANH-SACH-API.md §2.18, NFR-03).
 * - mock: handler gọi `publishPosEvent(tên, payload)` sau khi ghi; sự kiện đi qua BroadcastChannel
 *   khóa `{storagePrefix}:pos-events` tới tab khác và phát lại ngay trong tab hiện tại.
 * - api: SignalR hub `/hubs/pos`, JWT qua `accessTokenFactory`, tự nối lại; mất kết nối thì
 *   trạng thái `reconnecting` để giao diện hiện thanh đỏ "Mất kết nối, đang thử lại".
 */

export const POS_EVENT_NAMES: PosEventName[] = [
  'tables-changed',
  'order-changed',
  'kitchen-changed',
  'items-ready',
  'item-out-of-stock',
  'item-cancelled',
  'menu-changed',
  'reservations-changed',
]

export type PosEvent = {
  [K in PosEventName]: { name: K; payload: PosEventMap[K]; remote: boolean }
}[PosEventName]

type Listener = (event: PosEvent) => void
type ConnectionStatus = 'connected' | 'reconnecting'

type RealtimeState = {
  status: ConnectionStatus
  /** Tăng mỗi lần nối lại thành công, để giao diện làm mới toàn bộ (UC-06 E1) */
  reconnectCount: number
}

export const useRealtimeStore = create<RealtimeState>(() => ({ status: 'connected', reconnectCount: 0 }))

const listeners = new Set<Listener>()
const CHANNEL_NAME = storageKey('pos-events')
let channel: BroadcastChannel | null = null
let hub: HubConnection | null = null
let hubStarting: Promise<void> | null = null
/** Hẹn dừng hub khi không còn người nghe; hủy nếu có người nghe mới (tránh dừng giữa lúc đang nối khi component gắn lại) */
let stopTimer: ReturnType<typeof setTimeout> | null = null

function emit(event: PosEvent) {
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      console.error('[realtime] Lỗi trong listener:', error)
    }
  })
}

function ensureChannel() {
  if (channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (message: MessageEvent<{ name: PosEventName; payload: unknown }>) => {
    if (!message.data?.name) return
    emit({ name: message.data.name, payload: message.data.payload, remote: true } as PosEvent)
  }
}

/** Chế độ mock: phát sự kiện tới tab khác và tab hiện tại (cùng hình dạng như SignalR). */
export function publishPosEvent<K extends PosEventName>(name: K, payload: PosEventMap[K]) {
  if (typeof window === 'undefined') return
  ensureChannel()
  try {
    channel?.postMessage({ name, payload })
  } catch {
    // bỏ qua
  }
  // Phát trong tab hiện tại sau khi handler trả kết quả
  setTimeout(() => emit({ name, payload, remote: false } as PosEvent), 0)
}

function ensureHub() {
  if (hub || typeof window === 'undefined') return
  hub = new HubConnectionBuilder()
    .withUrl(`${appConfig.apiUrl}${apiRoutes.posHub}`, {
      accessTokenFactory: () => getAccessToken() ?? '',
    })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1_000 * 2 ** ctx.previousRetryCount) })
    .configureLogging(LogLevel.Warning)
    .build()
  for (const name of POS_EVENT_NAMES) {
    hub.on(name, (payload: unknown) => emit({ name, payload, remote: true } as PosEvent))
  }
  hub.onreconnecting(() => useRealtimeStore.setState({ status: 'reconnecting' }))
  hub.onreconnected(() =>
    useRealtimeStore.setState((s) => ({ status: 'connected', reconnectCount: s.reconnectCount + 1 }))
  )
  hub.onclose(() => {
    useRealtimeStore.setState({ status: 'reconnecting' })
    // Hết lượt tự nối lại: thử khởi động lại sau 5 giây khi còn người nghe
    setTimeout(() => {
      if (listeners.size > 0) void startHub()
    }, 5_000)
  })
}

async function startHub() {
  ensureHub()
  if (!hub || hub.state !== HubConnectionState.Disconnected || !getAccessToken()) return
  if (hubStarting) return hubStarting
  hubStarting = hub
    .start()
    .then(() => {
      const wasDown = useRealtimeStore.getState().status === 'reconnecting'
      useRealtimeStore.setState((s) => ({
        status: 'connected',
        reconnectCount: wasDown ? s.reconnectCount + 1 : s.reconnectCount,
      }))
    })
    .catch(() => {
      useRealtimeStore.setState({ status: 'reconnecting' })
      setTimeout(() => {
        if (listeners.size > 0) void startHub()
      }, 5_000)
    })
    .finally(() => {
      hubStarting = null
    })
  return hubStarting
}

/** Nghe sự kiện thời gian thực (cả hai chế độ). Trả hàm hủy đăng ký. */
export function subscribePosEvents(listener: Listener): () => void {
  listeners.add(listener)
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  if (isMockMode()) ensureChannel()
  else void startHub()
  return () => {
    listeners.delete(listener)
    if (isMockMode() || listeners.size > 0 || !hub || stopTimer) return
    // React gỡ rồi gắn lại listener ngay (StrictMode, đổi quyền sau khi tải hồ sơ): chờ 1 giây mới dừng hub,
    // không thì kết nối bị dừng giữa lúc thương lượng và thanh "Mất kết nối" hiện oan 5 giây.
    stopTimer = setTimeout(() => {
      stopTimer = null
      if (listeners.size === 0 && hub) void hub.stop()
    }, 1_000)
  }
}

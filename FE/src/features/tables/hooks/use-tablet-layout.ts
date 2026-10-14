'use client'

import { useEffect } from 'react'
import { readJson, storageKey, writeJson } from '@/lib/storage'
import { useUiStore } from '@/stores/ui.store'

const KEY = storageKey('tablet-sidebar-collapsed')

/**
 * Màn tablet (sơ đồ bàn, gọi món, thanh toán): thu gọn sidebar mặc định trên màn ≤ 1366 px (07 §4, NFR-01).
 * Chỉ tự thu gọn một lần mỗi phiên, người dùng mở lại thì giữ nguyên.
 */
export function useTabletLayout() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 1366) return
    if (readJson<boolean>('session', KEY)) return
    writeJson('session', KEY, true)
    setSidebarOpen(false)
  }, [setSidebarOpen])
}

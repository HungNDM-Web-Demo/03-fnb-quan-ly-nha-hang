'use client'

import { useEffect } from 'react'
import { DemoToolbar } from '@/components/demo/DemoToolbar'
import { RealtimeBridge } from '@/features/pos/components/RealtimeBridge'

/**
 * Khung màn hình bếp: không sidebar, header; luôn nền tối (NFR-02) kể cả hộp thoại (gắn lớp `dark` lên <html>
 * khi đang mở màn bếp, trả lại như cũ khi rời đi); giữ thanh công cụ demo.
 */
export function KitchenShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const apply = () => root.classList.add('dark')
    apply()
    const observer = new MutationObserver(() => {
      if (!root.classList.contains('dark')) apply()
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      if (!hadDark) root.classList.remove('dark')
    }
  }, [])
  return (
    <div className="dark bg-background text-foreground min-h-svh">
      <RealtimeBridge waiterAlerts={false} />
      {children}
      <DemoToolbar />
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { routePath } from '@/config/route-path'
import { useAuth, useSyncCurrentUser } from '@/features/auth/hooks/use-auth'

/**
 * Trang in cần đăng nhập nhưng không theo quyền menu `/orders` (phục vụ in tạm tính bằng `orders.prebill`);
 * quyền chi tiết do trang in tự kiểm.
 */
export function PrintAuthGate({ children }: { children: React.ReactNode }) {
  const { hydrated, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  useSyncCurrentUser()
  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace(`${routePath.login}?redirect=${encodeURIComponent(pathname)}`)
  }, [hydrated, isAuthenticated, pathname, router])
  if (!hydrated || !isAuthenticated) return null
  return <>{children}</>
}

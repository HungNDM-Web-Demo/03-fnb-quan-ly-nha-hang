import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { KitchenShell } from '@/features/kitchen/components/KitchenShell'

/** Route toàn màn hình (07 §4): cần đăng nhập, không sidebar, header; luôn nền tối. */
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <KitchenShell>{children}</KitchenShell>
    </AuthGuard>
  )
}

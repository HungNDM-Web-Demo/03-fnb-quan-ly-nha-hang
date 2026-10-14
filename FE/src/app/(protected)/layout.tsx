import { AppShell } from '@/components/shared/AppShell'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { ReadyItemsBell } from '@/features/pos/components/ReadyItemsBell'
import { ConnectionBanner, RealtimeBridge } from '@/features/pos/components/RealtimeBridge'

/** Khu vực cần đăng nhập: sidebar + header + thanh công cụ demo (KIEN-TRUC-HE-THONG §6.4). */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RealtimeBridge />
      <AppShell headerActions={<ReadyItemsBell />} banner={<ConnectionBanner />}>
        {children}
      </AppShell>
    </AuthGuard>
  )
}

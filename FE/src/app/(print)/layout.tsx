import { PrintAuthGate } from '@/features/orders/components/PrintAuthGate'

/** Trang in (phiếu tạm tính, hóa đơn): cần đăng nhập, không sidebar, header; CSS @page 80 mm (NFR-06). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <PrintAuthGate>{children}</PrintAuthGate>
}

import type { Metadata } from 'next'
import { ReservationsPage } from '@/features/reservations/pages/ReservationsPage'

export const metadata: Metadata = { title: 'Đặt bàn' }

export default function Page() {
  return <ReservationsPage />
}

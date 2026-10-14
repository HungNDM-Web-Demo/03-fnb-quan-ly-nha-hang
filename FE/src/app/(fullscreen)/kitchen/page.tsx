import type { Metadata } from 'next'
import { KitchenPage } from '@/features/kitchen/pages/KitchenPage'

export const metadata: Metadata = { title: 'Màn hình bếp' }

export default function Page() {
  return <KitchenPage />
}

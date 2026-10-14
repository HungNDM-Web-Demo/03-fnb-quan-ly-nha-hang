import type { Metadata } from 'next'
import { FloorPlanPage } from '@/features/tables/pages/FloorPlanPage'

export const metadata: Metadata = { title: 'Sơ đồ bàn' }

export default function Page() {
  return <FloorPlanPage />
}

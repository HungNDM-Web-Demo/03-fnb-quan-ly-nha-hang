import type { Metadata } from 'next'
import { TableServicePage } from '@/features/tables/pages/TableServicePage'

export const metadata: Metadata = { title: 'Gọi món' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TableServicePage tableId={id} />
}

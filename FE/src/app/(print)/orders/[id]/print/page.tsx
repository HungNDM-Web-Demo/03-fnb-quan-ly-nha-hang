import type { Metadata } from 'next'
import { OrderPrintPage } from '@/features/orders/pages/OrderPrintPage'

export const metadata: Metadata = { title: 'Bản in' }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string; reprint?: string; auto?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  return <OrderPrintPage id={id} prebill={query.type === 'prebill'} reprint={query.reprint === '1'} auto={query.auto === '1'} />
}

import type { Metadata } from 'next'
import { CheckoutPage } from '@/features/tables/pages/CheckoutPage'

export const metadata: Metadata = { title: 'Thanh toán' }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ order?: string }>
}) {
  const { id } = await params
  const { order } = await searchParams
  return <CheckoutPage tableId={id} initialOrderId={order} />
}

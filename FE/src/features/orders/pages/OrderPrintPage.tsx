'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { readJson, storageKey } from '@/lib/storage'
import { useOrder, useStoreProfile } from '@/features/pos/hooks/use-pos'
import { formatSignedVnd, paymentMethodLabels } from '@/features/pos/lib/labels'
import type { OrderDto, StoreProfile } from '@/features/pos/types/pos.types'
import '../components/receipt.css'

/** Khóa thử nghiệm: đặt "1" để trang in không tự gọi window.print() (kiểm thử tự động) */
export const NO_AUTO_PRINT_KEY = storageKey('print.no-auto')

type OrderPrintPageProps = { id: string; prebill: boolean; reprint: boolean; auto: boolean }

/**
 * SCR-09 bản in khổ 80 mm (07 §2.19, NFR-06): `?type=prebill` → "PHIẾU TẠM TÍNH – chưa phải hóa đơn" (TC-34);
 * hóa đơn; `?reprint=1` có dòng "IN LẠI" (TC-40); `?auto=1` tự in khi mở từ luồng thao tác.
 */
export function OrderPrintPage({ id, prebill, reprint, auto }: OrderPrintPageProps) {
  const router = useRouter()
  const order = useOrder(id)
  const store = useStoreProfile()
  const ready = !!order.data && !!store.data
  const printed = useRef(false)

  useEffect(() => {
    if (!auto || !ready || printed.current) return
    if (readJson<string | number>('local', NO_AUTO_PRINT_KEY)?.toString() === '1') return
    printed.current = true
    const timer = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(timer)
  }, [auto, ready])

  return (
    <PermissionGuard permission={prebill ? permissions.orders.prebill : [permissions.orders.checkout, permissions.orders.reprint]} redirect>
      <div className="bg-muted min-h-svh print:bg-white">
        <div className="print-hidden bg-card sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(routePath.tables))}
          >
            <ArrowLeft aria-hidden="true" />
            Quay lại
          </Button>
          <span className="text-muted-foreground flex-1 truncate text-sm">
            {prebill ? 'Phiếu tạm tính' : reprint ? 'In lại hóa đơn' : 'Hóa đơn'} · khổ 80 mm
          </span>
          <Button variant="cta" className="h-11" onClick={() => window.print()} disabled={!ready}>
            <Printer aria-hidden="true" />
            In
          </Button>
        </div>
        <div className="flex justify-center px-4 py-6 print:p-0">
          <div className="receipt rounded-sm px-3 py-4 shadow-md print:rounded-none print:p-0 print:shadow-none">
            {order.error ? (
              <ErrorState error={order.error} onRetry={() => void order.refetch()} />
            ) : !ready ? (
              <div className="space-y-2">
                <Skeleton className="mx-auto h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <ReceiptBody order={order.data!} store={store.data!} prebill={prebill} reprint={reprint} />
            )}
          </div>
        </div>
      </div>
    </PermissionGuard>
  )
}

function ReceiptBody({ order, store, prebill, reprint }: { order: OrderDto; store: StoreProfile; prebill: boolean; reprint: boolean }) {
  const items = order.items.filter((i) => i.status !== 'DaHuy' && i.status !== 'ChuaGui')
  const payments = order.payments
  const change = payments.reduce((s, p) => s + (p.changeAmount ?? 0), 0)
  return (
    <article aria-label={prebill ? `Phiếu tạm tính ${order.code}` : `Hóa đơn ${order.code}`}>
      <header className="text-center">
        <p className="text-[15px] font-bold uppercase">{store.name}</p>
        <p>{store.address}</p>
        <p>
          ĐT: {store.phone} · MST: {store.taxCode}
        </p>
        <p className="mt-2 text-[15px] font-bold tracking-wide">
          {prebill ? 'PHIẾU TẠM TÍNH – chưa phải hóa đơn' : 'HÓA ĐƠN THANH TOÁN'}
        </p>
        {reprint && !prebill && <p className="font-bold">IN LẠI</p>}
        {order.status === 'DaHuy' && <p className="font-bold">ĐÃ HỦY{order.cancelReason ? `: ${order.cancelReason}` : ''}</p>}
      </header>
      <hr className="receipt-sep" />
      <table className="w-full">
        <tbody>
          <Line label="Số HĐ" value={order.code} bold />
          <Line label="Bàn" value={`${order.tableCode}${order.mergedTableCodes.length ? ` (gộp ${order.mergedTableCodes.join(', ')})` : ''}`} />
          <Line label="Số khách" value={String(order.guestCount)} />
          <Line label="Giờ vào" value={formatDateTime(order.openedAt)} />
          <Line label="Giờ in" value={formatDateTime(new Date())} />
          <Line label="Phục vụ" value={order.waiterName} />
          {!prebill && <Line label="Thu ngân" value={order.cashierName ?? '—'} />}
        </tbody>
      </table>
      <hr className="receipt-sep" />
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="font-semibold">Món</th>
            <th className="text-right font-semibold">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-0.5 pr-2">
                <div>{item.itemName}</div>
                <div>
                  {item.pricingType === 'TheoTrongLuong'
                    ? `${formatNumber(item.quantity, 3)} kg × ${formatNumber(item.unitPrice, 0)}`
                    : `${item.quantity} × ${formatNumber(item.unitPrice, 0)}`}
                </div>
              </td>
              <td className="py-0.5 text-right whitespace-nowrap">{formatNumber(item.lineTotal, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="receipt-sep" />
      <table className="w-full">
        <tbody>
          <Line label="Tiền món" value={formatVnd(order.subtotal)} />
          {order.discount && (
            <Line
              label={`Giảm giá (${order.discount.reason}${order.discount.approvedByUsername ? `, duyệt ${order.discount.approvedByUsername}` : ''})`}
              value={`−${formatVnd(order.discount.amount)}`}
            />
          )}
          <Line label={`Phí phục vụ ${order.serviceChargeRate}%`} value={formatVnd(order.serviceCharge)} />
          <Line label={`Thuế GTGT ${order.vatRate}%`} value={formatVnd(order.vatAmount)} />
          <Line label="Làm tròn" value={formatSignedVnd(order.rounding)} />
          <Line label="TỔNG THANH TOÁN" value={formatVnd(order.total)} bold />
          {order.deposit > 0 && <Line label="Tiền cọc" value={`−${formatVnd(Math.min(order.deposit, order.total))}`} />}
          {prebill && order.deposit > 0 && <Line label="Còn phải thu" value={formatVnd(order.remaining)} bold />}
        </tbody>
      </table>
      {!prebill && payments.filter((p) => p.method !== 'TienCoc').length > 0 && (
        <>
          <hr className="receipt-sep" />
          <table className="w-full">
            <tbody>
              {payments
                .filter((p) => p.method !== 'TienCoc')
                .map((p) => (
                  <Line
                    key={p.id}
                    label={`${paymentMethodLabels[p.method]}${p.shareNo ? ` (phần ${p.shareNo})` : ''}${p.cardLast4 ? ` ****${p.cardLast4}` : ''}`}
                    value={formatVnd(p.cashReceived ?? p.amount)}
                  />
                ))}
              {change > 0 && <Line label="Tiền thối" value={formatVnd(change)} />}
              {order.depositRefund > 0 && <Line label="Hoàn cọc" value={formatVnd(order.depositRefund)} />}
            </tbody>
          </table>
        </>
      )}
      <hr className="receipt-sep" />
      <p className="text-center">{prebill ? 'Quý khách vui lòng kiểm tra món trước khi thanh toán.' : store.receiptFooter}</p>
    </article>
  )
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className={bold ? 'font-bold' : undefined}>
      <td className="py-0.5 pr-2">{label}</td>
      <td className="py-0.5 text-right whitespace-nowrap">{value}</td>
    </tr>
  )
}

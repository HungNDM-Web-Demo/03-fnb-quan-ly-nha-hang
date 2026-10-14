'use client'

import { useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Loader2, QrCode } from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getErrorMessage, getFieldErrors, isApiError } from '@/lib/api-error'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/features/pos/components/MoneyInput'
import { QrImage } from '@/features/pos/components/QrImage'
import { usePosMutation, useStoreProfile } from '@/features/pos/hooks/use-pos'
import { QUICK_CASH } from '@/features/pos/lib/pricing'
import { buildQrContent } from '@/features/pos/lib/vietqr'
import { orderService } from '@/features/pos/services/order.service'
import type { CreatePaymentRequest, OrderDto, PaymentResultDto } from '@/features/pos/types/pos.types'

type Method = CreatePaymentRequest['method']
const newRequestId = () => crypto.randomUUID()

type PaymentPanelProps = {
  order: OrderDto
  onPaid: (result: PaymentResultDto) => void
}

/**
 * Thu một lượt (UC-11 bước 3, FR-30, BR-20): tiền mặt có nút mệnh giá nhanh và tiền thối; chuyển khoản hiện QR
 * giả lập có số tiền, nội dung là mã hóa đơn; thẻ nhập 4 số cuối. Đang chia đều thì thu đúng tiền từng phần.
 * Mỗi lượt có `clientRequestId` giữ nguyên khi thử lại (NFR-05, UC-11 E5).
 */
export function PaymentPanel({ order, onPaid }: PaymentPanelProps) {
  const profile = useStoreProfile()
  const [method, setMethod] = useState<Method>('TienMat')
  const firstUnpaid = order.shares?.find((s) => !s.paid)
  const [pickedShare, setShareNo] = useState<number | undefined>(firstUnpaid?.no)
  // Phần đang chọn còn hợp lệ thì giữ, không thì lấy phần chưa thu đầu tiên (vừa chia đều, vừa thu xong một phần)
  const shareNo = order.shares?.some((s) => s.no === pickedShare && !s.paid) ? pickedShare : firstUnpaid?.no
  const [cash, setCash] = useState<number | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [last4, setLast4] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmPartial, setConfirmPartial] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId)
  const [orderKey, setOrderKey] = useState(`${order.id}:${order.payments.length}`)
  const key = `${order.id}:${order.payments.length}`
  if (key !== orderKey) {
    setOrderKey(key)
    setCash(null)
    setAmount(null)
    setLast4('')
    setError(null)
    setShareNo(order.shares?.find((s) => !s.paid)?.no)
  }

  const share = order.shares?.find((s) => s.no === shareNo)
  const target = order.splitCount ? (share && !share.paid ? share.amount : 0) : order.remaining
  const pay = usePosMutation((input: CreatePaymentRequest) => orderService.pay(order.id, input))
  const complete = usePosMutation(() => orderService.complete(order.id, { version: order.version }))

  const effectiveAmount = order.splitCount ? target : (amount ?? target)
  const qrContent = profile.data
    ? buildQrContent({ bankBin: profile.data.bankBin, bankAccount: profile.data.bankAccount, amount: effectiveAmount, orderCode: order.code })
    : ''

  const submit = (allowPartial = false) => {
    setError(null)
    const base = { clientRequestId: requestId, version: order.version, shareNo: order.splitCount ? shareNo : undefined }
    let input: CreatePaymentRequest
    if (method === 'TienMat') {
      if (!cash) return setError('Nhập tiền khách đưa')
      if (cash < target && !order.splitCount && !allowPartial) return setConfirmPartial(true)
      input = { ...base, method, cashReceived: cash, allowPartial }
    } else if (method === 'ChuyenKhoan') {
      if (!effectiveAmount) return setError('Nhập số tiền')
      input = { ...base, method, amount: effectiveAmount, qrContent }
    } else {
      if (!effectiveAmount) return setError('Nhập số tiền')
      if (!/^\d{4}$/.test(last4)) return setError('Nhập 4 số cuối thẻ')
      input = { ...base, method, amount: effectiveAmount, cardLast4: last4 }
    }
    pay.mutate(input, {
      onSuccess: (result) => {
        setRequestId(newRequestId())
        onPaid(result)
      },
      onError: (err) => {
        if (isApiError(err) && err.status === 0) {
          setError('Chưa ghi được lượt thu, thử lại')
          return
        }
        const fields = getFieldErrors(err)
        setError(fields.cashReceived ?? fields.amount ?? fields.cardLast4 ?? fields.shareNo ?? getErrorMessage(err))
        if (isApiError(err) && err.status >= 400 && err.status < 500) setRequestId(newRequestId())
      },
    })
  }

  if (order.remaining <= 0 && (order.status === 'DangMo' || order.status === 'DangThu')) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-success flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          Tiền cọc đã đủ thanh toán
        </p>
        {order.depositRefund > 0 && <p className="text-sm">Hoàn lại khách tiền mặt {formatVnd(order.depositRefund)}.</p>}
        <Button
          className="h-12 w-full"
          disabled={complete.isPending}
          onClick={() =>
            complete.mutate(undefined, {
              onSuccess: (o) => onPaid({ order: o, payment: o.payments[0], changeAmount: 0, completed: true }),
              onError: (err) => setError(getErrorMessage(err)),
            })
          }
        >
          {complete.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Hoàn tất hóa đơn
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    )
  }

  const quick = [target, ...QUICK_CASH]
  return (
    <div className="space-y-3 rounded-xl border p-3">
      {order.splitCount && order.shares && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Chọn phần cần thu ({order.splitCount} phần)</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1.5">
            {order.shares.map((s) => (
              <button
                key={s.no}
                type="button"
                disabled={s.paid}
                aria-pressed={shareNo === s.no}
                onClick={() => setShareNo(s.no)}
                className={cn(
                  'flex h-12 flex-col items-start justify-center rounded-lg border px-3 text-left text-sm',
                  s.paid ? 'bg-success/10 text-success border-success/30' : shareNo === s.no ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                )}
              >
                <span className="font-semibold">Phần {s.no}{s.paid ? ' · đã thu' : ''}</span>
                <span className="tabular-nums">{formatVnd(s.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="bg-primary/8 flex items-center justify-between rounded-lg px-3 py-2">
        <span className="text-sm font-medium">{order.splitCount ? `Cần thu phần ${shareNo ?? ''}` : 'Còn phải thu'}</span>
        <span className="text-primary text-2xl font-bold tabular-nums">{formatVnd(target)}</span>
      </div>
      <Tabs value={method} onValueChange={(v) => { setMethod(v as Method); setError(null) }}>
        <TabsList className="grid h-12 w-full grid-cols-3">
          <TabsTrigger value="TienMat" className="h-10 gap-1.5">
            <Banknote className="size-4" aria-hidden="true" /> Tiền mặt
          </TabsTrigger>
          <TabsTrigger value="ChuyenKhoan" className="h-10 gap-1.5">
            <QrCode className="size-4" aria-hidden="true" /> Chuyển khoản
          </TabsTrigger>
          <TabsTrigger value="The" className="h-10 gap-1.5">
            <CreditCard className="size-4" aria-hidden="true" /> Thẻ
          </TabsTrigger>
        </TabsList>
        <TabsContent value="TienMat" className="space-y-3 pt-2">
          <div className="grid grid-cols-4 gap-2">
            {quick.map((v, i) => (
              <Button
                key={i}
                type="button"
                variant={cash === v ? 'default' : 'outline'}
                className="h-12 px-1 text-sm"
                disabled={v < target || v <= 0}
                onClick={() => setCash(v)}
              >
                {i === 0 ? 'Đủ tiền' : formatVnd(v).replace(' ₫', '')}
              </Button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Tiền khách đưa
            <MoneyInput value={cash} onChange={setCash} className="h-12 text-xl" />
          </label>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tiền thối</span>
            <span className="text-success text-xl font-bold tabular-nums">
              {cash && cash >= target ? formatVnd(cash - target) : '—'}
            </span>
          </div>
          <Button className="h-12 w-full text-base" onClick={() => submit()} disabled={pay.isPending || target <= 0}>
            {pay.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Thu tiền mặt
          </Button>
        </TabsContent>
        <TabsContent value="ChuyenKhoan" className="space-y-3 pt-2">
          {!order.splitCount && (
            <label className="grid gap-1.5 text-sm font-medium">
              Số tiền chuyển khoản
              <MoneyInput value={amount ?? target} onChange={setAmount} className="h-12 text-xl" />
            </label>
          )}
          <div className="flex flex-col items-center gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
            {qrContent && effectiveAmount > 0 && <QrImage value={qrContent} size={176} />}
            <dl className="grid gap-1 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Số tiền</dt>
                <dd className="text-lg font-bold tabular-nums">{formatVnd(effectiveAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Nội dung chuyển khoản</dt>
                <dd className="font-semibold">{order.code}</dd>
              </div>
              {profile.data && (
                <div>
                  <dt className="text-muted-foreground text-xs">Tài khoản</dt>
                  <dd>
                    {profile.data.bankAccount} · {profile.data.bankAccountName}
                  </dd>
                </div>
              )}
              <dd className="text-muted-foreground text-xs">QR giả lập, khách quét rồi thu ngân bấm “Đã nhận tiền”.</dd>
            </dl>
          </div>
          <Button className="h-12 w-full text-base" onClick={() => submit()} disabled={pay.isPending || target <= 0}>
            {pay.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Đã nhận tiền
          </Button>
        </TabsContent>
        <TabsContent value="The" className="space-y-3 pt-2">
          {!order.splitCount && (
            <label className="grid gap-1.5 text-sm font-medium">
              Số tiền quẹt thẻ
              <MoneyInput value={amount ?? target} onChange={setAmount} className="h-12 text-xl" />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            4 số cuối thẻ
            <Input
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="h-12 text-center text-xl tracking-[0.5em]"
              placeholder="0000"
            />
          </label>
          <Button className="h-12 w-full text-base" onClick={() => submit()} disabled={pay.isPending || target <= 0}>
            {pay.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Đã quẹt thẻ
          </Button>
        </TabsContent>
      </Tabs>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmPartial}
        onOpenChange={setConfirmPartial}
        title={`Thu một phần ${formatVnd(cash ?? 0)}?`}
        description={`Tiền khách đưa ít hơn số còn phải thu ${formatVnd(target)}. Hóa đơn chuyển "Đang thu tiền" và bị khóa thêm món, giảm giá.`}
        confirmText="Thu một phần"
        onConfirm={() => {
          setConfirmPartial(false)
          submit(true)
        }}
      />
    </div>
  )
}

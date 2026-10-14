'use client'

import { useState } from 'react'
import { Loader2, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVnd } from '@/lib/format'
import { NumericKeypad, parseKeypad } from '@/features/pos/components/NumericKeypad'
import { formatUnitPrice } from '@/features/pos/lib/labels'
import { lineTotal } from '@/features/pos/lib/pricing'

export const WEIGHT_ERROR = 'Trọng lượng từ 0,1 đến 20 kg'

export const isValidWeight = (kg: number | null): kg is number =>
  kg !== null && kg >= 0.1 && kg <= 20 && Math.abs(Math.round(kg * 10) - kg * 10) < 1e-6

type WeightDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  price: number
  initial?: number
  pending?: boolean
  onConfirm: (kg: number) => void
}

/** Món theo trọng lượng: bàn phím số nhập kg, hiện thành tiền ngay (UC-05 bước 4, BR-04, TC-14) */
export function WeightDialog({ open, onOpenChange, itemName, price, initial, pending, onConfirm }: WeightDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue(initial ? String(initial).replace('.', ',') : '')
      setError(null)
    }
  }
  const kg = parseKeypad(value)
  const valid = isValidWeight(kg)

  const submit = () => {
    if (!valid) return setError(WEIGHT_ERROR)
    onConfirm(kg)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="text-primary size-5" aria-hidden="true" />
            {itemName}
          </DialogTitle>
          <DialogDescription>Cân trước mặt khách rồi nhập số kg · {formatUnitPrice(price, 'TheoTrongLuong')}</DialogDescription>
        </DialogHeader>
        <div className="bg-muted rounded-xl p-3 text-center">
          <div className="text-4xl font-bold tabular-nums" aria-live="polite">
            {value || '0'} <span className="text-muted-foreground text-2xl">kg</span>
          </div>
          <div className="text-primary mt-1 text-lg font-semibold tabular-nums">
            {valid ? formatVnd(lineTotal('TheoTrongLuong', price, kg)) : '—'}
          </div>
        </div>
        <NumericKeypad
          value={value}
          allowDecimal
          decimals={1}
          maxLength={4}
          onChange={(v) => {
            setValue(v)
            setError(null)
          }}
        />
        {error && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={pending}>
            Hủy
          </Button>
          <Button className="h-11 min-w-28" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

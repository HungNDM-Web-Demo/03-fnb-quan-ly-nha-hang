'use client'

import { useState } from 'react'
import { Flame, Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NumericKeypad, parseKeypad } from '@/features/pos/components/NumericKeypad'
import { formatUnitPrice } from '@/features/pos/lib/labels'
import { lineTotal } from '@/features/pos/lib/pricing'
import type { OrderItemDto, QuickNoteDto, UpdateDraftItemRequest } from '@/features/pos/types/pos.types'
import { isValidWeight, WEIGHT_ERROR } from './WeightDialog'

type DraftItemDialogProps = {
  item: OrderItemDto | null
  quickNotes: QuickNoteDto[]
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: UpdateDraftItemRequest) => void
  onDelete: () => void
}

/** Chi tiết món "Chưa gửi" (UC-05 bước 3, FR-12): số lượng, ghi chú nhanh, ghi chú tự do, Gấp; xóa không cần lý do */
export function DraftItemDialog({ item, quickNotes, pending, onOpenChange, onSave, onDelete }: DraftItemDialogProps) {
  const [qty, setQty] = useState(1)
  const [kg, setKg] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [rush, setRush] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  if (item && item.id !== currentId) {
    setCurrentId(item.id)
    setQty(item.quantity)
    setKg(String(item.quantity).replace('.', ','))
    setNotes(item.quickNotes)
    setNote(item.note ?? '')
    setRush(item.isRush)
    setError(null)
  }
  if (!item && currentId) setCurrentId(null)
  if (!item) return null

  const weight = item.pricingType === 'TheoTrongLuong'
  const quantity = weight ? parseKeypad(kg) : qty
  const valid = weight ? isValidWeight(quantity) : Number.isInteger(qty) && qty >= 1 && qty <= 99

  const save = () => {
    if (!valid || quantity === null) return setError(weight ? WEIGHT_ERROR : 'Số lượng từ 1 đến 99')
    if (note.length > 200) return setError('Ghi chú tối đa 200 ký tự')
    onSave({ quantity, note: note.trim() || undefined, quickNotes: notes, isRush: rush })
  }

  return (
    <Dialog open={!!item} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.itemName}</DialogTitle>
          <DialogDescription>
            {formatUnitPrice(item.unitPrice, item.pricingType)} · Thành tiền{' '}
            <strong className="text-foreground">
              {valid && quantity !== null ? formatVnd(lineTotal(item.pricingType, item.unitPrice, quantity)) : '—'}
            </strong>
          </DialogDescription>
        </DialogHeader>

        {weight ? (
          <div className="grid gap-2">
            <div className="bg-muted rounded-xl p-2 text-center text-3xl font-bold tabular-nums">{kg || '0'} kg</div>
            <NumericKeypad value={kg} allowDecimal decimals={1} maxLength={4} onChange={(v) => { setKg(v); setError(null) }} />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" className="size-12" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Giảm số lượng">
              <Minus aria-hidden="true" />
            </Button>
            <span className="bg-muted min-w-24 rounded-xl px-4 py-2 text-center text-3xl font-bold tabular-nums" aria-live="polite">
              {qty}
            </span>
            <Button variant="outline" size="icon" className="size-12" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Tăng số lượng">
              <Plus aria-hidden="true" />
            </Button>
          </div>
        )}

        {quickNotes.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Ghi chú nhanh</span>
            <div className="flex flex-wrap gap-1.5">
              {quickNotes.map((q) => {
                const on = notes.includes(q.content)
                return (
                  <button
                    key={q.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setNotes((list) => (on ? list.filter((x) => x !== q.content) : [...list, q.content]))}
                    className={cn(
                      'h-10 rounded-full border px-3.5 text-sm font-medium transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                    )}
                  >
                    {q.content}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="draft-note">Ghi chú</Label>
          <Textarea id="draft-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: ít tỏi, chín kỹ" />
        </div>
        <label className="flex h-11 items-center justify-between rounded-lg border px-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Flame className="text-destructive size-4" aria-hidden="true" />
            Gấp (bếp làm trước)
          </span>
          <Switch checked={rush} onCheckedChange={setRush} />
        </label>
        {error && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" className="text-destructive h-11" onClick={onDelete} disabled={pending}>
            <Trash2 aria-hidden="true" />
            Xóa món
          </Button>
          <Button className="h-11 min-w-28" onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

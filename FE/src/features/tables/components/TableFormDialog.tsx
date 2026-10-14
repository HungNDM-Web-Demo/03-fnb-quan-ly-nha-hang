'use client'

import { useState } from 'react'
import { Circle, EyeOff, Loader2, RectangleHorizontal, Square, Trash2 } from 'lucide-react'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { tableShapeLabels } from '@/features/pos/lib/labels'
import type { AreaDto, TableShape } from '@/features/pos/types/pos.types'

export type TableFormValues = { code: string; areaId: string; capacity: number; shape: TableShape }

type TableFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  areas: AreaDto[]
  initial: TableFormValues
  /** Mã đã dùng (không tính bàn đang sửa) để báo trùng ngay tại ô (TC-02) */
  takenCodes: string[]
  /** Bàn đang có khách: không đổi khu vực, ẩn, xóa (BR-28) */
  busy?: boolean
  isHidden?: boolean
  pending?: boolean
  serverErrors?: Partial<Record<keyof TableFormValues, string>>
  onSubmit: (values: TableFormValues) => void
  onToggleHidden?: () => void
  onDelete?: () => void
}

const SHAPES: { value: TableShape; icon: typeof Square }[] = [
  { value: 'Vuong', icon: Square },
  { value: 'Tron', icon: Circle },
  { value: 'ChuNhat', icon: RectangleHorizontal },
]

/** Thêm, sửa bàn ở chế độ thiết lập (UC-01 bước 2–3, 4a, 4b; TC-01, TC-02, TC-03) */
export function TableFormDialog(props: TableFormDialogProps) {
  const { open, onOpenChange, title, areas, initial, takenCodes, busy, isHidden, pending, serverErrors, onSubmit } = props
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof TableFormValues, string>>>({})
  const [key, setKey] = useState(open ? JSON.stringify(initial) : '')
  const nextKey = open ? JSON.stringify(initial) : ''
  if (nextKey !== key) {
    setKey(nextKey)
    setValues(initial)
    setErrors({})
  }
  const shown = { ...errors, ...serverErrors }
  const area = areas.find((a) => a.id === values.areaId)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    const code = values.code.trim().toUpperCase()
    if (!area) next.areaId = 'Chọn khu vực'
    else if (!new RegExp(`^${area.code}-\\d{2}$`).test(code)) next.code = `Mã bàn dạng ${area.code}-01`
    else if (takenCodes.includes(code)) next.code = 'Mã bàn đã tồn tại'
    if (!Number.isInteger(values.capacity) || values.capacity < 1 || values.capacity > 20) next.capacity = 'Sức chứa từ 1 đến 20'
    setErrors(next)
    if (Object.keys(next).length) return
    onSubmit({ ...values, code })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Kéo thẻ bàn trên sơ đồ để đổi vị trí, bấm “Lưu sơ đồ” để lưu.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mã bàn" htmlFor="table-code" required error={shown.code}>
              <Input
                id="table-code"
                value={values.code}
                onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
                placeholder={area ? `${area.code}-01` : ''}
                className="h-11 uppercase"
                aria-invalid={!!shown.code}
              />
            </FormField>
            <FormField label="Sức chứa" htmlFor="table-capacity" required error={shown.capacity}>
              <Input
                id="table-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={Number.isNaN(values.capacity) ? '' : values.capacity}
                onChange={(e) => setValues((v) => ({ ...v, capacity: e.target.value === '' ? NaN : Number(e.target.value) }))}
                className="h-11"
                aria-invalid={!!shown.capacity}
              />
            </FormField>
          </div>
          <FormField label="Khu vực" required error={shown.areaId} hint={busy ? 'Bàn đang có khách, không đổi khu vực được' : undefined}>
            <Select value={values.areaId} onValueChange={(areaId) => setValues((v) => ({ ...v, areaId }))} disabled={busy}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Chọn khu vực" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Hình dạng</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Hình dạng bàn">
              {SHAPES.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={values.shape === value}
                  onClick={() => setValues((v) => ({ ...v, shape: value }))}
                  className={cn(
                    'flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium',
                    values.shape === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tableShapeLabels[value]}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {props.onToggleHidden && (
                <Button type="button" variant="outline" className="h-11" onClick={props.onToggleHidden} disabled={pending}>
                  <EyeOff aria-hidden="true" />
                  {isHidden ? 'Hiện bàn' : 'Ẩn bàn'}
                </Button>
              )}
              {props.onDelete && (
                <Button type="button" variant="outline" className="text-destructive h-11" onClick={props.onDelete} disabled={pending}>
                  <Trash2 aria-hidden="true" />
                  Xóa
                </Button>
              )}
            </div>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

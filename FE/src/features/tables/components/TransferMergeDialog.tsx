'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Combine, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/api-error'
import { formatTime } from '@/lib/format'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { orderService } from '@/features/pos/services/order.service'
import type { OrderDto, TableCardDto } from '@/features/pos/types/pos.types'
import { MiniFloorPlan } from './MiniFloorPlan'

type Mode = 'transfer' | 'merge'

type TransferMergeDialogProps = {
  mode: Mode | null
  order: OrderDto
  areaId?: string
  onOpenChange: (open: boolean) => void
  onTransferred?: (targetTableId: string) => void
}

/**
 * SCR-05 (UC-09): chuyển bàn sang bàn "Trống"/"Đã đặt" (BR-15, cảnh báo giờ đặt TC-27);
 * gộp một hoặc nhiều bàn "Đang phục vụ"/"Chờ thanh toán" vào bàn này (BR-16).
 */
export function TransferMergeDialog({ mode, order, areaId, onOpenChange, onTransferred }: TransferMergeDialogProps) {
  const [selected, setSelected] = useState<TableCardDto[]>([])
  const [confirmReserved, setConfirmReserved] = useState(false)
  const [lastMode, setLastMode] = useState<Mode | null>(null)
  if (mode !== lastMode) {
    setLastMode(mode)
    setSelected([])
    setConfirmReserved(false)
  }
  const transfer = usePosMutation((targetTableId: string) => orderService.transfer(order.id, { targetTableId, version: order.version }))
  const merge = usePosMutation((sourceTableIds: string[]) => orderService.merge(order.id, { sourceTableIds, version: order.version }))
  if (!mode) return null
  const pending = transfer.isPending || merge.isPending
  const target = selected[0]
  const reserved = mode === 'transfer' && target?.reservation

  const selectable = (t: TableCardDto) =>
    mode === 'transfer'
      ? t.id !== order.tableId && (t.status === 'Trong' || t.status === 'DaDat')
      : t.id !== order.tableId && (t.status === 'DangPhucVu' || t.status === 'ChoThanhToan')

  const toggle = (t: TableCardDto) => {
    setConfirmReserved(false)
    if (mode === 'transfer') setSelected([t])
    else setSelected((list) => (list.some((x) => x.id === t.id) ? list.filter((x) => x.id !== t.id) : [...list, t]))
  }

  const submit = () => {
    if (!selected.length) return
    if (mode === 'transfer') {
      if (reserved && !confirmReserved) return setConfirmReserved(true)
      // mutateAsync: sau khi chuyển, bàn cũ hết hóa đơn nên trang gỡ hộp này trước khi callback của mutate() kịp chạy
      // (làm mới dữ liệu xong mới gọi callback) → mất bước về màn bàn mới. Promise vẫn trả kết quả dù hộp đã gỡ.
      const from = order.tableCode
      transfer.mutateAsync(target.id).then(
        () => {
          toast.success(`Đã chuyển ${from} sang ${target.code}`)
          onOpenChange(false)
          onTransferred?.(target.id)
        },
        (error) => toast.error(getErrorMessage(error))
      )
    } else {
      merge.mutate(
        selected.map((t) => t.id),
        {
          onSuccess: () => {
            toast.success(`Đã gộp ${selected.map((t) => t.code).join(', ')} vào ${order.tableCode}`)
            onOpenChange(false)
          },
          onError: (error) => toast.error(getErrorMessage(error)),
        }
      )
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'transfer' ? <ArrowRightLeft className="size-5" aria-hidden="true" /> : <Combine className="size-5" aria-hidden="true" />}
            {mode === 'transfer' ? `Chuyển bàn ${order.tableCode}` : `Gộp bàn vào ${order.tableCode}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'transfer'
              ? 'Chọn bàn trống hoặc đã đặt. Hóa đơn giữ nguyên mã, món; phiếu bếp đang chờ hiện mã bàn mới.'
              : 'Chọn một hoặc nhiều bàn đang phục vụ, chờ thanh toán. Món và số khách chuyển sang bàn này để thanh toán chung.'}
          </DialogDescription>
        </DialogHeader>
        <MiniFloorPlan selectable={selectable} selected={selected.map((t) => t.id)} onToggle={toggle} initialAreaId={areaId} />
        {reserved && target.reservation && (
          <p role="alert" className="bg-warning/12 text-warning flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Bàn có khách đặt lúc {formatTime(target.reservation.arrivalAt)} ({target.reservation.customerName},{' '}
            {target.reservation.guestCount} khách)
            {confirmReserved ? '. Bấm “Vẫn chuyển” để tiếp tục.' : ''}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={pending}>
            Hủy
          </Button>
          <Button className="h-11 min-w-32" onClick={submit} disabled={!selected.length || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {mode === 'transfer'
              ? confirmReserved
                ? 'Vẫn chuyển'
                : target
                  ? `Chuyển sang ${target.code}`
                  : 'Chuyển'
              : selected.length
                ? `Gộp ${selected.length} bàn`
                : 'Gộp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

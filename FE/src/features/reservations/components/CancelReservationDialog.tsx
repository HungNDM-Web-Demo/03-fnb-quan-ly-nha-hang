'use client'

import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { FormField } from '@/components/shared/FormField'
import { Textarea } from '@/components/ui/textarea'
import { vnHhmm } from '@/features/pos/lib/vn-time'
import type { ReservationDto } from '@/features/pos/types/pos.types'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { useCancelReservation } from '../hooks/use-reservations'

type CancelReservationDialogProps = {
  reservation: ReservationDto | null
  onOpenChange: (open: boolean) => void
}

/** Hủy đặt bàn, bắt buộc nhập lý do (FR-34). Mở lại bằng key để xóa lý do cũ. */
export function CancelReservationDialog({ reservation, onOpenChange }: CancelReservationDialogProps) {
  const cancel = useCancelReservation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()

  const confirm = async () => {
    if (!reservation) return
    const text = reason.trim()
    if (!text) {
      setError('Nhập lý do hủy')
      throw new Error('missing reason')
    }
    try {
      const result = await cancel.mutateAsync({ id: reservation.id, reason: text })
      toast.success(`Đã hủy đặt bàn ${result.code}`)
    } catch (e) {
      const fieldError = getFieldErrors(e).reason
      if (fieldError) setError(fieldError)
      else toast.error(getErrorMessage(e))
      throw e
    }
  }

  return (
    <ConfirmDialog
      open={!!reservation}
      onOpenChange={onOpenChange}
      variant="destructive"
      icon={XCircle}
      title="Hủy đặt bàn này?"
      description={
        reservation &&
        `${reservation.code}: ${reservation.customerName}, bàn ${reservation.tableCode} lúc ${vnHhmm(reservation.arrivalAt)}. Bàn được giải phóng cho khách khác.`
      }
      confirmText="Hủy đặt bàn"
      cancelText="Đóng"
      loading={cancel.isPending}
      onConfirm={confirm}
    >
      <FormField label="Lý do hủy" required error={error}>
        <Textarea
          rows={3}
          maxLength={500}
          autoFocus
          placeholder="vd: Khách gọi báo đổi lịch"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            if (error) setError(undefined)
          }}
        />
      </FormField>
    </ConfirmDialog>
  )
}

'use client'

import { Loader2, Printer, Sparkles } from 'lucide-react'
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
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage } from '@/lib/api-error'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { tableService } from '@/features/pos/services/table.service'
import type { TableCardDto } from '@/features/pos/types/pos.types'
import { openPrint } from '../lib/print'

/** Bàn "Chờ dọn": "Dọn xong" đưa bàn về "Trống" (UC-02 2c, FR-31); in lại hóa đơn vừa thu */
export function CleanTableDialog({ table, onOpenChange }: { table: TableCardDto | null; onOpenChange: (open: boolean) => void }) {
  const { can } = usePermissions()
  const clear = usePosMutation((id: string) => tableService.clear(id))
  if (!table) return null
  return (
    <Dialog open={!!table} onOpenChange={(next) => !clear.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Bàn {table.code} chờ dọn</DialogTitle>
          <DialogDescription>Khách đã thanh toán. Dọn xong thì bàn về “Trống” để đón khách mới.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-col">
          {can(permissions.tables.open) && (
            <Button
              className="h-12 w-full"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(table.id, {
                  onSuccess: () => {
                    toast.success(`Bàn ${table.code} đã dọn xong`)
                    onOpenChange(false)
                  },
                  onError: (error) => toast.error(getErrorMessage(error)),
                })
              }
            >
              {clear.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              Dọn xong
            </Button>
          )}
          {can(permissions.orders.reprint) && table.lastPaidOrderId && (
            <Button variant="outline" className="h-12 w-full" onClick={() => openPrint(table.lastPaidOrderId!, { reprint: true })}>
              <Printer aria-hidden="true" />
              In lại hóa đơn
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/api-error'
import { matchesSearch } from '@/lib/normalize'
import { cn } from '@/lib/utils'
import { useMenuBundle, usePosMutation } from '@/features/pos/hooks/use-pos'
import { stationLabels } from '@/features/pos/lib/labels'
import { menuService } from '@/features/pos/services/menu.service'

/** "Thực đơn" trên màn bếp (UC-04, FR-09, TC-06): công tắc "Còn bán/Tạm hết" từng món */
export function AvailabilitySheet({ open, onOpenChange, canUpdate }: { open: boolean; onOpenChange: (open: boolean) => void; canUpdate: boolean }) {
  const menu = useMenuBundle()
  const [keyword, setKeyword] = useState('')
  const toggle = usePosMutation((v: { id: string; isSoldOut: boolean }) => menuService.setAvailability(v.id, v.isSoldOut))
  const items = (menu.data?.items ?? []).filter((m) => !keyword.trim() || matchesSearch(`${m.code} ${m.name}`, keyword))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl">Thực đơn</SheetTitle>
          <SheetDescription>Tắt “Còn bán” khi hết nguyên liệu: tablet phục vụ thấy món mờ, không gọi được.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm món…" aria-label="Tìm món" className="h-12 pl-9 text-base" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto px-4 pb-6">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-base font-semibold', item.isSoldOut && 'text-muted-foreground line-through')}>{item.name}</p>
                <p className="text-muted-foreground text-xs">
                  {item.code} · {stationLabels[item.station]}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <span className={item.isSoldOut ? 'text-destructive' : 'text-kds-ok'}>{item.isSoldOut ? 'Tạm hết' : 'Còn bán'}</span>
                <Switch
                  checked={!item.isSoldOut}
                  disabled={!canUpdate || toggle.isPending}
                  aria-label={`${item.name}: còn bán`}
                  onCheckedChange={(on) =>
                    toggle.mutate(
                      { id: item.id, isSoldOut: !on },
                      {
                        onSuccess: () => toast.success(`${item.name}: ${on ? 'bán lại' : 'tạm hết'}`),
                        onError: (error) => toast.error(getErrorMessage(error)),
                      }
                    )
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

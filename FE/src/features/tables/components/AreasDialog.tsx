'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { usePosMutation } from '@/features/pos/hooks/use-pos'
import { tableService } from '@/features/pos/services/table.service'
import type { AreaDto } from '@/features/pos/types/pos.types'

/** Quản lý khu vực (UC-01 2a): thêm, đổi tên, ẩn, sắp xếp thứ tự tab, xóa khu vực trống */
export function AreasDialog({ open, onOpenChange, areas }: { open: boolean; onOpenChange: (open: boolean) => void; areas: AreaDto[] }) {
  const { can } = usePermissions()
  const [names, setNames] = useState<Record<string, string>>({})
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const create = usePosMutation(tableService.createArea)
  const update = usePosMutation((v: { id: string; name: string; code: string; isHidden: boolean }) =>
    tableService.updateArea(v.id, { code: v.code, name: v.name, isHidden: v.isHidden })
  )
  const reorder = usePosMutation(tableService.reorderAreas)
  const remove = usePosMutation(tableService.deleteArea)
  const onError = (error: unknown) => toast.error(getErrorMessage(error))

  const move = (index: number, delta: number) => {
    const ids = areas.map((a) => a.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids, { onError })
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    create.mutate(
      { code: code.trim().toUpperCase(), name: name.trim(), isHidden: false },
      {
        onSuccess: (area) => {
          toast.success(`Đã thêm khu vực ${area.name}`)
          setCode('')
          setName('')
        },
        onError: (error) => {
          const fields = getFieldErrors(error)
          if (Object.keys(fields).length) setErrors(fields)
          else onError(error)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Khu vực</DialogTitle>
          <DialogDescription>Thứ tự ở đây là thứ tự tab trên sơ đồ bàn. Khu vực ẩn không hiện với phục vụ.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {areas.map((area, index) => (
            <li key={area.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <span className="bg-muted w-10 rounded-md py-1 text-center text-sm font-bold">{area.code}</span>
              <Input
                aria-label={`Tên khu vực ${area.code}`}
                value={names[area.id] ?? area.name}
                onChange={(e) => setNames((n) => ({ ...n, [area.id]: e.target.value }))}
                onBlur={() => {
                  const value = (names[area.id] ?? area.name).trim()
                  if (value && value !== area.name)
                    update.mutate({ id: area.id, code: area.code, name: value, isHidden: area.isHidden }, { onError })
                }}
                disabled={!can(permissions.tables.update)}
                className="h-10 min-w-32 flex-1"
              />
              <span className="text-muted-foreground w-14 text-xs">{area.tableCount} bàn</span>
              <label className="flex items-center gap-1.5 text-sm">
                <Switch
                  checked={!area.isHidden}
                  disabled={!can(permissions.tables.update)}
                  onCheckedChange={(visible) =>
                    update.mutate({ id: area.id, code: area.code, name: area.name, isHidden: !visible }, { onError })
                  }
                />
                Hiện
              </label>
              <Button variant="ghost" size="icon" className="size-10" aria-label="Lên" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="Xuống"
                disabled={index === areas.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              {can(permissions.tables.delete) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-10"
                  aria-label={`Xóa khu vực ${area.name}`}
                  onClick={() =>
                    remove.mutate(area.id, { onSuccess: () => toast.success(`Đã xóa khu vực ${area.name}`), onError })
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {can(permissions.tables.create) && (
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-start">
            <div>
              <Input
                aria-label="Mã khu vực"
                value={code}
                maxLength={2}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Mã, vd T3"
                className="h-11 uppercase"
                aria-invalid={!!errors.code}
              />
              {errors.code && <p className="text-destructive mt-1 text-xs">{errors.code}</p>}
            </div>
            <div>
              <Input
                aria-label="Tên khu vực"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên, vd Tầng 3"
                className="h-11"
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-destructive mt-1 text-xs">{errors.name}</p>}
            </div>
            <Button type="submit" className="h-11" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Thêm khu vực
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

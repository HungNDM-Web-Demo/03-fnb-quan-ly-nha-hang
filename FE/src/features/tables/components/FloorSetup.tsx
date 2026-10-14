'use client'

import { useMemo, useRef, useState } from 'react'
import { Layers, Loader2, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { permissions } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import { useAreas, useDiningTables, usePosMutation } from '@/features/pos/hooks/use-pos'
import { tableShapeLabels } from '@/features/pos/lib/labels'
import { PosRules, tableSize } from '@/features/pos/lib/pos-rules'
import { tableService } from '@/features/pos/services/table.service'
import type { DiningTableDto, TableCardDto, TableShape } from '@/features/pos/types/pos.types'
import { tableShapeClass } from '../lib/table-style'
import { AreasDialog } from './AreasDialog'
import { FloorGrid } from './FloorGrid'
import { TableFormDialog, type TableFormValues } from './TableFormDialog'

type DraftTable = {
  id: string
  isNew: boolean
  code: string
  areaId: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  isHidden: boolean
}

type FloorSetupProps = {
  initialAreaId?: string
  /** Trạng thái sống của bàn để biết bàn đang có khách (BR-28) */
  cards: TableCardDto[]
  onExit: () => void
}

const toDraft = (t: DiningTableDto): DraftTable => ({
  id: t.id,
  isNew: false,
  code: t.code,
  areaId: t.areaId,
  capacity: t.capacity,
  shape: t.shape,
  x: t.x,
  y: t.y,
  isHidden: t.isHidden,
})

function overlaps(a: { x: number; y: number; shape: TableShape }, b: { x: number; y: number; shape: TableShape }) {
  const sa = tableSize(a.shape)
  const sb = tableSize(b.shape)
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h
}

const inBounds = (t: { x: number; y: number; shape: TableShape }) => {
  const s = tableSize(t.shape)
  return t.x >= 0 && t.y >= 0 && t.x + s.w <= PosRules.gridCols && t.y + s.h <= PosRules.gridRows
}

/**
 * SCR-03: chế độ "Thiết lập" sơ đồ bàn (UC-01). Kéo thả bắt ô lưới, chặn hai bàn chồng ô; "Lưu sơ đồ"
 * gọi POST /api/tables cho bàn mới rồi PUT /api/tables/layout; thoát khi chưa lưu thì hỏi (UC-01 E4).
 */
export function FloorSetup({ initialAreaId, cards, onExit }: FloorSetupProps) {
  const { can } = usePermissions()
  const areasQuery = useAreas(true)
  const tablesQuery = useDiningTables(true)
  const areas = useMemo(() => areasQuery.data ?? [], [areasQuery.data])
  const [areaId, setAreaId] = useState(initialAreaId)
  const currentAreaId = areaId && areas.some((a) => a.id === areaId) ? areaId : areas[0]?.id

  // Bản nháp vị trí: chỉ giữ bàn đã kéo hoặc bàn mới
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  const [created, setCreated] = useState<DraftTable[]>([])
  const drafts = useMemo<DraftTable[]>(
    () => [
      ...(tablesQuery.data ?? []).map((t) => ({ ...toDraft(t), ...(moved[t.id] ?? {}) })),
      ...created,
    ],
    [tablesQuery.data, moved, created]
  )
  const dirty = Object.keys(moved).length > 0 || created.length > 0
  const busyIds = useMemo(() => new Set(cards.filter((c) => c.status !== 'Trong' && c.status !== 'DaDat').map((c) => c.id)), [cards])

  const [confirmExit, setConfirmExit] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)
  const [editing, setEditing] = useState<DraftTable | 'new' | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof TableFormValues, string>>>({})
  const [saving, setSaving] = useState(false)

  const updateTable = usePosMutation((v: { id: string; values: TableFormValues; x: number; y: number }) =>
    tableService.updateTable(v.id, { ...v.values, x: v.x, y: v.y })
  )
  const setHidden = usePosMutation((v: { id: string; isHidden: boolean }) => tableService.setTableHidden(v.id, v.isHidden))
  const removeTable = usePosMutation((id: string) => tableService.deleteTable(id))

  // ───── Kéo thả ─────
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; pointerId: number; offX: number; offY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number; valid: boolean } | null>(null)

  const cellAt = (clientX: number, clientY: number, offX: number, offY: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    const cw = rect.width / PosRules.gridCols
    const ch = rect.height / PosRules.gridRows
    return {
      x: Math.round((clientX - rect.left - offX) / cw),
      y: Math.round((clientY - rect.top - offY) / ch),
    }
  }

  const canDropAt = (table: DraftTable, x: number, y: number) => {
    const candidate = { ...table, x, y }
    if (!inBounds(candidate)) return false
    return !drafts.some((o) => o.id !== table.id && o.areaId === table.areaId && overlaps(candidate, o))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, table: DraftTable) => {
    if (!can(permissions.tables.update) || !gridRef.current) return
    const target = e.currentTarget.getBoundingClientRect()
    drag.current = {
      id: table.id,
      pointerId: e.pointerId,
      offX: e.clientX - target.left,
      offY: e.clientY - target.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>, table: DraftTable) => {
    const d = drag.current
    if (!d || d.id !== table.id) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return
    d.moved = true
    const cell = cellAt(e.clientX, e.clientY, d.offX, d.offY)
    setGhost({ id: table.id, ...cell, valid: canDropAt(table, cell.x, cell.y) })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>, table: DraftTable) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== table.id) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.moved) {
      setServerErrors({})
      setEditing(table)
      return
    }
    const cell = cellAt(e.clientX, e.clientY, d.offX, d.offY)
    setGhost(null)
    if (!canDropAt(table, cell.x, cell.y)) {
      toast.warning('Ô này đã có bàn hoặc nằm ngoài sơ đồ')
      return
    }
    if (table.isNew) setCreated((list) => list.map((t) => (t.id === table.id ? { ...t, ...cell } : t)))
    else setMoved((m) => ({ ...m, [table.id]: cell }))
  }

  // ───── Thêm, sửa bàn ─────
  const area = areas.find((a) => a.id === currentAreaId)
  const takenCodes = (exceptId?: string) => drafts.filter((t) => t.id !== exceptId).map((t) => t.code)
  const nextCode = () => {
    if (!area) return ''
    const max = drafts
      .filter((t) => t.code.startsWith(`${area.code}-`))
      .reduce((m, t) => Math.max(m, Number(t.code.slice(area.code.length + 1)) || 0), 0)
    return `${area.code}-${String(max + 1).padStart(2, '0')}`
  }
  const freeSpot = (shape: TableShape, targetArea: string, exceptId?: string) => {
    for (let y = 0; y < PosRules.gridRows; y++)
      for (let x = 0; x < PosRules.gridCols; x++) {
        const c = { x, y, shape }
        if (inBounds(c) && !drafts.some((o) => o.id !== exceptId && o.areaId === targetArea && overlaps(c, o))) return { x, y }
      }
    return null
  }

  const submitForm = (values: TableFormValues) => {
    if (editing === 'new') {
      const spot = freeSpot(values.shape, values.areaId)
      if (!spot) return toast.error('Khu vực đã kín chỗ trên sơ đồ, hãy dời bớt bàn')
      setCreated((list) => [...list, { id: `new-${crypto.randomUUID()}`, isNew: true, isHidden: false, ...values, ...spot }])
      setAreaId(values.areaId)
      setEditing(null)
      toast.success(`Đã thêm ${values.code}, kéo bàn tới vị trí mong muốn rồi bấm “Lưu sơ đồ”`)
      return
    }
    if (!editing) return
    if (editing.isNew) {
      const spot =
        editing.areaId === values.areaId && editing.shape === values.shape
          ? { x: editing.x, y: editing.y }
          : freeSpot(values.shape, values.areaId, editing.id)
      if (!spot) return toast.error('Khu vực đã kín chỗ trên sơ đồ')
      setCreated((list) => list.map((t) => (t.id === editing.id ? { ...t, ...values, ...spot } : t)))
      setEditing(null)
      return
    }
    let spot = { x: editing.x, y: editing.y }
    if (editing.areaId !== values.areaId || !canDropAt({ ...editing, ...values }, editing.x, editing.y)) {
      const free = freeSpot(values.shape, values.areaId, editing.id)
      if (!free) return toast.error('Khu vực đã kín chỗ trên sơ đồ')
      spot = free
    }
    updateTable.mutate(
      { id: editing.id, values, ...spot },
      {
        onSuccess: () => {
          toast.success(`Đã lưu bàn ${values.code}`)
          setMoved((m) => {
            const next = { ...m }
            delete next[editing.id]
            return next
          })
          setEditing(null)
        },
        onError: (error) => {
          const fields = getFieldErrors(error)
          if (Object.keys(fields).length) setServerErrors(fields)
          else toast.error(getErrorMessage(error))
        },
      }
    )
  }

  // ───── Lưu sơ đồ ─────
  const save = async () => {
    setSaving(true)
    try {
      for (const t of created) {
        try {
          await tableService.createTable({ code: t.code, areaId: t.areaId, capacity: t.capacity, shape: t.shape, x: t.x, y: t.y })
          setCreated((list) => list.filter((x) => x.id !== t.id))
        } catch (error) {
          toast.error(`${t.code}: ${getErrorMessage(error)}`)
          return
        }
      }
      const items = Object.entries(moved).map(([id, pos]) => ({ id, ...pos }))
      if (items.length) await tableService.saveLayout({ items })
      setMoved({})
      await Promise.all([areasQuery.refetch(), tablesQuery.refetch()])
      toast.success('Đã lưu sơ đồ bàn')
      onExit()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const editingTable = editing && editing !== 'new' ? editing : null
  const formInitial: TableFormValues =
    editing === 'new'
      ? { code: nextCode(), areaId: currentAreaId ?? '', capacity: 4, shape: 'Vuong' }
      : editingTable
        ? { code: editingTable.code, areaId: editingTable.areaId, capacity: editingTable.capacity, shape: editingTable.shape }
        : { code: '', areaId: '', capacity: 4, shape: 'Vuong' }

  const areaTables = drafts.filter((t) => t.areaId === currentAreaId)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="bg-info/10 border-info/25 text-info flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <Layers className="size-4" aria-hidden="true" />
        <span className="font-semibold">Chế độ thiết lập.</span>
        <span>Kéo thẻ bàn để đổi vị trí (bắt theo ô lưới), chạm bàn để sửa. Bàn ẩn hiện mờ.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {can(permissions.tables.update) && (
            <Button variant="outline" className="h-11" onClick={() => setAreasOpen(true)}>
              Khu vực
            </Button>
          )}
          {can(permissions.tables.create) && (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setServerErrors({})
                setEditing('new')
              }}
              disabled={!area}
            >
              <Plus aria-hidden="true" />
              Thêm bàn
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => (dirty ? setConfirmExit(true) : onExit())} disabled={saving}>
            <X aria-hidden="true" />
            Thoát
          </Button>
          <Button className="h-11" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Lưu sơ đồ
          </Button>
        </div>
      </div>

      <Tabs value={currentAreaId ?? ''} onValueChange={setAreaId}>
        <TabsList className="h-11">
          {areas.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="h-9 px-4">
              {a.name}
              {a.isHidden ? ' (ẩn)' : ''}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FloorGrid ref={gridRef} showGrid className="min-h-0 flex-1 touch-none select-none">
        {areaTables.map((t) => {
          const size = tableSize(t.shape)
          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, t)}
              onPointerMove={(e) => onPointerMove(e, t)}
              onPointerUp={(e) => onPointerUp(e, t)}
              onPointerCancel={() => {
                drag.current = null
                setGhost(null)
              }}
              style={{ gridColumn: `${t.x + 1} / span ${size.w}`, gridRow: `${t.y + 1} / span ${size.h}` }}
              aria-label={`Bàn ${t.code}, ${t.capacity} chỗ, ${tableShapeLabels[t.shape]}. Chạm để sửa, kéo để đổi vị trí`}
              className={cn(
                'bg-card relative z-10 m-1 flex cursor-grab flex-col items-start justify-between border-2 p-2.5 text-left shadow-sm active:cursor-grabbing',
                tableShapeClass[t.shape],
                t.isNew ? 'border-primary border-dashed' : 'border-border',
                t.isHidden && 'opacity-45',
                ghost?.id === t.id && 'opacity-40'
              )}
            >
              <span className="text-lg font-bold">{t.code}</span>
              <span className="text-muted-foreground text-xs">
                {t.capacity} chỗ · {tableShapeLabels[t.shape]}
                {t.isNew ? ' · mới' : ''}
                {t.isHidden ? ' · ẩn' : ''}
                {busyIds.has(t.id) ? ' · có khách' : ''}
              </span>
            </button>
          )
        })}
        {ghost && (() => {
          const t = drafts.find((x) => x.id === ghost.id)
          if (!t) return null
          const size = tableSize(t.shape)
          return (
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none z-20 m-1 border-2 border-dashed',
                tableShapeClass[t.shape],
                ghost.valid ? 'border-primary bg-primary/15' : 'border-destructive bg-destructive/15'
              )}
              style={{ gridColumn: `${Math.max(0, ghost.x) + 1} / span ${size.w}`, gridRow: `${Math.max(0, ghost.y) + 1} / span ${size.h}` }}
            />
          )
        })()}
      </FloorGrid>

      <TableFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'Thêm bàn' : `Sửa bàn ${editingTable?.code ?? ''}`}
        areas={areas}
        initial={formInitial}
        takenCodes={takenCodes(editingTable?.id)}
        busy={!!editingTable && busyIds.has(editingTable.id)}
        isHidden={editingTable?.isHidden}
        pending={updateTable.isPending || setHidden.isPending || removeTable.isPending}
        serverErrors={serverErrors}
        onSubmit={submitForm}
        onToggleHidden={
          editingTable && !editingTable.isNew && can(permissions.tables.update)
            ? () =>
                setHidden.mutate(
                  { id: editingTable.id, isHidden: !editingTable.isHidden },
                  {
                    onSuccess: () => {
                      toast.success(editingTable.isHidden ? `Đã hiện bàn ${editingTable.code}` : `Đã ẩn bàn ${editingTable.code}`)
                      setEditing(null)
                    },
                    onError: (error) => toast.error(getErrorMessage(error)),
                  }
                )
            : undefined
        }
        onDelete={
          editingTable && (editingTable.isNew || can(permissions.tables.delete))
            ? () => {
                if (editingTable.isNew) {
                  setCreated((list) => list.filter((t) => t.id !== editingTable.id))
                  setEditing(null)
                  return
                }
                removeTable.mutate(editingTable.id, {
                  onSuccess: () => {
                    toast.success(`Đã xóa bàn ${editingTable.code}`)
                    setEditing(null)
                  },
                  onError: (error) => toast.error(getErrorMessage(error)),
                })
              }
            : undefined
        }
      />
      <AreasDialog open={areasOpen} onOpenChange={setAreasOpen} areas={areas} />
      <ConfirmDialog
        open={confirmExit}
        onOpenChange={setConfirmExit}
        title="Bỏ thay đổi sơ đồ?"
        description="Vị trí bàn và bàn mới chưa lưu sẽ mất."
        confirmText="Bỏ thay đổi"
        variant="destructive"
        onConfirm={() => {
          setMoved({})
          setCreated([])
          onExit()
        }}
      />
    </div>
  )
}

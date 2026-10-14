'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { ErrorState } from '@/components/shared/ErrorState'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { permissions } from '@/config/permissions'
import { routePath } from '@/config/route-path'
import { usePermissions } from '@/hooks/use-permissions'
import { readJson, storageKey, writeJson } from '@/lib/storage'
import { useFloorPlan } from '@/features/pos/hooks/use-pos'
import { useServerNow, useSyncAsOf } from '@/features/pos/hooks/use-server-now'
import type { TableCardDto, TableStatus } from '@/features/pos/types/pos.types'
import { CleanTableDialog } from '../components/CleanTableDialog'
import { FloorGrid } from '../components/FloorGrid'
import { FloorSetup } from '../components/FloorSetup'
import { OpenTableDialog } from '../components/OpenTableDialog'
import { StatusCountBar } from '../components/StatusCountBar'
import { TableCard } from '../components/TableCard'
import { useTabletLayout } from '../hooks/use-tablet-layout'

const AREA_KEY = storageKey('floor-plan.area')

/**
 * SCR-02 Sơ đồ bàn (UC-02, FR-04): tab khu vực, thanh đếm trạng thái (chạm để lọc), thẻ bàn trên lưới 12 × 8,
 * tự cập nhật theo sự kiện thời gian thực và mỗi 30 giây. SCR-03: chế độ "Thiết lập" cho người có `tables.update`.
 */
export function FloorPlanPage() {
  useTabletLayout()
  const router = useRouter()
  const { can } = usePermissions()
  const plan = useFloorPlan()
  useSyncAsOf(plan.data?.asOf)
  const now = useServerNow(30_000)
  const [areaId, setAreaIdState] = useState<string | undefined>(() => readJson<string>('session', AREA_KEY) ?? undefined)
  const [filter, setFilter] = useState<TableStatus | null>(null)
  const [opening, setOpening] = useState<TableCardDto | null>(null)
  const [cleaning, setCleaning] = useState<TableCardDto | null>(null)
  const [setup, setSetup] = useState(false)

  const setAreaId = (id: string) => {
    setAreaIdState(id)
    writeJson('session', AREA_KEY, id)
  }

  const areas = plan.data?.areas ?? []
  const currentAreaId = areaId && areas.some((a) => a.id === areaId) ? areaId : areas[0]?.id
  const tables = (plan.data?.tables ?? []).filter((t) => t.areaId === currentAreaId)

  const select = (table: TableCardDto) => {
    switch (table.status) {
      case 'Trong':
      case 'DaDat':
        if (can(permissions.tables.open)) setOpening(table)
        break
      case 'ChoDon':
        setCleaning(table)
        break
      case 'DaGop':
        // Chạm bàn phụ → màn gọi món của bàn chính (BR-16, UC-09 E2)
        router.push(routePath.tableService(table.mergedIntoTableId ?? table.id))
        break
      default:
        router.push(routePath.tableService(table.id))
    }
  }

  return (
    <PermissionGuard permission={permissions.tables.view} redirect>
      <div className="-mx-1 -mb-20 flex h-[calc(100svh-6.5rem)] min-h-[34rem] flex-col gap-3 sm:-mx-2 lg:-mx-4">
        {setup ? (
          <FloorSetup initialAreaId={currentAreaId} cards={plan.data?.tables ?? []} onExit={() => setSetup(false)} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={currentAreaId ?? ''} onValueChange={setAreaId}>
                <TabsList className="h-11">
                  {areas.map((a) => {
                    const count = (plan.data?.tables ?? []).filter((t) => t.areaId === a.id && (t.status === 'DangPhucVu' || t.status === 'ChoThanhToan')).length
                    return (
                      <TabsTrigger key={a.id} value={a.id} className="h-9 gap-2 px-4 text-sm">
                        {a.name}
                        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </Tabs>
              {can(permissions.tables.update) && (
                <Button variant="outline" className="ml-auto h-11" onClick={() => setSetup(true)}>
                  <Settings2 aria-hidden="true" />
                  Thiết lập
                </Button>
              )}
            </div>
            {plan.data && (
              <StatusCountBar counts={plan.data.counts} total={plan.data.totalTables} filter={filter} onFilter={setFilter} />
            )}
            {plan.error ? (
              <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
            ) : plan.isLoading ? (
              <Skeleton className="min-h-0 flex-1 rounded-xl" />
            ) : (
              <FloorGrid className="min-h-0 flex-1">
                {tables.map((t) => (
                  <TableCard key={t.id} table={t} now={now} onSelect={select} dimmed={!!filter && t.status !== filter} />
                ))}
              </FloorGrid>
            )}
          </>
        )}
      </div>
      <OpenTableDialog table={opening} onOpenChange={(open) => !open && setOpening(null)} />
      <CleanTableDialog table={cleaning} onOpenChange={(open) => !open && setCleaning(null)} />
    </PermissionGuard>
  )
}

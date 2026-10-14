'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, EyeOff, Pencil, Plus, SearchX, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { permissions } from '@/config/permissions'
import { MenuImage } from '@/features/pos/components/MenuImage'
import {
  ALL_STATIONS,
  formatUnitPrice,
  menuItemStatusLabels,
  pricingTypeLabels,
  stationLabels,
} from '@/features/pos/lib/labels'
import type { KitchenStation, MenuItemDto, MenuItemStatus } from '@/features/pos/types/pos.types'
import { usePermissions } from '@/hooks/use-permissions'
import { useTableQuery } from '@/hooks/use-table-query'
import { getErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import {
  useCategories,
  useDeleteMenuItem,
  useMenuItems,
  useSetMenuItemAvailability,
  useSetMenuItemHidden,
} from '../hooks/use-menu-items'
import { MenuItemFormDialog } from './MenuItemFormDialog'

type Filters = { categoryId: string; status: MenuItemStatus; station: KitchenStation }
type FormState = { open: boolean; item: MenuItemDto | null }

const STATUSES: MenuItemStatus[] = ['DangBan', 'TamHet', 'An']
/** Lý do khóa nút Xóa (BR-28, TC-05), trùng chữ lỗi API 07 §2.3 */
const EVER_ORDERED_MESSAGE = 'Món đã có trong hóa đơn, chỉ có thể ẩn'

/**
 * Tab Món (UC-03, UC-04 1b; FR-07, FR-09, BR-28): danh sách phân trang phía máy chủ,
 * công tắc "Còn bán", ẩn/hiện món, thêm/sửa, xóa món chưa từng gọi.
 */
export function MenuItemsTab() {
  const { can } = usePermissions()
  const canCreate = can(permissions.menuItems.create)
  const canUpdate = can(permissions.menuItems.update)
  const canDelete = can(permissions.menuItems.delete)
  const canAvailability = can(permissions.menuItems.availability)

  const table = useTableQuery<Filters>({ pageSize: 20 })
  const items = useMenuItems(table.query)
  const categories = useCategories()
  const availability = useSetMenuItemAvailability()
  const hidden = useSetMenuItemHidden()
  const remove = useDeleteMenuItem()

  const [form, setForm] = useState<FormState>({ open: false, item: null })
  const [deleteTarget, setDeleteTarget] = useState<MenuItemDto | null>(null)
  const [searchKey, setSearchKey] = useState(0)

  const categoryList = useMemo(() => categories.data ?? [], [categories.data])
  const colorOf = useMemo(() => new Map(categoryList.map((c) => [c.id, c.color])), [categoryList])
  const hasFilters = !!(
    table.state.search ||
    table.state.categoryId ||
    table.state.status ||
    table.state.station
  )

  const clearFilters = () => {
    table.resetFilters()
    setSearchKey((k) => k + 1)
  }

  const toggleAvailability = (m: MenuItemDto, available: boolean) =>
    availability.mutate(
      { id: m.id, isSoldOut: !available },
      {
        onSuccess: () =>
          toast.success(available ? `${m.name} đã bán lại` : `Đã báo ${m.name} tạm hết`),
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )

  const toggleHidden = (m: MenuItemDto) =>
    hidden.mutate(
      { id: m.id, isHidden: !m.isHidden },
      {
        onSuccess: () =>
          toast.success(
            m.isHidden ? `Đã hiện lại ${m.name}` : `Đã ẩn ${m.name} khỏi tablet phục vụ`
          ),
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )

  const pendingAvailabilityId = availability.isPending ? availability.variables?.id : undefined
  const pendingHiddenId = hidden.isPending ? hidden.variables?.id : undefined

  const columns: ColumnDef<MenuItemDto>[] = [
    {
      id: 'image',
      header: () => <span className="sr-only">Ảnh</span>,
      meta: { className: 'w-16 pr-0', headerClassName: 'w-16' },
      cell: ({ row }) => (
        <MenuImage
          imageUrl={row.original.imageUrl}
          name={row.original.name}
          color={colorOf.get(row.original.categoryId)}
          className="size-12 rounded-lg"
          textClassName="text-sm"
        />
      ),
    },
    {
      id: 'code',
      header: 'Mã',
      enableSorting: true,
      meta: { className: 'w-20' },
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      id: 'name',
      header: 'Tên món',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="max-w-72 min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          {row.original.description && (
            <p className="text-muted-foreground truncate text-xs" title={row.original.description}>
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'categoryName',
      header: 'Danh mục',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorOf.get(row.original.categoryId) }}
            aria-hidden="true"
          />
          {row.original.categoryName}
        </span>
      ),
    },
    {
      id: 'price',
      header: 'Đơn giá',
      enableSorting: true,
      meta: { className: 'text-right', headerClassName: 'text-right' },
      cell: ({ row }) => (
        <div className="text-right whitespace-nowrap">
          <p className="font-medium tabular-nums">
            {formatUnitPrice(row.original.price, row.original.pricingType, row.original.unit)}
          </p>
          <p className="text-muted-foreground text-xs">
            {pricingTypeLabels[row.original.pricingType]}
            {row.original.pricingType === 'TheoSuat' && ` · ${row.original.unit}`}
          </p>
        </div>
      ),
    },
    {
      id: 'station',
      header: 'Khu chế biến',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">{stationLabels[row.original.station]}</span>
      ),
    },
    {
      id: 'prepMinutes',
      header: 'Thời gian chuẩn',
      meta: { className: 'text-right', headerClassName: 'text-right' },
      cell: ({ row }) =>
        row.original.station === 'KhongQuaBep' || !row.original.prepMinutes ? (
          <span className="text-muted-foreground" aria-label="Không có">
            —
          </span>
        ) : (
          <span className="text-sm whitespace-nowrap tabular-nums">
            {row.original.prepMinutes} phút
          </span>
        ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      cell: ({ row }) => {
        const s = menuItemStatusLabels[row.original.status]
        return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
      },
    },
    {
      id: 'available',
      header: 'Còn bán',
      cell: ({ row }) => {
        const m = row.original
        const available = !m.isSoldOut
        return (
          <label
            className={cn(
              'inline-flex min-h-11 items-center gap-2 text-sm whitespace-nowrap',
              canAvailability ? 'cursor-pointer' : 'cursor-not-allowed'
            )}
            title={canAvailability ? undefined : 'Bạn không có quyền báo tạm hết'}
          >
            <Switch
              checked={available}
              disabled={!canAvailability || pendingAvailabilityId === m.id}
              onCheckedChange={(v) => toggleAvailability(m, v)}
              aria-label={`Còn bán ${m.name}`}
            />
            <span className={cn(available ? 'text-foreground' : 'text-warning font-medium')}>
              {available ? 'Còn bán' : 'Tạm hết'}
            </span>
          </label>
        )
      },
    },
  ]

  if (canUpdate || canDelete) {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      meta: { className: 'text-right', headerClassName: 'w-px' },
      cell: ({ row }) => {
        const m = row.original
        const reasonId = `ever-ordered-${m.id}`
        return (
          <div className="flex items-center justify-end gap-1">
            {canUpdate && (
              <Button
                variant="outline"
                className="h-11 min-w-20"
                onClick={() => toggleHidden(m)}
                disabled={pendingHiddenId === m.id}
                aria-label={m.isHidden ? `Hiện lại ${m.name}` : `Ẩn ${m.name}`}
              >
                {m.isHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                {m.isHidden ? 'Hiện' : 'Ẩn'}
              </Button>
            )}
            {canUpdate && (
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => setForm({ open: true, item: m })}
                aria-label={`Sửa ${m.name}`}
                title="Sửa món"
              >
                <Pencil />
              </Button>
            )}
            {canDelete &&
              (m.everOrdered ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* Nút bị vô hiệu không nhận rê chuột nên bọc span để vẫn hiện lý do; chạm trên tablet thì báo bằng toast */}
                      <span
                        tabIndex={0}
                        onClick={() =>
                          toast.info(EVER_ORDERED_MESSAGE, {
                            description: 'Dùng nút "Ẩn" để bỏ món khỏi tablet phục vụ.',
                          })
                        }
                        className="focus-visible:ring-ring/50 inline-flex rounded-md outline-none focus-visible:ring-3"
                        aria-describedby={reasonId}
                      >
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          disabled
                          aria-label={`Xóa ${m.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56">
                      {EVER_ORDERED_MESSAGE}. Dùng nút &quot;Ẩn&quot; để bỏ món khỏi tablet phục vụ.
                    </TooltipContent>
                  </Tooltip>
                  <span id={reasonId} className="sr-only">
                    {EVER_ORDERED_MESSAGE}
                  </span>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(m)}
                  aria-label={`Xóa ${m.name}`}
                  title="Xóa món"
                >
                  <Trash2 />
                </Button>
              ))}
          </div>
        )
      },
    })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      toast.success(`Đã xóa món ${deleteTarget.name}`)
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    }
  }

  const openCreate = () => setForm({ open: true, item: null })

  return (
    <>
      <DataTable
        columns={columns}
        data={items.data?.items}
        getRowId={(m) => m.id}
        isLoading={items.isLoading}
        isFetching={items.isFetching}
        error={items.error}
        onRetry={() => void items.refetch()}
        minWidth={1240}
        sorting={{
          sortBy: table.state.sortBy,
          sortDir: table.state.sortDir,
          onSortChange: table.setSort,
        }}
        pagination={
          items.data && {
            page: items.data.page,
            pageSize: items.data.pageSize,
            totalCount: items.data.totalCount,
            totalPages: items.data.totalPages,
            onPageChange: table.setPage,
            onPageSizeChange: table.setPageSize,
          }
        }
        toolbar={
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <SearchInput
              key={searchKey}
              value={table.state.search}
              onSearch={table.setSearch}
              placeholder="Tìm mã, tên món"
              className="lg:max-w-64"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
              <Select
                value={table.state.categoryId ?? 'all'}
                onValueChange={(v) => table.setFilter('categoryId', v === 'all' ? undefined : v)}
                disabled={!categoryList.length}
              >
                <SelectTrigger className="h-11 lg:w-48" aria-label="Lọc theo danh mục">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi danh mục</SelectItem>
                  {categoryList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden="true"
                      />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={table.state.status ?? 'all'}
                onValueChange={(v) =>
                  table.setFilter('status', v === 'all' ? undefined : (v as MenuItemStatus))
                }
              >
                <SelectTrigger className="h-11 lg:w-40" aria-label="Lọc theo trạng thái">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi trạng thái</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {menuItemStatusLabels[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={table.state.station ?? 'all'}
                onValueChange={(v) =>
                  table.setFilter('station', v === 'all' ? undefined : (v as KitchenStation))
                }
              >
                <SelectTrigger className="h-11 lg:w-44" aria-label="Lọc theo khu chế biến">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi khu chế biến</SelectItem>
                  {ALL_STATIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {stationLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" className="text-muted-foreground h-11" onClick={clearFilters}>
                <X aria-hidden="true" />
                Xóa lọc
              </Button>
            )}
            {canCreate && (
              <Button className="h-11 lg:ml-auto" onClick={openCreate}>
                <Plus aria-hidden="true" />
                Thêm món
              </Button>
            )}
          </div>
        }
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Không có món phù hợp"
              description="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
              action={
                <Button variant="outline" className="h-11" onClick={clearFilters}>
                  Xóa bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UtensilsCrossed}
              title="Chưa có món nào"
              description="Thêm món để phục vụ gọi món trên tablet."
              action={
                canCreate && (
                  <Button className="h-11" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Thêm món
                  </Button>
                )
              }
            />
          )
        }
      />

      <MenuItemFormDialog
        key={form.item?.id ?? 'new'}
        open={form.open}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
        item={form.item}
        categories={categoryList}
        defaultCategoryId={table.state.categoryId}
        canUploadImage={canUpdate}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        variant="destructive"
        icon={Trash2}
        title="Xóa món này?"
        description={`${deleteTarget?.name} (${deleteTarget?.code}) sẽ bị xóa khỏi thực đơn. Món chưa từng được gọi nên không ảnh hưởng hóa đơn.`}
        confirmText="Xóa món"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}

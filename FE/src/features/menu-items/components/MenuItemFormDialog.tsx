'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Info, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MenuImage } from '@/features/pos/components/MenuImage'
import { MoneyInput } from '@/features/pos/components/MoneyInput'
import {
  ALL_STATIONS,
  formatUnitPrice,
  pricingTypeLabels,
  stationLabels,
} from '@/features/pos/lib/labels'
import type {
  CategoryDto,
  KitchenStation,
  MenuItemDto,
  PricingType,
} from '@/features/pos/types/pos.types'
import { applyFieldErrors, getErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import {
  useNextMenuItemCode,
  useSaveMenuItem,
  useUploadMenuItemImage,
} from '../hooks/use-menu-items'
import {
  PORTION_UNITS,
  WEIGHT_UNIT,
  defaultPrepMinutes,
  menuItemSchema,
  type MenuItemFormValues,
} from '../schemas/menu-item.schema'

type MenuItemFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có món là sửa, không có là thêm mới */
  item: MenuItemDto | null
  categories: CategoryDto[]
  /** Danh mục đang lọc ở bảng, dùng làm mặc định khi thêm món */
  defaultCategoryId?: string
  /** Có quyền `menu-items.update` thì mới tải ảnh được */
  canUploadImage: boolean
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const PRICING_TYPES: PricingType[] = ['TheoSuat', 'TheoTrongLuong']

function toValues(item: MenuItemDto | null, defaultCategoryId?: string): MenuItemFormValues {
  if (!item) {
    return {
      code: '',
      name: '',
      categoryId: defaultCategoryId ?? '',
      description: '',
      pricingType: 'TheoSuat',
      unit: PORTION_UNITS[0],
      price: null,
      station: 'BepNong',
      prepMinutes: defaultPrepMinutes('BepNong'),
    }
  }
  return {
    code: item.code,
    name: item.name,
    categoryId: item.categoryId,
    description: item.description ?? '',
    pricingType: item.pricingType,
    unit: item.pricingType === 'TheoTrongLuong' ? WEIGHT_UNIT : item.unit,
    price: item.price,
    station: item.station,
    prepMinutes:
      item.station === 'KhongQuaBep'
        ? null
        : (item.prepMinutes ?? defaultPrepMinutes(item.station)),
  }
}

/**
 * Thêm/sửa món (UC-03, FR-07, BR-28): mã M001, cách tính theo suất hoặc theo trọng lượng,
 * đơn giá bội số 1.000 ₫, khu chế biến và thời gian chuẩn; ảnh tải lên khi sửa món.
 * Lỗi từ API (vd 409 "Mã món đã tồn tại") gắn vào đúng ô (UC-03 E1, E2).
 */
export function MenuItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
  defaultCategoryId,
  canUploadImage,
}: MenuItemFormDialogProps) {
  const save = useSaveMenuItem()
  const upload = useUploadMenuItemImage()
  const nextCode = useNextMenuItemCode(open && !item)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

  const form = useForm<MenuItemFormValues>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: toValues(null),
  })
  const { errors } = form.formState

  useEffect(() => {
    if (open) form.reset(toValues(item, defaultCategoryId))
  }, [open, item, defaultCategoryId, form])

  // Gợi ý mã kế tiếp khi thêm món, chỉ điền khi người dùng chưa gõ mã
  useEffect(() => {
    if (open && !item && nextCode.data && !nextCode.isFetching && !form.getValues('code')) {
      form.setValue('code', nextCode.data, { shouldDirty: false })
    }
  }, [open, item, nextCode.data, nextCode.isFetching, form])

  const [pricingType, station, categoryId, name, unit] = useWatch({
    control: form.control,
    name: ['pricingType', 'station', 'categoryId', 'name', 'unit'],
  })
  const isWeight = pricingType === 'TheoTrongLuong'
  const noKitchen = station === 'KhongQuaBep'
  const color = categories.find((c) => c.id === categoryId)?.color
  const pending = save.isPending

  const changePricingType = (next: PricingType) => {
    form.setValue('pricingType', next, { shouldDirty: true })
    if (next === 'TheoTrongLuong') form.setValue('unit', WEIGHT_UNIT, { shouldDirty: true })
    else if (form.getValues('unit') === WEIGHT_UNIT)
      form.setValue('unit', PORTION_UNITS[0], { shouldDirty: true })
    form.clearErrors('unit')
  }

  const changeStation = (next: KitchenStation) => {
    const current = form.getValues('prepMinutes')
    const previous = form.getValues('station')
    form.setValue('station', next, { shouldDirty: true })
    // Chưa sửa tay thời gian chuẩn thì đổi theo mặc định của khu mới (15 phút, quầy bar 5 phút)
    if (next === 'KhongQuaBep' || current === null || current === defaultPrepMinutes(previous)) {
      form.setValue('prepMinutes', defaultPrepMinutes(next), { shouldDirty: true })
    }
    form.clearErrors('prepMinutes')
  }

  const pickImage = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !item) return
    if (!IMAGE_TYPES.includes(file.type)) return void toast.error('Chỉ nhận ảnh JPG, PNG hoặc WebP')
    if (file.size > MAX_IMAGE_BYTES) return void toast.error('Ảnh tối đa 2 MB')
    upload.mutate(
      { id: item.id, file },
      {
        onSuccess: (result) => {
          setUploadedUrl(result.imageUrl)
          toast.success(`Đã cập nhật ảnh món ${item.name}`)
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      }
    )
  }

  const onSubmit = form.handleSubmit((values) => {
    const weight = values.pricingType === 'TheoTrongLuong'
    const kitchen = values.station !== 'KhongQuaBep'
    save.mutate(
      {
        id: item?.id,
        input: {
          code: values.code,
          name: values.name,
          categoryId: values.categoryId,
          description: values.description || undefined,
          unit: weight ? WEIGHT_UNIT : values.unit,
          pricingType: values.pricingType,
          price: values.price ?? 0,
          station: values.station,
          prepMinutes: kitchen ? (values.prepMinutes ?? undefined) : undefined,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(
            item
              ? `Đã lưu món ${saved.name}`
              : `Đã thêm món ${saved.name}, giá ${formatUnitPrice(saved.price, saved.pricingType, saved.unit)}`
          )
          onOpenChange(false)
        },
        onError: (error) => {
          if (!applyFieldErrors(form.setError, error)) toast.error(getErrorMessage(error))
        },
      }
    )
  })

  const imageUrl = uploadedUrl ?? item?.imageUrl

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{item ? `Sửa món ${item.code}` : 'Thêm món'}</DialogTitle>
          <DialogDescription>
            {item
              ? 'Hóa đơn đang mở giữ giá lúc gọi; món gọi sau dùng giá mới.'
              : 'Món mới hiện trên tablet phục vụ ở lần tải thực đơn kế tiếp.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-col">
          <div
            className={cn(
              'grid max-h-[calc(100dvh-14rem)] gap-5 overflow-y-auto px-6 py-5',
              item && 'sm:grid-cols-[10rem_minmax(0,1fr)]'
            )}
          >
            {item && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Ảnh món</span>
                <div className="relative overflow-hidden rounded-xl border">
                  <MenuImage
                    imageUrl={imageUrl}
                    name={name || item.name}
                    color={color}
                    className="aspect-square w-full"
                  />
                  {upload.isPending && (
                    <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
                      <Loader2
                        className="text-primary size-6 animate-spin"
                        aria-label="Đang tải ảnh lên"
                      />
                    </div>
                  )}
                </div>
                {canUploadImage && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={() => fileRef.current?.click()}
                      disabled={upload.isPending}
                    >
                      <ImagePlus aria-hidden="true" />
                      {imageUrl ? 'Đổi ảnh' : 'Tải ảnh'}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={IMAGE_TYPES.join(',')}
                      className="hidden"
                      onChange={(e) => pickImage(e.target.files?.[0])}
                    />
                  </>
                )}
                <p className="text-muted-foreground text-xs">
                  JPG, PNG, WebP tối đa 2 MB. Ảnh lưu ngay khi chọn.
                </p>
              </div>
            )}

            <div className="grid content-start gap-4 sm:grid-cols-2">
              {!item && (
                <div
                  className="bg-info/10 text-info border-info/25 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm sm:col-span-2"
                  role="note"
                >
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>Lưu món xong, mở &quot;Sửa&quot; để tải ảnh món.</span>
                </div>
              )}

              <FormField
                label="Mã món"
                required
                error={errors.code?.message}
                hint={
                  !item && nextCode.data
                    ? `Dạng M001; mã kế tiếp gợi ý ${nextCode.data}`
                    : 'Dạng M001'
                }
              >
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  className="uppercase"
                  placeholder="M061"
                  {...form.register('code')}
                />
              </FormField>

              <FormField
                label="Danh mục"
                required
                htmlFor="menu-item-category"
                error={errors.categoryId?.message}
              >
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="menu-item-category"
                        className="w-full"
                        aria-invalid={errors.categoryId ? true : undefined}
                      >
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span
                              className="size-3 rounded-sm"
                              style={{ backgroundColor: c.color }}
                              aria-hidden="true"
                            />
                            {c.name}
                            {c.isHidden && (
                              <span className="text-muted-foreground text-xs">(đang ẩn)</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <FormField
                label="Tên món"
                required
                error={errors.name?.message}
                className="sm:col-span-2"
              >
                <Input
                  autoComplete="off"
                  placeholder="vd: Tôm sú nướng muối ớt"
                  {...form.register('name')}
                />
              </FormField>

              <FormField
                label="Mô tả"
                error={errors.description?.message}
                className="sm:col-span-2"
              >
                <Textarea
                  rows={2}
                  placeholder="Nguyên liệu, cách chế biến, khẩu phần"
                  {...form.register('description')}
                />
              </FormField>

              <fieldset className="grid gap-1.5 sm:col-span-2">
                <legend className="mb-1.5 text-sm font-medium">
                  Cách tính{' '}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </legend>
                <div role="radiogroup" aria-label="Cách tính" className="grid grid-cols-2 gap-2">
                  {PRICING_TYPES.map((type) => {
                    const active = pricingType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => changePricingType(type)}
                        className={cn(
                          'focus-visible:ring-ring/50 flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3',
                          active
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'hover:bg-muted/60'
                        )}
                      >
                        <span className="font-medium">{pricingTypeLabels[type]}</span>
                        <span className="text-muted-foreground text-xs">
                          {type === 'TheoSuat'
                            ? 'Gọi theo số lượng nguyên'
                            : 'Cân tại bàn, nhập số kg'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <FormField
                label="Đơn vị tính"
                required
                error={errors.unit?.message}
                hint={
                  isWeight
                    ? 'Món theo trọng lượng luôn tính theo kg.'
                    : 'Chọn nhanh bên dưới hoặc tự nhập.'
                }
              >
                <div className="relative">
                  <Input
                    autoComplete="off"
                    placeholder="vd: đĩa"
                    readOnly={isWeight}
                    aria-readonly={isWeight || undefined}
                    className={cn(isWeight && 'bg-muted text-muted-foreground pr-9')}
                    {...form.register('unit')}
                  />
                  {isWeight && (
                    <Lock
                      className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </FormField>

              <FormField
                label={isWeight ? 'Đơn giá một kg' : 'Đơn giá'}
                required
                htmlFor="menu-item-price"
                error={errors.price?.message}
                hint="Bội số 1.000 ₫, chưa gồm thuế."
              >
                <Controller
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <MoneyInput
                      id="menu-item-price"
                      ref={field.ref}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="0"
                      aria-invalid={errors.price ? true : undefined}
                    />
                  )}
                />
              </FormField>

              {!isWeight && (
                <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Đơn vị gợi ý">
                  {PORTION_UNITS.map((u) => (
                    <Button
                      key={u}
                      type="button"
                      variant={unit === u ? 'secondary' : 'outline'}
                      aria-pressed={unit === u}
                      className={cn(
                        'h-11 min-w-14',
                        unit === u && 'border-primary/40 text-primary'
                      )}
                      onClick={() =>
                        form.setValue('unit', u, { shouldDirty: true, shouldValidate: true })
                      }
                    >
                      {u}
                    </Button>
                  ))}
                </div>
              )}

              <FormField label="Khu chế biến" required htmlFor="menu-item-station">
                <Select value={station} onValueChange={(v) => changeStation(v as KitchenStation)}>
                  <SelectTrigger id="menu-item-station" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {stationLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {noKitchen ? (
                <p className="text-muted-foreground self-end pb-2 text-sm">
                  Món không qua bếp chuyển &quot;Xong&quot; ngay khi gửi, không cần thời gian chuẩn.
                </p>
              ) : (
                <FormField
                  label="Thời gian chuẩn (phút)"
                  required
                  htmlFor="menu-item-prep"
                  error={errors.prepMinutes?.message}
                  hint="Từ 1 đến 120 phút; quá giờ phiếu bếp đổi màu."
                >
                  <Controller
                    control={form.control}
                    name="prepMinutes"
                    render={({ field }) => (
                      <Input
                        id="menu-item-prep"
                        ref={field.ref}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={120}
                        step={1}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number(e.target.value))
                        }
                        onBlur={field.onBlur}
                        className="tabular-nums"
                        aria-invalid={errors.prepMinutes ? true : undefined}
                      />
                    )}
                  />
                </FormField>
              )}
            </div>
          </div>

          <DialogFooter className="bg-muted/30 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {item ? 'Lưu thay đổi' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

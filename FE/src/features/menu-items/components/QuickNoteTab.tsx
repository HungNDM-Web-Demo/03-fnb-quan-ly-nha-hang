'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { permissions } from '@/config/permissions'
import type { QuickNoteDto } from '@/features/pos/types/pos.types'
import { usePermissions } from '@/hooks/use-permissions'
import { applyFieldErrors, getErrorMessage } from '@/lib/api-error'
import {
  useDeleteQuickNote,
  useQuickNotes,
  useReorderQuickNotes,
  useSaveQuickNote,
} from '../hooks/use-menu-items'
import {
  QUICK_NOTE_MAX,
  quickNoteSchema,
  type QuickNoteFormValues,
} from '../schemas/menu-item.schema'

/**
 * Tab Ghi chú nhanh (UC-03 1b, FR-08): thêm (tối đa 50 ký tự, trùng → "Ghi chú đã có"),
 * sửa tại chỗ, xóa, đổi thứ tự bằng nút lên/xuống.
 */
export function QuickNoteTab() {
  const { can } = usePermissions()
  const canCreate = can(permissions.menuItems.create)
  const canUpdate = can(permissions.menuItems.update)
  const canDelete = can(permissions.menuItems.delete)

  const notes = useQuickNotes()
  const reorder = useReorderQuickNotes()
  const remove = useDeleteQuickNote()

  const [order, setOrder] = useState<QuickNoteDto[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuickNoteDto | null>(null)

  const [synced, setSynced] = useState<QuickNoteDto[] | undefined>(undefined)
  if (notes.data !== synced) {
    setSynced(notes.data)
    if (notes.data) setOrder(notes.data)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    reorder.mutate(
      next.map((n) => n.id),
      {
        onError: (error) => {
          toast.error(getErrorMessage(error))
          if (notes.data) setOrder(notes.data)
        },
      }
    )
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      toast.success(`Đã xóa ghi chú "${deleteTarget.content}"`)
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    }
  }

  if (notes.error) {
    return (
      <Card className="p-0">
        <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
      </Card>
    )
  }

  return (
    <Card className="gap-0 p-0">
      <div className="space-y-3 border-b p-4">
        <p className="text-muted-foreground text-sm text-pretty">
          Phục vụ chạm chọn ghi chú khi gọi món; ghi chú in kèm món trên phiếu bếp.
        </p>
        {canCreate && <AddQuickNoteForm />}
      </div>

      {notes.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : order.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="Chưa có ghi chú nhanh"
          description="Thêm các ghi chú hay dùng như Ít cay, Không hành, Ít đá."
        />
      ) : (
        <ol className="divide-y" aria-label="Ghi chú nhanh theo thứ tự">
          {order.map((note, index) => (
            <li key={note.id} className="flex min-h-14 items-center gap-3 px-4 py-1.5">
              <span
                className="text-muted-foreground w-6 text-right text-sm tabular-nums"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              {editingId === note.id ? (
                <EditQuickNoteRow note={note} onDone={() => setEditingId(null)} />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{note.content}</span>
                  <div className="flex items-center gap-1">
                    {canUpdate && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0 || reorder.isPending}
                          aria-label={`Đưa "${note.content}" lên`}
                          title="Đưa lên"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          onClick={() => move(index, index + 1)}
                          disabled={index === order.length - 1 || reorder.isPending}
                          aria-label={`Đưa "${note.content}" xuống`}
                          title="Đưa xuống"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          onClick={() => setEditingId(note.id)}
                          aria-label={`Sửa "${note.content}"`}
                          title="Sửa"
                        >
                          <Pencil />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(note)}
                        aria-label={`Xóa "${note.content}"`}
                        title="Xóa"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        variant="destructive"
        icon={Trash2}
        title="Xóa ghi chú nhanh?"
        description={`Ghi chú "${deleteTarget?.content}" sẽ không còn để chọn khi gọi món. Món đã gọi vẫn giữ nội dung ghi chú.`}
        confirmText="Xóa ghi chú"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </Card>
  )
}

/** Ô thêm ghi chú ở đầu danh sách */
function AddQuickNoteForm() {
  const save = useSaveQuickNote()
  const form = useForm<QuickNoteFormValues>({
    resolver: zodResolver(quickNoteSchema),
    defaultValues: { content: '' },
  })
  const error = form.formState.errors.content?.message
  const content = useWatch({ control: form.control, name: 'content' }) ?? ''

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { content: values.content },
      {
        onSuccess: (created) => {
          toast.success(`Đã thêm ghi chú "${created.content}"`)
          form.reset({ content: '' })
        },
        onError: (e) => {
          if (!applyFieldErrors(form.setError, e)) toast.error(getErrorMessage(e))
        },
      }
    )
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-1.5">
      <label htmlFor="quick-note-new" className="text-sm font-medium">
        Ghi chú mới
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Input
            id="quick-note-new"
            autoComplete="off"
            placeholder="vd: Ít cay"
            maxLength={QUICK_NOTE_MAX + 10}
            className="h-11 pr-16"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'quick-note-new-error' : undefined}
            {...form.register('content')}
          />
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums">
            {content.trim().length}/{QUICK_NOTE_MAX}
          </span>
        </div>
        <Button type="submit" className="h-11" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Thêm ghi chú
        </Button>
      </div>
      {error && (
        <p
          id="quick-note-new-error"
          role="alert"
          className="text-destructive flex items-start gap-1 text-[0.8125rem]"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  )
}

/** Sửa tại chỗ: Enter lưu, Esc hủy */
function EditQuickNoteRow({ note, onDone }: { note: QuickNoteDto; onDone: () => void }) {
  const save = useSaveQuickNote()
  const form = useForm<QuickNoteFormValues>({
    resolver: zodResolver(quickNoteSchema),
    defaultValues: { content: note.content },
  })
  const error = form.formState.errors.content?.message
  const errorId = `quick-note-${note.id}-error`

  const onSubmit = form.handleSubmit((values) => {
    if (values.content === note.content) return onDone()
    save.mutate(
      { id: note.id, content: values.content },
      {
        onSuccess: (saved) => {
          toast.success(`Đã lưu ghi chú "${saved.content}"`)
          onDone()
        },
        onError: (e) => {
          if (!applyFieldErrors(form.setError, e)) toast.error(getErrorMessage(e))
        },
      }
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          autoComplete="off"
          maxLength={QUICK_NOTE_MAX + 10}
          className="h-11 min-w-0 flex-1"
          aria-label={`Sửa ghi chú "${note.content}"`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onDone()
            }
          }}
          {...form.register('content')}
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={save.isPending}
          aria-label="Lưu ghi chú"
          title="Lưu"
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onDone}
          disabled={save.isPending}
          aria-label="Hủy sửa"
          title="Hủy"
        >
          <X />
        </Button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-destructive flex items-start gap-1 text-[0.8125rem]"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  )
}

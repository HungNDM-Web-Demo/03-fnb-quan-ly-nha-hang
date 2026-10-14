'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { FormField } from '@/components/shared/FormField'
import { PasswordInput } from '@/components/shared/PasswordInput'
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
import { getErrorMessage } from '@/lib/api-error'
import { usePosMutation } from '../hooks/use-pos'
import { orderService } from '../services/order.service'
import type { ApprovalAction, ApprovalDto } from '../types/pos.types'

type ManagerApprovalDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: ApprovalAction
  /** Câu giải thích vì sao cần xác nhận */
  description: React.ReactNode
  onApproved: (approval: ApprovalDto) => void
}

/**
 * SCR-07: quản lý nhập tài khoản ngay trên tablet (POST /api/approvals). Sai mật khẩu, thiếu quyền
 * → từ chối, món/hóa đơn giữ nguyên (TC-24 bước 2, UC-08 E2). Token dùng một lần, sống 5 phút.
 */
export function ManagerApprovalDialog({ open, onOpenChange, action, description, onApproved }: ManagerApprovalDialogProps) {
  const approve = usePosMutation(orderService.approve)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setUsername('')
      setPassword('')
      setError(null)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) return setError('Nhập tên đăng nhập và mật khẩu của quản lý')
    approve.mutate(
      { username: username.trim(), password, action },
      {
        onSuccess: (result) => {
          onOpenChange(false)
          onApproved(result)
        },
        onError: (err) => {
          setError(getErrorMessage(err))
          setPassword('')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !approve.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sm:flex-row sm:items-start sm:gap-4">
          <span
            className="bg-warning/12 text-warning flex size-11 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <ShieldCheck className="size-5" />
          </span>
          <div className="space-y-1.5 text-left">
            <DialogTitle>{action === 'HuyMon' ? 'Quản lý xác nhận hủy món' : 'Quản lý xác nhận giảm giá'}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          {error && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/8 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <FormField label="Tên đăng nhập quản lý" htmlFor="approval-username" required>
            <Input
              id="approval-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="vd: quanly"
              className="h-11"
              autoFocus
            />
          </FormField>
          <FormField label="Mật khẩu" htmlFor="approval-password" required>
            <PasswordInput
              id="approval-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="h-11"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={approve.isPending}>
              Hủy
            </Button>
            <Button type="submit" className="h-11" disabled={approve.isPending}>
              {approve.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

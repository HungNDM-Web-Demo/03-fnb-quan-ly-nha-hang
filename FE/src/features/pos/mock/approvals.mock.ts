import { permissions } from '@/config/permissions'
import { mockDelay } from '@/lib/data-source'
import { requirePermission } from '@/mock/mock-auth'
import { mockDb } from '@/mock/mock-db'
import { forbidden, validation } from '@/mock/mock-errors'
import { newId } from '@/mock/mock-helpers'
import { effectivePermissions, isSuperAdmin, liveUsers, loginAttemptsDb, verifyPassword } from '@/mock/system-data'
import { PosRules } from '../lib/pos-rules'
import type { ApprovalAction, ApprovalDto, ApprovalRequest } from '../types/pos.types'
import { bizError, PosErrors } from './pos.errors'

/**
 * POST /api/approvals (07 §2.12, SCR-07): quản lý nhập tài khoản ngay trên tablet.
 * Token giữ trong biến module của tab 5 phút, dùng một lần, gắn với action (07 §4).
 * Sai mật khẩu trả 400 (không 401) để không làm mới token của người đang dùng; vẫn đếm sai mật khẩu và tạm khóa
 * 5 lần/5 phút theo BR-SYS-03 (chung bộ đếm với đăng nhập). Xác nhận đúng không xóa bộ đếm (BE không ghi gì vào tài khoản).
 */

type TokenEntry = { action: ApprovalAction; userId: string; username: string; expiresAt: number }
const tokens = new Map<string, TokenEntry>()
mockDb.onReset(() => tokens.clear())

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng'
const MAX_FAILED = 5
const LOCK_MINUTES = 5

function lockedMessage(lockedUntil: string) {
  const minutes = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000))
  return `Tài khoản tạm khóa đăng nhập, thử lại sau ${minutes} phút`
}

/** Như `User.RegisterFailedLogin` của BE: hết hạn khóa thì đếm lại; đủ 5 lần thì khóa 5 phút */
function recordFailure(key: string): never {
  const attempt = loginAttemptsDb.get(key)
  const expired = !!attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() <= Date.now()
  const failedCount = (expired ? 0 : (attempt?.failedCount ?? 0)) + 1
  if (failedCount >= MAX_FAILED) {
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
    const record = { id: key, failedCount: 0, lockedUntil }
    if (attempt) loginAttemptsDb.update(key, record)
    else loginAttemptsDb.insert(record)
    throw bizError(lockedMessage(lockedUntil))
  }
  if (attempt) loginAttemptsDb.update(key, { failedCount, lockedUntil: null })
  else loginAttemptsDb.insert({ id: key, failedCount, lockedUntil: null })
  throw bizError(INVALID_CREDENTIALS)
}

export const approvalsMock = {
  async approve(request: ApprovalRequest): Promise<ApprovalDto> {
    await mockDelay(250, 450)
    requirePermission(request.action === 'GiamGia' ? permissions.orders.discount : permissions.orderItems.cancel)
    if (request.action !== 'HuyMon' && request.action !== 'GiamGia') {
      throw validation({ action: 'Thao tác cần xác nhận không hợp lệ' })
    }
    const username = request.username?.trim().toLowerCase()
    const user = username ? liveUsers().find((u) => u.username.toLowerCase() === username) : undefined
    if (!user) throw bizError(INVALID_CREDENTIALS)
    // BR-SYS-03 như BE: đang tạm khóa thì không kiểm mật khẩu; sai mật khẩu đếm chung với đăng nhập
    const key = user.username.toLowerCase()
    const attempt = loginAttemptsDb.get(key)
    if (attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now()) {
      throw bizError(lockedMessage(attempt.lockedUntil))
    }
    if (!request.password || !verifyPassword(user, request.password)) recordFailure(key)
    if (!user.isActive) throw bizError('Tài khoản đã bị khóa, liên hệ quản trị viên')
    const needed = request.action === 'HuyMon' ? permissions.orderItems.voidApprove : permissions.orders.discountOverride
    if (!isSuperAdmin(user) && !effectivePermissions(user).includes(needed)) {
      throw forbidden(
        request.action === 'HuyMon'
          ? 'Tài khoản không có quyền duyệt hủy món'
          : 'Tài khoản không có quyền xác nhận giảm giá'
      )
    }
    const token = (newId() + newId()).replace(/-/g, '')
    const expiresAt = Date.now() + PosRules.approvalMinutes * 60_000
    tokens.set(token, { action: request.action, userId: user.id, username: user.username, expiresAt })
    return {
      token,
      approvedById: user.id,
      approvedByUsername: user.username,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  },
}

/** Dùng token một lần; sai, hết hạn, đã dùng, sai action → MaXacNhanKhongHopLe */
export function consumeApproval(token: string | undefined, action: ApprovalAction): TokenEntry {
  const entry = token ? tokens.get(token) : undefined
  if (!token || !entry || entry.action !== action || entry.expiresAt < Date.now()) {
    if (token) tokens.delete(token)
    throw PosErrors.invalidApproval()
  }
  tokens.delete(token)
  return entry
}

'use client'

import { routePath } from '@/config/route-path'

/**
 * Mở bản in khổ 80 mm ở tab mới (SCR-09, 07 §2.19). `auto` → trang in tự gọi window.print()
 * (khi mở từ luồng thao tác). Mở cửa sổ trước khi chờ API để trình duyệt không chặn popup.
 */
export function printUrl(orderId: string, options: { prebill?: boolean; reprint?: boolean; auto?: boolean } = {}) {
  const params = new URLSearchParams()
  if (options.prebill) params.set('type', 'prebill')
  if (options.reprint) params.set('reprint', '1')
  if (options.auto) params.set('auto', '1')
  const query = params.toString()
  return `${routePath.orderPrint(orderId)}${query ? `?${query}` : ''}`
}

/**
 * Mở bản in ở tab mới. Trình duyệt chặn popup (vd mở sau khi chờ API) thì `navigateIfBlocked` quyết định
 * chuyển luôn tab hiện tại sang bản in hay để người dùng bấm nút "In hóa đơn".
 */
export function openPrint(
  orderId: string,
  options: { prebill?: boolean; reprint?: boolean; auto?: boolean } = {},
  navigateIfBlocked = true
): boolean {
  const win = window.open(printUrl(orderId, { auto: true, ...options }), '_blank')
  if (!win && navigateIfBlocked) window.location.href = printUrl(orderId, options)
  return !!win
}

/** Mở sẵn tab trống, trả hàm điều hướng tab đó sau khi API xong (tránh chặn popup) */
export function preparePrintWindow() {
  const win = window.open('about:blank', '_blank')
  return {
    go: (orderId: string, options: { prebill?: boolean; reprint?: boolean } = {}) => {
      const url = printUrl(orderId, { auto: true, ...options })
      if (win && !win.closed) win.location.href = url
      else window.open(url, '_blank')
    },
    cancel: () => {
      if (win && !win.closed) win.close()
    },
  }
}

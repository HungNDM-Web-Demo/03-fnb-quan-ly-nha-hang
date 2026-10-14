/**
 * Chuỗi QR chuyển khoản giả lập (07 §4): `VIETQR|{bankBin}|{bankAccount}|{amount}|{orderCode}`.
 * FE vẽ bằng gói `qrcode` tại máy, không gọi dịch vụ ngoài; gửi chuỗi đã hiện trong `qrContent`.
 * Nội dung chuyển khoản là mã hóa đơn (BR-20).
 */
export function buildQrContent(input: {
  bankBin: string
  bankAccount: string
  amount: number
  orderCode: string
}): string {
  return `VIETQR|${input.bankBin}|${input.bankAccount}|${Math.round(input.amount)}|${input.orderCode}`
}

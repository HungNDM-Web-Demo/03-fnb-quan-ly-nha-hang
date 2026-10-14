/**
 * Nhãn, gợi ý và quy tắc kiểm tra cho khóa cài đặt riêng của dự án (project.json → settings).
 * Trang Cài đặt chung hiển thị khóa ngoài nhóm Thương hiệu/Doanh nghiệp theo nhóm; dùng bảng này để có nhãn
 * tiếng Việt. Quy tắc `Billing.*`, `Store.*Time` giống BE khi PUT /api/settings (docs/07 §2.17, FR-32).
 */
export const settingExtraLabels: Record<string, { label: string; hint?: string }> = {
  'Store.Name': { label: 'Tên nhà hàng', hint: 'In trên phiếu tạm tính, hóa đơn' },
  'Store.Address': { label: 'Địa chỉ' },
  'Store.Phone': { label: 'Số điện thoại' },
  'Store.TaxCode': { label: 'Mã số thuế' },
  'Store.ReceiptFooter': { label: 'Lời chào cuối hóa đơn' },
  'Store.BankBin': { label: 'Mã ngân hàng (BIN)', hint: 'QR chuyển khoản giả lập, vd 970436' },
  'Store.BankAccount': { label: 'Số tài khoản' },
  'Store.BankAccountName': { label: 'Tên chủ tài khoản' },
  'Store.OpenTime': { label: 'Giờ mở cửa', hint: 'Dạng HH:mm, dùng cho đặt bàn' },
  'Store.CloseTime': { label: 'Giờ đóng cửa', hint: 'Dạng HH:mm, sau giờ mở cửa' },
  'Billing.ServiceChargeRate': { label: 'Phí phục vụ (%)', hint: 'Số nguyên 0–15; 0 là tắt phí phục vụ' },
  'Billing.VatRate': { label: 'Thuế suất GTGT (%)', hint: 'Một trong 0, 5, 8, 10' },
  'Billing.CashierDiscountLimit': { label: 'Hạn mức giảm giá của thu ngân (%)', hint: 'Số nguyên 0–100; vượt mức cần quản lý xác nhận' },
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Kiểm tra giá trị cài đặt; trả về { [index]: thông báo } */
export function validateProjectSettings(items: { key: string; value?: string | null }[], current: Record<string, string>) {
  const errors: Record<number, string> = {}
  const merged = { ...current, ...Object.fromEntries(items.map((i) => [i.key, i.value ?? ''])) }
  items.forEach((item, index) => {
    const value = (item.value ?? '').trim()
    const int = /^\d+$/.test(value) ? Number(value) : NaN
    switch (item.key) {
      case 'Billing.ServiceChargeRate':
        if (!(int >= 0 && int <= 15)) errors[index] = 'Phí phục vụ từ 0 đến 15%'
        break
      case 'Billing.VatRate':
        if (![0, 5, 8, 10].includes(int)) errors[index] = 'Thuế suất là 0, 5, 8 hoặc 10%'
        break
      case 'Billing.CashierDiscountLimit':
        if (!(int >= 0 && int <= 100)) errors[index] = 'Hạn mức giảm giá từ 0 đến 100%'
        break
      case 'Store.OpenTime':
      case 'Store.CloseTime':
        if (!HHMM.test(value)) errors[index] = 'Giờ dạng HH:mm'
        else if (merged['Store.OpenTime'] >= merged['Store.CloseTime']) errors[index] = 'Giờ mở cửa phải trước giờ đóng cửa'
        break
    }
  })
  return errors
}

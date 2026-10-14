# Danh sách API — Quản lý Nhà hàng

> Base URL dev: `https://localhost:7103` · Swagger: `https://localhost:7103/swagger` · SignalR: `https://localhost:7103/hubs/pos`
> Quy ước chung (đường dẫn, phân trang, lỗi) và API nền (auth, users, roles, settings, audit-logs, demo): xem `ZDOCS/03-KIEN-TRUC/QUY-UOC-API.md`.
> File này là **hợp đồng giữa BE và FE**: BE (`Application/DTOs`) và FE (`features/*/types`) phải khớp từng trường. Ở chế độ `mock`, handler trong `features/*/mock` trả đúng các kiểu này, áp đúng quy tắc ở §3 và câu lỗi ở §2.20. Bảng, enum, dữ liệu mẫu: `06-THIET-KE-CSDL.md`.

---

## 1. Mã quyền nghiệp vụ

Đúng `02-SRS.md` §7; các mã ghép `create / update / delete` tách thành từng mã. Quyền nền `dashboard.view` chỉ `ADMIN`, `MANAGER` có (theo `system.json`); `WAITER`, `KITCHEN`, `CASHIER` không có nên không thấy Tổng quan. `ADMIN` luôn đủ quyền. Khai báo trong `FE/src/mock/seed/project.json`, `Application/Constants/Permissions.cs`, FE `config/permissions.ts`.

| Nhóm | Mã quyền | Tên hiển thị | ADMIN | MANAGER | WAITER | KITCHEN | CASHIER |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Sơ đồ bàn | `tables.view` | Xem sơ đồ bàn | ✓ | ✓ | ✓ | | ✓ |
| Sơ đồ bàn | `tables.create` | Thêm khu vực, bàn | ✓ | ✓ | | | |
| Sơ đồ bàn | `tables.update` | Sửa, ẩn, sắp xếp khu vực và bàn | ✓ | ✓ | | | |
| Sơ đồ bàn | `tables.delete` | Xóa khu vực, bàn | ✓ | ✓ | | | |
| Sơ đồ bàn | `tables.open` | Mở bàn, đóng bàn mở nhầm, báo dọn xong | ✓ | ✓ | ✓ | | ✓ |
| Sơ đồ bàn | `tables.transfer` | Chuyển bàn, gộp bàn, chuyển món | ✓ | ✓ | ✓ | | ✓ |
| Thực đơn | `menu-items.view` | Xem thực đơn | ✓ | ✓ | ✓ | ✓ | ✓ |
| Thực đơn | `menu-items.create` | Thêm danh mục, món, ghi chú nhanh | ✓ | ✓ | | | |
| Thực đơn | `menu-items.update` | Sửa, ẩn, sắp xếp thực đơn | ✓ | ✓ | | | |
| Thực đơn | `menu-items.delete` | Xóa món chưa gọi, danh mục trống, ghi chú nhanh | ✓ | ✓ | | | |
| Thực đơn | `menu-items.availability` | Báo tạm hết, bán lại | ✓ | ✓ | | ✓ | |
| Gọi món | `orders.view` | Xem hóa đơn (không có `orders.checkout` thì chỉ thấy hóa đơn đang mở) | ✓ | ✓ | ✓ | | ✓ |
| Gọi món | `orders.create` | Gọi món, gửi bếp, ra món | ✓ | ✓ | ✓ | | ✓ |
| Gọi món | `order-items.cancel` | Hủy món chưa chế biến | ✓ | ✓ | ✓ | | ✓ |
| Gọi món | `order-items.void-approve` | Duyệt hủy món đã chế biến | ✓ | ✓ | | | |
| Thanh toán | `orders.prebill` | In phiếu tạm tính | ✓ | ✓ | ✓ | | ✓ |
| Thanh toán | `orders.split` | Tách hóa đơn, chia đều | ✓ | ✓ | | | ✓ |
| Thanh toán | `orders.discount` | Giảm giá trong hạn mức | ✓ | ✓ | | | ✓ |
| Thanh toán | `orders.discount-override` | Xác nhận giảm giá vượt hạn mức | ✓ | ✓ | | | |
| Thanh toán | `orders.checkout` | Thu tiền, chốt hóa đơn, tra cứu hóa đơn | ✓ | ✓ | | | ✓ |
| Thanh toán | `orders.reprint` | In lại hóa đơn | ✓ | ✓ | | | ✓ |
| Thanh toán | `orders.cancel` | Hủy hóa đơn đã thanh toán | ✓ | ✓ | | | |
| Bếp | `kitchen-tickets.view` | Xem màn hình bếp | ✓ | ✓ | | ✓ | |
| Bếp | `kitchen-tickets.update` | Bắt đầu, xong, hoàn tác, báo hết món | ✓ | ✓ | | ✓ | |
| Đặt bàn | `reservations.view` | Xem đặt bàn | ✓ | ✓ | ✓ | | ✓ |
| Đặt bàn | `reservations.create` | Tạo đặt bàn | ✓ | ✓ | | | ✓ |
| Đặt bàn | `reservations.update` | Sửa đặt bàn | ✓ | ✓ | | | ✓ |
| Đặt bàn | `reservations.delete` | Hủy đặt bàn | ✓ | ✓ | | | ✓ |
| Đặt bàn | `reservations.check-in` | Nhận bàn từ đặt bàn | ✓ | ✓ | ✓ | | ✓ |
| Báo cáo | `reports.view` | Xem tổng quan, báo cáo | ✓ | ✓ | | | |

`orders.reprint` không có endpoint riêng: FE kiểm tra quyền rồi mở `/orders/[id]/print?reprint=1` bằng `GET /api/orders/{id}`. Phục vụ đọc thực đơn để gọi món bằng `orders.create`; bếp đọc để báo tạm hết bằng `menu-items.view` (`GET /api/menu`).

---

## 2. API nghiệp vụ

Bảng tra enum dùng chung cho mọi DTO (chuỗi PascalCase, khớp `06` §4):

```ts
type TableShape = 'Vuong' | 'Tron' | 'ChuNhat'
type TableStatus = 'Trong' | 'DaDat' | 'DangPhucVu' | 'ChoThanhToan' | 'ChoDon' | 'DaGop'
type PricingType = 'TheoSuat' | 'TheoTrongLuong'
type KitchenStation = 'BepNong' | 'BepNguoi' | 'QuayBar' | 'KhongQuaBep'
type MenuItemStatus = 'DangBan' | 'TamHet' | 'An'
type OrderStatus = 'DangMo' | 'DangThu' | 'DaThanhToan' | 'DaGop' | 'DaHuy'
type OrderItemStatus = 'ChuaGui' | 'ChoGoi' | 'ChoLam' | 'DangLam' | 'Xong' | 'DaPhucVu' | 'DaHuy'
type CancelReason = 'KhachDoiY' | 'GoiNham' | 'ChoLau' | 'Khac' | 'HetMon'
type KitchenTicketStatus = 'DangCho' | 'DaXong'
type PaymentMethod = 'TienMat' | 'ChuyenKhoan' | 'The' | 'TienCoc'
type DiscountType = 'PhanTram' | 'SoTien'
type ReservationStatus = 'ChoDen' | 'DaNhanBan' | 'KhongDen' | 'DaHuy'
type ApprovalAction = 'HuyMon' | 'GiamGia'
```

Chữ hiển thị: `CancelReason` → "Khách đổi ý", "Gọi nhầm", "Chờ lâu", "Khác", "Hết món"; `KitchenStation` → "Bếp nóng", "Bếp nguội", "Quầy bar", "Không qua bếp"; `OrderItemStatus` → "Chưa gửi", "Chờ gọi", "Chờ làm", "Đang làm", "Xong", "Đã phục vụ", "Đã hủy". Đặt trong `features/pos/lib/labels.ts` (FE) và trả thêm `reasonText` ở DTO khi cần in.

Tham số ngày `from`, `to` dạng `yyyy-MM-dd`, hiểu theo giờ Việt Nam (từ 00:00 `from` đến 23:59:59 `to`). Khoảng dài hơn 366 ngày → 400 `errors.from` "Khoảng ngày tối đa 366 ngày". `to` nhỏ hơn `from` → 400 `errors.to` "Ngày kết thúc phải sau ngày bắt đầu".

Mọi thao tác thay đổi hóa đơn trả về **200 kèm DTO mới** (không trả 204) để FE thay cache ngay; thao tác cần chống dữ liệu cũ nhận `version` (§3.6), thao tác cần chống bấm lặp nhận `clientRequestId` (§3.7).

### 2.1. Thực đơn gộp — `/api/menu`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/menu` | `orders.create` hoặc `menu-items.view` | Danh mục, món chưa ẩn, ghi chú nhanh trong một lần gọi → `MenuBundle`. Món tạm hết vẫn trả để hiện mờ (FR-09) |

```ts
type MenuBundle = {
  categories: CategoryDto[]        // chưa ẩn, theo sortOrder
  items: MenuItemDto[]             // chưa ẩn, theo (thứ tự danh mục, sortOrder)
  quickNotes: QuickNoteDto[]       // theo sortOrder
}
```

### 2.2. Danh mục — `/api/categories`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/categories` | `menu-items.view` | Tất cả (kể cả ẩn), theo `sortOrder` → `CategoryDto[]` |
| POST | `/api/categories` | `menu-items.create` | → `CategoryDto` (201) |
| PUT | `/api/categories/{id}` | `menu-items.update` | Tên, màu, ẩn/hiện → `CategoryDto` |
| PUT | `/api/categories/order` | `menu-items.update` | `{ ids: string[] }` đủ mọi danh mục theo thứ tự mới, đánh lại 10, 20, 30… → 204; thiếu, thừa id → 400 `errors.ids` |
| DELETE | `/api/categories/{id}` | `menu-items.delete` | Không còn món → 204; còn món → 400 "Danh mục đang có {n} món, chuyển món sang danh mục khác trước" kèm `itemCount` |

```ts
type CategoryDto = {
  id: string; code: string; name: string; color: string
  sortOrder: number; isHidden: boolean
  itemCount: number                // món chưa xóa, kể cả ẩn
}
type SaveCategoryRequest = { code: string; name: string; color: string; isHidden: boolean }
// Trùng code → 409 errors.code "Mã danh mục đã tồn tại"; color sai #RRGGBB → 400 errors.color "Màu dạng #RRGGBB"
```

### 2.3. Món — `/api/menu-items`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/menu-items?page&pageSize&search&categoryId&status&station` | `menu-items.view` | Phân trang; `search` theo mã, tên (không dấu); mặc định `sortBy=sortOrder&sortDir=asc` → `PaginatedResult<MenuItemDto>` |
| GET | `/api/menu-items/{id}` | `menu-items.view` | → `MenuItemDto` |
| POST | `/api/menu-items` | `menu-items.create` | → `MenuItemDto` (201) |
| PUT | `/api/menu-items/{id}` | `menu-items.update` | → `MenuItemDto`; món đã gọi giữ giá lúc gọi (UC-03 5a) |
| PATCH | `/api/menu-items/{id}/availability` | `menu-items.availability` | `{ isSoldOut: boolean }` → 204; phát `menu-changed` (UC-04) |
| PATCH | `/api/menu-items/{id}/hidden` | `menu-items.update` | `{ isHidden: boolean }` → 204 |
| POST | `/api/menu-items/{id}/image` | `menu-items.update` | Multipart field `file`, JPG/PNG/WebP tối đa 2 MB → 200 `{ imageUrl }` |
| DELETE | `/api/menu-items/{id}` | `menu-items.delete` | Chưa từng gọi → 204; đã gọi → 400 "Món đã có trong hóa đơn, chỉ có thể ẩn" (BR-28, TC-05) |

```ts
type MenuItemDto = {
  id: string
  code: string
  name: string
  categoryId: string
  categoryName: string
  imageUrl?: string
  description?: string
  unit: string                     // "đĩa", "nồi", "kg"…
  pricingType: PricingType
  price: number                    // một suất hoặc một kg
  station: KitchenStation
  prepMinutes?: number             // null khi KhongQuaBep
  isSoldOut: boolean
  isHidden: boolean
  status: MenuItemStatus           // An > TamHet > DangBan
  sortOrder: number
  everOrdered: boolean             // đã có trong Pos_OrderItems → FE khóa nút Xóa, gợi ý Ẩn
  updatedAt: string
}

type SaveMenuItemRequest = {
  code: string                     // ^M\d{3}$
  name: string
  categoryId: string
  description?: string
  unit: string                     // TheoTrongLuong thì BE luôn lưu "kg"
  pricingType: PricingType
  price: number
  station: KitchenStation
  prepMinutes?: number             // bắt buộc khi station ≠ KhongQuaBep
  sortOrder?: number               // bỏ trống khi tạo → cuối danh mục
}
```

Lỗi (thứ tự: định dạng 400 → danh mục 400 → trùng mã 409): `code` sai dạng → `errors.code` "Mã món dạng M001"; trùng → 409 `errors.code` "Mã món đã tồn tại"; `price` ≤ 0 → `errors.price` "Đơn giá phải lớn hơn 0"; không bội số 1.000 → `errors.price` "Đơn giá phải là bội số 1.000 ₫" (TC-05); `prepMinutes` ngoài 1–120 → `errors.prepMinutes` "Thời gian chuẩn từ 1 đến 120 phút"; `unit` trống → `errors.unit` "Chọn đơn vị tính"; `categoryId` không có → `errors.categoryId` "Danh mục không tồn tại".

### 2.4. Ghi chú nhanh — `/api/quick-notes`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/quick-notes` | `menu-items.view` hoặc `orders.create` | → `QuickNoteDto[]` theo `sortOrder` |
| POST | `/api/quick-notes` | `menu-items.create` | `{ content }` → `QuickNoteDto` (201); trùng → 409 `errors.content` "Ghi chú đã có"; trống hoặc > 50 ký tự → 400 `errors.content` |
| PUT | `/api/quick-notes/{id}` | `menu-items.update` | `{ content }` → `QuickNoteDto` |
| PUT | `/api/quick-notes/order` | `menu-items.update` | `{ ids: string[] }` → 204 |
| DELETE | `/api/quick-notes/{id}` | `menu-items.delete` | → 204 (xóa cứng) |

```ts
type QuickNoteDto = { id: string; content: string; sortOrder: number }
```

### 2.5. Khu vực — `/api/areas`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/areas?includeHidden` | `tables.view` (`includeHidden=true` cần `tables.update`) | Theo `sortOrder` → `AreaDto[]` |
| POST | `/api/areas` | `tables.create` | → `AreaDto` (201) |
| PUT | `/api/areas/{id}` | `tables.update` | Tên, ẩn/hiện → `AreaDto`; ẩn khi có bàn đang có khách → 400 "Khu vực đang có bàn có khách" |
| PUT | `/api/areas/order` | `tables.update` | `{ ids: string[] }` → 204 |
| DELETE | `/api/areas/{id}` | `tables.delete` | Không còn bàn → 204; còn → 400 "Khu vực đang có {n} bàn" kèm `tableCount` |

```ts
type AreaDto = { id: string; code: string; name: string; sortOrder: number; isHidden: boolean; tableCount: number }
type SaveAreaRequest = { code: string; name: string; isHidden: boolean }
// code ^[A-Z0-9]{2}$ → 400 errors.code "Mã khu vực 2 ký tự chữ in hoa hoặc số"; trùng → 409 errors.code "Mã khu vực đã tồn tại"
// Không đổi code sau khi tạo: code khác hiện tại → 400 errors.code "Không đổi được mã khu vực"
```

### 2.6. Thiết lập bàn — `/api/tables`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/tables?areaId&includeHidden` | `tables.view` (`includeHidden=true` cần `tables.update`) | → `DiningTableDto[]` theo `(khu vực, code)` |
| POST | `/api/tables` | `tables.create` | → `DiningTableDto` (201), `Status = Trong` |
| PUT | `/api/tables/{id}` | `tables.update` | Mã, khu vực, sức chứa, hình dạng → `DiningTableDto` |
| PUT | `/api/tables/layout` | `tables.update` | "Lưu sơ đồ": `{ items: { id, x, y }[] }` → 204 |
| PATCH | `/api/tables/{id}/hidden` | `tables.update` | `{ isHidden: boolean }` → 204 |
| DELETE | `/api/tables/{id}` | `tables.delete` | Xóa mềm → 204 |

```ts
type DiningTableDto = {
  id: string; code: string
  areaId: string; areaCode: string; areaName: string
  capacity: number; shape: TableShape
  x: number; y: number             // ô lưới 12 × 8; Vuong, Tron 2×2 ô; ChuNhat 3×2 ô
  isHidden: boolean
  everUsed: boolean                // đã có hóa đơn
}
type SaveTableRequest = { code: string; areaId: string; capacity: number; shape: TableShape; x: number; y: number }
```

Lỗi: trùng `code` → 409 `errors.code` "Mã bàn đã tồn tại" (TC-02); sai dạng hoặc tiền tố khác mã khu vực → 400 `errors.code` "Mã bàn dạng {mã khu vực}-01"; `capacity` ngoài 1–20 → 400 `errors.capacity` "Sức chứa từ 1 đến 20" (TC-02); `x`, `y` ra ngoài lưới → 400 `errors.x`. Ẩn, xóa, đổi khu vực bàn đang có khách (trạng thái khác `Trong`) → 400 "Bàn đang có khách" (`code: BanDangCoKhach`, BR-28, TC-03). Hai bàn chồng ô không kiểm ở BE (FE bắt ô lưới khi kéo).

### 2.7. Sơ đồ bàn và phục vụ tại bàn — `/api/floor-plan`, `/api/tables/{id}/…`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/floor-plan` | `tables.view` | Khu vực và thẻ bàn (chưa ẩn) kèm trạng thái sống, thanh đếm (FR-04) → `FloorPlanDto`. Cũng dùng cho sơ đồ thu nhỏ khi chuyển, gộp bàn |
| GET | `/api/tables/{id}/service` | `tables.view` hoặc `orders.view` | Màn Gọi món, Thanh toán của bàn → `TableServiceDto`. Bàn `DaGop` trả dữ liệu của **bàn chính** (UC-09 E2) |
| POST | `/api/tables/{id}/open` | `tables.open` | Mở bàn (UC-02) `OpenTableRequest` → `OrderDto` (201); cùng `clientRequestId` → 200 hóa đơn cũ |
| POST | `/api/tables/{id}/clear` | `tables.open` | "Dọn xong": bàn `ChoDon` → `Trong` → `TableCardDto` (FR-31); chỉ đổi bàn được chạm, bàn phụ đã gộp dọn riêng (§5 quyết định 47) |

```ts
type FloorPlanDto = {
  asOf: string                     // giờ máy chủ, FE tính độ lệch đồng hồ
  areas: AreaDto[]                 // chưa ẩn
  tables: TableCardDto[]           // chưa ẩn, mọi khu vực
  counts: Record<TableStatus, number>   // trên mọi bàn chưa ẩn; tổng = totalTables (TC-01: 31)
  totalTables: number
}

type TableCardDto = {
  id: string; code: string
  areaId: string; areaCode: string
  capacity: number; shape: TableShape; x: number; y: number
  status: TableStatus              // DaDat suy ra theo §3.9
  orderIds: string[]               // hóa đơn đang mở của bàn (sau khi tách có nhiều); bàn DaGop → []
  guestCount?: number              // Σ khách các hóa đơn đang mở (bàn chính đã gồm khách bàn phụ)
  openedAt?: string                // giờ mở sớm nhất → FE hiện "thời gian ngồi"
  waiterId?: string; waiterName?: string
  subtotal?: number                // tạm tính = Σ tiền món các hóa đơn đang mở (BR-05)
  readyCount: number               // số dòng món "Xong" chờ ra (FR-19)
  hasLateItems: boolean            // có món trễ (BR-11, FR-17)
  unsentCount: number              // số dòng "Chưa gửi"
  isLocked: boolean                // có hóa đơn đang thu tiền (BR-22)
  mergedIntoTableId?: string; mergedIntoTableCode?: string   // bàn DaGop: "Đã gộp → T1-05"
  mergedTableCodes: string[]       // bàn chính: các bàn phụ
  lastPaidOrderId?: string         // bàn ChoDon: hóa đơn vừa thu, để in lại
  reservation?: TableReservationInfo
}

type TableReservationInfo = {      // đặt bàn ChoDen gần nhất hôm nay chưa quá giờ đến + 30 phút
  id: string; code: string; customerName: string
  arrivalAt: string; guestCount: number; deposit: number; note?: string
  isLate: boolean                  // quá giờ đến 15 phút
}

type TableServiceDto = {
  table: TableCardDto              // bàn chính nếu id là bàn phụ
  viewedTableId: string            // id trên URL (khác table.id khi mở bàn phụ)
  orders: OrderDto[]               // hóa đơn đang mở, theo mã; hiện thành tab khi > 1 (UC-10 bước 5)
}

type OpenTableRequest = {
  guestCount: number               // 1–50 → 400 errors.guestCount "Số khách từ 1 đến 50" (TC-09)
  clientRequestId: string
}
```

Mở bàn: chỉ khi `Trong` hoặc `DaDat` (BR-01). Sức chứa nhỏ hơn số khách chỉ là cảnh báo ở FE ("Bàn 4 chỗ, đang mở cho 7 khách"), BE không chặn. Bàn đã có người mở trước → **409** "Bàn {mã} vừa được mở bởi {họ tên}" (`code: BanVuaDuocMo`, kèm `orderId`), FE thông báo rồi vào màn Gọi món của hóa đơn đó (UC-02 E3). Bàn `ChoDon` → 400 "Bàn chưa dọn xong" (`code: BanChoDon`). `clear` bàn không ở `ChoDon` → 400 "Bàn không ở trạng thái chờ dọn".

### 2.8. Hóa đơn và món gọi — `/api/orders`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/orders?page&pageSize&search&tableId&from&to&status&paymentMethod` | `orders.view` | Tra cứu (FR-33). `search` theo mã hóa đơn; ngày lọc theo `openedAt`; không gửi `from`, `to` → hôm nay; mặc định `sortBy=openedAt&sortDir=desc`. Không có `orders.checkout` → chỉ `DangMo`, `DangThu` → `PaginatedResult<OrderListItem>` |
| GET | `/api/orders/{id}` | `orders.view` | → `OrderDto`; không có `orders.checkout` mà hóa đơn đã đóng → 403 |
| POST | `/api/orders/{id}/items` | `orders.create` | Thêm món "Chưa gửi" `AddItemRequest` → `OrderDto` |
| PUT | `/api/orders/{id}/items/{itemId}` | `orders.create` | Sửa món "Chưa gửi" `UpdateDraftItemRequest` → `OrderDto` |
| DELETE | `/api/orders/{id}/items/{itemId}` | `orders.create` | Xóa món "Chưa gửi", không lưu (BR-13, TC-25) → 200 `OrderDto` |
| POST | `/api/orders/{id}/send` | `orders.create` | Gửi bếp (FR-13) `SendToKitchenRequest` → `SendResultDto` |
| POST | `/api/orders/{id}/items/{itemId}/serve` | `orders.create` | "Đã ra" một dòng → `OrderDto` |
| POST | `/api/orders/{id}/serve-all` | `orders.create` | "Ra hết": mọi dòng "Xong" → `OrderDto` |
| POST | `/api/orders/{id}/items/{itemId}/unserve` | `orders.create` | Hoàn tác "Đã ra" trong 60 giây → `OrderDto`; quá hạn → 400 "Hết thời gian hoàn tác" |
| POST | `/api/orders/{id}/items/{itemId}/cancel` | `order-items.cancel` | Hủy món đã gửi (UC-08) `CancelItemRequest` → `OrderDto` |
| POST | `/api/orders/{id}/close` | `tables.open` | Đóng bàn mở nhầm `{ version }` → `OrderDto` (`DaHuy`, "Mở nhầm"; BR-03, TC-10) |

```ts
type OrderItemDto = {
  id: string
  menuItemId: string
  itemCode: string
  itemName: string
  unit: string
  pricingType: PricingType
  station: KitchenStation
  unitPrice: number
  quantity: number                 // kg với TheoTrongLuong
  lineTotal: number                // §3.1
  note?: string
  quickNotes: string[]
  isRush: boolean
  status: OrderItemStatus
  batchNo?: number                 // lần gọi
  kitchenTicketId?: string
  kitchenTicketCode?: string       // "#087"
  prepMinutes?: number             // thời gian chuẩn chụp lúc gửi
  sentAt?: string; startedAt?: string; doneAt?: string; servedAt?: string
  isLate: boolean                  // ChoLam/DangLam và (asOf − sentAt) ≥ prepMinutes
  isSoldOut: boolean               // chỉ ý nghĩa với ChuaGui: món vừa tạm hết (UC-04 E2) → FE nhãn đỏ "Tạm hết"
  cancel?: {
    reason: CancelReason
    reasonText: string             // "Chờ lâu" hoặc "Khác: {ghi chú}"
    note?: string
    cancelledAt: string
    cancelledByName: string
    cancelledByUsername: string
    approvedByUsername?: string
    statusAtCancel: OrderItemStatus
    acknowledged: boolean          // bếp đã bấm "Đã biết"
  }
}

type PaymentDto = {
  id: string
  method: PaymentMethod
  amount: number
  cashReceived?: number
  changeAmount?: number
  cardLast4?: string
  shareNo?: number
  qrContent?: string
  paidAt: string
  cashierName?: string
}

type OrderDto = {
  id: string
  code: string
  status: OrderStatus
  version: number                  // §3.6
  tableId: string; tableCode: string; areaName: string
  mergedTableCodes: string[]       // bàn phụ đã gộp vào
  mergedIntoOrderId?: string; mergedIntoTableCode?: string   // khi DaGop
  splitFromOrderId?: string; splitFromCode?: string
  reservationId?: string; reservationCode?: string
  waiterId: string; waiterName: string
  guestCount: number
  note?: string
  openedAt: string
  batchCount: number
  prebillPrintedAt?: string        // null = chưa in hoặc tạm tính đã hết hiệu lực
  items: OrderItemDto[]            // theo sortOrder, gồm cả món ChuaGui và DaHuy
  subtotal: number                 // tiền món (§3.2)
  discount?: { type: DiscountType; value: number; amount: number; reason: string; approvedByUsername?: string }
  serviceChargeRate: number; serviceCharge: number
  vatRate: number; vatAmount: number
  grossTotal: number               // trước làm tròn = subtotal − discount + serviceCharge + vatAmount
  rounding: number                 // total − grossTotal, có thể âm
  total: number
  deposit: number
  depositRefund: number
  paidAmount: number               // Σ payments.amount (gồm tiền cọc)
  remaining: number                // max(0, total − paidAmount)
  splitCount?: number
  shares?: { no: number; amount: number; paid: boolean }[]   // khi chia đều (§3.5)
  payments: PaymentDto[]           // theo paidAt
  counts: {
    unsent: number                 // dòng ChuaGui
    pending: number                // dòng ChoLam + DangLam (cảnh báo "Còn {n} món bếp chưa xong")
    ready: number                  // dòng Xong
    late: number
  }
  isLocked: boolean                // có lượt thu không phải tiền cọc (BR-22)
  paidAt?: string
  cashierName?: string
  cancelledAt?: string; cancelledByUsername?: string; cancelReason?: string
  asOf: string
}

type OrderListItem = {
  id: string; code: string; status: OrderStatus
  tableCode: string; areaName: string
  guestCount: number
  waiterName: string; cashierName?: string
  openedAt: string; paidAt?: string
  itemCount: number                // số dòng không hủy, không ChuaGui
  subtotal: number; discountAmount: number; total: number
  paymentMethods: PaymentMethod[]  // khác nhau, theo thứ tự thu
  splitFromCode?: string
  cancelReason?: string
}

type AddItemRequest = {
  menuItemId: string
  quantity: number                 // TheoSuat 1–99 nguyên; TheoTrongLuong 0,1–20 bước 0,1
  note?: string                    // ≤ 200 ký tự
  quickNotes?: string[]            // nội dung ghi chú nhanh
  isRush?: boolean
}
type UpdateDraftItemRequest = { quantity: number; note?: string; quickNotes?: string[]; isRush: boolean }

type SendToKitchenRequest = {
  clientRequestId: string          // §3.7
  version: number
}
type SendResultDto = {
  order: OrderDto
  tickets: { id: string; code: string; station: KitchenStation }[]   // "Đã gửi 2 phiếu: Bếp nóng, Bếp nguội"
  directItemCount: number          // dòng không qua bếp chuyển thẳng "Xong"
  skippedSoldOutItemIds: string[]  // dòng tạm hết giữ lại ở "Chưa gửi bếp" (UC-04 E2)
  prebillInvalidated: boolean      // true → FE báo "Phiếu tạm tính đã in hết hiệu lực" (TC-39)
}

type CancelItemRequest = {
  quantity: number                 // ≤ số lượng dòng; TheoTrongLuong phải bằng nguyên dòng
  reason: Exclude<CancelReason, 'HetMon'>
  note?: string                    // bắt buộc khi Khac
  approvalToken?: string           // §2.12, cần khi món DangLam/Xong/DaPhucVu và người gọi không có order-items.void-approve
  version: number
}
```

**Thêm món**: món ẩn hoặc không tồn tại → 400 `errors.menuItemId` "Món không còn trong thực đơn"; tạm hết → 400 "{tên món} đang tạm hết" (`code: MonTamHet`, UC-05 E1); số lượng sai → 400 `errors.quantity` "Số lượng từ 1 đến 99" hoặc "Trọng lượng từ 0,1 đến 20 kg" (TC-14). Món theo suất trùng một dòng "Chưa gửi" có cùng món, cùng `note`, cùng tập `quickNotes`, cùng `isRush` → cộng số lượng vào dòng đó (UC-05 2a); món theo trọng lượng luôn thành dòng mới. Hóa đơn bị khóa → 400 "Hóa đơn đang thu tiền". Bàn `ChoThanhToan` thêm món nháp **không** đổi trạng thái; chỉ khi gửi bếp mới về `DangPhucVu`.

**Gửi bếp** (BR-09, BR-21): gửi mọi dòng `ChuaGui` chưa tạm hết. Không còn dòng nào gửi được → 400 "Chưa có món mới để gửi bếp" (`code: KhongCoMonMoi`). Kết quả: `batchCount + 1`; mỗi khu chế biến có món tạo một phiếu `DangCho`; dòng `KhongQuaBep` → `Xong` với `doneAt = sentAt`; dòng khác → `ChoLam`; `prebillPrintedAt` về null và bàn `ChoThanhToan` → `DangPhucVu`. Phát `kitchen-changed` (kèm `newTicketIds` để màn bếp phát âm), `order-changed`, `tables-changed`.

**Hủy món** (BR-13): `ChuaGui` → 400 "Món chưa gửi bếp, xóa trực tiếp"; `DaHuy` → 400 "Món đã hủy trước đó"; `ChoLam` → hủy ngay; `DangLam`, `Xong`, `DaPhucVu` mà người gọi không có `order-items.void-approve` và không có `approvalToken` hợp lệ → 400 "Món bếp đã làm, cần quản lý xác nhận" (`code: CanQuanLyDuyet`); người gọi có quyền duyệt thì ghi chính họ là người duyệt, không xét token (§5 quyết định 49). Thiếu lý do → 400 `errors.reason` "Chọn lý do hủy"; `Khac` thiếu ghi chú → 400 `errors.note` "Nhập ghi chú cho lý do Khác"; hủy một phần món theo trọng lượng → 400 `errors.quantity` "Món theo trọng lượng chỉ hủy nguyên dòng". Hủy một phần → tách dòng (06 §4). Món qua bếp bị hủy (kể cả món đã phục vụ) đưa phiếu về `DangCho` cho tới khi bếp bấm "Đã biết" (TC-23); món không qua bếp hủy thì tự "Đã biết" (§5 quyết định 48).

**Đóng bàn mở nhầm**: chỉ khi hóa đơn không có dòng nào khác `ChuaGui` (dòng nháp bị xóa theo); có → 400 "Bàn đã gửi bếp, không đóng được" (UC-02 E4). Bàn về `Trong`.

### 2.9. Chuyển bàn, gộp bàn, chuyển món

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| POST | `/api/orders/{id}/transfer` | `tables.transfer` | `{ targetTableId, version }` → `OrderDto` (FR-22, BR-15) |
| POST | `/api/orders/{id}/merge` | `tables.transfer` | `{ sourceTableIds: string[], version }` gộp các bàn vào bàn của hóa đơn này → `OrderDto` (FR-23, BR-16) |
| POST | `/api/orders/{id}/move-items` | `tables.transfer` | `MoveItemsRequest` → `MoveItemsResultDto` (FR-24, BR-17) |

```ts
type MoveItemsRequest = {
  targetTableId: string
  items: { itemId: string; quantity: number }[]   // TheoTrongLuong phải nguyên dòng
  version: number
}
type MoveItemsResultDto = { source: OrderDto; target: OrderDto }
```

- **Chuyển bàn**: bàn đích `Trong` hoặc `DaDat`, khác → 400 "Chỉ chuyển sang bàn đang trống" (`code: BanDichKhongHopLe`). Hóa đơn giữ mã, món, trạng thái món; mọi phiếu bếp `DangCho` đang ở bàn cũ (kể cả phiếu của hóa đơn gốc đã tách, của bàn phụ đã gộp) và phiếu `DaXong` của chính hóa đơn này đổi `tableId`, `tableCode` sang bàn mới (giữ `originalTableCode`; §5 quyết định 46); bàn phụ đang gộp vào bàn cũ đổi `mergedIntoTableId` theo; bàn cũ → `Trong`. Cảnh báo "Bàn có khách đặt lúc 19:00" là việc của FE dựa trên `TableCardDto.reservation` (TC-27), BE không chặn.
- **Gộp bàn**: bàn nguồn và bàn chính đều `DangPhucVu` hoặc `ChoThanhToan`, khác → 400 "Chỉ gộp bàn đang phục vụ hoặc chờ thanh toán". Món (kể cả nháp), số khách, tiền cọc và lượt thu "Tiền cọc" của hóa đơn bàn nguồn chuyển sang hóa đơn chính; hóa đơn nguồn → `DaGop` (`mergedIntoOrderId`, `mergedAt`); bàn nguồn → `DaGop`; phiếu bếp `DangCho` ở bàn nguồn và phiếu `DaXong` của hóa đơn nguồn đổi bàn sang bàn chính (cùng quy tắc chuyển bàn); bàn chính `ChoThanhToan` → `DangPhucVu`, `prebillPrintedAt` về null. Không có thao tác tách bàn sau khi gộp.
- **Chuyển món**: bàn đích `DangPhucVu` hoặc `ChoThanhToan` (khác → 400 "Bàn nhận món phải đang phục vụ hoặc chờ thanh toán"); món vào hóa đơn đang mở mở sớm nhất của bàn đích, giữ trạng thái chế biến; dòng `DaHuy` không chuyển được. Bàn đích `ChoThanhToan` → `DangPhucVu`. Phiếu bếp giữ bàn cũ, dòng món đã chuyển hiện "→ {bàn mới}" (`KitchenTicketItemDto.movedToTableCode`).
- Cả ba: hóa đơn (nguồn, đích) đã khóa → 400 "Hóa đơn đang thu tiền" (BR-22, TC-33); bàn đang có nhiều hóa đơn (đã tách) → 400 "Bàn đang tách hóa đơn, không chuyển hoặc gộp được" (`code: BanDangTachHoaDon`).

### 2.10. Màn hình bếp — `/api/kitchen-tickets`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/kitchen-tickets?station&view` | `kitchen-tickets.view` | `station` bỏ trống = Tất cả; `view=DangCho` (mặc định): phiếu `DangCho` sắp theo BR-12; `view=DaXong`: phiếu `DaXong` hôm nay, `completedAt` mới nhất trước, tối đa 50 → `KitchenBoardDto` |
| GET | `/api/kitchen-tickets/summary?station` | `kitchen-tickets.view` | Chế độ tổng hợp (FR-18) → `KitchenSummaryItem[]` |
| POST | `/api/kitchen-tickets/{id}/items/{itemId}/start` | `kitchen-tickets.update` | `ChoLam` → `DangLam` → `KitchenTicketDto` |
| POST | `/api/kitchen-tickets/{id}/items/{itemId}/done` | `kitchen-tickets.update` | `ChoLam`/`DangLam` → `Xong` → `KitchenTicketDto` |
| POST | `/api/kitchen-tickets/{id}/done-all` | `kitchen-tickets.update` | "Xong cả phiếu" (UC-06 4a) → `KitchenTicketDto` |
| POST | `/api/kitchen-tickets/{id}/items/{itemId}/undo` | `kitchen-tickets.update` | Hoàn tác `Xong` → `DangLam` (BR-10) → `KitchenTicketDto` |
| POST | `/api/kitchen-tickets/{id}/items/{itemId}/out-of-stock` | `kitchen-tickets.update` | Báo hết món đang `ChoLam` (FR-10, BR-14) → `KitchenTicketDto` |
| POST | `/api/kitchen-tickets/{id}/items/{itemId}/acknowledge` | `kitchen-tickets.update` | "Đã biết" món hủy (BR-13) → `KitchenTicketDto` |

```ts
type KitchenBoardDto = {
  asOf: string                     // giờ máy chủ để FE tính màu (§3.8)
  tickets: KitchenTicketDto[]
}

type KitchenTicketDto = {
  id: string
  code: string                     // "#087"
  station: Exclude<KitchenStation, 'KhongQuaBep'>
  batchNo: number                  // "Lần 2"
  orderId: string; orderCode: string
  tableCode: string                // bàn hiện tại
  fromTableCode?: string           // khác bàn lúc gửi → "T1-10 (từ SV-01)" (TC-26)
  waiterName: string
  sentAt: string
  status: KitchenTicketStatus
  isRush: boolean                  // có món Gấp → nhãn "GẤP", xếp trước (BR-12)
  hasUnacknowledgedCancel: boolean // viền đỏ tới khi "Đã biết"
  completedAt?: string
  items: KitchenTicketItemDto[]    // theo sortOrder
}

type KitchenTicketItemDto = {
  id: string                       // = OrderItemDto.id
  menuItemId: string
  itemName: string
  quantity: number; unit: string; pricingType: PricingType
  note?: string; quickNotes: string[]; isRush: boolean
  status: OrderItemStatus          // ChoLam | DangLam | Xong | DaPhucVu | DaHuy
  prepMinutes: number
  startedAt?: string; doneAt?: string
  cancel?: { reasonText: string; acknowledged: boolean }
  movedToTableCode?: string        // đã chuyển món sang bàn khác
}

type KitchenSummaryItem = {
  menuItemId: string; itemName: string; unit: string; station: KitchenStation
  totalQuantity: number            // Σ số lượng dòng ChoLam + DangLam (vd Rau muống: 5)
  lines: { ticketId: string; ticketCode: string; tableCode: string; itemId: string
           quantity: number; status: OrderItemStatus; sentAt: string; isRush: boolean }[]   // theo sentAt
}
```

Lỗi: `start` món không `ChoLam` → 400 "Món không ở trạng thái chờ làm"; `done` món không `ChoLam`/`DangLam` → 400 "Món không ở trạng thái chờ làm hoặc đang làm"; `undo` món `DaPhucVu` → 400 "Món đã ra cho khách" (`code: MonDaRa`, UC-06 E2, TC-20), món khác `Xong` → 400 "Chỉ hoàn tác món đã xong"; `out-of-stock` món khác `ChoLam` → 400 "Chỉ báo hết món đang chờ làm" (UC-04 E1), hóa đơn khóa → 400 "Hóa đơn đang thu tiền"; `itemId` không thuộc phiếu → 404.

`out-of-stock`: món → `DaHuy`, lý do `HetMon`, người hủy là bếp, không cần duyệt; món trong thực đơn → `IsSoldOut = true`; phát `item-out-of-stock` cho phục vụ của bàn với câu "{mã bàn}: {tên món} đã hết, mời khách đổi món" (TC-07). Mọi thao tác bếp không đổi `version` của hóa đơn, trừ `out-of-stock` (đổi tiền món).

### 2.11. Món chờ ra — `/api/ready-items`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/ready-items?mine` | `orders.create` | Dòng món `Xong` gom theo bàn, bàn có món xong sớm nhất trước (UC-07); `mine=true` (mặc định FE) chỉ hóa đơn có `waiterId` là người gọi → `ReadyGroupDto[]` |

```ts
type ReadyGroupDto = {
  tableId: string; tableCode: string
  orderId: string; orderCode: string
  waiterId: string; waiterName: string
  items: { itemId: string; itemName: string; quantity: number; unit: string; note?: string; doneAt: string }[]   // theo doneAt
}
```

### 2.12. Quản lý xác nhận — `/api/approvals`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| POST | `/api/approvals` | `order-items.cancel` (với `HuyMon`) hoặc `orders.discount` (với `GiamGia`) | Quản lý nhập tài khoản ngay trên tablet (SCR-07) → `ApprovalDto` |

```ts
type ApprovalRequest = { username: string; password: string; action: ApprovalAction }
type ApprovalDto = {
  token: string                    // chuỗi ngẫu nhiên, BE giữ trong IMemoryCache 5 phút, dùng một lần, gắn với action
  approvedById: string
  approvedByUsername: string       // ghi vào món hủy, hóa đơn (TC-24, TC-38)
  expiresAt: string
}
```

BE kiểm mật khẩu như đăng nhập nhưng **không** tạo phiên, không ghi `LastLoginAt`, vẫn đếm sai mật khẩu theo BR-SYS-03 (chung bộ đếm với đăng nhập): sai lần thứ 5 liên tiếp → 400 "Tài khoản tạm khóa đăng nhập, thử lại sau 5 phút"; đang tạm khóa thì không kiểm mật khẩu, trả câu đó với số phút còn lại; xác nhận đúng không xóa bộ đếm (§5 quyết định 51). Sai tên hoặc mật khẩu → **400** "Tên đăng nhập hoặc mật khẩu không đúng" (không dùng 401 để `lib/axios.ts` không làm mới token của người đang đăng nhập). Tài khoản đúng nhưng thiếu quyền: `HuyMon` cần `order-items.void-approve` → **403** "Tài khoản không có quyền duyệt hủy món" (TC-24 bước 2); `GiamGia` cần `orders.discount-override` → **403** "Tài khoản không có quyền xác nhận giảm giá". Tài khoản bị khóa → 400 "Tài khoản đã bị khóa, liên hệ quản trị viên". Token sai, hết hạn, đã dùng hoặc sai action khi gửi kèm thao tác → 400 "Mã xác nhận của quản lý không hợp lệ, xác nhận lại" (`code: MaXacNhanKhongHopLe`).

### 2.13. Tạm tính, giảm giá, tách hóa đơn, chia đều

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| POST | `/api/orders/{id}/prebill` | `orders.prebill` | In tạm tính `{ version }` → `OrderDto`; đặt `prebillPrintedAt`, bàn → `ChoThanhToan` (FR-27, TC-34) |
| PUT | `/api/orders/{id}/discount` | `orders.discount` | `DiscountRequest` → `OrderDto` (FR-29, BR-08) |
| DELETE | `/api/orders/{id}/discount?version` | `orders.discount` | Gỡ giảm giá → `OrderDto` |
| POST | `/api/orders/{id}/split` | `orders.split` | Tách theo món `SplitOrderRequest` → `OrderDto[]` (hóa đơn gốc trước, rồi các hóa đơn mới) (FR-25, BR-18) |
| POST | `/api/orders/{id}/split-equal` | `orders.split` | `{ count: number; version: number }` → `OrderDto` có `shares` (FR-26, BR-19) |
| DELETE | `/api/orders/{id}/split-equal?version` | `orders.split` | Hủy chia đều → `OrderDto` |

```ts
type DiscountRequest = {
  type: DiscountType
  value: number                    // PhanTram 1–100; SoTien > 0, bội số 1.000
  reason: string                   // "Khách quen", "Món ra chậm", "Khác: …"; bắt buộc, ≤ 200 ký tự
  approvalToken?: string           // khi vượt hạn mức (§3.3)
  version: number
}

type SplitOrderRequest = {
  parts: { items: { itemId: string; quantity: number }[] }[]   // mỗi phần thành một hóa đơn mới (cột 2, 3…)
  version: number
}
```

- **Tạm tính và thanh toán bị chặn** khi còn dòng `ChuaGui` → 400 "Còn {n} món chưa gửi bếp" (`code: ConMonChuaGui`, kèm `unsentCount`; BR-21, TC-36). Hóa đơn chưa có món nào đã gửi → 400 "Hóa đơn chưa có món". Còn món `ChoLam`/`DangLam` thì FE hỏi xác nhận "Còn {n} món bếp chưa xong" (dựa trên `counts.pending`), BE không chặn.
- **Giảm giá**: vượt hạn mức mà không có token hợp lệ và người gọi không có `orders.discount-override` → 400 "Giảm giá vượt hạn mức {hạn mức}%, cần quản lý xác nhận" (`code: VuotHanMucGiamGia`, kèm `discountLimit` là số tiền tối đa, `requestedDiscount`). `value` sai → 400 `errors.value` "Phần trăm từ 1 đến 100" hoặc "Số tiền là bội số 1.000 ₫"; thiếu lý do → 400 `errors.reason` "Chọn lý do giảm giá". Mỗi hóa đơn một khoản: PUT mới thay khoản cũ.
- **Tách theo món**: dòng phải đã gửi (không `ChuaGui`, không `DaHuy`); dòng có số lượng > 1 tách một phần theo số nguyên; món theo trọng lượng chỉ nguyên dòng → 400 `errors["parts[i].items[j].quantity"]` "Món theo trọng lượng chỉ tách nguyên dòng"; hóa đơn gốc phải còn ít nhất 1 dòng không hủy → 400 "Hóa đơn gốc phải còn ít nhất 1 món" (`code: HoaDonGocHetMon`, TC-31); số hóa đơn đang mở của bàn sau khi tách > 10 → 400 "Tối đa 10 hóa đơn mỗi bàn"; hóa đơn đang chia đều → 400 "Hóa đơn đang chia đều, hủy chia đều trước khi tách". Hóa đơn mới: mã mới, cùng bàn, cùng phục vụ, `guestCount = 0`, `splitFromOrderId` = gốc, giữ `openedAt`, `prebillPrintedAt` (và số lần gọi) của gốc (§5 quyết định 44). Giảm giá của gốc bị gỡ (FE cảnh báo trước "Giảm giá sẽ bị gỡ, cần áp lại sau khi tách"). Số khách, tiền cọc ở lại gốc.
- **Chia đều**: `count` ngoài 2–20 → 400 `errors.count` "Số người từ 2 đến 20" (UC-10 E4); đặt lại `count` khi đã có lượt thu, hủy chia đều khi đã thu phần nào → 400 "Hóa đơn đang thu tiền" (TC-33). Không đổi món, chỉ lưu `splitCount`; `shares` tính theo §3.5 ở mỗi lần đọc.
- Mọi thao tác ở mục này trên hóa đơn đã khóa → 400 "Hóa đơn đang thu tiền" (`code: HoaDonDangThuTien`).

### 2.14. Thu tiền, tra cứu, hủy hóa đơn

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| POST | `/api/orders/{id}/payments` | `orders.checkout` | Ghi một lượt thu `CreatePaymentRequest` → `PaymentResultDto` (201; cùng `clientRequestId` → **200** kết quả cũ) (FR-30, FR-31, BR-20) |
| POST | `/api/orders/{id}/complete` | `orders.checkout` | Chốt hóa đơn đã đủ tiền nhờ tiền cọc (`remaining = 0` từ trước) `{ version }` → `OrderDto`; hóa đơn đã `DaThanhToan` → 200 như cũ |
| POST | `/api/orders/{id}/cancel` | `orders.cancel` | Hủy hóa đơn đã thanh toán `{ reason }` → `OrderDto` (FR-33, BR-23, TC-40) |

```ts
type CreatePaymentRequest = {
  clientRequestId: string          // §3.7
  version: number
  method: Exclude<PaymentMethod, 'TienCoc'>
  amount?: number                  // bắt buộc với ChuyenKhoan, The: 0 < amount ≤ remaining (hoặc = tiền của phần)
  cashReceived?: number            // bắt buộc với TienMat: tiền khách đưa
  allowPartial?: boolean           // TienMat ít hơn số còn phải thu: thu ngân đã xác nhận "Thu một phần" (UC-11 E4)
  cardLast4?: string               // bắt buộc với The, 4 chữ số
  shareNo?: number                 // bắt buộc khi hóa đơn đang chia đều
  qrContent?: string               // chuỗi QR đã hiện (ChuyenKhoan)
}

type PaymentResultDto = {
  order: OrderDto
  payment: PaymentDto
  changeAmount: number             // tiền thối (TienMat), 0 với phương thức khác
  completed: boolean               // true → FE mở bản in hóa đơn, bàn đã ChoDon
}
```

Thứ tự kiểm tra và câu lỗi của thu tiền (400 trừ khi ghi khác):

| Thứ tự | Tình huống | `detail` | Ghi chú |
| :---: | :--- | :--- | :--- |
| 1 | Cùng `clientRequestId` đã ghi | **200** trả `PaymentResultDto` cũ | Không xét `version` (TC-35, UC-11 E5) |
| 2 | Hóa đơn `DaThanhToan`, `DaGop`, `DaHuy` | "Hóa đơn đã đóng" | |
| 3 | `version` lệch | **409** "Bàn vừa được cập nhật, đang tải lại" | §3.6 |
| 4 | Còn dòng `ChuaGui` | "Còn {n} món chưa gửi bếp" | BR-21 |
| 5 | Thiếu trường theo phương thức | `errors.amount` / `errors.cashReceived` "Nhập tiền khách đưa" / `errors.cardLast4` "Nhập 4 số cuối thẻ" | |
| 6 | Đang chia đều mà thiếu `shareNo`, phần không tồn tại hoặc đã thu | `errors.shareNo` "Chọn phần cần thu" / "Phần {n} đã thu" | BR-19 |
| 7 | `ChuyenKhoan`, `The` vượt số còn phải thu (hoặc khác tiền của phần) | "Số tiền vượt số còn phải thu {remaining}" / "Phần {n} cần thu {amount}" | `errors.amount`, UC-11 E3; số tiền định dạng `208.000 ₫` |
| 8 | `TienMat` ít hơn số cần thu mà không `allowPartial` (hoặc đang thu một phần chia đều) | "Tiền khách đưa ít hơn số còn phải thu" / "Phần {n} cần thu {amount}" | `errors.cashReceived`, `code: TienMatThieu` (chia đều: `SaiTienPhan`, §5 quyết định 34) |

Lượt thu đầu tiên không phải tiền cọc chốt tỉ lệ phí phục vụ, thuế suất và khóa hóa đơn (`DangThu`, BR-22). Số còn phải thu về 0 → `DaThanhToan`, `paidAt`, thu ngân, bàn → `ChoDon` khi bàn không còn hóa đơn đang mở; mọi bàn phụ `DaGop` của bàn đó cũng → `ChoDon` (BR-16, TC-29). Phát `order-changed`, `tables-changed`.

Hủy hóa đơn: chỉ `DaThanhToan` có `paidAt` cùng ngày hôm nay (giờ Việt Nam) → khác 400 "Chỉ hủy được hóa đơn thanh toán trong ngày"; đã hủy → 400 "Hóa đơn đã hủy trước đó"; thiếu lý do → 400 `errors.reason` "Nhập lý do hủy". Hóa đơn → `DaHuy`, không đổi trạng thái bàn, không xóa lượt thu, không tính doanh thu (BR-23, BR-26).

### 2.15. Đặt bàn — `/api/reservations`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/reservations?page&pageSize&search&from&to&status&tableId` | `reservations.view` | `search` theo tên, SĐT, mã; lọc theo ngày `arrivalAt`; mặc định `sortBy=arrivalAt&sortDir=asc`; không gửi `from`, `to` → mọi ngày (§5 quyết định 50). Dòng thời gian một ngày: `from=to=ngày&pageSize=100` → `PaginatedResult<ReservationDto>` |
| GET | `/api/reservations/{id}` | `reservations.view` | → `ReservationDto` |
| GET | `/api/reservations/available-tables?arrivalAt&guestCount&excludeId` | `reservations.create` hoặc `reservations.update` | Bàn chưa ẩn, sức chứa ≥ số khách, không trùng khung 120 phút, theo sức chứa tăng dần (UC-13 bước 2) → `DiningTableDto[]` |
| POST | `/api/reservations` | `reservations.create` | → `ReservationDto` (201), `ChoDen` |
| PUT | `/api/reservations/{id}` | `reservations.update` | Chỉ khi `ChoDen` → `ReservationDto` |
| POST | `/api/reservations/{id}/cancel` | `reservations.delete` | `{ reason: string }` → `ReservationDto` (`DaHuy`) |
| POST | `/api/reservations/{id}/check-in` | `reservations.check-in` | Nhận bàn (FR-36) `{ clientRequestId: string; guestCount?: number }` → `OrderDto` (201) |

```ts
type ReservationDto = {
  id: string; code: string
  customerName: string; phone: string
  arrivalAt: string
  holdUntil: string                // arrivalAt + 120 phút
  guestCount: number
  tableId: string; tableCode: string; areaName: string
  note?: string
  deposit: number
  status: ReservationStatus        // KhongDen áp lười khi quá giờ đến 30 phút (06 §4)
  isLate: boolean                  // ChoDen và quá giờ đến 15 phút → nhãn "Trễ"
  orderId?: string; orderCode?: string; checkedInAt?: string
  cancelledAt?: string; cancelledByName?: string; cancelReason?: string
  createdAt: string
}

type SaveReservationRequest = {
  customerName: string             // bắt buộc → errors.customerName "Nhập tên khách"
  phone: string                    // 10 số, bắt đầu 0 → errors.phone "Số điện thoại không hợp lệ"
  arrivalAt: string                // ISO UTC
  guestCount: number               // 1–50 → errors.guestCount "Số khách từ 1 đến 50"
  tableId: string
  note?: string                    // ≤ 500
  deposit: number                  // 0–5.000.000, bội số 1.000 → errors.deposit "Tiền cọc từ 0 đến 5.000.000 ₫, bội số 1.000 ₫"
}
```

Lỗi (BR-24): giờ đến ngoài giờ mở cửa → 400 `errors.arrivalAt` "Giờ đến trong giờ mở cửa 10:00–22:00" (giờ theo `Store.OpenTime`, `Store.CloseTime`; giờ đóng cửa được nhận); sớm hơn hiện tại + 30 phút → 400 `errors.arrivalAt` "Giờ đến phải sau hiện tại ít nhất 30 phút"; trùng khung với đặt bàn `ChoDen` hoặc `DaNhanBan` khác cùng bàn (`|a − b| < 120 phút`) → **409** `errors.tableId` "Bàn {mã} đã được giữ từ {HH:mm} đến {HH:mm}" (`code: TrungDatBan`, TC-41: 19:00 giữ tới 21:00, 20:00 trùng, 21:00 được). Sức chứa nhỏ hơn số khách chỉ cảnh báo ở FE. Sửa, hủy, nhận bàn đặt bàn không `ChoDen` → 400 "Đặt bàn không còn ở trạng thái chờ đến".

Nhận bàn: chỉ đặt bàn `ChoDen` có giờ đến trong hôm nay; bàn phải `Trong` hoặc `DaDat` (khác → 400 "Bàn {mã} đang có khách, chuyển đặt bàn sang bàn khác"). Tạo hóa đơn như mở bàn với `guestCount` (mặc định số khách đặt), `note`, `deposit`, `reservationId`, kèm lượt thu `TienCoc` với `amount` = toàn bộ `deposit` khi `deposit > 0`; đặt bàn → `DaNhanBan`, `orderId`, `checkedInAt` (TC-42).

### 2.16. Báo cáo — `/api/reports`

Quyền `reports.view`. Doanh thu chỉ tính hóa đơn `DaThanhToan` theo `paidAt` (BR-26). Không gửi `from`, `to` → 30 ngày tới hôm nay.

| Method | Đường dẫn | Mô tả |
| :--- | :--- | :--- |
| GET | `/api/reports/dashboard` | Tổng quan hôm nay (FR-01) → `DashboardReport` |
| GET | `/api/reports/revenue?from&to` | Doanh thu theo ngày, so kỳ liền trước cùng độ dài (FR-37) → `RevenueReport` |
| GET | `/api/reports/top-items?from&to&categoryId&sortBy&limit` | Món bán chạy (FR-38); `sortBy=quantity` (mặc định) hoặc `revenue`; `limit` mặc định 20 → `TopItemsReport` |
| GET | `/api/reports/voided-items?from&to&reason&userId&page&pageSize` | Món hủy theo `cancelledAt` (FR-38); `userId` là người hủy → `VoidedItemsReport` |
| GET | `/api/reports/kitchen?from&to&station` | Vận hành bếp theo `sentAt` (FR-39) → `KitchenReport` |
| GET | `/api/reports/tables?from&to&areaId` | Khu vực và bàn (FR-40, P3) → `TableReport` |

```ts
type DashboardReport = {
  date: string                     // hôm nay yyyy-MM-dd
  asOf: string
  servingTables: number            // bàn DangPhucVu + ChoThanhToan + DaGop
  totalTables: number              // bàn chưa ẩn
  guestsSeated: number             // Σ khách hóa đơn DangMo, DangThu
  revenue: number                  // doanh thu thuần hôm nay (BR-26)
  paidOrderCount: number
  paidGuestCount: number
  revenuePerGuest: number          // revenue ÷ paidGuestCount, làm tròn tới đồng; 0 khi chưa có khách
  pendingItems: number             // dòng ChoLam + DangLam
  lateItems: number                // dòng trễ (BR-11)
  avgPrepMinutes?: number          // thời gian ra món TB của món xong hôm nay (BR-27), 1 chữ số; null khi chưa có
  longestTables: {                 // 5 bàn ngồi lâu nhất (bàn đang mở, theo openedAt)
    tableId: string; tableCode: string; areaName: string; orderId: string
    openedAt: string; minutesSeated: number; guestCount: number; subtotal: number
  }[]
}

type RevenueTotals = {
  revenue: number; orderCount: number; guestCount: number; revenuePerGuest: number
  discount: number; serviceCharge: number; vatAmount: number; total: number
}
type RevenueReport = {
  from: string; to: string
  totals: RevenueTotals
  previous: RevenueTotals & { from: string; to: string }
  revenueChangePercent?: number    // null khi kỳ trước = 0
  daily: (RevenueTotals & { date: string; previousRevenue: number })[]   // đủ mọi ngày trong khoảng
}

type TopItemsReport = {
  totalRevenue: number
  items: { menuItemId: string; code: string; name: string; categoryId: string; categoryName: string
           unit: string; quantity: number; revenue: number; share: number }[]
  // revenue = Σ lineTotal dòng không hủy của hóa đơn DaThanhToan (không phân bổ giảm giá); share = % trên mọi món trong bộ lọc
}

type VoidedItemsReport = {
  totalCount: number; totalValue: number
  byReason: { reason: CancelReason; reasonText: string; count: number; value: number }[]
  page: PaginatedResult<{
    itemId: string; orderId: string; orderCode: string; tableCode: string
    cancelledAt: string; itemName: string; quantity: number; unit: string
    value: number                  // lineTotal của dòng hủy (TC-44: 365.000)
    reason: CancelReason; reasonText: string; note?: string
    cancelledByName: string; cancelledByUsername: string
    approvedByUsername?: string
    statusAtCancel: OrderItemStatus
  }>
}

type KitchenReport = {
  totals: { itemCount: number; avgMinutes: number; lateCount: number; lateRate: number }
  byStation: { station: KitchenStation; itemCount: number; avgMinutes: number; lateCount: number; lateRate: number }[]
  byItem: { menuItemId: string; code: string; name: string; station: KitchenStation; prepMinutes: number
            itemCount: number; avgMinutes: number; lateRate: number }[]          // theo avgMinutes giảm dần
  byHour: { hour: number; itemCount: number; lateCount: number; lateRate: number }[]   // 10–22 theo giờ gửi
}

type TableReport = {
  days: number
  byArea: { areaId: string; areaName: string; tableCount: number; revenue: number
            sessions: number; turnover: number; avgSeatMinutes: number }[]
  byTable: { tableId: string; tableCode: string; areaName: string; capacity: number; revenue: number
             sessions: number; turnover: number; avgSeatMinutes: number }[]
}
```

Định nghĩa: `KitchenReport` chỉ tính dòng qua bếp có `doneAt`, không hủy (BR-27); phút = `doneAt − sentAt`; trễ khi phút ≥ `prepMinutes` chụp. `TableReport`: lượt phục vụ = hóa đơn `DaThanhToan` không phải hóa đơn tách; `turnover` khu vực = lượt ÷ số bàn có ít nhất 1 lượt ÷ `days`, của bàn = lượt ÷ `days`; `avgSeatMinutes` = trung bình `paidAt − openedAt`. Số tiền làm tròn tới đồng; phút, phần trăm 1 chữ số.

### 2.17. Thông tin nhà hàng — `/api/store-profile`

| Method | Đường dẫn | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| GET | `/api/store-profile` | Đã đăng nhập | Khóa `Store.*`, `Billing.*` (06 §3) → `StoreProfile`, để bản in, QR, màn thanh toán, đặt bàn không cần `settings.view` |

```ts
type StoreProfile = {
  name: string; address: string; phone: string; taxCode: string; receiptFooter: string
  bankBin: string; bankAccount: string; bankAccountName: string
  openTime: string; closeTime: string                 // "10:00", "22:00"
  serviceChargeRate: number; vatRate: number; cashierDiscountLimit: number
}
```

Quản trị viên sửa ở Cài đặt chung (`PUT /api/settings`, nhóm "Nhà hàng", "Tính tiền"; FR-32). BE kiểm thêm: `Billing.ServiceChargeRate` số nguyên 0–15 → 400 `errors["items[i].value"]` "Phí phục vụ từ 0 đến 15%"; `Billing.VatRate` thuộc 0, 5, 8, 10 → "Thuế suất là 0, 5, 8 hoặc 10%"; `Billing.CashierDiscountLimit` số nguyên 0–100; `Store.OpenTime` < `Store.CloseTime` dạng `HH:mm`. Đổi cài đặt không làm đổi hóa đơn đã khóa.

### 2.18. Thời gian thực — SignalR `/hubs/pos`

Kết nối kèm access token qua query `access_token` (chuẩn SignalR). Mọi người dùng đã đăng nhập vào một nhóm chung; FE tự lọc theo `waiterId`. Sự kiện (server → client), payload camelCase:

| Sự kiện | Payload | FE làm gì |
| :--- | :--- | :--- |
| `tables-changed` | `{ tableIds: string[] }` | Làm mới `floor-plan`, `tables/{id}/service` |
| `order-changed` | `{ orderId: string; tableId: string; version: number }` | Làm mới hóa đơn nếu `version` mới hơn cache |
| `kitchen-changed` | `{ ticketIds: string[]; stations: KitchenStation[]; newTicketIds: string[] }` | Màn bếp làm mới; `newTicketIds` thuộc khu đang lọc → viền nhấp nháy 5 giây, âm báo (FR-15) |
| `items-ready` | `{ tableId: string; tableCode: string; orderId: string; waiterId: string; count: number }` | Tablet của `waiterId` phát âm báo, làm mới `ready-items` (FR-19) |
| `item-out-of-stock` | `{ tableCode: string; itemName: string; waiterId: string; message: string }` | Tablet của `waiterId` hiện `message` (TC-07) |
| `item-cancelled` | `{ tableCode: string; itemName: string; waiterId: string }` | Bỏ dòng khỏi "Món chờ ra" (UC-07 E2) |
| `menu-changed` | `{ menuItemIds: string[] }` | Làm mới `GET /api/menu` (TC-06 trong 3 giây) |
| `reservations-changed` | `{ reservationIds: string[] }` | Làm mới đặt bàn, sơ đồ |

Chế độ `mock`: handler gọi `publishPosEvent(tên, payload)` sau khi ghi; sự kiện đi qua `BroadcastChannel` khóa `{storagePrefix}:pos-events` tới các tab khác, cùng hình dạng như trên (NFR-03). FE cài một lớp `lib/realtime.ts` dùng chung cho hai chế độ. Khi mất kết nối SignalR, FE hiện thanh đỏ "Mất kết nối, đang thử lại" và làm mới toàn bộ khi nối lại (UC-06 E1); ngoài ra màn sơ đồ và màn bếp tự làm mới mỗi 30 giây để phòng lỡ sự kiện.

### 2.19. Bản in

Không có endpoint riêng. FE dùng `GET /api/orders/{id}` + `GET /api/store-profile`:

- `/orders/[id]/print?type=prebill`: dòng "PHIẾU TẠM TÍNH – chưa phải hóa đơn" (TC-34). FE gọi `POST /api/orders/{id}/prebill` trước rồi mới mở bản in.
- `/orders/[id]/print`: hóa đơn; `?reprint=1` có dòng "IN LẠI" (cần `orders.reprint`, TC-40).
- Nội dung: tên, địa chỉ, SĐT, MST nhà hàng; mã hóa đơn, bàn, số khách, giờ mở, giờ in, phục vụ, thu ngân; từng dòng món không hủy (món theo trọng lượng in "1,2 kg × 450.000"); tiền món, giảm giá kèm lý do, phí phục vụ "5%", thuế GTGT "8%", "Làm tròn", tổng thanh toán, tiền cọc, các lượt thu, tiền thối, hoàn cọc (NFR-06).

### 2.20. Bảng mã lỗi nghiệp vụ

Lỗi 400/409 vi phạm nghiệp vụ có trường mở rộng `code` trong ProblemDetails để FE rẽ nhánh mà không so chuỗi; `detail` đúng câu dưới đây (FE hiển thị nguyên văn). Lỗi validate theo trường dùng `errors` như `QUY-UOC-API.md` §1.3.

| `code` | HTTP | `detail` | Nơi phát sinh |
| :--- | :---: | :--- | :--- |
| `DuLieuCu` | 409 | Bàn vừa được cập nhật, đang tải lại | Mọi thao tác có `version` (NFR-04), kèm `currentVersion` |
| `BanVuaDuocMo` | 409 | Bàn {mã} vừa được mở bởi {họ tên} | Mở bàn (UC-02 E3), kèm `orderId` |
| `BanChoDon` | 400 | Bàn chưa dọn xong | Mở bàn, nhận bàn |
| `BanDangCoKhach` | 400 | Bàn đang có khách | Ẩn, xóa, đổi khu vực bàn (TC-03) |
| `HoaDonDangThuTien` | 400 | Hóa đơn đang thu tiền | BR-22 (TC-33) |
| `ConMonChuaGui` | 400 | Còn {n} món chưa gửi bếp | BR-21 (TC-36), kèm `unsentCount` |
| `KhongCoMonMoi` | 400 | Chưa có món mới để gửi bếp | Gửi bếp |
| `MonTamHet` | 400 | {tên món} đang tạm hết | Thêm món (UC-05 E1) |
| `BanDaGuiBep` | 400 | Bàn đã gửi bếp, không đóng được | Đóng bàn mở nhầm |
| `CanQuanLyDuyet` | 400 | Món bếp đã làm, cần quản lý xác nhận | Hủy món (BR-13) |
| `MaXacNhanKhongHopLe` | 400 | Mã xác nhận của quản lý không hợp lệ, xác nhận lại | Hủy món, giảm giá |
| `VuotHanMucGiamGia` | 400 | Giảm giá vượt hạn mức {n}%, cần quản lý xác nhận | BR-08, kèm `discountLimit`, `requestedDiscount` |
| `MonDaRa` | 400 | Món đã ra cho khách | Bếp hoàn tác (TC-20) |
| `BanDichKhongHopLe` | 400 | Chỉ chuyển sang bàn đang trống / Chỉ gộp bàn đang phục vụ hoặc chờ thanh toán / Bàn nhận món phải đang phục vụ hoặc chờ thanh toán | Chuyển, gộp, chuyển món |
| `BanDangTachHoaDon` | 400 | Bàn đang tách hóa đơn, không chuyển hoặc gộp được | Chuyển, gộp |
| `HoaDonGocHetMon` | 400 | Hóa đơn gốc phải còn ít nhất 1 món | Tách (TC-31) |
| `QuaSoHoaDon` | 400 | Tối đa 10 hóa đơn mỗi bàn | Tách |
| `DangChiaDeu` | 400 | Hóa đơn đang chia đều, hủy chia đều trước khi tách | Tách |
| `VuotSoConPhaiThu` | 400 | Số tiền vượt số còn phải thu {số tiền} | Thu tiền (UC-11 E3) |
| `TienMatThieu` | 400 | Tiền khách đưa ít hơn số còn phải thu | Thu tiền (UC-11 E4) |
| `SaiTienPhan` | 400 | Phần {n} cần thu {số tiền} | Thu tiền chia đều |
| `KhongHuyDuocHoaDon` | 400 | Chỉ hủy được hóa đơn thanh toán trong ngày | BR-23 |
| `TrungDatBan` | 409 | Bàn {mã} đã được giữ từ {HH:mm} đến {HH:mm} | BR-24 (TC-41) |

Câu bắt buộc khác dùng `errors` theo trường: "Số khách từ 1 đến 50" (TC-09), "Trọng lượng từ 0,1 đến 20 kg" (TC-14), "Số lượng từ 1 đến 99", "Mã bàn đã tồn tại", "Sức chứa từ 1 đến 20" (TC-02), "Mã món đã tồn tại", "Đơn giá phải là bội số 1.000 ₫" (TC-05), "Số người từ 2 đến 20". Xóa món đã gọi: 400 "Món đã có trong hóa đơn, chỉ có thể ẩn" (TC-05).

---

## 3. Công thức và quy tắc (nguồn sự thật chung của BE, FE và mock)

FE tính tại máy để tạm tính phản hồi ngay bằng `features/pos/lib/pricing.ts`; handler mock dùng lại chính hàm đó; BE tính trong `OrderPricingService` ở mỗi thay đổi và mỗi lần đọc hóa đơn đang mở. Hai bên phải ra cùng số với cùng đầu vào; số BE trả là chính thức. Các hàm làm tròn (chỉ áp cho số không âm):

- `round1000(x)` = làm tròn tới bội số 1.000 gần nhất, phần lẻ từ 500 lên: `Math.floor((x + 500) / 1000) * 1000`; C# `Math.Round(x / 1000m, MidpointRounding.AwayFromZero) * 1000`.
- `floor1000(x)` = làm tròn **xuống** tới bội số 1.000: `Math.floor(x / 1000) * 1000`.
- `roundHalfUp(x)` = làm tròn tới 1 ₫, phần lẻ từ 0,5 lên: `Math.floor(x + 0.5)`; C# `Math.Round(x, 0, MidpointRounding.AwayFromZero)`. BE tính bằng `decimal`; FE tính bằng số nguyên đồng (tỉ lệ là số nguyên nên `base × rate / 100` chỉ lẻ tới 0,01, không sai số).

### 3.1. Thành tiền dòng (BR-04)

- Theo suất: `lineTotal = unitPrice × quantity`, `quantity` nguyên 1–99.
- Theo trọng lượng: `lineTotal = round1000(unitPrice × quantity)`, `quantity` 0,1–20 bước 0,1. FE tính `unitPrice × Math.round(quantity × 1000) / 1000` để tránh sai số dấu phẩy động. Cá chẽm 1,2 kg × 450.000 = **540.000** (UC-05).

### 3.2. Tiền món (BR-05)

`subtotal = Σ lineTotal` của dòng có trạng thái `ChoGoi`, `ChoLam`, `DangLam`, `Xong`, `DaPhucVu` (không gồm `ChuaGui`, `DaHuy`). Thẻ bàn hiện `subtotal` (tạm tính) cộng mọi hóa đơn đang mở của bàn.

### 3.3. Giảm giá và hạn mức (BR-08)

1. `PhanTram`: `discount = floor1000(subtotal × value / 100)`; `SoTien`: `discount = min(value, subtotal)`.
2. Hạn mức thu ngân: `limit = subtotal × cashierDiscountLimit / 100` (không làm tròn). `discount > limit` và người gọi không có `orders.discount-override` → cần `approvalToken` của `GiamGia`.
3. Giảm giá được tính lại theo `subtotal` mới mỗi khi món đổi (giữ `type`, `value`); số tiền vượt `subtotal` thì cắt bằng `subtotal`. Hạn mức chỉ kiểm lúc đặt giảm giá.

TC-37: 1.065.000 × 10% = 106.500 → **106.000**; hạn mức 106.500 → không cần quản lý. TC-38: 15% = 159.750 → **159.000** > 106.500 → cần `quanly`.

### 3.4. Phí phục vụ, thuế, làm tròn (BR-06, BR-07)

```
base        = subtotal − discount
serviceCharge = roundHalfUp(base × serviceChargeRate / 100)
vatAmount   = roundHalfUp((base + serviceCharge) × vatRate / 100)
grossTotal  = base + serviceCharge + vatAmount
total       = round1000(grossTotal)
rounding    = total − grossTotal
```

`serviceChargeRate`, `vatRate` lấy từ cài đặt hiện tại khi hóa đơn còn mở và chưa khóa; chốt vào hóa đơn ở lượt thu đầu tiên không phải tiền cọc (hoặc lúc `complete`). Mỗi hóa đơn tách tính riêng.

| Ca | Tiền món | Giảm | Phí 5% | Thuế 8% | Làm tròn | Tổng |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Đơn chuẩn T1-05 (TC-34) | 1.065.000 | 0 | 53.250 | 89.460 | +290 | **1.208.000** |
| Sau gộp T1-06 (TC-29) | 1.155.000 | 0 | 57.750 | 97.020 | +230 | **1.310.000** |
| Tách: hóa đơn mới (TC-30) | 590.000 | 0 | 29.500 | 49.560 | −60 | **669.000** |
| Tách: hóa đơn gốc (TC-30) | 475.000 | 0 | 23.750 | 39.900 | +350 | **539.000** |
| Giảm 10% (TC-37) | 1.065.000 | 106.000 | 47.950 | 80.556 | +494 | **1.088.000** |
| Giảm 15% (TC-38) | 1.065.000 | 159.000 | 45.300 | 76.104 | −404 | **1.027.000** |
| 2 Lẩu thái (TC-42) | 730.000 | 0 | 36.500 | 61.320 | +180 | **828.000** |

### 3.5. Thu tiền, chia đều, tiền cọc (BR-19, BR-20, BR-25)

- `paidAmount = Σ payments.amount` (gồm `TienCoc`); `remaining = max(0, total − paidAmount)`; `depositRefund = max(0, deposit − total)`.
- Tiền mặt: `target` = tiền của phần (chia đều) hoặc `remaining`; `amount = min(cashReceived, target)`; `changeAmount = cashReceived − amount` (≥ 0). `cashReceived < target` chỉ được khi không chia đều và `allowPartial = true`. Nút mệnh giá nhanh: Đủ tiền, 500.000, 1.000.000, 2.000.000; nút nhỏ hơn số cần thu bị vô hiệu.
- Chuyển khoản, thẻ: `0 < amount ≤ remaining` (chia đều thì `amount` = tiền của phần).
- Chia đều N phần: `toSplit = total − deposit` (≤ 0 thì không cho chia: 400 "Tiền cọc đã đủ, không cần chia"); phần 2…N `= floor1000(toSplit / N)`; phần 1 `= toSplit − (N − 1) × phần 2`. `shares[i].paid` = có lượt thu `shareNo = i`. TC-32: 1.208.000 ÷ 3 → **404.000**, 402.000, 402.000.
- Tiền cọc: lượt `TienCoc` tạo lúc nhận bàn, `amount = deposit`. Khi chốt hóa đơn (lượt thu cuối hoặc `complete`) mà `deposit > total`, BE giảm `amount` lượt cọc về `total`, ghi `depositRefund` (hoàn tiền mặt, in trên hóa đơn). TC-42: 828.000 − 500.000 → còn phải thu **328.000**.
- TC-35: chuyển khoản 1.000.000 → còn 208.000; tiền mặt 300.000 → thối **92.000**. Demo bước 11: 539.000, khách đưa 600.000 → thối **61.000**.

### 3.6. Phiên bản hóa đơn (NFR-04)

`OrderDto.version` tăng 1 ở **mọi** thay đổi của hóa đơn hoặc món của nó, **trừ**: bếp `start`, `done`, `done-all`, `undo`, `acknowledge`; phục vụ `serve`, `serve-all`, `unserve` (không đổi tiền). Thao tác gửi kèm `version` và lệch với bản hiện tại → 409 `DuLieuCu` "Bàn vừa được cập nhật, đang tải lại" kèm `currentVersion`; FE báo, làm mới, người dùng thao tác lại. Thao tác có `version`: `send`, `cancel` món, `close`, `transfer`, `merge` (chỉ kiểm hóa đơn chính), `move-items` (chỉ kiểm hóa đơn nguồn), `prebill`, `discount` (PUT, DELETE), `split`, `split-equal` (POST, DELETE), `payments`, `complete`. Thêm, sửa, xóa món nháp và thao tác bếp, ra món không kiểm `version` (vẫn tăng nếu thuộc nhóm tăng). BE dùng thêm concurrency token của EF để hai request cùng `version` không cùng thắng.

### 3.7. Chống bấm lặp (NFR-05)

| Thao tác | Khóa | Gửi lại cùng khóa |
| :--- | :--- | :--- |
| Mở bàn, nhận bàn | `Pos_Orders.ClientRequestId` | 200 trả hóa đơn đã tạo |
| Gửi bếp | `Pos_OrderItems.SendRequestId` | 200 `SendResultDto` dựng lại từ các dòng có mã đó; không tăng lần gọi, không tạo phiếu (TC-15) |
| Thu tiền | `Pos_Payments.ClientRequestId` | 200 `PaymentResultDto` cũ |

FE sinh `clientRequestId` bằng `crypto.randomUUID()` khi bắt đầu thao tác (mở hộp Mở bàn, bấm Gửi bếp lần đầu, mở hộp thu một lượt), giữ nguyên khi bấm lại hoặc thử lại sau lỗi mạng, đổi mới sau khi thành công. Nút khóa trong lúc chờ phản hồi. Hai request cùng mã đến đồng thời: request sau gặp lỗi concurrency hoặc unique index, BE đọc lại và trả kết quả của request trước.

### 3.8. Thời gian chờ và màu (BR-11, BR-12)

- Áp cho dòng `ChoLam`, `DangLam`: `waitMinutes = (now − sentAt) / 60.000`, `ratio = waitMinutes / prepMinutes`. Xanh `ratio < 0,8`; vàng `0,8 ≤ ratio < 1`; đỏ, nhãn "Trễ" `ratio ≥ 1`. Màu phiếu = màu nặng nhất trong các dòng của phiếu. TC-17: 13/15 → vàng; 16/15 → đỏ.
- `now` ở FE = `Date.now() + (asOf − giờ máy lúc nhận)` để khớp giờ máy chủ; tính lại mỗi 15 giây (UC-06 bước 6). `isLate`, `hasLateItems`, `lateItems` do BE tính theo giờ máy chủ.
- Thứ tự phiếu `DangCho`: `isRush` trước, rồi `sentAt` tăng dần, rồi `code` (TC-18).

### 3.9. Trạng thái bàn trả về API

`status` = `Pos_DiningTables.Status`, riêng bàn `Trong` có đặt bàn `ChoDen` mà `arrivalAt − 60 phút ≤ now ≤ arrivalAt + 30 phút` → `DaDat`. `TableCardDto.reservation` lấy đặt bàn `ChoDen` gần nhất trong hôm nay có `arrivalAt + 30 phút ≥ now` (kể cả khi chưa tới cửa sổ 60 phút), để FE cảnh báo khi mở bàn, chuyển bàn vào bàn có khách đặt (UC-02 2b, UC-09 3a, TC-27).

---

## 4. Quy ước riêng cho FE

- **Trang sau đăng nhập** (SRS §2.2, TC-45): `homeAfterLogin` là `/dashboard`; `app/page.tsx` và bước chuyển sau đăng nhập, đổi vai trò chọn theo quyền: có `dashboard.view` → `/dashboard`; không có, có `kitchen-tickets.view` mà không có `tables.view` → `/kitchen`; có `tables.view` → `/tables`; còn lại → mục menu đầu tiên có quyền. Quản lý vào Tổng quan, Phục vụ và Thu ngân vào Sơ đồ bàn, Bếp vào Màn hình bếp.
- **Menu sidebar** (`config/routes/`): Tổng quan `/dashboard` (`dashboard.view`), Sơ đồ bàn `/tables` (`tables.view`), Màn hình bếp `/kitchen` (`kitchen-tickets.view`), Hóa đơn `/orders` (`orders.checkout`), Đặt bàn `/reservations` (`reservations.view`), Thực đơn `/menu-items` (`menu-items.update`, nên bếp và phục vụ không thấy dù có `menu-items.view`), Báo cáo `/reports` (`reports.view`). Bếp gõ `/tables`, phục vụ gõ `/reports` → `/forbidden` (TC-45).
- **Route toàn màn hình**: `/kitchen` nằm trong route group riêng (vd `app/(fullscreen)/kitchen`) có `AuthGuard` nhưng **không** sidebar, header; luôn nền tối (NFR-02), tên món ≥ 20 px, lưới ≥ 8 phiếu ở 1920×1080; giữ `DemoToolbar`. `/orders/[id]/print` không layout, CSS `@page { size: 80mm auto }`, chữ ≥ 12 px, tự `window.print()` khi mở từ luồng thao tác. `/tables`, `/tables/[id]`, `/tables/[id]/checkout` tối ưu tablet ngang 1280×800 (NFR-01): sidebar thu gọn mặc định, vùng chạm ≥ 44 px, 16 bàn một khu vực vừa một màn không cuộn.
- **Sơ đồ bàn** `/tables`: tab khu vực, thanh đếm theo `counts` (chạm để lọc), thẻ bàn đặt theo `x`, `y` trên lưới 12 × 8; màu theo `TableStatus` lấy từ token `theme.css` (thêm token trạng thái bàn, không mã màu cứng). Chế độ "Thiết lập" (`tables.update`) kéo thả bắt ô lưới, bấm "Lưu sơ đồ" gọi `POST /api/tables` cho bàn mới rồi `PUT /api/tables/layout`; thoát khi chưa lưu thì hỏi xác nhận (UC-01 E4). Chạm bàn `DaGop` → điều hướng tới bàn chính.
- **Gọi món** `/tables/[id]`: trái là lưới món có ảnh (`useAssetUrl`), lọc danh mục, tìm mã/tên không dấu; phải là "Chưa gửi bếp" và "Đã gửi bếp". Món theo trọng lượng mở bàn phím số nhập kg (hiển thị "1,2 kg", giá "450.000 ₫/kg"). Nút "Gửi bếp (n món)", "In tạm tính", "Thanh toán" vô hiệu kèm lý do bằng chữ khi `counts.unsent > 0` ("Còn {n} món chưa gửi bếp") hoặc `isLocked` ("Hóa đơn đang thu tiền"). Bàn có nhiều hóa đơn → tab theo mã. Hộp chuyển/gộp dùng sơ đồ thu nhỏ từ `floor-plan`, bàn không chọn được hiện mờ.
- **Món chờ ra**: biểu tượng chuông trên header của vai trò có `orders.create`, đọc `/api/ready-items?mine=true`, công tắc "Bàn của tôi". "Đã ra" hiện thông báo có nút "Hoàn tác" 10 giây (UC-07 E1).
- **Màn hình bếp**: khu chế biến đã chọn lưu `localStorage` khóa `kitchen.station`; nút "Bật âm thanh" lần đầu (trình duyệt chặn tự phát âm thanh); thanh công cụ có "Thực đơn" mở danh sách món với công tắc "Còn bán/Tạm hết" (`PATCH availability`), "Tổng hợp", "Đã xong". Nhấn giữ 500 ms dòng món "Chờ làm" mở menu "Hết món". Không tự đăng xuất: dựa vào làm mới token tự động của `lib/axios.ts`.
- **Hộp Quản lý xác nhận** (SCR-07): FE biết trước món cần duyệt nhờ `status`; người gọi có `order-items.void-approve` (hoặc `orders.discount-override` với giảm giá) thì bỏ qua hộp. Gọi `POST /api/approvals` rồi gửi `approvalToken` kèm thao tác.
- **QR chuyển khoản**: FE tự vẽ bằng gói `qrcode` (thêm vào `package.json` khi làm màn thanh toán) từ chuỗi `VIETQR|{bankBin}|{bankAccount}|{amount}|{orderCode}`, không gọi dịch vụ ngoài; nội dung chuyển khoản là mã hóa đơn; gửi chuỗi đã hiện trong `qrContent`.
- **Định dạng**: tiền `formatVnd` (`1.208.000 ₫`), làm tròn có dấu (`+290 ₫`, `−60 ₫`); số kg dấu phẩy thập phân; SĐT `0903 456 789`; thời gian ngồi "45 phút", "1 giờ 05 phút".
- **Báo cáo**: mặc định 30 ngày; chọn nhanh Hôm nay, 7 ngày, 30 ngày, Tháng này, Tháng trước, Tùy chọn; chặn khoảng > 366 ngày trước khi gọi.
- **Mock**:
  - Collection (`mockDb.collection`, tên kebab-case): `areas`, `dining-tables`, `categories`, `menu-items`, `quick-notes`, `orders` (gồm món, lượt thu lồng trong bản ghi), `kitchen-tickets`, `reservations`. Seed nạp từ `src/mock/seed/demo-data.json` (`mockDb.registerSeed('demo-data', demoData)`), suy ra trường đúng `06` §5 (gồm ánh xạ thứ trong tuần §5.3 và giờ tương đối theo phút), tính tiền bằng `pricing.ts`.
  - **Bộ nhớ**: localStorage chỉ khoảng 5 MB, 2.500 hóa đơn đầy đủ sẽ vượt. Hóa đơn và phiếu bếp **trước hôm nay** là dữ liệu chỉ đọc (BR-23 chỉ hủy hóa đơn trong ngày): giữ ở một kho trong bộ nhớ dựng lại từ seed mỗi lần tải trang, không ghi vào mock-db; mock-db chỉ chứa hóa đơn, phiếu bếp **hôm nay** (từ `liveOrders`, hóa đơn `d: 0`) và mọi thứ tạo trong phiên demo. Handler danh sách, báo cáo đọc hợp hai nguồn. Đặt lại dữ liệu xóa mock-db và dựng lại kho bộ nhớ.
  - Mã hóa đơn, số phiếu, mã đặt bàn sinh trong handler theo ngày, nối tiếp số đã có trong hai nguồn. Token xác nhận giữ trong biến module của tab, 5 phút.
  - Thời gian thực: `publishPosEvent` qua `BroadcastChannel` (§2.18); ngoài ra `mockDb.subscribe` (`remote = true`) đã tự làm mới query khi tab khác ghi.

---

## 5. Quyết định thiết kế (BE và FE làm theo)

Những điểm SRS, use case chưa nói rõ đã được chốt như sau; FE mock làm giống BE để hai chế độ ra cùng kết quả.

| # | Chỗ | Quyết định | Lý do |
| :---: | :--- | :--- | :--- |
| 1 | Món "Chưa gửi" | Lưu phía máy chủ (`Pos_OrderItems.Status = ChuaGui`), thêm/sửa/xóa qua API | Nhiều tablet cùng thấy, BE chặn được BR-21 (TC-36 hai vai trò), không mất món khi tải lại (NFR-04) |
| 2 | Kết quả thao tác hóa đơn | Trả 200 kèm `OrderDto` (không 204) | FE thay cache ngay, tránh đọc lại |
| 3 | Khóa lạc quan | `version` trên hóa đơn, danh sách thao tác ở §3.6; thao tác bếp, ra món không tăng | Giảm báo "dữ liệu cũ" vô ích khi bếp bấm liên tục |
| 4 | Tỉ lệ phí phục vụ, thuế | Hóa đơn đang mở dùng cài đặt hiện tại, chốt ở lượt thu đầu tiên không phải tiền cọc | SRS §5.1 "tại thời điểm thanh toán"; sau lượt thu đầu hóa đơn đã khóa |
| 5 | Chuyển, gộp bàn | Chỉ khi bàn có đúng một hóa đơn đang mở | Tránh mơ hồ khi bàn đã tách hóa đơn |
| 6 | Gộp bàn có tiền cọc | Tiền cọc và lượt "Tiền cọc" của bàn phụ chuyển sang hóa đơn bàn chính | BR-22 không tính tiền cọc là lượt thu |
| 7 | Chuyển món | Vào hóa đơn đang mở sớm nhất của bàn đích; phiếu bếp giữ bàn cũ, dòng ghi "→ bàn mới" | FR-24 không nói rõ khi bàn đích đã tách |
| 8 | Trang Hóa đơn `/orders` | Gắn quyền `orders.checkout`; người chỉ có `orders.view` (phục vụ) xem được hóa đơn đang mở qua API | SCR-12 chỉ dành cho Thu ngân, Quản lý; SRS §7 "phục vụ chỉ thấy hóa đơn đang mở" |
| 9 | Thực đơn `/menu-items` | Gắn `menu-items.update`; bếp đổi tạm hết ngay trên màn bếp | SCR-11 chỉ dành cho Quản lý; UC-04 bếp thao tác ở màn bếp |
| 10 | Danh sách hóa đơn | Lọc ngày theo `openedAt`, mặc định hôm nay, mới nhất trước | UC-12 bước 1 |
| 11 | "Đã đặt" | Không lưu, suy ra theo cửa sổ [giờ đến − 60, giờ đến + 30 phút] | BR-02, BR-24: quá 30 phút thì "Không đến" |
| 12 | "Không đến" | Đổi lười khi đọc (không cần job) | Đơn giản, hai chế độ giống nhau |
| 13 | Cảnh báo bàn có khách đặt | FE cảnh báo khi bàn đích có đặt bàn `ChoDen` hôm nay (§3.9), kể cả chưa vào cửa sổ 60 phút | TC-27 chạy được bất kỳ giờ nào trước 19:30 |
| 14 | Quá sức chứa | Chỉ FE cảnh báo, BE nhận 1–50 khách | BR-01 cho phép vẫn mở |
| 15 | Thu tiền mặt một phần | Cần cờ `allowPartial` sau khi thu ngân xác nhận; thu từng phần chia đều phải đủ tiền phần đó | BR-20; mỗi phần chia đều thu một lần |
| 16 | Chia đều | Chỉ lưu `splitCount`, tiền từng phần tính lại mỗi lần đọc; chặn tách theo món khi đang chia đều | Giảm giá, món đổi trước lượt thu đầu tự cập nhật phần chia |
| 17 | Hóa đơn tách | `guestCount = 0`, cùng phục vụ, cùng bàn; giảm giá gốc bị gỡ | BR-18, BR-26 (khách lấy từ hóa đơn gốc) |
| 18 | Tiền cọc lớn hơn tổng | Lượt cọc giảm về tổng, ghi `depositRefund`; chốt bằng `POST /complete` khi không còn gì phải thu | BR-25 |
| 19 | Hoàn tác "Đã ra" | BE cho phép trong 60 giây kể từ `servedAt`, FE hiện nút 10 giây | Bù độ trễ mạng |
| 20 | Hủy món theo trọng lượng, tách, chuyển | Chỉ nguyên dòng | BR-13, BR-17, BR-18 |
| 21 | Bếp báo hết trên hóa đơn đang thu tiền | Chặn "Hóa đơn đang thu tiền" | BR-22 |
| 22 | Đóng bàn mở nhầm | Được khi hóa đơn chỉ có món "Chưa gửi" (xóa theo) hoặc không có món | BR-03 |
| 23 | Quản lý xác nhận | Một endpoint `POST /api/approvals` cho cả hủy món và giảm giá, trả 400 (không 401) khi sai mật khẩu | Như demo POS Quán Cafe; tránh làm mới token của người đang dùng |
| 24 | Cài đặt tính tiền | Khóa `Billing.*` trong `System_Settings`, BE kiểm giá trị khi `PUT /api/settings` | FR-32 |
| 25 | Vai trò `STAFF` | Vẫn còn trong `system.json` (dự án không xóa được vai trò nền) nhưng không có tài khoản, không có quyền nghiệp vụ | SRS §2.2 |
| 26 | Số đếm món ở Tổng quan, thẻ bàn | Đếm theo **dòng** món (6 lon bia là 1 dòng), không theo số lượng | TC-21 "huy hiệu 4" |
| 27 | "Bàn đang phục vụ" ở Tổng quan | `DangPhucVu` + `ChoThanhToan` + `DaGop` | Khách vẫn đang ngồi |
| 28 | Dữ liệu mẫu hôm nay | Giờ tương đối theo phút so với lúc nạp; ngày lịch sử ánh xạ theo thứ thật (06 §5.3) | Lúc demo luôn có bàn đang ăn, phiếu vàng/đỏ; NFR-07 "cuối tuần cao hơn" đúng thứ thật |
| 29 | Lịch sử ở chế độ mock | Chỉ đọc, giữ trong bộ nhớ, không ghi localStorage (§4) | Giới hạn ~5 MB của localStorage |
| 30 | Sự kiện thời gian thực | Một hub `/hubs/pos`, một nhóm chung, FE lọc theo `waiterId` | Demo một nhà hàng, ít người dùng |
| 31 | Số phiếu bếp cùng giờ gửi, cùng hóa đơn | Khu chế biến xếp theo giá trị enum: `BepNong`, `BepNguoi`, `QuayBar` (cả seed lẫn gửi bếp) | FE mock đánh số giống BE |
| 32 | Chế độ tổng hợp (FR-18) | Gom theo món; món có dòng gửi sớm nhất xếp trước, cùng giờ thì theo tên; dòng trong món theo `sentAt` | §2.10 chưa nói thứ tự nhóm |
| 33 | Bếp báo hết món | Dòng hủy lý do `HetMon` ghi "Đã biết" ngay, phiếu không giữ viền đỏ | Bếp tự hủy, không cần tự xác nhận |
| 34 | Thu tiền chia đều sai số tiền | Sai tiền phần (thẻ, chuyển khoản) hoặc tiền mặt ít hơn tiền phần đều trả `code: SaiTienPhan` "Phần {n} cần thu {số tiền}" (`errors.amount` hoặc `errors.cashReceived`); `TienMatThieu` chỉ dùng khi không chia đều | Mã khớp câu thông báo ở §2.20 |
| 35 | Thu tiền khi số còn phải thu đã bằng 0 | 400 "Hóa đơn đã thu đủ tiền"; FE chốt bằng `POST /complete` | BR-25: tiền cọc đủ trả |
| 36 | Chuyển bàn đang "Chờ thanh toán" | Bàn đích nhận "Chờ thanh toán", phiếu tạm tính còn hiệu lực | Món, tiền không đổi khi chuyển |
| 37 | Gộp bàn | Hóa đơn chính có `prebillPrintedAt` về null cùng lúc bàn chính về "Đang phục vụ" | BR-16, BR-21 |
| 38 | Sự kiện `item-cancelled` | Phát khi dòng bị hủy đang "Xong" (đang chờ ra) | UC-07 E2 |
| 39 | Thực đơn gộp `GET /api/menu` | Không trả món thuộc danh mục ẩn | Danh mục ẩn là ẩn khỏi màn gọi món |
| 40 | `POST /api/approvals` | Người gọi cần quyền ứng với `action`: `HuyMon` → `order-items.cancel`, `GiamGia` → `orders.discount`; thiếu → 403 | Endpoint nhận một trong hai quyền |
| 41 | Ra món trên hóa đơn đang thu tiền | Cho phép (không đổi tiền); hóa đơn đã hủy, đã gộp → 400 "Hóa đơn đã đóng" | Bếp vẫn làm món khi khách đang trả tiền |
| 42 | Mở bàn đã gộp vào bàn khác | 409 `BanVuaDuocMo` kèm `orderId` của hóa đơn bàn chính | UC-02 E3 |
| 43 | Câu lỗi bổ sung | Sửa món đã gửi: "Chỉ sửa được món chưa gửi bếp"; xóa món đã gửi: "Món đã gửi bếp, dùng Hủy món"; ra món chưa xong: "Món chưa xong, chưa ra được"; hoàn tác món chưa ra: "Món chưa ra, không hoàn tác được"; số lượng hủy, chuyển, tách sai: `errors.quantity` (hoặc `errors["items[i].quantity"]`, `errors["parts[i].items[j].quantity"]`) "Số lượng hủy/chuyển/tách từ 1 đến {n}"; nhận bàn khác ngày: "Chỉ nhận bàn cho đặt bàn hôm nay"; bàn ngoài lưới: `errors.x`/`errors.y` "Vị trí bàn nằm ngoài sơ đồ"; cài đặt: "Hạn mức giảm giá từ 0 đến 100%", "Giờ dạng HH:mm", "Giờ mở cửa phải trước giờ đóng cửa" | BE chốt khi cài đặt |
| 44 | Hóa đơn tách | Giữ `openedAt`, `prebillPrintedAt` và số lần gọi của hóa đơn gốc | Khách vẫn ngồi từ lúc mở bàn; phiếu tạm tính đã in còn hiệu lực, bàn vẫn "Chờ thanh toán" |
| 45 | Sơ đồ bàn, Tổng quan | Bàn thuộc khu vực ẩn không tính vào `tables`, `counts`, `totalTables` | Khu vực ẩn là ngừng dùng; thanh đếm khớp số thẻ bàn đang hiện |
| 46 | Chuyển bàn, gộp bàn | Phiếu bếp đổi bàn: mọi phiếu "Đang chờ" đang ở bàn cũ (bàn nguồn) và phiếu "Đã xong" của chính hóa đơn đó; phiếu "Đã xong" của khách trước giữ bàn cũ | Phiếu của hóa đơn gốc đã tách (`orderId` là gốc) vẫn theo bàn; lịch sử khách trước không đổi |
| 47 | "Dọn xong" | Chỉ đổi bàn được chạm; bàn phụ đã gộp phải dọn riêng | Mỗi bàn dọn xong một lúc khác nhau |
| 48 | Hủy món | Món qua bếp hủy (kể cả đã phục vụ) đưa phiếu về "Đang chờ" tới khi bếp bấm "Đã biết"; món không qua bếp hủy thì tự "Đã biết" | Bếp luôn biết món đã hủy; món không qua bếp không có phiếu |
| 49 | Tự duyệt | Người có `order-items.void-approve` tự hủy món đã chế biến, người có `orders.discount-override` tự giảm vượt hạn mức → ghi chính họ là người duyệt, không xét `approvalToken` | FE bỏ qua hộp xác nhận với người có quyền (§4) |
| 50 | `GET /api/reservations` | Không gửi `from`, `to` → mọi ngày | Tìm theo tên, SĐT trên mọi ngày; dòng thời gian luôn gửi ngày |
| 51 | `POST /api/approvals` sai mật khẩu | Đếm chung với đăng nhập theo BR-SYS-03: 5 lần liên tiếp → tạm khóa 5 phút; xác nhận đúng không xóa bộ đếm; mock làm giống | Không dò được mật khẩu quản lý qua hộp xác nhận |
| 52 | Bấm lặp mở bàn, gửi bếp, thu tiền | Lần bấm sau tới khi lần trước vừa lưu xong (đã qua bước kiểm mã yêu cầu) vẫn trả kết quả cũ, không 409 `DuLieuCu` | TC-15: hai lần bấm gần như cùng lúc không hiện "Bàn vừa được cập nhật" |

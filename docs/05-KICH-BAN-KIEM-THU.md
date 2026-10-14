# Kịch bản kiểm thử nghiệm thu — Quản lý Nhà hàng

> Test case theo use case trong `03-USE-CASE.md`. Phần nền (đăng nhập, phân quyền, đặt lại dữ liệu) dùng TC-SYS-01 đến TC-SYS-10 trong `ZDOCS/03-KIEN-TRUC/USE-CASE-NEN.md` §8.

---

## 1. Cách chạy

| Mục | Nội dung |
| :--- | :--- |
| Môi trường | Chạy cả hai chế độ: dữ liệu mẫu (`mock`) và BE thật (`api`) |
| Dữ liệu | Đặt lại dữ liệu demo trước mỗi lượt test; test case ghi "Sau TC-xx" thì chạy nối tiếp test case đó |
| Tài khoản | Theo cột "Vai trò" của từng test case, dùng "Đăng nhập nhanh" |
| Thiết bị | Phục vụ, Thu ngân chạy ở cửa sổ 1280×800; Bếp chạy ở cửa sổ 1920×1080 |
| Thời gian thực | Test case có hai vai trò cùng lúc: mở hai tab cùng trình duyệt, mỗi tab đăng nhập một vai trò (phiên đăng nhập lưu theo tab), áp dụng cho cả `mock` và `api` |
| Đạt | Kết quả thực tế khớp toàn bộ cột "Kết quả mong đợi" |

Dữ liệu mẫu dùng trong test:

- Cài đặt tính tiền: phí phục vụ 5%, thuế GTGT 8%, thu ngân giảm tối đa 10%, giờ mở cửa 10:00–22:00.
- Món: "Gỏi ngó sen tôm thịt" 125.000 ₫/đĩa (Bếp nguội, chuẩn 10 phút); "Bò lúc lắc khoai tây" 185.000 ₫/đĩa (Bếp nóng, 15 phút); "Cá chẽm hấp Hồng Kông" 450.000 ₫/kg, theo trọng lượng (Bếp nóng, 20 phút); "Rau muống xào tỏi" 65.000 ₫/đĩa (Bếp nóng, 8 phút); "Lẩu thái hải sản" 365.000 ₫/nồi (Bếp nóng, 15 phút); "Nước ép cam" 45.000 ₫/ly (Quầy bar, 5 phút); "Bia Tiger lon" 25.000 ₫/lon (Không qua bếp).
- Bàn: T1-05 (4 chỗ, Trống); T1-06 (4 chỗ, Đang phục vụ 2 khách, 2 Nước ép cam 90.000 ₫ đã ra); T1-10 (4 chỗ, Trống); SV-01 (Đang phục vụ 3 khách, có 1 phiếu Bếp nóng "Chờ làm"); T2-01 (10 chỗ, có đặt bàn); T2-03 (phiếu Bếp nóng gửi 16 phút trước: Lẩu thái hải sản "Đang làm"); T2-04 (phiếu Bếp nóng gửi 13 phút trước: Bò lúc lắc khoai tây "Chờ làm").
- Đặt bàn: anh Trần Minh Quân, 0903 456 789, 19:00 hôm nay, 8 khách, T2-01, cọc 500.000 ₫.
- **Đơn chuẩn T1-05:** 4 khách; 1 Gỏi ngó sen 125.000 ₫, 1 Bò lúc lắc 185.000 ₫, Cá chẽm 1,2 kg 540.000 ₫, 1 Rau muống 65.000 ₫, 6 Bia Tiger 150.000 ₫; tiền món 1.065.000 ₫; mọi món đã gửi bếp và đã ra. Tạo bằng TC-08, TC-11, TC-12, rồi bếp báo xong và phục vụ ra hết món.

Số liệu tính sẵn của Đơn chuẩn T1-05 (BR-06, BR-07): phí phục vụ 53.250 ₫; thuế GTGT (1.065.000 + 53.250) × 8% = 89.460 ₫; cộng 1.207.710 ₫; làm tròn +290 ₫; tổng thanh toán 1.208.000 ₫.

---

## 2. Test case

### 2.1. Khu vực, bàn và thực đơn

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-01 | UC-01 | Thêm bàn mới và đặt vị trí | Quản lý, Phục vụ | 1. Sơ đồ bàn → Thiết lập 2. Tab Sân vườn → Thêm bàn: mã `SV-09`, sức chứa 6, hình tròn 3. Kéo tới góc phải, Lưu sơ đồ 4. Đổi sang Phục vụ, mở tab Sân vườn | Bàn SV-09 trạng thái Trống, đúng vị trí đã kéo; tổng số bàn trên thanh đếm là 31 |
| TC-02 | UC-01 | Thêm bàn trùng mã, sức chứa sai | Quản lý | 1. Thêm bàn mã `T1-05` 2. Đổi mã `T1-13`, sức chứa 25 3. Lưu | Bước 1 báo lỗi tại ô mã bàn; bước 2 báo lỗi sức chứa 1–20; không lưu |
| TC-03 | UC-01 | Ẩn bàn đang có khách | Quản lý | 1. Chế độ thiết lập, chọn SV-01 2. Bấm Ẩn | Từ chối, báo "Bàn đang có khách"; SV-01 vẫn trên sơ đồ |
| TC-04 | UC-03 | Thêm món theo trọng lượng | Quản lý, Phục vụ | 1. Thực đơn → Thêm món: mã `M061`, "Tôm sú nướng muối ớt", danh mục Hải sản, theo trọng lượng, kg, 690.000 ₫, Bếp nóng, 20 phút 2. Lưu 3. Đổi sang Phục vụ, mở T1-06, chạm món mới | Món hiện trong danh mục Hải sản với giá "690.000 ₫/kg"; chạm món mở bàn phím nhập số kg |
| TC-05 | UC-03 | Xóa món đã gọi, nhập giá lẻ | Quản lý | 1. Chọn "Bò lúc lắc khoai tây" → Xóa 2. Sửa đơn giá thành 185.500 ₫ → Lưu | Bước 1 từ chối, gợi ý dùng "Ẩn"; bước 2 báo đơn giá phải là bội số 1.000 ₫, không lưu |
| TC-06 | UC-04 | Bếp báo tạm hết | Bếp, Phục vụ | 1. Màn hình bếp → Thực đơn → tắt "Còn bán" của Cá chẽm hấp Hồng Kông 2. Đổi sang Phục vụ, mở T1-06 | Trong 3 giây thẻ Cá chẽm mờ, nhãn "Tạm hết", chạm không thêm được |
| TC-07 | UC-04 | Bếp báo hết món đang chờ trên phiếu | Phục vụ, Bếp | 1. Mở T1-05, gửi bếp Cá chẽm 1,2 kg 2. Màn hình bếp nhấn giữ dòng Cá chẽm (Chờ làm) → Hết món | Không cần duyệt; món "Đã hủy" lý do "Hết món"; tiền món T1-05 giảm 540.000 ₫; tablet phục vụ hiện thông báo "T1-05: Cá chẽm hấp Hồng Kông đã hết"; Cá chẽm chuyển "Tạm hết" trên thực đơn |

### 2.2. Mở bàn và gọi món

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-08 | UC-02 | Mở bàn | Phục vụ | 1. Chạm T1-05 (Trống) 2. Nhập 4 khách → Mở bàn | Hóa đơn mới mã `HD{yyMMdd}{nnnn}`; T1-05 chuyển màu Đang phục vụ, 4 khách, thời gian ngồi 0 phút; mở màn Gọi món của T1-05 |
| TC-09 | UC-02 | Số khách không hợp lệ, vượt sức chứa | Phục vụ | 1. Chạm T1-10, nhập 0 → Mở bàn 2. Nhập 7 → Mở bàn 3. Xác nhận cảnh báo | Bước 1 báo lỗi số khách 1–50; bước 2 cảnh báo "Bàn 4 chỗ, đang mở cho 7 khách"; bước 3 bàn mở với 7 khách |
| TC-10 | UC-02 | Đóng bàn mở nhầm | Phục vụ | 1. Mở T1-10 cho 2 khách 2. Chưa gọi món, bấm Đóng bàn 3. Mở T1-10 lần nữa, gửi bếp 1 Rau muống | Bước 2: T1-10 về Trống, hóa đơn "Đã hủy" lý do "Mở nhầm" vẫn tra cứu được; bước 3: nút Đóng bàn không còn |
| TC-11 | UC-05 | Gọi món và tính tiền dòng | Phục vụ | 1. Sau TC-08, ở T1-05 thêm đủ món của Đơn chuẩn 2. Cá chẽm nhập 1,2; Gỏi ngó sen chọn ghi chú nhanh "Ít cay" | Dòng Cá chẽm 540.000 ₫; dòng Bia 6 × 25.000 = 150.000 ₫; tạm tính tiền món 1.065.000 ₫; mọi dòng ở phần "Chưa gửi bếp" |
| TC-12 | UC-05 | Gửi bếp tách phiếu theo khu | Phục vụ, Bếp | 1. Sau TC-11 bấm Gửi bếp 2. Mở màn hình bếp, chọn Tất cả | 2 phiếu Lần 1 của T1-05: Bếp nguội (Gỏi ngó sen, ghi chú "Ít cay"), Bếp nóng (Bò lúc lắc, Cá chẽm 1,2 kg, Rau muống); 6 Bia Tiger không có phiếu, ở trạng thái Xong và nằm trong "Món chờ ra" |
| TC-13 | UC-05 | Gọi thêm lần 2 | Phục vụ, Bếp | 1. Sau TC-12 thêm 2 Nước ép cam → Gửi bếp | Phiếu Quầy bar của T1-05 ghi "Lần 2"; tiền món 1.155.000 ₫ |
| TC-14 | UC-05 | Trọng lượng ngoài giới hạn | Phục vụ | 1. Chạm Cá chẽm, nhập 0 2. Nhập 25 | Cả hai lần báo "Trọng lượng từ 0,1 đến 20 kg", không thêm dòng |
| TC-15 | UC-05 | Bấm Gửi bếp hai lần liên tiếp (chế độ `api`) | Phục vụ | 1. Thêm 1 Rau muống ở T1-06 2. Bấm Gửi bếp hai lần thật nhanh | Chỉ một phiếu Bếp nóng được tạo, lần gọi tăng 1 |

### 2.3. Màn hình bếp và ra món

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-16 | UC-06 | Phiếu mới hiện theo thời gian thực, lọc khu | Bếp, Phục vụ | 1. Màn hình bếp lọc Bếp nóng 2. Phục vụ gửi 1 Rau muống và 1 Nước ép cam từ T1-06 | Trong 3 giây phiếu Bếp nóng của T1-06 xuất hiện, viền nhấp nháy, có âm báo; phiếu Quầy bar không hiện ở bộ lọc Bếp nóng |
| TC-17 | UC-06 | Màu cảnh báo theo thời gian chờ | Bếp, Phục vụ | 1. Mở màn hình bếp, Bếp nóng 2. Phục vụ mở Sơ đồ bàn, tab Tầng 2 | Phiếu T2-04 (13/15 phút) màu vàng; phiếu T2-03 (16/15 phút) màu đỏ, nhãn "Trễ"; trên sơ đồ, thẻ T2-03 có biểu tượng món trễ, T2-04 không có |
| TC-18 | UC-06 | Món gấp lên đầu | Phục vụ, Bếp | 1. Gửi 1 Gỏi ngó sen từ T1-10 (không gấp) 2. Gửi 1 Gỏi ngó sen từ T1-05, bật Gấp 3. Màn hình bếp lọc Bếp nguội | Phiếu T1-05 đứng trước phiếu T1-10 dù gửi sau, có nhãn "GẤP" |
| TC-19 | UC-06 | Xong cả phiếu và hoàn tác | Bếp | 1. Sau TC-12, phiếu Bếp nóng T1-05 → Xong cả phiếu 2. Mở "Đã xong", chọn phiếu, Hoàn tác Rau muống | Bước 1: 3 món Xong, phiếu sang "Đã xong"; bước 2: Rau muống về "Đang làm", phiếu trở lại màn chính |
| TC-20 | UC-06 | Hoàn tác món đã ra | Bếp, Phục vụ | 1. Phục vụ bấm Đã ra Bò lúc lắc của T1-05 2. Bếp mở "Đã xong", Hoàn tác Bò lúc lắc | Từ chối, báo "Món đã ra cho khách" |
| TC-21 | UC-07 | Ra món | Bếp, Phục vụ | 1. Sau TC-12, bếp Xong cả phiếu Bếp nóng T1-05 2. Phục vụ xem Sơ đồ bàn 3. Bấm chuông → Ra hết ở T1-05 | Bước 2: thẻ T1-05 có huy hiệu 4 (Bia Tiger, Bò lúc lắc, Cá chẽm, Rau muống), có âm báo; bước 3: 4 dòng "Đã phục vụ", huy hiệu mất; Gỏi ngó sen vẫn "Chờ làm" |
| TC-22 | UC-07 | Hoàn tác khi bấm nhầm Đã ra | Phục vụ | 1. Gỏi ngó sen T1-05 đã Xong 2. Bấm Đã ra 3. Bấm "Hoàn tác" trên thông báo trong 10 giây | Gỏi ngó sen về "Xong", huy hiệu T1-05 tăng lại 1 |

### 2.4. Hủy món

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-23 | UC-08 | Hủy món bếp chưa làm | Phục vụ, Bếp | 1. Sau TC-13, chạm 2 Nước ép cam (Chờ làm) → Hủy món 2. Lý do Khách đổi ý → Xác nhận | Không cần duyệt; món "Đã hủy"; tiền món về 1.065.000 ₫; màn hình bếp Quầy bar hiện dòng gạch ngang "ĐÃ HỦY" tới khi bấm "Đã biết" |
| TC-24 | UC-08 | Hủy món bếp đang làm cần quản lý | Phục vụ, Quản lý | 1. Mở T2-03, chạm Lẩu thái hải sản (Đang làm) → Hủy món, lý do Chờ lâu 2. Hộp xác nhận nhập tài khoản `phucvu` 3. Nhập tài khoản `quanly` | Bước 2 từ chối, món giữ nguyên; bước 3 món "Đã hủy", lưu người hủy `phucvu`, người duyệt `quanly`, trạng thái lúc hủy "Đang làm" |
| TC-25 | UC-08 | Xóa món chưa gửi bếp | Phục vụ | 1. Ở T1-06 thêm 1 Rau muống, chưa gửi 2. Vuốt dòng sang trái → Xóa | Dòng biến mất, không hỏi lý do, không có trong báo cáo món hủy |

### 2.5. Chuyển bàn, gộp bàn

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-26 | UC-09 | Chuyển bàn | Phục vụ, Bếp | 1. Mở SV-01 → Chuyển bàn 2. Chọn T1-10 → Chuyển 3. Xem màn hình bếp | T1-10 Đang phục vụ, đủ món và 3 khách của SV-01, cùng mã hóa đơn; SV-01 Trống; phiếu Bếp nóng hiện "T1-10 (từ SV-01)" |
| TC-27 | UC-09 | Bàn đích khi chuyển | Phục vụ | 1. Mở SV-01 → Chuyển bàn 2. Chạm T1-06 3. Chạm T2-01 | Bước 2 không chọn được (bàn mờ); bước 3 cảnh báo "Bàn có khách đặt lúc 19:00" |
| TC-28 | UC-09 | Gộp bàn | Phục vụ | 1. T1-05 có Đơn chuẩn → Gộp bàn 2. Chọn T1-06 → Xác nhận | T1-05: 6 khách, tiền món 1.155.000 ₫, có 2 Nước ép cam của T1-06; T1-06 hiện "Đã gộp → T1-05"; chạm T1-06 mở màn Gọi món của T1-05 |
| TC-29 | UC-09 | Thanh toán bàn chính sau gộp | Thu ngân | 1. Sau TC-28 thanh toán T1-05 tiền mặt đủ tiền | Tổng thanh toán 1.310.000 ₫ (phí phục vụ 57.750 ₫, thuế 97.020 ₫, làm tròn +230 ₫); T1-05 và T1-06 cùng chuyển "Chờ dọn" |

### 2.6. Tách hóa đơn

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-30 | UC-10 | Tách theo món | Thu ngân | 1. T1-05 có Đơn chuẩn → Tách hóa đơn 2. Chuyển Cá chẽm 1,2 kg và 2 trong 6 lon Bia sang hóa đơn mới 3. Xác nhận tách | Hóa đơn mới: tiền món 590.000 ₫, phí phục vụ 29.500 ₫, thuế 49.560 ₫, làm tròn −60 ₫, tổng 669.000 ₫. Hóa đơn gốc: tiền món 475.000 ₫, phí phục vụ 23.750 ₫, thuế 39.900 ₫, làm tròn +350 ₫, tổng 539.000 ₫; dòng Bia còn 4 lon; T1-05 hiện 2 tab hóa đơn, hóa đơn mới có mã mới |
| TC-31 | UC-10 | Tách hết món | Thu ngân | 1. Đơn chuẩn → Tách hóa đơn 2. Chuyển toàn bộ món sang hóa đơn mới 3. Xác nhận tách | Báo "Hóa đơn gốc phải còn ít nhất 1 món", không tách |
| TC-32 | UC-10 | Chia đều 3 người | Thu ngân | 1. Đơn chuẩn → Chia đều → nhập 3 | Phần 1: 404.000 ₫, phần 2: 402.000 ₫, phần 3: 402.000 ₫; tổng 3 phần 1.208.000 ₫ |
| TC-33 | UC-10 | Khóa hóa đơn sau khi thu một phần | Thu ngân, Phục vụ | 1. Sau TC-32 thu phần 1 tiền mặt 404.000 ₫ 2. Thử đổi số phần, giảm giá 3. Đổi sang Phục vụ, thử gọi thêm món, chuyển bàn | Mọi thao tác ở bước 2, 3 bị chặn, báo "Hóa đơn đang thu tiền"; bàn chỉ chuyển "Chờ dọn" khi thu đủ 3 phần |

### 2.7. Thanh toán và trả bàn

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-34 | UC-11 | In tạm tính và tính tổng | Phục vụ | 1. T1-05 có Đơn chuẩn → In tạm tính | Phiếu có dòng "PHIẾU TẠM TÍNH": tiền món 1.065.000 ₫, phí phục vụ 5% 53.250 ₫, thuế GTGT 8% 89.460 ₫, làm tròn +290 ₫, tổng 1.208.000 ₫; T1-05 chuyển "Chờ thanh toán" màu vàng |
| TC-35 | UC-11 | Thanh toán kết hợp và trả bàn | Thu ngân, Phục vụ | 1. Thanh toán T1-05 (1.208.000 ₫): Chuyển khoản 1.000.000 ₫ → Đã nhận tiền 2. Tiền mặt, khách đưa 300.000 ₫ → Thu 3. Phục vụ bấm Dọn xong | Bước 1: QR có số tiền 1.000.000 ₫, nội dung là mã hóa đơn; còn phải thu 208.000 ₫. Bước 2: tiền thối 92.000 ₫; hóa đơn "Đã thanh toán"; bản in có 2 lượt thu; T1-05 "Chờ dọn". Bước 3: T1-05 "Trống" |
| TC-36 | UC-11 | Còn món chưa gửi bếp | Phục vụ, Thu ngân | 1. Ở T1-05 thêm 1 Rau muống, chưa gửi 2. Bấm In tạm tính, Thanh toán | Hai nút bị khóa, báo "Còn 1 món chưa gửi bếp" |
| TC-37 | UC-11 | Giảm giá trong hạn mức | Thu ngân | 1. Đơn chuẩn → Thanh toán → Giảm giá 10%, lý do Khách quen | Giảm 106.000 ₫ (106.500 ₫ làm tròn xuống); phí phục vụ 47.950 ₫; thuế 80.556 ₫; làm tròn +494 ₫; tổng 1.088.000 ₫; không cần quản lý |
| TC-38 | UC-11 | Giảm giá vượt hạn mức | Thu ngân, Quản lý | 1. Đơn chuẩn → Giảm giá 15% 2. Hộp xác nhận nhập tài khoản `quanly` | Giảm 159.000 ₫ (159.750 ₫ làm tròn xuống); phí phục vụ 45.300 ₫; thuế 76.104 ₫; làm tròn −404 ₫; tổng 1.027.000 ₫; hóa đơn ghi người duyệt `quanly` |
| TC-39 | UC-11 | Gọi thêm sau khi in tạm tính | Phục vụ | 1. Sau TC-34 thêm 1 Bia Tiger → Gửi bếp | T1-05 về "Đang phục vụ"; thông báo "Phiếu tạm tính đã in hết hiệu lực"; tiền món 1.090.000 ₫ |

### 2.8. Hóa đơn, đặt bàn, tổng quan, báo cáo, phân quyền

| Mã | UC | Tình huống | Vai trò | Các bước | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-40 | UC-12 | In lại và hủy hóa đơn | Quản lý | 1. Sau TC-35 mở Danh sách hóa đơn, chọn hóa đơn T1-05 2. In lại 3. Hủy hóa đơn, lý do "Nhập nhầm" | Bản in có dòng "IN LẠI"; hóa đơn "Đã hủy", doanh thu hôm nay giảm 1.065.000 ₫ |
| TC-41 | UC-13 | Đặt bàn trùng giờ | Thu ngân | 1. Đặt T2-01 ngày mai 19:00, 8 khách 2. Đặt T2-01 ngày mai 20:00 3. Đặt T2-01 ngày mai 21:00 | Bước 2 báo trùng (bàn đã giữ tới 21:00); bước 3 lưu được, mã `DB{yyMMdd}{nnn}` |
| TC-42 | UC-13 | Nhận bàn và trừ tiền cọc | Phục vụ, Thu ngân | 1. Đặt bàn → chọn đặt bàn anh Trần Minh Quân → Nhận bàn 2. Gọi 2 Lẩu thái hải sản, gửi bếp 3. Thu ngân mở Thanh toán T2-01 | T2-01 "Đang phục vụ" 8 khách, có ghi chú đặt bàn; tổng thanh toán 828.000 ₫; có lượt thu "Tiền cọc" 500.000 ₫; còn phải thu 328.000 ₫ |
| TC-43 | UC-14 | Tổng quan cập nhật sau thanh toán | Quản lý, Thu ngân | 1. Ghi lại doanh thu thuần và số hóa đơn hôm nay 2. Thu ngân thanh toán Đơn chuẩn T1-05 3. Quay lại Tổng quan | Doanh thu thuần tăng đúng 1.065.000 ₫ (không gồm phí phục vụ, thuế); số hóa đơn tăng 1 |
| TC-44 | UC-15 | Báo cáo món hủy | Quản lý | 1. Sau TC-24 mở Báo cáo → Món hủy, hôm nay | Có Lẩu thái hải sản, 1 nồi, 365.000 ₫, lý do Chờ lâu, người hủy `phucvu`, người duyệt `quanly`, trạng thái lúc hủy "Đang làm" |
| TC-45 | UC-06 | Phân quyền theo vai trò | Bếp, Phục vụ | 1. Đăng nhập nhanh Bếp 2. Gõ URL `/tables` 3. Đăng nhập nhanh Phục vụ, gõ URL `/reports` | Bước 1 vào thẳng Màn hình bếp; bước 2 và 3 chuyển tới `/forbidden` |

---

## 3. Biên bản chạy thử

| Ngày | Người test | Chế độ | Số TC đạt / tổng | Lỗi ghi nhận |
| :--- | :--- | :--- | :---: | :--- |
| 14/10/2026 | Claude (kiểm thử tự động trên trình duyệt) | `api` (BE .NET 8 + Postgres, SignalR `/hubs/pos`; hai tab Phục vụ/Thu ngân/Quản lý và Bếp) | 45 / 45 | Đã sửa: (1) BE chuyển bàn, gộp bàn đổi bàn sai phiếu bếp (phiếu "Đang chờ" của hóa đơn gốc đã tách bị bỏ lại bàn cũ); (2) BE hóa đơn tách lấy giờ mở mới, mất `prebillPrintedAt`; (3) BE người có quyền duyệt gửi kèm token thì ghi người duyệt theo token; (4) TC-15: bấm Gửi bếp hai lần gần như cùng lúc trả 409 "Bàn vừa được cập nhật" cho lần sau (cũng sửa cho mở bàn, thu tiền); (5) FE thanh "Mất kết nối, đang thử lại" hiện oan 5 giây mỗi lần tải trang (hub SignalR bị dừng giữa lúc thương lượng); (6) FE chuyển bàn xong không sang màn bàn mới, không báo "Đã chuyển"; (7) FE đổi vai trò nhanh khi đang ở trang Thanh toán rơi vào `/forbidden` thay vì trang chủ; (8) mock `/api/approvals` chưa đếm sai mật khẩu (BR-SYS-03). TC-04, TC-41 tạo dữ liệu qua API rồi kiểm trên giao diện (form Thêm món, báo trùng giờ đặt bàn kiểm bằng giao diện). Lỗi `/orders` chi tiết treo "Đang tải…": không tái hiện được ở cả hai chế độ (mở liên tiếp, đổi dòng khi đang tải, có tab Bếp mở song song) |
| 14/10/2026 | Claude (kiểm thử tự động trên trình duyệt) | `mock` | Kiểm lại phần sửa | Không chạy lại đủ 44 TC (TC-15 chỉ cho `api`); kiểm lại sau khi sửa: số Tổng quan sau đặt lại dữ liệu khớp BE (14/30 bàn, 50 khách, 18.092.000 ₫, 17 hóa đơn), hộp Quản lý xác nhận tạm khóa sau 5 lần sai mật khẩu, chi tiết Hóa đơn mở bình thường; quy tắc đổi bàn phiếu bếp khi gộp bàn sửa giống BE |

# Kịch bản demo — Quản lý Nhà hàng

> Dùng khi trình bày cho chủ nhà hàng, quán ăn có phục vụ tại bàn. Thời lượng 12–15 phút. Đi theo một buổi trưa đông khách: mở bàn, gọi món, bếp làm món, xử lý sự cố giữa bữa, tách hóa đơn, thanh toán, xem báo cáo.

---

## 1. Chuẩn bị trước buổi demo

- [ ] Mở sẵn link demo, thử "Đăng nhập nhanh" cả 5 vai trò
- [ ] Đặt lại dữ liệu demo (thanh công cụ demo → Đặt lại dữ liệu) để có 90 ngày số liệu và 12–15 bàn đang phục vụ tại giờ demo
- [ ] Đổi tên nhà hàng, logo, màu theo thương hiệu khách (Cài đặt → Thương hiệu) nếu đã biết
- [ ] Mở hai tab cạnh nhau (hoặc hai màn hình): tab 1280×800 đăng nhập `phucvu` làm tablet phục vụ, tab còn lại đăng nhập `bep` làm màn hình bếp. Mỗi tab giữ vai trò riêng, chạy được ở cả chế độ `mock` và `api`
- [ ] Bật loa máy tính để khách nghe âm báo phiếu mới ở bếp và món xong ở phục vụ
- [ ] Kiểm tra dữ liệu mẫu: T1-05 trống, SV-01 đang phục vụ, T2-03 có phiếu đỏ (Lẩu thái hải sản đang làm), T2-05 và T2-06 đang phục vụ
- [ ] Ghi nhớ số liệu: Cá chẽm hấp Hồng Kông 450.000 ₫/kg, phí phục vụ 5%, thuế GTGT 8%

| Link | Ghi chú |
| :--- | :--- |
| FE | `http://localhost:3103` hoặc link online |
| Swagger | `https://localhost:7103/swagger` (khi khách hỏi về tích hợp) |

| Tài khoản | Vai trò | Dùng để cho xem |
| :--- | :--- | :--- |
| `admin` | Quản trị viên | Phân quyền, phí phục vụ, thuế suất, thương hiệu |
| `quanly` | Quản lý | Tổng quan, đặt bàn, duyệt hủy món, báo cáo |
| `phucvu` | Phục vụ | Sơ đồ bàn, mở bàn, gọi món, ra món, chuyển và gộp bàn |
| `bep` | Bếp | Màn hình bếp, báo xong, báo hết món |
| `thungan` | Thu ngân | Tách hóa đơn, chia đều, thanh toán |

Mật khẩu: giá trị `DEMO_PASSWORD` trong `.env`, hoặc bấm "Đăng nhập nhanh".

---

## 2. Câu chuyện demo

> Mở đầu: "Anh/chị hình dung bây giờ là 11 giờ 30, nhà hàng bắt đầu đông khách trưa. Em đi đúng một bữa trưa của nhà hàng, từ lúc khách bước vào tới lúc trả bàn."

| # | Vai trò | Thao tác | Điểm cần nhấn mạnh |
| :---: | :--- | :--- | :--- |
| 1 | Quản lý | Đăng nhập, mở Tổng quan: 14/30 bàn đang phục vụ, khách đang ngồi, doanh thu trưa, 2 món trễ | Không cần đi một vòng nhà hàng vẫn biết bàn nào kín, bếp nào đang nghẽn |
| 2 | Quản lý | Mở Đặt bàn, thêm đặt bàn tối nay: anh Trần Minh Quân, 19:00, 8 khách, bàn T2-01, cọc 500.000 ₫ | Không đặt trùng bàn; tới giờ bàn tự hiện "Đã đặt" trên sơ đồ, khách đến nhận bàn một chạm, cọc tự trừ khi thanh toán |
| 3 | Phục vụ | Đổi sang Phục vụ; xem Sơ đồ bàn Tầng 1: màu trạng thái, số khách, thời gian ngồi, tạm tính; mở bàn T1-05 cho 4 khách | Phục vụ không chạy ra quầy hỏi bàn trống; nhìn thẻ bàn là biết bàn nào ngồi lâu |
| 4 | Phục vụ | Gọi món: Gỏi ngó sen tôm thịt (Gấp, ít cay), Bò lúc lắc khoai tây, Cá chẽm hấp Hồng Kông nhập 1,2 kg, Rau muống xào tỏi, 6 Bia Tiger; bấm Gửi bếp | Món hải sản theo cân nhập số kg, giá tự tính 540.000 ₫; một lần gửi tự tách phiếu bếp nóng, bếp nguội; bia không qua bếp, mang ra ngay |
| 5 | Bếp | Chuyển sang màn hình bếp: phiếu T1-05 vừa hiện kèm âm báo, gỏi Gấp đứng đầu; phiếu T2-03 đỏ vì Lẩu thái chờ 16 phút | Bếp không đọc giấy viết tay, không sót phiếu; món chờ lâu tự đỏ, ai nhìn cũng thấy |
| 6 | Bếp | Lọc Bếp nóng, bật chế độ tổng hợp: 5 đĩa Rau muống đang chờ ở nhiều bàn, làm một mẻ; bấm Xong phiếu Bếp nguội của T1-05 | Bếp làm theo mẻ nhanh hơn; báo xong một chạm, phục vụ biết ngay |
| 7 | Phục vụ | Thẻ T1-05 hiện huy hiệu món chờ ra, bấm Đã ra. Khách T2-03 chờ lâu đòi hủy Lẩu thái đang nấu: hệ thống bắt quản lý xác nhận, nhập tài khoản `quanly` | Phục vụ không tự hủy được món bếp đã làm; mỗi món hủy có lý do, người hủy, người duyệt, chống thất thoát |
| 8 | Phục vụ | Trời đổ mưa: chuyển bàn SV-01 vào T1-10. Nhóm khách T2-06 muốn trả chung với T2-05: gộp T2-06 vào T2-05 | Chuyển, gộp một chạm, món không mất; bếp tự thấy món đang làm chuyển sang bàn nào |
| 9 | Phục vụ | Khách T1-05 gọi tính tiền: In tạm tính; bàn chuyển màu vàng "Chờ thanh toán" | Khách xem trước từng món, phí phục vụ, thuế; tránh tranh cãi lúc trả tiền |
| 10 | Thu ngân | Đổi sang Thu ngân. Một khách muốn trả riêng phần cá và 2 lon bia: tách hóa đơn; mỗi hóa đơn tự tính phí phục vụ 5%, thuế 8%, làm tròn: 669.000 ₫ và 539.000 ₫ | Tách bill không cần máy tính tay, không sai thuế, không cãi nhau ở quầy |
| 11 | Thu ngân | Hóa đơn 669.000 ₫ thu chuyển khoản QR; hóa đơn 539.000 ₫ thu tiền mặt, khách đưa 600.000 ₫, thối 61.000 ₫; in hóa đơn; bàn chuyển "Chờ dọn", phục vụ bấm Dọn xong | QR có sẵn số tiền, khách không gõ sai; bàn trống được báo ngay để đón lượt khách tiếp theo |
| 12 | Quản lý | Đổi sang Quản lý, mở Báo cáo: Món hủy (thấy Lẩu thái vừa hủy, người duyệt `quanly`), Vận hành bếp (thời gian ra món trung bình theo khu, tỉ lệ trễ theo giờ), doanh thu 30 ngày | Biết ai hủy món, bếp nào chậm, giờ nào cần thêm người, món nào đáng giữ |

> Kết: "Toàn bộ dữ liệu anh/chị vừa thấy là dữ liệu mẫu. Bản triển khai sẽ dựng đúng sơ đồ bàn, thực đơn, khu bếp của nhà hàng mình. Phần phân quyền tới từng nút và đổi phí phục vụ, thuế suất em có thể cho xem thêm ở vai trò Quản trị viên."

---

## 3. Câu hỏi khách hay hỏi

| Câu hỏi | Trả lời gợi ý |
| :--- | :--- |
| Bếp quen phiếu giấy, có in phiếu bếp ra máy in được không? | Có. Demo dùng màn hình bếp thay phiếu giấy. Bản triển khai in phiếu thẳng ra máy in nhiệt của từng khu (bếp nóng, bếp nguội, quầy bar) qua mạng nội bộ, hoặc dùng cả hai. |
| Khách tự gọi món bằng QR tại bàn được không? | Có demo Menu QR Gọi món riêng. Khi triển khai có thể ghép: đơn khách gọi qua QR vào thẳng màn hình bếp và sơ đồ bàn này. |
| Phí phục vụ, VAT có chỉnh được không? Nhà hàng tôi giá đã gồm VAT. | Phí phục vụ và thuế suất chỉnh trong Cài đặt (demo mặc định 5% và 8%), tắt phí phục vụ được. Giá đã gồm VAT là tùy chọn bản triển khai sẽ bật theo cách nhà hàng niêm yết. |
| Hải sản bán theo kg tính thế nào? | Món khai báo "theo trọng lượng"; phục vụ cân trước mặt khách rồi nhập số kg, hệ thống tự tính tiền và in rõ số kg trên hóa đơn. |
| Phục vụ hủy món để ăn gian thì sao? | Món bếp chưa làm thì hủy được nhưng bắt buộc lý do. Món bếp đã làm phải có quản lý nhập tài khoản duyệt. Báo cáo món hủy ghi rõ ai hủy, ai duyệt, lý do. |
| Có quản lý ca thu ngân, đối soát tiền cuối ca không? | Demo này tập trung phục vụ tại bàn. Phần mở ca, chốt ca, đối soát tiền mặt đã có ở demo POS Quán Cafe, ghép vào được khi triển khai. |
| Có trừ kho nguyên liệu theo món không? | Demo chưa có. Có demo Quản lý kho riêng; bản triển khai nối định lượng từng món để trừ kho tự động. |
| Mất Internet thì sao? | Bản demo cần mạng. Bản triển khai có thể đặt máy chủ ngay tại nhà hàng để tablet và màn hình bếp vẫn chạy trong mạng nội bộ khi mất Internet. |
| Có xuất hóa đơn điện tử không? | Bản triển khai kết nối nhà cung cấp hóa đơn điện tử khởi tạo từ máy tính tiền mà nhà hàng đang dùng. Demo chưa kết nối. |
| Cần mua tablet loại nào? | Tablet Android hoặc iPad 8–10 inch có trình duyệt là đủ. Màn hình bếp dùng TV gắn máy tính mini hoặc tablet 15 inch. |

---

## 4. Sau buổi demo

- [ ] Ghi lại yêu cầu khách nêu thêm vào `01-TONG-QUAN-NGHIEP-VU.md`
- [ ] Ghi lại số tầng, khu vực, số bàn, số khu bếp, có thu phí phục vụ không, giá đã gồm VAT chưa, đang dùng máy in bếp hay chưa
- [ ] Gửi link demo và tài khoản `phucvu`, `bep`, `thungan`, `quanly` cho khách tự trải nghiệm (nếu đồng ý)

using Domain.Common;

namespace Domain.Entities.Pos;

/// <summary>
/// Lỗi nghiệp vụ 400 có mã <c>code</c> trong ProblemDetails để FE rẽ nhánh không cần so chuỗi (07 §2.20).
/// <c>detail</c> đúng câu trong bảng mã lỗi. Mã 409 (<see cref="DuLieuCu"/>, <see cref="BanVuaDuocMo"/>,
/// <see cref="TrungDatBan"/>) ném ở Application bằng <c>ConflictException</c>.
/// </summary>
public static class PosErrors
{
    public const string BanChoDon = "BanChoDon";
    public const string BanDangCoKhach = "BanDangCoKhach";
    public const string HoaDonDangThuTien = "HoaDonDangThuTien";
    public const string ConMonChuaGui = "ConMonChuaGui";
    public const string KhongCoMonMoi = "KhongCoMonMoi";
    public const string MonTamHet = "MonTamHet";
    public const string BanDaGuiBep = "BanDaGuiBep";
    public const string CanQuanLyDuyet = "CanQuanLyDuyet";
    public const string MaXacNhanKhongHopLe = "MaXacNhanKhongHopLe";
    public const string VuotHanMucGiamGia = "VuotHanMucGiamGia";
    public const string MonDaRa = "MonDaRa";
    public const string BanDichKhongHopLe = "BanDichKhongHopLe";
    public const string BanDangTachHoaDon = "BanDangTachHoaDon";
    public const string HoaDonGocHetMon = "HoaDonGocHetMon";
    public const string QuaSoHoaDon = "QuaSoHoaDon";
    public const string DangChiaDeu = "DangChiaDeu";
    public const string VuotSoConPhaiThu = "VuotSoConPhaiThu";
    public const string TienMatThieu = "TienMatThieu";
    public const string SaiTienPhan = "SaiTienPhan";
    public const string KhongHuyDuocHoaDon = "KhongHuyDuocHoaDon";
    public const string DuLieuCu = "DuLieuCu";
    public const string BanVuaDuocMo = "BanVuaDuocMo";
    public const string TrungDatBan = "TrungDatBan";

    public const string OrderLockedMessage = "Hóa đơn đang thu tiền";
    public const string OrderClosedMessage = "Hóa đơn đã đóng";
    public const string StaleMessage = "Bàn vừa được cập nhật, đang tải lại";
    public const string TableOccupiedMessage = "Bàn đang có khách";
    public const string TableNotClearedMessage = "Bàn chưa dọn xong";
    public const string NoNewItemsMessage = "Chưa có món mới để gửi bếp";
    public const string TableAlreadySentMessage = "Bàn đã gửi bếp, không đóng được";
    public const string NeedApprovalMessage = "Món bếp đã làm, cần quản lý xác nhận";
    public const string InvalidApprovalMessage = "Mã xác nhận của quản lý không hợp lệ, xác nhận lại";
    public const string ItemServedMessage = "Món đã ra cho khách";
    public const string TransferTargetMessage = "Chỉ chuyển sang bàn đang trống";
    public const string MergeTargetMessage = "Chỉ gộp bàn đang phục vụ hoặc chờ thanh toán";
    public const string MoveTargetMessage = "Bàn nhận món phải đang phục vụ hoặc chờ thanh toán";
    public const string TableSplitMessage = "Bàn đang tách hóa đơn, không chuyển hoặc gộp được";
    public const string OriginalEmptyMessage = "Hóa đơn gốc phải còn ít nhất 1 món";
    public const string TooManyOrdersMessage = "Tối đa 10 hóa đơn mỗi bàn";
    public const string SplittingEquallyMessage = "Hóa đơn đang chia đều, hủy chia đều trước khi tách";
    public const string CashShortMessage = "Tiền khách đưa ít hơn số còn phải thu";
    public const string CancelOnlyTodayMessage = "Chỉ hủy được hóa đơn thanh toán trong ngày";
    public const string NoItemsMessage = "Hóa đơn chưa có món";

    public static DomainException Business(string code, string message, IReadOnlyDictionary<string, object?>? extra = null)
    {
        var extensions = new Dictionary<string, object?> { ["code"] = code };
        if (extra is not null)
        {
            foreach (var (key, value) in extra)
                extensions[key] = value;
        }

        return new DomainException(message, extensions);
    }

    /// <summary>Lỗi 400 vừa gắn với một trường (<c>errors</c>) vừa có <c>code</c> (vd thu tiền vượt số còn phải thu).</summary>
    public static DomainException Field(string code, string field, string message) =>
        Business(code, message, new Dictionary<string, object?>
        {
            ["errors"] = new Dictionary<string, string[]> { [field] = [message] }
        });

    public static DomainException OrderLocked() => Business(HoaDonDangThuTien, OrderLockedMessage);

    public static DomainException OrderClosed() => new(OrderClosedMessage);

    public static DomainException UnsentItems(int count) =>
        Business(ConMonChuaGui, $"Còn {count} món chưa gửi bếp", new Dictionary<string, object?> { ["unsentCount"] = count });

    public static DomainException TableOccupied() => Business(BanDangCoKhach, TableOccupiedMessage);
}

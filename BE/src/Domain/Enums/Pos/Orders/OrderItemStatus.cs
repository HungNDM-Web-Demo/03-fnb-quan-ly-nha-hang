namespace Domain.Enums.Pos.Orders;

/// <summary>Trạng thái món gọi (06 §4, BR-10). Chỉ <c>ChoGoi</c>…<c>DaPhucVu</c> tính tiền (BR-05).</summary>
public enum OrderItemStatus
{
    /// <summary>Món nháp, lưu phía máy chủ (07 §5 quyết định 1); không tính tiền.</summary>
    ChuaGui = 0,

    /// <summary>P3 (FR-14), dành sẵn.</summary>
    ChoGoi = 1,

    ChoLam = 2,
    DangLam = 3,
    Xong = 4,
    DaPhucVu = 5,

    /// <summary>Không tính tiền.</summary>
    DaHuy = 6
}

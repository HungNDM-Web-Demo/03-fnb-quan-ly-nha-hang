namespace Domain.Enums.Pos.Orders;

/// <summary>Thao tác cần quản lý xác nhận bằng tài khoản ngay trên tablet (SCR-07, 07 §2.12).</summary>
public enum ApprovalAction
{
    /// <summary>Hủy món bếp đã làm (BR-13), cần <c>order-items.void-approve</c>.</summary>
    HuyMon = 0,

    /// <summary>Giảm giá vượt hạn mức (BR-08), cần <c>orders.discount-override</c>.</summary>
    GiamGia = 1
}

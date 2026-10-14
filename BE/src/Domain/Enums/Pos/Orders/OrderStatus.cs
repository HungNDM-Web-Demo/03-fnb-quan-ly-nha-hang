namespace Domain.Enums.Pos.Orders;

/// <summary>Trạng thái hóa đơn (06 §4 <c>Pos_Orders.Status</c>, SRS §5.2).</summary>
public enum OrderStatus
{
    /// <summary>Mở bàn hoặc tách hóa đơn.</summary>
    DangMo = 0,

    /// <summary>Có lượt thu không phải tiền cọc, còn phải thu &gt; 0; hóa đơn bị khóa (BR-22).</summary>
    DangThu = 1,

    DaThanhToan = 2,

    /// <summary>Hóa đơn bàn phụ đã gộp vào bàn chính, tiền 0.</summary>
    DaGop = 3,

    /// <summary>Mở nhầm hoặc quản lý hủy trong ngày (BR-03, BR-23).</summary>
    DaHuy = 4
}

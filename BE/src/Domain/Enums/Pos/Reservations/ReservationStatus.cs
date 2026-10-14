namespace Domain.Enums.Pos.Reservations;

/// <summary>Trạng thái đặt bàn (06 §4, BR-24). Nhãn "Trễ" chỉ để hiển thị.</summary>
public enum ReservationStatus
{
    ChoDen = 0,
    DaNhanBan = 1,

    /// <summary>Quá giờ đến 30 phút; service đổi lười khi đọc (07 §5 quyết định 12).</summary>
    KhongDen = 2,

    DaHuy = 3
}

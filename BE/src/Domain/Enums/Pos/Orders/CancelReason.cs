namespace Domain.Enums.Pos.Orders;

/// <summary>Lý do hủy món (BR-13). <see cref="HetMon"/> chỉ bếp dùng khi báo hết món (BR-14).</summary>
public enum CancelReason
{
    KhachDoiY = 0,
    GoiNham = 1,
    ChoLau = 2,
    Khac = 3,
    HetMon = 4
}

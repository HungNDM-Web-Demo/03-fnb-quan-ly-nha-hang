namespace Domain.Enums.Pos.Orders;

/// <summary>Phương thức của một lượt thu (06 §4). <see cref="TienCoc"/> chỉ hệ thống tạo khi nhận bàn (BR-25).</summary>
public enum PaymentMethod
{
    TienMat = 0,
    ChuyenKhoan = 1,
    The = 2,
    TienCoc = 3
}

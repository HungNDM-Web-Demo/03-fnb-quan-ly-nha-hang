namespace Domain.Enums.Pos.Tables;

/// <summary>
/// Trạng thái bàn (06 §4, BR-02). <see cref="DaDat"/> không lưu: API suy ra khi bàn <see cref="Trong"/> có đặt bàn
/// "Chờ đến" trong cửa sổ [giờ đến − 60 phút, giờ đến + 30 phút] (07 §3.9).
/// </summary>
public enum TableStatus
{
    Trong = 0,
    DaDat = 1,
    DangPhucVu = 2,
    ChoThanhToan = 3,
    ChoDon = 4,
    DaGop = 5
}

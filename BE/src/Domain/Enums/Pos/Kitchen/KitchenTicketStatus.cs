namespace Domain.Enums.Pos.Kitchen;

/// <summary>
/// Trạng thái phiếu bếp (06 §4): <see cref="DangCho"/> khi còn món Chờ làm, Đang làm hoặc món hủy bếp chưa bấm "Đã biết";
/// ngược lại <see cref="DaXong"/> (BR-10).
/// </summary>
public enum KitchenTicketStatus
{
    DangCho = 0,
    DaXong = 1
}

namespace Domain.Enums.Pos.MenuItems;

/// <summary>Khu chế biến (SRS §2.4). <see cref="KhongQuaBep"/> không tạo phiếu bếp, gửi là "Xong" ngay (BR-09).</summary>
public enum KitchenStation
{
    BepNong = 0,
    BepNguoi = 1,
    QuayBar = 2,
    KhongQuaBep = 3
}

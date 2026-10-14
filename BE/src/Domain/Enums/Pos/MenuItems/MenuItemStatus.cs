namespace Domain.Enums.Pos.MenuItems;

/// <summary>Trạng thái món trong DTO, suy ra từ hai cờ: <c>An</c> &gt; <c>TamHet</c> &gt; <c>DangBan</c> (06 §4).</summary>
public enum MenuItemStatus
{
    DangBan = 0,
    TamHet = 1,
    An = 2
}

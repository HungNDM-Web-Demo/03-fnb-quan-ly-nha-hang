namespace Domain.Enums.Pos.MenuItems;

/// <summary>Cách tính tiền món (BR-04): theo suất (số nguyên 1–99) hoặc theo trọng lượng (kg 0,1–20).</summary>
public enum PricingType
{
    TheoSuat = 0,
    TheoTrongLuong = 1
}

using Domain.Base;
using Domain.Common;
using Domain.Enums.Pos.MenuItems;

namespace Domain.Entities.Pos.MenuItems;

/// <summary>
/// Món (bảng <c>Pos_MenuItems</c>, FR-07). Món đã từng gọi không xóa được, chỉ ẩn (BR-28); món gọi chụp tên, giá lúc gọi.
/// Món theo trọng lượng luôn đơn vị <c>kg</c>; món không qua bếp không có thời gian chuẩn.
/// </summary>
public class MenuItem : BaseEntity, ICreationTracked, IModificationTracked, ISoftDelete
{
    public const int CodeMaxLength = 10;
    public const int NameMaxLength = 150;
    public const int ImageUrlMaxLength = 500;
    public const int DescriptionMaxLength = 500;
    public const int UnitMaxLength = 20;
    public const string WeightUnit = "kg";

    private MenuItem()
    {
    }

    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public Guid CategoryId { get; private set; }
    public string? ImageUrl { get; private set; }
    public string? Description { get; private set; }
    public string Unit { get; private set; } = string.Empty;
    public PricingType PricingType { get; private set; }
    public decimal Price { get; private set; }
    public KitchenStation Station { get; private set; }
    public int? PrepMinutes { get; private set; }
    public bool IsSoldOut { get; private set; }
    public bool IsHidden { get; private set; }
    public int SortOrder { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }

    public Category? Category { get; private set; }

    /// <summary><c>An</c> &gt; <c>TamHet</c> &gt; <c>DangBan</c>.</summary>
    public MenuItemStatus Status => IsHidden ? MenuItemStatus.An : IsSoldOut ? MenuItemStatus.TamHet : MenuItemStatus.DangBan;

    public static MenuItem Create(
        string code,
        string name,
        Guid categoryId,
        string? description,
        string unit,
        PricingType pricingType,
        decimal price,
        KitchenStation station,
        int? prepMinutes,
        int sortOrder)
    {
        var item = new MenuItem();
        item.Update(code, name, categoryId, description, unit, pricingType, price, station, prepMinutes, sortOrder);
        return item;
    }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public void Update(
        string code,
        string name,
        Guid categoryId,
        string? description,
        string unit,
        PricingType pricingType,
        decimal price,
        KitchenStation station,
        int? prepMinutes,
        int sortOrder)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("Mã món không được để trống.");
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("Tên món không được để trống.");
        if (price <= 0)
            throw new DomainException("Đơn giá phải lớn hơn 0");
        if (!PosRules.IsThousandMultiple(price))
            throw new DomainException("Đơn giá phải là bội số 1.000 ₫");
        if (station != KitchenStation.KhongQuaBep && prepMinutes is not (>= PosRules.PrepMinutesMin and <= PosRules.PrepMinutesMax))
            throw new DomainException("Thời gian chuẩn từ 1 đến 120 phút");

        Code = NormalizeCode(code);
        Name = name.Trim();
        CategoryId = categoryId;
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        PricingType = pricingType;
        Unit = pricingType == PricingType.TheoTrongLuong ? WeightUnit : unit.Trim();
        Price = price;
        Station = station;
        PrepMinutes = station == KitchenStation.KhongQuaBep ? null : prepMinutes;
        SortOrder = sortOrder;
    }

    public void SetImage(string? imageUrl) => ImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl.Trim();

    public void SetSoldOut(bool isSoldOut) => IsSoldOut = isSoldOut;

    public void SetHidden(bool isHidden) => IsHidden = isHidden;
}

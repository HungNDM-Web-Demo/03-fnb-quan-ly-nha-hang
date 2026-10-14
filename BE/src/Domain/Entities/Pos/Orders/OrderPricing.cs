using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Domain.Entities.Pos.Orders;

/// <summary>Kết quả tính tiền một hóa đơn (07 §3.2–3.4).</summary>
public sealed record OrderTotals(
    decimal Subtotal,
    decimal DiscountAmount,
    decimal ServiceCharge,
    decimal VatAmount,
    decimal GrossTotal,
    decimal Rounding,
    decimal Total);

/// <summary>Một phần khi chia đều (07 §3.5).</summary>
public sealed record EqualShare(int No, decimal Amount);

/// <summary>
/// Công thức tính tiền (07 §3, BR-04..BR-08, BR-19), thuần, không đọc DB. FE <c>features/pos/lib/pricing.ts</c> cho cùng số
/// với cùng đầu vào; số BE trả là chính thức. Các hàm làm tròn chỉ áp cho số không âm.
/// </summary>
public static class OrderPricing
{
    /// <summary>Làm tròn tới bội số 1.000 gần nhất, phần lẻ từ 500 lên.</summary>
    public static decimal Round1000(decimal x) => Math.Floor((x + 500m) / 1000m) * 1000m;

    /// <summary>Làm tròn xuống tới bội số 1.000.</summary>
    public static decimal Floor1000(decimal x) => Math.Floor(x / 1000m) * 1000m;

    /// <summary>Làm tròn tới 1 ₫, phần lẻ từ 0,5 lên.</summary>
    public static decimal RoundHalfUp(decimal x) => Math.Floor(x + 0.5m);

    /// <summary>BR-04 (07 §3.1): theo suất = đơn giá × số lượng; theo trọng lượng làm tròn tới 1.000 ₫.</summary>
    public static decimal LineTotal(PricingType pricingType, decimal unitPrice, decimal quantity) =>
        pricingType == PricingType.TheoTrongLuong ? Round1000(unitPrice * quantity) : unitPrice * quantity;

    /// <summary>BR-05: dòng tính tiền là ChoGoi, ChoLam, DangLam, Xong, DaPhucVu.</summary>
    public static bool IsBillable(OrderItemStatus status) =>
        status is OrderItemStatus.ChoGoi or OrderItemStatus.ChoLam or OrderItemStatus.DangLam or OrderItemStatus.Xong or OrderItemStatus.DaPhucVu;

    /// <summary>BR-08 (07 §3.3 bước 1): phần trăm làm tròn xuống bội số 1.000; số tiền không vượt tiền món.</summary>
    public static decimal DiscountAmount(DiscountType? type, decimal? value, decimal subtotal)
    {
        if (type is null || value is null || subtotal <= 0)
            return 0;

        return type == DiscountType.PhanTram
            ? Floor1000(subtotal * value.Value / 100m)
            : Math.Min(value.Value, subtotal);
    }

    /// <summary>Hạn mức thu ngân tự giảm (07 §3.3 bước 2), không làm tròn.</summary>
    public static decimal DiscountLimit(decimal subtotal, int cashierDiscountLimitPercent) =>
        subtotal * cashierDiscountLimitPercent / 100m;

    /// <summary>BR-06, BR-07 (07 §3.4).</summary>
    public static OrderTotals Price(decimal subtotal, DiscountType? discountType, decimal? discountValue, int serviceChargeRate, int vatRate)
    {
        var discount = DiscountAmount(discountType, discountValue, subtotal);
        var @base = subtotal - discount;
        var serviceCharge = RoundHalfUp(@base * serviceChargeRate / 100m);
        var vat = RoundHalfUp((@base + serviceCharge) * vatRate / 100m);
        var gross = @base + serviceCharge + vat;
        var total = Round1000(gross);
        return new OrderTotals(subtotal, discount, serviceCharge, vat, gross, total - gross, total);
    }

    /// <summary>
    /// BR-19 (07 §3.5): <c>toSplit = total − deposit</c>; phần 2…N = floor1000(toSplit / N); phần 1 nhận phần dư.
    /// TC-32: 1.208.000 ÷ 3 → 404.000, 402.000, 402.000.
    /// </summary>
    public static IReadOnlyList<EqualShare> Shares(decimal total, decimal deposit, int count)
    {
        var toSplit = total - deposit;
        if (count < 1 || toSplit <= 0)
            return [];

        var share = Floor1000(toSplit / count);
        var shares = new List<EqualShare>(count) { new(1, toSplit - (count - 1) * share) };
        for (var i = 2; i <= count; i++)
            shares.Add(new EqualShare(i, share));
        return shares;
    }
}

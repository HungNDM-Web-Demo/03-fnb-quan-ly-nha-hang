using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace UnitTests.Restaurant;

/// <summary>Công thức tính tiền 07 §3 với các số tính sẵn của 05 §1 và 07 §3.4 (FE pricing.ts phải ra cùng số).</summary>
public sealed class OrderPricingTests
{
    [Theory]
    [InlineData(PricingType.TheoTrongLuong, 450_000, 1.2, 540_000)]   // UC-05: Cá chẽm 1,2 kg
    [InlineData(PricingType.TheoTrongLuong, 650_000, 0.7, 455_000)]
    [InlineData(PricingType.TheoTrongLuong, 720_000, 1.8, 1_296_000)]
    [InlineData(PricingType.TheoTrongLuong, 280_000, 1.3, 364_000)]
    [InlineData(PricingType.TheoTrongLuong, 125_500, 1.0, 126_000)]   // phần lẻ 500 làm tròn lên
    [InlineData(PricingType.TheoSuat, 25_000, 6, 150_000)]            // TC-11: 6 Bia Tiger
    public void LineTotal_FollowsBr04(PricingType pricing, decimal unitPrice, decimal quantity, decimal expected) =>
        Assert.Equal(expected, OrderPricing.LineTotal(pricing, unitPrice, quantity));

    [Theory]
    // Ca, tiền món, kiểu giảm, giá trị, giảm, phí 5%, thuế 8%, làm tròn, tổng (07 §3.4)
    [InlineData("Đơn chuẩn T1-05 (TC-34)", 1_065_000, null, 0, 0, 53_250, 89_460, 290, 1_208_000)]
    [InlineData("Sau gộp T1-06 (TC-29)", 1_155_000, null, 0, 0, 57_750, 97_020, 230, 1_310_000)]
    [InlineData("Tách: hóa đơn mới (TC-30)", 590_000, null, 0, 0, 29_500, 49_560, -60, 669_000)]
    [InlineData("Tách: hóa đơn gốc (TC-30)", 475_000, null, 0, 0, 23_750, 39_900, 350, 539_000)]
    [InlineData("Giảm 10% (TC-37)", 1_065_000, DiscountType.PhanTram, 10, 106_000, 47_950, 80_556, 494, 1_088_000)]
    [InlineData("Giảm 15% (TC-38)", 1_065_000, DiscountType.PhanTram, 15, 159_000, 45_300, 76_104, -404, 1_027_000)]
    [InlineData("2 Lẩu thái (TC-42)", 730_000, null, 0, 0, 36_500, 61_320, 180, 828_000)]
    [InlineData("Gọi thêm Bia sau tạm tính (TC-39)", 1_090_000, null, 0, 0, 54_500, 91_560, -60, 1_236_000)]
    public void Price_MatchesPrecomputedCases(
        string caseName, decimal subtotal, DiscountType? type, decimal value,
        decimal discount, decimal service, decimal vat, decimal rounding, decimal total)
    {
        var result = OrderPricing.Price(subtotal, type, type is null ? null : value, 5, 8);

        Assert.True(result.Subtotal == subtotal, caseName);
        Assert.Equal(discount, result.DiscountAmount);
        Assert.Equal(service, result.ServiceCharge);
        Assert.Equal(vat, result.VatAmount);
        Assert.Equal(rounding, result.Rounding);
        Assert.Equal(total, result.Total);
        Assert.Equal(total - rounding, result.GrossTotal);
    }

    [Fact]
    public void Discount_LimitAndCap_FollowBr08()
    {
        // TC-37: 10% = 106.500 → 106.000, hạn mức 106.500 → không cần quản lý; TC-38: 159.000 > 106.500 → cần.
        var limit = OrderPricing.DiscountLimit(1_065_000, 10);
        Assert.Equal(106_500m, limit);
        Assert.True(OrderPricing.DiscountAmount(DiscountType.PhanTram, 10, 1_065_000) <= limit);
        Assert.True(OrderPricing.DiscountAmount(DiscountType.PhanTram, 15, 1_065_000) > limit);

        // Số tiền giảm vượt tiền món thì cắt bằng tiền món.
        Assert.Equal(90_000m, OrderPricing.DiscountAmount(DiscountType.SoTien, 200_000, 90_000));
        Assert.Equal(0m, OrderPricing.Price(90_000, DiscountType.SoTien, 200_000, 5, 8).Total);
    }

    [Fact]
    public void Shares_SplitEqually_FirstShareTakesRemainder()
    {
        // TC-32: 1.208.000 ÷ 3 → 404.000, 402.000, 402.000.
        var shares = OrderPricing.Shares(1_208_000, 0, 3);
        Assert.Equal([404_000m, 402_000m, 402_000m], shares.Select(s => s.Amount));
        Assert.Equal(1_208_000m, shares.Sum(s => s.Amount));

        // BR-19: số cần chia = tổng − tiền cọc.
        Assert.Equal([164_000m, 164_000m], OrderPricing.Shares(828_000, 500_000, 2).Select(s => s.Amount));
        Assert.Empty(OrderPricing.Shares(300_000, 500_000, 2));
    }

    [Fact]
    public void Order_Recalculate_ExcludesDraftAndCancelledLines()
    {
        Assert.True(OrderPricing.IsBillable(OrderItemStatus.ChoLam));
        Assert.True(OrderPricing.IsBillable(OrderItemStatus.DaPhucVu));
        Assert.False(OrderPricing.IsBillable(OrderItemStatus.ChuaGui));
        Assert.False(OrderPricing.IsBillable(OrderItemStatus.DaHuy));
    }
}

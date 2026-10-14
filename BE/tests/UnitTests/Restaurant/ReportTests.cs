using Application.DTOs.Reports;
using Application.Interfaces.Services.Reports;
using Application.Validators.Reports;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Báo cáo (UC-15, 07 §2.16) trên dữ liệu mẫu: tổng 90 ngày khớp 06 §5.7, khoảng ngày, kỳ trước.</summary>
public sealed class ReportTests : IAsyncLifetime
{
    private RestaurantTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await RestaurantTestHost.StartAsync();
        await _host.SignInAsync("quanly");
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task Revenue_90Days_MatchesSeedTotals_PlusLiveT103()
    {
        var report = await Call(s => s.GetRevenueAsync(new ReportRangeQuery { From = "2026-07-17", To = "2026-10-14" }));

        // 06 §5.7 (orders) + T1-03 của liveOrders (443.000 tiền món, 502.000 tổng, 3 khách).
        Assert.Equal(90, report.Daily.Count);
        Assert.Equal(2_368_871_000m + 443_000m, report.Totals.Revenue);
        Assert.Equal(2_686_323_000m + 502_000m, report.Totals.Total);
        Assert.Equal(9_085_000m, report.Totals.Discount);
        Assert.Equal(2_480, report.Totals.OrderCount);
        Assert.Equal(10_035 + 3, report.Totals.GuestCount);
        Assert.Equal(report.Totals.Revenue, report.Daily.Sum(d => d.Revenue));

        // Hôm nay: 17 hóa đơn, 18.092.000 ₫.
        var today = report.Daily.Single(d => d.Date == "2026-10-14");
        Assert.Equal((17, 18_092_000m), (today.OrderCount, today.Revenue));

        // Mặc định 30 ngày tới hôm nay, kỳ trước cùng độ dài liền trước.
        var defaults = await Call(s => s.GetRevenueAsync(new ReportRangeQuery()));
        Assert.Equal(("2026-09-15", "2026-10-14"), (defaults.From, defaults.To));
        Assert.Equal(("2026-08-16", "2026-09-14"), (defaults.Previous.From, defaults.Previous.To));
        Assert.NotNull(defaults.RevenueChangePercent);
    }

    [Fact]
    public async Task TopItems_Kitchen_Tables_Voided_AreConsistent()
    {
        var top = await Call(s => s.GetTopItemsAsync(new TopItemsQuery { From = "2026-07-17", To = "2026-10-14", Limit = 100 }));
        Assert.Equal(2_377_956_000m + 443_000m, top.TotalRevenue); // Σ lineTotal dòng không hủy của hóa đơn đã thanh toán
        Assert.True(top.Items.Zip(top.Items.Skip(1)).All(p => p.First.Quantity >= p.Second.Quantity));
        Assert.InRange(top.Items.Sum(i => i.Share), 99.5m, 100.5m);

        var byRevenue = await Call(s => s.GetTopItemsAsync(new TopItemsQuery { SortBy = "revenue", Limit = 5 }));
        Assert.True(byRevenue.Items.Zip(byRevenue.Items.Skip(1)).All(p => p.First.Revenue >= p.Second.Revenue));

        var kitchen = await Call(s => s.GetKitchenAsync(new KitchenReportQuery { From = "2026-07-17", To = "2026-10-14" }));
        Assert.Equal(kitchen.Totals.ItemCount, kitchen.ByStation.Sum(s => s.ItemCount));
        Assert.DoesNotContain(kitchen.ByStation, s => s.Station == KitchenStation.KhongQuaBep);
        Assert.Equal(13, kitchen.ByHour.Count);
        Assert.True(kitchen.ByItem.Zip(kitchen.ByItem.Skip(1)).All(p => p.First.AvgMinutes >= p.Second.AvgMinutes));

        var tables = await Call(s => s.GetTablesAsync(new TableReportQuery { From = "2026-10-08", To = "2026-10-14" }));
        Assert.Equal(7, tables.Days);
        Assert.Equal(3, tables.ByArea.Count);
        Assert.Equal(30, tables.ByTable.Count);

        var voided = await Call(s => s.GetVoidedItemsAsync(new VoidedItemsQuery { From = "2026-07-17", To = "2026-10-14", PageSize = 100 }));
        Assert.Equal(100, voided.TotalCount);
        Assert.Equal(voided.TotalCount, voided.ByReason.Sum(r => r.Count));
        Assert.Equal(15, voided.ByReason.Single(r => r.Reason == CancelReason.HetMon).Count);
    }

    [Fact]
    public void RangeLongerThan366Days_IsRejected()
    {
        var validator = new ReportRangeQueryValidator();
        var tooLong = validator.Validate(new ReportRangeQuery { From = "2025-01-01", To = "2026-10-14" });
        Assert.Equal(("from", "Khoảng ngày tối đa 366 ngày"), (tooLong.Errors.Single().PropertyName, tooLong.Errors.Single().ErrorMessage));
        var reversed = validator.Validate(new ReportRangeQuery { From = "2026-10-14", To = "2026-10-01" });
        Assert.Equal(("to", "Ngày kết thúc phải sau ngày bắt đầu"), (reversed.Errors.Single().PropertyName, reversed.Errors.Single().ErrorMessage));
    }

    private Task<T> Call<T>(Func<IReportService, Task<T>> call) => _host.CallAsync(call);
}

using Application.Common.Time;
using Application.Interfaces.Services.Reports;
using Application.Interfaces.Services.Tables;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;
using Infrastructure.Persistence.Seeders;
using Microsoft.EntityFrameworkCore;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>
/// demo-data.json nạp qua DemoDataSeeder thật: số liệu khớp 06-THIET-KE-CSDL §5.7 (cùng số với script FE sinh dữ liệu),
/// trạng thái lúc nạp §5.5, ràng buộc test §5.6, ánh xạ thứ trong tuần §5.3, đặt lại dữ liệu cho cùng kết quả.
/// </summary>
public sealed class RestaurantSeedTests : IAsyncLifetime
{
    private RestaurantTestHost _host = null!;

    public async Task InitializeAsync() => _host = await RestaurantTestHost.StartAsync();

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task Seed_Counts_MatchDesignReport()
    {
        Assert.Equal(3, await _host.QueryAsync<Area, int>(q => q.CountAsync()));
        Assert.Equal(30, await _host.QueryAsync<DiningTable, int>(q => q.CountAsync()));
        Assert.Equal(10, await _host.QueryAsync<Category, int>(q => q.CountAsync()));
        Assert.Equal(60, await _host.QueryAsync<MenuItem, int>(q => q.CountAsync()));
        Assert.Equal(10, await _host.QueryAsync<QuickNote, int>(q => q.CountAsync()));
        Assert.Equal(50, await _host.QueryAsync<Reservation, int>(q => q.CountAsync()));
        Assert.Equal(2523, await _host.QueryAsync<Order, int>(q => q.CountAsync()));
        Assert.Equal(17165, await _host.QueryAsync<OrderItem, int>(q => q.CountAsync()));
        Assert.Equal(100, await _host.QueryAsync<OrderItem, int>(q => q.CountAsync(i => i.Status == OrderItemStatus.DaHuy)));
        Assert.Equal(7306, await _host.QueryAsync<KitchenTicket, int>(q => q.CountAsync()));
        Assert.Equal(2621, await _host.QueryAsync<Payment, int>(q => q.CountAsync()));
    }

    [Fact]
    public async Task Seed_OrderStatusesAndPayments_MatchDesignReport()
    {
        var statuses = await _host.QueryAsync<Order, Dictionary<OrderStatus, int>>(q =>
            q.GroupBy(o => o.Status).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count));

        // 2.479 đã thanh toán trong orders + T1-03 (liveOrders); 16 hủy sau thanh toán + 13 mở nhầm; 13 đang mở; 1 bàn phụ.
        Assert.Equal(2480, statuses[OrderStatus.DaThanhToan]);
        Assert.Equal(29, statuses[OrderStatus.DaHuy]);
        Assert.Equal(13, statuses[OrderStatus.DangMo]);
        Assert.Equal(1, statuses[OrderStatus.DaGop]);
        Assert.False(statuses.ContainsKey(OrderStatus.DangThu));

        var methods = await _host.QueryAsync<Payment, Dictionary<PaymentMethod, int>>(q =>
            q.GroupBy(p => p.Method).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count));
        Assert.Equal(1074, methods[PaymentMethod.TienMat]);
        Assert.Equal(1072, methods[PaymentMethod.ChuyenKhoan]);
        Assert.Equal(463, methods[PaymentMethod.The]);
        Assert.Equal(12, methods[PaymentMethod.TienCoc]);

        Assert.Equal(12, await _host.QueryAsync<Order, int>(q => q.CountAsync(o => o.Deposit > 0)));
        Assert.Equal(107, await _host.QueryAsync<Order, int>(q => q.CountAsync(o => o.DiscountType != null)));
        Assert.Equal(28, await _host.QueryAsync<Order, int>(q => q.CountAsync(o => o.DiscountApprovedByUsername == "quanly")));
        Assert.Equal(16, await _host.QueryAsync<Order, int>(q => q.CountAsync(o => o.Status == OrderStatus.DaHuy && o.CancelledByUsername == "quanly")));
        Assert.Equal(13, await _host.QueryAsync<Order, int>(q => q.CountAsync(o => o.CancelReason == "Mở nhầm")));
    }

    [Fact]
    public async Task Seed_PaidTotals_MatchDesignReport()
    {
        // 06 §5.7: Σ hóa đơn DaThanhToan trong `orders` (không gồm T1-03 của liveOrders).
        var paid = await _host.QueryAsync<Order, List<Order>>(q => q.Where(o => o.Status == OrderStatus.DaThanhToan).ToListAsync());
        var t103 = await TableIdAsync("T1-03");
        var fromOrders = paid.Where(o => !(o.TableId == t103 && o.PaidAt > RestaurantTestHost.Start.UtcDateTime.AddMinutes(-10))).ToList();

        Assert.Equal(2479, fromOrders.Count);
        Assert.Equal(2_377_956_000m, fromOrders.Sum(o => o.Subtotal));
        Assert.Equal(9_085_000m, fromOrders.Sum(o => o.DiscountAmount));
        Assert.Equal(2_368_871_000m, fromOrders.Sum(o => o.Subtotal - o.DiscountAmount));
        Assert.Equal(118_443_550m, fromOrders.Sum(o => o.ServiceCharge));
        Assert.Equal(198_985_164m, fromOrders.Sum(o => o.VatAmount));
        Assert.Equal(23_286m, fromOrders.Sum(o => o.Rounding));
        Assert.Equal(2_686_323_000m, fromOrders.Sum(o => o.Total));
        Assert.Equal(10_035, fromOrders.Sum(o => o.GuestCount));

        // Mọi hóa đơn đã thanh toán thu đủ: Σ lượt thu = tổng.
        Assert.All(paid, o => Assert.Equal(o.Total, o.PaidAmount));
    }

    [Fact]
    public async Task Seed_TodayRevenueAndKitchenStats_MatchDesignReport()
    {
        var dashboard = await Report(s => s.GetDashboardAsync());

        // 06 §5.5: 14/30 bàn đang phục vụ, 50 khách, 12 dòng chờ bếp, 2 món trễ; 06 §5.7: hôm nay 17 hóa đơn, 18.092.000 ₫.
        Assert.Equal(14, dashboard.ServingTables);
        Assert.Equal(30, dashboard.TotalTables);
        Assert.Equal(50, dashboard.GuestsSeated);
        Assert.Equal(12, dashboard.PendingItems);
        Assert.Equal(2, dashboard.LateItems);
        Assert.Equal(17, dashboard.PaidOrderCount);
        Assert.Equal(18_092_000m, dashboard.Revenue);
        Assert.Equal(5, dashboard.LongestTables.Count);

        // 06 §5.7: món qua bếp đã xong trong `orders` (không gồm liveOrders) 14.569 món, TB 7,78 phút, trễ 14,2%.
        var t103 = await _host.QueryAsync<Order, Guid>(q => q.Where(o => o.Status == OrderStatus.DaThanhToan && o.PaidAt > RestaurantTestHost.Start.UtcDateTime.AddMinutes(-10))
            .Select(o => o.Id).SingleAsync());
        var rows = await _host.QueryAsync<OrderItem, List<(double Minutes, int Prep)>>(async q =>
            (await q.Where(i => i.Station != Domain.Enums.Pos.MenuItems.KitchenStation.KhongQuaBep && i.Status != OrderItemStatus.DaHuy
                    && i.DoneAt != null && i.OrderId != t103
                    && (i.Order!.Status == OrderStatus.DaThanhToan || i.Order.Status == OrderStatus.DaHuy))
                .Select(i => new { i.SentAt, i.DoneAt, i.PrepMinutes }).ToListAsync())
            .Select(i => ((i.DoneAt!.Value - i.SentAt!.Value).TotalMinutes, i.PrepMinutes ?? 0)).ToList());
        Assert.Equal(14_569, rows.Count);
        Assert.Equal(7.78, Math.Round(rows.Average(r => r.Minutes), 2));
        Assert.Equal(14.2, Math.Round(rows.Count(r => r.Minutes >= r.Prep) * 100.0 / rows.Count, 1));
    }

    [Fact]
    public async Task Seed_LiveState_MatchesSection55()
    {
        var plan = await _host.CallAsync<IFloorPlanService, Application.DTOs.Tables.FloorPlanDto>(s => s.GetFloorPlanAsync());
        var byCode = plan.Tables.ToDictionary(t => t.Code);

        Assert.Equal(30, plan.TotalTables);
        Assert.Equal(12, plan.Counts[TableStatus.DangPhucVu]);
        Assert.Equal(1, plan.Counts[TableStatus.ChoThanhToan]);
        Assert.Equal(1, plan.Counts[TableStatus.ChoDon]);
        Assert.Equal(1, plan.Counts[TableStatus.DaGop]);
        Assert.Equal(1, plan.Counts[TableStatus.DaDat]);
        Assert.Equal(14, plan.Counts[TableStatus.Trong]);

        Assert.Equal(TableStatus.DaDat, byCode["T2-08"].Status);
        Assert.Equal(TableStatus.ChoDon, byCode["T1-03"].Status);
        Assert.NotNull(byCode["T1-03"].LastPaidOrderId);
        Assert.Equal(TableStatus.ChoThanhToan, byCode["T1-11"].Status);
        Assert.Equal(TableStatus.DaGop, byCode["T1-08"].Status);
        Assert.Equal("T1-07", byCode["T1-08"].MergedIntoTableCode);
        Assert.Equal(["T1-08"], byCode["T1-07"].MergedTableCodes);
        Assert.Equal(6, byCode["T1-07"].GuestCount);
        Assert.Equal(1_388_000m, byCode["T1-07"].Subtotal);
        Assert.True(byCode["T1-07"].HasLateItems);
        Assert.True(byCode["T2-03"].HasLateItems);
        Assert.False(byCode["T2-04"].HasLateItems);
        Assert.Equal(TableStatus.Trong, byCode["T1-05"].Status);
        Assert.Equal(TableStatus.Trong, byCode["T1-10"].Status);
        Assert.Equal(TableStatus.Trong, byCode["T2-01"].Status);
        Assert.Equal("Trần Minh Quân", byCode["T2-01"].Reservation?.CustomerName);

        // Tiền món từng bàn (06 §5.5).
        var expected = new Dictionary<string, decimal>
        {
            ["T1-01"] = 680_000, ["T1-02"] = 436_000, ["T1-06"] = 90_000, ["T1-07"] = 1_388_000, ["T1-11"] = 576_000,
            ["T2-02"] = 2_801_000, ["T2-03"] = 716_000, ["T2-04"] = 215_000, ["T2-05"] = 769_000, ["T2-06"] = 464_000,
            ["T2-07"] = 969_000, ["SV-01"] = 305_000, ["SV-03"] = 904_000
        };
        foreach (var (code, subtotal) in expected)
            Assert.Equal(subtotal, byCode[code].Subtotal);

        Assert.Equal(4, plan.Tables.Sum(t => t.ReadyCount));
        Assert.Equal(50, plan.Tables.Where(t => t.Status is TableStatus.DangPhucVu or TableStatus.ChoThanhToan).Sum(t => t.GuestCount ?? 0));

        // 8 phiếu đang chờ; T1-03 thu 502.000 ₫, tiền mặt 600.000 ₫.
        Assert.Equal(8, await _host.QueryAsync<KitchenTicket, int>(q => q.CountAsync(t => t.Status == KitchenTicketStatus.DangCho)));
        var t103 = await _host.QueryAsync<Order, Order>(q => q.Include(o => o.Payments).SingleAsync(o => o.Id == byCode["T1-03"].LastPaidOrderId));
        Assert.Equal(443_000m, t103.Subtotal);
        Assert.Equal(502_000m, t103.Total);
        Assert.Equal(600_000m, t103.Payments.Single().CashReceived);
        Assert.Equal(98_000m, t103.Payments.Single().ChangeAmount);

        // 5 đĩa Rau muống đang chờ (chế độ tổng hợp).
        var summary = await _host.CallAsync<Application.Interfaces.Services.Kitchen.IKitchenService, IReadOnlyList<Application.DTOs.Kitchen.KitchenSummaryItem>>(
            s => s.GetSummaryAsync(new Application.DTOs.Kitchen.KitchenSummaryQuery()));
        Assert.Equal(5m, summary.Single(s => s.ItemName == "Rau muống xào tỏi").TotalQuantity);
    }

    [Fact]
    public async Task Seed_ReservationsAndCodes()
    {
        var reservations = await _host.QueryAsync<Reservation, List<Reservation>>(q => q.ToListAsync());
        var byStatus = reservations.GroupBy(r => r.Status).ToDictionary(g => g.Key, g => g.Count());
        Assert.Equal(13, byStatus[ReservationStatus.ChoDen]);
        Assert.Equal(28, byStatus[ReservationStatus.DaNhanBan]);
        Assert.Equal(5, byStatus[ReservationStatus.KhongDen]);
        Assert.Equal(4, byStatus[ReservationStatus.DaHuy]);
        Assert.All(reservations.Where(r => r.Status == ReservationStatus.DaNhanBan), r => Assert.NotNull(r.OrderId));
        Assert.All(reservations, r => Assert.Matches(@"^DB\d{6}\d{3}$", r.Code));

        // RV01: anh Trần Minh Quân, 19:00 hôm nay, 8 khách, T2-01, cọc 500.000 ₫.
        var rv01 = reservations.Single(r => r.CustomerName == "Trần Minh Quân");
        Assert.Equal("0903456789", rv01.Phone);
        Assert.Equal(new TimeOnly(19, 0), TimeOnly.FromDateTime(VietnamDates.ToVietnam(rv01.ArrivalAt)));
        Assert.Equal(VietnamDates.Today(_host.Time), VietnamDates.DateOf(rv01.ArrivalAt));
        Assert.Equal(500_000m, rv01.Deposit);

        // Mã hóa đơn HD + yyMMdd + 4 số, mã phiếu #NNN, không trùng trong ngày.
        var codes = await _host.QueryAsync<Order, List<string>>(q => q.Select(o => o.Code).ToListAsync());
        Assert.All(codes, c => Assert.Matches(@"^HD\d{6}\d{4}$", c));
        Assert.Equal(codes.Count, codes.Distinct().Count());
        var todayOrders = codes.Where(c => c.StartsWith("HD261014", StringComparison.Ordinal)).OrderBy(c => c).ToList();
        Assert.Equal(16 + 14 + 1, todayOrders.Count);
        Assert.Equal("HD2610140001", todayOrders[0]);
        Assert.Equal("HD2610140031", todayOrders[^1]);

        var tickets = await _host.QueryAsync<KitchenTicket, List<KitchenTicket>>(q => q.ToListAsync());
        Assert.All(tickets, t => Assert.Equal(KitchenTicket.FormatCode(t.TicketNo), t.Code));
        foreach (var day in tickets.GroupBy(t => t.BusinessDate))
            Assert.Equal(Enumerable.Range(1, day.Count()), day.Select(t => t.TicketNo).OrderBy(n => n));
    }

    [Theory]
    [InlineData(-1, 3, -2)]
    [InlineData(0, 3, 0)]
    [InlineData(5, 3, 5)]
    [InlineData(-85, 3, -85)]
    [InlineData(-89, 1, -89)]
    public void DayOffsetOfSlot_MatchesFrontEnd(int slot, int isoToday, int expected) =>
        Assert.Equal(expected, SeedSlots.DayOffsetOfSlot(slot, isoToday));

    [Fact]
    public void DayOffsetOfSlot_IsBijectionPerWeekBlock_AndRolesFallOnTheirWeekday()
    {
        var today = new DateOnly(2026, 10, 14);
        for (var iso = 1; iso <= 7; iso++)
        {
            var mapped = Enumerable.Range(1, 84).Select(n => SeedSlots.DayOffsetOfSlot(-n, iso)).ToList();
            Assert.Equal(84, mapped.Distinct().Count());
            Assert.All(mapped, m => Assert.InRange(m, -84, -1));

            // Ô vai Thứ Bảy (role 5: −6, −13…) rơi vào Thứ Bảy thật khi hôm nay là ngày có thứ iso.
            var day = today.AddDays(iso - SeedSlots.IsoDayOfWeek(today));
            Assert.All(Enumerable.Range(0, 12), block =>
                Assert.Equal(DayOfWeek.Saturday, day.AddDays(SeedSlots.DayOffsetOfSlot(-(block * 7 + 6), iso)).DayOfWeek));
        }
    }

    [Fact]
    public async Task Reset_ReloadsSameData()
    {
        await _host.RunAsync(async sp =>
        {
            var resetter = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<DemoDataResetter>(sp);
            await resetter.ResetAsync();
        });

        Assert.Equal(2523, await _host.QueryAsync<Order, int>(q => q.CountAsync()));
        Assert.Equal(17165, await _host.QueryAsync<OrderItem, int>(q => q.CountAsync()));
        Assert.Equal(7306, await _host.QueryAsync<KitchenTicket, int>(q => q.CountAsync()));
        Assert.Equal(2621, await _host.QueryAsync<Payment, int>(q => q.CountAsync()));
        Assert.Equal(50, await _host.QueryAsync<Reservation, int>(q => q.CountAsync()));
        Assert.Equal(2_377_956_000m + 443_000m, await _host.QueryAsync<Order, decimal>(async q =>
            (await q.Where(o => o.Status == OrderStatus.DaThanhToan).Select(o => o.Subtotal).ToListAsync()).Sum()));
    }

    private Task<Guid> TableIdAsync(string code) =>
        _host.QueryAsync<DiningTable, Guid>(q => q.Where(t => t.Code == code).Select(t => t.Id).SingleAsync());

    private Task<T> Report<T>(Func<IReportService, Task<T>> call) => _host.CallAsync(call);
}

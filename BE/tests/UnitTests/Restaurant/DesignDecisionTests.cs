using Application.Common.Models;
using Application.Common.Time;
using Application.DTOs.Approvals;
using Application.DTOs.Orders;
using Application.DTOs.Reports;
using Application.DTOs.Reservations;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Approvals;
using Application.Interfaces.Services.Kitchen;
using Application.Interfaces.Services.Reports;
using Application.Interfaces.Services.Reservations;
using Application.Interfaces.Services.Tables;
using Domain.Common;
using Domain.Entities.Pos.Kitchen;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Microsoft.EntityFrameworkCore;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>
/// Quyết định thiết kế FE mock đã chọn, BE làm giống để hai chế độ ra cùng kết quả (07 §5 quyết định 44..52).
/// </summary>
public sealed class DesignDecisionTests : IAsyncLifetime
{
    private RestaurantTestHost _host = null!;
    private RestaurantScenario _pos = null!;

    public async Task InitializeAsync()
    {
        _host = await RestaurantTestHost.StartAsync();
        _pos = new RestaurantScenario(_host);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task HiddenArea_IsExcludedFromFloorPlan_AndDashboardTotals()
    {
        await _host.SignInAsync("quanly");
        var area = await _host.CallAsync<IAreaService, AreaDto>(s => s.CreateAsync(new SaveAreaRequest { Code = "T3", Name = "Tầng 3" }));
        await _host.CallAsync<IDiningTableService, DiningTableDto>(s => s.CreateAsync(new SaveTableRequest
        {
            Code = "T3-01", AreaId = area.Id, Capacity = 4, Shape = TableShape.Vuong, X = 0, Y = 0
        }));

        var before = await _pos.Floor(s => s.GetFloorPlanAsync());
        Assert.Equal(31, before.TotalTables);

        await _host.CallAsync<IAreaService, AreaDto>(s => s.UpdateAsync(area.Id, new SaveAreaRequest { Code = "T3", Name = "Tầng 3", IsHidden = true }));
        var plan = await _pos.Floor(s => s.GetFloorPlanAsync());
        Assert.Equal(30, plan.TotalTables);
        Assert.DoesNotContain(plan.Areas, a => a.Id == area.Id);
        Assert.DoesNotContain(plan.Tables, t => t.Code == "T3-01");
        Assert.Equal(30, plan.Counts.Values.Sum());
        Assert.Equal(before.Counts[TableStatus.Trong] - 1, plan.Counts[TableStatus.Trong]);

        var dashboard = await _host.CallAsync<IReportService, DashboardReport>(s => s.GetDashboardAsync());
        Assert.Equal(30, dashboard.TotalTables);
    }

    [Fact]
    public async Task SplitOrder_KeepsOpenedAt_AndPrebillPrintedAt_OfOriginal()
    {
        var standard = await _pos.StandardOrderAsync();
        await _host.SignInAsync("thungan");
        var printed = await _pos.Orders(s => s.PrebillAsync(standard.Id, new OrderVersionRequest { Version = standard.Version }));
        Assert.NotNull(printed.PrebillPrintedAt);

        _host.Time.Advance(TimeSpan.FromMinutes(10));
        var beer = printed.Items.Single(i => i.ItemCode == "M055");
        var result = await _pos.Orders(s => s.SplitAsync(standard.Id, new SplitOrderRequest
        {
            Parts = [new SplitPartInput { Items = [new ItemQuantityInput { ItemId = beer.Id, Quantity = 2 }] }],
            Version = printed.Version
        }));

        var (original, created) = (result[0], result[1]);
        Assert.Equal(original.OpenedAt, created.OpenedAt);
        Assert.Equal(standard.OpenedAt, created.OpenedAt);
        Assert.Equal(printed.PrebillPrintedAt, original.PrebillPrintedAt);
        Assert.Equal(printed.PrebillPrintedAt, created.PrebillPrintedAt);
        Assert.Equal(TableStatus.ChoThanhToan, (await _pos.CardAsync("T1-05")).Status);
    }

    [Fact]
    public async Task Transfer_MovesWaitingTicketsOfOldTable_AndDoneTicketsOfThisOrderOnly()
    {
        // Khách trước của T1-05 đã trả tiền: phiếu "Đã xong" của họ ở lại T1-05.
        var first = await _pos.StandardOrderAsync();
        await _pos.PayAsync(first.Id, PaymentMethod.TienMat, cash: 1_208_000);
        await _host.SignInAsync("phucvu");
        var t105 = await _pos.TableIdAsync("T1-05");
        await _pos.Floor(s => s.ClearTableAsync(t105));

        // Khách mới: Bò lúc lắc (Bếp nóng) xong, Gỏi ngó sen (Bếp nguội) còn chờ.
        var order = await _pos.OpenAsync("T1-05", 2);
        await _pos.AddAsync(order.Id, "M021", 1);
        await _pos.AddAsync(order.Id, "M008", 1);
        var sent = await _pos.SendAsync(order.Id);
        await _host.SignInAsync("bep");
        var hot = sent.Tickets.Single(t => t.Station == KitchenStation.BepNong);
        await _pos.Kitchen(s => s.DoneAllAsync(hot.Id));

        await _host.SignInAsync("phucvu");
        var current = await _pos.GetAsync(order.Id);
        var t110 = await _pos.TableIdAsync("T1-10");
        await _pos.Orders(s => s.TransferAsync(order.Id, new TransferRequest { TargetTableId = t110, Version = current.Version }));

        var tickets = await _host.QueryAsync<KitchenTicket, List<KitchenTicket>>(q =>
            q.Where(t => t.OrderId == order.Id || t.OrderId == first.Id).ToListAsync());
        Assert.All(tickets.Where(t => t.OrderId == order.Id), t => Assert.Equal("T1-10", t.TableCode));
        Assert.All(tickets.Where(t => t.OrderId == order.Id), t => Assert.Equal("T1-05", t.OriginalTableCode));
        Assert.Contains(tickets, t => t.OrderId == order.Id && t.Status == KitchenTicketStatus.DaXong);
        Assert.Contains(tickets, t => t.OrderId == order.Id && t.Status == KitchenTicketStatus.DangCho);
        Assert.All(tickets.Where(t => t.OrderId == first.Id), t => Assert.Equal("T1-05", t.TableCode));
    }

    [Fact]
    public async Task Transfer_AfterSplit_MovesWaitingTicketsOfOriginalOrder()
    {
        // Hóa đơn gốc tách Bò lúc lắc (còn chờ bếp) sang hóa đơn mới; gốc trả tiền xong, hóa đơn mới chuyển bàn.
        var order = await _pos.OpenAsync("T1-05", 2);
        await _pos.AddAsync(order.Id, "M021", 1);
        await _pos.AddAsync(order.Id, "M039", 1);
        var sent = await _pos.SendAsync(order.Id);
        var beef = sent.Order.Items.Single(i => i.ItemCode == "M021");

        await _host.SignInAsync("thungan");
        var split = await _pos.Orders(s => s.SplitAsync(order.Id, new SplitOrderRequest
        {
            Parts = [new SplitPartInput { Items = [new ItemQuantityInput { ItemId = beef.Id, Quantity = 1 }] }],
            Version = sent.Order.Version
        }));
        var created = split[1];
        await _pos.PayAsync(order.Id, PaymentMethod.TienMat, cash: 1_000_000);

        await _host.SignInAsync("phucvu");
        var current = await _pos.GetAsync(created.Id);
        var t110 = await _pos.TableIdAsync("T1-10");
        await _pos.Orders(s => s.TransferAsync(created.Id, new TransferRequest { TargetTableId = t110, Version = current.Version }));

        var hot = sent.Tickets.Single(t => t.Station == KitchenStation.BepNong);
        var ticket = await _host.QueryAsync<KitchenTicket, KitchenTicket>(q => q.SingleAsync(t => t.Id == hot.Id));
        Assert.Equal(KitchenTicketStatus.DangCho, ticket.Status);
        Assert.Equal("T1-10", ticket.TableCode);
    }

    [Fact]
    public async Task ClearTable_OnlyTouchedTable_MergedSecondaryClearsSeparately()
    {
        var standard = await _pos.StandardOrderAsync();
        var t106 = await _pos.TableIdAsync("T1-06");
        await _pos.Orders(s => s.MergeAsync(standard.Id, new MergeRequest { SourceTableIds = [t106], Version = standard.Version }));
        await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 1_310_000);

        await _host.SignInAsync("phucvu");
        var cleared = await _pos.Floor(s => s.ClearTableAsync(standard.TableId));
        Assert.Equal(TableStatus.Trong, cleared.Status);
        Assert.Equal(TableStatus.ChoDon, (await _pos.CardAsync("T1-06")).Status);
    }

    [Fact]
    public async Task CancelServedKitchenItem_TicketBackToWaiting_DrinkWithoutKitchenAutoAcknowledged()
    {
        var standard = await _pos.StandardOrderAsync();
        var beef = standard.Items.Single(i => i.ItemCode == "M021");
        var beer = standard.Items.Single(i => i.ItemCode == "M055");
        Assert.Equal(OrderItemStatus.DaPhucVu, beef.Status);

        await _host.SignInAsync("quanly");
        var afterBeef = await _pos.Orders(s => s.CancelItemAsync(standard.Id, beef.Id,
            new CancelItemRequest { Quantity = 1, Reason = CancelReason.GoiNham, Version = standard.Version }));
        var ticket = await _host.QueryAsync<KitchenTicket, KitchenTicket>(q => q.SingleAsync(t => t.Id == beef.KitchenTicketId));
        Assert.Equal(KitchenTicketStatus.DangCho, ticket.Status);
        Assert.False(afterBeef.Items.Single(i => i.Id == beef.Id).Cancel!.Acknowledged);

        var afterBeer = await _pos.Orders(s => s.CancelItemAsync(standard.Id, beer.Id,
            new CancelItemRequest { Quantity = 6, Reason = CancelReason.GoiNham, Version = afterBeef.Version }));
        Assert.True(afterBeer.Items.Single(i => i.Id == beer.Id).Cancel!.Acknowledged);
    }

    [Fact]
    public async Task ApproverCancellingOrDiscountingThemselves_IsRecordedAsApprover_EvenWithToken()
    {
        var order = await _pos.OrderOfAsync("T2-03");
        var lau = order.Items.Single(i => i.ItemCode == "M028");

        // quanly có quyền duyệt: token (của người khác hay của chính mình) không dùng tới, người duyệt là quanly.
        await _host.SignInAsync("quanly");
        var token = await _host.CallAsync<IApprovalService, ApprovalDto>(s => s.ApproveAsync(new ApprovalRequest
        {
            Username = "quanly", Password = RestaurantTestHost.DemoPassword, Action = ApprovalAction.HuyMon
        }));
        var after = await _pos.Orders(s => s.CancelItemAsync(order.Id, lau.Id, new CancelItemRequest
        {
            Quantity = 1, Reason = CancelReason.ChoLau, ApprovalToken = "khong-hop-le", Version = order.Version
        }));
        Assert.Equal("quanly", after.Items.Single(i => i.Id == lau.Id).Cancel!.ApprovedByUsername);
        Assert.NotNull(token.Token);

        var standard = await _pos.StandardOrderAsync();
        await _host.SignInAsync("quanly");
        var discounted = await _pos.Orders(s => s.SetDiscountAsync(standard.Id, new DiscountRequest
        {
            Type = DiscountType.PhanTram, Value = 15, Reason = "Khách quen", Version = standard.Version
        }));
        Assert.Equal("quanly", discounted.Discount!.ApprovedByUsername);
        Assert.Equal(159_000m, discounted.Discount.Amount);
    }

    [Fact]
    public async Task CheckInWithDeposit_DepositPaymentIsWholeDeposit()
    {
        await _host.SignInAsync("phucvu2");
        var rv01 = (await _host.CallAsync<IReservationService, PaginatedResult<ReservationDto>>(s =>
            s.GetPagedAsync(new ReservationQuery { Search = "Trần Minh Quân" }))).Items.Single();
        var result = await _host.CallAsync<IReservationService, CreatedResult<OrderDto>>(s =>
            s.CheckInAsync(rv01.Id, new CheckInRequest { ClientRequestId = "checkin-deposit" }));

        var deposit = Assert.Single(result.Value.Payments);
        Assert.Equal(PaymentMethod.TienCoc, deposit.Method);
        Assert.Equal(rv01.Deposit, deposit.Amount);
        Assert.Equal(rv01.Deposit, result.Value.Deposit);
    }

    [Fact]
    public async Task Reservations_WithoutDate_ReturnEveryDay()
    {
        await _host.SignInAsync("phucvu");
        var all = await _host.CallAsync<IReservationService, PaginatedResult<ReservationDto>>(s =>
            s.GetPagedAsync(new ReservationQuery { PageSize = 100 }));
        var today = await _host.CallAsync<IReservationService, PaginatedResult<ReservationDto>>(s =>
            s.GetPagedAsync(new ReservationQuery { From = "2026-10-14", To = "2026-10-14", PageSize = 100 }));

        Assert.True(all.TotalCount > today.TotalCount);
        Assert.True(all.Items.Select(r => VietnamDates.ToVietnam(r.ArrivalAt).Date).Distinct().Count() > 1);
    }

    [Fact]
    public async Task Approvals_CountWrongPasswords_LockFiveMinutesAfterFive()
    {
        await _host.SignInAsync("phucvu");
        for (var i = 1; i <= 4; i++)
        {
            var wrong = await Assert.ThrowsAsync<DomainException>(() => ApproveAsync("quanly", "sai-mat-khau"));
            Assert.Equal("Tên đăng nhập hoặc mật khẩu không đúng", wrong.Message);
        }

        var locked = await Assert.ThrowsAsync<DomainException>(() => ApproveAsync("quanly", "sai-mat-khau"));
        Assert.Equal("Tài khoản tạm khóa đăng nhập, thử lại sau 5 phút", locked.Message);

        // Đang khóa: mật khẩu đúng vẫn bị chặn.
        var stillLocked = await Assert.ThrowsAsync<DomainException>(() => ApproveAsync("quanly", RestaurantTestHost.DemoPassword));
        Assert.StartsWith("Tài khoản tạm khóa đăng nhập", stillLocked.Message);

        _host.Time.Advance(TimeSpan.FromMinutes(5));
        var approval = await ApproveAsync("quanly", RestaurantTestHost.DemoPassword);
        Assert.Equal("quanly", approval.ApprovedByUsername);
    }

    private Task<ApprovalDto> ApproveAsync(string username, string password) =>
        _host.CallAsync<IApprovalService, ApprovalDto>(s => s.ApproveAsync(new ApprovalRequest
        {
            Username = username, Password = password, Action = ApprovalAction.HuyMon
        }));
}

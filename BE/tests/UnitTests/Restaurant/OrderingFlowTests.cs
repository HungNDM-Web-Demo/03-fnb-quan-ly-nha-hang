using Application.Common.Exceptions;
using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Realtime;
using Application.Validators.Tables;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Mở bàn, gọi món, gửi bếp (UC-02, UC-05): TC-08..TC-15, TC-25, TC-36, TC-39, chống bấm lặp, xung đột phiên bản.</summary>
public sealed class OrderingFlowTests : IAsyncLifetime
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
    public async Task Tc08_OpenTable_CreatesOrderAndServesTable()
    {
        var order = await _pos.OpenAsync("T1-05", 4);

        Assert.Matches(@"^HD261014\d{4}$", order.Code);
        Assert.Equal("HD2610140032", order.Code); // 31 hóa đơn mẫu mở hôm nay
        Assert.Equal(OrderStatus.DangMo, order.Status);
        Assert.Equal(4, order.GuestCount);
        Assert.Equal("Lê Minh Khoa", order.WaiterName);
        Assert.Equal(5, order.ServiceChargeRate);
        Assert.Equal(8, order.VatRate);

        var card = await _pos.CardAsync("T1-05");
        Assert.Equal(TableStatus.DangPhucVu, card.Status);
        Assert.Equal(4, card.GuestCount);
        Assert.Equal(order.OpenedAt, card.OpenedAt);
        Assert.Contains(_host.Events.All, e => e.Name == PosEvents.TablesChanged);
    }

    [Fact]
    public void Tc09_GuestCount_MustBeBetween1And50()
    {
        var validator = new OpenTableRequestValidator();
        var zero = validator.Validate(new OpenTableRequest { GuestCount = 0, ClientRequestId = "x" });
        Assert.Equal("Số khách từ 1 đến 50", Assert.Single(zero.Errors).ErrorMessage);
        Assert.True(validator.Validate(new OpenTableRequest { GuestCount = 7, ClientRequestId = "x" }).IsValid); // quá sức chứa chỉ cảnh báo ở FE
    }

    [Fact]
    public async Task OpenTable_SameRequestId_ReturnsSameOrder_OtherWaiterGets409()
    {
        var requestId = Guid.NewGuid().ToString();
        var first = await _pos.OpenAsync("T1-10", 2, requestId: requestId);
        var again = await _pos.Floor(s => s.OpenTableAsync(first.TableId, new OpenTableRequest { GuestCount = 2, ClientRequestId = requestId }));
        Assert.False(again.Created);
        Assert.Equal(first.Id, again.Value.Id);

        // UC-02 E3: người sau mở cùng bàn → 409 BanVuaDuocMo kèm orderId.
        await _host.SignInAsync("phucvu2");
        var conflict = await Assert.ThrowsAsync<ConflictException>(() =>
            _pos.Floor(s => s.OpenTableAsync(first.TableId, new OpenTableRequest { GuestCount = 3, ClientRequestId = Guid.NewGuid().ToString() })));
        Assert.Equal("Bàn T1-10 vừa được mở bởi Lê Minh Khoa", conflict.Message);
        Assert.Equal(PosErrors.BanVuaDuocMo, conflict.Extensions["code"]);
        Assert.Equal(first.Id, conflict.Extensions["orderId"]);

        // Bàn Chờ dọn → 400 BanChoDon.
        var t103 = await _pos.TableIdAsync("T1-03");
        var notCleared = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Floor(s => s.OpenTableAsync(t103, new OpenTableRequest { GuestCount = 2, ClientRequestId = Guid.NewGuid().ToString() })));
        Assert.Equal(PosErrors.BanChoDon, notCleared.Extensions["code"]);
    }

    [Fact]
    public async Task Tc10_CloseMistakenOpen_OnlyBeforeSendingToKitchen()
    {
        var order = await _pos.OpenAsync("T1-10", 2);
        await _pos.AddAsync(order.Id, "M039", 1); // món nháp bị xóa theo
        var closed = await _pos.Orders(s => s.CloseAsync(order.Id, new OrderVersionRequest { Version = order.Version + 1 }));

        Assert.Equal(OrderStatus.DaHuy, closed.Status);
        Assert.Equal("Mở nhầm", closed.CancelReason);
        Assert.Empty(closed.Items);
        Assert.Equal(TableStatus.Trong, (await _pos.CardAsync("T1-10")).Status);

        var reopened = await _pos.OpenAsync("T1-10", 2);
        await _pos.AddAsync(reopened.Id, "M039", 1);
        await _pos.SendAsync(reopened.Id);
        var current = await _pos.GetAsync(reopened.Id);
        var error = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Orders(s => s.CloseAsync(reopened.Id, new OrderVersionRequest { Version = current.Version })));
        Assert.Equal("Bàn đã gửi bếp, không đóng được", error.Message);
        Assert.Equal(PosErrors.BanDaGuiBep, error.Extensions["code"]);
    }

    [Fact]
    public async Task Tc11_AddItems_LineTotalsAndDraftSubtotal()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        var dto = await _pos.AddStandardItemsAsync(order.Id);

        Assert.Equal(5, dto.Items.Count);
        Assert.All(dto.Items, i => Assert.Equal(OrderItemStatus.ChuaGui, i.Status));
        Assert.Equal(540_000m, dto.Items.Single(i => i.ItemCode == "M014").LineTotal);
        Assert.Equal(150_000m, dto.Items.Single(i => i.ItemCode == "M055").LineTotal);
        Assert.Equal(["Ít cay"], dto.Items.Single(i => i.ItemCode == "M008").QuickNotes);
        Assert.Equal(1_065_000m, dto.Items.Sum(i => i.LineTotal));
        Assert.Equal(0m, dto.Subtotal); // BR-05: món "Chưa gửi" chưa tính tiền
        Assert.Equal(5, dto.Counts.Unsent);

        // UC-05 2a: cùng món, cùng ghi chú → cộng vào dòng nháp; khác ghi chú nhanh → dòng mới.
        dto = await _pos.AddAsync(order.Id, "M055", 2);
        Assert.Equal(8m, dto.Items.Single(i => i.ItemCode == "M055").Quantity);
        dto = await _pos.AddAsync(order.Id, "M008", 1, ["Không hành"]);
        Assert.Equal(2, dto.Items.Count(i => i.ItemCode == "M008"));
    }

    [Fact]
    public async Task Tc12_Tc13_SendToKitchen_SplitsTicketsByStation_AndBatches()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        await _pos.AddStandardItemsAsync(order.Id);
        _host.Events.Clear();
        var result = await _pos.SendAsync(order.Id);

        // TC-12: 2 phiếu Lần 1 (Bếp nóng, Bếp nguội); 6 Bia không có phiếu, "Xong".
        Assert.Equal([KitchenStation.BepNong, KitchenStation.BepNguoi], result.Tickets.Select(t => t.Station));
        Assert.Equal(1, result.DirectItemCount);
        Assert.False(result.PrebillInvalidated);
        Assert.Equal(1, result.Order.BatchCount);
        Assert.Equal(1_065_000m, result.Order.Subtotal);
        Assert.Equal(OrderItemStatus.Xong, result.Order.Items.Single(i => i.ItemCode == "M055").Status);
        Assert.All(result.Order.Items.Where(i => i.ItemCode != "M055"), i => Assert.Equal(OrderItemStatus.ChoLam, i.Status));
        Assert.All(result.Tickets, t => Assert.Matches(@"^#\d{3}$", t.Code));

        var board = await _pos.BoardAsync();
        var nong = board.Tickets.Single(t => t.Id == result.Tickets[0].Id);
        Assert.Equal(1, nong.BatchNo);
        Assert.Equal("T1-05", nong.TableCode);
        Assert.Equal(["Bò lúc lắc khoai tây", "Cá chẽm hấp Hồng Kông", "Rau muống xào tỏi"], nong.Items.Select(i => i.ItemName));
        var nguoi = board.Tickets.Single(t => t.Id == result.Tickets[1].Id);
        Assert.Equal(["Ít cay"], Assert.Single(nguoi.Items).QuickNotes);

        // Sự kiện: kitchen-changed kèm newTicketIds, items-ready cho Bia.
        Assert.Contains(_host.Events.All, e => e.Name == PosEvents.KitchenChanged);
        Assert.Contains(_host.Events.All, e => e.Name == PosEvents.ItemsReady);

        // TC-13: gọi thêm 2 Nước ép cam → phiếu Quầy bar "Lần 2", tiền món 1.155.000.
        await _host.SignInAsync("phucvu");
        await _pos.AddAsync(order.Id, "M048", 2);
        var second = await _pos.SendAsync(order.Id);
        var bar = Assert.Single(second.Tickets);
        Assert.Equal(KitchenStation.QuayBar, bar.Station);
        Assert.Equal(2, second.Order.BatchCount);
        Assert.Equal(1_155_000m, second.Order.Subtotal);
        Assert.Equal(2, (await _pos.BoardAsync(KitchenStation.QuayBar)).Tickets.Single(t => t.Id == bar.Id).BatchNo);
    }

    [Fact]
    public async Task Tc14_WeightOutOfRange_IsRejected()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        foreach (var weight in new[] { 0.05m, 25m, 1.25m })
        {
            var error = await Assert.ThrowsAsync<ValidationException>(() => _pos.AddAsync(order.Id, "M014", weight));
            Assert.Equal("Trọng lượng từ 0,1 đến 20 kg", Assert.Single(error.Errors).ErrorMessage);
        }

        var portion = await Assert.ThrowsAsync<ValidationException>(() => _pos.AddAsync(order.Id, "M039", 100));
        Assert.Equal("Số lượng từ 1 đến 99", Assert.Single(portion.Errors).ErrorMessage);
        Assert.Empty((await _pos.GetAsync(order.Id)).Items);
    }

    [Fact]
    public async Task Tc15_SendTwiceWithSameRequestId_CreatesOneTicket()
    {
        var order = await _pos.OrderOfAsync("T1-06");
        await _host.SignInAsync("phucvu");
        await _pos.AddAsync(order.Id, "M039", 1);
        var current = await _pos.GetAsync(order.Id);
        var request = new SendToKitchenRequest { ClientRequestId = "send-tc15", Version = current.Version };

        var first = await _pos.Orders(s => s.SendAsync(order.Id, request));
        var second = await _pos.Orders(s => s.SendAsync(order.Id, request)); // gửi lại cùng mã, version cũ

        Assert.Equal(first.Tickets.Select(t => t.Id), second.Tickets.Select(t => t.Id));
        Assert.Equal(2, second.Order.BatchCount);
        Assert.Equal(1, await _host.QueryAsync<KitchenTicket, int>(q => q.CountAsync(t => t.OrderId == order.Id && t.BatchNo == 2)));
    }

    [Fact]
    public async Task Tc25_DeleteDraftItem_NoTrace()
    {
        var order = await _pos.OrderOfAsync("T1-06");
        await _host.SignInAsync("phucvu");
        var withDraft = await _pos.AddAsync(order.Id, "M039", 1);
        var draft = withDraft.Items.Single(i => i.Status == OrderItemStatus.ChuaGui);

        var after = await _pos.Orders(s => s.DeleteDraftItemAsync(order.Id, draft.Id));
        Assert.DoesNotContain(after.Items, i => i.Id == draft.Id);
        Assert.Equal(0, await _host.QueryAsync<Domain.Entities.Pos.Orders.OrderItem, int>(q => q.CountAsync(i => i.Id == draft.Id)));

        // Món đã gửi không xóa được, phải hủy.
        var sent = after.Items.First(i => i.Status != OrderItemStatus.ChuaGui);
        await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.DeleteDraftItemAsync(order.Id, sent.Id)));
    }

    [Fact]
    public async Task Tc36_UnsentItems_BlockPrebillAndPayment()
    {
        var standard = await _pos.StandardOrderAsync();
        await _pos.AddAsync(standard.Id, "M039", 1);
        var current = await _pos.GetAsync(standard.Id);

        var prebill = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Orders(s => s.PrebillAsync(standard.Id, new OrderVersionRequest { Version = current.Version })));
        Assert.Equal("Còn 1 món chưa gửi bếp", prebill.Message);
        Assert.Equal(PosErrors.ConMonChuaGui, prebill.Extensions["code"]);
        Assert.Equal(1, prebill.Extensions["unsentCount"]);

        var pay = await Assert.ThrowsAsync<DomainException>(() => _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 2_000_000));
        Assert.Equal("Còn 1 món chưa gửi bếp", pay.Message);
    }

    [Fact]
    public async Task Tc34_Tc39_Prebill_ThenSendMore_InvalidatesPrebill()
    {
        var standard = await _pos.StandardOrderAsync();
        var printed = await _pos.Orders(s => s.PrebillAsync(standard.Id, new OrderVersionRequest { Version = standard.Version }));

        // TC-34: 1.065.000 / 53.250 / 89.460 / +290 / 1.208.000; bàn Chờ thanh toán.
        Assert.Equal(1_065_000m, printed.Subtotal);
        Assert.Equal(53_250m, printed.ServiceCharge);
        Assert.Equal(89_460m, printed.VatAmount);
        Assert.Equal(290m, printed.Rounding);
        Assert.Equal(1_208_000m, printed.Total);
        Assert.NotNull(printed.PrebillPrintedAt);
        Assert.Equal(TableStatus.ChoThanhToan, (await _pos.CardAsync("T1-05")).Status);

        // TC-39: thêm 1 Bia → gửi bếp → bàn Đang phục vụ, phiếu tạm tính hết hiệu lực, tiền món 1.090.000.
        await _pos.AddAsync(standard.Id, "M055", 1);
        Assert.Equal(TableStatus.ChoThanhToan, (await _pos.CardAsync("T1-05")).Status); // món nháp không đổi trạng thái
        var sent = await _pos.SendAsync(standard.Id);
        Assert.True(sent.PrebillInvalidated);
        Assert.Null(sent.Order.PrebillPrintedAt);
        Assert.Equal(1_090_000m, sent.Order.Subtotal);
        Assert.Equal(TableStatus.DangPhucVu, (await _pos.CardAsync("T1-05")).Status);
    }

    [Fact]
    public async Task StaleVersion_Returns409WithCurrentVersion()
    {
        var standard = await _pos.StandardOrderAsync();
        await _pos.AddAsync(standard.Id, "M055", 1); // thêm món nháp tăng phiên bản

        var stale = await Assert.ThrowsAsync<ConflictException>(() =>
            _pos.Orders(s => s.SendAsync(standard.Id, new SendToKitchenRequest { ClientRequestId = "stale", Version = standard.Version })));
        Assert.Equal("Bàn vừa được cập nhật, đang tải lại", stale.Message);
        Assert.Equal(PosErrors.DuLieuCu, stale.Extensions["code"]);
        Assert.Equal(standard.Version + 1, stale.Extensions["currentVersion"]);
    }

    [Fact]
    public async Task ConcurrentWrites_SecondSaveLosesOptimisticLock()
    {
        var standard = await _pos.StandardOrderAsync();

        // Hai request đọc cùng phiên bản rồi cùng lưu: EF kiểm Version như concurrency token, request sau nhận 409.
        await _host.RunAsync(async first =>
        {
            var repoA = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
                .GetRequiredService<Application.Interfaces.Repositories.IGenericRepository<Domain.Entities.Pos.Orders.Order>>(first);
            var uowA = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
                .GetRequiredService<Application.Interfaces.Repositories.IUnitOfWork>(first);
            var a = await repoA.Query().SingleAsync(o => o.Id == standard.Id);

            await _pos.Orders(s => s.PrebillAsync(standard.Id, new OrderVersionRequest { Version = standard.Version }));

            a.Touch();
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => uowA.SaveChangesAsync());
        });
    }

    [Fact]
    public async Task ServiceRates_FollowCurrentSettings_UntilFirstPayment()
    {
        var standard = await _pos.StandardOrderAsync();
        await _host.RunAsync(async sp =>
        {
            var settings = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
                .GetRequiredService<Application.Interfaces.Services.Settings.ISettingService>(sp);
            await settings.UpdateAsync(new Application.DTOs.Settings.UpdateSettingsRequest
            {
                Items = [new Application.DTOs.Settings.UpdateSettingItem { Key = "Billing.ServiceChargeRate", Value = "10" }]
            });
        });

        // Hóa đơn đang mở lấy tỉ lệ hiện tại (07 §5 quyết định 4): 1.065.000 + 106.500 + 93.720 = 1.265.220 → 1.265.000.
        var reread = await _pos.GetAsync(standard.Id);
        Assert.Equal(10, reread.ServiceChargeRate);
        Assert.Equal(106_500m, reread.ServiceCharge);
        Assert.Equal(1_265_000m, reread.Total);
    }
}

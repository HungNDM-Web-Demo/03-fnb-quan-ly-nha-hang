using Application.DTOs.Menu;
using Application.DTOs.Orders;
using Application.Interfaces.Services.Menu;
using Application.Interfaces.Services.Realtime;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Màn hình bếp và ra món (UC-04, UC-06, UC-07): TC-06, TC-07, TC-16..TC-22.</summary>
public sealed class KitchenFlowTests : IAsyncLifetime
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
    public async Task Tc16_StationFilter_AndNewTicketEvent()
    {
        var order = await _pos.OrderOfAsync("T1-06");
        await _host.SignInAsync("phucvu");
        await _pos.AddAsync(order.Id, "M039", 1);
        await _pos.AddAsync(order.Id, "M048", 1);
        _host.Events.Clear();
        var sent = await _pos.SendAsync(order.Id);

        var nong = (await _pos.BoardAsync(KitchenStation.BepNong)).Tickets;
        Assert.Contains(nong, t => t.OrderId == order.Id && t.BatchNo == 2);
        Assert.DoesNotContain(nong, t => t.Station == KitchenStation.QuayBar);

        var kitchenEvent = _host.Events.Of(PosEvents.KitchenChanged).Single();
        var newIds = (Guid[])kitchenEvent.GetType().GetProperty("newTicketIds")!.GetValue(kitchenEvent)!;
        Assert.Equal(sent.Tickets.Select(t => t.Id).Order(), newIds.Order());
    }

    [Fact]
    public async Task Tc17_WaitColors_FromSeed_T203Late_T204NotLate()
    {
        var board = await _pos.BoardAsync(KitchenStation.BepNong);
        var t203 = board.Tickets.Single(t => t.TableCode == "T2-03");
        var t204 = board.Tickets.Single(t => t.TableCode == "T2-04");

        // 07 §3.8: 16/15 phút → đỏ (trễ), 13/15 → vàng; FE tính màu từ asOf, sentAt, prepMinutes.
        Assert.Equal(16, (board.AsOf - t203.SentAt).TotalMinutes);
        Assert.Equal(15, t203.Items.Single().PrepMinutes);
        Assert.Equal(OrderItemStatus.DangLam, t203.Items.Single().Status);
        Assert.Equal(13, (board.AsOf - t204.SentAt).TotalMinutes);
        Assert.Equal(OrderItemStatus.ChoLam, t204.Items.Single().Status);
        Assert.True((await _pos.CardAsync("T2-03")).HasLateItems);
        Assert.False((await _pos.CardAsync("T2-04")).HasLateItems);

        // SV-01 đúng 1 phiếu Bếp nóng "Chờ làm" (TC-26).
        Assert.Single(board.Tickets, t => t.TableCode == "SV-01");
    }

    [Fact]
    public async Task Tc18_RushTicketGoesFirst()
    {
        var t110 = await _pos.OpenAsync("T1-10", 2);
        await _pos.AddAsync(t110.Id, "M008", 1);
        await _pos.SendAsync(t110.Id);
        _host.Time.Advance(TimeSpan.FromMinutes(1));

        var t105 = await _pos.OpenAsync("T1-05", 2);
        await _pos.AddAsync(t105.Id, "M008", 1, rush: true);
        await _pos.SendAsync(t105.Id);

        var tickets = (await _pos.BoardAsync(KitchenStation.BepNguoi)).Tickets;
        // Phiếu gấp đứng đầu dù gửi sau; phiếu thường theo giờ gửi (phiếu mẫu gửi trước T1-10 vẫn đứng trước).
        Assert.Equal("T1-05", tickets[0].TableCode);
        Assert.True(tickets[0].IsRush);
        Assert.Equal("T1-10", tickets[^1].TableCode);
        Assert.Equal(tickets.Skip(1).OrderBy(t => t.SentAt).Select(t => t.Id), tickets.Skip(1).Select(t => t.Id));
    }

    [Fact]
    public async Task Tc19_Tc20_Tc21_Tc22_DoneAll_Undo_Serve_Unserve()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        await _pos.AddStandardItemsAsync(order.Id);
        var sent = await _pos.SendAsync(order.Id);
        var nongId = sent.Tickets.Single(t => t.Station == KitchenStation.BepNong).Id;

        // TC-21 bước 1, TC-19: Xong cả phiếu Bếp nóng → 3 món Xong, phiếu sang "Đã xong".
        await _host.SignInAsync("bep");
        var done = await _pos.Kitchen(s => s.DoneAllAsync(nongId));
        Assert.Equal(KitchenTicketStatus.DaXong, done.Status);
        Assert.All(done.Items, i => Assert.Equal(OrderItemStatus.Xong, i.Status));
        Assert.Contains((await _pos.BoardAsync(view: KitchenTicketStatus.DaXong)).Tickets, t => t.Id == nongId);
        var versionAfterKitchen = (await _pos.GetAsync(order.Id)).Version;
        Assert.Equal(sent.Order.Version, versionAfterKitchen); // thao tác bếp không đổi phiên bản

        // TC-21 bước 2: thẻ T1-05 huy hiệu 4 (Bia, Bò lúc lắc, Cá chẽm, Rau muống); Gỏi ngó sen vẫn Chờ làm.
        Assert.Equal(4, (await _pos.CardAsync("T1-05")).ReadyCount);
        var ready = await _pos.Orders(s => s.GetReadyItemsAsync(new ReadyItemsQuery { Mine = false }));
        Assert.Equal(4, ready.Single(g => g.OrderId == order.Id).Items.Count);

        // TC-19 bước 2: hoàn tác Rau muống → Đang làm, phiếu trở lại màn chính.
        var rauMuong = done.Items.Single(i => i.ItemName == "Rau muống xào tỏi");
        var undone = await _pos.Kitchen(s => s.UndoAsync(nongId, rauMuong.Id));
        Assert.Equal(KitchenTicketStatus.DangCho, undone.Status);
        Assert.Equal(OrderItemStatus.DangLam, undone.Items.Single(i => i.Id == rauMuong.Id).Status);
        await _pos.Kitchen(s => s.DoneAsync(nongId, rauMuong.Id));

        // TC-21 bước 3: Ra hết → 4 dòng Đã phục vụ, huy hiệu mất.
        await _host.SignInAsync("phucvu");
        var served = await _pos.Orders(s => s.ServeAllAsync(order.Id));
        Assert.Equal(4, served.Items.Count(i => i.Status == OrderItemStatus.DaPhucVu));
        Assert.Equal(OrderItemStatus.ChoLam, served.Items.Single(i => i.ItemCode == "M008").Status);
        Assert.Equal(0, (await _pos.CardAsync("T1-05")).ReadyCount);

        // TC-20: hoàn tác món đã ra → "Món đã ra cho khách".
        await _host.SignInAsync("bep");
        var boLucLac = served.Items.Single(i => i.ItemCode == "M021");
        var error = await Assert.ThrowsAsync<DomainException>(() => _pos.Kitchen(s => s.UndoAsync(nongId, boLucLac.Id)));
        Assert.Equal("Món đã ra cho khách", error.Message);
        Assert.Equal(PosErrors.MonDaRa, error.Extensions["code"]);

        // TC-22: Gỏi ngó sen xong → Đã ra → hoàn tác trong 60 giây → Xong, huy hiệu tăng lại 1.
        var nguoiId = sent.Tickets.Single(t => t.Station == KitchenStation.BepNguoi).Id;
        var goi = served.Items.Single(i => i.ItemCode == "M008");
        await _pos.Kitchen(s => s.DoneAsync(nguoiId, goi.Id));
        await _host.SignInAsync("phucvu");
        await _pos.Orders(s => s.ServeItemAsync(order.Id, goi.Id));
        _host.Time.Advance(TimeSpan.FromSeconds(10));
        var restored = await _pos.Orders(s => s.UnserveItemAsync(order.Id, goi.Id));
        Assert.Equal(OrderItemStatus.Xong, restored.Items.Single(i => i.Id == goi.Id).Status);
        Assert.Equal(1, (await _pos.CardAsync("T1-05")).ReadyCount);

        // Quá 60 giây → "Hết thời gian hoàn tác".
        await _pos.Orders(s => s.ServeItemAsync(order.Id, goi.Id));
        _host.Time.Advance(TimeSpan.FromSeconds(61));
        var late = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.UnserveItemAsync(order.Id, goi.Id)));
        Assert.Equal("Hết thời gian hoàn tác", late.Message);
    }

    [Fact]
    public async Task KitchenErrors_FollowContract()
    {
        var board = await _pos.BoardAsync(KitchenStation.BepNong);
        var t203 = board.Tickets.Single(t => t.TableCode == "T2-03");
        var cooking = t203.Items.Single();

        var start = await Assert.ThrowsAsync<DomainException>(() => _pos.Kitchen(s => s.StartAsync(t203.Id, cooking.Id)));
        Assert.Equal("Món không ở trạng thái chờ làm", start.Message);
        var undo = await Assert.ThrowsAsync<DomainException>(() => _pos.Kitchen(s => s.UndoAsync(t203.Id, cooking.Id)));
        Assert.Equal("Chỉ hoàn tác món đã xong", undo.Message);
        var outOfStock = await Assert.ThrowsAsync<DomainException>(() => _pos.Kitchen(s => s.OutOfStockAsync(t203.Id, cooking.Id)));
        Assert.Equal("Chỉ báo hết món đang chờ làm", outOfStock.Message);
        await Assert.ThrowsAsync<Application.Common.Exceptions.NotFoundException>(() => _pos.Kitchen(s => s.DoneAsync(t203.Id, Guid.NewGuid())));

        var started = await _pos.Kitchen(s => s.StartAsync(board.Tickets.Single(t => t.TableCode == "T2-04").Id,
            board.Tickets.Single(t => t.TableCode == "T2-04").Items.Single().Id));
        Assert.Equal(OrderItemStatus.DangLam, started.Items.Single().Status);
    }

    [Fact]
    public async Task Tc06_SoldOut_HiddenFromOrdering()
    {
        await _host.SignInAsync("bep");
        var caChem = await _pos.MenuIdAsync("M014");
        _host.Events.Clear();
        await _host.CallAsync<IMenuItemService>(s => s.SetAvailabilityAsync(caChem, new SetAvailabilityRequest { IsSoldOut = true }));
        Assert.Contains(_host.Events.All, e => e.Name == PosEvents.MenuChanged);

        var menu = await _host.CallAsync<IMenuService, MenuBundle>(s => s.GetBundleAsync());
        Assert.True(menu.Items.Single(i => i.Code == "M014").IsSoldOut); // vẫn trả để FE hiện mờ
        Assert.DoesNotContain(menu.Items, i => i.Code == "M043"); // món ẩn

        var order = await _pos.OrderOfAsync("T1-06");
        await _host.SignInAsync("phucvu");
        var error = await Assert.ThrowsAsync<DomainException>(() => _pos.AddAsync(order.Id, "M014", 1.2m));
        Assert.Equal("Cá chẽm hấp Hồng Kông đang tạm hết", error.Message);
        Assert.Equal(PosErrors.MonTamHet, error.Extensions["code"]);
    }

    [Fact]
    public async Task Tc07_OutOfStock_CancelsItem_MarksSoldOut_NotifiesWaiter()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        await _pos.AddStandardItemsAsync(order.Id);
        var sent = await _pos.SendAsync(order.Id);
        var nongId = sent.Tickets.Single(t => t.Station == KitchenStation.BepNong).Id;
        var caChem = sent.Order.Items.Single(i => i.ItemCode == "M014");

        await _host.SignInAsync("bep");
        _host.Events.Clear();
        await _pos.Kitchen(s => s.OutOfStockAsync(nongId, caChem.Id));

        var after = await _pos.GetAsync(order.Id);
        var cancelled = after.Items.Single(i => i.Id == caChem.Id);
        Assert.Equal(OrderItemStatus.DaHuy, cancelled.Status);
        Assert.Equal(CancelReason.HetMon, cancelled.Cancel!.Reason);
        Assert.Equal("Hết món", cancelled.Cancel.ReasonText);
        Assert.Null(cancelled.Cancel.ApprovedByUsername);
        Assert.Equal(1_065_000m - 540_000m, after.Subtotal);
        Assert.True(after.Version > sent.Order.Version);

        var message = _host.Events.Of(PosEvents.ItemOutOfStock).Single();
        Assert.Equal("T1-05: Cá chẽm hấp Hồng Kông đã hết, mời khách đổi món", message.GetType().GetProperty("message")!.GetValue(message));
        var menu = await _host.CallAsync<IMenuService, MenuBundle>(s => s.GetBundleAsync());
        Assert.True(menu.Items.Single(i => i.Code == "M014").IsSoldOut);
    }

    [Fact]
    public async Task SoldOutDraft_StaysUnsent_WhenSending()
    {
        var order = await _pos.OpenAsync("T1-05", 2);
        await _pos.AddAsync(order.Id, "M039", 1);
        var withDraft = await _pos.AddAsync(order.Id, "M021", 1);
        var bo = withDraft.Items.Single(i => i.ItemCode == "M021");

        await _host.SignInAsync("bep");
        await _host.CallAsync<IMenuItemService>(s => s.SetAvailabilityAsync(bo.MenuItemId, new SetAvailabilityRequest { IsSoldOut = true }));

        await _host.SignInAsync("phucvu");
        var result = await _pos.SendAsync(order.Id);
        Assert.Equal([bo.Id], result.SkippedSoldOutItemIds);
        var draft = result.Order.Items.Single(i => i.Id == bo.Id);
        Assert.Equal(OrderItemStatus.ChuaGui, draft.Status);
        Assert.True(draft.IsSoldOut);

        var none = await Assert.ThrowsAsync<DomainException>(() => _pos.SendAsync(order.Id));
        Assert.Equal(PosErrors.KhongCoMonMoi, none.Extensions["code"]);
    }
}

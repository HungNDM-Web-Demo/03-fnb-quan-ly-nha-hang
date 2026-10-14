using Application.Common.Exceptions;
using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Tables;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using FluentValidation;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Thiết lập bàn, chuyển bàn, gộp bàn, chuyển món (UC-01, UC-09): TC-01..TC-03, TC-26..TC-29.</summary>
public sealed class TableOperationTests : IAsyncLifetime
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
    public async Task Tc01_Tc02_Tc03_TableSetup()
    {
        await _host.SignInAsync("quanly");
        var areas = await _host.CallAsync<IAreaService, IReadOnlyList<AreaDto>>(s => s.GetListAsync(false));
        var sv = areas.Single(a => a.Code == "SV");

        // TC-01: thêm SV-09, 6 chỗ, tròn, kéo tới góc phải → 31 bàn, Trống, đúng vị trí.
        var created = await _host.CallAsync<IDiningTableService, DiningTableDto>(s => s.CreateAsync(new SaveTableRequest
        {
            Code = "SV-09", AreaId = sv.Id, Capacity = 6, Shape = TableShape.Tron, X = 0, Y = 0
        }));
        await _host.CallAsync<IDiningTableService>(s => s.SaveLayoutAsync(new SaveLayoutRequest
        {
            Items = [new TablePositionInput { Id = created.Id, X = 10, Y = 6 }]
        }));
        await _host.SignInAsync("phucvu");
        var plan = await _pos.Floor(s => s.GetFloorPlanAsync());
        Assert.Equal(31, plan.TotalTables);
        var card = plan.Tables.Single(t => t.Code == "SV-09");
        Assert.Equal((TableStatus.Trong, 10, 6), (card.Status, card.X, card.Y));

        // TC-02: trùng mã → 409 errors.code; sức chứa 25 → 400 (validator).
        await _host.SignInAsync("quanly");
        var t1 = areas.Single(a => a.Code == "T1").Id;
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => _host.CallAsync<IDiningTableService, DiningTableDto>(s =>
            s.CreateAsync(new SaveTableRequest { Code = "T1-05", AreaId = t1, Capacity = 4, Shape = TableShape.Vuong })));
        Assert.Equal(("Mã bàn đã tồn tại", "code"), (duplicate.Message, duplicate.Field));
        var capacity = new Application.Validators.Tables.SaveTableRequestValidator()
            .Validate(new SaveTableRequest { Code = "T1-13", AreaId = t1, Capacity = 25, Shape = TableShape.Vuong });
        Assert.Equal("Sức chứa từ 1 đến 20", Assert.Single(capacity.Errors).ErrorMessage);
        var format = await Assert.ThrowsAsync<ValidationException>(() => _host.CallAsync<IDiningTableService, DiningTableDto>(s =>
            s.CreateAsync(new SaveTableRequest { Code = "SV-10", AreaId = t1, Capacity = 4, Shape = TableShape.Vuong })));
        Assert.Equal("Mã bàn dạng T1-01", Assert.Single(format.Errors).ErrorMessage);

        // TC-03: ẩn SV-01 đang có khách → "Bàn đang có khách".
        var sv01 = await _pos.TableIdAsync("SV-01");
        var occupied = await Assert.ThrowsAsync<DomainException>(() =>
            _host.CallAsync<IDiningTableService>(s => s.SetHiddenAsync(sv01, new SetTableHiddenRequest { IsHidden = true })));
        Assert.Equal("Bàn đang có khách", occupied.Message);
        Assert.Equal(PosErrors.BanDangCoKhach, occupied.Extensions["code"]);
    }

    [Fact]
    public async Task Tc26_Transfer_KeepsOrder_TicketShowsFromTable()
    {
        var order = await _pos.OrderOfAsync("SV-01");
        await _host.SignInAsync("phucvu3");
        var target = await _pos.TableIdAsync("T1-10");
        var moved = await _pos.Orders(s => s.TransferAsync(order.Id, new TransferRequest { TargetTableId = target, Version = order.Version }));

        Assert.Equal(order.Code, moved.Code);
        Assert.Equal("T1-10", moved.TableCode);
        Assert.Equal(3, moved.GuestCount);
        Assert.Equal(order.Items.Count, moved.Items.Count);
        Assert.Equal(TableStatus.DangPhucVu, (await _pos.CardAsync("T1-10")).Status);
        Assert.Equal(TableStatus.Trong, (await _pos.CardAsync("SV-01")).Status);

        var ticket = (await _pos.BoardAsync(KitchenStation.BepNong)).Tickets.Single(t => t.OrderId == order.Id);
        Assert.Equal("T1-10", ticket.TableCode);
        Assert.Equal("SV-01", ticket.FromTableCode);
    }

    [Fact]
    public async Task Tc27_TransferTarget_MustBeFree_ReservationInfoForWarning()
    {
        var order = await _pos.OrderOfAsync("SV-01");
        await _host.SignInAsync("phucvu3");
        var t106 = await _pos.TableIdAsync("T1-06");
        var error = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Orders(s => s.TransferAsync(order.Id, new TransferRequest { TargetTableId = t106, Version = order.Version })));
        Assert.Equal("Chỉ chuyển sang bàn đang trống", error.Message);
        Assert.Equal(PosErrors.BanDichKhongHopLe, error.Extensions["code"]);

        // T2-01 trống nhưng có khách đặt 19:00: FE cảnh báo dựa trên reservation, BE không chặn.
        var t201 = await _pos.CardAsync("T2-01");
        Assert.Equal(TableStatus.Trong, t201.Status);
        Assert.Equal(new TimeOnly(19, 0), TimeOnly.FromDateTime(Application.Common.Time.VietnamDates.ToVietnam(t201.Reservation!.ArrivalAt)));
    }

    [Fact]
    public async Task Tc28_Tc29_Merge_ThenPay_BothTablesWaitForCleaning()
    {
        var standard = await _pos.StandardOrderAsync();
        var t106 = await _pos.TableIdAsync("T1-06");
        var merged = await _pos.Orders(s => s.MergeAsync(standard.Id, new MergeRequest { SourceTableIds = [t106], Version = standard.Version }));

        // TC-28: 6 khách, tiền món 1.155.000, có 2 Nước ép cam của T1-06; T1-06 "Đã gộp → T1-05".
        Assert.Equal(6, merged.GuestCount);
        Assert.Equal(1_155_000m, merged.Subtotal);
        Assert.Equal(2m, merged.Items.Single(i => i.ItemCode == "M048").Quantity);
        Assert.Equal(["T1-06"], merged.MergedTableCodes);
        var card106 = await _pos.CardAsync("T1-06");
        Assert.Equal(TableStatus.DaGop, card106.Status);
        Assert.Equal("T1-05", card106.MergedIntoTableCode);

        // Chạm bàn phụ → dữ liệu bàn chính.
        var service = await _pos.Floor(s => s.GetTableServiceAsync(t106));
        Assert.Equal("T1-05", service.Table.Code);
        Assert.Equal(t106, service.ViewedTableId);
        Assert.Equal(standard.Id, service.Orders.Single().Id);

        // TC-29: tổng 1.310.000 (57.750 / 97.020 / +230); thu đủ tiền mặt → T1-05, T1-06 Chờ dọn.
        Assert.Equal((57_750m, 97_020m, 230m, 1_310_000m), (merged.ServiceCharge, merged.VatAmount, merged.Rounding, merged.Total));
        var paid = await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 1_310_000);
        Assert.True(paid.Completed);
        Assert.Equal(TableStatus.ChoDon, (await _pos.CardAsync("T1-05")).Status);
        Assert.Equal(TableStatus.ChoDon, (await _pos.CardAsync("T1-06")).Status);

        // Dọn xong từng bàn → Trống.
        await _host.SignInAsync("phucvu");
        var cleared = await _pos.Floor(s => s.ClearTableAsync(t106));
        Assert.Equal(TableStatus.Trong, cleared.Status);
        Assert.Null(cleared.MergedIntoTableCode);
        var notWaiting = await Assert.ThrowsAsync<DomainException>(() => _pos.Floor(s => s.ClearTableAsync(t106)));
        Assert.Equal("Bàn không ở trạng thái chờ dọn", notWaiting.Message);
    }

    [Fact]
    public async Task Merge_OnlyServingTables()
    {
        var standard = await _pos.StandardOrderAsync();
        var t110 = await _pos.TableIdAsync("T1-10");
        var error = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Orders(s => s.MergeAsync(standard.Id, new MergeRequest { SourceTableIds = [t110], Version = standard.Version })));
        Assert.Equal("Chỉ gộp bàn đang phục vụ hoặc chờ thanh toán", error.Message);
    }

    [Fact]
    public async Task MoveItems_PartialQuantity_KeepsKitchenState_TicketShowsMovedTable()
    {
        var standard = await _pos.StandardOrderAsync();
        var beer = standard.Items.Single(i => i.ItemCode == "M055");
        var t106 = await _pos.TableIdAsync("T1-06");

        var result = await _pos.Orders(s => s.MoveItemsAsync(standard.Id, new MoveItemsRequest
        {
            TargetTableId = t106,
            Items = [new ItemQuantityInput { ItemId = beer.Id, Quantity = 2 }],
            Version = standard.Version
        }));

        Assert.Equal(4m, result.Source.Items.Single(i => i.ItemCode == "M055").Quantity);
        var movedBeer = result.Target.Items.Single(i => i.ItemCode == "M055");
        Assert.Equal((2m, OrderItemStatus.DaPhucVu), (movedBeer.Quantity, movedBeer.Status));
        Assert.Equal(1_015_000m, result.Source.Subtotal);
        Assert.Equal(90_000m + 50_000m, result.Target.Subtotal);

        // Món qua bếp chuyển nguyên dòng: phiếu giữ bàn cũ, dòng ghi "→ T1-06".
        var fish = standard.Items.Single(i => i.ItemCode == "M014");
        var weightError = await Assert.ThrowsAsync<ValidationException>(() => _pos.Orders(s => s.MoveItemsAsync(standard.Id, new MoveItemsRequest
        {
            TargetTableId = t106, Items = [new ItemQuantityInput { ItemId = fish.Id, Quantity = 1 }], Version = result.Source.Version
        })));
        Assert.Equal("Món theo trọng lượng chỉ chuyển nguyên dòng", Assert.Single(weightError.Errors).ErrorMessage);

        await _pos.Orders(s => s.MoveItemsAsync(standard.Id, new MoveItemsRequest
        {
            TargetTableId = t106, Items = [new ItemQuantityInput { ItemId = fish.Id, Quantity = 1.2m }], Version = result.Source.Version
        }));
        var ticket = (await _pos.BoardAsync(view: Domain.Enums.Pos.Kitchen.KitchenTicketStatus.DaXong)).Tickets
            .Single(t => t.OrderId == standard.Id && t.Station == KitchenStation.BepNong);
        Assert.Equal("T1-05", ticket.TableCode);
        Assert.Equal("T1-06", ticket.Items.Single(i => i.Id == fish.Id).MovedToTableCode);
    }
}

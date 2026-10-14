using Application.Common.Exceptions;
using Application.DTOs.Approvals;
using Application.DTOs.Orders;
using Application.DTOs.Reports;
using Application.Interfaces.Services.Approvals;
using Application.Interfaces.Services.Reports;
using Application.Validators.Orders;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using FluentValidation;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Hủy món, quản lý xác nhận (UC-08, SCR-07): TC-23, TC-24, TC-44, token dùng một lần, sai mật khẩu 400.</summary>
public sealed class CancelAndApprovalTests : IAsyncLifetime
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
    public async Task Tc23_CancelWaitingItem_NoApproval_KitchenSeesUntilAcknowledged()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        await _pos.AddStandardItemsAsync(order.Id);
        await _pos.SendAsync(order.Id);
        await _pos.AddAsync(order.Id, "M048", 2);
        var sent = await _pos.SendAsync(order.Id);
        var juice = sent.Order.Items.Single(i => i.ItemCode == "M048");

        var after = await _pos.Orders(s => s.CancelItemAsync(order.Id, juice.Id, new CancelItemRequest
        {
            Quantity = 2,
            Reason = CancelReason.KhachDoiY,
            Version = sent.Order.Version
        }));

        Assert.Equal(OrderItemStatus.DaHuy, after.Items.Single(i => i.Id == juice.Id).Status);
        Assert.Equal(1_065_000m, after.Subtotal);
        Assert.Equal("phucvu", after.Items.Single(i => i.Id == juice.Id).Cancel!.CancelledByUsername);

        // Màn bếp Quầy bar: dòng "ĐÃ HỦY" tới khi bấm "Đã biết".
        var bar = (await _pos.BoardAsync(KitchenStation.QuayBar)).Tickets.Single(t => t.OrderId == order.Id);
        Assert.True(bar.HasUnacknowledgedCancel);
        Assert.Equal(KitchenTicketStatus.DangCho, bar.Status);
        var acknowledged = await _pos.Kitchen(s => s.AcknowledgeAsync(bar.Id, juice.Id));
        Assert.False(acknowledged.HasUnacknowledgedCancel);
        Assert.Equal(KitchenTicketStatus.DaXong, acknowledged.Status);
    }

    [Fact]
    public async Task Tc24_Tc44_CancelCookingItem_NeedsManager_ThenReportShowsIt()
    {
        var order = await _pos.OrderOfAsync("T2-03");
        await _host.SignInAsync("phucvu");
        var lau = order.Items.Single(i => i.ItemCode == "M028");
        var request = new CancelItemRequest { Quantity = 1, Reason = CancelReason.ChoLau, Version = order.Version };

        var needApproval = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.CancelItemAsync(order.Id, lau.Id, request)));
        Assert.Equal("Món bếp đã làm, cần quản lý xác nhận", needApproval.Message);
        Assert.Equal(PosErrors.CanQuanLyDuyet, needApproval.Extensions["code"]);

        // Bước 2: tài khoản phucvu không có quyền duyệt → 403.
        var forbidden = await Assert.ThrowsAsync<ForbiddenException>(() => ApproveAsync("phucvu", ApprovalAction.HuyMon));
        Assert.Equal("Tài khoản không có quyền duyệt hủy món", forbidden.Message);

        // Sai mật khẩu → 400 (không 401).
        var wrong = await Assert.ThrowsAsync<DomainException>(() => ApproveAsync("quanly", ApprovalAction.HuyMon, "sai-mat-khau"));
        Assert.Equal("Tên đăng nhập hoặc mật khẩu không đúng", wrong.Message);

        // Bước 3: quanly → hủy, lưu người hủy phucvu, người duyệt quanly, trạng thái lúc hủy Đang làm.
        var approval = await ApproveAsync("quanly", ApprovalAction.HuyMon);
        Assert.Equal("quanly", approval.ApprovedByUsername);
        var after = await _pos.Orders(s => s.CancelItemAsync(order.Id, lau.Id, new CancelItemRequest
        {
            Quantity = 1,
            Reason = CancelReason.ChoLau,
            ApprovalToken = approval.Token,
            Version = order.Version
        }));
        var cancel = after.Items.Single(i => i.Id == lau.Id).Cancel!;
        Assert.Equal("phucvu", cancel.CancelledByUsername);
        Assert.Equal("quanly", cancel.ApprovedByUsername);
        Assert.Equal(OrderItemStatus.DangLam, cancel.StatusAtCancel);
        Assert.Equal("Chờ lâu", cancel.ReasonText);

        // Token dùng một lần.
        var reuse = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.CancelItemAsync(order.Id,
            after.Items.First(i => i.Status == OrderItemStatus.DaPhucVu).Id,
            new CancelItemRequest { Quantity = 1, Reason = CancelReason.Khac, Note = "Lỗi", ApprovalToken = approval.Token, Version = after.Version })));
        Assert.Equal(PosErrors.MaXacNhanKhongHopLe, reuse.Extensions["code"]);

        // TC-44: báo cáo món hủy hôm nay có Lẩu thái hải sản, 1 nồi, 365.000 ₫.
        await _host.SignInAsync("quanly");
        var report = await _host.CallAsync<IReportService, VoidedItemsReport>(s => s.GetVoidedItemsAsync(new VoidedItemsQuery
        {
            From = "2026-10-14",
            To = "2026-10-14"
        }));
        var row = report.Page.Items.Single(r => r.ItemId == lau.Id);
        Assert.Equal("Lẩu thái hải sản", row.ItemName);
        Assert.Equal(1m, row.Quantity);
        Assert.Equal(365_000m, row.Value);
        Assert.Equal(CancelReason.ChoLau, row.Reason);
        Assert.Equal("phucvu", row.CancelledByUsername);
        Assert.Equal("quanly", row.ApprovedByUsername);
        Assert.Equal(OrderItemStatus.DangLam, row.StatusAtCancel);
    }

    [Fact]
    public async Task ManagerWithVoidPermission_CancelsWithoutToken_AndTokenIsBoundToAction()
    {
        var order = await _pos.OrderOfAsync("T2-03");
        var lau = order.Items.Single(i => i.ItemCode == "M028");

        // Token giảm giá không dùng được cho hủy món.
        await _host.SignInAsync("thungan");
        var discountToken = await ApproveAsync("quanly", ApprovalAction.GiamGia, caller: "thungan");
        await _host.SignInAsync("phucvu");
        var wrongAction = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.CancelItemAsync(order.Id, lau.Id,
            new CancelItemRequest { Quantity = 1, Reason = CancelReason.ChoLau, ApprovalToken = discountToken.Token, Version = order.Version })));
        Assert.Equal("Mã xác nhận của quản lý không hợp lệ, xác nhận lại", wrongAction.Message);

        await _host.SignInAsync("quanly");
        var after = await _pos.Orders(s => s.CancelItemAsync(order.Id, lau.Id,
            new CancelItemRequest { Quantity = 1, Reason = CancelReason.ChoLau, Version = order.Version }));
        Assert.Equal("quanly", after.Items.Single(i => i.Id == lau.Id).Cancel!.ApprovedByUsername);
    }

    [Fact]
    public async Task PartialCancel_SplitsLine_WeightMustBeWhole()
    {
        var order = await _pos.OpenAsync("T1-05", 4);
        await _pos.AddStandardItemsAsync(order.Id);
        var sent = await _pos.SendAsync(order.Id);
        var beer = sent.Order.Items.Single(i => i.ItemCode == "M055");
        var fish = sent.Order.Items.Single(i => i.ItemCode == "M014");

        // UC-08 2a: hủy 2 trong 6 lon (bia "Xong" cần quản lý: phục vụ không đủ quyền).
        await _host.SignInAsync("quanly");
        var after = await _pos.Orders(s => s.CancelItemAsync(order.Id, beer.Id,
            new CancelItemRequest { Quantity = 2, Reason = CancelReason.GoiNham, Version = sent.Order.Version }));
        var beers = after.Items.Where(i => i.ItemCode == "M055").ToList();
        Assert.Equal(2, beers.Count);
        Assert.Equal(4m, beers.Single(i => i.Status == OrderItemStatus.Xong).Quantity);
        Assert.Equal(2m, beers.Single(i => i.Status == OrderItemStatus.DaHuy).Quantity);
        Assert.Equal(1_015_000m, after.Subtotal);

        var weight = await Assert.ThrowsAsync<ValidationException>(() => _pos.Orders(s => s.CancelItemAsync(order.Id, fish.Id,
            new CancelItemRequest { Quantity = 0.5m, Reason = CancelReason.GoiNham, Version = after.Version })));
        Assert.Equal("Món theo trọng lượng chỉ hủy nguyên dòng", Assert.Single(weight.Errors).ErrorMessage);
    }

    [Fact]
    public void CancelRequestValidator_RequiresReason_AndNoteForOther()
    {
        var validator = new CancelItemRequestValidator();
        Assert.Equal("Chọn lý do hủy", Assert.Single(validator.Validate(new CancelItemRequest { Quantity = 1 }).Errors).ErrorMessage);
        Assert.Equal("Chọn lý do hủy", Assert.Single(validator.Validate(new CancelItemRequest { Quantity = 1, Reason = CancelReason.HetMon }).Errors).ErrorMessage);
        Assert.Equal("Nhập ghi chú cho lý do Khác",
            Assert.Single(validator.Validate(new CancelItemRequest { Quantity = 1, Reason = CancelReason.Khac }).Errors).ErrorMessage);
    }

    private async Task<ApprovalDto> ApproveAsync(string username, ApprovalAction action, string? password = null, string caller = "phucvu")
    {
        await _host.SignInAsync(caller);
        return await _host.CallAsync<IApprovalService, ApprovalDto>(s => s.ApproveAsync(new ApprovalRequest
        {
            Username = username,
            Password = password ?? RestaurantTestHost.DemoPassword,
            Action = action
        }));
    }
}

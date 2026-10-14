using Application.DTOs.Approvals;
using Application.DTOs.Orders;
using Application.DTOs.Reports;
using Application.Interfaces.Services.Approvals;
using Application.Interfaces.Services.Reports;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using FluentValidation;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Tách hóa đơn, chia đều, giảm giá, thu tiền, hủy hóa đơn (UC-10..UC-12, UC-14): TC-30..TC-33, TC-35, TC-37, TC-38, TC-40, TC-43.</summary>
public sealed class BillingFlowTests : IAsyncLifetime
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
    public async Task Tc30_SplitByItems_EachOrderPricedSeparately()
    {
        var standard = await _pos.StandardOrderAsync();
        var fish = standard.Items.Single(i => i.ItemCode == "M014");
        var beer = standard.Items.Single(i => i.ItemCode == "M055");

        await _host.SignInAsync("thungan");
        var result = await _pos.Orders(s => s.SplitAsync(standard.Id, new SplitOrderRequest
        {
            Parts = [new SplitPartInput { Items = [new ItemQuantityInput { ItemId = fish.Id, Quantity = 1.2m }, new ItemQuantityInput { ItemId = beer.Id, Quantity = 2 }] }],
            Version = standard.Version
        }));

        var (original, created) = (result[0], result[1]);
        Assert.Equal((590_000m, 29_500m, 49_560m, -60m, 669_000m), (created.Subtotal, created.ServiceCharge, created.VatAmount, created.Rounding, created.Total));
        Assert.Equal((475_000m, 23_750m, 39_900m, 350m, 539_000m), (original.Subtotal, original.ServiceCharge, original.VatAmount, original.Rounding, original.Total));
        Assert.Equal(4m, original.Items.Single(i => i.ItemCode == "M055").Quantity);
        Assert.NotEqual(original.Code, created.Code);
        Assert.Equal(original.Code, created.SplitFromCode);
        Assert.Equal(0, created.GuestCount);
        Assert.Equal(4, original.GuestCount);

        // T1-05 hiện 2 tab hóa đơn.
        var service = await _pos.Floor(s => s.GetTableServiceAsync(standard.TableId));
        Assert.Equal(2, service.Orders.Count);
        Assert.Equal(2, service.Table.OrderIds.Count);

        // Bàn đã tách không chuyển, gộp được.
        var t110 = await _pos.TableIdAsync("T1-10");
        var split = await Assert.ThrowsAsync<DomainException>(() =>
            _pos.Orders(s => s.TransferAsync(original.Id, new TransferRequest { TargetTableId = t110, Version = original.Version })));
        Assert.Equal(PosErrors.BanDangTachHoaDon, split.Extensions["code"]);
    }

    [Fact]
    public async Task Tc31_SplitEverything_IsRejected()
    {
        var standard = await _pos.StandardOrderAsync();
        await _host.SignInAsync("thungan");
        var error = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.SplitAsync(standard.Id, new SplitOrderRequest
        {
            Parts = [new SplitPartInput { Items = standard.Items.Select(i => new ItemQuantityInput { ItemId = i.Id, Quantity = i.Quantity }).ToList() }],
            Version = standard.Version
        })));
        Assert.Equal("Hóa đơn gốc phải còn ít nhất 1 món", error.Message);
        Assert.Equal(PosErrors.HoaDonGocHetMon, error.Extensions["code"]);
    }

    [Fact]
    public async Task Tc32_Tc33_SplitEqually_ThenLockAfterFirstShare()
    {
        var standard = await _pos.StandardOrderAsync();
        await _host.SignInAsync("thungan");
        var split = await _pos.Orders(s => s.SplitEqualAsync(standard.Id, new SplitEqualRequest { Count = 3, Version = standard.Version }));
        Assert.Equal([404_000m, 402_000m, 402_000m], split.Shares!.Select(s => s.Amount));

        // Thu phần 1 tiền mặt 404.000 → hóa đơn Đang thu tiền, khóa.
        var share1 = await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 404_000, shareNo: 1);
        Assert.False(share1.Completed);
        Assert.Equal(OrderStatus.DangThu, share1.Order.Status);
        Assert.True(share1.Order.IsLocked);
        Assert.True(share1.Order.Shares!.Single(s => s.No == 1).Paid);

        // TC-33: đổi số phần, giảm giá, thêm món, chuyển bàn đều bị chặn "Hóa đơn đang thu tiền".
        var version = share1.Order.Version;
        await AssertLocked(() => _pos.Orders(s => s.SplitEqualAsync(standard.Id, new SplitEqualRequest { Count = 2, Version = version })));
        await AssertLocked(() => _pos.Orders(s => s.SetDiscountAsync(standard.Id, new DiscountRequest
        {
            Type = DiscountType.PhanTram, Value = 5, Reason = "Khách quen", Version = version
        })));
        await _host.SignInAsync("phucvu");
        await AssertLocked(() => _pos.AddAsync(standard.Id, "M055", 1));
        var t110 = await _pos.TableIdAsync("T1-10");
        await AssertLocked(() => _pos.Orders(s => s.TransferAsync(standard.Id, new TransferRequest { TargetTableId = t110, Version = version })));

        // Phần đã thu → lỗi; sai tiền phần → SaiTienPhan; bàn chỉ Chờ dọn khi thu đủ 3 phần.
        var paidAgain = await Assert.ThrowsAsync<ValidationException>(() => _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 404_000, shareNo: 1));
        Assert.Equal("Phần 1 đã thu", Assert.Single(paidAgain.Errors).ErrorMessage);
        var wrongAmount = await Assert.ThrowsAsync<DomainException>(() => _pos.PayAsync(standard.Id, PaymentMethod.ChuyenKhoan, amount: 400_000, shareNo: 2));
        Assert.Equal("Phần 2 cần thu 402.000 ₫", wrongAmount.Message);
        Assert.Equal(PosErrors.SaiTienPhan, wrongAmount.Extensions["code"]);

        await _pos.PayAsync(standard.Id, PaymentMethod.ChuyenKhoan, amount: 402_000, shareNo: 2);
        Assert.Equal(TableStatus.DangPhucVu, (await _pos.CardAsync("T1-05")).Status);
        var last = await _pos.PayAsync(standard.Id, PaymentMethod.The, amount: 402_000, shareNo: 3);
        Assert.True(last.Completed);
        Assert.Equal(TableStatus.ChoDon, (await _pos.CardAsync("T1-05")).Status);
    }

    [Fact]
    public async Task Tc35_CombinedPayment_Change_IdempotentRetry_ThenClear()
    {
        var standard = await _pos.StandardOrderAsync();

        // Chuyển khoản 1.000.000 → còn 208.000.
        var transfer = await _pos.PayAsync(standard.Id, PaymentMethod.ChuyenKhoan, amount: 1_000_000, requestId: "pay-1");
        Assert.Equal(208_000m, transfer.Order.Remaining);
        Assert.Equal($"VIETQR|970436|0000000000|1000000|{standard.Code}", transfer.Payment.QrContent);

        // Gửi lại cùng mã (version cũ) → 200 kết quả cũ, không thêm lượt thu (TC-35, UC-11 E5).
        await _host.SignInAsync("thungan");
        var retry = await _pos.Orders(s => s.AddPaymentAsync(standard.Id, new CreatePaymentRequest
        {
            ClientRequestId = "pay-1", Version = standard.Version, Method = PaymentMethod.ChuyenKhoan, Amount = 1_000_000
        }));
        Assert.False(retry.Created);
        Assert.Equal(transfer.Payment.Id, retry.Value.Payment.Id);

        // Tiền mặt 300.000 → thối 92.000, hóa đơn Đã thanh toán, 2 lượt thu, bàn Chờ dọn.
        var cash = await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 300_000);
        Assert.Equal(92_000m, cash.ChangeAmount);
        Assert.True(cash.Completed);
        Assert.Equal(OrderStatus.DaThanhToan, cash.Order.Status);
        Assert.Equal(2, cash.Order.Payments.Count);
        Assert.Equal("Võ Thị Ngọc Hân", cash.Order.CashierName);
        Assert.Equal(TableStatus.ChoDon, (await _pos.CardAsync("T1-05")).Status);

        // Dọn xong → Trống; hóa đơn đã đóng không thu thêm.
        await _host.SignInAsync("phucvu");
        Assert.Equal(TableStatus.Trong, (await _pos.Floor(s => s.ClearTableAsync(standard.TableId))).Status);
        var closed = await Assert.ThrowsAsync<DomainException>(() => _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 1_000));
        Assert.Equal("Hóa đơn đã đóng", closed.Message);
    }

    [Fact]
    public async Task PaymentErrors_FollowOrderOfChecks()
    {
        var standard = await _pos.StandardOrderAsync();

        var over = await Assert.ThrowsAsync<DomainException>(() => _pos.PayAsync(standard.Id, PaymentMethod.The, amount: 2_000_000));
        Assert.Equal("Số tiền vượt số còn phải thu 1.208.000 ₫", over.Message);
        Assert.Equal(PosErrors.VuotSoConPhaiThu, over.Extensions["code"]);

        var shortCash = await Assert.ThrowsAsync<DomainException>(() => _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 500_000));
        Assert.Equal("Tiền khách đưa ít hơn số còn phải thu", shortCash.Message);
        Assert.Equal(PosErrors.TienMatThieu, shortCash.Extensions["code"]);

        var missing = await Assert.ThrowsAsync<ValidationException>(() => _pos.PayAsync(standard.Id, PaymentMethod.TienMat));
        Assert.Equal("Nhập tiền khách đưa", Assert.Single(missing.Errors).ErrorMessage);

        // UC-11 E4: thu ngân xác nhận thu một phần → Đang thu tiền.
        var partial = await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 500_000, allowPartial: true);
        Assert.Equal(OrderStatus.DangThu, partial.Order.Status);
        Assert.Equal(708_000m, partial.Order.Remaining);
        Assert.Equal(0m, partial.ChangeAmount);
    }

    [Fact]
    public async Task Tc37_Tc38_Discount_WithinLimit_AndOverLimitWithManager()
    {
        var standard = await _pos.StandardOrderAsync();
        await _host.SignInAsync("thungan");

        // TC-37: 10% → 106.000; 47.950 / 80.556 / +494 / 1.088.000; không cần quản lý.
        var ten = await _pos.Orders(s => s.SetDiscountAsync(standard.Id, new DiscountRequest
        {
            Type = DiscountType.PhanTram, Value = 10, Reason = "Khách quen", Version = standard.Version
        }));
        Assert.Equal((106_000m, 47_950m, 80_556m, 494m, 1_088_000m),
            (ten.Discount!.Amount, ten.ServiceCharge, ten.VatAmount, ten.Rounding, ten.Total));
        Assert.Null(ten.Discount.ApprovedByUsername);

        // TC-38: 15% vượt hạn mức → 400 kèm discountLimit, requestedDiscount; quanly xác nhận → 1.027.000.
        var over = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.SetDiscountAsync(standard.Id, new DiscountRequest
        {
            Type = DiscountType.PhanTram, Value = 15, Reason = "Khách quen", Version = ten.Version
        })));
        Assert.Equal("Giảm giá vượt hạn mức 10%, cần quản lý xác nhận", over.Message);
        Assert.Equal(PosErrors.VuotHanMucGiamGia, over.Extensions["code"]);
        Assert.Equal(106_500m, over.Extensions["discountLimit"]);
        Assert.Equal(159_000m, over.Extensions["requestedDiscount"]);

        var token = await _host.CallAsync<IApprovalService, ApprovalDto>(s => s.ApproveAsync(new ApprovalRequest
        {
            Username = "quanly", Password = RestaurantTestHost.DemoPassword, Action = ApprovalAction.GiamGia
        }));
        var fifteen = await _pos.Orders(s => s.SetDiscountAsync(standard.Id, new DiscountRequest
        {
            Type = DiscountType.PhanTram, Value = 15, Reason = "Khách quen", ApprovalToken = token.Token, Version = ten.Version
        }));
        Assert.Equal((159_000m, 45_300m, 76_104m, -404m, 1_027_000m),
            (fifteen.Discount!.Amount, fifteen.ServiceCharge, fifteen.VatAmount, fifteen.Rounding, fifteen.Total));
        Assert.Equal("quanly", fifteen.Discount.ApprovedByUsername);

        // Gỡ giảm giá → về 1.208.000.
        var removed = await _pos.Orders(s => s.RemoveDiscountAsync(standard.Id, fifteen.Version));
        Assert.Null(removed.Discount);
        Assert.Equal(1_208_000m, removed.Total);
    }

    [Fact]
    public async Task Tc40_Tc43_PaidOrderRaisesRevenue_CancelTodayRemovesIt()
    {
        await _host.SignInAsync("quanly");
        var before = await _host.CallAsync<IReportService, DashboardReport>(s => s.GetDashboardAsync());

        var standard = await _pos.StandardOrderAsync();
        await _pos.PayAsync(standard.Id, PaymentMethod.ChuyenKhoan, amount: 1_000_000);
        await _pos.PayAsync(standard.Id, PaymentMethod.TienMat, cash: 300_000);

        // TC-43: doanh thu thuần tăng đúng 1.065.000 (không gồm phí phục vụ, thuế), số hóa đơn tăng 1.
        await _host.SignInAsync("quanly");
        var after = await _host.CallAsync<IReportService, DashboardReport>(s => s.GetDashboardAsync());
        Assert.Equal(before.Revenue + 1_065_000m, after.Revenue);
        Assert.Equal(before.PaidOrderCount + 1, after.PaidOrderCount);

        // TC-40: hủy hóa đơn trong ngày, lý do "Nhập nhầm" → Đã hủy, doanh thu giảm 1.065.000.
        var cancelled = await _pos.Orders(s => s.CancelPaidAsync(standard.Id, new CancelOrderRequest { Reason = "Nhập nhầm" }));
        Assert.Equal(OrderStatus.DaHuy, cancelled.Status);
        Assert.Equal("quanly", cancelled.CancelledByUsername);
        Assert.Equal(2, cancelled.Payments.Count); // không xóa lượt thu
        var afterCancel = await _host.CallAsync<IReportService, DashboardReport>(s => s.GetDashboardAsync());
        Assert.Equal(before.Revenue, afterCancel.Revenue);

        var again = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.CancelPaidAsync(standard.Id, new CancelOrderRequest { Reason = "x" })));
        Assert.Equal("Hóa đơn đã hủy trước đó", again.Message);

        // Hóa đơn thanh toán hôm trước không hủy được.
        var old = await _host.QueryAsync<Domain.Entities.Pos.Orders.Order, Guid>(q => Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstAsync(
            q.Where(o => o.Status == OrderStatus.DaThanhToan && o.PaidAt < RestaurantTestHost.Start.UtcDateTime.AddDays(-1)).Select(o => o.Id)));
        var notToday = await Assert.ThrowsAsync<DomainException>(() => _pos.Orders(s => s.CancelPaidAsync(old, new CancelOrderRequest { Reason = "x" })));
        Assert.Equal("Chỉ hủy được hóa đơn thanh toán trong ngày", notToday.Message);
        Assert.Equal(PosErrors.KhongHuyDuocHoaDon, notToday.Extensions["code"]);
    }

    [Fact]
    public async Task OrderList_DefaultsToToday_WaiterSeesOnlyOpenOrders()
    {
        await _host.SignInAsync("thungan");
        var all = await _pos.Orders(s => s.GetPagedAsync(new OrderQuery { PageSize = 100 }));
        Assert.Equal(31, all.TotalCount); // 16 + 14 + 1 hóa đơn mở hôm nay
        Assert.True(all.Items.Zip(all.Items.Skip(1)).All(p => p.First.OpenedAt >= p.Second.OpenedAt));

        await _host.SignInAsync("phucvu");
        var open = await _pos.Orders(s => s.GetPagedAsync(new OrderQuery { PageSize = 100 }));
        Assert.Equal(13, open.TotalCount);
        var paidId = all.Items.First(o => o.Status == OrderStatus.DaThanhToan).Id;
        await Assert.ThrowsAsync<Application.Common.Exceptions.ForbiddenException>(() => _pos.Orders(s => s.GetByIdAsync(paidId)));
    }

    private static async Task AssertLocked(Func<Task> action)
    {
        var error = await Assert.ThrowsAsync<DomainException>(action);
        Assert.Equal("Hóa đơn đang thu tiền", error.Message);
        Assert.Equal(PosErrors.HoaDonDangThuTien, error.Extensions["code"]);
    }
}

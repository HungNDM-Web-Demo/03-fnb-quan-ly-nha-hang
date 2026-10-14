using Application.Common.Exceptions;
using Application.Common.Time;
using Application.Constants;
using Application.DTOs.Orders;
using Application.Mappings.Orders;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Orders;

// Tạm tính, giảm giá, tách hóa đơn, chia đều, thu tiền, chốt, hủy hóa đơn (UC-10, UC-11, UC-12; 07 §2.13, §2.14, §3).
public sealed partial class OrderService
{
    public const string DepositCoversMessage = "Tiền cọc đã đủ, không cần chia";
    public const string AlreadyPaidMessage = "Hóa đơn đã thu đủ tiền";

    public async Task<OrderDto> PrebillAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);
        EnsureReadyToBill(order);

        var now = Now;
        order.PrintPrebill(now);
        var table = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == order.TableId, ct);
        if (table.Status == TableStatus.DangPhucVu)
            table.SetStatus(TableStatus.ChoThanhToan, now);

        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> SetDiscountAsync(Guid orderId, DiscountRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);

        var profile = await ProfileAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        var type = request.Type!.Value;
        var amount = OrderPricing.DiscountAmount(type, request.Value, order.Subtotal);
        var limit = OrderPricing.DiscountLimit(order.Subtotal, profile.CashierDiscountLimit);

        // BR-08 (07 §3.3): vượt hạn mức thu ngân cần quản lý xác nhận, trừ khi người gọi có orders.discount-override.
        (Guid Id, string Username)? approver = null;
        if (amount > limit)
        {
            if (await HasPermissionAsync(ProjectPermissions.Orders.DiscountOverride, ct))
            {
                var user = await CurrentUserAsync(ct);
                approver = (user.Id, user.Username);
            }
            else if (!string.IsNullOrWhiteSpace(request.ApprovalToken))
            {
                approver = approvals.Consume(request.ApprovalToken, ApprovalAction.GiamGia)
                    ?? throw PosErrors.Business(PosErrors.MaXacNhanKhongHopLe, PosErrors.InvalidApprovalMessage);
            }
            else
            {
                throw PosErrors.Business(
                    PosErrors.VuotHanMucGiamGia,
                    $"Giảm giá vượt hạn mức {profile.CashierDiscountLimit}%, cần quản lý xác nhận",
                    new Dictionary<string, object?> { ["discountLimit"] = limit, ["requestedDiscount"] = amount });
            }
        }

        order.SetDiscount(type, request.Value, request.Reason, approver);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> RemoveDiscountAsync(Guid orderId, int version, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, version);

        order.ClearDiscount();
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<IReadOnlyList<OrderDto>> SplitAsync(Guid orderId, SplitOrderRequest request, CancellationToken ct = default)
    {
        var original = await LoadAsync(orderId, ct);
        original.EnsureEditable();
        CheckVersion(original, request.Version);
        if (original.UnsentCount > 0)
            throw PosErrors.UnsentItems(original.UnsentCount);
        if (original.SplitCount is not null)
            throw PosErrors.Business(PosErrors.DangChiaDeu, PosErrors.SplittingEquallyMessage);

        // Kiểm từng dòng: đã gửi, chưa hủy; theo trọng lượng nguyên dòng; tổng số lượng không vượt dòng (BR-18).
        var requested = new Dictionary<Guid, decimal>();
        for (var p = 0; p < request.Parts.Count; p++)
        {
            for (var j = 0; j < request.Parts[p].Items.Count; j++)
            {
                var input = request.Parts[p].Items[j];
                var prefix = $"parts[{p}].items[{j}]";
                var item = original.Items.FirstOrDefault(i => i.Id == input.ItemId)
                    ?? throw FieldErrors.Single(prefix + ".itemId", ItemNotFoundMessage);
                if (item.IsDraft || item.IsCancelled)
                    throw FieldErrors.Single(prefix + ".itemId", "Chỉ tách món đã gửi bếp, chưa hủy");

                var total = requested.GetValueOrDefault(item.Id) + input.Quantity;
                if (item.PricingType == PricingType.TheoTrongLuong && (input.Quantity != item.Quantity || requested.ContainsKey(item.Id)))
                    throw FieldErrors.Single(prefix + ".quantity", "Món theo trọng lượng chỉ tách nguyên dòng");
                if (item.PricingType == PricingType.TheoSuat
                    && (input.Quantity != Math.Floor(input.Quantity) || input.Quantity < 1 || total > item.Quantity))
                {
                    throw FieldErrors.Single(prefix + ".quantity", $"Số lượng tách từ 1 đến {item.Quantity:0}");
                }

                requested[item.Id] = total;
            }
        }

        // TC-31: hóa đơn gốc phải còn ít nhất 1 dòng không hủy.
        var remainingLines = original.Items.Count(i => !i.IsCancelled && i.Quantity > requested.GetValueOrDefault(i.Id));
        if (remainingLines == 0)
            throw PosErrors.Business(PosErrors.HoaDonGocHetMon, PosErrors.OriginalEmptyMessage);

        var activeCount = await orders.QueryNoTracking()
            .CountAsync(o => o.TableId == original.TableId && PosReadModel.ActiveStatuses.Contains(o.Status), ct);
        if (activeCount + request.Parts.Count > PosRules.MaxOrdersPerTable)
            throw PosErrors.Business(PosErrors.QuaSoHoaDon, PosErrors.TooManyOrdersMessage);

        var now = Now;
        var profile = await ProfileAsync(ct);
        var created = new List<Order>();
        for (var p = 0; p < request.Parts.Count; p++)
        {
            var code = await PosCodes.NextOrderCodeAsync(orders, now, p, ct);
            var part = Order.SplitFrom(original, code, profile.ServiceChargeRate, profile.VatRate);
            foreach (var input in request.Parts[p].Items)
            {
                var item = original.Items.First(i => i.Id == input.ItemId);
                if (input.Quantity == item.Quantity)
                {
                    part.TakeItem(item, original);
                }
                else
                {
                    var copy = item.SplitOff(input.Quantity);
                    part.TakeItem(copy, null);
                    await orderItems.AddAsync(copy, ct);
                }
            }

            part.Recalculate();
            created.Add(part);
            await orders.AddAsync(part, ct);
        }

        // BR-18: giảm giá của hóa đơn gốc bị gỡ; khách, tiền cọc ở lại gốc.
        original.ClearDiscount();
        await TouchAsync(original, ct);
        await SaveAsync(original, ct);

        await events.OrderChangedAsync(original, ct);
        foreach (var order in created)
            await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([original.TableId], ct);

        var result = new List<OrderDto> { await ReloadDtoAsync(original.Id, ct) };
        foreach (var order in created)
            result.Add(await ReloadDtoAsync(order.Id, ct));
        return result;
    }

    public async Task<OrderDto> SplitEqualAsync(Guid orderId, SplitEqualRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);

        var profile = await ProfileAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        if (order.Total - order.Deposit <= 0)
            throw new DomainException(DepositCoversMessage);

        order.SetSplitCount(request.Count);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> CancelSplitEqualAsync(Guid orderId, int version, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, version);

        order.SetSplitCount(null);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<CreatedResult<PaymentResultDto>> AddPaymentAsync(Guid orderId, CreatePaymentRequest request, CancellationToken ct = default)
    {
        // 07 §2.14, bước 1: cùng clientRequestId đã ghi → 200 kết quả cũ, không xét version (TC-35, UC-11 E5).
        var requestId = request.ClientRequestId.Trim();
        if (await ExistingPaymentAsync(requestId, ct) is { } existing)
            return new CreatedResult<PaymentResultDto>(existing, false);

        var order = await LoadAsync(orderId, ct);

        // Lần bấm trước vừa lưu xong sau bước 1 (hai request cùng mã gần như đồng thời) → vẫn trả kết quả cũ (07 §3.7).
        if (order.Payments.Any(p => p.ClientRequestId == requestId) && await ExistingPaymentAsync(requestId, ct) is { } justPaid)
            return new CreatedResult<PaymentResultDto>(justPaid, false);

        // Bước 2–4: hóa đơn đã đóng; version lệch; còn món chưa gửi.
        if (!order.IsActive)
            throw PosErrors.OrderClosed();
        CheckVersion(order, request.Version);
        EnsureReadyToBill(order);

        var profile = await ProfileAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        if (order.Remaining <= 0)
            throw new DomainException(AlreadyPaidMessage);

        // Bước 5: thiếu trường theo phương thức.
        var method = request.Method!.Value;
        if (method == PaymentMethod.TienMat && request.CashReceived is not > 0)
            throw FieldErrors.Single("cashReceived", "Nhập tiền khách đưa");
        if (method != PaymentMethod.TienMat && request.Amount is not > 0)
            throw FieldErrors.Single("amount", "Nhập số tiền");
        if (method == PaymentMethod.The && string.IsNullOrWhiteSpace(request.CardLast4))
            throw FieldErrors.Single("cardLast4", "Nhập 4 số cuối thẻ");

        // Bước 6: đang chia đều thì phải chọn phần chưa thu (BR-19).
        decimal? shareAmount = null;
        if (order.SplitCount is not null)
        {
            var share = order.Shares().FirstOrDefault(s => s.No == request.ShareNo)
                ?? throw FieldErrors.Single("shareNo", "Chọn phần cần thu");
            if (order.Payments.Any(p => p.ShareNo == share.No))
                throw FieldErrors.Single("shareNo", $"Phần {share.No} đã thu");
            shareAmount = share.Amount;
        }

        // Bước 7–8: số tiền (BR-20).
        decimal amount;
        decimal? cashReceived = null;
        var target = shareAmount ?? order.Remaining;
        if (method == PaymentMethod.TienMat)
        {
            cashReceived = request.CashReceived!.Value;
            if (cashReceived < target)
            {
                if (shareAmount is not null)
                    throw PosErrors.Field(PosErrors.SaiTienPhan, "cashReceived", $"Phần {request.ShareNo} cần thu {PosRules.FormatVnd(target)}");
                if (request.AllowPartial != true)
                    throw PosErrors.Field(PosErrors.TienMatThieu, "cashReceived", PosErrors.CashShortMessage);
            }

            amount = Math.Min(cashReceived.Value, target);
        }
        else
        {
            amount = request.Amount!.Value;
            if (shareAmount is not null && amount != shareAmount)
                throw PosErrors.Field(PosErrors.SaiTienPhan, "amount", $"Phần {request.ShareNo} cần thu {PosRules.FormatVnd(shareAmount.Value)}");
            if (amount > order.Remaining)
                throw PosErrors.Field(PosErrors.VuotSoConPhaiThu, "amount", $"Số tiền vượt số còn phải thu {PosRules.FormatVnd(order.Remaining)}");
        }

        var now = Now;
        var cashier = await CurrentUserAsync(ct);
        var payment = Payment.Collect(
            order.Id, requestId, method, amount, cashReceived,
            method == PaymentMethod.The ? request.CardLast4 : null,
            order.SplitCount is null ? null : request.ShareNo,
            method == PaymentMethod.ChuyenKhoan ? request.QrContent : null,
            now, cashier.Id, cashier.FullName);

        // Lượt đầu tiên không phải tiền cọc chốt tỉ lệ và khóa hóa đơn (BR-22); thu đủ → Đã thanh toán (FR-31).
        order.RegisterPayment(payment, now, (cashier.Id, cashier.FullName));
        await payments.AddAsync(payment, ct);
        order.Touch();
        var changedTables = await MarkTablePaidIfDoneAsync(order, now, ct);

        try
        {
            await SaveAsync(order, ct);
        }
        catch (Exception ex) when (ex is ConflictException or DbUpdateException)
        {
            // Hai request cùng mã đến đồng thời: request sau đọc lại và trả kết quả của request trước (07 §3.7).
            if (await ExistingPaymentAsync(requestId, ct) is { } duplicated)
                return new CreatedResult<PaymentResultDto>(duplicated, false);
            throw;
        }

        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync(changedTables.Append(order.TableId), ct);

        return new CreatedResult<PaymentResultDto>(new PaymentResultDto
        {
            Order = await ReloadDtoAsync(order.Id, ct),
            Payment = payment.ToDto(),
            ChangeAmount = payment.ChangeAmount ?? 0,
            Completed = order.Status == OrderStatus.DaThanhToan
        }, true);
    }

    public async Task<OrderDto> CompleteAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        if (order.Status == OrderStatus.DaThanhToan)
            return await ToDtoAsync(order, ct);
        if (!order.IsActive)
            throw PosErrors.OrderClosed();
        CheckVersion(order, request.Version);
        EnsureReadyToBill(order);

        // BR-25: đủ tiền nhờ tiền cọc; cọc lớn hơn tổng thì lượt cọc giảm về tổng, ghi tiền hoàn cọc.
        var profile = await ProfileAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        var now = Now;
        var cashier = await CurrentUserAsync(ct);
        order.Complete(now, (cashier.Id, cashier.FullName));
        order.Touch();
        var changedTables = await MarkTablePaidIfDoneAsync(order, now, ct);

        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync(changedTables.Append(order.TableId), ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> CancelPaidAsync(Guid orderId, CancelOrderRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        if (order.Status == OrderStatus.DaHuy)
            throw new DomainException("Hóa đơn đã hủy trước đó");

        // BR-23: chỉ hóa đơn thanh toán trong ngày hiện tại (giờ Việt Nam).
        if (order.Status != OrderStatus.DaThanhToan || order.PaidAt is not { } paidAt
            || VietnamDates.DateOf(paidAt) != VietnamDates.Today(timeProvider))
        {
            throw PosErrors.Business(PosErrors.KhongHuyDuocHoaDon, PosErrors.CancelOnlyTodayMessage);
        }

        var user = await CurrentUserAsync(ct);
        order.CancelPaid(request.Reason, (user.Id, user.Username), Now);
        order.Touch();
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    /// <summary>BR-21: tạm tính, tách, thanh toán bị chặn khi còn món "Chưa gửi"; hóa đơn chưa có món đã gửi → 400.</summary>
    private static void EnsureReadyToBill(Order order)
    {
        if (order.UnsentCount > 0)
            throw PosErrors.UnsentItems(order.UnsentCount);
        if (!order.HasSentItems)
            throw new DomainException(PosErrors.NoItemsMessage);
    }

    private async Task<PaymentResultDto?> ExistingPaymentAsync(string requestId, CancellationToken ct)
    {
        var payment = await payments.QueryNoTracking().FirstOrDefaultAsync(p => p.ClientRequestId == requestId, ct);
        if (payment is null)
            return null;

        var order = await ReloadDtoAsync(payment.OrderId, ct);
        return new PaymentResultDto
        {
            Order = order,
            Payment = payment.ToDto(),
            ChangeAmount = payment.ChangeAmount ?? 0,
            Completed = order.Status == OrderStatus.DaThanhToan
        };
    }
}

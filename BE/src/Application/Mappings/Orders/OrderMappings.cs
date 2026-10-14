using Application.DTOs.Orders;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Application.Mappings.Orders;

/// <summary>Chữ hiển thị dùng chung với FE <c>features/pos/lib/labels.ts</c> (07 §2).</summary>
public static class PosLabels
{
    public static string CancelReasonText(CancelReason reason) => reason switch
    {
        CancelReason.KhachDoiY => "Khách đổi ý",
        CancelReason.GoiNham => "Gọi nhầm",
        CancelReason.ChoLau => "Chờ lâu",
        CancelReason.Khac => "Khác",
        CancelReason.HetMon => "Hết món",
        _ => reason.ToString()
    };

    /// <summary>"Chờ lâu" hoặc "Khác: {ghi chú}".</summary>
    public static string CancelReasonText(CancelReason reason, string? note) =>
        reason == CancelReason.Khac && !string.IsNullOrWhiteSpace(note) ? $"Khác: {note}" : CancelReasonText(reason);

    public static string StationText(KitchenStation station) => station switch
    {
        KitchenStation.BepNong => "Bếp nóng",
        KitchenStation.BepNguoi => "Bếp nguội",
        KitchenStation.QuayBar => "Quầy bar",
        KitchenStation.KhongQuaBep => "Không qua bếp",
        _ => station.ToString()
    };
}

/// <summary>Thông tin ngoài bảng <c>Pos_Orders</c> cần cho <see cref="OrderDto"/> (mã bàn, bàn phụ, mã phiếu…).</summary>
public sealed class OrderDtoExtras
{
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public IReadOnlyList<string> MergedTableCodes { get; init; } = [];
    public string? MergedIntoTableCode { get; init; }
    public string? SplitFromCode { get; init; }
    public string? ReservationCode { get; init; }

    /// <summary>Mã phiếu theo id phiếu.</summary>
    public IReadOnlyDictionary<Guid, string> TicketCodes { get; init; } = new Dictionary<Guid, string>();

    /// <summary>Món đang tạm hết (để gắn nhãn dòng "Chưa gửi").</summary>
    public IReadOnlySet<Guid> SoldOutMenuItemIds { get; init; } = new HashSet<Guid>();
}

public static class OrderMappings
{
    public static OrderDto ToDto(this Order order, OrderDtoExtras extras, DateTime nowUtc)
    {
        var items = order.Items.OrderBy(i => i.SortOrder).ThenBy(i => i.CreatedAt).ThenBy(i => i.Id).ToList();
        var payments = order.Payments.OrderBy(p => p.PaidAt).ThenBy(p => p.CreatedAt).ToList();
        var shares = order.SplitCount is null
            ? null
            : order.Shares().Select(s => new OrderShareDto
            {
                No = s.No,
                Amount = s.Amount,
                Paid = payments.Any(p => p.ShareNo == s.No)
            }).ToList();

        return new OrderDto
        {
            Id = order.Id,
            Code = order.Code,
            Status = order.Status,
            Version = order.Version,
            TableId = order.TableId,
            TableCode = extras.TableCode,
            AreaName = extras.AreaName,
            MergedTableCodes = extras.MergedTableCodes,
            MergedIntoOrderId = order.MergedIntoOrderId,
            MergedIntoTableCode = extras.MergedIntoTableCode,
            SplitFromOrderId = order.SplitFromOrderId,
            SplitFromCode = extras.SplitFromCode,
            ReservationId = order.ReservationId,
            ReservationCode = extras.ReservationCode,
            WaiterId = order.WaiterId,
            WaiterName = order.WaiterName,
            GuestCount = order.GuestCount,
            Note = order.Note,
            OpenedAt = order.OpenedAt,
            BatchCount = order.BatchCount,
            PrebillPrintedAt = order.PrebillPrintedAt,
            Items = items.Select(i => i.ToDto(extras, nowUtc)).ToList(),
            Subtotal = order.Subtotal,
            Discount = order.DiscountType is { } type
                ? new OrderDiscountDto
                {
                    Type = type,
                    Value = order.DiscountValue ?? 0,
                    Amount = order.DiscountAmount,
                    Reason = order.DiscountReason ?? string.Empty,
                    ApprovedByUsername = order.DiscountApprovedByUsername
                }
                : null,
            ServiceChargeRate = order.ServiceChargeRate,
            ServiceCharge = order.ServiceCharge,
            VatRate = order.VatRate,
            VatAmount = order.VatAmount,
            GrossTotal = order.GrossTotal,
            Rounding = order.Rounding,
            Total = order.Total,
            Deposit = order.Deposit,
            DepositRefund = order.DepositRefund,
            PaidAmount = order.PaidAmount,
            Remaining = order.Remaining,
            SplitCount = order.SplitCount,
            Shares = shares,
            Payments = payments.Select(p => p.ToDto()).ToList(),
            Counts = new OrderCountsDto
            {
                Unsent = items.Count(i => i.IsDraft),
                Pending = items.Count(i => i.IsPending),
                Ready = items.Count(i => i.IsReady),
                Late = items.Count(i => i.IsLateAt(nowUtc))
            },
            IsLocked = order.IsLocked,
            PaidAt = order.PaidAt,
            CashierName = order.CashierName,
            CancelledAt = order.CancelledAt,
            CancelledByUsername = order.CancelledByUsername,
            CancelReason = order.CancelReason,
            AsOf = nowUtc
        };
    }

    public static OrderItemDto ToDto(this OrderItem item, OrderDtoExtras extras, DateTime nowUtc) => new()
    {
        Id = item.Id,
        MenuItemId = item.MenuItemId,
        ItemCode = item.ItemCode,
        ItemName = item.ItemName,
        Unit = item.Unit,
        PricingType = item.PricingType,
        Station = item.Station,
        UnitPrice = item.UnitPrice,
        Quantity = item.Quantity,
        LineTotal = item.LineTotal,
        Note = item.Note,
        QuickNotes = item.GetQuickNotes(),
        IsRush = item.IsRush,
        Status = item.Status,
        BatchNo = item.BatchNo,
        KitchenTicketId = item.KitchenTicketId,
        KitchenTicketCode = item.KitchenTicketId is { } ticketId ? extras.TicketCodes.GetValueOrDefault(ticketId) : null,
        PrepMinutes = item.PrepMinutes,
        SentAt = item.SentAt,
        StartedAt = item.StartedAt,
        DoneAt = item.DoneAt,
        ServedAt = item.ServedAt,
        IsLate = item.IsLateAt(nowUtc),
        IsSoldOut = item.IsDraft && extras.SoldOutMenuItemIds.Contains(item.MenuItemId),
        Cancel = item.IsCancelled && item.CancelReason is { } reason
            ? new OrderItemCancelDto
            {
                Reason = reason,
                ReasonText = PosLabels.CancelReasonText(reason, item.CancelNote),
                Note = item.CancelNote,
                CancelledAt = item.CancelledAt ?? default,
                CancelledByName = item.CancelledByName ?? string.Empty,
                CancelledByUsername = item.CancelledByUsername ?? string.Empty,
                ApprovedByUsername = item.CancelApprovedByUsername,
                StatusAtCancel = item.StatusAtCancel ?? OrderItemStatus.ChoLam,
                Acknowledged = item.CancelAcknowledgedAt is not null
            }
            : null
    };

    public static PaymentDto ToDto(this Payment payment) => new()
    {
        Id = payment.Id,
        Method = payment.Method,
        Amount = payment.Amount,
        CashReceived = payment.CashReceived,
        ChangeAmount = payment.ChangeAmount,
        CardLast4 = payment.CardLast4,
        ShareNo = payment.ShareNo,
        QrContent = payment.QrContent,
        PaidAt = payment.PaidAt,
        CashierName = payment.CashierName
    };
}

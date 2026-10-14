using Domain.Base;
using Domain.Common;
using Domain.Enums.Pos.Orders;

namespace Domain.Entities.Pos.Orders;

/// <summary>
/// Hóa đơn của bàn (bảng <c>Pos_Orders</c>), gồm hóa đơn tách và hóa đơn bàn phụ đã gộp. Không bao giờ xóa, chỉ đổi trạng thái.
/// Tiền tính lại bằng <see cref="OrderPricing"/> ở mỗi thay đổi (<see cref="Recalculate"/>); tỉ lệ phí phục vụ, thuế suất
/// theo cài đặt hiện tại khi còn mở, chốt ở lượt thu đầu tiên không phải tiền cọc (07 §5 quyết định 4).
/// <see cref="Version"/> là concurrency token, tăng ở mọi thay đổi trừ thao tác bếp, ra món (07 §3.6).
/// </summary>
public class Order : BaseEntity, ICreationTracked, IModificationTracked
{
    public const int CodeMaxLength = 20;
    public const int ClientRequestIdMaxLength = 64;
    public const int NoteMaxLength = 500;
    public const int NameMaxLength = 150;
    public const int UsernameMaxLength = 50;
    public const int ReasonMaxLength = 200;

    private readonly List<OrderItem> _items = [];
    private readonly List<Payment> _payments = [];

    private Order()
    {
    }

    public string Code { get; private set; } = string.Empty;
    public string? ClientRequestId { get; private set; }
    public Guid TableId { get; private set; }
    public OrderStatus Status { get; private set; }
    public int GuestCount { get; private set; }
    public string? Note { get; private set; }
    public Guid WaiterId { get; private set; }
    public string WaiterName { get; private set; } = string.Empty;
    public DateTime OpenedAt { get; private set; }
    public int BatchCount { get; private set; }
    public DateTime? PrebillPrintedAt { get; private set; }
    public decimal Subtotal { get; private set; }
    public DiscountType? DiscountType { get; private set; }
    public decimal? DiscountValue { get; private set; }
    public decimal DiscountAmount { get; private set; }
    public string? DiscountReason { get; private set; }
    public Guid? DiscountApprovedById { get; private set; }
    public string? DiscountApprovedByUsername { get; private set; }
    public int ServiceChargeRate { get; private set; }
    public decimal ServiceCharge { get; private set; }
    public int VatRate { get; private set; }
    public decimal VatAmount { get; private set; }
    public decimal Rounding { get; private set; }
    public decimal Total { get; private set; }
    public decimal Deposit { get; private set; }
    public decimal DepositRefund { get; private set; }
    public decimal PaidAmount { get; private set; }
    public int? SplitCount { get; private set; }
    public Guid? ReservationId { get; private set; }
    public Guid? SplitFromOrderId { get; private set; }
    public Guid? MergedIntoOrderId { get; private set; }
    public DateTime? MergedAt { get; private set; }
    public DateTime? PaidAt { get; private set; }
    public Guid? CashierId { get; private set; }
    public string? CashierName { get; private set; }
    public DateTime? CancelledAt { get; private set; }
    public Guid? CancelledById { get; private set; }
    public string? CancelledByUsername { get; private set; }
    public string? CancelReason { get; private set; }
    public int Version { get; private set; } = 1;

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public IReadOnlyCollection<OrderItem> Items => _items;
    public IReadOnlyCollection<Payment> Payments => _payments;

    /// <summary>Hóa đơn đang mở hoặc đang thu tiền (còn trên bàn).</summary>
    public bool IsActive => Status is OrderStatus.DangMo or OrderStatus.DangThu;

    /// <summary>BR-22: có lượt thu không phải tiền cọc thì khóa.</summary>
    public bool IsLocked => _payments.Any(p => !p.IsDeposit);

    public decimal Remaining => Math.Max(0, Total - PaidAmount);

    public decimal GrossTotal => Total - Rounding;

    public int UnsentCount => _items.Count(i => i.IsDraft);

    public bool HasSentItems => _items.Any(i => !i.IsDraft && !i.IsCancelled);

    /// <summary>Mở bàn (UC-02) hoặc nhận bàn từ đặt bàn (UC-13): hóa đơn "Đang mở".</summary>
    public static Order Open(
        string code,
        Guid tableId,
        int guestCount,
        (Guid Id, string FullName) waiter,
        DateTime openedAtUtc,
        string? clientRequestId,
        int serviceChargeRate,
        int vatRate,
        string? note = null,
        decimal deposit = 0,
        Guid? reservationId = null)
    {
        if (guestCount < 0 || guestCount > PosRules.GuestMax)
            throw new DomainException("Số khách từ 1 đến 50");

        return new Order
        {
            Code = code,
            ClientRequestId = string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            TableId = tableId,
            Status = OrderStatus.DangMo,
            GuestCount = guestCount,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            WaiterId = waiter.Id,
            WaiterName = waiter.FullName,
            OpenedAt = openedAtUtc,
            ServiceChargeRate = serviceChargeRate,
            VatRate = vatRate,
            Deposit = deposit,
            ReservationId = reservationId
        };
    }

    /// <summary>
    /// BR-18: hóa đơn mới khi tách, cùng bàn, cùng phục vụ, 0 khách, mã mới. Giữ giờ mở, giờ in tạm tính và số lần gọi
    /// của hóa đơn gốc (07 §5 quyết định 44): khách vẫn ngồi từ lúc mở bàn, phiếu tạm tính đã in vẫn còn hiệu lực.
    /// </summary>
    public static Order SplitFrom(Order original, string code, int serviceChargeRate, int vatRate)
    {
        var order = Open(code, original.TableId, 0, (original.WaiterId, original.WaiterName), original.OpenedAt, null, serviceChargeRate, vatRate);
        order.SplitFromOrderId = original.Id;
        order.PrebillPrintedAt = original.PrebillPrintedAt;
        order.BatchCount = original.BatchCount;
        return order;
    }

    public void AssignCode(string code) => Code = code;

    /// <summary>Mọi thay đổi của hóa đơn hoặc món (trừ thao tác bếp, ra món) tăng phiên bản (07 §3.6).</summary>
    public void Touch() => Version++;

    /// <summary>Chỉ hóa đơn "Đang mở" sửa được; đang thu tiền → "Hóa đơn đang thu tiền" (BR-22); đã đóng → "Hóa đơn đã đóng".</summary>
    public void EnsureEditable()
    {
        if (Status == OrderStatus.DangThu)
            throw PosErrors.OrderLocked();
        if (Status != OrderStatus.DangMo)
            throw PosErrors.OrderClosed();
    }

    public int NextSortOrder() => _items.Count == 0 ? 1 : _items.Max(i => i.SortOrder) + 1;

    public void AddItem(OrderItem item) => _items.Add(item);

    public void RemoveItem(OrderItem item) => _items.Remove(item);

    /// <summary>Nhận dòng từ hóa đơn khác (gộp bàn, chuyển món, tách), xếp cuối.</summary>
    public void TakeItem(OrderItem item, Order? from)
    {
        from?._items.Remove(item);
        item.MoveTo(Id, NextSortOrder());
        _items.Add(item);
    }

    /// <summary>Gửi bếp: lần gọi tăng 1 (BR-09). Trả số lần gọi mới.</summary>
    public int NextBatch() => ++BatchCount;

    /// <summary>
    /// Tính lại tiền (07 §3). Hóa đơn đang mở, chưa khóa lấy tỉ lệ theo cài đặt hiện tại khi truyền vào.
    /// Giảm giá giữ kiểu, giá trị; số tiền giảm tính lại theo tiền món mới (07 §3.3 bước 3).
    /// </summary>
    public void Recalculate(int? serviceChargeRate = null, int? vatRate = null)
    {
        if (Status == OrderStatus.DangMo && !IsLocked)
        {
            if (serviceChargeRate is { } service)
                ServiceChargeRate = service;
            if (vatRate is { } vat)
                VatRate = vat;
        }

        Subtotal = _items.Where(i => i.IsBillable).Sum(i => i.LineTotal);
        var totals = OrderPricing.Price(Subtotal, DiscountType, DiscountValue, ServiceChargeRate, VatRate);
        DiscountAmount = totals.DiscountAmount;
        ServiceCharge = totals.ServiceCharge;
        VatAmount = totals.VatAmount;
        Rounding = totals.Rounding;
        Total = totals.Total;
        PaidAmount = _payments.Sum(p => p.Amount);
        DepositRefund = Math.Max(0, Deposit - Total);
    }

    /// <summary>BR-08: mỗi hóa đơn một khoản giảm; đặt mới thay khoản cũ.</summary>
    public void SetDiscount(DiscountType type, decimal value, string reason, (Guid Id, string Username)? approvedBy)
    {
        DiscountType = type;
        DiscountValue = value;
        DiscountReason = reason.Trim();
        DiscountApprovedById = approvedBy?.Id;
        DiscountApprovedByUsername = approvedBy?.Username;
        Recalculate();
    }

    public void ClearDiscount()
    {
        DiscountType = null;
        DiscountValue = null;
        DiscountReason = null;
        DiscountApprovedById = null;
        DiscountApprovedByUsername = null;
        Recalculate();
    }

    /// <summary>In tạm tính (FR-27).</summary>
    public void PrintPrebill(DateTime atUtc) => PrebillPrintedAt = atUtc;

    /// <summary>BR-21: gửi thêm món sau khi in tạm tính thì phiếu đã in hết hiệu lực. Trả true khi có phiếu bị hủy hiệu lực.</summary>
    public bool InvalidatePrebill()
    {
        if (PrebillPrintedAt is null)
            return false;
        PrebillPrintedAt = null;
        return true;
    }

    /// <summary>Chuyển bàn (BR-15): giữ mã, món, trạng thái món.</summary>
    public void MoveToTable(Guid tableId) => TableId = tableId;

    /// <summary>Gộp bàn (BR-16): nhận khách, tiền cọc và lượt "Tiền cọc" của hóa đơn bàn phụ; món chuyển riêng.</summary>
    public void AbsorbMerged(Order source)
    {
        GuestCount += source.GuestCount;
        Deposit += source.Deposit;
        foreach (var payment in source._payments.Where(p => p.IsDeposit).ToList())
        {
            source._payments.Remove(payment);
            payment.MoveTo(Id);
            _payments.Add(payment);
        }

        source.Deposit = 0;
        PrebillPrintedAt = null;
    }

    /// <summary>Hóa đơn bàn phụ → "Đã gộp", tiền 0 (món đã chuyển hết sang hóa đơn chính).</summary>
    public void MarkMerged(Guid mainOrderId, DateTime atUtc)
    {
        Status = OrderStatus.DaGop;
        MergedIntoOrderId = mainOrderId;
        MergedAt = atUtc;
        SplitCount = null;
        DiscountType = null;
        DiscountValue = null;
        DiscountReason = null;
        DiscountApprovedById = null;
        DiscountApprovedByUsername = null;
        Recalculate();
    }

    /// <summary>Số lần gửi bếp của hóa đơn bàn phụ trong dữ liệu mẫu (06 §5.4 quy tắc 7).</summary>
    public void SetSeedBatchCount(int batchCount) => BatchCount = batchCount;

    /// <summary>Chia đều (BR-19); null là hủy chia đều.</summary>
    public void SetSplitCount(int? count) => SplitCount = count;

    /// <summary>Chia đều hiện tại (07 §3.5); rỗng khi không chia.</summary>
    public IReadOnlyList<EqualShare> Shares() =>
        SplitCount is { } n ? OrderPricing.Shares(Total, Deposit, n) : [];

    /// <summary>
    /// Ghi một lượt thu (FR-30). Lượt đầu tiên không phải tiền cọc khóa hóa đơn (BR-22) và chốt tỉ lệ; số còn phải thu về 0
    /// thì hóa đơn "Đã thanh toán" (FR-31).
    /// </summary>
    public void RegisterPayment(Payment payment, DateTime atUtc, (Guid Id, string FullName)? cashier)
    {
        _payments.Add(payment);
        PaidAmount = _payments.Sum(p => p.Amount);
        if (payment.IsDeposit)
            return;

        CashierId = cashier?.Id;
        CashierName = cashier?.FullName;
        if (Status == OrderStatus.DangMo)
            Status = OrderStatus.DangThu;
        if (Remaining == 0)
            Complete(atUtc, cashier);
    }

    /// <summary>
    /// Chốt hóa đơn "Đã thanh toán". Tiền cọc lớn hơn tổng thì lượt cọc giảm về tổng, ghi tiền hoàn cọc (BR-25).
    /// </summary>
    public void Complete(DateTime atUtc, (Guid Id, string FullName)? cashier)
    {
        if (!IsActive)
            throw PosErrors.OrderClosed();

        Recalculate();
        if (Remaining > 0)
            throw new DomainException("Hóa đơn chưa thu đủ tiền");

        if (Deposit > Total)
        {
            var nonDeposit = _payments.Where(p => !p.IsDeposit).Sum(p => p.Amount);
            foreach (var payment in _payments.Where(p => p.IsDeposit))
                payment.ReduceDepositTo(Math.Max(0, Total - nonDeposit));
            PaidAmount = _payments.Sum(p => p.Amount);
        }

        DepositRefund = Math.Max(0, Deposit - Total);
        Status = OrderStatus.DaThanhToan;
        PaidAt = atUtc;
        if (cashier is { } c)
        {
            CashierId = c.Id;
            CashierName = c.FullName;
        }
    }

    /// <summary>BR-03: đóng bàn mở nhầm, hóa đơn "Đã hủy" lý do "Mở nhầm", không xóa.</summary>
    public void CloseMistaken((Guid Id, string Username) by, DateTime atUtc)
    {
        EnsureEditable();
        if (_items.Any(i => !i.IsDraft))
            throw PosErrors.Business(PosErrors.BanDaGuiBep, PosErrors.TableAlreadySentMessage);

        _items.Clear();
        MarkCancelled(PosRules.MistakenOpenReason, by, atUtc);
        Recalculate();
    }

    /// <summary>BR-23: quản lý hủy hóa đơn đã thanh toán; không xóa lượt thu.</summary>
    public void CancelPaid(string reason, (Guid Id, string Username) by, DateTime atUtc)
    {
        if (Status == OrderStatus.DaHuy)
            throw new DomainException("Hóa đơn đã hủy trước đó");
        if (Status != OrderStatus.DaThanhToan)
            throw PosErrors.Business(PosErrors.KhongHuyDuocHoaDon, PosErrors.CancelOnlyTodayMessage);

        MarkCancelled(reason.Trim(), by, atUtc);
    }

    private void MarkCancelled(string reason, (Guid Id, string Username) by, DateTime atUtc)
    {
        Status = OrderStatus.DaHuy;
        CancelReason = reason;
        CancelledById = by.Id;
        CancelledByUsername = by.Username;
        CancelledAt = atUtc;
    }
}

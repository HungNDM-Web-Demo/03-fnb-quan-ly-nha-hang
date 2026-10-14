using System.Text.Encodings.Web;
using System.Text.Json;
using Domain.Base;
using Domain.Common;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Domain.Entities.Pos.Orders;

/// <summary>
/// Món gọi (bảng <c>Pos_OrderItems</c>, FR-11..FR-21): chụp mã, tên, đơn vị, giá, khu chế biến lúc gọi (BR-28).
/// Vòng đời: Chưa gửi → Chờ làm → Đang làm → Xong → Đã phục vụ, hoặc Đã hủy (BR-10, BR-13).
/// Hủy, tách, chuyển một phần số lượng thì tách dòng (<see cref="SplitOff"/>), dòng mới chép mọi cột.
/// </summary>
public class OrderItem : BaseEntity, ICreationTracked, IModificationTracked, IAuditLogExempt
{
    public const int NoteMaxLength = 200;
    public const int QuickNotesMaxLength = 500;
    public const int SendRequestIdMaxLength = 64;
    public const int CancelNoteMaxLength = 200;
    public const int UsernameMaxLength = 50;
    public const int NameMaxLength = 150;

    private static readonly JsonSerializerOptions QuickNotesJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private OrderItem()
    {
    }

    public Guid OrderId { get; private set; }
    public Guid MenuItemId { get; private set; }
    public string ItemCode { get; private set; } = string.Empty;
    public string ItemName { get; private set; } = string.Empty;
    public string Unit { get; private set; } = string.Empty;
    public PricingType PricingType { get; private set; }
    public KitchenStation Station { get; private set; }
    public int? PrepMinutes { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal LineTotal { get; private set; }
    public string? Note { get; private set; }

    /// <summary>Mảng JSON chuỗi, vd <c>["Ít cay"]</c>; DTO trả <c>string[]</c>.</summary>
    public string? QuickNotes { get; private set; }

    public bool IsRush { get; private set; }
    public OrderItemStatus Status { get; private set; }
    public int? BatchNo { get; private set; }
    public Guid? KitchenTicketId { get; private set; }
    public string? SendRequestId { get; private set; }
    public DateTime? SentAt { get; private set; }
    public DateTime? StartedAt { get; private set; }
    public DateTime? DoneAt { get; private set; }
    public DateTime? ServedAt { get; private set; }
    public CancelReason? CancelReason { get; private set; }
    public string? CancelNote { get; private set; }
    public DateTime? CancelledAt { get; private set; }
    public Guid? CancelledById { get; private set; }
    public string? CancelledByName { get; private set; }
    public string? CancelledByUsername { get; private set; }
    public Guid? CancelApprovedById { get; private set; }
    public string? CancelApprovedByUsername { get; private set; }
    public OrderItemStatus? StatusAtCancel { get; private set; }
    public DateTime? CancelAcknowledgedAt { get; private set; }
    public int SortOrder { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public Order? Order { get; private set; }
    public KitchenTicket? KitchenTicket { get; private set; }

    public bool IsDraft => Status == OrderItemStatus.ChuaGui;
    public bool IsCancelled => Status == OrderItemStatus.DaHuy;
    public bool IsPending => Status is OrderItemStatus.ChoLam or OrderItemStatus.DangLam;
    public bool IsReady => Status == OrderItemStatus.Xong;
    public bool IsBillable => OrderPricing.IsBillable(Status);
    public bool GoesThroughKitchen => Station != KitchenStation.KhongQuaBep;

    /// <summary>BR-11: món Chờ làm, Đang làm đã chờ bằng hoặc lâu hơn thời gian chuẩn.</summary>
    public bool IsLateAt(DateTime nowUtc) =>
        IsPending && SentAt is { } sent && PrepMinutes is { } prep && (nowUtc - sent).TotalMinutes >= prep;

    /// <summary>Món nháp "Chưa gửi" từ món trong thực đơn, chụp mã, tên, giá hiện tại (BR-28).</summary>
    public static OrderItem Draft(
        Guid orderId,
        MenuItem menuItem,
        decimal quantity,
        string? note,
        IEnumerable<string>? quickNotes,
        bool isRush,
        int sortOrder)
    {
        var item = new OrderItem
        {
            OrderId = orderId,
            MenuItemId = menuItem.Id,
            ItemCode = menuItem.Code,
            ItemName = menuItem.Name,
            Unit = menuItem.Unit,
            PricingType = menuItem.PricingType,
            Station = menuItem.Station,
            PrepMinutes = menuItem.PrepMinutes,
            UnitPrice = menuItem.Price,
            Status = OrderItemStatus.ChuaGui,
            SortOrder = sortOrder
        };
        item.UpdateDraft(quantity, note, quickNotes, isRush);
        return item;
    }

    public static string? NormalizeNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    /// <summary>Tập ghi chú nhanh đã chuẩn hóa: bỏ trống, bỏ trùng, giữ thứ tự.</summary>
    public static IReadOnlyList<string> NormalizeQuickNotes(IEnumerable<string>? quickNotes) =>
        (quickNotes ?? [])
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

    public IReadOnlyList<string> GetQuickNotes() =>
        string.IsNullOrWhiteSpace(QuickNotes) ? [] : JsonSerializer.Deserialize<List<string>>(QuickNotes) ?? [];

    /// <summary>UC-05 2a: cùng món, cùng ghi chú, cùng tập ghi chú nhanh, cùng "Gấp" thì cộng vào dòng nháp này.</summary>
    public bool CanMergeDraft(Guid menuItemId, string? note, IReadOnlyList<string> quickNotes, bool isRush) =>
        IsDraft
        && PricingType == PricingType.TheoSuat
        && MenuItemId == menuItemId
        && Note == NormalizeNote(note)
        && IsRush == isRush
        && GetQuickNotes().OrderBy(n => n, StringComparer.Ordinal).SequenceEqual(quickNotes.OrderBy(n => n, StringComparer.Ordinal));

    public void UpdateDraft(decimal quantity, string? note, IEnumerable<string>? quickNotes, bool isRush)
    {
        EnsureDraft();
        SetQuantity(quantity);
        Note = NormalizeNote(note);
        var notes = NormalizeQuickNotes(quickNotes);
        QuickNotes = notes.Count == 0 ? null : JsonSerializer.Serialize(notes, QuickNotesJson);
        IsRush = isRush;
    }

    public void AddQuantity(decimal quantity)
    {
        EnsureDraft();
        SetQuantity(Quantity + quantity);
    }

    /// <summary>
    /// BR-09: gửi bếp. Món qua bếp → Chờ làm, gắn phiếu; món không qua bếp → Xong ngay, <c>DoneAt = SentAt</c>.
    /// Thời gian chuẩn chụp lúc gửi.
    /// </summary>
    public void Send(int batchNo, Guid? kitchenTicketId, DateTime sentAt, string? sendRequestId, int? prepMinutes)
    {
        EnsureDraft();
        BatchNo = batchNo;
        SentAt = sentAt;
        SendRequestId = sendRequestId;
        if (GoesThroughKitchen)
        {
            KitchenTicketId = kitchenTicketId;
            PrepMinutes = prepMinutes;
            Status = OrderItemStatus.ChoLam;
        }
        else
        {
            KitchenTicketId = null;
            PrepMinutes = null;
            DoneAt = sentAt;
            Status = OrderItemStatus.Xong;
        }
    }

    /// <summary>Bếp bấm "Bắt đầu": Chờ làm → Đang làm.</summary>
    public void Start(DateTime atUtc)
    {
        if (Status != OrderItemStatus.ChoLam)
            throw new DomainException("Món không ở trạng thái chờ làm");

        StartedAt = atUtc;
        Status = OrderItemStatus.DangLam;
    }

    /// <summary>Bếp báo xong (BR-10); bỏ qua "Bắt đầu" thì <c>StartedAt</c> lấy luôn giờ xong.</summary>
    public void Done(DateTime atUtc)
    {
        if (!IsPending)
            throw new DomainException("Món không ở trạng thái chờ làm hoặc đang làm");

        StartedAt ??= atUtc;
        DoneAt = atUtc;
        Status = OrderItemStatus.Xong;
    }

    /// <summary>Bếp hoàn tác "Xong" → "Đang làm" khi món chưa ra (BR-10, TC-19, TC-20).</summary>
    public void Undo()
    {
        if (Status == OrderItemStatus.DaPhucVu)
            throw PosErrors.Business(PosErrors.MonDaRa, PosErrors.ItemServedMessage);
        if (Status != OrderItemStatus.Xong)
            throw new DomainException("Chỉ hoàn tác món đã xong");

        DoneAt = null;
        Status = OrderItemStatus.DangLam;
    }

    /// <summary>Phục vụ bấm "Đã ra" (UC-07).</summary>
    public void Serve(DateTime atUtc)
    {
        if (Status != OrderItemStatus.Xong)
            throw new DomainException("Món chưa xong, chưa ra được");

        ServedAt = atUtc;
        Status = OrderItemStatus.DaPhucVu;
    }

    /// <summary>Hoàn tác "Đã ra" trong 60 giây (07 §5 quyết định 19).</summary>
    public void Unserve(DateTime nowUtc)
    {
        if (Status != OrderItemStatus.DaPhucVu || ServedAt is not { } servedAt)
            throw new DomainException("Món chưa ra, không hoàn tác được");
        if (nowUtc - servedAt > PosRules.UnserveWindow)
            throw new DomainException("Hết thời gian hoàn tác");

        ServedAt = null;
        Status = OrderItemStatus.Xong;
    }

    /// <summary>
    /// Tách <paramref name="quantity"/> ra dòng mới chép mọi cột (cùng phiếu, lần gọi, giờ gửi…); dòng này giảm số lượng.
    /// Chỉ món theo suất; món theo trọng lượng thao tác nguyên dòng (06 §4).
    /// </summary>
    public OrderItem SplitOff(decimal quantity)
    {
        if (PricingType == PricingType.TheoTrongLuong)
            throw new DomainException("Món theo trọng lượng chỉ thao tác nguyên dòng");
        if (quantity <= 0 || quantity >= Quantity || quantity != Math.Floor(quantity))
            throw new DomainException("Số lượng tách không hợp lệ");

        var copy = (OrderItem)MemberwiseClone();
        copy.Id = Guid.NewGuid();
        copy.CreatedAt = default;
        copy.UpdatedAt = null;
        copy.CreatedBy = null;
        copy.UpdatedBy = null;
        copy.Order = null;
        copy.KitchenTicket = null;
        copy.SetQuantity(quantity);
        SetQuantity(Quantity - quantity);
        return copy;
    }

    /// <summary>BR-13: hủy món đã gửi, lưu lý do, người hủy, người duyệt, trạng thái lúc hủy.</summary>
    public void Cancel(
        CancelReason reason,
        string? note,
        DateTime atUtc,
        (Guid Id, string FullName, string Username) cancelledBy,
        (Guid Id, string Username)? approvedBy)
    {
        if (IsDraft)
            throw new DomainException("Món chưa gửi bếp, xóa trực tiếp");
        if (IsCancelled)
            throw new DomainException("Món đã hủy trước đó");

        StatusAtCancel = Status;
        Status = OrderItemStatus.DaHuy;
        CancelReason = reason;
        CancelNote = reason == Enums.Pos.Orders.CancelReason.Khac ? NormalizeNote(note) : null;
        CancelledAt = atUtc;
        CancelledById = cancelledBy.Id;
        CancelledByName = cancelledBy.FullName;
        CancelledByUsername = cancelledBy.Username;
        CancelApprovedById = approvedBy?.Id;
        CancelApprovedByUsername = approvedBy?.Username;

        // Món không qua bếp không có phiếu để bấm "Đã biết" (06 §4).
        if (!GoesThroughKitchen || KitchenTicketId is null)
            CancelAcknowledgedAt = atUtc;
    }

    /// <summary>Bếp bấm "Đã biết" món hủy (BR-13).</summary>
    public void AcknowledgeCancel(DateTime atUtc)
    {
        if (!IsCancelled)
            throw new DomainException("Món chưa bị hủy");

        CancelAcknowledgedAt ??= atUtc;
    }

    /// <summary>Chuyển dòng sang hóa đơn khác (gộp bàn, chuyển món, tách hóa đơn).</summary>
    public void MoveTo(Guid orderId, int sortOrder)
    {
        OrderId = orderId;
        SortOrder = sortOrder;
    }

    private void SetQuantity(decimal quantity)
    {
        if (!PosRules.IsValidQuantity(PricingType, quantity))
            throw new DomainException(PosRules.QuantityMessage(PricingType));

        Quantity = quantity;
        LineTotal = OrderPricing.LineTotal(PricingType, UnitPrice, quantity);
    }

    private void EnsureDraft()
    {
        if (!IsDraft)
            throw new DomainException("Món đã gửi bếp, không sửa được");
    }
}

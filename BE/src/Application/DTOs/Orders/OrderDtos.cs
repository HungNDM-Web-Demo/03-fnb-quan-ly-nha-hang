using Application.Common.Models;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Application.DTOs.Orders;

// DTO hóa đơn, món gọi, lượt thu và các thao tác trên hóa đơn (07 §2.8–2.14, §3).

public sealed class OrderItemDto
{
    public Guid Id { get; init; }
    public Guid MenuItemId { get; init; }
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public PricingType PricingType { get; init; }
    public KitchenStation Station { get; init; }
    public decimal UnitPrice { get; init; }

    /// <summary>kg với TheoTrongLuong.</summary>
    public decimal Quantity { get; init; }

    public decimal LineTotal { get; init; }
    public string? Note { get; init; }
    public IReadOnlyList<string> QuickNotes { get; init; } = [];
    public bool IsRush { get; init; }
    public OrderItemStatus Status { get; init; }
    public int? BatchNo { get; init; }
    public Guid? KitchenTicketId { get; init; }
    public string? KitchenTicketCode { get; init; }
    public int? PrepMinutes { get; init; }
    public DateTime? SentAt { get; init; }
    public DateTime? StartedAt { get; init; }
    public DateTime? DoneAt { get; init; }
    public DateTime? ServedAt { get; init; }

    /// <summary>ChoLam/DangLam và (asOf − sentAt) ≥ prepMinutes.</summary>
    public bool IsLate { get; init; }

    /// <summary>Chỉ ý nghĩa với ChuaGui: món vừa tạm hết (UC-04 E2).</summary>
    public bool IsSoldOut { get; init; }

    public OrderItemCancelDto? Cancel { get; init; }
}

public sealed class OrderItemCancelDto
{
    public CancelReason Reason { get; init; }

    /// <summary>"Chờ lâu" hoặc "Khác: {ghi chú}".</summary>
    public string ReasonText { get; init; } = string.Empty;

    public string? Note { get; init; }
    public DateTime CancelledAt { get; init; }
    public string CancelledByName { get; init; } = string.Empty;
    public string CancelledByUsername { get; init; } = string.Empty;
    public string? ApprovedByUsername { get; init; }
    public OrderItemStatus StatusAtCancel { get; init; }

    /// <summary>Bếp đã bấm "Đã biết".</summary>
    public bool Acknowledged { get; init; }
}

public sealed class PaymentDto
{
    public Guid Id { get; init; }
    public PaymentMethod Method { get; init; }
    public decimal Amount { get; init; }
    public decimal? CashReceived { get; init; }
    public decimal? ChangeAmount { get; init; }
    public string? CardLast4 { get; init; }
    public int? ShareNo { get; init; }
    public string? QrContent { get; init; }
    public DateTime PaidAt { get; init; }
    public string? CashierName { get; init; }
}

public sealed class OrderDiscountDto
{
    public DiscountType Type { get; init; }
    public decimal Value { get; init; }
    public decimal Amount { get; init; }
    public string Reason { get; init; } = string.Empty;
    public string? ApprovedByUsername { get; init; }
}

public sealed class OrderShareDto
{
    public int No { get; init; }
    public decimal Amount { get; init; }
    public bool Paid { get; init; }
}

public sealed class OrderCountsDto
{
    /// <summary>Dòng ChuaGui.</summary>
    public int Unsent { get; init; }

    /// <summary>Dòng ChoLam + DangLam.</summary>
    public int Pending { get; init; }

    /// <summary>Dòng Xong.</summary>
    public int Ready { get; init; }

    public int Late { get; init; }
}

public sealed class OrderDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public OrderStatus Status { get; init; }
    public int Version { get; init; }
    public Guid TableId { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public IReadOnlyList<string> MergedTableCodes { get; init; } = [];
    public Guid? MergedIntoOrderId { get; init; }
    public string? MergedIntoTableCode { get; init; }
    public Guid? SplitFromOrderId { get; init; }
    public string? SplitFromCode { get; init; }
    public Guid? ReservationId { get; init; }
    public string? ReservationCode { get; init; }
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = string.Empty;
    public int GuestCount { get; init; }
    public string? Note { get; init; }
    public DateTime OpenedAt { get; init; }
    public int BatchCount { get; init; }
    public DateTime? PrebillPrintedAt { get; init; }

    /// <summary>Theo sortOrder, gồm cả món ChuaGui và DaHuy.</summary>
    public IReadOnlyList<OrderItemDto> Items { get; init; } = [];

    public decimal Subtotal { get; init; }
    public OrderDiscountDto? Discount { get; init; }
    public int ServiceChargeRate { get; init; }
    public decimal ServiceCharge { get; init; }
    public int VatRate { get; init; }
    public decimal VatAmount { get; init; }
    public decimal GrossTotal { get; init; }
    public decimal Rounding { get; init; }
    public decimal Total { get; init; }
    public decimal Deposit { get; init; }
    public decimal DepositRefund { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal Remaining { get; init; }
    public int? SplitCount { get; init; }
    public IReadOnlyList<OrderShareDto>? Shares { get; init; }
    public IReadOnlyList<PaymentDto> Payments { get; init; } = [];
    public OrderCountsDto Counts { get; init; } = new();

    /// <summary>Có lượt thu không phải tiền cọc (BR-22).</summary>
    public bool IsLocked { get; init; }

    public DateTime? PaidAt { get; init; }
    public string? CashierName { get; init; }
    public DateTime? CancelledAt { get; init; }
    public string? CancelledByUsername { get; init; }
    public string? CancelReason { get; init; }
    public DateTime AsOf { get; init; }
}

public sealed class OrderListItem
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public OrderStatus Status { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public int GuestCount { get; init; }
    public string WaiterName { get; init; } = string.Empty;
    public string? CashierName { get; init; }
    public DateTime OpenedAt { get; init; }
    public DateTime? PaidAt { get; init; }

    /// <summary>Số dòng không hủy, không ChuaGui.</summary>
    public int ItemCount { get; init; }

    public decimal Subtotal { get; init; }
    public decimal DiscountAmount { get; init; }
    public decimal Total { get; init; }

    /// <summary>Phương thức khác nhau, theo thứ tự thu.</summary>
    public IReadOnlyList<PaymentMethod> PaymentMethods { get; init; } = [];

    public string? SplitFromCode { get; init; }
    public string? CancelReason { get; init; }
}

public sealed class OrderQuery : PaginationQuery
{
    public Guid? TableId { get; set; }

    /// <summary>yyyy-MM-dd giờ Việt Nam, lọc theo openedAt; không gửi from, to → hôm nay.</summary>
    public string? From { get; set; }

    public string? To { get; set; }
    public OrderStatus? Status { get; set; }
    public PaymentMethod? PaymentMethod { get; set; }
}

public sealed class AddItemRequest
{
    public Guid MenuItemId { get; init; }

    /// <summary>TheoSuat 1–99 nguyên; TheoTrongLuong 0,1–20 bước 0,1.</summary>
    public decimal Quantity { get; init; }

    public string? Note { get; init; }
    public IReadOnlyList<string>? QuickNotes { get; init; }
    public bool? IsRush { get; init; }
}

public sealed class UpdateDraftItemRequest
{
    public decimal Quantity { get; init; }
    public string? Note { get; init; }
    public IReadOnlyList<string>? QuickNotes { get; init; }
    public bool IsRush { get; init; }
}

/// <summary>Thao tác chỉ cần phiên bản hóa đơn (07 §3.6): đóng bàn, tạm tính, chốt hóa đơn.</summary>
public sealed class OrderVersionRequest
{
    public int Version { get; init; }
}

public sealed class SendToKitchenRequest
{
    public string ClientRequestId { get; init; } = string.Empty;
    public int Version { get; init; }
}

public sealed class SentTicketDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public KitchenStation Station { get; init; }
}

public sealed class SendResultDto
{
    public OrderDto Order { get; init; } = new();

    /// <summary>"Đã gửi 2 phiếu: Bếp nóng, Bếp nguội".</summary>
    public IReadOnlyList<SentTicketDto> Tickets { get; init; } = [];

    /// <summary>Dòng không qua bếp chuyển thẳng "Xong".</summary>
    public int DirectItemCount { get; init; }

    /// <summary>Dòng tạm hết giữ lại ở "Chưa gửi bếp" (UC-04 E2).</summary>
    public IReadOnlyList<Guid> SkippedSoldOutItemIds { get; init; } = [];

    /// <summary>true → FE báo "Phiếu tạm tính đã in hết hiệu lực" (TC-39).</summary>
    public bool PrebillInvalidated { get; init; }
}

public sealed class CancelItemRequest
{
    public decimal Quantity { get; init; }

    /// <summary>Không nhận HetMon (chỉ bếp dùng khi báo hết món).</summary>
    public CancelReason? Reason { get; init; }

    /// <summary>Bắt buộc khi Khac.</summary>
    public string? Note { get; init; }

    /// <summary>Token <c>POST /api/approvals</c> hành động HuyMon, cần khi món DangLam/Xong/DaPhucVu.</summary>
    public string? ApprovalToken { get; init; }

    public int Version { get; init; }
}

public sealed class TransferRequest
{
    public Guid TargetTableId { get; init; }
    public int Version { get; init; }
}

public sealed class MergeRequest
{
    public IReadOnlyList<Guid> SourceTableIds { get; init; } = [];
    public int Version { get; init; }
}

public sealed class ItemQuantityInput
{
    public Guid ItemId { get; init; }
    public decimal Quantity { get; init; }
}

public sealed class MoveItemsRequest
{
    public Guid TargetTableId { get; init; }
    public IReadOnlyList<ItemQuantityInput> Items { get; init; } = [];
    public int Version { get; init; }
}

public sealed class MoveItemsResultDto
{
    public OrderDto Source { get; init; } = new();
    public OrderDto Target { get; init; } = new();
}

public sealed class DiscountRequest
{
    public DiscountType? Type { get; init; }

    /// <summary>PhanTram 1–100; SoTien &gt; 0, bội số 1.000.</summary>
    public decimal Value { get; init; }

    public string Reason { get; init; } = string.Empty;

    /// <summary>Token hành động GiamGia khi vượt hạn mức (07 §3.3).</summary>
    public string? ApprovalToken { get; init; }

    public int Version { get; init; }
}

public sealed class SplitPartInput
{
    public IReadOnlyList<ItemQuantityInput> Items { get; init; } = [];
}

public sealed class SplitOrderRequest
{
    /// <summary>Mỗi phần thành một hóa đơn mới.</summary>
    public IReadOnlyList<SplitPartInput> Parts { get; init; } = [];

    public int Version { get; init; }
}

public sealed class SplitEqualRequest
{
    public int Count { get; init; }
    public int Version { get; init; }
}

public sealed class CreatePaymentRequest
{
    public string ClientRequestId { get; init; } = string.Empty;
    public int Version { get; init; }
    public PaymentMethod? Method { get; init; }

    /// <summary>Bắt buộc với ChuyenKhoan, The.</summary>
    public decimal? Amount { get; init; }

    /// <summary>Bắt buộc với TienMat: tiền khách đưa.</summary>
    public decimal? CashReceived { get; init; }

    /// <summary>TienMat ít hơn số còn phải thu: thu ngân đã xác nhận "Thu một phần" (UC-11 E4).</summary>
    public bool? AllowPartial { get; init; }

    public string? CardLast4 { get; init; }

    /// <summary>Bắt buộc khi hóa đơn đang chia đều.</summary>
    public int? ShareNo { get; init; }

    public string? QrContent { get; init; }
}

public sealed class PaymentResultDto
{
    public OrderDto Order { get; init; } = new();
    public PaymentDto Payment { get; init; } = new();

    /// <summary>Tiền thối (TienMat), 0 với phương thức khác.</summary>
    public decimal ChangeAmount { get; init; }

    /// <summary>true → FE mở bản in hóa đơn, bàn đã ChoDon.</summary>
    public bool Completed { get; init; }
}

public sealed class CancelOrderRequest
{
    public string Reason { get; init; } = string.Empty;
}

/// <summary>Món chờ ra của một hóa đơn (UC-07).</summary>
public sealed class ReadyGroupDto
{
    public Guid TableId { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public Guid OrderId { get; init; }
    public string OrderCode { get; init; } = string.Empty;
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = string.Empty;

    /// <summary>Theo doneAt.</summary>
    public IReadOnlyList<ReadyItemDto> Items { get; init; } = [];
}

public sealed class ReadyItemDto
{
    public Guid ItemId { get; init; }
    public string ItemName { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public string Unit { get; init; } = string.Empty;
    public string? Note { get; init; }
    public DateTime DoneAt { get; init; }
}

public sealed class ReadyItemsQuery
{
    /// <summary>Chỉ hóa đơn của người gọi (mặc định FE gửi true).</summary>
    public bool Mine { get; set; }
}

/// <summary>Kết quả tạo mới hoặc trả lại bản cũ khi gửi trùng mã yêu cầu (NFR-05).</summary>
public sealed record CreatedResult<T>(T Value, bool Created);

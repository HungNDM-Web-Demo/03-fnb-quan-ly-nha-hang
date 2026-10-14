using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Application.DTOs.Kitchen;

// DTO màn hình bếp (07 §2.10).

public sealed class KitchenBoardQuery
{
    /// <summary>Bỏ trống = Tất cả.</summary>
    public KitchenStation? Station { get; set; }

    /// <summary>DangCho (mặc định) hoặc DaXong (hôm nay, mới nhất trước, tối đa 50).</summary>
    public KitchenTicketStatus? View { get; set; }
}

public sealed class KitchenSummaryQuery
{
    public KitchenStation? Station { get; set; }
}

public sealed class KitchenBoardDto
{
    /// <summary>Giờ máy chủ để FE tính màu (07 §3.8).</summary>
    public DateTime AsOf { get; init; }

    public IReadOnlyList<KitchenTicketDto> Tickets { get; init; } = [];
}

public sealed class KitchenTicketDto
{
    public Guid Id { get; init; }

    /// <summary>"#087".</summary>
    public string Code { get; init; } = string.Empty;

    public KitchenStation Station { get; init; }

    /// <summary>"Lần 2".</summary>
    public int BatchNo { get; init; }

    public Guid OrderId { get; init; }
    public string OrderCode { get; init; } = string.Empty;

    /// <summary>Bàn hiện tại.</summary>
    public string TableCode { get; init; } = string.Empty;

    /// <summary>Khác bàn lúc gửi → "T1-10 (từ SV-01)" (TC-26).</summary>
    public string? FromTableCode { get; init; }

    public string WaiterName { get; init; } = string.Empty;
    public DateTime SentAt { get; init; }
    public KitchenTicketStatus Status { get; init; }

    /// <summary>Có món Gấp → nhãn "GẤP", xếp trước (BR-12).</summary>
    public bool IsRush { get; init; }

    /// <summary>Viền đỏ tới khi "Đã biết".</summary>
    public bool HasUnacknowledgedCancel { get; init; }

    public DateTime? CompletedAt { get; init; }
    public IReadOnlyList<KitchenTicketItemDto> Items { get; init; } = [];
}

public sealed class KitchenTicketItemDto
{
    /// <summary>= OrderItemDto.id.</summary>
    public Guid Id { get; init; }

    public Guid MenuItemId { get; init; }
    public string ItemName { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public string Unit { get; init; } = string.Empty;
    public PricingType PricingType { get; init; }
    public string? Note { get; init; }
    public IReadOnlyList<string> QuickNotes { get; init; } = [];
    public bool IsRush { get; init; }

    /// <summary>ChoLam | DangLam | Xong | DaPhucVu | DaHuy.</summary>
    public OrderItemStatus Status { get; init; }

    public int PrepMinutes { get; init; }
    public DateTime? StartedAt { get; init; }
    public DateTime? DoneAt { get; init; }
    public KitchenItemCancelDto? Cancel { get; init; }

    /// <summary>Đã chuyển món sang bàn khác.</summary>
    public string? MovedToTableCode { get; init; }
}

public sealed class KitchenItemCancelDto
{
    public string ReasonText { get; init; } = string.Empty;
    public bool Acknowledged { get; init; }
}

public sealed class KitchenSummaryItem
{
    public Guid MenuItemId { get; init; }
    public string ItemName { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public KitchenStation Station { get; init; }

    /// <summary>Σ số lượng dòng ChoLam + DangLam (vd Rau muống: 5).</summary>
    public decimal TotalQuantity { get; init; }

    /// <summary>Theo sentAt.</summary>
    public IReadOnlyList<KitchenSummaryLine> Lines { get; init; } = [];
}

public sealed class KitchenSummaryLine
{
    public Guid TicketId { get; init; }
    public string TicketCode { get; init; } = string.Empty;
    public string TableCode { get; init; } = string.Empty;
    public Guid ItemId { get; init; }
    public decimal Quantity { get; init; }
    public OrderItemStatus Status { get; init; }
    public DateTime SentAt { get; init; }
    public bool IsRush { get; init; }
}

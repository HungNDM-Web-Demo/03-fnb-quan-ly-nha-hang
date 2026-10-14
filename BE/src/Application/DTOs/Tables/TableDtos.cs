using Application.Common.Models;
using Domain.Enums.Pos.Tables;

namespace Application.DTOs.Tables;

// DTO khu vực, thiết lập bàn, sơ đồ bàn và phục vụ tại bàn (07 §2.5–2.7).

public sealed class AreaDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public int SortOrder { get; init; }
    public bool IsHidden { get; init; }
    public int TableCount { get; init; }
}

public sealed class SaveAreaRequest
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public bool IsHidden { get; init; }
}

public sealed class AreaQuery
{
    /// <summary>true cần quyền <c>tables.update</c>.</summary>
    public bool IncludeHidden { get; set; }
}

public sealed class DiningTableDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public Guid AreaId { get; init; }
    public string AreaCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public int Capacity { get; init; }
    public TableShape Shape { get; init; }
    public int X { get; init; }
    public int Y { get; init; }
    public bool IsHidden { get; init; }

    /// <summary>Đã có hóa đơn.</summary>
    public bool EverUsed { get; init; }
}

public sealed class SaveTableRequest
{
    public string Code { get; init; } = string.Empty;
    public Guid AreaId { get; init; }
    public int Capacity { get; init; }
    public TableShape Shape { get; init; }
    public int X { get; init; }
    public int Y { get; init; }
}

public sealed class TableQuery
{
    public Guid? AreaId { get; set; }

    /// <summary>true cần quyền <c>tables.update</c>.</summary>
    public bool IncludeHidden { get; set; }
}

/// <summary>"Lưu sơ đồ": vị trí mới của các bàn.</summary>
public sealed class SaveLayoutRequest
{
    public IReadOnlyList<TablePositionInput> Items { get; init; } = [];
}

public sealed class TablePositionInput
{
    public Guid Id { get; init; }
    public int X { get; init; }
    public int Y { get; init; }
}

public sealed class SetTableHiddenRequest
{
    public bool IsHidden { get; init; }
}

public sealed class FloorPlanDto
{
    /// <summary>Giờ máy chủ, FE tính độ lệch đồng hồ.</summary>
    public DateTime AsOf { get; init; }

    public IReadOnlyList<AreaDto> Areas { get; init; } = [];
    public IReadOnlyList<TableCardDto> Tables { get; init; } = [];

    /// <summary>Trên mọi bàn chưa ẩn, đủ 6 trạng thái; tổng = <see cref="TotalTables"/>.</summary>
    public IReadOnlyDictionary<TableStatus, int> Counts { get; init; } = new Dictionary<TableStatus, int>();

    public int TotalTables { get; init; }
}

public sealed class TableCardDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public Guid AreaId { get; init; }
    public string AreaCode { get; init; } = string.Empty;
    public int Capacity { get; init; }
    public TableShape Shape { get; init; }
    public int X { get; init; }
    public int Y { get; init; }

    /// <summary>DaDat suy ra theo 07 §3.9.</summary>
    public TableStatus Status { get; init; }

    /// <summary>Hóa đơn đang mở của bàn (sau khi tách có nhiều), theo mã; bàn DaGop → [].</summary>
    public IReadOnlyList<Guid> OrderIds { get; init; } = [];

    public int? GuestCount { get; init; }
    public DateTime? OpenedAt { get; init; }
    public Guid? WaiterId { get; init; }
    public string? WaiterName { get; init; }
    public decimal? Subtotal { get; init; }
    public int ReadyCount { get; init; }
    public bool HasLateItems { get; init; }
    public int UnsentCount { get; init; }
    public bool IsLocked { get; init; }
    public Guid? MergedIntoTableId { get; init; }
    public string? MergedIntoTableCode { get; init; }
    public IReadOnlyList<string> MergedTableCodes { get; init; } = [];
    public Guid? LastPaidOrderId { get; init; }
    public TableReservationInfo? Reservation { get; init; }
}

/// <summary>Đặt bàn "Chờ đến" gần nhất hôm nay chưa quá giờ đến + 30 phút.</summary>
public sealed class TableReservationInfo
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string CustomerName { get; init; } = string.Empty;
    public DateTime ArrivalAt { get; init; }
    public int GuestCount { get; init; }
    public decimal Deposit { get; init; }
    public string? Note { get; init; }

    /// <summary>Quá giờ đến 15 phút.</summary>
    public bool IsLate { get; init; }
}

public sealed class TableServiceDto
{
    /// <summary>Bàn chính nếu id trên URL là bàn phụ đã gộp.</summary>
    public TableCardDto Table { get; init; } = new();

    /// <summary>Id trên URL (khác <c>table.id</c> khi mở bàn phụ).</summary>
    public Guid ViewedTableId { get; init; }

    public IReadOnlyList<Orders.OrderDto> Orders { get; init; } = [];
}

public sealed class OpenTableRequest
{
    public int GuestCount { get; init; }
    public string ClientRequestId { get; init; } = string.Empty;
}

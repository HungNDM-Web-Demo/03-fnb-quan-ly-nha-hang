using Application.Common.Models;
using Application.Common.Time;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Application.DTOs.Reports;

// DTO tổng quan và báo cáo (07 §2.16). Doanh thu chỉ tính hóa đơn DaThanhToan theo paidAt (BR-26).

/// <summary>Khoảng ngày <c>from</c>, <c>to</c> dạng yyyy-MM-dd giờ Việt Nam; thiếu thì 30 ngày tới hôm nay.</summary>
public class ReportRangeQuery
{
    public const int MaxDays = 366;
    public const int DefaultDays = 30;

    public string? From { get; set; }
    public string? To { get; set; }

    /// <summary>Khoảng ngày đã điền mặc định (validator đã kiểm tra định dạng và giới hạn).</summary>
    public (DateOnly From, DateOnly To) Resolve(TimeProvider timeProvider)
    {
        var today = VietnamDates.Today(timeProvider);
        var hasTo = VietnamDates.TryParse(To, out var to);
        var hasFrom = VietnamDates.TryParse(From, out var from);
        if (!hasTo)
            to = hasFrom ? from.AddDays(DefaultDays - 1) : today;
        if (!hasFrom)
            from = to.AddDays(-(DefaultDays - 1));
        return (from, to);
    }
}

public sealed class TopItemsQuery : ReportRangeQuery
{
    public Guid? CategoryId { get; set; }

    /// <summary><c>quantity</c> (mặc định) hoặc <c>revenue</c>.</summary>
    public string? SortBy { get; set; }

    /// <summary>Mặc định 20.</summary>
    public int? Limit { get; set; }
}

public sealed class VoidedItemsQuery : ReportRangeQuery
{
    public CancelReason? Reason { get; set; }

    /// <summary>Người hủy.</summary>
    public Guid? UserId { get; set; }

    public int Page { get; set; } = PaginationQuery.DefaultPage;
    public int PageSize { get; set; } = PaginationQuery.DefaultPageSize;
}

public sealed class KitchenReportQuery : ReportRangeQuery
{
    public KitchenStation? Station { get; set; }
}

public sealed class TableReportQuery : ReportRangeQuery
{
    public Guid? AreaId { get; set; }
}

public sealed class DashboardReport
{
    /// <summary>Hôm nay yyyy-MM-dd.</summary>
    public string Date { get; init; } = string.Empty;

    public DateTime AsOf { get; init; }

    /// <summary>Bàn DangPhucVu + ChoThanhToan + DaGop.</summary>
    public int ServingTables { get; init; }

    public int TotalTables { get; init; }

    /// <summary>Σ khách hóa đơn DangMo, DangThu.</summary>
    public int GuestsSeated { get; init; }

    /// <summary>Doanh thu thuần hôm nay (BR-26).</summary>
    public decimal Revenue { get; init; }

    public int PaidOrderCount { get; init; }
    public int PaidGuestCount { get; init; }
    public decimal RevenuePerGuest { get; init; }

    /// <summary>Dòng ChoLam + DangLam.</summary>
    public int PendingItems { get; init; }

    public int LateItems { get; init; }

    /// <summary>Thời gian ra món TB của món xong hôm nay (BR-27), 1 chữ số; null khi chưa có.</summary>
    public decimal? AvgPrepMinutes { get; init; }

    public IReadOnlyList<LongestTableDto> LongestTables { get; init; } = [];
}

public sealed class LongestTableDto
{
    public Guid TableId { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public Guid OrderId { get; init; }
    public DateTime OpenedAt { get; init; }
    public int MinutesSeated { get; init; }
    public int GuestCount { get; init; }
    public decimal Subtotal { get; init; }
}

public class RevenueTotals
{
    public decimal Revenue { get; init; }
    public int OrderCount { get; init; }
    public int GuestCount { get; init; }
    public decimal RevenuePerGuest { get; init; }
    public decimal Discount { get; init; }
    public decimal ServiceCharge { get; init; }
    public decimal VatAmount { get; init; }
    public decimal Total { get; init; }
}

public sealed class PreviousRevenueTotals : RevenueTotals
{
    public string From { get; init; } = string.Empty;
    public string To { get; init; } = string.Empty;
}

public sealed class DailyRevenue : RevenueTotals
{
    public string Date { get; init; } = string.Empty;
    public decimal PreviousRevenue { get; init; }
}

public sealed class RevenueReport
{
    public string From { get; init; } = string.Empty;
    public string To { get; init; } = string.Empty;
    public RevenueTotals Totals { get; init; } = new();
    public PreviousRevenueTotals Previous { get; init; } = new();

    /// <summary>null khi kỳ trước = 0.</summary>
    public decimal? RevenueChangePercent { get; init; }

    /// <summary>Đủ mọi ngày trong khoảng.</summary>
    public IReadOnlyList<DailyRevenue> Daily { get; init; } = [];
}

public sealed class TopItemsReport
{
    public decimal TotalRevenue { get; init; }
    public IReadOnlyList<TopItemRow> Items { get; init; } = [];
}

public sealed class TopItemRow
{
    public Guid MenuItemId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public decimal Quantity { get; init; }

    /// <summary>Σ lineTotal dòng không hủy của hóa đơn DaThanhToan (không phân bổ giảm giá).</summary>
    public decimal Revenue { get; init; }

    /// <summary>% doanh thu trên mọi món trong bộ lọc, 1 chữ số.</summary>
    public decimal Share { get; init; }
}

public sealed class VoidedItemsReport
{
    public int TotalCount { get; init; }
    public decimal TotalValue { get; init; }
    public IReadOnlyList<VoidedByReason> ByReason { get; init; } = [];
    public PaginatedResult<VoidedItemRow> Page { get; init; } = new();
}

public sealed class VoidedByReason
{
    public CancelReason Reason { get; init; }
    public string ReasonText { get; init; } = string.Empty;
    public int Count { get; init; }
    public decimal Value { get; init; }
}

public sealed class VoidedItemRow
{
    public Guid ItemId { get; init; }
    public Guid OrderId { get; init; }
    public string OrderCode { get; init; } = string.Empty;
    public string TableCode { get; init; } = string.Empty;
    public DateTime CancelledAt { get; init; }
    public string ItemName { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public string Unit { get; init; } = string.Empty;

    /// <summary>lineTotal của dòng hủy (TC-44: 365.000).</summary>
    public decimal Value { get; init; }

    public CancelReason Reason { get; init; }
    public string ReasonText { get; init; } = string.Empty;
    public string? Note { get; init; }
    public string CancelledByName { get; init; } = string.Empty;
    public string CancelledByUsername { get; init; } = string.Empty;
    public string? ApprovedByUsername { get; init; }
    public OrderItemStatus StatusAtCancel { get; init; }
}

public class KitchenStats
{
    public int ItemCount { get; init; }
    public decimal AvgMinutes { get; init; }
    public int LateCount { get; init; }
    public decimal LateRate { get; init; }
}

public sealed class KitchenStationStats : KitchenStats
{
    public KitchenStation Station { get; init; }
}

public sealed class KitchenItemStats
{
    public Guid MenuItemId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public KitchenStation Station { get; init; }
    public int PrepMinutes { get; init; }
    public int ItemCount { get; init; }
    public decimal AvgMinutes { get; init; }
    public decimal LateRate { get; init; }
}

public sealed class KitchenHourStats
{
    public int Hour { get; init; }
    public int ItemCount { get; init; }
    public int LateCount { get; init; }
    public decimal LateRate { get; init; }
}

public sealed class KitchenReport
{
    public KitchenStats Totals { get; init; } = new();
    public IReadOnlyList<KitchenStationStats> ByStation { get; init; } = [];

    /// <summary>Theo avgMinutes giảm dần.</summary>
    public IReadOnlyList<KitchenItemStats> ByItem { get; init; } = [];

    /// <summary>10–22 theo giờ gửi.</summary>
    public IReadOnlyList<KitchenHourStats> ByHour { get; init; } = [];
}

public sealed class TableReport
{
    public int Days { get; init; }
    public IReadOnlyList<AreaUsageRow> ByArea { get; init; } = [];
    public IReadOnlyList<TableUsageRow> ByTable { get; init; } = [];
}

public sealed class AreaUsageRow
{
    public Guid AreaId { get; init; }
    public string AreaName { get; init; } = string.Empty;
    public int TableCount { get; init; }
    public decimal Revenue { get; init; }
    public int Sessions { get; init; }
    public decimal Turnover { get; init; }
    public decimal AvgSeatMinutes { get; init; }
}

public sealed class TableUsageRow
{
    public Guid TableId { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public int Capacity { get; init; }
    public decimal Revenue { get; init; }
    public int Sessions { get; init; }
    public decimal Turnover { get; init; }
    public decimal AvgSeatMinutes { get; init; }
}

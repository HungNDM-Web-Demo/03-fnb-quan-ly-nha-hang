using Application.Common.Models;
using Application.Common.Time;
using Application.DTOs.Reports;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Reports;
using Application.Mappings.Orders;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Tables;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Reports;

/// <summary>
/// Tổng quan và báo cáo (UC-14, UC-15, 07 §2.16). Doanh thu thuần = tiền món − giảm giá của hóa đơn "Đã thanh toán" theo
/// <c>paidAt</c> (BR-26); thời gian ra món = xong − gửi của món qua bếp không hủy (BR-27). Dữ liệu demo vài nghìn hóa đơn
/// nên lọc theo khoảng ngày ở DB rồi gom nhóm trong bộ nhớ. Số tiền làm tròn tới đồng; phút, phần trăm 1 chữ số.
/// </summary>
public sealed class ReportService(
    IGenericRepository<Order> orders,
    IGenericRepository<OrderItem> orderItems,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<Area> areas,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<Category> categories,
    TimeProvider timeProvider) : IReportService
{
    private const int LongestTablesCount = 5;
    private const int DefaultTopItems = 20;
    private const int KitchenFirstHour = 10;
    private const int KitchenLastHour = 22;

    private sealed record PaidOrder(
        Guid Id, Guid TableId, DateTime OpenedAt, DateTime PaidAt, decimal Subtotal, decimal Discount, decimal ServiceCharge,
        decimal VatAmount, decimal Total, int GuestCount, Guid? SplitFromOrderId)
    {
        public decimal Revenue => Subtotal - Discount;
    }

    public async Task<DashboardReport> GetDashboardAsync(CancellationToken ct = default)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var today = VietnamDates.Today(timeProvider);
        var start = VietnamDates.StartOfDayUtc(today);
        var end = VietnamDates.EndOfDayExclusiveUtc(today);

        var visible = await tables.QueryNoTracking().Include(t => t.Area)
            .Where(t => !t.IsHidden && !t.Area!.IsHidden)
            .Select(t => new { t.Id, t.Code, t.Status, AreaName = t.Area!.Name })
            .ToListAsync(ct);

        var active = await PosReadModel.WithDetails(orders.QueryNoTracking())
            .Where(o => PosReadModel.ActiveStatuses.Contains(o.Status))
            .ToListAsync(ct);
        var paid = await PaidOrdersAsync(start, end, ct);

        var pendingItems = active.SelectMany(o => o.Items).Where(i => i.IsPending).ToList();
        var doneToday = await orderItems.QueryNoTracking()
            .Where(i => i.Station != KitchenStation.KhongQuaBep && i.Status != OrderItemStatus.DaHuy
                && i.DoneAt >= start && i.DoneAt < end && i.SentAt != null)
            .Select(i => new { i.SentAt, i.DoneAt })
            .ToListAsync(ct);

        var revenue = paid.Sum(o => o.Revenue);
        var guests = paid.Sum(o => o.GuestCount);
        var tableInfo = visible.ToDictionary(t => t.Id);

        return new DashboardReport
        {
            Date = VietnamDates.Format(today),
            AsOf = now,
            ServingTables = visible.Count(t => t.Status is TableStatus.DangPhucVu or TableStatus.ChoThanhToan or TableStatus.DaGop),
            TotalTables = visible.Count,
            GuestsSeated = active.Sum(o => o.GuestCount),
            Revenue = revenue,
            PaidOrderCount = paid.Count,
            PaidGuestCount = guests,
            RevenuePerGuest = guests == 0 ? 0 : Math.Round(revenue / guests, 0, MidpointRounding.AwayFromZero),
            PendingItems = pendingItems.Count,
            LateItems = pendingItems.Count(i => i.IsLateAt(now)),
            AvgPrepMinutes = doneToday.Count == 0
                ? null
                : Round1(doneToday.Average(i => (decimal)(i.DoneAt!.Value - i.SentAt!.Value).TotalMinutes)),
            LongestTables = active
                .GroupBy(o => o.TableId)
                .Select(g => new { TableId = g.Key, Orders = g.OrderBy(o => o.OpenedAt).ToList() })
                .OrderBy(g => g.Orders[0].OpenedAt)
                .Take(LongestTablesCount)
                .Select(g => new LongestTableDto
                {
                    TableId = g.TableId,
                    TableCode = tableInfo.GetValueOrDefault(g.TableId)?.Code ?? string.Empty,
                    AreaName = tableInfo.GetValueOrDefault(g.TableId)?.AreaName ?? string.Empty,
                    OrderId = g.Orders[0].Id,
                    OpenedAt = g.Orders[0].OpenedAt,
                    MinutesSeated = (int)Math.Floor((now - g.Orders[0].OpenedAt).TotalMinutes),
                    GuestCount = g.Orders.Sum(o => o.GuestCount),
                    Subtotal = g.Orders.Sum(o => o.Subtotal)
                })
                .ToList()
        };
    }

    public async Task<RevenueReport> GetRevenueAsync(ReportRangeQuery query, CancellationToken ct = default)
    {
        var (from, to) = query.Resolve(timeProvider);
        var days = to.DayNumber - from.DayNumber + 1;
        var previousTo = from.AddDays(-1);
        var previousFrom = previousTo.AddDays(-(days - 1));

        var all = await PaidOrdersAsync(VietnamDates.StartOfDayUtc(previousFrom), VietnamDates.EndOfDayExclusiveUtc(to), ct);
        var byDate = all.GroupBy(o => VietnamDates.DateOf(o.PaidAt)).ToDictionary(g => g.Key, g => g.ToList());
        List<PaidOrder> Range(DateOnly a, DateOnly b) =>
            all.Where(o => VietnamDates.DateOf(o.PaidAt) >= a && VietnamDates.DateOf(o.PaidAt) <= b).ToList();

        var current = Totals(Range(from, to));
        var previous = Totals(Range(previousFrom, previousTo));

        var daily = new List<DailyRevenue>(days);
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var totals = Totals(byDate.GetValueOrDefault(date) ?? []);
            daily.Add(new DailyRevenue
            {
                Date = VietnamDates.Format(date),
                Revenue = totals.Revenue,
                OrderCount = totals.OrderCount,
                GuestCount = totals.GuestCount,
                RevenuePerGuest = totals.RevenuePerGuest,
                Discount = totals.Discount,
                ServiceCharge = totals.ServiceCharge,
                VatAmount = totals.VatAmount,
                Total = totals.Total,
                PreviousRevenue = (byDate.GetValueOrDefault(date.AddDays(-days)) ?? []).Sum(o => o.Revenue)
            });
        }

        return new RevenueReport
        {
            From = VietnamDates.Format(from),
            To = VietnamDates.Format(to),
            Totals = current,
            Previous = new PreviousRevenueTotals
            {
                From = VietnamDates.Format(previousFrom),
                To = VietnamDates.Format(previousTo),
                Revenue = previous.Revenue,
                OrderCount = previous.OrderCount,
                GuestCount = previous.GuestCount,
                RevenuePerGuest = previous.RevenuePerGuest,
                Discount = previous.Discount,
                ServiceCharge = previous.ServiceCharge,
                VatAmount = previous.VatAmount,
                Total = previous.Total
            },
            RevenueChangePercent = previous.Revenue == 0 ? null : Round1((current.Revenue - previous.Revenue) * 100m / previous.Revenue),
            Daily = daily
        };
    }

    public async Task<TopItemsReport> GetTopItemsAsync(TopItemsQuery query, CancellationToken ct = default)
    {
        var (from, to) = query.Resolve(timeProvider);
        var start = VietnamDates.StartOfDayUtc(from);
        var end = VietnamDates.EndOfDayExclusiveUtc(to);

        var paidIds = orders.QueryNoTracking()
            .Where(o => o.Status == OrderStatus.DaThanhToan && o.PaidAt >= start && o.PaidAt < end)
            .Select(o => o.Id);
        var lines = await orderItems.QueryNoTracking()
            .Where(i => paidIds.Contains(i.OrderId) && i.Status != OrderItemStatus.DaHuy && i.Status != OrderItemStatus.ChuaGui)
            .Select(i => new { i.MenuItemId, i.ItemCode, i.ItemName, i.Unit, i.Quantity, i.LineTotal })
            .ToListAsync(ct);

        var menu = await menuItems.QueryNoTracking().IgnoreQueryFilters()
            .Select(m => new { m.Id, m.Code, m.Name, m.Unit, m.CategoryId }).ToDictionaryAsync(m => m.Id, ct);
        var categoryNames = await categories.QueryNoTracking().IgnoreQueryFilters().ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var rows = lines
            .GroupBy(l => l.MenuItemId)
            .Select(g =>
            {
                var item = menu.GetValueOrDefault(g.Key);
                var first = g.First();
                return new
                {
                    MenuItemId = g.Key,
                    Code = item?.Code ?? first.ItemCode,
                    Name = item?.Name ?? first.ItemName,
                    CategoryId = item?.CategoryId ?? Guid.Empty,
                    Unit = item?.Unit ?? first.Unit,
                    Quantity = g.Sum(l => l.Quantity),
                    Revenue = g.Sum(l => l.LineTotal)
                };
            })
            .Where(r => query.CategoryId is null || r.CategoryId == query.CategoryId)
            .ToList();

        var totalRevenue = rows.Sum(r => r.Revenue);
        var byRevenue = string.Equals(query.SortBy?.Trim(), "revenue", StringComparison.OrdinalIgnoreCase);
        var ordered = byRevenue
            ? rows.OrderByDescending(r => r.Revenue).ThenByDescending(r => r.Quantity)
            : rows.OrderByDescending(r => r.Quantity).ThenByDescending(r => r.Revenue);

        return new TopItemsReport
        {
            TotalRevenue = totalRevenue,
            Items = ordered.ThenBy(r => r.Code, StringComparer.Ordinal)
                .Take(query.Limit ?? DefaultTopItems)
                .Select(r => new TopItemRow
                {
                    MenuItemId = r.MenuItemId,
                    Code = r.Code,
                    Name = r.Name,
                    CategoryId = r.CategoryId,
                    CategoryName = categoryNames.GetValueOrDefault(r.CategoryId) ?? string.Empty,
                    Unit = r.Unit,
                    Quantity = r.Quantity,
                    Revenue = r.Revenue,
                    Share = totalRevenue == 0 ? 0 : Round1(r.Revenue * 100m / totalRevenue)
                })
                .ToList()
        };
    }

    public async Task<VoidedItemsReport> GetVoidedItemsAsync(VoidedItemsQuery query, CancellationToken ct = default)
    {
        var (from, to) = query.Resolve(timeProvider);
        var start = VietnamDates.StartOfDayUtc(from);
        var end = VietnamDates.EndOfDayExclusiveUtc(to);

        var source = orderItems.QueryNoTracking()
            .Where(i => i.Status == OrderItemStatus.DaHuy && i.CancelledAt >= start && i.CancelledAt < end);
        if (query.Reason is { } reason)
            source = source.Where(i => i.CancelReason == reason);
        if (query.UserId is { } userId)
            source = source.Where(i => i.CancelledById == userId);

        var list = await source.ToListAsync(ct);
        var orderIds = list.Select(i => i.OrderId).Distinct().ToList();
        var orderInfo = await orders.QueryNoTracking().Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.Code, o.TableId }).ToDictionaryAsync(o => o.Id, ct);
        var tableIds = orderInfo.Values.Select(o => o.TableId).Distinct().ToList();
        var tableCodes = await tables.QueryNoTracking().IgnoreQueryFilters().Where(t => tableIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Code, ct);

        var pagination = new PaginationQuery { Page = query.Page, PageSize = query.PageSize };
        var pageItems = list
            .OrderByDescending(i => i.CancelledAt).ThenBy(i => i.Id)
            .Skip((pagination.GetPage() - 1) * pagination.GetPageSize())
            .Take(pagination.GetPageSize())
            .Select(i =>
            {
                var order = orderInfo.GetValueOrDefault(i.OrderId);
                var cancelReason = i.CancelReason ?? CancelReason.Khac;
                return new VoidedItemRow
                {
                    ItemId = i.Id,
                    OrderId = i.OrderId,
                    OrderCode = order?.Code ?? string.Empty,
                    TableCode = order is null ? string.Empty : tableCodes.GetValueOrDefault(order.TableId) ?? string.Empty,
                    CancelledAt = i.CancelledAt ?? default,
                    ItemName = i.ItemName,
                    Quantity = i.Quantity,
                    Unit = i.Unit,
                    Value = i.LineTotal,
                    Reason = cancelReason,
                    ReasonText = PosLabels.CancelReasonText(cancelReason, i.CancelNote),
                    Note = i.CancelNote,
                    CancelledByName = i.CancelledByName ?? string.Empty,
                    CancelledByUsername = i.CancelledByUsername ?? string.Empty,
                    ApprovedByUsername = i.CancelApprovedByUsername,
                    StatusAtCancel = i.StatusAtCancel ?? OrderItemStatus.ChoLam
                };
            })
            .ToList();

        return new VoidedItemsReport
        {
            TotalCount = list.Count,
            TotalValue = list.Sum(i => i.LineTotal),
            ByReason = list
                .GroupBy(i => i.CancelReason ?? CancelReason.Khac)
                .Select(g => new VoidedByReason
                {
                    Reason = g.Key,
                    ReasonText = PosLabels.CancelReasonText(g.Key),
                    Count = g.Count(),
                    Value = g.Sum(i => i.LineTotal)
                })
                .OrderByDescending(r => r.Count).ThenBy(r => r.Reason)
                .ToList(),
            Page = new PaginatedResult<VoidedItemRow>
            {
                Items = pageItems,
                Page = pagination.GetPage(),
                PageSize = pagination.GetPageSize(),
                TotalCount = list.Count
            }
        };
    }

    public async Task<KitchenReport> GetKitchenAsync(KitchenReportQuery query, CancellationToken ct = default)
    {
        var (from, to) = query.Resolve(timeProvider);
        var start = VietnamDates.StartOfDayUtc(from);
        var end = VietnamDates.EndOfDayExclusiveUtc(to);

        // BR-27: chỉ món qua bếp đã xong, không hủy; trễ khi phút ≥ thời gian chuẩn đã chụp.
        var source = orderItems.QueryNoTracking()
            .Where(i => i.Station != KitchenStation.KhongQuaBep && i.Status != OrderItemStatus.DaHuy
                && i.DoneAt != null && i.SentAt >= start && i.SentAt < end);
        if (query.Station is { } station)
            source = source.Where(i => i.Station == station);

        var rows = (await source.Select(i => new { i.MenuItemId, i.ItemCode, i.ItemName, i.Station, i.PrepMinutes, i.SentAt, i.DoneAt })
                .ToListAsync(ct))
            .Select(i => new
            {
                i.MenuItemId,
                i.ItemCode,
                i.ItemName,
                i.Station,
                Prep = i.PrepMinutes ?? 0,
                Minutes = (decimal)(i.DoneAt!.Value - i.SentAt!.Value).TotalMinutes,
                Hour = VietnamDates.ToVietnam(i.SentAt!.Value).Hour
            })
            .Select(i => new { i.MenuItemId, i.ItemCode, i.ItemName, i.Station, i.Prep, i.Minutes, i.Hour, Late = i.Minutes >= i.Prep })
            .ToList();

        var menu = await menuItems.QueryNoTracking().IgnoreQueryFilters()
            .Select(m => new { m.Id, m.Code, m.Name, m.PrepMinutes }).ToDictionaryAsync(m => m.Id, ct);

        static decimal Rate(int late, int count) => count == 0 ? 0 : Round1(late * 100m / count);

        return new KitchenReport
        {
            Totals = new KitchenStats
            {
                ItemCount = rows.Count,
                AvgMinutes = rows.Count == 0 ? 0 : Round1(rows.Average(r => r.Minutes)),
                LateCount = rows.Count(r => r.Late),
                LateRate = Rate(rows.Count(r => r.Late), rows.Count)
            },
            ByStation = rows.GroupBy(r => r.Station).OrderBy(g => g.Key).Select(g => new KitchenStationStats
            {
                Station = g.Key,
                ItemCount = g.Count(),
                AvgMinutes = Round1(g.Average(r => r.Minutes)),
                LateCount = g.Count(r => r.Late),
                LateRate = Rate(g.Count(r => r.Late), g.Count())
            }).ToList(),
            ByItem = rows.GroupBy(r => r.MenuItemId).Select(g =>
            {
                var item = menu.GetValueOrDefault(g.Key);
                var first = g.First();
                return new KitchenItemStats
                {
                    MenuItemId = g.Key,
                    Code = item?.Code ?? first.ItemCode,
                    Name = item?.Name ?? first.ItemName,
                    Station = first.Station,
                    PrepMinutes = item?.PrepMinutes ?? first.Prep,
                    ItemCount = g.Count(),
                    AvgMinutes = Round1(g.Average(r => r.Minutes)),
                    LateRate = Rate(g.Count(r => r.Late), g.Count())
                };
            }).OrderByDescending(x => x.AvgMinutes).ThenBy(x => x.Code, StringComparer.Ordinal).ToList(),
            ByHour = Enumerable.Range(KitchenFirstHour, KitchenLastHour - KitchenFirstHour + 1).Select(hour =>
            {
                var inHour = rows.Where(r => r.Hour == hour).ToList();
                return new KitchenHourStats
                {
                    Hour = hour,
                    ItemCount = inHour.Count,
                    LateCount = inHour.Count(r => r.Late),
                    LateRate = Rate(inHour.Count(r => r.Late), inHour.Count)
                };
            }).ToList()
        };
    }

    public async Task<TableReport> GetTablesAsync(TableReportQuery query, CancellationToken ct = default)
    {
        var (from, to) = query.Resolve(timeProvider);
        var days = to.DayNumber - from.DayNumber + 1;
        var paid = await PaidOrdersAsync(VietnamDates.StartOfDayUtc(from), VietnamDates.EndOfDayExclusiveUtc(to), ct);

        var paidTableIds = paid.Select(o => o.TableId).Distinct().ToList();
        var tableList = await tables.QueryNoTracking().IgnoreQueryFilters().Include(t => t.Area)
            .Where(t => !t.IsDeleted || paidTableIds.Contains(t.Id))
            .ToListAsync(ct);
        if (query.AreaId is { } areaId)
            tableList = tableList.Where(t => t.AreaId == areaId).ToList();

        // Lượt phục vụ = hóa đơn đã thanh toán không phải hóa đơn tách; thời gian ngồi = thanh toán − mở bàn.
        var byTable = tableList
            .OrderBy(t => t.Area!.SortOrder).ThenBy(t => t.Code, StringComparer.Ordinal)
            .Select(t =>
            {
                var tableOrders = paid.Where(o => o.TableId == t.Id).ToList();
                var sessions = tableOrders.Where(o => o.SplitFromOrderId is null).ToList();
                return new TableUsageRow
                {
                    TableId = t.Id,
                    TableCode = t.Code,
                    AreaName = t.Area!.Name,
                    Capacity = t.Capacity,
                    Revenue = tableOrders.Sum(o => o.Revenue),
                    Sessions = sessions.Count,
                    Turnover = Round1((decimal)sessions.Count / days),
                    AvgSeatMinutes = sessions.Count == 0 ? 0 : Round1(sessions.Average(o => (decimal)(o.PaidAt - o.OpenedAt).TotalMinutes))
                };
            })
            .ToList();

        var areaList = await areas.QueryNoTracking().IgnoreQueryFilters().OrderBy(a => a.SortOrder).ToListAsync(ct);
        var byArea = areaList
            .Where(a => tableList.Any(t => t.AreaId == a.Id))
            .Select(a =>
            {
                var areaTables = tableList.Where(t => t.AreaId == a.Id).Select(t => t.Id).ToHashSet();
                var areaOrders = paid.Where(o => areaTables.Contains(o.TableId)).ToList();
                var sessions = areaOrders.Where(o => o.SplitFromOrderId is null).ToList();
                var usedTables = sessions.Select(o => o.TableId).Distinct().Count();
                return new AreaUsageRow
                {
                    AreaId = a.Id,
                    AreaName = a.Name,
                    TableCount = areaTables.Count,
                    Revenue = areaOrders.Sum(o => o.Revenue),
                    Sessions = sessions.Count,
                    Turnover = usedTables == 0 ? 0 : Round1((decimal)sessions.Count / usedTables / days),
                    AvgSeatMinutes = sessions.Count == 0 ? 0 : Round1(sessions.Average(o => (decimal)(o.PaidAt - o.OpenedAt).TotalMinutes))
                };
            })
            .ToList();

        return new TableReport { Days = days, ByArea = byArea, ByTable = byTable };
    }

    private async Task<List<PaidOrder>> PaidOrdersAsync(DateTime startUtc, DateTime endUtc, CancellationToken ct) =>
        (await orders.QueryNoTracking()
            .Where(o => o.Status == OrderStatus.DaThanhToan && o.PaidAt >= startUtc && o.PaidAt < endUtc)
            .Select(o => new
            {
                o.Id, o.TableId, o.OpenedAt, o.PaidAt, o.Subtotal, o.DiscountAmount, o.ServiceCharge, o.VatAmount, o.Total,
                o.GuestCount, o.SplitFromOrderId
            })
            .ToListAsync(ct))
        .Select(o => new PaidOrder(
            o.Id, o.TableId, o.OpenedAt, o.PaidAt!.Value, o.Subtotal, o.DiscountAmount, o.ServiceCharge, o.VatAmount, o.Total,
            o.GuestCount, o.SplitFromOrderId))
        .ToList();

    private static RevenueTotals Totals(IReadOnlyCollection<PaidOrder> list)
    {
        var revenue = list.Sum(o => o.Revenue);
        var guests = list.Sum(o => o.GuestCount);
        return new RevenueTotals
        {
            Revenue = revenue,
            OrderCount = list.Count,
            GuestCount = guests,
            RevenuePerGuest = guests == 0 ? 0 : Math.Round(revenue / guests, 0, MidpointRounding.AwayFromZero),
            Discount = list.Sum(o => o.Discount),
            ServiceCharge = list.Sum(o => o.ServiceCharge),
            VatAmount = list.Sum(o => o.VatAmount),
            Total = list.Sum(o => o.Total)
        };
    }

    private static decimal Round1(decimal value) => Math.Round(value, 1, MidpointRounding.AwayFromZero);
}

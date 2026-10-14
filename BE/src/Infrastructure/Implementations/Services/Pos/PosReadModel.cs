using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Repositories;
using Application.Mappings.Orders;
using Application.Mappings.Reservations;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;
using Microsoft.EntityFrameworkCore;
using StoreProfileDto = Application.DTOs.StoreProfile.StoreProfile;

namespace Infrastructure.Implementations.Services.Pos;

/// <summary>
/// Đọc dữ liệu dựng DTO dùng chung cho các service của nhà hàng: hóa đơn (<see cref="OrderDto"/> cần mã bàn, bàn phụ,
/// mã phiếu…), thẻ bàn trên sơ đồ (07 §3.9), đổi lười đặt bàn quá giờ sang "Không đến" (07 §5 quyết định 12).
/// Không đăng ký DI: service tự tạo với repository của mình.
/// </summary>
internal sealed class PosReadModel(
    IGenericRepository<Order> orders,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<KitchenTicket> tickets,
    IGenericRepository<Reservation> reservations)
{
    public static readonly OrderStatus[] ActiveStatuses = [OrderStatus.DangMo, OrderStatus.DangThu];

    /// <summary>Hóa đơn kèm món, lượt thu.</summary>
    public static IQueryable<Order> WithDetails(IQueryable<Order> query) =>
        query.Include(o => o.Items).Include(o => o.Payments).AsSplitQuery();

    /// <summary>
    /// Dựng <see cref="OrderDto"/>. Hóa đơn đang mở chưa khóa được tính lại theo cài đặt hiện tại trước khi trả
    /// (07 §3: BE tính ở mỗi lần đọc hóa đơn đang mở).
    /// </summary>
    public async Task<List<OrderDto>> ToDtosAsync(IReadOnlyList<Order> list, StoreProfileDto profile, DateTime nowUtc, CancellationToken ct)
    {
        if (list.Count == 0)
            return [];

        foreach (var order in list.Where(o => o.Status == OrderStatus.DangMo && !o.IsLocked))
            order.Recalculate(profile.ServiceChargeRate, profile.VatRate);

        var ids = list.Select(o => o.Id).ToList();
        var related = await orders.QueryNoTracking()
            .Where(o => ids.Contains(o.Id)
                || (o.MergedIntoOrderId != null && ids.Contains(o.MergedIntoOrderId.Value)))
            .Select(o => new { o.Id, o.Code, o.TableId, o.MergedIntoOrderId })
            .ToListAsync(ct);

        var mergedIntoIds = list.Where(o => o.MergedIntoOrderId != null).Select(o => o.MergedIntoOrderId!.Value).ToList();
        var splitFromIds = list.Where(o => o.SplitFromOrderId != null).Select(o => o.SplitFromOrderId!.Value).ToList();
        var parentIds = mergedIntoIds.Concat(splitFromIds).Distinct().ToList();
        var parents = parentIds.Count == 0
            ? []
            : await orders.QueryNoTracking().Where(o => parentIds.Contains(o.Id))
                .Select(o => new { o.Id, o.Code, o.TableId }).ToListAsync(ct);

        var tableIds = list.Select(o => o.TableId)
            .Concat(related.Select(r => r.TableId))
            .Concat(parents.Select(p => p.TableId))
            .Distinct().ToList();
        var tableInfo = await TableInfoAsync(tableIds, ct);

        var ticketIds = list.SelectMany(o => o.Items).Where(i => i.KitchenTicketId != null)
            .Select(i => i.KitchenTicketId!.Value).Distinct().ToList();
        var ticketCodes = ticketIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await tickets.QueryNoTracking().Where(t => ticketIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Code, ct);

        var draftMenuIds = list.SelectMany(o => o.Items).Where(i => i.IsDraft).Select(i => i.MenuItemId).Distinct().ToList();
        var soldOut = draftMenuIds.Count == 0
            ? new HashSet<Guid>()
            : (await menuItems.QueryNoTracking().IgnoreQueryFilters()
                .Where(m => draftMenuIds.Contains(m.Id) && (m.IsSoldOut || m.IsHidden || m.IsDeleted))
                .Select(m => m.Id).ToListAsync(ct)).ToHashSet();

        var reservationIds = list.Where(o => o.ReservationId != null).Select(o => o.ReservationId!.Value).Distinct().ToList();
        var reservationCodes = reservationIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await reservations.QueryNoTracking().Where(r => reservationIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.Code, ct);

        var parentMap = parents.ToDictionary(p => p.Id);
        return list.Select(order =>
        {
            var info = tableInfo.GetValueOrDefault(order.TableId);
            var mergedCodes = related.Where(r => r.MergedIntoOrderId == order.Id)
                .Select(r => tableInfo.GetValueOrDefault(r.TableId).Code ?? string.Empty)
                .Where(c => c.Length > 0).Distinct().OrderBy(c => c, StringComparer.Ordinal).ToList();
            var extras = new OrderDtoExtras
            {
                TableCode = info.Code ?? string.Empty,
                AreaName = info.AreaName ?? string.Empty,
                MergedTableCodes = mergedCodes,
                MergedIntoTableCode = order.MergedIntoOrderId is { } mid && parentMap.TryGetValue(mid, out var main)
                    ? tableInfo.GetValueOrDefault(main.TableId).Code
                    : null,
                SplitFromCode = order.SplitFromOrderId is { } sid && parentMap.TryGetValue(sid, out var source) ? source.Code : null,
                ReservationCode = order.ReservationId is { } rid ? reservationCodes.GetValueOrDefault(rid) : null,
                TicketCodes = ticketCodes,
                SoldOutMenuItemIds = soldOut
            };
            return order.ToDto(extras, nowUtc);
        }).ToList();
    }

    /// <summary>Mã bàn, tên khu vực (gồm bàn đã xóa mềm để hóa đơn cũ vẫn hiện đúng).</summary>
    public async Task<Dictionary<Guid, (string? Code, string? AreaName)>> TableInfoAsync(IReadOnlyCollection<Guid> tableIds, CancellationToken ct)
    {
        if (tableIds.Count == 0)
            return [];

        var rows = await tables.QueryNoTracking().IgnoreQueryFilters()
            .Where(t => tableIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Code, AreaName = t.Area!.Name })
            .ToListAsync(ct);
        return rows.ToDictionary(r => r.Id, r => ((string?)r.Code, (string?)r.AreaName));
    }

    /// <summary>
    /// BR-24, 07 §5 quyết định 12: đặt bàn "Chờ đến" quá giờ đến 30 phút đổi sang "Không đến" khi đọc. Trả số đặt bàn vừa đổi;
    /// người gọi lưu thay đổi.
    /// </summary>
    public async Task<List<Reservation>> MarkNoShowsAsync(DateTime nowUtc, CancellationToken ct)
    {
        var cutoff = nowUtc - PosRules.ReservationNoShowAfter;
        var overdue = await reservations.Query()
            .Where(r => r.Status == ReservationStatus.ChoDen && r.ArrivalAt < cutoff)
            .ToListAsync(ct);
        return overdue.Where(r => r.MarkNoShowIfOverdue(nowUtc)).ToList();
    }

    /// <summary>
    /// Thẻ bàn (07 §2.7, §3.9): trạng thái sống (DaDat suy ra), hóa đơn đang mở, món chờ ra, món trễ, bàn phụ, đặt bàn gần nhất.
    /// </summary>
    public async Task<List<TableCardDto>> BuildCardsAsync(IReadOnlyList<DiningTable> tableList, StoreProfileDto profile, DateTime nowUtc, CancellationToken ct)
    {
        if (tableList.Count == 0)
            return [];

        var tableIds = tableList.Select(t => t.Id).ToList();
        var active = await WithDetails(orders.QueryNoTracking())
            .Where(o => tableIds.Contains(o.TableId) && ActiveStatuses.Contains(o.Status))
            .ToListAsync(ct);
        foreach (var order in active.Where(o => o.Status == OrderStatus.DangMo && !o.IsLocked))
            order.Recalculate(profile.ServiceChargeRate, profile.VatRate);

        var allTables = await tables.QueryNoTracking().IgnoreQueryFilters()
            .Select(t => new { t.Id, t.Code, t.MergedIntoTableId, t.IsDeleted })
            .ToListAsync(ct);
        var codeById = allTables.ToDictionary(t => t.Id, t => t.Code);

        var todayEnd = Application.Common.Time.VietnamDates.EndOfDayExclusiveUtc(Application.Common.Time.VietnamDates.DateOf(nowUtc));
        var windowStart = nowUtc - PosRules.ReservationNoShowAfter;
        var upcoming = await reservations.QueryNoTracking()
            .Where(r => tableIds.Contains(r.TableId) && r.Status == ReservationStatus.ChoDen
                && r.ArrivalAt >= windowStart && r.ArrivalAt < todayEnd)
            .OrderBy(r => r.ArrivalAt)
            .ToListAsync(ct);

        var choDonTableIds = tableList.Where(t => t.Status == TableStatus.ChoDon)
            .Select(t => t.MergedIntoTableId ?? t.Id).Distinct().ToList();
        var lastPaid = choDonTableIds.Count == 0
            ? []
            : await orders.QueryNoTracking()
                .Where(o => choDonTableIds.Contains(o.TableId) && o.Status == OrderStatus.DaThanhToan)
                .Select(o => new { o.Id, o.TableId, o.PaidAt })
                .ToListAsync(ct);

        return tableList.Select(table =>
        {
            var tableOrders = active.Where(o => o.TableId == table.Id).OrderBy(o => o.Code, StringComparer.Ordinal).ToList();
            var items = tableOrders.SelectMany(o => o.Items).ToList();
            var reservation = upcoming.FirstOrDefault(r => r.TableId == table.Id);
            var status = table.Status;
            if (status == TableStatus.Trong && reservation is not null
                && nowUtc >= reservation.ArrivalAt - PosRules.ReservedWindowBefore
                && nowUtc <= reservation.ArrivalAt + PosRules.ReservationNoShowAfter)
            {
                status = TableStatus.DaDat;
            }

            var first = tableOrders.OrderBy(o => o.OpenedAt).FirstOrDefault();
            var paidKey = table.MergedIntoTableId ?? table.Id;
            return new TableCardDto
            {
                Id = table.Id,
                Code = table.Code,
                AreaId = table.AreaId,
                AreaCode = table.Area?.Code ?? string.Empty,
                Capacity = table.Capacity,
                Shape = table.Shape,
                X = table.PosX,
                Y = table.PosY,
                Status = status,
                OrderIds = tableOrders.Select(o => o.Id).ToList(),
                GuestCount = tableOrders.Count == 0 ? null : tableOrders.Sum(o => o.GuestCount),
                OpenedAt = first?.OpenedAt,
                WaiterId = first?.WaiterId,
                WaiterName = first?.WaiterName,
                Subtotal = tableOrders.Count == 0 ? null : tableOrders.Sum(o => o.Subtotal),
                ReadyCount = items.Count(i => i.IsReady),
                HasLateItems = items.Any(i => i.IsLateAt(nowUtc)),
                UnsentCount = items.Count(i => i.IsDraft),
                IsLocked = tableOrders.Any(o => o.IsLocked),
                MergedIntoTableId = table.MergedIntoTableId,
                MergedIntoTableCode = table.MergedIntoTableId is { } mid ? codeById.GetValueOrDefault(mid) : null,
                MergedTableCodes = allTables.Where(t => t.MergedIntoTableId == table.Id && !t.IsDeleted)
                    .Select(t => t.Code).OrderBy(c => c, StringComparer.Ordinal).ToList(),
                LastPaidOrderId = table.Status == TableStatus.ChoDon
                    ? lastPaid.Where(o => o.TableId == paidKey).OrderByDescending(o => o.PaidAt).Select(o => (Guid?)o.Id).FirstOrDefault()
                    : null,
                Reservation = reservation?.ToTableInfo(nowUtc)
            };
        }).ToList();
    }
}

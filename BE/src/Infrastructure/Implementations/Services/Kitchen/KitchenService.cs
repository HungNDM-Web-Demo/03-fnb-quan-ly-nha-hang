using Application.Common.Exceptions;
using Application.Common.Time;
using Application.DTOs.Kitchen;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Common;
using Application.Interfaces.Services.Kitchen;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.StoreProfile;
using Application.Mappings.Orders;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.Orders;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Kitchen;

/// <summary>
/// Màn hình bếp (UC-06, UC-04 1a, 07 §2.10). Thao tác bếp không đổi phiên bản hóa đơn (07 §3.6), trừ báo hết món
/// (đổi tiền món). Phiếu sắp theo BR-12: có món Gấp trước, rồi giờ gửi, rồi số phiếu (TC-18).
/// </summary>
public sealed class KitchenService(
    IGenericRepository<KitchenTicket> tickets,
    IGenericRepository<OrderItem> orderItems,
    IGenericRepository<Order> orders,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<User> users,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IStoreProfileService storeProfile,
    IPosEventPublisher events,
    TimeProvider timeProvider) : IKitchenService
{
    public const string TicketNotFoundMessage = "Không tìm thấy phiếu bếp.";
    public const string ItemNotInTicketMessage = "Món không thuộc phiếu bếp.";
    public const int DoneListLimit = 50;

    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<KitchenBoardDto> GetBoardAsync(KitchenBoardQuery query, CancellationToken ct = default)
    {
        var now = Now;
        var source = tickets.QueryNoTracking();
        if (query.Station is { } station)
            source = source.Where(t => t.Station == station);

        List<KitchenTicket> list;
        if (query.View == KitchenTicketStatus.DaXong)
        {
            var today = VietnamDates.Today(timeProvider);
            var start = VietnamDates.StartOfDayUtc(today);
            list = await source.Where(t => t.Status == KitchenTicketStatus.DaXong && t.CompletedAt >= start)
                .OrderByDescending(t => t.CompletedAt).ThenByDescending(t => t.Code)
                .Take(DoneListLimit)
                .ToListAsync(ct);
        }
        else
        {
            list = await source.Where(t => t.Status == KitchenTicketStatus.DangCho).ToListAsync(ct);
        }

        var dtos = await ToDtosAsync(list, ct);
        if (query.View != KitchenTicketStatus.DaXong)
        {
            dtos = dtos.OrderByDescending(t => t.IsRush).ThenBy(t => t.SentAt).ThenBy(t => t.Code, StringComparer.Ordinal).ToList();
        }

        return new KitchenBoardDto { AsOf = now, Tickets = dtos };
    }

    public async Task<IReadOnlyList<KitchenSummaryItem>> GetSummaryAsync(KitchenSummaryQuery query, CancellationToken ct = default)
    {
        var source = orderItems.QueryNoTracking()
            .Where(i => i.KitchenTicketId != null && (i.Status == OrderItemStatus.ChoLam || i.Status == OrderItemStatus.DangLam));
        if (query.Station is { } station)
            source = source.Where(i => i.Station == station);

        var items = await source.ToListAsync(ct);
        var ticketIds = items.Select(i => i.KitchenTicketId!.Value).Distinct().ToList();
        var ticketMap = await tickets.QueryNoTracking().Where(t => ticketIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);

        // FR-18: gom theo món, món chờ lâu nhất xếp trước; trong món, dòng theo giờ gửi.
        return items
            .GroupBy(i => i.MenuItemId)
            .Select(g =>
            {
                var lines = g.OrderBy(i => i.SentAt).ThenBy(i => i.SortOrder).ToList();
                var first = lines[0];
                return new KitchenSummaryItem
                {
                    MenuItemId = g.Key,
                    ItemName = first.ItemName,
                    Unit = first.Unit,
                    Station = first.Station,
                    TotalQuantity = lines.Sum(i => i.Quantity),
                    Lines = lines.Select(i =>
                    {
                        var ticket = ticketMap[i.KitchenTicketId!.Value];
                        return new KitchenSummaryLine
                        {
                            TicketId = ticket.Id,
                            TicketCode = ticket.Code,
                            TableCode = ticket.TableCode,
                            ItemId = i.Id,
                            Quantity = i.Quantity,
                            Status = i.Status,
                            SentAt = i.SentAt ?? ticket.SentAt,
                            IsRush = i.IsRush
                        };
                    }).ToList()
                };
            })
            .OrderBy(s => s.Lines.Min(l => l.SentAt))
            .ThenBy(s => s.ItemName, StringComparer.Ordinal)
            .ToList();
    }

    public Task<KitchenTicketDto> StartAsync(Guid ticketId, Guid itemId, CancellationToken ct = default) =>
        ChangeItemAsync(ticketId, itemId, (item, now) => item.Start(now), ct);

    public Task<KitchenTicketDto> DoneAsync(Guid ticketId, Guid itemId, CancellationToken ct = default) =>
        ChangeItemAsync(ticketId, itemId, (item, now) => item.Done(now), ct);

    public Task<KitchenTicketDto> UndoAsync(Guid ticketId, Guid itemId, CancellationToken ct = default) =>
        ChangeItemAsync(ticketId, itemId, (item, _) => item.Undo(), ct);

    public Task<KitchenTicketDto> AcknowledgeAsync(Guid ticketId, Guid itemId, CancellationToken ct = default) =>
        ChangeItemAsync(ticketId, itemId, (item, now) => item.AcknowledgeCancel(now), ct);

    public async Task<KitchenTicketDto> DoneAllAsync(Guid ticketId, CancellationToken ct = default)
    {
        var (ticket, items) = await LoadAsync(ticketId, ct);
        var now = Now;
        var changed = items.Where(i => i.IsPending).ToList();
        foreach (var item in changed)
            item.Done(now);

        ticket.Refresh(items, now);
        await unitOfWork.SaveChangesAsync(ct);
        await PublishAsync(ticket, changed, readyChanged: changed.Count > 0, ct);
        return (await ToDtosAsync([ticket], ct)).Single();
    }

    public async Task<KitchenTicketDto> OutOfStockAsync(Guid ticketId, Guid itemId, CancellationToken ct = default)
    {
        var (ticket, items) = await LoadAsync(ticketId, ct);
        var item = items.FirstOrDefault(i => i.Id == itemId) ?? throw new NotFoundException(ItemNotInTicketMessage);
        if (item.Status != OrderItemStatus.ChoLam)
            throw new DomainException("Chỉ báo hết món đang chờ làm");

        var order = await PosReadModel.WithDetails(orders.Query()).FirstAsync(o => o.Id == item.OrderId, ct);
        order.EnsureEditable();

        // BR-14: món → Đã hủy lý do "Hết món", người hủy là bếp, không cần duyệt; món trong thực đơn → Tạm hết.
        // Bếp tự báo nên coi như đã biết, phiếu không giữ viền đỏ.
        var now = Now;
        var kitchen = await PosCodes.CurrentUserAsync(users, currentUser, ct);
        var tracked = order.Items.First(i => i.Id == item.Id);
        tracked.Cancel(CancelReason.HetMon, null, now, (kitchen.Id, kitchen.FullName, kitchen.Username), null);
        tracked.AcknowledgeCancel(now);

        var menuItem = await menuItems.Query().IgnoreQueryFilters().FirstOrDefaultAsync(m => m.Id == item.MenuItemId, ct);
        menuItem?.SetSoldOut(true);

        var profile = await storeProfile.GetAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        order.Touch();
        ticket.Refresh(items, now);

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            var current = await orders.QueryNoTracking().Where(o => o.Id == order.Id).Select(o => o.Version).FirstOrDefaultAsync(ct);
            throw PosConflicts.Stale(current);
        }

        var tableCode = await tables.QueryNoTracking().IgnoreQueryFilters().Where(t => t.Id == order.TableId).Select(t => t.Code).FirstOrDefaultAsync(ct)
            ?? ticket.TableCode;
        await events.ItemOutOfStockAsync(tableCode, tracked.ItemName, order.WaiterId, ct);
        await events.MenuChangedAsync([item.MenuItemId], ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        await events.KitchenChangedAsync([ticket.Id], [ticket.Station], null, ct);
        return (await ToDtosAsync([ticket], ct)).Single();
    }

    private async Task<KitchenTicketDto> ChangeItemAsync(Guid ticketId, Guid itemId, Action<OrderItem, DateTime> change, CancellationToken ct)
    {
        var (ticket, items) = await LoadAsync(ticketId, ct);
        var item = items.FirstOrDefault(i => i.Id == itemId) ?? throw new NotFoundException(ItemNotInTicketMessage);
        var now = Now;
        var wasReady = item.IsReady;
        change(item, now);
        ticket.Refresh(items, now);

        await unitOfWork.SaveChangesAsync(ct);
        await PublishAsync(ticket, [item], readyChanged: wasReady != item.IsReady, ct);
        return (await ToDtosAsync([ticket], ct)).Single();
    }

    private async Task<(KitchenTicket Ticket, List<OrderItem> Items)> LoadAsync(Guid ticketId, CancellationToken ct)
    {
        var ticket = await tickets.Query().FirstOrDefaultAsync(t => t.Id == ticketId, ct) ?? throw new NotFoundException(TicketNotFoundMessage);
        var items = await orderItems.Query().Where(i => i.KitchenTicketId == ticketId).ToListAsync(ct);
        return (ticket, items);
    }

    /// <summary>kitchen-changed cho màn bếp; order-changed, tables-changed và items-ready (FR-19) cho phục vụ.</summary>
    private async Task PublishAsync(KitchenTicket ticket, IReadOnlyList<OrderItem> changed, bool readyChanged, CancellationToken ct)
    {
        await events.KitchenChangedAsync([ticket.Id], [ticket.Station], null, ct);
        var orderIds = changed.Select(i => i.OrderId).Distinct().ToList();
        if (orderIds.Count == 0)
            return;

        var affected = await PosReadModel.WithDetails(orders.QueryNoTracking()).Where(o => orderIds.Contains(o.Id)).ToListAsync(ct);
        foreach (var order in affected)
        {
            await events.OrderChangedAsync(order, ct);
            await events.TablesChangedAsync([order.TableId], ct);
            if (readyChanged && order.Items.Any(i => i.IsReady))
            {
                var tableCode = await tables.QueryNoTracking().IgnoreQueryFilters().Where(t => t.Id == order.TableId)
                    .Select(t => t.Code).FirstOrDefaultAsync(ct) ?? string.Empty;
                await events.ItemsReadyAsync(order, tableCode, ct);
            }
        }
    }

    private async Task<List<KitchenTicketDto>> ToDtosAsync(IReadOnlyList<KitchenTicket> list, CancellationToken ct)
    {
        if (list.Count == 0)
            return [];

        var ticketIds = list.Select(t => t.Id).ToList();
        var items = await orderItems.QueryNoTracking().Where(i => i.KitchenTicketId != null && ticketIds.Contains(i.KitchenTicketId.Value)).ToListAsync(ct);
        var orderIds = list.Select(t => t.OrderId).Concat(items.Select(i => i.OrderId)).Distinct().ToList();
        var orderInfo = await orders.QueryNoTracking().Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.Code, o.TableId }).ToDictionaryAsync(o => o.Id, ct);
        var tableIds = orderInfo.Values.Select(o => o.TableId).Distinct().ToList();
        var tableCodes = await tables.QueryNoTracking().IgnoreQueryFilters().Where(t => tableIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Code, ct);

        return list.Select(ticket =>
        {
            var ticketItems = items.Where(i => i.KitchenTicketId == ticket.Id)
                .OrderBy(i => i.SortOrder).ThenBy(i => i.CreatedAt).ToList();
            return new KitchenTicketDto
            {
                Id = ticket.Id,
                Code = ticket.Code,
                Station = ticket.Station,
                BatchNo = ticket.BatchNo,
                OrderId = ticket.OrderId,
                OrderCode = orderInfo.TryGetValue(ticket.OrderId, out var info) ? info.Code : string.Empty,
                TableCode = ticket.TableCode,
                FromTableCode = ticket.OriginalTableCode != ticket.TableCode ? ticket.OriginalTableCode : null,
                WaiterName = ticket.WaiterName,
                SentAt = ticket.SentAt,
                Status = ticket.Status,
                IsRush = ticketItems.Any(i => i.IsRush && !i.IsCancelled),
                HasUnacknowledgedCancel = ticketItems.Any(i => i.IsCancelled && i.CancelAcknowledgedAt is null),
                CompletedAt = ticket.CompletedAt,
                Items = ticketItems.Select(i =>
                {
                    // 07 §5 quyết định 7: món đã chuyển sang bàn khác hiện "→ {bàn mới}".
                    var currentTable = orderInfo.TryGetValue(i.OrderId, out var o) ? tableCodes.GetValueOrDefault(o.TableId) : null;
                    return new KitchenTicketItemDto
                    {
                        Id = i.Id,
                        MenuItemId = i.MenuItemId,
                        ItemName = i.ItemName,
                        Quantity = i.Quantity,
                        Unit = i.Unit,
                        PricingType = i.PricingType,
                        Note = i.Note,
                        QuickNotes = i.GetQuickNotes(),
                        IsRush = i.IsRush,
                        Status = i.Status,
                        PrepMinutes = i.PrepMinutes ?? 0,
                        StartedAt = i.StartedAt,
                        DoneAt = i.DoneAt,
                        Cancel = i.IsCancelled && i.CancelReason is { } reason
                            ? new KitchenItemCancelDto
                            {
                                ReasonText = PosLabels.CancelReasonText(reason, i.CancelNote),
                                Acknowledged = i.CancelAcknowledgedAt is not null
                            }
                            : null,
                        MovedToTableCode = currentTable is not null && currentTable != ticket.TableCode ? currentTable : null
                    };
                }).ToList()
            };
        }).ToList();
    }
}

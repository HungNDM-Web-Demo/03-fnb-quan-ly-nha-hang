using Application.Common.Exceptions;
using Application.Common.Models;
using Application.Common.Time;
using Application.Constants;
using Application.DTOs.Orders;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Approvals;
using Application.Interfaces.Services.Common;
using Application.Interfaces.Services.Orders;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.Roles;
using Application.Interfaces.Services.StoreProfile;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;
using StoreProfileDto = Application.DTOs.StoreProfile.StoreProfile;

namespace Infrastructure.Implementations.Services.Orders;

/// <summary>
/// Hóa đơn và món gọi (07 §2.8–2.14). Tách thành nhiều file: tra cứu và tiện ích (file này), gọi món và bếp
/// (<c>OrderService.Items.cs</c>), chuyển/gộp bàn (<c>OrderService.Tables.cs</c>), thanh toán (<c>OrderService.Billing.cs</c>).
/// Mỗi thay đổi tăng <see cref="Order.Version"/> (trừ thao tác bếp, ra món) và được EF kiểm như concurrency token;
/// tranh chấp đổi thành 409 "Bàn vừa được cập nhật, đang tải lại" (NFR-04).
/// </summary>
public sealed partial class OrderService(
    IGenericRepository<Order> orders,
    IGenericRepository<OrderItem> orderItems,
    IGenericRepository<Payment> payments,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<KitchenTicket> tickets,
    IGenericRepository<Reservation> reservations,
    IGenericRepository<User> users,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IPermissionService permissionService,
    IStoreProfileService storeProfile,
    IApprovalService approvals,
    IPosEventPublisher events,
    TimeProvider timeProvider) : IOrderService
{
    public const string NotFoundMessage = "Không tìm thấy hóa đơn.";
    public const string ItemNotFoundMessage = "Không tìm thấy món trong hóa đơn.";

    private readonly PosReadModel _read = new(orders, tables, menuItems, tickets, reservations);
    private StoreProfileDto? _profile;

    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<PaginatedResult<OrderListItem>> GetPagedAsync(OrderQuery query, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var source = orders.QueryNoTracking().Include(o => o.Items).Include(o => o.Payments).AsSplitQuery().AsQueryable();

        if (!await permissionService.HasPermissionAsync(userId, ProjectPermissions.Orders.Checkout, ct))
            source = source.Where(o => PosReadModel.ActiveStatuses.Contains(o.Status));

        var term = query.GetSearchTerm();
        if (term is not null)
        {
            var pattern = LikePattern.Contains(term);
            source = source.Where(o => AppDbFunctions.Matches(o.Code, pattern));
        }

        // 07 §5 quyết định 10: lọc theo openedAt, mặc định hôm nay.
        var today = VietnamDates.Today(timeProvider);
        var hasFrom = VietnamDates.TryParse(query.From, out var from);
        var hasTo = VietnamDates.TryParse(query.To, out var to);
        if (!hasFrom && !hasTo)
            (from, to) = (today, today);
        else if (!hasFrom)
            from = to;
        else if (!hasTo)
            to = from > today ? from : today;

        var fromUtc = VietnamDates.StartOfDayUtc(from);
        var toUtc = VietnamDates.EndOfDayExclusiveUtc(to);
        source = source.Where(o => o.OpenedAt >= fromUtc && o.OpenedAt < toUtc);

        if (query.TableId is { } tableId)
            source = source.Where(o => o.TableId == tableId);
        if (query.Status is { } status)
            source = source.Where(o => o.Status == status);
        if (query.PaymentMethod is { } method)
            source = source.Where(o => o.Payments.Any(p => p.Method == method));

        if (string.IsNullOrWhiteSpace(query.SortBy))
        {
            query.SortBy = nameof(Order.OpenedAt);
            query.SortDir ??= "desc";
        }

        var page = await source.ApplySorting(query).ToPaginatedResultAsync(query, ct);
        var tableInfo = await _read.TableInfoAsync(page.Items.Select(o => o.TableId).Distinct().ToList(), ct);
        var splitIds = page.Items.Where(o => o.SplitFromOrderId != null).Select(o => o.SplitFromOrderId!.Value).Distinct().ToList();
        var splitCodes = splitIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await orders.QueryNoTracking().Where(o => splitIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.Code, ct);

        return page.Map(items => items.Select(o => new OrderListItem
        {
            Id = o.Id,
            Code = o.Code,
            Status = o.Status,
            TableCode = tableInfo.GetValueOrDefault(o.TableId).Code ?? string.Empty,
            AreaName = tableInfo.GetValueOrDefault(o.TableId).AreaName ?? string.Empty,
            GuestCount = o.GuestCount,
            WaiterName = o.WaiterName,
            CashierName = o.CashierName,
            OpenedAt = o.OpenedAt,
            PaidAt = o.PaidAt,
            ItemCount = o.Items.Count(i => !i.IsDraft && !i.IsCancelled),
            Subtotal = o.Subtotal,
            DiscountAmount = o.DiscountAmount,
            Total = o.Total,
            PaymentMethods = o.Payments.OrderBy(p => p.PaidAt).Select(p => p.Method).Distinct().ToList(),
            SplitFromCode = o.SplitFromOrderId is { } sid ? splitCodes.GetValueOrDefault(sid) : null,
            CancelReason = o.CancelReason
        }).ToList());
    }

    public async Task<OrderDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var order = await PosReadModel.WithDetails(orders.QueryNoTracking()).FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new NotFoundException(NotFoundMessage);

        if (!order.IsActive && !await permissionService.HasPermissionAsync(userId, ProjectPermissions.Orders.Checkout, ct))
            throw new ForbiddenException("Bạn chỉ xem được hóa đơn đang mở (cần quyền orders.checkout).");

        return await ToDtoAsync(order, ct);
    }

    public async Task<IReadOnlyList<ReadyGroupDto>> GetReadyItemsAsync(ReadyItemsQuery query, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var source = PosReadModel.WithDetails(orders.QueryNoTracking())
            .Where(o => PosReadModel.ActiveStatuses.Contains(o.Status) && o.Items.Any(i => i.Status == OrderItemStatus.Xong));
        if (query.Mine)
            source = source.Where(o => o.WaiterId == userId);

        var list = await source.ToListAsync(ct);
        var tableInfo = await _read.TableInfoAsync(list.Select(o => o.TableId).Distinct().ToList(), ct);
        return list
            .Select(o => new
            {
                Order = o,
                Items = o.Items.Where(i => i.IsReady).OrderBy(i => i.DoneAt).ThenBy(i => i.SortOrder).ToList()
            })
            .OrderBy(x => x.Items.Min(i => i.DoneAt))
            .Select(x => new ReadyGroupDto
            {
                TableId = x.Order.TableId,
                TableCode = tableInfo.GetValueOrDefault(x.Order.TableId).Code ?? string.Empty,
                OrderId = x.Order.Id,
                OrderCode = x.Order.Code,
                WaiterId = x.Order.WaiterId,
                WaiterName = x.Order.WaiterName,
                Items = x.Items.Select(i => new ReadyItemDto
                {
                    ItemId = i.Id,
                    ItemName = i.ItemName,
                    Quantity = i.Quantity,
                    Unit = i.Unit,
                    Note = i.Note,
                    DoneAt = i.DoneAt ?? i.SentAt ?? default
                }).ToList()
            })
            .ToList();
    }

    // ---------- Tiện ích dùng chung ----------

    private Guid RequireUserId() =>
        currentUser.UserId ?? throw new UnauthorizedAccessException("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");

    private async Task<StoreProfileDto> ProfileAsync(CancellationToken ct) => _profile ??= await storeProfile.GetAsync(ct);

    private Task<(Guid Id, string FullName, string Username)> CurrentUserAsync(CancellationToken ct) =>
        PosCodes.CurrentUserAsync(users, currentUser, ct);

    private Task<bool> HasPermissionAsync(string permission, CancellationToken ct) =>
        permissionService.HasPermissionAsync(RequireUserId(), permission, ct);

    /// <summary>Hóa đơn kèm món, lượt thu, có theo dõi để sửa.</summary>
    private async Task<Order> LoadAsync(Guid id, CancellationToken ct) =>
        await PosReadModel.WithDetails(orders.Query()).FirstOrDefaultAsync(o => o.Id == id, ct)
        ?? throw new NotFoundException(NotFoundMessage);

    private static OrderItem FindItem(Order order, Guid itemId) =>
        order.Items.FirstOrDefault(i => i.Id == itemId) ?? throw new NotFoundException(ItemNotFoundMessage);

    /// <summary>07 §3.6: <c>version</c> lệch với bản hiện tại → 409 DuLieuCu kèm <c>currentVersion</c>.</summary>
    private static void CheckVersion(Order order, int version)
    {
        if (order.Version != version)
            throw PosConflicts.Stale(order.Version);
    }

    /// <summary>Tính lại tiền với tỉ lệ hiện tại (hóa đơn đang mở, chưa khóa) và tăng phiên bản.</summary>
    private async Task TouchAsync(Order order, CancellationToken ct)
    {
        var profile = await ProfileAsync(ct);
        order.Recalculate(profile.ServiceChargeRate, profile.VatRate);
        order.Touch();
    }

    /// <summary>Lưu; hai request cùng sửa một hóa đơn thì request sau nhận 409 DuLieuCu (NFR-04).</summary>
    private async Task SaveAsync(Order order, CancellationToken ct)
    {
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            var current = await orders.QueryNoTracking().Where(o => o.Id == order.Id).Select(o => o.Version).FirstOrDefaultAsync(ct);
            throw PosConflicts.Stale(current);
        }
    }

    private async Task<OrderDto> ToDtoAsync(Order order, CancellationToken ct) =>
        (await _read.ToDtosAsync([order], await ProfileAsync(ct), Now, ct)).Single();

    /// <summary>Đọc lại sau khi lưu (không theo dõi) rồi dựng DTO.</summary>
    private async Task<OrderDto> ReloadDtoAsync(Guid orderId, CancellationToken ct)
    {
        var order = await PosReadModel.WithDetails(orders.QueryNoTracking()).FirstAsync(o => o.Id == orderId, ct);
        return await ToDtoAsync(order, ct);
    }

    private async Task<string> TableCodeAsync(Guid tableId, CancellationToken ct) =>
        await tables.QueryNoTracking().IgnoreQueryFilters().Where(t => t.Id == tableId).Select(t => t.Code).FirstOrDefaultAsync(ct) ?? string.Empty;

    /// <summary>Bàn không còn hóa đơn đang mở nào (sau khi đóng, chuyển đi) → Trống.</summary>
    private async Task ReleaseTableIfEmptyAsync(DiningTable table, Guid exceptOrderId, DateTime now, CancellationToken ct)
    {
        var others = await orders.QueryNoTracking()
            .AnyAsync(o => o.TableId == table.Id && o.Id != exceptOrderId && PosReadModel.ActiveStatuses.Contains(o.Status), ct);
        if (!others)
            table.SetStatus(TableStatus.Trong, now);
    }

    /// <summary>
    /// FR-31, BR-16: hóa đơn cuối cùng đang mở của bàn thu đủ → bàn Chờ dọn, kèm mọi bàn phụ đã gộp vào bàn đó.
    /// </summary>
    private async Task<List<Guid>> MarkTablePaidIfDoneAsync(Order order, DateTime now, CancellationToken ct)
    {
        var changed = new List<Guid>();
        if (order.Status != OrderStatus.DaThanhToan)
            return changed;

        var others = await orders.QueryNoTracking()
            .AnyAsync(o => o.TableId == order.TableId && o.Id != order.Id && PosReadModel.ActiveStatuses.Contains(o.Status), ct);
        if (others)
            return changed;

        var table = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == order.TableId, ct);
        table.SetStatus(TableStatus.ChoDon, now);
        changed.Add(table.Id);

        var merged = await tables.Query().Where(t => t.MergedIntoTableId == table.Id && t.Status == TableStatus.DaGop).ToListAsync(ct);
        foreach (var secondary in merged)
        {
            secondary.SetStatus(TableStatus.ChoDon, now);
            changed.Add(secondary.Id);
        }

        return changed;
    }

    /// <summary>
    /// Tính lại trạng thái các phiếu bếp (BR-10) từ mọi món của phiếu trong DB cộng các dòng mới chưa lưu
    /// (<paramref name="extra"/>, vd dòng tách khi hủy một phần).
    /// </summary>
    private async Task<List<KitchenTicket>> RefreshTicketsAsync(IEnumerable<Guid?> ticketIds, IEnumerable<OrderItem> extra, DateTime now, CancellationToken ct)
    {
        var ids = ticketIds.Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
        if (ids.Count == 0)
            return [];

        var list = await tickets.Query().Where(t => ids.Contains(t.Id)).ToListAsync(ct);
        var items = await orderItems.Query().Where(i => i.KitchenTicketId != null && ids.Contains(i.KitchenTicketId.Value)).ToListAsync(ct);
        var known = items.Select(i => i.Id).ToHashSet();
        items.AddRange(extra.Where(e => e.KitchenTicketId is not null && !known.Contains(e.Id)));

        foreach (var ticket in list)
            ticket.Refresh(items.Where(i => i.KitchenTicketId == ticket.Id), now);
        return list;
    }
}

using Application.Common.Exceptions;
using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Common;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.StoreProfile;
using Application.Interfaces.Services.Tables;
using Application.Mappings.Tables;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.Tables;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Tables;

/// <summary>Sơ đồ bàn, màn phục vụ của bàn, mở bàn, dọn xong (UC-02, FR-04, FR-05, FR-31, 07 §2.7).</summary>
public sealed class FloorPlanService(
    IGenericRepository<Area> areas,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<Order> orders,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<KitchenTicket> tickets,
    IGenericRepository<Reservation> reservations,
    IGenericRepository<User> users,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IStoreProfileService storeProfile,
    IPosEventPublisher events,
    TimeProvider timeProvider) : IFloorPlanService
{
    public const string NotFoundMessage = "Không tìm thấy bàn.";
    public const string NotWaitingClearMessage = "Bàn không ở trạng thái chờ dọn";

    private readonly PosReadModel _read = new(orders, tables, menuItems, tickets, reservations);

    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<FloorPlanDto> GetFloorPlanAsync(CancellationToken ct = default)
    {
        var now = Now;
        await ApplyNoShowsAsync(now, ct);

        var visibleAreas = await areas.QueryNoTracking().Where(a => !a.IsHidden).OrderBy(a => a.SortOrder).ThenBy(a => a.Code).ToListAsync(ct);
        var areaIds = visibleAreas.Select(a => a.Id).ToList();
        var list = await tables.QueryNoTracking().Include(t => t.Area)
            .Where(t => !t.IsHidden && areaIds.Contains(t.AreaId))
            .ToListAsync(ct);
        var areaOrder = visibleAreas.Select((a, i) => (a.Id, i)).ToDictionary(x => x.Id, x => x.i);
        list = list.OrderBy(t => areaOrder[t.AreaId]).ThenBy(t => t.Code, StringComparer.Ordinal).ToList();

        var profile = await storeProfile.GetAsync(ct);
        var cards = await _read.BuildCardsAsync(list, profile, now, ct);
        var tableCounts = list.GroupBy(t => t.AreaId).ToDictionary(g => g.Key, g => g.Count());

        return new FloorPlanDto
        {
            AsOf = now,
            Areas = visibleAreas.Select(a => a.ToDto(tableCounts.GetValueOrDefault(a.Id))).ToList(),
            Tables = cards,
            Counts = Enum.GetValues<TableStatus>().ToDictionary(s => s, s => cards.Count(c => c.Status == s)),
            TotalTables = cards.Count
        };
    }

    public async Task<TableServiceDto> GetTableServiceAsync(Guid tableId, CancellationToken ct = default)
    {
        var now = Now;
        await ApplyNoShowsAsync(now, ct);

        var viewed = await tables.QueryNoTracking().Include(t => t.Area).FirstOrDefaultAsync(t => t.Id == tableId, ct)
            ?? throw new NotFoundException(NotFoundMessage);

        // UC-09 E2: chạm bàn phụ đã gộp → dữ liệu bàn chính.
        var table = viewed;
        if (viewed.Status == TableStatus.DaGop && viewed.MergedIntoTableId is { } mainId)
        {
            table = await tables.QueryNoTracking().IgnoreQueryFilters().Include(t => t.Area).FirstOrDefaultAsync(t => t.Id == mainId, ct)
                ?? viewed;
        }

        var profile = await storeProfile.GetAsync(ct);
        var card = (await _read.BuildCardsAsync([table], profile, now, ct)).Single();
        var active = await PosReadModel.WithDetails(orders.QueryNoTracking())
            .Where(o => o.TableId == table.Id && PosReadModel.ActiveStatuses.Contains(o.Status))
            .ToListAsync(ct);
        active = active.OrderBy(o => o.Code, StringComparer.Ordinal).ToList();

        return new TableServiceDto
        {
            Table = card,
            ViewedTableId = viewed.Id,
            Orders = await _read.ToDtosAsync(active, profile, now, ct)
        };
    }

    public async Task<CreatedResult<OrderDto>> OpenTableAsync(Guid tableId, OpenTableRequest request, CancellationToken ct = default)
    {
        var requestId = request.ClientRequestId.Trim();
        if (await ExistingByRequestAsync(requestId, ct) is { } existing)
            return new CreatedResult<OrderDto>(existing, false);

        var now = Now;
        await ApplyNoShowsAsync(now, ct);
        var table = await tables.Query().FirstOrDefaultAsync(t => t.Id == tableId, ct) ?? throw new NotFoundException(NotFoundMessage);
        try
        {
            await EnsureCanOpenAsync(table, ct);
        }
        catch (ConflictException)
        {
            // Lần bấm trước cùng mã vừa mở xong bàn sau bước kiểm đầu tiên → trả hóa đơn đã tạo (07 §3.7).
            if (await ExistingByRequestAsync(requestId, ct) is { } justOpened)
                return new CreatedResult<OrderDto>(justOpened, false);
            throw;
        }

        var waiter = await PosCodes.CurrentUserAsync(users, currentUser, ct);
        var profile = await storeProfile.GetAsync(ct);
        var order = Order.Open(
            await PosCodes.NextOrderCodeAsync(orders, now, 0, ct), table.Id, request.GuestCount, (waiter.Id, waiter.FullName), now,
            requestId, profile.ServiceChargeRate, profile.VatRate);
        order.Recalculate();
        table.SetStatus(TableStatus.DangPhucVu, now);
        await orders.AddAsync(order, ct);

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // Hai request cùng lúc: cùng mã yêu cầu → trả hóa đơn đã tạo; bàn vừa có người mở → 409; trùng mã hóa đơn → thử lại.
            if (await ExistingByRequestAsync(requestId, ct) is { } duplicated)
                return new CreatedResult<OrderDto>(duplicated, false);
            if (ex is DbUpdateConcurrencyException)
                throw await OpenedByOtherAsync(table, ct);

            order.AssignCode(await PosCodes.NextOrderCodeAsync(orders, now, 0, ct));
            await unitOfWork.SaveChangesAsync(ct);
        }

        await events.TablesChangedAsync([table.Id], ct);
        await events.OrderChangedAsync(order, ct);
        return new CreatedResult<OrderDto>(await LoadOrderDtoAsync(order.Id, ct), true);
    }

    public async Task<TableCardDto> ClearTableAsync(Guid tableId, CancellationToken ct = default)
    {
        var table = await tables.Query().Include(t => t.Area).FirstOrDefaultAsync(t => t.Id == tableId, ct)
            ?? throw new NotFoundException(NotFoundMessage);
        if (table.Status != TableStatus.ChoDon)
            throw new DomainException(NotWaitingClearMessage);

        table.SetStatus(TableStatus.Trong, Now);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([table.Id], ct);

        var profile = await storeProfile.GetAsync(ct);
        return (await _read.BuildCardsAsync([table], profile, Now, ct)).Single();
    }

    /// <summary>
    /// BR-01: chỉ mở bàn Trống hoặc Đã đặt. Bàn đã có hóa đơn → 409 BanVuaDuocMo (UC-02 E3); Chờ dọn → 400 BanChoDon.
    /// </summary>
    internal static async Task EnsureCanOpenAsync(DiningTable table, IGenericRepository<Order> orders, CancellationToken ct)
    {
        if (table.Status == TableStatus.Trong)
            return;
        if (table.Status == TableStatus.ChoDon)
            throw PosErrors.Business(PosErrors.BanChoDon, PosErrors.TableNotClearedMessage);

        var holderId = table.Status == TableStatus.DaGop && table.MergedIntoTableId is { } mainId ? mainId : table.Id;
        var holder = await orders.QueryNoTracking()
            .Where(o => o.TableId == holderId && PosReadModel.ActiveStatuses.Contains(o.Status))
            .OrderBy(o => o.OpenedAt).Select(o => new { o.Id, o.WaiterName }).FirstOrDefaultAsync(ct);
        if (holder is null)
            throw PosErrors.TableOccupied();
        throw PosConflicts.TableJustOpened(table.Code, holder.WaiterName, holder.Id);
    }

    private Task EnsureCanOpenAsync(DiningTable table, CancellationToken ct) => EnsureCanOpenAsync(table, orders, ct);

    private async Task<Exception> OpenedByOtherAsync(DiningTable table, CancellationToken ct)
    {
        var fresh = await tables.QueryNoTracking().FirstAsync(t => t.Id == table.Id, ct);
        try
        {
            await EnsureCanOpenAsync(fresh, ct);
        }
        catch (Exception ex) when (ex is ConflictException or DomainException)
        {
            return ex;
        }

        return PosConflicts.Stale(fresh.Version);
    }

    private async Task<OrderDto?> ExistingByRequestAsync(string requestId, CancellationToken ct)
    {
        var id = await orders.QueryNoTracking().Where(o => o.ClientRequestId == requestId).Select(o => (Guid?)o.Id).FirstOrDefaultAsync(ct);
        return id is { } orderId ? await LoadOrderDtoAsync(orderId, ct) : null;
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId, CancellationToken ct)
    {
        var order = await PosReadModel.WithDetails(orders.QueryNoTracking()).FirstAsync(o => o.Id == orderId, ct);
        var profile = await storeProfile.GetAsync(ct);
        return (await _read.ToDtosAsync([order], profile, Now, ct)).Single();
    }

    private async Task ApplyNoShowsAsync(DateTime now, CancellationToken ct)
    {
        var changed = await _read.MarkNoShowsAsync(now, ct);
        if (changed.Count == 0)
            return;

        await unitOfWork.SaveChangesAsync(ct);
        await events.ReservationsChangedAsync(changed.Select(r => r.Id), ct);
    }
}

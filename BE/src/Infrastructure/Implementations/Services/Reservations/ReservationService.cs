using System.Globalization;
using Application.Common.Exceptions;
using Application.Common.Models;
using Application.Common.Time;
using Application.DTOs.Orders;
using Application.DTOs.Reservations;
using Application.DTOs.Tables;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Common;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.Reservations;
using Application.Interfaces.Services.StoreProfile;
using Application.Mappings.Reservations;
using Application.Mappings.Tables;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Reservations;

/// <summary>
/// Đặt bàn trước (UC-13, FR-34..FR-36, 07 §2.15). Quy tắc BR-24: giờ đến trong giờ mở cửa, cách lúc tạo ≥ 30 phút,
/// giữ bàn 120 phút, hai đặt bàn cùng bàn không chồng khung. "Không đến" đổi lười khi đọc (07 §5 quyết định 12).
/// </summary>
public sealed class ReservationService(
    IGenericRepository<Reservation> reservations,
    IGenericRepository<DiningTable> tables,
    IGenericRepository<Order> orders,
    IGenericRepository<Payment> payments,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<KitchenTicket> tickets,
    IGenericRepository<User> users,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IStoreProfileService storeProfile,
    IPosEventPublisher events,
    TimeProvider timeProvider) : IReservationService
{
    public const string NotFoundMessage = "Không tìm thấy đặt bàn.";
    public const string MinLeadMessage = "Giờ đến phải sau hiện tại ít nhất 30 phút";
    public const string CheckInTodayMessage = "Chỉ nhận bàn cho đặt bàn hôm nay";

    private static readonly ReservationStatus[] HoldingStatuses = [ReservationStatus.ChoDen, ReservationStatus.DaNhanBan];

    private readonly PosReadModel _read = new(orders, tables, menuItems, tickets, reservations);

    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<PaginatedResult<ReservationDto>> GetPagedAsync(ReservationQuery query, CancellationToken ct = default)
    {
        await ApplyNoShowsAsync(ct);
        var source = reservations.QueryNoTracking();

        var term = query.GetSearchTerm();
        if (term is not null)
        {
            var pattern = LikePattern.Contains(term);
            var digits = new string(term.Where(char.IsDigit).ToArray());
            var phonePattern = digits.Length > 0 ? LikePattern.Contains(digits) : pattern;
            source = source.Where(r => AppDbFunctions.Matches(r.CustomerName, pattern)
                || AppDbFunctions.Matches(r.Code, pattern)
                || AppDbFunctions.Matches(r.Phone, phonePattern));
        }

        if (VietnamDates.TryParse(query.From, out var from))
        {
            var fromUtc = VietnamDates.StartOfDayUtc(from);
            source = source.Where(r => r.ArrivalAt >= fromUtc);
        }

        if (VietnamDates.TryParse(query.To, out var to))
        {
            var toUtc = VietnamDates.EndOfDayExclusiveUtc(to);
            source = source.Where(r => r.ArrivalAt < toUtc);
        }

        if (query.Status is { } status)
            source = source.Where(r => r.Status == status);
        if (query.TableId is { } tableId)
            source = source.Where(r => r.TableId == tableId);

        if (string.IsNullOrWhiteSpace(query.SortBy))
        {
            query.SortBy = nameof(Reservation.ArrivalAt);
            query.SortDir ??= "asc";
        }

        var page = await source.ApplySorting(query).ToPaginatedResultAsync(query, ct);
        var dtos = await ToDtosAsync(page.Items, ct);
        return page.Map(_ => dtos);
    }

    public async Task<ReservationDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        await ApplyNoShowsAsync(ct);
        var reservation = await reservations.QueryNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException(NotFoundMessage);
        return (await ToDtosAsync([reservation], ct)).Single();
    }

    public async Task<IReadOnlyList<DiningTableDto>> GetAvailableTablesAsync(AvailableTablesQuery query, CancellationToken ct = default)
    {
        await ApplyNoShowsAsync(ct);
        var arrival = VietnamTime.ToUtc(query.ArrivalAt!.Value);
        var candidates = await tables.QueryNoTracking().Include(t => t.Area)
            .Where(t => !t.IsHidden && !t.Area!.IsHidden && t.Capacity >= query.GuestCount)
            .ToListAsync(ct);

        var windowStart = arrival - PosRules.ReservationHold;
        var windowEnd = arrival + PosRules.ReservationHold;
        var busy = await reservations.QueryNoTracking()
            .Where(r => HoldingStatuses.Contains(r.Status) && r.Id != query.ExcludeId
                && r.ArrivalAt > windowStart && r.ArrivalAt < windowEnd)
            .Select(r => r.TableId)
            .Distinct()
            .ToListAsync(ct);

        return candidates
            .Where(t => !busy.Contains(t.Id))
            .OrderBy(t => t.Capacity).ThenBy(t => t.Area!.SortOrder).ThenBy(t => t.Code, StringComparer.Ordinal)
            .Select(t => t.ToDto(t.Area!, false))
            .ToList();
    }

    public async Task<ReservationDto> CreateAsync(SaveReservationRequest request, CancellationToken ct = default)
    {
        var now = Now;
        var arrival = await ValidateAsync(request, null, now, checkLead: true, ct);
        var reservation = Reservation.Create(
            await PosCodes.NextReservationCodeAsync(reservations, now, ct), request.CustomerName, request.Phone, arrival,
            request.GuestCount, request.TableId, request.Note, request.Deposit);
        await reservations.AddAsync(reservation, ct);

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Trùng mã do hai request cùng lúc: thử lại một lần (06 §3).
            reservation.AssignCode(await PosCodes.NextReservationCodeAsync(reservations, now, ct));
            await unitOfWork.SaveChangesAsync(ct);
        }

        await events.ReservationsChangedAsync([reservation.Id], ct);
        await events.TablesChangedAsync([reservation.TableId], ct);
        return await GetByIdAsync(reservation.Id, ct);
    }

    public async Task<ReservationDto> UpdateAsync(Guid id, SaveReservationRequest request, CancellationToken ct = default)
    {
        await ApplyNoShowsAsync(ct);
        var reservation = await reservations.Query().FirstOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        reservation.EnsureWaiting();

        var now = Now;
        var arrivalChanged = VietnamTime.ToUtc(request.ArrivalAt!.Value) != reservation.ArrivalAt;
        var arrival = await ValidateAsync(request, id, now, checkLead: arrivalChanged, ct);
        var previousTable = reservation.TableId;
        reservation.Update(request.CustomerName, request.Phone, arrival, request.GuestCount, request.TableId, request.Note, request.Deposit);
        await unitOfWork.SaveChangesAsync(ct);

        await events.ReservationsChangedAsync([id], ct);
        await events.TablesChangedAsync([previousTable, reservation.TableId], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task<ReservationDto> CancelAsync(Guid id, CancelReservationRequest request, CancellationToken ct = default)
    {
        await ApplyNoShowsAsync(ct);
        var reservation = await reservations.Query().FirstOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        var user = await PosCodes.CurrentUserAsync(users, currentUser, ct);
        reservation.Cancel(request.Reason, (user.Id, user.FullName), Now);
        await unitOfWork.SaveChangesAsync(ct);

        await events.ReservationsChangedAsync([id], ct);
        await events.TablesChangedAsync([reservation.TableId], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task<CreatedResult<OrderDto>> CheckInAsync(Guid id, CheckInRequest request, CancellationToken ct = default)
    {
        var requestId = request.ClientRequestId.Trim();
        if (await ExistingOrderAsync(requestId, ct) is { } existing)
            return new CreatedResult<OrderDto>(existing, false);

        await ApplyNoShowsAsync(ct);
        var reservation = await reservations.Query().FirstOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        reservation.EnsureWaiting();

        var now = Now;
        if (VietnamDates.DateOf(reservation.ArrivalAt) != VietnamDates.DateOf(now))
            throw new DomainException(CheckInTodayMessage);

        // FR-36: bàn phải Trống hoặc Đã đặt; Chờ dọn → BanChoDon; có khách → chuyển đặt bàn sang bàn khác.
        var table = await tables.Query().FirstOrDefaultAsync(t => t.Id == reservation.TableId, ct)
            ?? throw new NotFoundException("Không tìm thấy bàn.");
        if (table.Status == TableStatus.ChoDon)
            throw PosErrors.Business(PosErrors.BanChoDon, PosErrors.TableNotClearedMessage);
        if (table.Status != TableStatus.Trong)
            throw new DomainException($"Bàn {table.Code} đang có khách, chuyển đặt bàn sang bàn khác");

        var waiter = await PosCodes.CurrentUserAsync(users, currentUser, ct);
        var profile = await storeProfile.GetAsync(ct);
        var order = Order.Open(
            await PosCodes.NextOrderCodeAsync(orders, now, 0, ct), table.Id, request.GuestCount ?? reservation.GuestCount,
            (waiter.Id, waiter.FullName), now, requestId, profile.ServiceChargeRate, profile.VatRate,
            reservation.Note, reservation.Deposit, reservation.Id);

        // BR-25: tiền cọc thành lượt thu "Tiền cọc" của hóa đơn (TC-42).
        if (reservation.Deposit > 0)
        {
            var deposit = Payment.Deposit(order.Id, reservation.Deposit, now);
            order.RegisterPayment(deposit, now, null);
            await payments.AddAsync(deposit, ct);
        }

        order.Recalculate();
        await orders.AddAsync(order, ct);
        table.SetStatus(TableStatus.DangPhucVu, now);

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            if (await ExistingOrderAsync(requestId, ct) is { } duplicated)
                return new CreatedResult<OrderDto>(duplicated, false);
            throw;
        }

        // Liên kết hai chiều lưu sau để tránh vòng khóa ngoại khi chèn (Pos_Orders ↔ Pos_Reservations).
        reservation.CheckIn(order.Id, now);
        await unitOfWork.SaveChangesAsync(ct);

        await events.ReservationsChangedAsync([id], ct);
        await events.TablesChangedAsync([table.Id], ct);
        await events.OrderChangedAsync(order, ct);
        return new CreatedResult<OrderDto>(await LoadOrderDtoAsync(order.Id, ct), true);
    }

    /// <summary>BR-24, TC-41. Trả giờ đến UTC đã kiểm.</summary>
    private async Task<DateTime> ValidateAsync(SaveReservationRequest request, Guid? currentId, DateTime now, bool checkLead, CancellationToken ct)
    {
        var arrival = VietnamTime.ToUtc(request.ArrivalAt!.Value);
        var profile = await storeProfile.GetAsync(ct);
        var local = VietnamDates.ToVietnam(arrival);
        var time = TimeOnly.FromDateTime(local);
        VietnamDates.TryParseTime(profile.OpenTime, out var open);
        VietnamDates.TryParseTime(profile.CloseTime, out var close);
        if (time < open || time > close)
            throw FieldErrors.Single("arrivalAt", $"Giờ đến trong giờ mở cửa {profile.OpenTime}–{profile.CloseTime}");
        if (checkLead && arrival < now + PosRules.ReservationMinLead)
            throw FieldErrors.Single("arrivalAt", MinLeadMessage);

        var table = await tables.QueryNoTracking().FirstOrDefaultAsync(t => t.Id == request.TableId && !t.IsHidden, ct)
            ?? throw FieldErrors.Single("tableId", "Bàn không tồn tại");

        // Hai đặt bàn cùng bàn không chồng khung giữ 120 phút: |a − b| < 120 phút (TC-41: 19:00 giữ tới 21:00, 20:00 trùng, 21:00 được).
        var windowStart = arrival - PosRules.ReservationHold;
        var windowEnd = arrival + PosRules.ReservationHold;
        var conflict = await reservations.QueryNoTracking()
            .Where(r => r.TableId == table.Id && r.Id != currentId && HoldingStatuses.Contains(r.Status)
                && r.ArrivalAt > windowStart && r.ArrivalAt < windowEnd)
            .OrderBy(r => r.ArrivalAt)
            .FirstOrDefaultAsync(ct);
        if (conflict is not null)
        {
            var from = VietnamDates.ToVietnam(conflict.ArrivalAt);
            var to = VietnamDates.ToVietnam(conflict.HoldUntil);
            throw PosConflicts.ReservationOverlap(
                table.Code,
                from.ToString("HH:mm", CultureInfo.InvariantCulture),
                to.ToString("HH:mm", CultureInfo.InvariantCulture));
        }

        return arrival;
    }

    private async Task<List<ReservationDto>> ToDtosAsync(IReadOnlyList<Reservation> list, CancellationToken ct)
    {
        var now = Now;
        var tableInfo = await _read.TableInfoAsync(list.Select(r => r.TableId).Distinct().ToList(), ct);
        var orderIds = list.Where(r => r.OrderId != null).Select(r => r.OrderId!.Value).Distinct().ToList();
        var orderCodes = orderIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await orders.QueryNoTracking().Where(o => orderIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.Code, ct);

        return list.Select(r =>
        {
            var info = tableInfo.GetValueOrDefault(r.TableId);
            return r.ToDto(info.Code ?? string.Empty, info.AreaName ?? string.Empty,
                r.OrderId is { } oid ? orderCodes.GetValueOrDefault(oid) : null, now);
        }).ToList();
    }

    private async Task ApplyNoShowsAsync(CancellationToken ct)
    {
        var changed = await _read.MarkNoShowsAsync(Now, ct);
        if (changed.Count == 0)
            return;

        await unitOfWork.SaveChangesAsync(ct);
        await events.ReservationsChangedAsync(changed.Select(r => r.Id), ct);
    }

    private async Task<OrderDto?> ExistingOrderAsync(string requestId, CancellationToken ct)
    {
        var id = await orders.QueryNoTracking().Where(o => o.ClientRequestId == requestId).Select(o => (Guid?)o.Id).FirstOrDefaultAsync(ct);
        return id is { } orderId ? await LoadOrderDtoAsync(orderId, ct) : null;
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId, CancellationToken ct)
    {
        var order = await PosReadModel.WithDetails(orders.QueryNoTracking()).FirstAsync(o => o.Id == orderId, ct);
        return (await _read.ToDtosAsync([order], await storeProfile.GetAsync(ct), Now, ct)).Single();
    }
}

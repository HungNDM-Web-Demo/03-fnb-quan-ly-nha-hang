using System.Globalization;
using Application.Common.Time;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Common;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.System.Users;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Pos;

/// <summary>
/// Mã chứng từ theo ngày giờ Việt Nam (SRS §5.3, 06 §3): hóa đơn <c>HD</c> + <c>yyMMdd</c> + 4 số; phiếu bếp <c>#</c> + 3 số
/// đánh lại mỗi ngày; đặt bàn <c>DB</c> + <c>yyMMdd</c> + 3 số. Số tiếp theo = số lớn nhất trong ngày + 1; trùng do hai request
/// cùng lúc thì index unique báo lỗi, service thử lại một lần.
/// </summary>
internal static class PosCodes
{
    public const string OrderPrefix = "HD";
    public const string ReservationPrefix = "DB";

    public static string OrderCode(DateOnly date, int sequence) =>
        OrderPrefix + date.ToString("yyMMdd", CultureInfo.InvariantCulture) + sequence.ToString("0000", CultureInfo.InvariantCulture);

    public static string ReservationCode(DateOnly date, int sequence) =>
        ReservationPrefix + date.ToString("yyMMdd", CultureInfo.InvariantCulture) + sequence.ToString("000", CultureInfo.InvariantCulture);

    /// <summary>Mã hóa đơn thứ <paramref name="offset"/> + 1 kể từ số lớn nhất của ngày mở (<paramref name="openedAtUtc"/>).</summary>
    public static async Task<string> NextOrderCodeAsync(IGenericRepository<Order> orders, DateTime openedAtUtc, int offset, CancellationToken ct)
    {
        var date = VietnamDates.DateOf(openedAtUtc);
        var prefix = OrderCode(date, 0)[..^4];
        var last = await orders.QueryNoTracking().Where(o => o.Code.StartsWith(prefix))
            .OrderByDescending(o => o.Code).Select(o => o.Code).FirstOrDefaultAsync(ct);
        var sequence = last is not null && int.TryParse(last[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : 0;
        return OrderCode(date, sequence + 1 + offset);
    }

    public static async Task<int> NextTicketNoAsync(IGenericRepository<KitchenTicket> tickets, DateOnly businessDate, CancellationToken ct) =>
        (await tickets.QueryNoTracking().Where(t => t.BusinessDate == businessDate).MaxAsync(t => (int?)t.TicketNo, ct) ?? 0) + 1;

    public static async Task<string> NextReservationCodeAsync(IGenericRepository<Reservation> reservations, DateTime createdAtUtc, CancellationToken ct)
    {
        var date = VietnamDates.DateOf(createdAtUtc);
        var prefix = ReservationCode(date, 0)[..^3];
        var last = await reservations.QueryNoTracking().Where(r => r.Code.StartsWith(prefix))
            .OrderByDescending(r => r.Code).Select(r => r.Code).FirstOrDefaultAsync(ct);
        var sequence = last is not null && int.TryParse(last[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : 0;
        return ReservationCode(date, sequence + 1);
    }

    /// <summary>Người dùng hiện tại: Id, họ tên (chụp vào hóa đơn, phiếu), tên đăng nhập (người hủy, người duyệt).</summary>
    public static async Task<(Guid Id, string FullName, string Username)> CurrentUserAsync(
        IGenericRepository<User> users,
        ICurrentUserService currentUser,
        CancellationToken ct)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedAccessException("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        var user = await users.QueryNoTracking().Where(u => u.Id == userId)
            .Select(u => new { u.FullName, u.Username }).FirstOrDefaultAsync(ct)
            ?? throw new UnauthorizedAccessException("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        return (userId, user.FullName, user.Username);
    }
}

using Application.DTOs.Reservations;
using Application.DTOs.Tables;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Reservations;
using Domain.Enums.Pos.Reservations;

namespace Application.Mappings.Reservations;

public static class ReservationMappings
{
    /// <summary>BR-24: "Trễ" khi Chờ đến và quá giờ đến 15 phút (chỉ hiển thị).</summary>
    public static bool IsLateAt(this Reservation reservation, DateTime nowUtc) =>
        reservation.Status == ReservationStatus.ChoDen && nowUtc > reservation.ArrivalAt.Add(PosRules.ReservationLateAfter);

    public static ReservationDto ToDto(this Reservation reservation, string tableCode, string areaName, string? orderCode, DateTime nowUtc) => new()
    {
        Id = reservation.Id,
        Code = reservation.Code,
        CustomerName = reservation.CustomerName,
        Phone = reservation.Phone,
        ArrivalAt = reservation.ArrivalAt,
        HoldUntil = reservation.HoldUntil,
        GuestCount = reservation.GuestCount,
        TableId = reservation.TableId,
        TableCode = tableCode,
        AreaName = areaName,
        Note = reservation.Note,
        Deposit = reservation.Deposit,
        Status = reservation.Status,
        IsLate = reservation.IsLateAt(nowUtc),
        OrderId = reservation.OrderId,
        OrderCode = orderCode,
        CheckedInAt = reservation.CheckedInAt,
        CancelledAt = reservation.CancelledAt,
        CancelledByName = reservation.CancelledByName,
        CancelReason = reservation.CancelReason,
        CreatedAt = reservation.CreatedAt
    };

    public static TableReservationInfo ToTableInfo(this Reservation reservation, DateTime nowUtc) => new()
    {
        Id = reservation.Id,
        Code = reservation.Code,
        CustomerName = reservation.CustomerName,
        ArrivalAt = reservation.ArrivalAt,
        GuestCount = reservation.GuestCount,
        Deposit = reservation.Deposit,
        Note = reservation.Note,
        IsLate = reservation.IsLateAt(nowUtc)
    };
}

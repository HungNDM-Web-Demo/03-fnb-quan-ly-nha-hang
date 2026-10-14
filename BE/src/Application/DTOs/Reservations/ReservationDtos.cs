using Application.Common.Models;
using Domain.Enums.Pos.Reservations;

namespace Application.DTOs.Reservations;

// DTO đặt bàn (07 §2.15).

public sealed class ReservationDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string CustomerName { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public DateTime ArrivalAt { get; init; }

    /// <summary>arrivalAt + 120 phút.</summary>
    public DateTime HoldUntil { get; init; }

    public int GuestCount { get; init; }
    public Guid TableId { get; init; }
    public string TableCode { get; init; } = string.Empty;
    public string AreaName { get; init; } = string.Empty;
    public string? Note { get; init; }
    public decimal Deposit { get; init; }

    /// <summary>KhongDen áp lười khi quá giờ đến 30 phút.</summary>
    public ReservationStatus Status { get; init; }

    /// <summary>ChoDen và quá giờ đến 15 phút → nhãn "Trễ".</summary>
    public bool IsLate { get; init; }

    public Guid? OrderId { get; init; }
    public string? OrderCode { get; init; }
    public DateTime? CheckedInAt { get; init; }
    public DateTime? CancelledAt { get; init; }
    public string? CancelledByName { get; init; }
    public string? CancelReason { get; init; }
    public DateTime CreatedAt { get; init; }
}

public sealed class SaveReservationRequest
{
    public string CustomerName { get; init; } = string.Empty;

    /// <summary>10 số, bắt đầu 0.</summary>
    public string Phone { get; init; } = string.Empty;

    /// <summary>ISO UTC.</summary>
    public DateTime? ArrivalAt { get; init; }

    public int GuestCount { get; init; }
    public Guid TableId { get; init; }
    public string? Note { get; init; }
    public decimal Deposit { get; init; }
}

public sealed class ReservationQuery : PaginationQuery
{
    /// <summary>yyyy-MM-dd giờ Việt Nam, lọc theo ngày đến.</summary>
    public string? From { get; set; }

    public string? To { get; set; }
    public ReservationStatus? Status { get; set; }
    public Guid? TableId { get; set; }
}

public sealed class AvailableTablesQuery
{
    public DateTime? ArrivalAt { get; set; }
    public int GuestCount { get; set; }
    public Guid? ExcludeId { get; set; }
}

public sealed class CancelReservationRequest
{
    public string Reason { get; init; } = string.Empty;
}

public sealed class CheckInRequest
{
    public string ClientRequestId { get; init; } = string.Empty;

    /// <summary>Mặc định số khách đặt.</summary>
    public int? GuestCount { get; init; }
}

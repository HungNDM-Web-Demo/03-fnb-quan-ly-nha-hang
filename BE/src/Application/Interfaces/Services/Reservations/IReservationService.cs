using Application.Common.Models;
using Application.DTOs.Orders;
using Application.DTOs.Reservations;
using Application.DTOs.Tables;

namespace Application.Interfaces.Services.Reservations;

/// <summary>Đặt bàn trước (UC-13, FR-34..FR-36, BR-24, BR-25, 07 §2.15).</summary>
public interface IReservationService
{
    Task<PaginatedResult<ReservationDto>> GetPagedAsync(ReservationQuery query, CancellationToken ct = default);

    Task<ReservationDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Bàn chưa ẩn, đủ chỗ, không trùng khung 120 phút, theo sức chứa tăng dần.</summary>
    Task<IReadOnlyList<DiningTableDto>> GetAvailableTablesAsync(AvailableTablesQuery query, CancellationToken ct = default);

    Task<ReservationDto> CreateAsync(SaveReservationRequest request, CancellationToken ct = default);

    Task<ReservationDto> UpdateAsync(Guid id, SaveReservationRequest request, CancellationToken ct = default);

    Task<ReservationDto> CancelAsync(Guid id, CancelReservationRequest request, CancellationToken ct = default);

    /// <summary>Nhận bàn (FR-36, TC-42); cùng <c>clientRequestId</c> → hóa đơn cũ.</summary>
    Task<CreatedResult<OrderDto>> CheckInAsync(Guid id, CheckInRequest request, CancellationToken ct = default);
}

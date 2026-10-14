using API.Base;
using API.Filters;
using Application.Common.Models;
using Application.Constants;
using Application.DTOs.Orders;
using Application.DTOs.Reservations;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Reservations;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Reservations;

/// <summary>Đặt bàn trước (UC-13, FR-34..FR-36, 07 §2.15).</summary>
[Route("api/reservations")]
public sealed class ReservationsController(IReservationService reservationService) : BaseApiController
{
    /// <summary>Lọc theo ngày giờ đến; dòng thời gian một ngày: <c>from=to=ngày&amp;pageSize=100</c>.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Reservations.View)]
    [ProducesResponseType<PaginatedResult<ReservationDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PaginatedResult<ReservationDto>>> GetAll([FromQuery] ReservationQuery query, CancellationToken ct) =>
        Ok(await reservationService.GetPagedAsync(query, ct));

    /// <summary>Bàn chưa ẩn, đủ chỗ, không trùng khung 120 phút, theo sức chứa tăng dần (UC-13 bước 2).</summary>
    [HttpGet("available-tables")]
    [AuthorizePermission(ProjectPermissions.Reservations.Create, ProjectPermissions.Reservations.Update)]
    [ProducesResponseType<IReadOnlyList<DiningTableDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DiningTableDto>>> GetAvailableTables([FromQuery] AvailableTablesQuery query, CancellationToken ct) =>
        Ok(await reservationService.GetAvailableTablesAsync(query, ct));

    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Reservations.View)]
    [ProducesResponseType<ReservationDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ReservationDto>> GetById(Guid id, CancellationToken ct) => Ok(await reservationService.GetByIdAsync(id, ct));

    /// <summary>Trùng khung → 409 TrungDatBan <c>errors.tableId</c> (TC-41).</summary>
    [HttpPost]
    [AuthorizePermission(ProjectPermissions.Reservations.Create)]
    [ProducesResponseType<ReservationDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<ReservationDto>> Create(SaveReservationRequest request, CancellationToken ct)
    {
        var item = await reservationService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>Chỉ khi Chờ đến.</summary>
    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Reservations.Update)]
    [ProducesResponseType<ReservationDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ReservationDto>> Update(Guid id, SaveReservationRequest request, CancellationToken ct) =>
        Ok(await reservationService.UpdateAsync(id, request, ct));

    [HttpPost("{id:guid}/cancel")]
    [AuthorizePermission(ProjectPermissions.Reservations.Delete)]
    [ProducesResponseType<ReservationDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ReservationDto>> Cancel(Guid id, CancelReservationRequest request, CancellationToken ct) =>
        Ok(await reservationService.CancelAsync(id, request, ct));

    /// <summary>Nhận bàn (FR-36, TC-42): 201 hóa đơn mới kèm lượt "Tiền cọc"; cùng <c>clientRequestId</c> → 200.</summary>
    [HttpPost("{id:guid}/check-in")]
    [AuthorizePermission(ProjectPermissions.Reservations.CheckIn)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> CheckIn(Guid id, CheckInRequest request, CancellationToken ct)
    {
        var result = await reservationService.CheckInAsync(id, request, ct);
        return result.Created ? Created($"/api/orders/{result.Value.Id}", result.Value) : Ok(result.Value);
    }
}

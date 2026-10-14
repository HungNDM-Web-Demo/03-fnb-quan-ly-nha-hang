using API.Base;
using API.Filters;
using Application.Constants;
using Application.DTOs.Kitchen;
using Application.Interfaces.Services.Kitchen;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Kitchen;

/// <summary>Màn hình bếp (UC-06, UC-04 1a, 07 §2.10). Thao tác bếp không đổi <c>version</c> hóa đơn, trừ báo hết món.</summary>
[Route("api/kitchen-tickets")]
public sealed class KitchenTicketsController(IKitchenService kitchenService) : BaseApiController
{
    /// <summary><c>view=DangCho</c> (mặc định) sắp theo BR-12; <c>view=DaXong</c> phiếu xong hôm nay, mới nhất trước, tối đa 50.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.View)]
    [ProducesResponseType<KitchenBoardDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenBoardDto>> GetBoard([FromQuery] KitchenBoardQuery query, CancellationToken ct) =>
        Ok(await kitchenService.GetBoardAsync(query, ct));

    /// <summary>Chế độ tổng hợp (FR-18).</summary>
    [HttpGet("summary")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.View)]
    [ProducesResponseType<IReadOnlyList<KitchenSummaryItem>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<KitchenSummaryItem>>> GetSummary([FromQuery] KitchenSummaryQuery query, CancellationToken ct) =>
        Ok(await kitchenService.GetSummaryAsync(query, ct));

    [HttpPost("{id:guid}/items/{itemId:guid}/start")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> Start(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchenService.StartAsync(id, itemId, ct));

    [HttpPost("{id:guid}/items/{itemId:guid}/done")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> Done(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchenService.DoneAsync(id, itemId, ct));

    /// <summary>"Xong cả phiếu" (UC-06 4a).</summary>
    [HttpPost("{id:guid}/done-all")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> DoneAll(Guid id, CancellationToken ct) => Ok(await kitchenService.DoneAllAsync(id, ct));

    /// <summary>Hoàn tác Xong → Đang làm (BR-10); món đã ra → 400 MonDaRa (TC-20).</summary>
    [HttpPost("{id:guid}/items/{itemId:guid}/undo")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> Undo(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchenService.UndoAsync(id, itemId, ct));

    /// <summary>Báo hết món đang chờ làm (FR-10, BR-14, TC-07).</summary>
    [HttpPost("{id:guid}/items/{itemId:guid}/out-of-stock")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> OutOfStock(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchenService.OutOfStockAsync(id, itemId, ct));

    /// <summary>"Đã biết" món hủy (BR-13).</summary>
    [HttpPost("{id:guid}/items/{itemId:guid}/acknowledge")]
    [AuthorizePermission(ProjectPermissions.KitchenTickets.Update)]
    [ProducesResponseType<KitchenTicketDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenTicketDto>> Acknowledge(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchenService.AcknowledgeAsync(id, itemId, ct));
}

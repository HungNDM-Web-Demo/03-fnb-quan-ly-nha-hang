using API.Base;
using API.Filters;
using Application.Common.Models;
using Application.Constants;
using Application.DTOs.Orders;
using Application.Interfaces.Services.Orders;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Orders;

/// <summary>
/// Hóa đơn và món gọi (07 §2.8–2.14). Mọi thao tác thay đổi trả 200 kèm DTO mới; thao tác có <c>version</c> lệch → 409
/// <c>DuLieuCu</c> (NFR-04); lỗi nghiệp vụ có trường <c>code</c> (07 §2.20).
/// </summary>
[Route("api/orders")]
public sealed class OrdersController(IOrderService orderService) : BaseApiController
{
    /// <summary>Tra cứu (FR-33): lọc ngày theo openedAt, mặc định hôm nay; không có <c>orders.checkout</c> chỉ thấy hóa đơn đang mở.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Orders.View)]
    [ProducesResponseType<PaginatedResult<OrderListItem>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PaginatedResult<OrderListItem>>> GetAll([FromQuery] OrderQuery query, CancellationToken ct) =>
        Ok(await orderService.GetPagedAsync(query, ct));

    /// <summary>Không có <c>orders.checkout</c> mà hóa đơn đã đóng → 403.</summary>
    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Orders.View)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> GetById(Guid id, CancellationToken ct) => Ok(await orderService.GetByIdAsync(id, ct));

    /// <summary>Thêm món "Chưa gửi" (UC-05); món tạm hết → 400 MonTamHet.</summary>
    [HttpPost("{id:guid}/items")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> AddItem(Guid id, AddItemRequest request, CancellationToken ct) =>
        Ok(await orderService.AddItemAsync(id, request, ct));

    [HttpPut("{id:guid}/items/{itemId:guid}")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> UpdateItem(Guid id, Guid itemId, UpdateDraftItemRequest request, CancellationToken ct) =>
        Ok(await orderService.UpdateDraftItemAsync(id, itemId, request, ct));

    /// <summary>Xóa món "Chưa gửi", không lưu (BR-13, TC-25).</summary>
    [HttpDelete("{id:guid}/items/{itemId:guid}")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> DeleteItem(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await orderService.DeleteDraftItemAsync(id, itemId, ct));

    /// <summary>Gửi bếp (FR-13); cùng <c>clientRequestId</c> → kết quả cũ, không tạo phiếu (TC-15).</summary>
    [HttpPost("{id:guid}/send")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<SendResultDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SendResultDto>> Send(Guid id, SendToKitchenRequest request, CancellationToken ct) =>
        Ok(await orderService.SendAsync(id, request, ct));

    [HttpPost("{id:guid}/items/{itemId:guid}/serve")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Serve(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await orderService.ServeItemAsync(id, itemId, ct));

    [HttpPost("{id:guid}/serve-all")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> ServeAll(Guid id, CancellationToken ct) => Ok(await orderService.ServeAllAsync(id, ct));

    /// <summary>Hoàn tác "Đã ra" trong 60 giây; quá hạn → 400 "Hết thời gian hoàn tác".</summary>
    [HttpPost("{id:guid}/items/{itemId:guid}/unserve")]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Unserve(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await orderService.UnserveItemAsync(id, itemId, ct));

    /// <summary>Hủy món đã gửi (UC-08, BR-13); món bếp đã làm cần token quản lý hoặc quyền duyệt.</summary>
    [HttpPost("{id:guid}/items/{itemId:guid}/cancel")]
    [AuthorizePermission(ProjectPermissions.OrderItems.Cancel)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> CancelItem(Guid id, Guid itemId, CancelItemRequest request, CancellationToken ct) =>
        Ok(await orderService.CancelItemAsync(id, itemId, request, ct));

    /// <summary>Đóng bàn mở nhầm (BR-03, TC-10).</summary>
    [HttpPost("{id:guid}/close")]
    [AuthorizePermission(ProjectPermissions.Tables.Open)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Close(Guid id, OrderVersionRequest request, CancellationToken ct) =>
        Ok(await orderService.CloseAsync(id, request, ct));

    /// <summary>Chuyển bàn (FR-22, BR-15).</summary>
    [HttpPost("{id:guid}/transfer")]
    [AuthorizePermission(ProjectPermissions.Tables.Transfer)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Transfer(Guid id, TransferRequest request, CancellationToken ct) =>
        Ok(await orderService.TransferAsync(id, request, ct));

    /// <summary>Gộp các bàn vào bàn của hóa đơn này (FR-23, BR-16).</summary>
    [HttpPost("{id:guid}/merge")]
    [AuthorizePermission(ProjectPermissions.Tables.Transfer)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Merge(Guid id, MergeRequest request, CancellationToken ct) =>
        Ok(await orderService.MergeAsync(id, request, ct));

    /// <summary>Chuyển món (FR-24, BR-17).</summary>
    [HttpPost("{id:guid}/move-items")]
    [AuthorizePermission(ProjectPermissions.Tables.Transfer)]
    [ProducesResponseType<MoveItemsResultDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MoveItemsResultDto>> MoveItems(Guid id, MoveItemsRequest request, CancellationToken ct) =>
        Ok(await orderService.MoveItemsAsync(id, request, ct));

    /// <summary>In tạm tính (FR-27, TC-34); bàn → Chờ thanh toán.</summary>
    [HttpPost("{id:guid}/prebill")]
    [AuthorizePermission(ProjectPermissions.Orders.Prebill)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Prebill(Guid id, OrderVersionRequest request, CancellationToken ct) =>
        Ok(await orderService.PrebillAsync(id, request, ct));

    /// <summary>Giảm giá (FR-29, BR-08); vượt hạn mức không có token → 400 VuotHanMucGiamGia.</summary>
    [HttpPut("{id:guid}/discount")]
    [AuthorizePermission(ProjectPermissions.Orders.Discount)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> SetDiscount(Guid id, DiscountRequest request, CancellationToken ct) =>
        Ok(await orderService.SetDiscountAsync(id, request, ct));

    [HttpDelete("{id:guid}/discount")]
    [AuthorizePermission(ProjectPermissions.Orders.Discount)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> RemoveDiscount(Guid id, [FromQuery] int version, CancellationToken ct) =>
        Ok(await orderService.RemoveDiscountAsync(id, version, ct));

    /// <summary>Tách theo món (FR-25, BR-18): hóa đơn gốc trước, rồi các hóa đơn mới.</summary>
    [HttpPost("{id:guid}/split")]
    [AuthorizePermission(ProjectPermissions.Orders.Split)]
    [ProducesResponseType<IReadOnlyList<OrderDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<OrderDto>>> Split(Guid id, SplitOrderRequest request, CancellationToken ct) =>
        Ok(await orderService.SplitAsync(id, request, ct));

    /// <summary>Chia đều (FR-26, BR-19).</summary>
    [HttpPost("{id:guid}/split-equal")]
    [AuthorizePermission(ProjectPermissions.Orders.Split)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> SplitEqual(Guid id, SplitEqualRequest request, CancellationToken ct) =>
        Ok(await orderService.SplitEqualAsync(id, request, ct));

    [HttpDelete("{id:guid}/split-equal")]
    [AuthorizePermission(ProjectPermissions.Orders.Split)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> CancelSplitEqual(Guid id, [FromQuery] int version, CancellationToken ct) =>
        Ok(await orderService.CancelSplitEqualAsync(id, version, ct));

    /// <summary>Ghi một lượt thu (FR-30): 201; cùng <c>clientRequestId</c> → 200 kết quả cũ (TC-35).</summary>
    [HttpPost("{id:guid}/payments")]
    [AuthorizePermission(ProjectPermissions.Orders.Checkout)]
    [ProducesResponseType<PaymentResultDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<PaymentResultDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PaymentResultDto>> AddPayment(Guid id, CreatePaymentRequest request, CancellationToken ct)
    {
        var result = await orderService.AddPaymentAsync(id, request, ct);
        return result.Created ? Created($"/api/orders/{id}", result.Value) : Ok(result.Value);
    }

    /// <summary>Chốt hóa đơn đủ tiền nhờ tiền cọc (BR-25); đã thanh toán → 200 như cũ.</summary>
    [HttpPost("{id:guid}/complete")]
    [AuthorizePermission(ProjectPermissions.Orders.Checkout)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Complete(Guid id, OrderVersionRequest request, CancellationToken ct) =>
        Ok(await orderService.CompleteAsync(id, request, ct));

    /// <summary>Hủy hóa đơn đã thanh toán trong ngày (BR-23, TC-40).</summary>
    [HttpPost("{id:guid}/cancel")]
    [AuthorizePermission(ProjectPermissions.Orders.Cancel)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Cancel(Guid id, CancelOrderRequest request, CancellationToken ct) =>
        Ok(await orderService.CancelPaidAsync(id, request, ct));
}

/// <summary>Món chờ ra (UC-07, FR-19, 07 §2.11).</summary>
[Route("api/ready-items")]
public sealed class ReadyItemsController(IOrderService orderService) : BaseApiController
{
    /// <summary><c>mine=true</c> chỉ hóa đơn có phục vụ là người gọi.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Orders.Create)]
    [ProducesResponseType<IReadOnlyList<ReadyGroupDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ReadyGroupDto>>> Get([FromQuery] ReadyItemsQuery query, CancellationToken ct) =>
        Ok(await orderService.GetReadyItemsAsync(query, ct));
}

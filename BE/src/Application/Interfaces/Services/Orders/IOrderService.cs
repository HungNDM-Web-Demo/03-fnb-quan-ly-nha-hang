using Application.Common.Models;
using Application.DTOs.Orders;

namespace Application.Interfaces.Services.Orders;

/// <summary>
/// Hóa đơn và món gọi (07 §2.8–2.14): gọi món, gửi bếp, ra món, hủy món, chuyển/gộp bàn, chuyển món, tạm tính,
/// giảm giá, tách, chia đều, thu tiền, hủy hóa đơn. Mọi thao tác thay đổi trả DTO mới; thao tác có <c>version</c> kiểm
/// khóa lạc quan (07 §3.6), thao tác có <c>clientRequestId</c> chống bấm lặp (07 §3.7).
/// </summary>
public interface IOrderService
{
    /// <summary>Tra cứu (FR-33); không có <c>orders.checkout</c> chỉ thấy hóa đơn DangMo, DangThu.</summary>
    Task<PaginatedResult<OrderListItem>> GetPagedAsync(OrderQuery query, CancellationToken ct = default);

    /// <summary>Không có <c>orders.checkout</c> mà hóa đơn đã đóng → 403.</summary>
    Task<OrderDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<OrderDto> AddItemAsync(Guid orderId, AddItemRequest request, CancellationToken ct = default);

    Task<OrderDto> UpdateDraftItemAsync(Guid orderId, Guid itemId, UpdateDraftItemRequest request, CancellationToken ct = default);

    Task<OrderDto> DeleteDraftItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default);

    /// <summary>Gửi bếp (FR-13, BR-09); cùng <c>clientRequestId</c> → kết quả cũ, không tạo phiếu (TC-15).</summary>
    Task<SendResultDto> SendAsync(Guid orderId, SendToKitchenRequest request, CancellationToken ct = default);

    Task<OrderDto> ServeItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default);

    Task<OrderDto> ServeAllAsync(Guid orderId, CancellationToken ct = default);

    Task<OrderDto> UnserveItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default);

    /// <summary>Hủy món đã gửi (UC-08, BR-13).</summary>
    Task<OrderDto> CancelItemAsync(Guid orderId, Guid itemId, CancelItemRequest request, CancellationToken ct = default);

    /// <summary>Đóng bàn mở nhầm (BR-03, TC-10).</summary>
    Task<OrderDto> CloseAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default);

    /// <summary>Chuyển bàn (FR-22, BR-15).</summary>
    Task<OrderDto> TransferAsync(Guid orderId, TransferRequest request, CancellationToken ct = default);

    /// <summary>Gộp các bàn vào bàn của hóa đơn này (FR-23, BR-16).</summary>
    Task<OrderDto> MergeAsync(Guid orderId, MergeRequest request, CancellationToken ct = default);

    /// <summary>Chuyển món (FR-24, BR-17).</summary>
    Task<MoveItemsResultDto> MoveItemsAsync(Guid orderId, MoveItemsRequest request, CancellationToken ct = default);

    /// <summary>In tạm tính (FR-27); bàn → ChoThanhToan.</summary>
    Task<OrderDto> PrebillAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default);

    /// <summary>Giảm giá (FR-29, BR-08).</summary>
    Task<OrderDto> SetDiscountAsync(Guid orderId, DiscountRequest request, CancellationToken ct = default);

    Task<OrderDto> RemoveDiscountAsync(Guid orderId, int version, CancellationToken ct = default);

    /// <summary>Tách theo món (FR-25, BR-18): hóa đơn gốc trước, rồi các hóa đơn mới.</summary>
    Task<IReadOnlyList<OrderDto>> SplitAsync(Guid orderId, SplitOrderRequest request, CancellationToken ct = default);

    /// <summary>Chia đều (FR-26, BR-19).</summary>
    Task<OrderDto> SplitEqualAsync(Guid orderId, SplitEqualRequest request, CancellationToken ct = default);

    Task<OrderDto> CancelSplitEqualAsync(Guid orderId, int version, CancellationToken ct = default);

    /// <summary>Ghi một lượt thu (FR-30, BR-20); cùng <c>clientRequestId</c> → kết quả cũ (TC-35).</summary>
    Task<CreatedResult<PaymentResultDto>> AddPaymentAsync(Guid orderId, CreatePaymentRequest request, CancellationToken ct = default);

    /// <summary>Chốt hóa đơn đã đủ tiền nhờ tiền cọc (BR-25).</summary>
    Task<OrderDto> CompleteAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default);

    /// <summary>Hủy hóa đơn đã thanh toán trong ngày (FR-33, BR-23, TC-40).</summary>
    Task<OrderDto> CancelPaidAsync(Guid orderId, CancelOrderRequest request, CancellationToken ct = default);

    /// <summary>Dòng món Xong gom theo hóa đơn, xong sớm nhất trước (UC-07).</summary>
    Task<IReadOnlyList<ReadyGroupDto>> GetReadyItemsAsync(ReadyItemsQuery query, CancellationToken ct = default);
}

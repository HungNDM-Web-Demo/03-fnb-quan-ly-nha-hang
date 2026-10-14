using Application.DTOs.Kitchen;

namespace Application.Interfaces.Services.Kitchen;

/// <summary>
/// Màn hình bếp (UC-06, UC-04 1a, 07 §2.10). Thao tác bếp không đổi <c>version</c> của hóa đơn, trừ báo hết món
/// (đổi tiền món).
/// </summary>
public interface IKitchenService
{
    Task<KitchenBoardDto> GetBoardAsync(KitchenBoardQuery query, CancellationToken ct = default);

    /// <summary>Chế độ tổng hợp (FR-18).</summary>
    Task<IReadOnlyList<KitchenSummaryItem>> GetSummaryAsync(KitchenSummaryQuery query, CancellationToken ct = default);

    Task<KitchenTicketDto> StartAsync(Guid ticketId, Guid itemId, CancellationToken ct = default);

    Task<KitchenTicketDto> DoneAsync(Guid ticketId, Guid itemId, CancellationToken ct = default);

    /// <summary>"Xong cả phiếu" (UC-06 4a).</summary>
    Task<KitchenTicketDto> DoneAllAsync(Guid ticketId, CancellationToken ct = default);

    /// <summary>Hoàn tác Xong → Đang làm (BR-10); món đã ra → 400 MonDaRa (TC-20).</summary>
    Task<KitchenTicketDto> UndoAsync(Guid ticketId, Guid itemId, CancellationToken ct = default);

    /// <summary>Báo hết món đang chờ làm (FR-10, BR-14).</summary>
    Task<KitchenTicketDto> OutOfStockAsync(Guid ticketId, Guid itemId, CancellationToken ct = default);

    /// <summary>"Đã biết" món hủy (BR-13).</summary>
    Task<KitchenTicketDto> AcknowledgeAsync(Guid ticketId, Guid itemId, CancellationToken ct = default);
}

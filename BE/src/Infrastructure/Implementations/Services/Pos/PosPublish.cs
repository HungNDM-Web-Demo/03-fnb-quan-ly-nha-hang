using Application.Interfaces.Services.Realtime;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;

namespace Infrastructure.Implementations.Services.Pos;

/// <summary>Phát các sự kiện thời gian thực (07 §2.18) với payload đúng hình dạng hợp đồng.</summary>
internal static class PosPublish
{
    public static Task TablesChangedAsync(this IPosEventPublisher publisher, IEnumerable<Guid> tableIds, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.TablesChanged, new { tableIds = tableIds.Distinct().ToArray() }, ct);

    public static Task OrderChangedAsync(this IPosEventPublisher publisher, Order order, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.OrderChanged, new { orderId = order.Id, tableId = order.TableId, version = order.Version }, ct);

    public static Task KitchenChangedAsync(
        this IPosEventPublisher publisher,
        IEnumerable<Guid> ticketIds,
        IEnumerable<KitchenStation> stations,
        IEnumerable<Guid>? newTicketIds,
        CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.KitchenChanged, new
        {
            ticketIds = ticketIds.Distinct().ToArray(),
            stations = stations.Distinct().ToArray(),
            newTicketIds = (newTicketIds ?? []).Distinct().ToArray()
        }, ct);

    public static Task ItemsReadyAsync(this IPosEventPublisher publisher, Order order, string tableCode, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.ItemsReady, new
        {
            tableId = order.TableId,
            tableCode,
            orderId = order.Id,
            waiterId = order.WaiterId,
            count = order.Items.Count(i => i.IsReady)
        }, ct);

    public static Task MenuChangedAsync(this IPosEventPublisher publisher, IEnumerable<Guid> menuItemIds, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.MenuChanged, new { menuItemIds = menuItemIds.Distinct().ToArray() }, ct);

    public static Task ReservationsChangedAsync(this IPosEventPublisher publisher, IEnumerable<Guid> reservationIds, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.ReservationsChanged, new { reservationIds = reservationIds.Distinct().ToArray() }, ct);

    public static Task ItemCancelledAsync(this IPosEventPublisher publisher, string tableCode, string itemName, Guid waiterId, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.ItemCancelled, new { tableCode, itemName, waiterId }, ct);

    public static Task ItemOutOfStockAsync(this IPosEventPublisher publisher, string tableCode, string itemName, Guid waiterId, CancellationToken ct) =>
        publisher.PublishAsync(PosEvents.ItemOutOfStock, new
        {
            tableCode,
            itemName,
            waiterId,
            message = $"{tableCode}: {itemName} đã hết, mời khách đổi món"
        }, ct);
}

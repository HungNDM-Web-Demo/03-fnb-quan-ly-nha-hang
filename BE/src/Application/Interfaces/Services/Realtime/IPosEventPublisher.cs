namespace Application.Interfaces.Services.Realtime;

/// <summary>
/// Đẩy sự kiện thời gian thực tới mọi người dùng đã đăng nhập (SignalR <c>/hubs/pos</c>, 07 §2.18, NFR-03).
/// Service gọi sau khi lưu xong; FE tự lọc theo <c>waiterId</c>. Bản mặc định không làm gì (test, job nền);
/// tầng API thay bằng bản SignalR.
/// </summary>
public interface IPosEventPublisher
{
    Task PublishAsync(string eventName, object payload, CancellationToken ct = default);
}

/// <summary>Tên sự kiện (07 §2.18), payload camelCase.</summary>
public static class PosEvents
{
    /// <summary><c>{ tableIds }</c>.</summary>
    public const string TablesChanged = "tables-changed";

    /// <summary><c>{ orderId, tableId, version }</c>.</summary>
    public const string OrderChanged = "order-changed";

    /// <summary><c>{ ticketIds, stations, newTicketIds }</c>.</summary>
    public const string KitchenChanged = "kitchen-changed";

    /// <summary><c>{ tableId, tableCode, orderId, waiterId, count }</c>.</summary>
    public const string ItemsReady = "items-ready";

    /// <summary><c>{ tableCode, itemName, waiterId, message }</c>.</summary>
    public const string ItemOutOfStock = "item-out-of-stock";

    /// <summary><c>{ tableCode, itemName, waiterId }</c>.</summary>
    public const string ItemCancelled = "item-cancelled";

    /// <summary><c>{ menuItemIds }</c>.</summary>
    public const string MenuChanged = "menu-changed";

    /// <summary><c>{ reservationIds }</c>.</summary>
    public const string ReservationsChanged = "reservations-changed";
}

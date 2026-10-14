using System.Text.Json;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;

namespace Infrastructure.Persistence.Seeders;

// Hình dạng của FE/src/mock/seed/demo-data.json (06 §5.2), nguồn duy nhất cho FE mock và DemoDataSeeder.
// Hóa đơn ghi bằng khóa gọn (06 §5.4): giờ là chuỗi "HH:mm" (ngày lịch sử, theo ô ngày d) hoặc số phút so với lúc nạp
// (hôm nay, liveOrders) nên các trường giờ đọc thành JsonElement rồi seeder tự đổi.

internal sealed class RestaurantSeedFile
{
    public List<AreaSeed>? Areas { get; init; }
    public List<TableSeed>? Tables { get; init; }
    public List<CategorySeed>? Categories { get; init; }
    public List<MenuItemSeed>? MenuItems { get; init; }
    public List<QuickNoteSeed>? QuickNotes { get; init; }
    public List<ReservationSeed>? Reservations { get; init; }
    public List<OrderSeed>? LiveOrders { get; init; }
    public List<PastReservationSeed>? PastReservations { get; init; }
    public List<OrderSeed>? Orders { get; init; }
}

internal sealed class AreaSeed
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

internal sealed class TableSeed
{
    public string Code { get; init; } = string.Empty;

    /// <summary>Mã khu vực.</summary>
    public string Area { get; init; } = string.Empty;

    public int Capacity { get; init; }
    public TableShape Shape { get; init; }
    public int X { get; init; }
    public int Y { get; init; }
}

internal sealed class CategorySeed
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Color { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

internal sealed class MenuItemSeed
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;

    /// <summary>Mã danh mục.</summary>
    public string Category { get; init; } = string.Empty;

    public string Unit { get; init; } = string.Empty;
    public PricingType Pricing { get; init; }
    public decimal Price { get; init; }
    public KitchenStation Station { get; init; }
    public int? PrepMinutes { get; init; }

    /// <summary>Tên file trong FE/public/seed/menu/.</summary>
    public string? Image { get; init; }

    public string? Description { get; init; }
    public bool? SoldOut { get; init; }
    public bool? Hidden { get; init; }
    public int SortOrder { get; init; }
}

internal sealed class QuickNoteSeed
{
    public string Content { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

/// <summary>Đặt bàn viết tay (hôm nay, sắp tới).</summary>
internal sealed class ReservationSeed
{
    public string Key { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;

    /// <summary><c>dayOffset:N@HH:mm</c>.</summary>
    public string? Arrival { get; init; }

    /// <summary>Số phút so với lúc nạp, làm tròn xuống bội số 5 phút.</summary>
    public int? ArrivalIn { get; init; }

    public int Guests { get; init; }
    public string Table { get; init; } = string.Empty;
    public decimal Deposit { get; init; }
    public string? Note { get; init; }
    public ReservationStatus Status { get; init; }

    /// <summary><c>dayOffset:N@HH:mm</c>.</summary>
    public string Created { get; init; } = string.Empty;

    public ReservationCancelSeed? Cancelled { get; init; }
}

internal sealed class ReservationCancelSeed
{
    public string At { get; init; } = string.Empty;
    public string? By { get; init; }
    public string? Reason { get; init; }
}

/// <summary>Đặt bàn đã qua (sinh bằng script), ngày theo ô ngày <c>d</c>.</summary>
internal sealed class PastReservationSeed
{
    public string Key { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public int D { get; init; }
    public string T { get; init; } = string.Empty;
    public int Guests { get; init; }
    public string Table { get; init; } = string.Empty;
    public decimal Deposit { get; init; }
    public ReservationStatus Status { get; init; }

    /// <summary>Tạo trước ngày đến bao nhiêu ngày.</summary>
    public int Cb { get; init; }

    /// <summary>Giờ tạo HH:mm.</summary>
    public string Ct { get; init; } = string.Empty;

    public PastReservationCancelSeed? Cx { get; init; }
}

internal sealed class PastReservationCancelSeed
{
    public string T { get; init; } = string.Empty;
    public string? By { get; init; }
    public string? Reason { get; init; }
}

/// <summary>Hóa đơn khóa gọn (06 §5.4).</summary>
internal sealed class OrderSeed
{
    public string? Key { get; init; }

    /// <summary>Ô ngày (06 §5.3); liveOrders không có, coi là 0.</summary>
    public int? D { get; init; }

    public JsonElement O { get; init; }
    public string Tb { get; init; } = string.Empty;
    public int G { get; init; }
    public string W { get; init; } = string.Empty;
    public string? Rv { get; init; }

    /// <summary>Lần gọi: <c>[giờ gửi, [món…], { from? }]</c>; món <c>[mã, số lượng, phút chế biến?, { s?, n?, qn?, r?, cx? }]</c>.</summary>
    public List<JsonElement>? B { get; init; }

    public JsonElement? C { get; init; }
    public string? Cs { get; init; }

    /// <summary>Lượt thu <c>[phương thức, số tiền | null, thêm?]</c>.</summary>
    public List<JsonElement>? Pm { get; init; }

    public DiscountSeed? Dc { get; init; }
    public OrderCancelSeed? Cx { get; init; }
    public JsonElement? Mx { get; init; }
    public JsonElement? Pb { get; init; }
    public bool? Cd { get; init; }
    public List<MergedTableSeed>? Mg { get; init; }
}

internal sealed class DiscountSeed
{
    public DiscountType Type { get; init; }
    public decimal Value { get; init; }
    public string Reason { get; init; } = string.Empty;

    /// <summary>Người duyệt khi vượt hạn mức.</summary>
    public string? By { get; init; }
}

internal sealed class OrderCancelSeed
{
    public JsonElement At { get; init; }
    public string By { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
}

internal sealed class MergedTableSeed
{
    public string Tb { get; init; } = string.Empty;
    public int G { get; init; }
    public JsonElement O { get; init; }
    public string W { get; init; } = string.Empty;
    public JsonElement At { get; init; }
}

/// <summary>Phần thêm của món: hủy món <c>cx</c>.</summary>
internal sealed class ItemCancelSeed
{
    public CancelReason R { get; init; }
    public string By { get; init; } = string.Empty;
    public string? Ap { get; init; }
    public OrderItemStatus St { get; init; }

    /// <summary>Phút sau giờ gửi.</summary>
    public int M { get; init; }

    public string? Nt { get; init; }
}

internal sealed class ItemExtraSeed
{
    public OrderItemStatus? S { get; init; }
    public string? N { get; init; }
    public List<string>? Qn { get; init; }
    public bool? R { get; init; }
    public ItemCancelSeed? Cx { get; init; }
}

internal sealed class BatchExtraSeed
{
    public string? From { get; init; }
}

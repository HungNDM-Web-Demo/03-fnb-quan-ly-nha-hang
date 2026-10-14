using System.Globalization;
using System.Text.Json;
using Application.Common.Time;
using Domain.Base;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;
using Infrastructure.Implementations.Services.Menu;
using Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Infrastructure.Persistence.Seeders;

/// <summary>
/// Dữ liệu nghiệp vụ mẫu của Nhà hàng Sen Quê (bảng <c>Pos_*</c>), đọc từ <c>FE/src/mock/seed/demo-data.json</c>
/// (nguồn duy nhất, FE mock nạp cùng file; cấu trúc, khóa gọn và cách suy ra trường: 06 §5).
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item><c>now</c> = lúc nạp làm tròn xuống tới phút; giờ dạng số là <c>now + N phút</c>, giờ <c>HH:mm</c> là giờ Việt Nam của
/// ngày thật ứng với ô ngày (<see cref="SeedSlots.DayOffsetOfSlot"/>).</item>
/// <item>Món gọi chụp giá hiện tại của thực đơn; tiền hóa đơn tính lại bằng <see cref="OrderPricing"/> (07 §3), phí phục vụ 5%,
/// thuế 8%; mốc giờ món, phiếu bếp, lượt thu suy ra theo 06 §5.4.</item>
/// <item>Mã hóa đơn theo (giờ mở, mã bàn) trong ngày; số phiếu bếp theo (giờ gửi, mã hóa đơn, khu chế biến) trong ngày;
/// mã đặt bàn theo (giờ tạo, khóa) trong ngày tạo.</item>
/// </list>
/// Số liệu phải khớp 06 §5.7 (test <c>RestaurantSeedTests</c>).
/// </remarks>
public sealed class DemoDataSeeder(
    AppDbContext db,
    TimeProvider timeProvider,
    IOptions<FileStorageOptions> fileStorageOptions,
    ILogger<DemoDataSeeder> logger) : IDemoDataSeeder
{
    public const string SeedFileName = "demo-data.json";

    private const string ImageFolder = "/seed/menu/";
    private const int MasterDataDaysAgo = 100;
    private static readonly TimeSpan MasterDataTime = new(8, 0, 0);

    private static readonly JsonSerializerOptions ElementOptions = SeedJson.CreateOptions(TimeProvider.System);

    public async Task<bool> HasDataAsync(CancellationToken ct = default) =>
        await db.Set<Area>().IgnoreQueryFilters().AnyAsync(ct) || await db.Set<Order>().AnyAsync(ct);

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var seed = SeedJson.Read<RestaurantSeedFile>(SeedFileName, timeProvider);
        var context = new SeedContext(timeProvider, await LoadUsersAsync(ct), await LoadStoreAsync(ct));

        var masterCreatedAt = SeedDates.DaysAgo(timeProvider, MasterDataDaysAgo, MasterDataTime);
        var areas = SeedAreas(seed.Areas ?? [], masterCreatedAt);
        var tables = SeedTables(seed.Tables ?? [], areas, masterCreatedAt);
        var categories = SeedCategories(seed.Categories ?? [], masterCreatedAt);
        var menu = SeedMenuItems(seed.MenuItems ?? [], categories, masterCreatedAt);
        SeedQuickNotes(seed.QuickNotes ?? [], masterCreatedAt);
        await db.SaveChangesAsync(ct);

        var reservations = SeedReservations(seed.Reservations ?? [], seed.PastReservations ?? [], tables, context);
        await db.SaveChangesAsync(ct);

        var built = BuildOrders(seed, tables, menu, reservations, context);
        await db.SaveChangesAsync(ct);

        // Liên kết đặt bàn "Đã nhận bàn" với hóa đơn sau khi cả hai đã có (tránh vòng khóa ngoại khi chèn).
        foreach (var (key, order) in built.ByReservationKey)
        {
            if (reservations.TryGetValue(key, out var reservation) && reservation.Status == ReservationStatus.DaNhanBan)
                reservation.LinkSeedOrder(order.Id, order.OpenedAt);
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "Đã nạp dữ liệu mẫu nhà hàng: {Tables} bàn, {Items} món, {Orders} hóa đơn, {Lines} món gọi, {Tickets} phiếu bếp, {Payments} lượt thu, {Reservations} đặt bàn.",
            tables.Count, menu.Count, built.Orders.Count, built.Orders.Sum(o => o.Items.Count), built.Tickets.Count,
            built.Orders.Sum(o => o.Payments.Count), reservations.Count);
    }

    public async Task ClearAsync(CancellationToken ct = default)
    {
        // Bảng con trước, bảng cha sau; gỡ khóa ngoại vòng (đặt bàn ↔ hóa đơn) và tự tham chiếu trước khi xóa.
        await db.Set<Reservation>().ExecuteUpdateAsync(s => s.SetProperty(r => r.OrderId, r => null), ct);
        await db.Set<Order>().ExecuteUpdateAsync(s => s
            .SetProperty(o => o.MergedIntoOrderId, o => null)
            .SetProperty(o => o.SplitFromOrderId, o => null)
            .SetProperty(o => o.ReservationId, o => null), ct);
        await db.Set<Payment>().ExecuteDeleteAsync(ct);
        await db.Set<OrderItem>().ExecuteDeleteAsync(ct);
        await db.Set<KitchenTicket>().ExecuteDeleteAsync(ct);
        await db.Set<Order>().ExecuteDeleteAsync(ct);
        await db.Set<Reservation>().ExecuteDeleteAsync(ct);
        await db.Set<DiningTable>().IgnoreQueryFilters().ExecuteUpdateAsync(s => s.SetProperty(t => t.MergedIntoTableId, t => null), ct);
        await db.Set<DiningTable>().IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await db.Set<Area>().IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await db.Set<MenuItem>().IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await db.Set<Category>().IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await db.Set<QuickNote>().ExecuteDeleteAsync(ct);

        DeleteUploadedImages();
    }

    // ---------- Thực đơn, khu vực, bàn ----------

    private Dictionary<string, Area> SeedAreas(List<AreaSeed> items, DateTime createdAt)
    {
        var result = new Dictionary<string, Area>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var area = Area.Create(item.Code, item.Name, item.SortOrder);
            Add(area, createdAt);
            result[area.Code] = area;
        }

        return result;
    }

    private Dictionary<string, DiningTable> SeedTables(List<TableSeed> items, Dictionary<string, Area> areas, DateTime createdAt)
    {
        var result = new Dictionary<string, DiningTable>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var area = areas.GetValueOrDefault(item.Area) ?? throw Invalid($"bàn '{item.Code}' trỏ tới khu vực '{item.Area}' không có.");
            var table = DiningTable.Create(item.Code, area.Id, item.Capacity, item.Shape, item.X, item.Y);
            Add(table, createdAt);
            result[table.Code] = table;
        }

        return result;
    }

    private Dictionary<string, Category> SeedCategories(List<CategorySeed> items, DateTime createdAt)
    {
        var result = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var category = Category.Create(item.Code, item.Name, item.Color, item.SortOrder);
            Add(category, createdAt);
            result[category.Code] = category;
        }

        return result;
    }

    private Dictionary<string, MenuItem> SeedMenuItems(List<MenuItemSeed> items, Dictionary<string, Category> categories, DateTime createdAt)
    {
        var result = new Dictionary<string, MenuItem>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var category = categories.GetValueOrDefault(item.Category)
                ?? throw Invalid($"món '{item.Code}' trỏ tới danh mục '{item.Category}' không có.");
            var menuItem = MenuItem.Create(
                item.Code, item.Name, category.Id, item.Description, item.Unit, item.Pricing, item.Price, item.Station,
                item.PrepMinutes, item.SortOrder);
            if (!string.IsNullOrWhiteSpace(item.Image))
                menuItem.SetImage(ImageFolder + item.Image.Trim());
            menuItem.SetSoldOut(item.SoldOut ?? false);
            menuItem.SetHidden(item.Hidden ?? false);
            Add(menuItem, createdAt);
            result[menuItem.Code] = menuItem;
        }

        return result;
    }

    private void SeedQuickNotes(List<QuickNoteSeed> items, DateTime createdAt)
    {
        foreach (var item in items)
            Add(QuickNote.Create(item.Content, item.SortOrder), createdAt);
    }

    // ---------- Đặt bàn ----------

    private Dictionary<string, Reservation> SeedReservations(
        List<ReservationSeed> handwritten,
        List<PastReservationSeed> generated,
        Dictionary<string, DiningTable> tables,
        SeedContext context)
    {
        var rows = new List<(string Key, Reservation Reservation, DateTime CreatedAt)>();

        foreach (var item in handwritten)
        {
            var table = Table(tables, item.Table, item.Key);
            DateTime arrival;
            if (item.ArrivalIn is { } minutes)
            {
                // 06 §5.2: now + arrivalIn phút rồi làm tròn xuống bội số 5 phút.
                arrival = context.Now.AddMinutes(minutes);
                arrival = arrival.AddMinutes(-(arrival.Minute % 5));
            }
            else
            {
                arrival = SeedDates.Parse(item.Arrival ?? throw Invalid($"đặt bàn '{item.Key}' thiếu giờ đến."), timeProvider);
            }

            var reservation = Reservation.Create(string.Empty, item.Name, item.Phone, arrival, item.Guests, table.Id, item.Note, item.Deposit);
            ApplySeedStatus(reservation, item.Status);
            if (item.Cancelled is { } cancelled)
            {
                var by = cancelled.By is null ? null : context.User(cancelled.By);
                reservation.SetSeedCancelled(cancelled.Reason, by is null ? null : (by.Id, by.FullName), SeedDates.Parse(cancelled.At, timeProvider));
            }

            rows.Add((item.Key, reservation, SeedDates.Parse(item.Created, timeProvider)));
        }

        foreach (var item in generated)
        {
            var table = Table(tables, item.Table, item.Key);
            var arrival = context.At(item.D, item.T);
            var reservation = Reservation.Create(string.Empty, item.Name, item.Phone, arrival, item.Guests, table.Id, null, item.Deposit);
            ApplySeedStatus(reservation, item.Status);
            if (item.Cx is { } cancelled)
            {
                var by = cancelled.By is null ? null : context.User(cancelled.By);
                reservation.SetSeedCancelled(cancelled.Reason, by is null ? null : (by.Id, by.FullName), context.AtDate(context.SlotDate(item.D).AddDays(-1), cancelled.T));
            }

            rows.Add((item.Key, reservation, context.AtDate(context.SlotDate(item.D).AddDays(-item.Cb), item.Ct)));
        }

        // Mã DB + yyMMdd ngày tạo + số thứ tự theo (giờ tạo, khóa) trên cả 50 đặt bàn (06 §5.2).
        foreach (var day in rows.GroupBy(r => VietnamDates.DateOf(r.CreatedAt)))
        {
            var sequence = 0;
            foreach (var row in day.OrderBy(r => r.CreatedAt).ThenBy(r => r.Key, StringComparer.Ordinal))
                row.Reservation.AssignCode(Implementations.Services.Pos.PosCodes.ReservationCode(day.Key, ++sequence));
        }

        foreach (var row in rows)
            Add(row.Reservation, row.CreatedAt, row.Reservation.CancelledAt);

        return rows.ToDictionary(r => r.Key, r => r.Reservation, StringComparer.Ordinal);
    }

    private static void ApplySeedStatus(Reservation reservation, ReservationStatus status)
    {
        // "Đã nhận bàn" liên kết hóa đơn sau; "Đã hủy" ghi khi đọc phần hủy.
        if (status is ReservationStatus.ChoDen or ReservationStatus.KhongDen)
            reservation.SetSeedStatus(status);
        else if (status == ReservationStatus.DaNhanBan)
            reservation.SetSeedStatus(ReservationStatus.DaNhanBan);
        else
            reservation.SetSeedStatus(ReservationStatus.DaHuy);
    }

    // ---------- Hóa đơn, món gọi, phiếu bếp, lượt thu ----------

    private sealed class BuiltOrders
    {
        public List<Order> Orders { get; } = [];
        public List<KitchenTicket> Tickets { get; } = [];
        public Dictionary<string, Order> ByReservationKey { get; } = new(StringComparer.Ordinal);
    }

    private sealed record PendingTicket(KitchenTicket Ticket, Order CodeOwner);

    private sealed record OrderPlan(OrderSeed Seed, Order Order, DiningTable Table, string TableCode, int Index);

    private BuiltOrders BuildOrders(
        RestaurantSeedFile seed,
        Dictionary<string, DiningTable> tables,
        Dictionary<string, MenuItem> menu,
        Dictionary<string, Reservation> reservations,
        SeedContext context)
    {
        var built = new BuiltOrders();
        var plans = new List<OrderPlan>();
        var pendingTickets = new List<PendingTicket>();
        var tableActions = new List<Action>();
        var index = 0;

        foreach (var entry in (seed.Orders ?? []).Concat(seed.LiveOrders ?? []))
        {
            var d = entry.D ?? 0;
            var table = Table(tables, entry.Tb, entry.Key ?? entry.Tb);
            var waiter = context.User(entry.W);
            var reservation = entry.Rv is null ? null : reservations.GetValueOrDefault(entry.Rv) ?? throw Invalid($"hóa đơn dùng đặt bàn '{entry.Rv}' không có.");
            var openedAt = context.Time(entry.O, d);

            var order = Order.Open(
                string.Empty, table.Id, entry.G, (waiter.Id, waiter.FullName), openedAt, null,
                PosRules.SeedServiceChargeRate, PosRules.SeedVatRate, reservation?.Note, reservation?.Deposit ?? 0, reservation?.Id);
            plans.Add(new OrderPlan(entry, order, table, table.Code, index++));
            built.Orders.Add(order);
            if (entry.Rv is not null)
                built.ByReservationKey[entry.Rv] = order;

            // Bàn phụ đã gộp (06 §5.4 quy tắc 7): hóa đơn DaGop, tiền 0, món đã ở hóa đơn chính.
            var secondaries = new Dictionary<string, (Order Order, int Batches)>(StringComparer.OrdinalIgnoreCase);
            foreach (var merged in entry.Mg ?? [])
            {
                var mergedTable = Table(tables, merged.Tb, entry.Key ?? entry.Tb);
                var mergedWaiter = context.User(merged.W);
                var secondary = Order.Open(
                    string.Empty, mergedTable.Id, merged.G, (mergedWaiter.Id, mergedWaiter.FullName), context.Time(merged.O, d), null,
                    PosRules.SeedServiceChargeRate, PosRules.SeedVatRate);
                plans.Add(new OrderPlan(entry, secondary, mergedTable, mergedTable.Code, index++));
                built.Orders.Add(secondary);
                secondaries[mergedTable.Code] = (secondary, 0);
            }

            BuildItems(entry, d, order, table, secondaries, menu, context, pendingTickets);

            foreach (var merged in entry.Mg ?? [])
            {
                var (secondary, batches) = secondaries[merged.Tb];
                var mergedAt = context.Time(merged.At, d);
                secondary.SetSeedBatchCount(batches);
                secondary.MarkMerged(order.Id, mergedAt);
                var mergedTable = tables[merged.Tb];
                tableActions.Add(() => mergedTable.SetStatus(TableStatus.DaGop, mergedAt, table.Id));
            }

            if (entry.Dc is { } discount)
            {
                var approver = discount.By is null ? null : context.User(discount.By);
                order.SetDiscount(discount.Type, discount.Value, discount.Reason, approver is null ? null : (approver.Id, approver.Username));
            }

            order.Recalculate();
        }

        // Mã hóa đơn: HD + yyMMdd ngày mở + số thứ tự theo (giờ mở, mã bàn) trên mọi hóa đơn mở cùng ngày (06 §5.4 quy tắc 5).
        foreach (var day in plans.GroupBy(p => VietnamDates.DateOf(p.Order.OpenedAt)))
        {
            var sequence = 0;
            foreach (var plan in day.OrderBy(p => p.Order.OpenedAt).ThenBy(p => p.TableCode, StringComparer.Ordinal).ThenBy(p => p.Index))
                plan.Order.AssignCode(Implementations.Services.Pos.PosCodes.OrderCode(day.Key, ++sequence));
        }

        // Trạng thái, lượt thu của hóa đơn chính (bàn phụ đã xử lý ở trên).
        foreach (var plan in plans.Where(p => p.Order.MergedIntoOrderId is null))
            FinishOrder(plan, context, tableActions);

        // Số phiếu: đánh theo ngày của giờ gửi, sắp (giờ gửi, mã hóa đơn, khu chế biến) tăng dần (06 §5.4 quy tắc 4).
        foreach (var day in pendingTickets.GroupBy(p => p.Ticket.BusinessDate))
        {
            var number = 0;
            foreach (var pending in day.OrderBy(p => p.Ticket.SentAt)
                         .ThenBy(p => p.CodeOwner.Code, StringComparer.Ordinal)
                         .ThenBy(p => p.Ticket.Station))
            {
                pending.Ticket.Renumber(++number);
            }
        }

        var itemsByTicket = built.Orders.SelectMany(o => o.Items).Where(i => i.KitchenTicketId is not null)
            .GroupBy(i => i.KitchenTicketId!.Value).ToDictionary(g => g.Key, g => g.ToList());
        foreach (var pending in pendingTickets)
        {
            var items = itemsByTicket.GetValueOrDefault(pending.Ticket.Id) ?? [];
            var completedAt = items.Select(i => i.IsCancelled ? i.CancelAcknowledgedAt : i.DoneAt).Where(t => t is not null).DefaultIfEmpty(pending.Ticket.SentAt).Max();
            pending.Ticket.Refresh(items, completedAt ?? pending.Ticket.SentAt);
            built.Tickets.Add(pending.Ticket);
        }

        foreach (var action in tableActions)
            action();

        foreach (var order in built.Orders)
        {
            Add(order, order.OpenedAt, order.CancelledAt ?? order.PaidAt ?? order.MergedAt);
            foreach (var item in order.Items)
                db.Entry(item).Property(e => e.CreatedAt).CurrentValue = item.SentAt ?? order.OpenedAt;
            foreach (var payment in order.Payments)
                db.Entry(payment).Property(e => e.CreatedAt).CurrentValue = payment.PaidAt;
        }

        foreach (var ticket in built.Tickets)
            Add(ticket, ticket.SentAt, ticket.CompletedAt);

        return built;
    }

    /// <summary>Món gọi theo lần gọi (06 §5.4 quy tắc 1–4).</summary>
    private void BuildItems(
        OrderSeed entry,
        int d,
        Order order,
        DiningTable table,
        Dictionary<string, (Order Order, int Batches)> secondaries,
        Dictionary<string, MenuItem> menu,
        SeedContext context,
        List<PendingTicket> pendingTickets)
    {
        var sortOrder = 0;
        foreach (var batch in entry.B ?? [])
        {
            var sentAt = context.Time(batch[0], d);
            var extra = batch.GetArrayLength() > 2 ? batch[2].Deserialize<BatchExtraSeed>(ElementOptions) : null;

            // Lần gọi từ bàn phụ: phiếu thuộc hóa đơn bàn phụ, lần gọi đếm riêng; còn lại tăng lần gọi của hóa đơn chính.
            Order ticketOrder;
            int batchNo;
            string originalTable;
            (Guid Id, string FullName) sender;
            if (extra?.From is { } from)
            {
                var (secondary, batches) = secondaries.GetValueOrDefault(from);
                if (secondary is null)
                    throw Invalid($"hóa đơn bàn {entry.Tb} có lần gửi từ {from} nhưng không có trong mg.");
                batchNo = batches + 1;
                secondaries[from] = (secondary, batchNo);
                ticketOrder = secondary;
                originalTable = from;
                sender = (secondary.WaiterId, secondary.WaiterName);
            }
            else
            {
                batchNo = order.NextBatch();
                ticketOrder = order;
                originalTable = table.Code;
                sender = (order.WaiterId, order.WaiterName);
            }

            var businessDate = VietnamDates.DateOf(sentAt);
            var ticketsByStation = new Dictionary<KitchenStation, KitchenTicket>();
            foreach (var line in batch[1].EnumerateArray())
            {
                var code = line[0].GetString() ?? string.Empty;
                var menuItem = menu.GetValueOrDefault(code) ?? throw Invalid($"hóa đơn dùng món '{code}' không có.");
                var quantity = line[1].GetDecimal();
                int? prep = line.GetArrayLength() > 2 && line[2].ValueKind == JsonValueKind.Number ? line[2].GetInt32() : null;
                var lineExtra = line.GetArrayLength() > 3 ? line[3].Deserialize<ItemExtraSeed>(ElementOptions) : null;

                var item = OrderItem.Draft(order.Id, menuItem, quantity, lineExtra?.N, lineExtra?.Qn, lineExtra?.R ?? false, ++sortOrder);
                KitchenTicket? ticket = null;
                if (menuItem.Station != KitchenStation.KhongQuaBep && !ticketsByStation.TryGetValue(menuItem.Station, out ticket))
                {
                    ticket = KitchenTicket.Create(
                        businessDate, 0, ticketOrder.Id, menuItem.Station, batchNo, (table.Id, table.Code), originalTable, sender, sentAt);
                    ticketsByStation[menuItem.Station] = ticket;
                    pendingTickets.Add(new PendingTicket(ticket, ticketOrder));
                }

                item.Send(batchNo, ticket?.Id, sentAt, null, menuItem.PrepMinutes);
                ApplyItemTimeline(item, lineExtra, prep, sentAt, context);
                order.AddItem(item);
            }
        }
    }

    /// <summary>
    /// Mốc giờ món (06 §5.4 quy tắc 2–3): bắt đầu = gửi + 1 phút khi (trạng thái hoặc trạng thái lúc hủy) là Đang làm, Xong,
    /// Đã phục vụ; xong = gửi + phút chế biến; ra = xong + 2 phút; món không qua bếp xong ngay, ra sau 2 phút; món hủy
    /// lúc gửi + m phút, bếp "Đã biết" sau 1 phút.
    /// </summary>
    private static void ApplyItemTimeline(OrderItem item, ItemExtraSeed? extra, int? prep, DateTime sentAt, SeedContext context)
    {
        var cancel = extra?.Cx;
        var effective = cancel?.St ?? extra?.S ?? OrderItemStatus.DaPhucVu;

        if (item.GoesThroughKitchen)
        {
            if (effective is OrderItemStatus.DangLam or OrderItemStatus.Xong or OrderItemStatus.DaPhucVu)
                item.Start(sentAt.AddMinutes(1));
            if (effective is OrderItemStatus.Xong or OrderItemStatus.DaPhucVu)
                item.Done(sentAt.AddMinutes(prep ?? 1));
            if (effective == OrderItemStatus.DaPhucVu)
                item.Serve(item.DoneAt!.Value.AddMinutes(2));
        }
        else if (effective == OrderItemStatus.DaPhucVu)
        {
            item.Serve(sentAt.AddMinutes(2));
        }

        if (cancel is null)
            return;

        var by = context.User(cancel.By);
        var approver = cancel.Ap is null ? null : context.User(cancel.Ap);
        var cancelledAt = sentAt.AddMinutes(cancel.M);
        item.Cancel(cancel.R, cancel.Nt, cancelledAt, (by.Id, by.FullName, by.Username), approver is null ? null : (approver.Id, approver.Username));
        if (item.GoesThroughKitchen)
            item.AcknowledgeCancel(cancelledAt.AddMinutes(1));
    }

    /// <summary>Trạng thái, lượt thu (06 §5.4 quy tắc 5, 6, 8).</summary>
    private void FinishOrder(OrderPlan plan, SeedContext context, List<Action> tableActions)
    {
        var entry = plan.Seed;
        var order = plan.Order;
        var table = plan.Table;
        var d = entry.D ?? 0;

        if (entry.Mx is { } mistaken)
        {
            var waiter = context.User(entry.W);
            order.CloseMistaken((waiter.Id, waiter.Username), context.Time(mistaken, d));
            return;
        }

        if (order.Deposit > 0)
            order.RegisterPayment(Payment.Deposit(order.Id, Math.Min(order.Deposit, order.Total), order.OpenedAt), order.OpenedAt, null);

        if (entry.C is not { } closedAt)
        {
            // Hóa đơn đang mở: bàn Đang phục vụ, hoặc Chờ thanh toán nếu đã in tạm tính.
            if (entry.Pb is { } prebill)
            {
                var printedAt = context.Time(prebill, d);
                order.PrintPrebill(printedAt);
                tableActions.Add(() => table.SetStatus(TableStatus.ChoThanhToan, printedAt));
            }
            else
            {
                tableActions.Add(() => table.SetStatus(TableStatus.DangPhucVu, order.OpenedAt));
            }

            return;
        }

        var paidAt = context.Time(closedAt, d);
        var cashier = context.User(entry.Cs ?? throw Invalid($"hóa đơn bàn {entry.Tb} thu tiền nhưng thiếu cs."));
        var methods = entry.Pm ?? [];
        for (var i = 0; i < methods.Count; i++)
        {
            var row = methods[i];
            var method = Enum.Parse<PaymentMethod>(row[0].GetString() ?? string.Empty);
            var amount = row.GetArrayLength() > 1 && row[1].ValueKind == JsonValueKind.Number ? row[1].GetDecimal() : order.Remaining;
            var payAt = paidAt.AddMinutes(-(methods.Count - 1 - i));
            JsonElement? extra = row.GetArrayLength() > 2 ? row[2] : null;

            var payment = Payment.Collect(
                order.Id, null, method, amount,
                method == PaymentMethod.TienMat ? extra?.GetDecimal() ?? amount : null,
                method == PaymentMethod.The ? extra?.GetString() : null,
                null,
                method == PaymentMethod.ChuyenKhoan ? context.QrContent(amount, order.Code) : null,
                payAt, cashier.Id, cashier.FullName);
            order.RegisterPayment(payment, i == methods.Count - 1 ? paidAt : payAt, (cashier.Id, cashier.FullName));
        }

        if (order.IsActive)
            order.Complete(paidAt, (cashier.Id, cashier.FullName));
        if (order.PaidAt != paidAt)
            throw Invalid($"hóa đơn {order.Code} thu chưa đủ tiền theo pm.");

        if (entry.Cx is { } cancel)
        {
            var by = context.User(cancel.By);
            order.CancelPaid(cancel.Reason, (by.Id, by.Username), context.Time(cancel.At, d));
        }

        if (entry.Cd == true)
            tableActions.Add(() => table.SetStatus(TableStatus.ChoDon, paidAt));
    }

    // ---------- Tiện ích ----------

    private sealed record SeedUser(Guid Id, string Username, string FullName);

    private sealed record StoreInfo(string BankBin, string BankAccount);

    /// <summary>Đồng hồ nạp và ánh xạ thời gian của khóa gọn (06 §5.3).</summary>
    private sealed class SeedContext
    {
        private readonly Dictionary<string, SeedUser> _users;
        private readonly StoreInfo _store;
        private readonly int _isoToday;

        public SeedContext(TimeProvider timeProvider, Dictionary<string, SeedUser> users, StoreInfo store)
        {
            var utc = timeProvider.GetUtcNow().UtcDateTime;
            Now = new DateTime(utc.Year, utc.Month, utc.Day, utc.Hour, utc.Minute, 0, DateTimeKind.Utc);
            Today = VietnamDates.DateOf(Now);
            _isoToday = SeedSlots.IsoDayOfWeek(Today);
            _users = users;
            _store = store;
        }

        /// <summary>Lúc nạp, làm tròn xuống tới phút.</summary>
        public DateTime Now { get; }

        public DateOnly Today { get; }

        public DateOnly SlotDate(int d) => Today.AddDays(SeedSlots.DayOffsetOfSlot(d, _isoToday));

        /// <summary><c>HH:mm</c> giờ Việt Nam của ngày ứng với ô ngày <paramref name="d"/>, đổi ra UTC.</summary>
        public DateTime At(int d, string hhmm) => AtDate(SlotDate(d), hhmm);

        public DateTime AtDate(DateOnly date, string hhmm) => VietnamDates.StartOfDayUtc(date).AddMinutes(Minutes(hhmm));

        /// <summary>Giờ dạng số là phút so với <see cref="Now"/>; dạng chuỗi là <c>HH:mm</c> của ô ngày.</summary>
        public DateTime Time(JsonElement value, int d) => value.ValueKind switch
        {
            JsonValueKind.Number => Now.AddMinutes(value.GetInt32()),
            JsonValueKind.String => At(d, value.GetString() ?? string.Empty),
            _ => throw Invalid($"giờ '{value}' không phải số phút hoặc HH:mm.")
        };

        public SeedUser User(string username) =>
            _users.GetValueOrDefault(username) ?? throw Invalid($"tài khoản '{username}' không có trong System_Users (project.json).");

        /// <summary>Chuỗi QR chuyển khoản (07 §4): <c>VIETQR|{bankBin}|{bankAccount}|{amount}|{orderCode}</c>.</summary>
        public string QrContent(decimal amount, string orderCode) =>
            $"VIETQR|{_store.BankBin}|{_store.BankAccount}|{amount.ToString("0", CultureInfo.InvariantCulture)}|{orderCode}";

        private static int Minutes(string hhmm)
        {
            var parts = hhmm.Trim().Split(':');
            if (parts.Length != 2
                || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var hour)
                || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var minute))
            {
                throw Invalid($"giờ '{hhmm}' không đúng định dạng HH:mm.");
            }

            return hour * 60 + minute;
        }
    }

    private async Task<Dictionary<string, SeedUser>> LoadUsersAsync(CancellationToken ct) =>
        await db.Set<User>().AsNoTracking()
            .Select(u => new SeedUser(u.Id, u.Username, u.FullName))
            .ToDictionaryAsync(u => u.Username, StringComparer.OrdinalIgnoreCase, ct);

    private async Task<StoreInfo> LoadStoreAsync(CancellationToken ct)
    {
        var settings = await db.Settings.AsNoTracking()
            .Where(s => s.Key.StartsWith("Store."))
            .ToDictionaryAsync(s => s.Key, s => s.Value, StringComparer.OrdinalIgnoreCase, ct);
        return new StoreInfo(settings.GetValueOrDefault("Store.BankBin") ?? string.Empty, settings.GetValueOrDefault("Store.BankAccount") ?? string.Empty);
    }

    private static DiningTable Table(Dictionary<string, DiningTable> tables, string code, string owner) =>
        tables.GetValueOrDefault(code) ?? throw Invalid($"'{owner}' trỏ tới bàn '{code}' không có.");

    /// <summary>Thêm entity với ngày tạo, ngày sửa gán sẵn; interceptor giữ nguyên giá trị đã gán khi thêm mới.</summary>
    private void Add(BaseEntity entity, DateTime createdAt, DateTime? updatedAt = null)
    {
        var entry = db.Add((object)entity);
        entry.Property(nameof(BaseEntity.CreatedAt)).CurrentValue = createdAt;
        entry.Property(nameof(BaseEntity.UpdatedAt)).CurrentValue = updatedAt;
    }

    /// <summary>Xóa ảnh món đã tải lên (<c>wwwroot/uploads/menu</c>); ảnh mẫu <c>/seed/...</c> nằm ở FE nên không đụng tới.</summary>
    private void DeleteUploadedImages()
    {
        var folder = Path.Combine(fileStorageOptions.Value.RootPath, MenuItemService.UploadFolder);
        try
        {
            if (Directory.Exists(folder))
                Directory.Delete(folder, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Không xóa được thư mục ảnh tải lên {Folder}.", folder);
        }
    }

    private static InvalidOperationException Invalid(string message) =>
        new($"Dữ liệu seed không hợp lệ (FE/src/mock/seed/{SeedFileName}): {message}");
}

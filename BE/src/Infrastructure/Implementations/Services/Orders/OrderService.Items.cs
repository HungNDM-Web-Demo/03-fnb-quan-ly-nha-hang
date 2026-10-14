using Application.Common.Exceptions;
using Application.Constants;
using Application.DTOs.Orders;
using Application.Common.Time;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Orders;

// Gọi món, gửi bếp, ra món, hủy món, đóng bàn mở nhầm (UC-02 5a, UC-05, UC-07, UC-08; 07 §2.8).
public sealed partial class OrderService
{
    public const string MenuItemUnavailableMessage = "Món không còn trong thực đơn";

    public async Task<OrderDto> AddItemAsync(Guid orderId, AddItemRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();

        var menuItem = await menuItems.QueryNoTracking().FirstOrDefaultAsync(m => m.Id == request.MenuItemId, ct);
        if (menuItem is null || menuItem.IsHidden)
            throw FieldErrors.Single("menuItemId", MenuItemUnavailableMessage);
        if (menuItem.IsSoldOut)
            throw PosErrors.Business(PosErrors.MonTamHet, $"{menuItem.Name} đang tạm hết");
        if (!PosRules.IsValidQuantity(menuItem.PricingType, request.Quantity))
            throw FieldErrors.Single("quantity", PosRules.QuantityMessage(menuItem.PricingType));

        // UC-05 2a: món theo suất trùng dòng nháp cùng ghi chú, cùng ghi chú nhanh, cùng "Gấp" thì cộng số lượng.
        var quickNotes = OrderItem.NormalizeQuickNotes(request.QuickNotes);
        var isRush = request.IsRush ?? false;
        var existing = menuItem.PricingType == PricingType.TheoSuat
            ? order.Items.FirstOrDefault(i => i.CanMergeDraft(menuItem.Id, request.Note, quickNotes, isRush))
            : null;

        if (existing is not null)
        {
            if (!PosRules.IsValidQuantity(menuItem.PricingType, existing.Quantity + request.Quantity))
                throw FieldErrors.Single("quantity", PosRules.QuantityMessage(menuItem.PricingType));
            existing.AddQuantity(request.Quantity);
        }
        else
        {
            var item = OrderItem.Draft(order.Id, menuItem, request.Quantity, request.Note, quickNotes, isRush, order.NextSortOrder());
            order.AddItem(item);
            await orderItems.AddAsync(item, ct);
        }

        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> UpdateDraftItemAsync(Guid orderId, Guid itemId, UpdateDraftItemRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        var item = FindItem(order, itemId);
        if (!item.IsDraft)
            throw new DomainException("Chỉ sửa được món chưa gửi bếp");
        if (!PosRules.IsValidQuantity(item.PricingType, request.Quantity))
            throw FieldErrors.Single("quantity", PosRules.QuantityMessage(item.PricingType));

        item.UpdateDraft(request.Quantity, request.Note, request.QuickNotes, request.IsRush);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> DeleteDraftItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        var item = FindItem(order, itemId);
        if (!item.IsDraft)
            throw new DomainException("Món đã gửi bếp, dùng Hủy món");

        // BR-13, TC-25: món "Chưa gửi" xóa hẳn, không lưu.
        order.RemoveItem(item);
        orderItems.Delete(item);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<SendResultDto> SendAsync(Guid orderId, SendToKitchenRequest request, CancellationToken ct = default)
    {
        var requestId = request.ClientRequestId.Trim();
        if (await RepeatedSendAsync(orderId, requestId, ct) is { } repeated)
            return repeated;

        var order = await LoadAsync(orderId, ct);

        // TC-15: lần bấm trước vừa lưu xong sau bước kiểm ở trên → trả kết quả cũ thay vì 409 DuLieuCu (07 §3.7).
        if (order.Items.Any(i => i.SendRequestId == requestId) && await RepeatedSendAsync(orderId, requestId, ct) is { } justSent)
            return justSent;

        order.EnsureEditable();
        CheckVersion(order, request.Version);

        var drafts = order.Items.Where(i => i.IsDraft).OrderBy(i => i.SortOrder).ToList();
        var menuIds = drafts.Select(i => i.MenuItemId).Distinct().ToList();
        var menu = await menuItems.QueryNoTracking().IgnoreQueryFilters().Where(m => menuIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, ct);

        // UC-04 E2: dòng tạm hết (hoặc món đã ẩn, xóa) giữ lại ở "Chưa gửi bếp".
        var sendable = drafts.Where(i => menu.TryGetValue(i.MenuItemId, out var m) && !m.IsSoldOut && !m.IsHidden && !m.IsDeleted).ToList();
        var skipped = drafts.Except(sendable).Select(i => i.Id).ToList();
        if (sendable.Count == 0)
            throw PosErrors.Business(PosErrors.KhongCoMonMoi, PosErrors.NoNewItemsMessage);

        var now = Now;
        var waiter = await CurrentUserAsync(ct);
        var table = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == order.TableId, ct);
        var batchNo = order.NextBatch();

        // BR-09: mỗi khu chế biến có món trong lần gửi một phiếu; món không qua bếp không tạo phiếu.
        var businessDate = VietnamDates.DateOf(now);
        var nextNo = await PosCodes.NextTicketNoAsync(tickets, businessDate, ct);
        var created = new List<KitchenTicket>();
        foreach (var station in sendable.Where(i => i.GoesThroughKitchen).Select(i => i.Station).Distinct().OrderBy(s => s))
        {
            var ticket = KitchenTicket.Create(
                businessDate, nextNo++, order.Id, station, batchNo, (table.Id, table.Code), table.Code, (waiter.Id, waiter.FullName), now);
            created.Add(ticket);
            await tickets.AddAsync(ticket, ct);
        }

        foreach (var item in sendable)
        {
            var ticket = item.GoesThroughKitchen ? created.First(t => t.Station == item.Station) : null;
            item.Send(batchNo, ticket?.Id, now, requestId, menu[item.MenuItemId].PrepMinutes);
        }

        // BR-21: gửi thêm món sau khi in tạm tính → phiếu đã in hết hiệu lực, bàn về "Đang phục vụ".
        var prebillInvalidated = order.InvalidatePrebill();
        if (table.Status == TableStatus.ChoThanhToan)
            table.SetStatus(TableStatus.DangPhucVu, now);

        await TouchAsync(order, ct);
        try
        {
            await SaveAsync(order, ct);
        }
        catch (ConflictException)
        {
            // TC-15: hai lần bấm cùng lúc, lần sau thua concurrency → trả kết quả của lần trước.
            if (await RepeatedSendAsync(orderId, requestId, ct) is { } duplicated)
                return duplicated;
            throw;
        }
        catch (DbUpdateException)
        {
            if (await RepeatedSendAsync(orderId, requestId, ct) is { } duplicated)
                return duplicated;

            // Trùng số phiếu do hai hóa đơn gửi cùng lúc: đánh lại số rồi thử một lần.
            var retryNo = await PosCodes.NextTicketNoAsync(tickets, businessDate, ct);
            foreach (var ticket in created)
                ticket.Renumber(retryNo++);
            await SaveAsync(order, ct);
        }

        await events.KitchenChangedAsync(created.Select(t => t.Id), created.Select(t => t.Station), created.Select(t => t.Id), ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        var directCount = sendable.Count(i => !i.GoesThroughKitchen);
        if (directCount > 0)
            await events.ItemsReadyAsync(order, table.Code, ct);

        return new SendResultDto
        {
            Order = await ReloadDtoAsync(order.Id, ct),
            Tickets = created.Select(t => new SentTicketDto { Id = t.Id, Code = t.Code, Station = t.Station }).ToList(),
            DirectItemCount = directCount,
            SkippedSoldOutItemIds = skipped,
            PrebillInvalidated = prebillInvalidated
        };
    }

    public async Task<OrderDto> ServeItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        EnsureNotVoided(order);
        var item = FindItem(order, itemId);
        item.Serve(Now);

        // 07 §3.6: ra món không đổi phiên bản hóa đơn.
        await SaveAsync(order, ct);
        await PublishServeAsync(order, [item], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> ServeAllAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        EnsureNotVoided(order);
        var now = Now;
        var ready = order.Items.Where(i => i.IsReady).ToList();
        foreach (var item in ready)
            item.Serve(now);

        if (ready.Count > 0)
        {
            await SaveAsync(order, ct);
            await PublishServeAsync(order, ready, ct);
        }

        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> UnserveItemAsync(Guid orderId, Guid itemId, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        EnsureNotVoided(order);
        var item = FindItem(order, itemId);
        item.Unserve(Now);

        await SaveAsync(order, ct);
        await PublishServeAsync(order, [item], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> CancelItemAsync(Guid orderId, Guid itemId, CancelItemRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);
        var item = FindItem(order, itemId);

        if (item.IsDraft)
            throw new DomainException("Món chưa gửi bếp, xóa trực tiếp");
        if (item.IsCancelled)
            throw new DomainException("Món đã hủy trước đó");

        // BR-13: món theo trọng lượng hủy nguyên dòng; món theo suất hủy được một phần số nguyên.
        if (item.PricingType == PricingType.TheoTrongLuong && request.Quantity != item.Quantity)
            throw FieldErrors.Single("quantity", "Món theo trọng lượng chỉ hủy nguyên dòng");
        if (item.PricingType == PricingType.TheoSuat
            && (request.Quantity < 1 || request.Quantity > item.Quantity || request.Quantity != Math.Floor(request.Quantity)))
        {
            throw FieldErrors.Single("quantity", $"Số lượng hủy từ 1 đến {item.Quantity:0}");
        }

        // FR-21: món bếp đã làm (Đang làm, Xong, Đã phục vụ) cần quản lý xác nhận.
        var user = await CurrentUserAsync(ct);
        (Guid Id, string Username)? approver = null;
        if (item.Status is OrderItemStatus.DangLam or OrderItemStatus.Xong or OrderItemStatus.DaPhucVu)
        {
            // Người có quyền duyệt tự hủy thì ghi chính họ là người duyệt, không cần (và không dùng) mã xác nhận (07 §5 quyết định 49).
            if (await HasPermissionAsync(ProjectPermissions.OrderItems.VoidApprove, ct))
            {
                approver = (user.Id, user.Username);
            }
            else if (!string.IsNullOrWhiteSpace(request.ApprovalToken))
            {
                approver = approvals.Consume(request.ApprovalToken, ApprovalAction.HuyMon)
                    ?? throw PosErrors.Business(PosErrors.MaXacNhanKhongHopLe, PosErrors.InvalidApprovalMessage);
            }
            else
            {
                throw PosErrors.Business(PosErrors.CanQuanLyDuyet, PosErrors.NeedApprovalMessage);
            }
        }

        var now = Now;
        var wasReady = item.IsReady;
        var target = item;
        var extra = new List<OrderItem>();
        if (request.Quantity < item.Quantity)
        {
            // Hủy một phần: tách dòng (06 §4), dòng mới mang phần bị hủy.
            target = item.SplitOff(request.Quantity);
            order.AddItem(target);
            await orderItems.AddAsync(target, ct);
            extra.Add(target);
        }

        target.Cancel(request.Reason!.Value, request.Note, now, (user.Id, user.FullName, user.Username), approver);

        // TC-23: phiếu của món về "Đang chờ" tới khi bếp bấm "Đã biết".
        var refreshed = await RefreshTicketsAsync([target.KitchenTicketId], extra, now, ct);
        await TouchAsync(order, ct);
        await SaveAsync(order, ct);

        var tableCode = await TableCodeAsync(order.TableId, ct);
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        if (refreshed.Count > 0)
            await events.KitchenChangedAsync(refreshed.Select(t => t.Id), refreshed.Select(t => t.Station), null, ct);
        if (wasReady || target.StatusAtCancel == OrderItemStatus.Xong)
            await events.ItemCancelledAsync(tableCode, target.ItemName, order.WaiterId, ct);

        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> CloseAsync(Guid orderId, OrderVersionRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);

        // BR-03, UC-02 E4: chỉ đóng khi chưa gửi bếp món nào; món nháp xóa theo.
        if (order.Items.Any(i => !i.IsDraft))
            throw PosErrors.Business(PosErrors.BanDaGuiBep, PosErrors.TableAlreadySentMessage);

        var user = await CurrentUserAsync(ct);
        var now = Now;
        orderItems.DeleteRange(order.Items.ToList());
        order.CloseMistaken((user.Id, user.Username), now);
        order.Touch();

        var table = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == order.TableId, ct);
        await ReleaseTableIfEmptyAsync(table, order.Id, now, ct);
        await SaveAsync(order, ct);

        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    /// <summary>Ra món, hoàn tác ra món được làm cả khi hóa đơn đang thu tiền; không làm trên hóa đơn đã hủy, đã gộp.</summary>
    private static void EnsureNotVoided(Order order)
    {
        if (order.Status is OrderStatus.DaHuy or OrderStatus.DaGop)
            throw PosErrors.OrderClosed();
    }

    private async Task PublishServeAsync(Order order, IReadOnlyList<OrderItem> items, CancellationToken ct)
    {
        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync([order.TableId], ct);
        var ticketIds = items.Where(i => i.KitchenTicketId != null).Select(i => i.KitchenTicketId!.Value).Distinct().ToList();
        if (ticketIds.Count > 0)
        {
            var stations = items.Where(i => i.GoesThroughKitchen).Select(i => i.Station);
            await events.KitchenChangedAsync(ticketIds, stations, null, ct);
        }
    }

    /// <summary>
    /// 07 §3.7, TC-15: đã có dòng gửi bằng mã yêu cầu này → dựng lại kết quả từ các dòng đó; không tăng lần gọi, không tạo phiếu.
    /// </summary>
    private async Task<SendResultDto?> RepeatedSendAsync(Guid orderId, string requestId, CancellationToken ct)
    {
        var sent = await orderItems.QueryNoTracking().Where(i => i.SendRequestId == requestId)
            .Select(i => new { i.KitchenTicketId, i.Station }).ToListAsync(ct);
        if (sent.Count == 0)
            return null;

        var ticketIds = sent.Where(i => i.KitchenTicketId != null).Select(i => i.KitchenTicketId!.Value).Distinct().ToList();
        var ticketList = await tickets.QueryNoTracking().Where(t => ticketIds.Contains(t.Id)).OrderBy(t => t.Station).ToListAsync(ct);
        return new SendResultDto
        {
            Order = await ReloadDtoAsync(orderId, ct),
            Tickets = ticketList.Select(t => new SentTicketDto { Id = t.Id, Code = t.Code, Station = t.Station }).ToList(),
            DirectItemCount = sent.Count(i => i.Station == KitchenStation.KhongQuaBep),
            SkippedSoldOutItemIds = [],
            PrebillInvalidated = false
        };
    }
}

using Application.Common.Exceptions;
using Application.DTOs.Orders;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Tables;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Orders;

// Chuyển bàn, gộp bàn, chuyển món (UC-09, FR-22..FR-24, BR-15..BR-17; 07 §2.9).
public sealed partial class OrderService
{
    public const string TableNotFoundMessage = "Không tìm thấy bàn.";

    public async Task<OrderDto> TransferAsync(Guid orderId, TransferRequest request, CancellationToken ct = default)
    {
        var order = await LoadAsync(orderId, ct);
        order.EnsureEditable();
        CheckVersion(order, request.Version);
        await EnsureSingleOrderAsync(order.TableId, ct);

        var source = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == order.TableId, ct);
        var target = await tables.Query().FirstOrDefaultAsync(t => t.Id == request.TargetTableId, ct)
            ?? throw new NotFoundException(TableNotFoundMessage);

        // BR-15: bàn đích Trống hoặc Đã đặt (Đã đặt không lưu, bàn vẫn Trống); cảnh báo giờ đặt là việc của FE (TC-27).
        if (target.Id == source.Id || target.IsHidden || target.Status != TableStatus.Trong)
            throw PosErrors.Business(PosErrors.BanDichKhongHopLe, PosErrors.TransferTargetMessage);

        var now = Now;
        order.MoveToTable(target.Id);

        // BR-15, TC-26 (07 §5 quyết định 46): mọi phiếu "Đang chờ" đang hiện ở bàn cũ (kể cả phiếu của hóa đơn gốc đã tách,
        // của bàn phụ đã gộp) và phiếu "Đã xong" của chính hóa đơn này hiện bàn mới, giữ bàn lúc gửi.
        var ticketList = await tickets.Query()
            .Where(t => t.TableId == source.Id
                && (t.Status == KitchenTicketStatus.DangCho || (t.Status == KitchenTicketStatus.DaXong && t.OrderId == order.Id)))
            .ToListAsync(ct);
        foreach (var ticket in ticketList)
            ticket.MoveToTable(target.Id, target.Code);

        // Bàn phụ đang gộp vào bàn cũ đổi bàn chính theo.
        var secondaries = await tables.Query().Where(t => t.MergedIntoTableId == source.Id).ToListAsync(ct);
        foreach (var secondary in secondaries)
            secondary.RepointMerge(target.Id);

        target.SetStatus(source.Status == TableStatus.ChoThanhToan ? TableStatus.ChoThanhToan : TableStatus.DangPhucVu, now);
        source.SetStatus(TableStatus.Trong, now);

        await TouchAsync(order, ct);
        await SaveAsync(order, ct);

        await events.OrderChangedAsync(order, ct);
        await events.TablesChangedAsync(new[] { source.Id, target.Id }.Concat(secondaries.Select(s => s.Id)), ct);
        if (ticketList.Count > 0)
            await events.KitchenChangedAsync(ticketList.Select(t => t.Id), ticketList.Select(t => t.Station), null, ct);
        return await ReloadDtoAsync(order.Id, ct);
    }

    public async Task<OrderDto> MergeAsync(Guid orderId, MergeRequest request, CancellationToken ct = default)
    {
        var main = await LoadAsync(orderId, ct);
        main.EnsureEditable();
        CheckVersion(main, request.Version);

        var mainTable = await tables.Query().IgnoreQueryFilters().FirstAsync(t => t.Id == main.TableId, ct);
        if (!mainTable.IsServing)
            throw PosErrors.Business(PosErrors.BanDichKhongHopLe, PosErrors.MergeTargetMessage);
        await EnsureSingleOrderAsync(mainTable.Id, ct);

        var sourceTables = await tables.Query().Where(t => request.SourceTableIds.Contains(t.Id)).ToListAsync(ct);
        if (sourceTables.Count != request.SourceTableIds.Count)
            throw new NotFoundException(TableNotFoundMessage);

        var sources = new List<(DiningTable Table, Order Order)>();
        foreach (var sourceTable in sourceTables)
        {
            // BR-16: chỉ gộp bàn Đang phục vụ hoặc Chờ thanh toán.
            if (sourceTable.Id == mainTable.Id || !sourceTable.IsServing)
                throw PosErrors.Business(PosErrors.BanDichKhongHopLe, PosErrors.MergeTargetMessage);
            await EnsureSingleOrderAsync(sourceTable.Id, ct);

            var sourceOrder = await PosReadModel.WithDetails(orders.Query())
                .FirstAsync(o => o.TableId == sourceTable.Id && PosReadModel.ActiveStatuses.Contains(o.Status), ct);
            if (sourceOrder.Status == OrderStatus.DangThu)
                throw PosErrors.OrderLocked();
            sources.Add((sourceTable, sourceOrder));
        }

        var now = Now;
        var changedTables = new List<Guid> { mainTable.Id };
        var movedTickets = new List<Domain.Entities.Pos.Kitchen.KitchenTicket>();
        foreach (var (sourceTable, sourceOrder) in sources)
        {
            // Món (kể cả nháp), khách, tiền cọc và lượt "Tiền cọc" của bàn phụ sang hóa đơn chính (07 §5 quyết định 6).
            foreach (var item in sourceOrder.Items.OrderBy(i => i.SortOrder).ToList())
                main.TakeItem(item, sourceOrder);
            main.AbsorbMerged(sourceOrder);
            sourceOrder.MarkMerged(main.Id, now);
            sourceOrder.Touch();

            // Cùng quy tắc chuyển bàn (07 §5 quyết định 46): phiếu "Đang chờ" ở bàn phụ và phiếu "Đã xong" của hóa đơn bàn phụ
            // hiện bàn chính.
            var ticketList = await tickets.Query()
                .Where(t => t.TableId == sourceTable.Id
                    && (t.Status == KitchenTicketStatus.DangCho || (t.Status == KitchenTicketStatus.DaXong && t.OrderId == sourceOrder.Id)))
                .ToListAsync(ct);
            foreach (var ticket in ticketList)
                ticket.MoveToTable(mainTable.Id, mainTable.Code);
            movedTickets.AddRange(ticketList);

            var nested = await tables.Query().Where(t => t.MergedIntoTableId == sourceTable.Id).ToListAsync(ct);
            foreach (var table in nested)
            {
                table.RepointMerge(mainTable.Id);
                changedTables.Add(table.Id);
            }

            sourceTable.SetStatus(TableStatus.DaGop, now, mainTable.Id);
            changedTables.Add(sourceTable.Id);
        }

        // BR-16: bàn chính đang Chờ thanh toán quay về Đang phục vụ; tạm tính đã in hết hiệu lực.
        main.InvalidatePrebill();
        if (mainTable.Status == TableStatus.ChoThanhToan)
            mainTable.SetStatus(TableStatus.DangPhucVu, now);

        await TouchAsync(main, ct);
        await SaveAsync(main, ct);

        await events.OrderChangedAsync(main, ct);
        foreach (var (_, sourceOrder) in sources)
            await events.OrderChangedAsync(sourceOrder, ct);
        await events.TablesChangedAsync(changedTables, ct);
        if (movedTickets.Count > 0)
            await events.KitchenChangedAsync(movedTickets.Select(t => t.Id), movedTickets.Select(t => t.Station), null, ct);
        return await ReloadDtoAsync(main.Id, ct);
    }

    public async Task<MoveItemsResultDto> MoveItemsAsync(Guid orderId, MoveItemsRequest request, CancellationToken ct = default)
    {
        var source = await LoadAsync(orderId, ct);
        source.EnsureEditable();
        CheckVersion(source, request.Version);

        var targetTable = await tables.Query().FirstOrDefaultAsync(t => t.Id == request.TargetTableId, ct)
            ?? throw new NotFoundException(TableNotFoundMessage);
        if (targetTable.Id == source.TableId || !targetTable.IsServing)
            throw PosErrors.Business(PosErrors.BanDichKhongHopLe, PosErrors.MoveTargetMessage);

        // 07 §5 quyết định 7: vào hóa đơn đang mở mở sớm nhất của bàn đích.
        var target = await PosReadModel.WithDetails(orders.Query())
            .Where(o => o.TableId == targetTable.Id && PosReadModel.ActiveStatuses.Contains(o.Status))
            .OrderBy(o => o.OpenedAt).ThenBy(o => o.Code)
            .FirstOrDefaultAsync(ct)
            ?? throw PosErrors.Business(PosErrors.BanDichKhongHopLe, PosErrors.MoveTargetMessage);
        target.EnsureEditable();

        var moves = new List<(OrderItem Item, decimal Quantity)>();
        for (var i = 0; i < request.Items.Count; i++)
        {
            var input = request.Items[i];
            var item = source.Items.FirstOrDefault(x => x.Id == input.ItemId)
                ?? throw FieldErrors.Single($"items[{i}].itemId", ItemNotFoundMessage);
            if (item.IsCancelled)
                throw FieldErrors.Single($"items[{i}].itemId", "Món đã hủy không chuyển được");
            if (item.PricingType == PricingType.TheoTrongLuong && input.Quantity != item.Quantity)
                throw FieldErrors.Single($"items[{i}].quantity", "Món theo trọng lượng chỉ chuyển nguyên dòng");
            if (item.PricingType == PricingType.TheoSuat
                && (input.Quantity < 1 || input.Quantity > item.Quantity || input.Quantity != Math.Floor(input.Quantity)))
            {
                throw FieldErrors.Single($"items[{i}].quantity", $"Số lượng chuyển từ 1 đến {item.Quantity:0}");
            }

            moves.Add((item, input.Quantity));
        }

        foreach (var (item, quantity) in moves)
        {
            if (quantity == item.Quantity)
            {
                target.TakeItem(item, source);
            }
            else
            {
                // Chuyển một phần: tách dòng, dòng mới sang hóa đơn đích, giữ trạng thái chế biến (BR-17).
                var copy = item.SplitOff(quantity);
                target.TakeItem(copy, null);
                await orderItems.AddAsync(copy, ct);
            }
        }

        var now = Now;
        if (targetTable.Status == TableStatus.ChoThanhToan)
        {
            targetTable.SetStatus(TableStatus.DangPhucVu, now);
            target.InvalidatePrebill();
        }

        await TouchAsync(source, ct);
        await TouchAsync(target, ct);
        await SaveAsync(source, ct);

        await events.OrderChangedAsync(source, ct);
        await events.OrderChangedAsync(target, ct);
        await events.TablesChangedAsync([source.TableId, targetTable.Id], ct);
        var ticketIds = moves.Where(m => m.Item.KitchenTicketId != null).Select(m => m.Item.KitchenTicketId!.Value).Distinct().ToList();
        if (ticketIds.Count > 0)
            await events.KitchenChangedAsync(ticketIds, moves.Select(m => m.Item.Station).Where(s => s != KitchenStation.KhongQuaBep), null, ct);

        return new MoveItemsResultDto
        {
            Source = await ReloadDtoAsync(source.Id, ct),
            Target = await ReloadDtoAsync(target.Id, ct)
        };
    }

    /// <summary>07 §5 quyết định 5: chuyển, gộp chỉ khi bàn có đúng một hóa đơn đang mở.</summary>
    private async Task EnsureSingleOrderAsync(Guid tableId, CancellationToken ct)
    {
        var count = await orders.QueryNoTracking().CountAsync(o => o.TableId == tableId && PosReadModel.ActiveStatuses.Contains(o.Status), ct);
        if (count > 1)
            throw PosErrors.Business(PosErrors.BanDangTachHoaDon, PosErrors.TableSplitMessage);
    }
}

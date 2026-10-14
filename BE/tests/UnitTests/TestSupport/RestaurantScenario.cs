using Application.DTOs.Kitchen;
using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Kitchen;
using Application.Interfaces.Services.Orders;
using Application.Interfaces.Services.Tables;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Tables;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Microsoft.EntityFrameworkCore;

namespace UnitTests.TestSupport;

/// <summary>Thao tác dùng lại trong test: tra Id theo mã, mở bàn, gọi món, gửi bếp, dựng "Đơn chuẩn T1-05" (05 §1).</summary>
public sealed class RestaurantScenario(RestaurantTestHost host)
{
    public RestaurantTestHost Host => host;

    public Task<Guid> TableIdAsync(string code) =>
        host.QueryAsync<DiningTable, Guid>(q => q.Where(t => t.Code == code).Select(t => t.Id).SingleAsync());

    public Task<Guid> MenuIdAsync(string code) =>
        host.QueryAsync<MenuItem, Guid>(q => q.Where(m => m.Code == code).Select(m => m.Id).SingleAsync());

    public Task<T> Orders<T>(Func<IOrderService, Task<T>> call) => host.CallAsync(call);

    public Task<T> Kitchen<T>(Func<IKitchenService, Task<T>> call) => host.CallAsync(call);

    public Task<T> Floor<T>(Func<IFloorPlanService, Task<T>> call) => host.CallAsync(call);

    public async Task<OrderDto> OpenAsync(string tableCode, int guests, string username = "phucvu", string? requestId = null)
    {
        await host.SignInAsync(username);
        var tableId = await TableIdAsync(tableCode);
        var result = await Floor(s => s.OpenTableAsync(tableId, new OpenTableRequest
        {
            GuestCount = guests,
            ClientRequestId = requestId ?? Guid.NewGuid().ToString()
        }));
        return result.Value;
    }

    public async Task<OrderDto> AddAsync(Guid orderId, string itemCode, decimal quantity, string[]? quickNotes = null, bool rush = false, string? note = null)
    {
        var menuItemId = await MenuIdAsync(itemCode);
        return await Orders(s => s.AddItemAsync(orderId, new AddItemRequest
        {
            MenuItemId = menuItemId,
            Quantity = quantity,
            QuickNotes = quickNotes,
            IsRush = rush,
            Note = note
        }));
    }

    public async Task<SendResultDto> SendAsync(Guid orderId, string? requestId = null)
    {
        var order = await Orders(s => s.GetByIdAsync(orderId));
        return await Orders(s => s.SendAsync(orderId, new SendToKitchenRequest
        {
            ClientRequestId = requestId ?? Guid.NewGuid().ToString(),
            Version = order.Version
        }));
    }

    public Task<OrderDto> GetAsync(Guid orderId) => Orders(s => s.GetByIdAsync(orderId));

    /// <summary>TC-11: thêm đủ món của Đơn chuẩn vào T1-05 (Gỏi ngó sen "Ít cay", Bò lúc lắc, Cá chẽm 1,2 kg, Rau muống, 6 Bia Tiger).</summary>
    public async Task<OrderDto> AddStandardItemsAsync(Guid orderId)
    {
        await AddAsync(orderId, "M008", 1, ["Ít cay"]);
        await AddAsync(orderId, "M021", 1);
        await AddAsync(orderId, "M014", 1.2m);
        await AddAsync(orderId, "M039", 1);
        return await AddAsync(orderId, "M055", 6);
    }

    /// <summary>
    /// "Đơn chuẩn T1-05" (05 §1): 4 khách, đủ món, đã gửi bếp, bếp xong, đã ra hết. Tiền món 1.065.000 ₫, tổng 1.208.000 ₫.
    /// </summary>
    public async Task<OrderDto> StandardOrderAsync(string tableCode = "T1-05")
    {
        var order = await OpenAsync(tableCode, 4);
        await AddStandardItemsAsync(order.Id);
        await SendAsync(order.Id);
        await FinishKitchenAsync(order.Id);
        await host.SignInAsync("phucvu");
        return await Orders(s => s.ServeAllAsync(order.Id));
    }

    /// <summary>Bếp "Xong cả phiếu" mọi phiếu đang chờ của hóa đơn.</summary>
    public async Task FinishKitchenAsync(Guid orderId)
    {
        await host.SignInAsync("bep");
        var order = await GetAsync(orderId);
        foreach (var ticketId in order.Items.Where(i => i.KitchenTicketId != null && i.Status is OrderItemStatus.ChoLam or OrderItemStatus.DangLam)
                     .Select(i => i.KitchenTicketId!.Value).Distinct())
        {
            await Kitchen(s => s.DoneAllAsync(ticketId));
        }
    }

    public async Task<KitchenBoardDto> BoardAsync(KitchenStation? station = null, KitchenTicketStatus? view = null)
    {
        await host.SignInAsync("bep");
        return await Kitchen(s => s.GetBoardAsync(new KitchenBoardQuery { Station = station, View = view }));
    }

    public async Task<TableCardDto> CardAsync(string tableCode)
    {
        var plan = await Floor(s => s.GetFloorPlanAsync());
        return plan.Tables.Single(t => t.Code == tableCode);
    }

    /// <summary>Đơn đang mở của bàn (đầu tiên theo mã).</summary>
    public async Task<OrderDto> OrderOfAsync(string tableCode)
    {
        var tableId = await TableIdAsync(tableCode);
        var service = await Floor(s => s.GetTableServiceAsync(tableId));
        return service.Orders[0];
    }

    public async Task<PaymentResultDto> PayAsync(
        Guid orderId,
        PaymentMethod method,
        decimal? amount = null,
        decimal? cash = null,
        string? requestId = null,
        int? shareNo = null,
        bool? allowPartial = null,
        string username = "thungan")
    {
        await host.SignInAsync(username);
        var order = await GetAsync(orderId);
        var result = await Orders(s => s.AddPaymentAsync(orderId, new CreatePaymentRequest
        {
            ClientRequestId = requestId ?? Guid.NewGuid().ToString(),
            Version = order.Version,
            Method = method,
            Amount = amount,
            CashReceived = cash,
            CardLast4 = method == PaymentMethod.The ? "1234" : null,
            ShareNo = shareNo,
            AllowPartial = allowPartial,
            QrContent = method == PaymentMethod.ChuyenKhoan ? $"VIETQR|970436|0000000000|{amount:0}|{order.Code}" : null
        }));
        return result.Value;
    }
}

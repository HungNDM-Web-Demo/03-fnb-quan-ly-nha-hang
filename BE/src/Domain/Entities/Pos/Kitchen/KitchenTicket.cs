using System.Globalization;
using Domain.Base;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.Kitchen;
using Domain.Enums.Pos.MenuItems;
using Domain.Enums.Pos.Orders;

namespace Domain.Entities.Pos.Kitchen;

/// <summary>
/// Phiếu bếp (bảng <c>Pos_KitchenTickets</c>, BR-09): món của một lần gửi cho một khu chế biến. Số phiếu <c>#001</c> đánh lại
/// mỗi ngày theo giờ Việt Nam. Bàn của phiếu đổi khi chuyển bàn, gộp bàn; bàn lúc gửi giữ ở <see cref="OriginalTableCode"/>.
/// </summary>
public class KitchenTicket : BaseEntity, ICreationTracked, IModificationTracked, IAuditLogExempt
{
    public const int CodeMaxLength = 10;
    public const int TableCodeMaxLength = 10;
    public const int WaiterNameMaxLength = 150;

    private KitchenTicket()
    {
    }

    public DateOnly BusinessDate { get; private set; }
    public int TicketNo { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public Guid OrderId { get; private set; }
    public KitchenStation Station { get; private set; }
    public int BatchNo { get; private set; }
    public Guid TableId { get; private set; }
    public string TableCode { get; private set; } = string.Empty;
    public string OriginalTableCode { get; private set; } = string.Empty;
    public Guid WaiterId { get; private set; }
    public string WaiterName { get; private set; } = string.Empty;
    public DateTime SentAt { get; private set; }
    public KitchenTicketStatus Status { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public static string FormatCode(int ticketNo) => "#" + ticketNo.ToString("000", CultureInfo.InvariantCulture);

    public static KitchenTicket Create(
        DateOnly businessDate,
        int ticketNo,
        Guid orderId,
        KitchenStation station,
        int batchNo,
        (Guid Id, string Code) table,
        string originalTableCode,
        (Guid Id, string FullName) waiter,
        DateTime sentAtUtc)
    {
        if (station == KitchenStation.KhongQuaBep)
            throw new Common.DomainException("Món không qua bếp không tạo phiếu bếp");

        var ticket = new KitchenTicket
        {
            BusinessDate = businessDate,
            OrderId = orderId,
            Station = station,
            BatchNo = batchNo,
            TableId = table.Id,
            TableCode = table.Code,
            OriginalTableCode = originalTableCode,
            WaiterId = waiter.Id,
            WaiterName = waiter.FullName,
            SentAt = sentAtUtc,
            Status = KitchenTicketStatus.DangCho
        };
        ticket.Renumber(ticketNo);
        return ticket;
    }

    /// <summary>Đánh lại số khi trùng số do hai lần gửi cùng lúc (06 §3: index unique báo lỗi, thử lại một lần).</summary>
    public void Renumber(int ticketNo)
    {
        TicketNo = ticketNo;
        Code = FormatCode(ticketNo);
    }

    /// <summary>Chuyển bàn, gộp bàn: phiếu hiện mã bàn mới kèm "từ {bàn cũ}" (BR-15, TC-26).</summary>
    public void MoveToTable(Guid tableId, string tableCode)
    {
        TableId = tableId;
        TableCode = tableCode;
    }

    /// <summary>
    /// Tính lại trạng thái (BR-10): còn món Chờ làm, Đang làm hoặc món hủy chưa "Đã biết" thì "Đang chờ"; ngược lại "Đã xong"
    /// với <see cref="CompletedAt"/> là lúc vào "Đã xong".
    /// </summary>
    public void Refresh(IEnumerable<OrderItem> items, DateTime completedAtUtc)
    {
        var waiting = items.Any(i =>
            i.Status is OrderItemStatus.ChoLam or OrderItemStatus.DangLam
            || (i.Status == OrderItemStatus.DaHuy && i.CancelAcknowledgedAt is null));

        if (waiting)
        {
            Status = KitchenTicketStatus.DangCho;
            CompletedAt = null;
        }
        else if (Status != KitchenTicketStatus.DaXong)
        {
            Status = KitchenTicketStatus.DaXong;
            CompletedAt = completedAtUtc;
        }
    }
}

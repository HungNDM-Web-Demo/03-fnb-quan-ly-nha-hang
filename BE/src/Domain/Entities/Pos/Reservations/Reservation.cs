using Domain.Base;
using Domain.Common;
using Domain.Enums.Pos.Reservations;

namespace Domain.Entities.Pos.Reservations;

/// <summary>
/// Đặt bàn (bảng <c>Pos_Reservations</c>, FR-34..FR-36). Không xóa, hủy bằng trạng thái. Giữ bàn từ giờ đến tới giờ đến
/// + 120 phút (BR-24); quá giờ đến 30 phút chưa nhận bàn thì service đổi lười sang "Không đến" khi đọc.
/// </summary>
public class Reservation : BaseEntity, ICreationTracked, IModificationTracked
{
    public const int CodeMaxLength = 20;
    public const int CustomerNameMaxLength = 150;
    public const int PhoneMaxLength = 20;
    public const int NoteMaxLength = 500;
    public const int NameMaxLength = 150;
    public const int ReasonMaxLength = 200;
    public const string NotWaitingMessage = "Đặt bàn không còn ở trạng thái chờ đến";

    private Reservation()
    {
    }

    public string Code { get; private set; } = string.Empty;
    public string CustomerName { get; private set; } = string.Empty;
    public string Phone { get; private set; } = string.Empty;
    public DateTime ArrivalAt { get; private set; }
    public int GuestCount { get; private set; }
    public Guid TableId { get; private set; }
    public string? Note { get; private set; }
    public decimal Deposit { get; private set; }
    public ReservationStatus Status { get; private set; }
    public Guid? OrderId { get; private set; }
    public DateTime? CheckedInAt { get; private set; }
    public DateTime? CancelledAt { get; private set; }
    public Guid? CancelledById { get; private set; }
    public string? CancelledByName { get; private set; }
    public string? CancelReason { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public DateTime HoldUntil => ArrivalAt.Add(Entities.Pos.PosRules.ReservationHold);

    public static Reservation Create(
        string code,
        string customerName,
        string phone,
        DateTime arrivalAtUtc,
        int guestCount,
        Guid tableId,
        string? note,
        decimal deposit)
    {
        var reservation = new Reservation { Code = code, Status = ReservationStatus.ChoDen };
        reservation.Apply(customerName, phone, arrivalAtUtc, guestCount, tableId, note, deposit);
        return reservation;
    }

    /// <summary>Số điện thoại lưu 10 số liền (06 §4).</summary>
    public static string NormalizePhone(string phone) => new(phone.Where(char.IsDigit).ToArray());

    public void AssignCode(string code) => Code = code;

    public void Update(string customerName, string phone, DateTime arrivalAtUtc, int guestCount, Guid tableId, string? note, decimal deposit)
    {
        EnsureWaiting();
        Apply(customerName, phone, arrivalAtUtc, guestCount, tableId, note, deposit);
    }

    public void Cancel(string reason, (Guid Id, string FullName) by, DateTime atUtc)
    {
        EnsureWaiting();
        Status = ReservationStatus.DaHuy;
        CancelReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        CancelledById = by.Id;
        CancelledByName = by.FullName;
        CancelledAt = atUtc;
    }

    /// <summary>BR-24: quá giờ đến 30 phút chưa nhận bàn. Trả true khi vừa đổi.</summary>
    public bool MarkNoShowIfOverdue(DateTime nowUtc)
    {
        if (Status != ReservationStatus.ChoDen || nowUtc <= ArrivalAt.Add(Entities.Pos.PosRules.ReservationNoShowAfter))
            return false;

        Status = ReservationStatus.KhongDen;
        return true;
    }

    /// <summary>Đặt bàn mẫu đã qua (06 §5.2): trạng thái ghi sẵn trong file.</summary>
    public void SetSeedStatus(ReservationStatus status) => Status = status;

    /// <summary>FR-36: nhận bàn, gắn hóa đơn sinh ra.</summary>
    public void CheckIn(Guid orderId, DateTime atUtc)
    {
        EnsureWaiting();
        Status = ReservationStatus.DaNhanBan;
        OrderId = orderId;
        CheckedInAt = atUtc;
    }

    /// <summary>Liên kết hóa đơn của đặt bàn mẫu "Đã nhận bàn".</summary>
    public void LinkSeedOrder(Guid orderId, DateTime checkedInAtUtc)
    {
        Status = ReservationStatus.DaNhanBan;
        OrderId = orderId;
        CheckedInAt = checkedInAtUtc;
    }

    /// <summary>Hủy đặt bàn mẫu (06 §5.2), không kiểm trạng thái.</summary>
    public void SetSeedCancelled(string? reason, (Guid Id, string FullName)? by, DateTime atUtc)
    {
        Status = ReservationStatus.DaHuy;
        CancelReason = reason;
        CancelledById = by?.Id;
        CancelledByName = by?.FullName;
        CancelledAt = atUtc;
    }

    public void EnsureWaiting()
    {
        if (Status != ReservationStatus.ChoDen)
            throw new DomainException(NotWaitingMessage);
    }

    private void Apply(string customerName, string phone, DateTime arrivalAtUtc, int guestCount, Guid tableId, string? note, decimal deposit)
    {
        if (string.IsNullOrWhiteSpace(customerName))
            throw new DomainException("Nhập tên khách");

        CustomerName = customerName.Trim();
        Phone = NormalizePhone(phone);
        ArrivalAt = arrivalAtUtc;
        GuestCount = guestCount;
        TableId = tableId;
        Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        Deposit = deposit;
    }
}

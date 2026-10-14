using Domain.Base;
using Domain.Common;
using Domain.Enums.Pos.Orders;

namespace Domain.Entities.Pos.Orders;

/// <summary>
/// Lượt thu (bảng <c>Pos_Payments</c>, FR-30): một lần thu bằng một phương thức, gồm lượt "Tiền cọc" tạo lúc nhận bàn (BR-25).
/// Không bao giờ xóa; hủy hóa đơn đã thanh toán không xóa lượt thu.
/// </summary>
public class Payment : BaseEntity, ICreationTracked, IModificationTracked
{
    public const int ClientRequestIdMaxLength = 64;
    public const int CardLast4Length = 4;
    public const int QrContentMaxLength = 300;
    public const int CashierNameMaxLength = 150;

    private Payment()
    {
    }

    public Guid OrderId { get; private set; }
    public string? ClientRequestId { get; private set; }
    public PaymentMethod Method { get; private set; }
    public decimal Amount { get; private set; }
    public decimal? CashReceived { get; private set; }
    public decimal? ChangeAmount { get; private set; }
    public string? CardLast4 { get; private set; }
    public int? ShareNo { get; private set; }
    public string? QrContent { get; private set; }
    public DateTime PaidAt { get; private set; }
    public Guid? CashierId { get; private set; }
    public string? CashierName { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public bool IsDeposit => Method == PaymentMethod.TienCoc;

    /// <summary>Lượt "Tiền cọc" lúc nhận bàn: <c>Amount = Deposit</c>, không có thu ngân (BR-25).</summary>
    public static Payment Deposit(Guid orderId, decimal amount, DateTime paidAtUtc) =>
        amount <= 0
            ? throw new DomainException("Tiền cọc phải lớn hơn 0")
            : new Payment { OrderId = orderId, Method = PaymentMethod.TienCoc, Amount = amount, PaidAt = paidAtUtc };

    /// <summary>
    /// Lượt thu của thu ngân. Tiền mặt ghi tiền khách đưa và tiền thối; thẻ ghi 4 số cuối; chuyển khoản ghi chuỗi QR đã hiện.
    /// </summary>
    public static Payment Collect(
        Guid orderId,
        string? clientRequestId,
        PaymentMethod method,
        decimal amount,
        decimal? cashReceived,
        string? cardLast4,
        int? shareNo,
        string? qrContent,
        DateTime paidAtUtc,
        Guid? cashierId,
        string? cashierName)
    {
        if (method == PaymentMethod.TienCoc)
            throw new DomainException("Lượt tiền cọc chỉ tạo khi nhận bàn");
        if (amount <= 0)
            throw new DomainException("Số tiền phải lớn hơn 0");

        var payment = new Payment
        {
            OrderId = orderId,
            ClientRequestId = string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            Method = method,
            Amount = amount,
            ShareNo = shareNo,
            PaidAt = paidAtUtc,
            CashierId = cashierId,
            CashierName = cashierName
        };

        switch (method)
        {
            case PaymentMethod.TienMat:
                var received = cashReceived ?? amount;
                if (received < amount)
                    throw new DomainException("Tiền khách đưa ít hơn số tiền ghi nhận");
                payment.CashReceived = received;
                payment.ChangeAmount = received - amount;
                break;
            case PaymentMethod.The:
                payment.CardLast4 = string.IsNullOrWhiteSpace(cardLast4) ? null : cardLast4.Trim();
                break;
            case PaymentMethod.ChuyenKhoan:
                payment.QrContent = string.IsNullOrWhiteSpace(qrContent) ? null : qrContent.Trim();
                break;
        }

        return payment;
    }

    /// <summary>BR-25: chốt hóa đơn mà tiền cọc lớn hơn tổng thì lượt cọc giảm về tổng.</summary>
    public void ReduceDepositTo(decimal amount)
    {
        if (!IsDeposit)
            throw new DomainException("Chỉ giảm được lượt tiền cọc");

        Amount = Math.Max(0, amount);
    }

    /// <summary>Gộp bàn: lượt "Tiền cọc" của bàn phụ chuyển sang hóa đơn bàn chính (07 §5 quyết định 6).</summary>
    public void MoveTo(Guid orderId) => OrderId = orderId;
}

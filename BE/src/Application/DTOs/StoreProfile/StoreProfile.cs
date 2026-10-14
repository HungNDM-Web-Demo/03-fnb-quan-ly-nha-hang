namespace Application.DTOs.StoreProfile;

/// <summary>
/// Thông tin nhà hàng và tham số tính tiền (khóa <c>Store.*</c>, <c>Billing.*</c>, 06 §3) cho bản in, QR, màn thanh toán,
/// đặt bàn mà không cần quyền <c>settings.view</c> (07 §2.17).
/// </summary>
public sealed class StoreProfile
{
    public const string ServiceChargeRateKey = "Billing.ServiceChargeRate";
    public const string VatRateKey = "Billing.VatRate";
    public const string CashierDiscountLimitKey = "Billing.CashierDiscountLimit";
    public const string OpenTimeKey = "Store.OpenTime";
    public const string CloseTimeKey = "Store.CloseTime";

    public string Name { get; init; } = string.Empty;
    public string Address { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public string TaxCode { get; init; } = string.Empty;
    public string ReceiptFooter { get; init; } = string.Empty;
    public string BankBin { get; init; } = string.Empty;
    public string BankAccount { get; init; } = string.Empty;
    public string BankAccountName { get; init; } = string.Empty;

    /// <summary>"10:00".</summary>
    public string OpenTime { get; init; } = "10:00";

    /// <summary>"22:00".</summary>
    public string CloseTime { get; init; } = "22:00";

    public int ServiceChargeRate { get; init; }
    public int VatRate { get; init; }
    public int CashierDiscountLimit { get; init; }
}

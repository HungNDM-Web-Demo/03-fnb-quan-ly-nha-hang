using System.Globalization;

namespace Domain.Entities.Pos;

/// <summary>
/// Hằng số nghiệp vụ cố định (06 §3, BE và FE cùng giá trị): không phải cài đặt, không đổi qua giao diện.
/// Tỉ lệ phí phục vụ, thuế suất, hạn mức giảm giá là cài đặt <c>Billing.*</c>.
/// </summary>
public static class PosRules
{
    /// <summary>BR-24: bàn hiện "Đã đặt" từ 60 phút trước giờ đến.</summary>
    public static readonly TimeSpan ReservedWindowBefore = TimeSpan.FromMinutes(60);

    /// <summary>BR-24: mỗi đặt bàn giữ bàn 120 phút tính từ giờ đến.</summary>
    public static readonly TimeSpan ReservationHold = TimeSpan.FromMinutes(120);

    /// <summary>BR-24: nhãn "Trễ" sau 15 phút.</summary>
    public static readonly TimeSpan ReservationLateAfter = TimeSpan.FromMinutes(15);

    /// <summary>BR-24: quá giờ đến 30 phút thì "Không đến", bàn được giải phóng.</summary>
    public static readonly TimeSpan ReservationNoShowAfter = TimeSpan.FromMinutes(30);

    /// <summary>BR-24: giờ đến cách lúc tạo tối thiểu 30 phút.</summary>
    public static readonly TimeSpan ReservationMinLead = TimeSpan.FromMinutes(30);

    /// <summary>Token quản lý xác nhận sống 5 phút, dùng một lần (07 §2.12).</summary>
    public static readonly TimeSpan ApprovalLifetime = TimeSpan.FromMinutes(5);

    /// <summary>Hoàn tác "Đã ra" trong 60 giây phía máy chủ (07 §5 quyết định 19).</summary>
    public static readonly TimeSpan UnserveWindow = TimeSpan.FromSeconds(60);

    /// <summary>BR-18: tối đa 10 hóa đơn đang mở mỗi bàn.</summary>
    public const int MaxOrdersPerTable = 10;

    /// <summary>BR-19: chia đều 2–20 phần.</summary>
    public const int SplitMin = 2;

    public const int SplitMax = 20;

    /// <summary>BR-25: tiền cọc tối đa.</summary>
    public const decimal MaxDeposit = 5_000_000m;

    /// <summary>BR-01: số khách 1–50.</summary>
    public const int GuestMin = 1;

    public const int GuestMax = 50;

    /// <summary>BR-04: món theo suất 1–99.</summary>
    public const int QuantityMin = 1;

    public const int QuantityMax = 99;

    /// <summary>BR-04: món theo trọng lượng 0,1–20 kg, bước 0,1.</summary>
    public const decimal WeightMin = 0.1m;

    public const decimal WeightMax = 20m;

    /// <summary>BR-28: thời gian chế biến chuẩn 1–120 phút.</summary>
    public const int PrepMinutesMin = 1;

    public const int PrepMinutesMax = 120;

    /// <summary>BR-28: sức chứa 1–20.</summary>
    public const int CapacityMin = 1;

    public const int CapacityMax = 20;

    /// <summary>Lưới sơ đồ 12 cột × 8 hàng (06 §4).</summary>
    public const int GridColumns = 12;

    public const int GridRows = 8;

    /// <summary>Bước đánh lại thứ tự khi sắp xếp: 10, 20, 30…</summary>
    public const int SortOrderStep = 10;

    /// <summary>Lý do của hóa đơn đóng vì mở nhầm (BR-03).</summary>
    public const string MistakenOpenReason = "Mở nhầm";

    /// <summary>Phí phục vụ, thuế suất của hóa đơn mẫu (06 §5.4 quy tắc 5, bằng cài đặt mẫu).</summary>
    public const int SeedServiceChargeRate = 5;

    public const int SeedVatRate = 8;

    /// <summary>Giá, giảm giá số tiền, tiền cọc là bội số 1.000 ₫.</summary>
    public static bool IsThousandMultiple(decimal amount) => amount % 1000m == 0;

    /// <summary>Số lượng hợp lệ theo cách tính (BR-04).</summary>
    public static bool IsValidQuantity(Enums.Pos.MenuItems.PricingType pricing, decimal quantity) =>
        pricing == Enums.Pos.MenuItems.PricingType.TheoTrongLuong
            ? quantity >= WeightMin && quantity <= WeightMax && quantity * 10 == Math.Floor(quantity * 10)
            : quantity >= QuantityMin && quantity <= QuantityMax && quantity == Math.Floor(quantity);

    /// <summary>Câu lỗi số lượng theo cách tính (TC-14).</summary>
    public static string QuantityMessage(Enums.Pos.MenuItems.PricingType pricing) =>
        pricing == Enums.Pos.MenuItems.PricingType.TheoTrongLuong ? "Trọng lượng từ 0,1 đến 20 kg" : "Số lượng từ 1 đến 99";

    /// <summary>Định dạng tiền trong câu thông báo, giống FE <c>formatVnd</c>: <c>208.000 ₫</c>.</summary>
    public static string FormatVnd(decimal amount) =>
        amount.ToString("#,0", CultureInfo.InvariantCulture).Replace(',', '.') + " ₫";
}

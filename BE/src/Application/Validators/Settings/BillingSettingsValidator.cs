using System.Globalization;
using Application.Common.Time;
using Application.DTOs.Settings;
using Application.Interfaces.Repositories;
using Domain.Entities.System.Settings;
using FluentValidation;
using FluentValidation.Results;
using StoreProfileDto = Application.DTOs.StoreProfile.StoreProfile;

namespace Application.Validators.Settings;

/// <summary>
/// Kiểm thêm giá trị cài đặt của nhà hàng khi <c>PUT /api/settings</c> (07 §2.17, FR-32), chạy cùng validator nền
/// <see cref="UpdateSettingsRequestValidator"/>: phí phục vụ số nguyên 0–15, thuế suất 0/5/8/10, hạn mức giảm giá 0–100,
/// giờ mở cửa trước giờ đóng cửa dạng HH:mm. Lỗi gắn <c>items[i].value</c>.
/// </summary>
public sealed class BillingSettingsValidator : AbstractValidator<UpdateSettingsRequest>
{
    private static readonly int[] VatRates = [0, 5, 8, 10];

    public BillingSettingsValidator(IGenericRepository<Setting> settings)
    {
        RuleFor(x => x).Custom((request, context) =>
        {
            var items = request.Items ?? [];
            string? openTime = null, closeTime = null;
            int openIndex = -1, closeIndex = -1;

            for (var i = 0; i < items.Count; i++)
            {
                var key = items[i].Key?.Trim() ?? string.Empty;
                var value = items[i].Value?.Trim() ?? string.Empty;
                var field = $"items[{i}].value";

                if (Is(key, StoreProfileDto.ServiceChargeRateKey) && !IsIntIn(value, 0, 15))
                    context.AddFailure(new ValidationFailure(field, "Phí phục vụ từ 0 đến 15%"));
                else if (Is(key, StoreProfileDto.VatRateKey) && !(int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var vat) && VatRates.Contains(vat)))
                    context.AddFailure(new ValidationFailure(field, "Thuế suất là 0, 5, 8 hoặc 10%"));
                else if (Is(key, StoreProfileDto.CashierDiscountLimitKey) && !IsIntIn(value, 0, 100))
                    context.AddFailure(new ValidationFailure(field, "Hạn mức giảm giá từ 0 đến 100%"));
                else if (Is(key, StoreProfileDto.OpenTimeKey))
                {
                    openTime = value;
                    openIndex = i;
                }
                else if (Is(key, StoreProfileDto.CloseTimeKey))
                {
                    closeTime = value;
                    closeIndex = i;
                }
            }

            if (openIndex < 0 && closeIndex < 0)
                return;

            foreach (var (value, index) in new[] { (openTime, openIndex), (closeTime, closeIndex) })
            {
                if (index >= 0 && !VietnamDates.TryParseTime(value, out _))
                {
                    context.AddFailure(new ValidationFailure($"items[{index}].value", "Giờ dạng HH:mm"));
                    return;
                }
            }

            // Giờ còn lại lấy từ DB khi chỉ sửa một trong hai khóa.
            if (openIndex < 0 || closeIndex < 0)
            {
                var missingKey = openIndex < 0 ? StoreProfileDto.OpenTimeKey : StoreProfileDto.CloseTimeKey;
                var stored = settings.QueryNoTracking().Where(s => s.Key == missingKey).Select(s => s.Value).FirstOrDefault();
                if (openIndex < 0)
                    openTime = stored;
                else
                    closeTime = stored;
            }

            if (VietnamDates.TryParseTime(openTime, out var open) && VietnamDates.TryParseTime(closeTime, out var close) && open >= close)
            {
                var index = closeIndex >= 0 ? closeIndex : openIndex;
                context.AddFailure(new ValidationFailure($"items[{index}].value", "Giờ mở cửa phải trước giờ đóng cửa"));
            }
        });
    }

    private static bool Is(string key, string expected) => string.Equals(key, expected, StringComparison.OrdinalIgnoreCase);

    private static bool IsIntIn(string value, int min, int max) =>
        int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= min && number <= max;
}

using System.Text.RegularExpressions;
using Application.Common.Time;
using FluentValidation;

namespace Application.Validators.Common;

/// <summary>Quy tắc kiểm tra dùng lại ở nhiều validator của nhà hàng (câu thông báo theo 07).</summary>
public static partial class PosValidationRules
{
    public const string DateMessage = "Ngày dạng yyyy-MM-dd";
    public const string MaxDaysMessage = "Khoảng ngày tối đa 366 ngày";
    public const string ToBeforeFromMessage = "Ngày kết thúc phải sau ngày bắt đầu";
    public const int MaxRangeDays = 366;

    /// <summary>Ngày yyyy-MM-dd, không bắt buộc.</summary>
    public static IRuleBuilderOptions<T, string?> OptionalDate<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(v => string.IsNullOrWhiteSpace(v) || VietnamDates.TryParse(v, out _)).WithMessage(DateMessage);

    /// <summary>Mã yêu cầu chống bấm lặp (NFR-05).</summary>
    public static IRuleBuilderOptions<T, string> ClientRequestId<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Thiếu mã yêu cầu")
            .MaximumLength(64).WithMessage("Mã yêu cầu tối đa 64 ký tự");

    public static bool IsHexColor(string? value) => value is not null && ColorRegex().IsMatch(value.Trim());

    /// <summary>SĐT khách: 10 chữ số, bắt đầu 0 (cho phép khoảng trắng, dấu chấm, gạch ngang khi nhập).</summary>
    public static bool IsPhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;
        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 10 && digits[0] == '0' && value.Trim().All(c => char.IsDigit(c) || c is ' ' or '.' or '-');
    }

    /// <summary>Khoảng ngày <c>from</c>, <c>to</c> (07 §2): tối đa 366 ngày, <c>to</c> không nhỏ hơn <c>from</c>.</summary>
    public static void AddDateRangeRules<T>(AbstractValidator<T> validator, Func<T, string?> from, Func<T, string?> to)
    {
        validator.RuleFor(x => from(x))
            .OptionalDate()
            .Must((q, _) => !HasBoth(from(q), to(q), out var f, out var t) || t < f || t.DayNumber - f.DayNumber + 1 <= MaxRangeDays)
            .WithMessage(MaxDaysMessage)
            .OverridePropertyName("from");

        validator.RuleFor(x => to(x))
            .OptionalDate()
            .Must((q, _) => !HasBoth(from(q), to(q), out var f, out var t) || t >= f)
            .WithMessage(ToBeforeFromMessage)
            .OverridePropertyName("to");
    }

    private static bool HasBoth(string? fromValue, string? toValue, out DateOnly from, out DateOnly to)
    {
        var ok = VietnamDates.TryParse(fromValue, out from) & VietnamDates.TryParse(toValue, out to);
        return ok;
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorRegex();
}

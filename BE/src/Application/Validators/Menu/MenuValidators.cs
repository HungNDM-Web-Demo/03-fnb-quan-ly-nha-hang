using System.Text.RegularExpressions;
using Application.DTOs.Menu;
using Application.Validators.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.MenuItems;
using Domain.Enums.Pos.MenuItems;
using FluentValidation;

namespace Application.Validators.Menu;

/// <summary>Danh mục (07 §2.2): màu sai → <c>errors.color</c> "Màu dạng #RRGGBB".</summary>
public sealed partial class SaveCategoryRequestValidator : AppValidator<SaveCategoryRequest>
{
    public SaveCategoryRequestValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("Nhập mã danh mục")
            .Must(c => CodeRegex().IsMatch(c.Trim())).WithMessage("Mã danh mục 1–10 ký tự chữ in hoa hoặc số");
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Nhập tên danh mục")
            .MaximumLength(Category.NameMaxLength).WithMessage("Tên danh mục tối đa 100 ký tự");
        RuleFor(x => x.Color)
            .Must(PosValidationRules.IsHexColor).WithMessage("Màu dạng #RRGGBB");
    }

    [GeneratedRegex("^[A-Za-z0-9]{1,10}$")]
    private static partial Regex CodeRegex();
}

/// <summary>Món (07 §2.3). Thứ tự: định dạng 400 → danh mục 400 (service) → trùng mã 409 (service).</summary>
public sealed partial class SaveMenuItemRequestValidator : AppValidator<SaveMenuItemRequest>
{
    public SaveMenuItemRequestValidator()
    {
        RuleFor(x => x.Code)
            .Must(c => !string.IsNullOrWhiteSpace(c) && CodeRegex().IsMatch(c.Trim())).WithMessage("Mã món dạng M001");
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Nhập tên món")
            .MaximumLength(MenuItem.NameMaxLength).WithMessage("Tên món tối đa 150 ký tự");
        RuleFor(x => x.CategoryId)
            .NotEmpty().WithMessage("Danh mục không tồn tại");
        RuleFor(x => x.Description)
            .MaximumLength(MenuItem.DescriptionMaxLength).WithMessage("Mô tả tối đa 500 ký tự");
        RuleFor(x => x.Unit)
            .Must((r, unit) => r.PricingType == PricingType.TheoTrongLuong || !string.IsNullOrWhiteSpace(unit))
            .WithMessage("Chọn đơn vị tính")
            .MaximumLength(MenuItem.UnitMaxLength).WithMessage("Đơn vị tối đa 20 ký tự");
        RuleFor(x => x.PricingType).IsInEnum().WithMessage("Chọn cách tính");
        RuleFor(x => x.Station).IsInEnum().WithMessage("Chọn khu chế biến");
        RuleFor(x => x.Price)
            .GreaterThan(0).WithMessage("Đơn giá phải lớn hơn 0")
            .Must(PosRules.IsThousandMultiple).WithMessage("Đơn giá phải là bội số 1.000 ₫");
        RuleFor(x => x.PrepMinutes)
            .Must((r, minutes) => r.Station == KitchenStation.KhongQuaBep || minutes is >= PosRules.PrepMinutesMin and <= PosRules.PrepMinutesMax)
            .WithMessage("Thời gian chuẩn từ 1 đến 120 phút");
    }

    [GeneratedRegex(@"^M\d{3}$", RegexOptions.IgnoreCase)]
    private static partial Regex CodeRegex();
}

public sealed class SaveQuickNoteRequestValidator : AppValidator<SaveQuickNoteRequest>
{
    public SaveQuickNoteRequestValidator()
    {
        RuleFor(x => x.Content)
            .NotEmpty().WithMessage("Nhập nội dung ghi chú")
            .Must(c => c.Trim().Length <= QuickNote.ContentMaxLength).WithMessage("Ghi chú tối đa 50 ký tự");
    }
}

public sealed class ReorderRequestValidator : AppValidator<ReorderRequest>
{
    public ReorderRequestValidator()
    {
        RuleFor(x => x.Ids)
            .NotEmpty().WithMessage("Danh sách sắp xếp trống")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Danh sách sắp xếp có id trùng");
    }
}

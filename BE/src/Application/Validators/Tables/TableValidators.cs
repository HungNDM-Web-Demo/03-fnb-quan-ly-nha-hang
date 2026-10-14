using System.Text.RegularExpressions;
using Application.DTOs.Tables;
using Application.Validators.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Tables;
using FluentValidation;

namespace Application.Validators.Tables;

/// <summary>Khu vực (07 §2.5).</summary>
public sealed partial class SaveAreaRequestValidator : AppValidator<SaveAreaRequest>
{
    public SaveAreaRequestValidator()
    {
        RuleFor(x => x.Code)
            .Must(c => !string.IsNullOrWhiteSpace(c) && CodeRegex().IsMatch(c.Trim()))
            .WithMessage("Mã khu vực 2 ký tự chữ in hoa hoặc số");
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Nhập tên khu vực")
            .MaximumLength(Area.NameMaxLength).WithMessage("Tên khu vực tối đa 50 ký tự");
    }

    [GeneratedRegex("^[A-Z0-9]{2}$")]
    private static partial Regex CodeRegex();
}

/// <summary>Bàn (07 §2.6): định dạng mã theo khu vực kiểm ở service (cần mã khu vực).</summary>
public sealed class SaveTableRequestValidator : AppValidator<SaveTableRequest>
{
    public SaveTableRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Nhập mã bàn");
        RuleFor(x => x.AreaId).NotEmpty().WithMessage("Chọn khu vực");
        RuleFor(x => x.Capacity)
            .InclusiveBetween(PosRules.CapacityMin, PosRules.CapacityMax).WithMessage("Sức chứa từ 1 đến 20");
        RuleFor(x => x.Shape).IsInEnum().WithMessage("Chọn hình dạng bàn");
        RuleFor(x => x.X)
            .Must((r, x) => TableGrid.FitsX(r.Shape, x)).WithMessage(TableGrid.OutOfGridMessage);
        RuleFor(x => x.Y)
            .Must(y => TableGrid.FitsY(y)).WithMessage(TableGrid.OutOfGridMessage);
    }
}

public sealed class OpenTableRequestValidator : AppValidator<OpenTableRequest>
{
    public OpenTableRequestValidator()
    {
        RuleFor(x => x.GuestCount)
            .InclusiveBetween(PosRules.GuestMin, PosRules.GuestMax).WithMessage("Số khách từ 1 đến 50");
        RuleFor(x => x.ClientRequestId).ClientRequestId();
    }
}

/// <summary>Lưới sơ đồ 12 × 8 (06 §4): Vuông, Tròn chiếm 2×2 ô, Chữ nhật 3×2 ô.</summary>
public static class TableGrid
{
    public const string OutOfGridMessage = "Vị trí bàn nằm ngoài sơ đồ";

    public static int Width(Domain.Enums.Pos.Tables.TableShape shape) =>
        shape == Domain.Enums.Pos.Tables.TableShape.ChuNhat ? 3 : 2;

    public static bool FitsX(Domain.Enums.Pos.Tables.TableShape shape, int x) => x >= 0 && x + Width(shape) <= PosRules.GridColumns;

    public static bool FitsY(int y) => y >= 0 && y + 2 <= PosRules.GridRows;
}

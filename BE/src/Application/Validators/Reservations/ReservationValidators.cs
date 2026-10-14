using Application.DTOs.Reservations;
using Application.Validators.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Reservations;
using FluentValidation;

namespace Application.Validators.Reservations;

/// <summary>Đặt bàn (07 §2.15). Giờ mở cửa, đặt trước 30 phút, trùng khung kiểm ở service.</summary>
public sealed class SaveReservationRequestValidator : AppValidator<SaveReservationRequest>
{
    public SaveReservationRequestValidator()
    {
        RuleFor(x => x.CustomerName)
            .NotEmpty().WithMessage("Nhập tên khách")
            .MaximumLength(Reservation.CustomerNameMaxLength).WithMessage("Tên khách tối đa 150 ký tự");
        RuleFor(x => x.Phone).Must(PosValidationRules.IsPhone).WithMessage("Số điện thoại không hợp lệ");
        RuleFor(x => x.ArrivalAt).NotNull().WithMessage("Chọn giờ đến");
        RuleFor(x => x.GuestCount)
            .InclusiveBetween(PosRules.GuestMin, PosRules.GuestMax).WithMessage("Số khách từ 1 đến 50");
        RuleFor(x => x.TableId).NotEmpty().WithMessage("Chọn bàn");
        RuleFor(x => x.Note).MaximumLength(Reservation.NoteMaxLength).WithMessage("Ghi chú tối đa 500 ký tự");
        RuleFor(x => x.Deposit)
            .Must(d => d >= 0 && d <= PosRules.MaxDeposit && PosRules.IsThousandMultiple(d))
            .WithMessage("Tiền cọc từ 0 đến 5.000.000 ₫, bội số 1.000 ₫");
    }
}

public sealed class ReservationQueryValidator : AppValidator<ReservationQuery>
{
    public ReservationQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

public sealed class AvailableTablesQueryValidator : AppValidator<AvailableTablesQuery>
{
    public AvailableTablesQueryValidator()
    {
        RuleFor(x => x.ArrivalAt).NotNull().WithMessage("Chọn giờ đến");
        RuleFor(x => x.GuestCount)
            .InclusiveBetween(PosRules.GuestMin, PosRules.GuestMax).WithMessage("Số khách từ 1 đến 50");
    }
}

public sealed class CancelReservationRequestValidator : AppValidator<CancelReservationRequest>
{
    public CancelReservationRequestValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("Nhập lý do hủy")
            .MaximumLength(Reservation.ReasonMaxLength).WithMessage("Lý do tối đa 200 ký tự");
    }
}

public sealed class CheckInRequestValidator : AppValidator<CheckInRequest>
{
    public CheckInRequestValidator()
    {
        RuleFor(x => x.ClientRequestId).ClientRequestId();
        RuleFor(x => x.GuestCount)
            .Must(g => g is null or >= PosRules.GuestMin and <= PosRules.GuestMax).WithMessage("Số khách từ 1 đến 50");
    }
}

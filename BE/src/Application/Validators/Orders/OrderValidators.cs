using Application.DTOs.Approvals;
using Application.DTOs.Orders;
using Application.Validators.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.Orders;
using FluentValidation;

namespace Application.Validators.Orders;

// Validator thao tác hóa đơn (07 §2.8–2.14). Lỗi cần trạng thái hiện tại (số lượng theo cách tính, số còn phải thu…) kiểm ở service.

public sealed class OrderQueryValidator : AppValidator<OrderQuery>
{
    public OrderQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

public sealed class AddItemRequestValidator : AppValidator<AddItemRequest>
{
    public AddItemRequestValidator()
    {
        RuleFor(x => x.MenuItemId).NotEmpty().WithMessage("Món không còn trong thực đơn");
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("Số lượng phải lớn hơn 0");
        RuleFor(x => x.Note).MaximumLength(OrderItem.NoteMaxLength).WithMessage("Ghi chú tối đa 200 ký tự");
        RuleForEach(x => x.QuickNotes).MaximumLength(50).WithMessage("Ghi chú nhanh tối đa 50 ký tự");
    }
}

public sealed class UpdateDraftItemRequestValidator : AppValidator<UpdateDraftItemRequest>
{
    public UpdateDraftItemRequestValidator()
    {
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("Số lượng phải lớn hơn 0");
        RuleFor(x => x.Note).MaximumLength(OrderItem.NoteMaxLength).WithMessage("Ghi chú tối đa 200 ký tự");
        RuleForEach(x => x.QuickNotes).MaximumLength(50).WithMessage("Ghi chú nhanh tối đa 50 ký tự");
    }
}

public sealed class SendToKitchenRequestValidator : AppValidator<SendToKitchenRequest>
{
    public SendToKitchenRequestValidator() => RuleFor(x => x.ClientRequestId).ClientRequestId();
}

/// <summary>BR-13: thiếu lý do → "Chọn lý do hủy"; Khác thiếu ghi chú → "Nhập ghi chú cho lý do Khác".</summary>
public sealed class CancelItemRequestValidator : AppValidator<CancelItemRequest>
{
    public CancelItemRequestValidator()
    {
        RuleFor(x => x.Reason)
            .NotNull().WithMessage("Chọn lý do hủy")
            .Must(r => r is null || (Enum.IsDefined(r.Value) && r != CancelReason.HetMon)).WithMessage("Chọn lý do hủy");
        RuleFor(x => x.Note)
            .Must((r, note) => r.Reason != CancelReason.Khac || !string.IsNullOrWhiteSpace(note))
            .WithMessage("Nhập ghi chú cho lý do Khác")
            .MaximumLength(OrderItem.CancelNoteMaxLength).WithMessage("Ghi chú tối đa 200 ký tự");
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("Số lượng hủy phải lớn hơn 0");
    }
}

public sealed class TransferRequestValidator : AppValidator<TransferRequest>
{
    public TransferRequestValidator() => RuleFor(x => x.TargetTableId).NotEmpty().WithMessage("Chọn bàn đích");
}

public sealed class MergeRequestValidator : AppValidator<MergeRequest>
{
    public MergeRequestValidator()
    {
        RuleFor(x => x.SourceTableIds)
            .NotEmpty().WithMessage("Chọn bàn cần gộp")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Bàn cần gộp bị trùng");
    }
}

public sealed class MoveItemsRequestValidator : AppValidator<MoveItemsRequest>
{
    public MoveItemsRequestValidator()
    {
        RuleFor(x => x.TargetTableId).NotEmpty().WithMessage("Chọn bàn nhận món");
        RuleFor(x => x.Items)
            .NotEmpty().WithMessage("Chọn món cần chuyển")
            .Must(items => items.Select(i => i.ItemId).Distinct().Count() == items.Count).WithMessage("Món cần chuyển bị trùng");
        RuleForEach(x => x.Items).ChildRules(item =>
            item.RuleFor(i => i.Quantity).GreaterThan(0).WithMessage("Số lượng phải lớn hơn 0"));
    }
}

/// <summary>BR-08: phần trăm 1–100; số tiền bội số 1.000 ₫; bắt buộc lý do.</summary>
public sealed class DiscountRequestValidator : AppValidator<DiscountRequest>
{
    public DiscountRequestValidator()
    {
        RuleFor(x => x.Type)
            .NotNull().WithMessage("Chọn kiểu giảm giá")
            .Must(t => t is null || Enum.IsDefined(t.Value)).WithMessage("Chọn kiểu giảm giá");
        RuleFor(x => x.Value)
            .Must((r, v) => r.Type != DiscountType.PhanTram || (v is >= 1 and <= 100 && v == Math.Floor(v)))
            .WithMessage("Phần trăm từ 1 đến 100")
            .Must((r, v) => r.Type != DiscountType.SoTien || (v > 0 && PosRules.IsThousandMultiple(v)))
            .WithMessage("Số tiền là bội số 1.000 ₫");
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("Chọn lý do giảm giá")
            .MaximumLength(Order.ReasonMaxLength).WithMessage("Lý do tối đa 200 ký tự");
    }
}

public sealed class SplitOrderRequestValidator : AppValidator<SplitOrderRequest>
{
    public SplitOrderRequestValidator()
    {
        RuleFor(x => x.Parts).NotEmpty().WithMessage("Chọn món cho hóa đơn mới");
        RuleForEach(x => x.Parts).ChildRules(part =>
        {
            part.RuleFor(p => p.Items).NotEmpty().WithMessage("Chọn món cho hóa đơn mới");
            part.RuleForEach(p => p.Items).ChildRules(item =>
                item.RuleFor(i => i.Quantity).GreaterThan(0).WithMessage("Số lượng phải lớn hơn 0"));
        });
    }
}

public sealed class SplitEqualRequestValidator : AppValidator<SplitEqualRequest>
{
    public SplitEqualRequestValidator() =>
        RuleFor(x => x.Count).InclusiveBetween(PosRules.SplitMin, PosRules.SplitMax).WithMessage("Số người từ 2 đến 20");
}

/// <summary>
/// Chỉ kiểm định dạng; thiếu trường theo phương thức, vượt số còn phải thu… kiểm ở service theo đúng thứ tự 07 §2.14
/// (gửi lại cùng <c>clientRequestId</c> phải được 200 trước mọi lỗi khác).
/// </summary>
public sealed class CreatePaymentRequestValidator : AppValidator<CreatePaymentRequest>
{
    public CreatePaymentRequestValidator()
    {
        RuleFor(x => x.ClientRequestId).ClientRequestId();
        RuleFor(x => x.Method)
            .NotNull().WithMessage("Chọn phương thức thu")
            .Must(m => m is null || (Enum.IsDefined(m.Value) && m != PaymentMethod.TienCoc)).WithMessage("Chọn phương thức thu");
        RuleFor(x => x.CardLast4)
            .Must(c => string.IsNullOrWhiteSpace(c) || (c.Trim().Length == 4 && c.Trim().All(char.IsDigit)))
            .WithMessage("Nhập 4 số cuối thẻ");
        RuleFor(x => x.QrContent).MaximumLength(Payment.QrContentMaxLength).WithMessage("Nội dung QR tối đa 300 ký tự");
    }
}

public sealed class CancelOrderRequestValidator : AppValidator<CancelOrderRequest>
{
    public CancelOrderRequestValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("Nhập lý do hủy")
            .MaximumLength(Order.ReasonMaxLength).WithMessage("Lý do tối đa 200 ký tự");
    }
}

public sealed class ApprovalRequestValidator : AppValidator<ApprovalRequest>
{
    public ApprovalRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().WithMessage("Nhập tên đăng nhập");
        RuleFor(x => x.Password).NotEmpty().WithMessage("Nhập mật khẩu");
        RuleFor(x => x.Action)
            .NotNull().WithMessage("Thiếu thao tác cần xác nhận")
            .Must(a => a is null || Enum.IsDefined(a.Value)).WithMessage("Thiếu thao tác cần xác nhận");
    }
}

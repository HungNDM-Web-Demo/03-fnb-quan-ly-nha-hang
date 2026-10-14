using Application.DTOs.Reports;
using Application.Validators.Common;
using FluentValidation;

namespace Application.Validators.Reports;

/// <summary>Khoảng ngày báo cáo (07 §2): tối đa 366 ngày, <c>to</c> không nhỏ hơn <c>from</c>.</summary>
public sealed class ReportRangeQueryValidator : AppValidator<ReportRangeQuery>
{
    public ReportRangeQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

public sealed class TopItemsQueryValidator : AppValidator<TopItemsQuery>
{
    public TopItemsQueryValidator()
    {
        PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
        RuleFor(x => x.Limit).Must(v => v is null or >= 1 and <= 100).WithMessage("limit từ 1 đến 100");
        RuleFor(x => x.SortBy)
            .Must(s => string.IsNullOrWhiteSpace(s) || s.Trim().ToLowerInvariant() is "quantity" or "revenue")
            .WithMessage("sortBy là quantity hoặc revenue");
    }
}

public sealed class VoidedItemsQueryValidator : AppValidator<VoidedItemsQuery>
{
    public VoidedItemsQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

public sealed class KitchenReportQueryValidator : AppValidator<KitchenReportQuery>
{
    public KitchenReportQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

public sealed class TableReportQueryValidator : AppValidator<TableReportQuery>
{
    public TableReportQueryValidator() => PosValidationRules.AddDateRangeRules(this, q => q.From, q => q.To);
}

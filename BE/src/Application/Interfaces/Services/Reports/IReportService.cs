using Application.DTOs.Reports;

namespace Application.Interfaces.Services.Reports;

/// <summary>Tổng quan hôm nay và báo cáo (UC-14, UC-15, FR-01, FR-37..FR-40, 07 §2.16).</summary>
public interface IReportService
{
    Task<DashboardReport> GetDashboardAsync(CancellationToken ct = default);

    Task<RevenueReport> GetRevenueAsync(ReportRangeQuery query, CancellationToken ct = default);

    Task<TopItemsReport> GetTopItemsAsync(TopItemsQuery query, CancellationToken ct = default);

    Task<VoidedItemsReport> GetVoidedItemsAsync(VoidedItemsQuery query, CancellationToken ct = default);

    Task<KitchenReport> GetKitchenAsync(KitchenReportQuery query, CancellationToken ct = default);

    Task<TableReport> GetTablesAsync(TableReportQuery query, CancellationToken ct = default);
}

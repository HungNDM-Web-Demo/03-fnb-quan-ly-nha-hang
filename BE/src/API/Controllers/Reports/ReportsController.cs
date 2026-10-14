using API.Base;
using API.Filters;
using Application.Constants;
using Application.DTOs.Reports;
using Application.Interfaces.Services.Reports;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Reports;

/// <summary>
/// Tổng quan hôm nay và báo cáo (UC-14, UC-15, 07 §2.16). Doanh thu chỉ tính hóa đơn "Đã thanh toán" theo paidAt (BR-26);
/// không gửi from, to → 30 ngày tới hôm nay; khoảng dài hơn 366 ngày → 400 <c>errors.from</c>.
/// </summary>
[Route("api/reports")]
[AuthorizePermission(ProjectPermissions.Reports.View)]
public sealed class ReportsController(IReportService reportService) : BaseApiController
{
    [HttpGet("dashboard")]
    [ProducesResponseType<DashboardReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<DashboardReport>> Dashboard(CancellationToken ct) => Ok(await reportService.GetDashboardAsync(ct));

    [HttpGet("revenue")]
    [ProducesResponseType<RevenueReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<RevenueReport>> Revenue([FromQuery] ReportRangeQuery query, CancellationToken ct) =>
        Ok(await reportService.GetRevenueAsync(query, ct));

    [HttpGet("top-items")]
    [ProducesResponseType<TopItemsReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<TopItemsReport>> TopItems([FromQuery] TopItemsQuery query, CancellationToken ct) =>
        Ok(await reportService.GetTopItemsAsync(query, ct));

    [HttpGet("voided-items")]
    [ProducesResponseType<VoidedItemsReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<VoidedItemsReport>> VoidedItems([FromQuery] VoidedItemsQuery query, CancellationToken ct) =>
        Ok(await reportService.GetVoidedItemsAsync(query, ct));

    [HttpGet("kitchen")]
    [ProducesResponseType<KitchenReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<KitchenReport>> Kitchen([FromQuery] KitchenReportQuery query, CancellationToken ct) =>
        Ok(await reportService.GetKitchenAsync(query, ct));

    [HttpGet("tables")]
    [ProducesResponseType<TableReport>(StatusCodes.Status200OK)]
    public async Task<ActionResult<TableReport>> Tables([FromQuery] TableReportQuery query, CancellationToken ct) =>
        Ok(await reportService.GetTablesAsync(query, ct));
}

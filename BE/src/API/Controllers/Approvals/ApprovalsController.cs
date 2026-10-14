using API.Base;
using API.Filters;
using Application.Constants;
using Application.DTOs.Approvals;
using Application.Interfaces.Services.Approvals;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Approvals;

/// <summary>Quản lý xác nhận ngay trên tablet cho hủy món, giảm giá vượt hạn mức (SCR-07, 07 §2.12).</summary>
[Route("api/approvals")]
public sealed class ApprovalsController(IApprovalService approvalService) : BaseApiController
{
    /// <summary>
    /// Sai tên hoặc mật khẩu → 400 (không 401); tài khoản thiếu quyền duyệt → 403; thành công → token 5 phút, dùng một lần.
    /// Người gọi cần <c>order-items.cancel</c> (HuyMon) hoặc <c>orders.discount</c> (GiamGia).
    /// </summary>
    [HttpPost]
    [AuthorizePermission(ProjectPermissions.OrderItems.Cancel, ProjectPermissions.Orders.Discount)]
    [ProducesResponseType<ApprovalDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ApprovalDto>> Approve(ApprovalRequest request, CancellationToken ct) =>
        Ok(await approvalService.ApproveAsync(request, ct));
}

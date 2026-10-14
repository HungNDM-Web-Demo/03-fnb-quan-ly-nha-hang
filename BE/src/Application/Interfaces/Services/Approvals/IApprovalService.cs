using Application.DTOs.Approvals;
using Domain.Enums.Pos.Orders;

namespace Application.Interfaces.Services.Approvals;

/// <summary>Quản lý xác nhận ngay trên tablet cho hủy món và giảm giá vượt hạn mức (SCR-07, 07 §2.12).</summary>
public interface IApprovalService
{
    /// <summary>
    /// Kiểm mật khẩu như đăng nhập nhưng không tạo phiên, vẫn đếm sai mật khẩu (BR-SYS-03). Sai → 400; tài khoản thiếu
    /// quyền của action → 403; thành công → token 5 phút, dùng một lần.
    /// </summary>
    Task<ApprovalDto> ApproveAsync(ApprovalRequest request, CancellationToken ct = default);

    /// <summary>Dùng token một lần cho <paramref name="action"/>; sai, hết hạn, đã dùng hoặc sai action → null.</summary>
    (Guid Id, string Username)? Consume(string? token, ApprovalAction action);
}

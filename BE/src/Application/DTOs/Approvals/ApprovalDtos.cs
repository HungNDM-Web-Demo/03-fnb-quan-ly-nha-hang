using Domain.Enums.Pos.Orders;

namespace Application.DTOs.Approvals;

/// <summary>Quản lý nhập tài khoản ngay trên tablet (SCR-07, 07 §2.12).</summary>
public sealed class ApprovalRequest
{
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public ApprovalAction? Action { get; init; }
}

public sealed class ApprovalDto
{
    /// <summary>Chuỗi ngẫu nhiên, BE giữ 5 phút, dùng một lần, gắn với action.</summary>
    public string Token { get; init; } = string.Empty;

    public Guid ApprovedById { get; init; }

    /// <summary>Ghi vào món hủy, hóa đơn (TC-24, TC-38).</summary>
    public string ApprovedByUsername { get; init; } = string.Empty;

    public DateTime ExpiresAt { get; init; }
}

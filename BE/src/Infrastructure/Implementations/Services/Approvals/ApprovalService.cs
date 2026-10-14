using System.Security.Cryptography;
using Application.Common.Exceptions;
using Application.Constants;
using Application.DTOs.Approvals;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Approvals;
using Application.Interfaces.Services.Auth;
using Application.Interfaces.Services.Common;
using Application.Interfaces.Services.Roles;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.System.Users;
using Domain.Enums.Pos.Orders;
using Infrastructure.Implementations.Services.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Infrastructure.Implementations.Services.Approvals;

/// <summary>
/// Quản lý xác nhận ngay trên tablet (SCR-07, 07 §2.12, 07 §5 quyết định 23): kiểm mật khẩu như đăng nhập (vẫn đếm sai
/// mật khẩu, BR-SYS-03) nhưng không tạo phiên, không ghi LastLoginAt. Sai tên hoặc mật khẩu trả 400 (không 401 để FE không
/// làm mới token của người đang đăng nhập). Token giữ trong <see cref="IMemoryCache"/> 5 phút, dùng một lần, gắn với action.
/// </summary>
public sealed class ApprovalService(
    IGenericRepository<User> users,
    IUnitOfWork unitOfWork,
    IPasswordHasher passwordHasher,
    IPermissionService permissionService,
    ICurrentUserService currentUser,
    IMemoryCache cache,
    TimeProvider timeProvider) : IApprovalService
{
    public const string NoVoidPermissionMessage = "Tài khoản không có quyền duyệt hủy món";
    public const string NoDiscountPermissionMessage = "Tài khoản không có quyền xác nhận giảm giá";

    private const string CachePrefix = "pos-approval:";

    public async Task<ApprovalDto> ApproveAsync(ApprovalRequest request, CancellationToken ct = default)
    {
        var action = request.Action ?? ApprovalAction.HuyMon;

        // Người gọi phải có quyền làm thao tác cần xác nhận (endpoint nhận một trong hai quyền).
        var callerPermission = action == ApprovalAction.HuyMon ? ProjectPermissions.OrderItems.Cancel : ProjectPermissions.Orders.Discount;
        if (currentUser.UserId is not { } callerId)
            throw new UnauthorizedAccessException("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        if (!await permissionService.HasPermissionAsync(callerId, callerPermission, ct))
            throw new ForbiddenException($"Bạn không có quyền thực hiện thao tác này (cần quyền {callerPermission}).");

        var username = User.NormalizeUsername(request.Username);
        var user = await users.Query().FirstOrDefaultAsync(u => u.Username == username, ct);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        if (user is null)
            throw new DomainException(AuthService.InvalidCredentialsMessage);
        if (user.IsLockedOut(now))
            throw new DomainException(LockedOutMessage(user, now));

        if (!passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            user.RegisterFailedLogin(now);
            await unitOfWork.SaveChangesAsync(ct);
            throw new DomainException(user.IsLockedOut(now) ? LockedOutMessage(user, now) : AuthService.InvalidCredentialsMessage);
        }

        if (!user.IsActive)
            throw new DomainException(AuthService.AccountLockedMessage);

        var (permission, message) = action == ApprovalAction.HuyMon
            ? (ProjectPermissions.OrderItems.VoidApprove, NoVoidPermissionMessage)
            : (ProjectPermissions.Orders.DiscountOverride, NoDiscountPermissionMessage);
        if (!await permissionService.HasPermissionAsync(user.Id, permission, ct))
            throw new ForbiddenException(message);

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var expiresAt = now.Add(PosRules.ApprovalLifetime);
        cache.Set(CachePrefix + token, new Entry(user.Id, user.Username, action), PosRules.ApprovalLifetime);

        return new ApprovalDto
        {
            Token = token,
            ApprovedById = user.Id,
            ApprovedByUsername = user.Username,
            ExpiresAt = expiresAt
        };
    }

    public (Guid Id, string Username)? Consume(string? token, ApprovalAction action)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        var key = CachePrefix + token.Trim();
        if (!cache.TryGetValue(key, out Entry? entry) || entry is null)
            return null;

        cache.Remove(key);
        return entry.Action == action ? (entry.UserId, entry.Username) : null;
    }

    private static string LockedOutMessage(User user, DateTime now)
    {
        var minutes = Math.Max(1, (int)Math.Ceiling((user.LockoutEndAt!.Value - now).TotalMinutes));
        return $"Tài khoản tạm khóa đăng nhập, thử lại sau {minutes} phút";
    }

    private sealed record Entry(Guid UserId, string Username, ApprovalAction Action);
}

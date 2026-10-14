namespace Application.Interfaces.Services.StoreProfile;

/// <summary>Thông tin nhà hàng, tham số tính tiền cho người đã đăng nhập (07 §2.17).</summary>
public interface IStoreProfileService
{
    Task<DTOs.StoreProfile.StoreProfile> GetAsync(CancellationToken ct = default);
}

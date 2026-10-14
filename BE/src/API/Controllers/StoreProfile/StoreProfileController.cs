using API.Base;
using Application.Interfaces.Services.StoreProfile;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.StoreProfile;

/// <summary>Thông tin nhà hàng, tham số tính tiền (07 §2.17); mọi người đã đăng nhập, không cần <c>settings.view</c>.</summary>
[Route("api/store-profile")]
public sealed class StoreProfileController(IStoreProfileService storeProfileService) : BaseApiController
{
    [HttpGet]
    [ProducesResponseType<Application.DTOs.StoreProfile.StoreProfile>(StatusCodes.Status200OK)]
    public async Task<ActionResult<Application.DTOs.StoreProfile.StoreProfile>> Get(CancellationToken ct) =>
        Ok(await storeProfileService.GetAsync(ct));
}

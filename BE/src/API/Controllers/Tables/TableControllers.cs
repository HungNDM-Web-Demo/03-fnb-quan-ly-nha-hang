using API.Base;
using API.Filters;
using Application.Constants;
using Application.DTOs.Menu;
using Application.DTOs.Orders;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Tables;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Tables;

/// <summary>Khu vực (UC-01 2a, FR-02, 07 §2.5).</summary>
[Route("api/areas")]
public sealed class AreasController(IAreaService areaService) : BaseApiController
{
    /// <summary>Theo sortOrder; <c>includeHidden=true</c> cần thêm quyền <c>tables.update</c>.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Tables.View)]
    [ProducesResponseType<IReadOnlyList<AreaDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AreaDto>>> GetAll([FromQuery] AreaQuery query, CancellationToken ct)
    {
        if (query.IncludeHidden && await PermissionGuard.CheckAsync(HttpContext, [ProjectPermissions.Tables.Update]) is { } forbidden)
            return (ActionResult)forbidden;
        return Ok(await areaService.GetListAsync(query.IncludeHidden, ct));
    }

    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.View)]
    [ProducesResponseType<AreaDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AreaDto>> GetById(Guid id, CancellationToken ct) => Ok(await areaService.GetByIdAsync(id, ct));

    [HttpPost]
    [AuthorizePermission(ProjectPermissions.Tables.Create)]
    [ProducesResponseType<AreaDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<AreaDto>> Create(SaveAreaRequest request, CancellationToken ct)
    {
        var item = await areaService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>Tên, ẩn/hiện; ẩn khi có bàn đang có khách → 400.</summary>
    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.Update)]
    [ProducesResponseType<AreaDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AreaDto>> Update(Guid id, SaveAreaRequest request, CancellationToken ct) =>
        Ok(await areaService.UpdateAsync(id, request, ct));

    [HttpPut("order")]
    [AuthorizePermission(ProjectPermissions.Tables.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Reorder(ReorderRequest request, CancellationToken ct)
    {
        await areaService.ReorderAsync(request, ct);
        return NoContent();
    }

    /// <summary>Còn bàn → 400 kèm <c>tableCount</c>.</summary>
    [HttpDelete("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await areaService.DeleteAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Thiết lập bàn (UC-01, 07 §2.6) và phục vụ tại bàn (UC-02, 07 §2.7).</summary>
[Route("api/tables")]
public sealed class TablesController(IDiningTableService tableService, IFloorPlanService floorPlanService) : BaseApiController
{
    /// <summary>Theo (khu vực, mã); <c>includeHidden=true</c> cần thêm quyền <c>tables.update</c>.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Tables.View)]
    [ProducesResponseType<IReadOnlyList<DiningTableDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DiningTableDto>>> GetAll([FromQuery] TableQuery query, CancellationToken ct)
    {
        if (query.IncludeHidden && await PermissionGuard.CheckAsync(HttpContext, [ProjectPermissions.Tables.Update]) is { } forbidden)
            return (ActionResult)forbidden;
        return Ok(await tableService.GetListAsync(query, ct));
    }

    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.View)]
    [ProducesResponseType<DiningTableDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<DiningTableDto>> GetById(Guid id, CancellationToken ct) => Ok(await tableService.GetByIdAsync(id, ct));

    /// <summary>Trùng mã → 409 (TC-02); sức chứa ngoài 1–20 → 400.</summary>
    [HttpPost]
    [AuthorizePermission(ProjectPermissions.Tables.Create)]
    [ProducesResponseType<DiningTableDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<DiningTableDto>> Create(SaveTableRequest request, CancellationToken ct)
    {
        var item = await tableService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>Đổi khu vực bàn đang có khách → 400 BanDangCoKhach (BR-28).</summary>
    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.Update)]
    [ProducesResponseType<DiningTableDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<DiningTableDto>> Update(Guid id, SaveTableRequest request, CancellationToken ct) =>
        Ok(await tableService.UpdateAsync(id, request, ct));

    /// <summary>"Lưu sơ đồ": vị trí mới của các bàn.</summary>
    [HttpPut("layout")]
    [AuthorizePermission(ProjectPermissions.Tables.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SaveLayout(SaveLayoutRequest request, CancellationToken ct)
    {
        await tableService.SaveLayoutAsync(request, ct);
        return NoContent();
    }

    /// <summary>Ẩn bàn đang có khách → 400 BanDangCoKhach (TC-03).</summary>
    [HttpPatch("{id:guid}/hidden")]
    [AuthorizePermission(ProjectPermissions.Tables.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetHidden(Guid id, SetTableHiddenRequest request, CancellationToken ct)
    {
        await tableService.SetHiddenAsync(id, request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.Tables.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await tableService.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Màn Gọi món, Thanh toán của bàn; bàn đã gộp trả dữ liệu bàn chính (UC-09 E2).</summary>
    [HttpGet("{id:guid}/service")]
    [AuthorizePermission(ProjectPermissions.Tables.View, ProjectPermissions.Orders.View)]
    [ProducesResponseType<TableServiceDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<TableServiceDto>> GetService(Guid id, CancellationToken ct) =>
        Ok(await floorPlanService.GetTableServiceAsync(id, ct));

    /// <summary>Mở bàn (UC-02): 201 hóa đơn mới; cùng <c>clientRequestId</c> → 200 hóa đơn cũ; bàn vừa có người mở → 409 BanVuaDuocMo.</summary>
    [HttpPost("{id:guid}/open")]
    [AuthorizePermission(ProjectPermissions.Tables.Open)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderDto>> Open(Guid id, OpenTableRequest request, CancellationToken ct)
    {
        var result = await floorPlanService.OpenTableAsync(id, request, ct);
        return result.Created ? Created($"/api/orders/{result.Value.Id}", result.Value) : Ok(result.Value);
    }

    /// <summary>"Dọn xong": bàn Chờ dọn → Trống (FR-31).</summary>
    [HttpPost("{id:guid}/clear")]
    [AuthorizePermission(ProjectPermissions.Tables.Open)]
    [ProducesResponseType<TableCardDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<TableCardDto>> Clear(Guid id, CancellationToken ct) => Ok(await floorPlanService.ClearTableAsync(id, ct));
}

/// <summary>Sơ đồ bàn (FR-04, 07 §2.7).</summary>
[Route("api/floor-plan")]
public sealed class FloorPlanController(IFloorPlanService floorPlanService) : BaseApiController
{
    /// <summary>Khu vực và thẻ bàn chưa ẩn kèm trạng thái sống, thanh đếm.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Tables.View)]
    [ProducesResponseType<FloorPlanDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<FloorPlanDto>> Get(CancellationToken ct) => Ok(await floorPlanService.GetFloorPlanAsync(ct));
}

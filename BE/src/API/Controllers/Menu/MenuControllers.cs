using API.Base;
using API.Filters;
using Application.Common.Models;
using Application.Constants;
using Application.DTOs.Menu;
using Application.Interfaces.Services.Menu;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers.Menu;

/// <summary>Thực đơn gộp cho màn gọi món và màn bếp (07 §2.1).</summary>
[Route("api/menu")]
public sealed class MenuController(IMenuService menuService) : BaseApiController
{
    /// <summary>Danh mục, món chưa ẩn (kể cả tạm hết, FR-09), ghi chú nhanh trong một lần gọi.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.Orders.Create, ProjectPermissions.MenuItems.View)]
    [ProducesResponseType<MenuBundle>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MenuBundle>> Get(CancellationToken ct) => Ok(await menuService.GetBundleAsync(ct));
}

/// <summary>Danh mục món (UC-03 1a, FR-06, 07 §2.2).</summary>
[Route("api/categories")]
public sealed class CategoriesController(ICategoryService categoryService) : BaseApiController
{
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.MenuItems.View)]
    [ProducesResponseType<IReadOnlyList<CategoryDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CategoryDto>>> GetAll(CancellationToken ct) => Ok(await categoryService.GetListAsync(ct));

    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.View)]
    [ProducesResponseType<CategoryDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CategoryDto>> GetById(Guid id, CancellationToken ct) => Ok(await categoryService.GetByIdAsync(id, ct));

    /// <summary>Thêm danh mục, xếp cuối. Trùng mã → 409 <c>errors.code</c>.</summary>
    [HttpPost]
    [AuthorizePermission(ProjectPermissions.MenuItems.Create)]
    [ProducesResponseType<CategoryDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CategoryDto>> Create(SaveCategoryRequest request, CancellationToken ct)
    {
        var item = await categoryService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType<CategoryDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CategoryDto>> Update(Guid id, SaveCategoryRequest request, CancellationToken ct) =>
        Ok(await categoryService.UpdateAsync(id, request, ct));

    /// <summary>Đủ mọi id theo thứ tự mới, đánh lại 10, 20, 30…; thiếu, thừa id → 400 <c>errors.ids</c>.</summary>
    [HttpPut("order")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Reorder(ReorderRequest request, CancellationToken ct)
    {
        await categoryService.ReorderAsync(request, ct);
        return NoContent();
    }

    /// <summary>Còn món → 400 kèm <c>itemCount</c>.</summary>
    [HttpDelete("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await categoryService.DeleteAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Món (UC-03, UC-04, 07 §2.3).</summary>
[Route("api/menu-items")]
public sealed class MenuItemsController(IMenuItemService menuItemService) : BaseApiController
{
    /// <summary>Phân trang; <c>search</c> theo mã, tên (không dấu); mặc định theo sortOrder tăng dần.</summary>
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.MenuItems.View)]
    [ProducesResponseType<PaginatedResult<MenuItemDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PaginatedResult<MenuItemDto>>> GetAll([FromQuery] MenuItemQuery query, CancellationToken ct) =>
        Ok(await menuItemService.GetPagedAsync(query, ct));

    [HttpGet("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.View)]
    [ProducesResponseType<MenuItemDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MenuItemDto>> GetById(Guid id, CancellationToken ct) => Ok(await menuItemService.GetByIdAsync(id, ct));

    [HttpPost]
    [AuthorizePermission(ProjectPermissions.MenuItems.Create)]
    [ProducesResponseType<MenuItemDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<MenuItemDto>> Create(SaveMenuItemRequest request, CancellationToken ct)
    {
        var item = await menuItemService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>Món đã gọi giữ giá lúc gọi (UC-03 5a).</summary>
    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType<MenuItemDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MenuItemDto>> Update(Guid id, SaveMenuItemRequest request, CancellationToken ct) =>
        Ok(await menuItemService.UpdateAsync(id, request, ct));

    /// <summary>Báo tạm hết, bán lại (FR-09); phát <c>menu-changed</c>.</summary>
    [HttpPatch("{id:guid}/availability")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Availability)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetAvailability(Guid id, SetAvailabilityRequest request, CancellationToken ct)
    {
        await menuItemService.SetAvailabilityAsync(id, request, ct);
        return NoContent();
    }

    [HttpPatch("{id:guid}/hidden")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetHidden(Guid id, SetHiddenRequest request, CancellationToken ct)
    {
        await menuItemService.SetHiddenAsync(id, request, ct);
        return NoContent();
    }

    /// <summary>Multipart field <c>file</c>, JPG/PNG/WebP tối đa 2 MB → <c>{ imageUrl }</c>.</summary>
    [HttpPost("{id:guid}/image")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(UploadLimits.MaxImageRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = UploadLimits.MaxImageRequestBytes)]
    [ProducesResponseType<MenuItemImageResult>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MenuItemImageResult>> UploadImage(Guid id, IFormFile? file, CancellationToken ct)
    {
        await using var content = file?.OpenReadStream() ?? Stream.Null;
        return Ok(await menuItemService.UploadImageAsync(id, content, file?.Length ?? 0, ct));
    }

    /// <summary>Đã từng gọi → 400 "Món đã có trong hóa đơn, chỉ có thể ẩn" (BR-28, TC-05).</summary>
    [HttpDelete("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await menuItemService.DeleteAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Ghi chú nhanh (FR-08, 07 §2.4).</summary>
[Route("api/quick-notes")]
public sealed class QuickNotesController(IQuickNoteService quickNoteService) : BaseApiController
{
    [HttpGet]
    [AuthorizePermission(ProjectPermissions.MenuItems.View, ProjectPermissions.Orders.Create)]
    [ProducesResponseType<IReadOnlyList<QuickNoteDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<QuickNoteDto>>> GetAll(CancellationToken ct) => Ok(await quickNoteService.GetListAsync(ct));

    /// <summary>Trùng → 409 <c>errors.content</c> "Ghi chú đã có".</summary>
    [HttpPost]
    [AuthorizePermission(ProjectPermissions.MenuItems.Create)]
    [ProducesResponseType<QuickNoteDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<QuickNoteDto>> Create(SaveQuickNoteRequest request, CancellationToken ct)
    {
        var item = await quickNoteService.CreateAsync(request, ct);
        return Created($"/api/quick-notes/{item.Id}", item);
    }

    [HttpPut("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType<QuickNoteDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<QuickNoteDto>> Update(Guid id, SaveQuickNoteRequest request, CancellationToken ct) =>
        Ok(await quickNoteService.UpdateAsync(id, request, ct));

    [HttpPut("order")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Update)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Reorder(ReorderRequest request, CancellationToken ct)
    {
        await quickNoteService.ReorderAsync(request, ct);
        return NoContent();
    }

    /// <summary>Xóa cứng (món gọi đã chụp nội dung).</summary>
    [HttpDelete("{id:guid}")]
    [AuthorizePermission(ProjectPermissions.MenuItems.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await quickNoteService.DeleteAsync(id, ct);
        return NoContent();
    }
}

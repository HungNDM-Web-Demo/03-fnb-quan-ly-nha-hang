using Application.Common.Models;
using Application.DTOs.Menu;

namespace Application.Interfaces.Services.Menu;

/// <summary>Thực đơn gộp cho màn gọi món (07 §2.1).</summary>
public interface IMenuService
{
    Task<MenuBundle> GetBundleAsync(CancellationToken ct = default);
}

/// <summary>Danh mục món (UC-03 1a, FR-06, 07 §2.2).</summary>
public interface ICategoryService
{
    Task<IReadOnlyList<CategoryDto>> GetListAsync(CancellationToken ct = default);

    Task<CategoryDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<CategoryDto> CreateAsync(SaveCategoryRequest request, CancellationToken ct = default);

    Task<CategoryDto> UpdateAsync(Guid id, SaveCategoryRequest request, CancellationToken ct = default);

    Task ReorderAsync(ReorderRequest request, CancellationToken ct = default);

    /// <summary>Còn món → 400 kèm <c>itemCount</c>.</summary>
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Món (UC-03, UC-04, 07 §2.3).</summary>
public interface IMenuItemService
{
    Task<PaginatedResult<MenuItemDto>> GetPagedAsync(MenuItemQuery query, CancellationToken ct = default);

    Task<MenuItemDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<MenuItemDto> CreateAsync(SaveMenuItemRequest request, CancellationToken ct = default);

    Task<MenuItemDto> UpdateAsync(Guid id, SaveMenuItemRequest request, CancellationToken ct = default);

    /// <summary>Báo tạm hết, bán lại (FR-09); phát <c>menu-changed</c>.</summary>
    Task SetAvailabilityAsync(Guid id, SetAvailabilityRequest request, CancellationToken ct = default);

    Task SetHiddenAsync(Guid id, SetHiddenRequest request, CancellationToken ct = default);

    Task<MenuItemImageResult> UploadImageAsync(Guid id, Stream content, long sizeBytes, CancellationToken ct = default);

    /// <summary>Đã từng gọi → 400 "Món đã có trong hóa đơn, chỉ có thể ẩn" (BR-28, TC-05).</summary>
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Ghi chú nhanh (FR-08, 07 §2.4).</summary>
public interface IQuickNoteService
{
    Task<IReadOnlyList<QuickNoteDto>> GetListAsync(CancellationToken ct = default);

    Task<QuickNoteDto> CreateAsync(SaveQuickNoteRequest request, CancellationToken ct = default);

    Task<QuickNoteDto> UpdateAsync(Guid id, SaveQuickNoteRequest request, CancellationToken ct = default);

    Task ReorderAsync(ReorderRequest request, CancellationToken ct = default);

    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

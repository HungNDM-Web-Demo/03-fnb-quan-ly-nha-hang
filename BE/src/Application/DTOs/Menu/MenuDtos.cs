using Application.Common.Models;
using Domain.Enums.Pos.MenuItems;

namespace Application.DTOs.Menu;

// DTO thực đơn (07 §2.1–2.4): danh mục, món, ghi chú nhanh và thực đơn gộp cho màn gọi món.

/// <summary><c>GET /api/menu</c>: danh mục chưa ẩn, món chưa ẩn, ghi chú nhanh trong một lần gọi.</summary>
public sealed class MenuBundle
{
    public IReadOnlyList<CategoryDto> Categories { get; init; } = [];
    public IReadOnlyList<MenuItemDto> Items { get; init; } = [];
    public IReadOnlyList<QuickNoteDto> QuickNotes { get; init; } = [];
}

public sealed class CategoryDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Color { get; init; } = string.Empty;
    public int SortOrder { get; init; }
    public bool IsHidden { get; init; }

    /// <summary>Món chưa xóa, kể cả ẩn.</summary>
    public int ItemCount { get; init; }
}

public sealed class SaveCategoryRequest
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Color { get; init; } = string.Empty;
    public bool IsHidden { get; init; }
}

/// <summary>Sắp xếp lại: đủ mọi id theo thứ tự mới, đánh lại 10, 20, 30…</summary>
public sealed class ReorderRequest
{
    public IReadOnlyList<Guid> Ids { get; init; } = [];
}

public sealed class MenuItemDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = string.Empty;
    public string? ImageUrl { get; init; }
    public string? Description { get; init; }
    public string Unit { get; init; } = string.Empty;
    public PricingType PricingType { get; init; }
    public decimal Price { get; init; }
    public KitchenStation Station { get; init; }
    public int? PrepMinutes { get; init; }
    public bool IsSoldOut { get; init; }
    public bool IsHidden { get; init; }
    public MenuItemStatus Status { get; init; }
    public int SortOrder { get; init; }

    /// <summary>Đã có trong Pos_OrderItems → FE khóa nút Xóa, gợi ý Ẩn.</summary>
    public bool EverOrdered { get; init; }

    public DateTime UpdatedAt { get; init; }
}

public sealed class SaveMenuItemRequest
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid CategoryId { get; init; }
    public string? Description { get; init; }
    public string Unit { get; init; } = string.Empty;
    public PricingType PricingType { get; init; }
    public decimal Price { get; init; }
    public KitchenStation Station { get; init; }
    public int? PrepMinutes { get; init; }

    /// <summary>Bỏ trống khi tạo → cuối danh mục.</summary>
    public int? SortOrder { get; init; }
}

public sealed class MenuItemQuery : PaginationQuery
{
    public Guid? CategoryId { get; set; }
    public MenuItemStatus? Status { get; set; }
    public KitchenStation? Station { get; set; }
}

public sealed class SetAvailabilityRequest
{
    public bool IsSoldOut { get; init; }
}

public sealed class SetHiddenRequest
{
    public bool IsHidden { get; init; }
}

public sealed class MenuItemImageResult
{
    public string ImageUrl { get; init; } = string.Empty;
}

public sealed class QuickNoteDto : IHasGuidId
{
    public Guid Id { get; init; }
    public string Content { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

public sealed class SaveQuickNoteRequest
{
    public string Content { get; init; } = string.Empty;
}

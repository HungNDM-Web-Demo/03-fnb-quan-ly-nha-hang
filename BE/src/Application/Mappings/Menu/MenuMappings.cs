using Application.DTOs.Menu;
using Domain.Entities.Pos.MenuItems;

namespace Application.Mappings.Menu;

public static class MenuMappings
{
    public static CategoryDto ToDto(this Category category, int itemCount) => new()
    {
        Id = category.Id,
        Code = category.Code,
        Name = category.Name,
        Color = category.Color,
        SortOrder = category.SortOrder,
        IsHidden = category.IsHidden,
        ItemCount = itemCount
    };

    public static MenuItemDto ToDto(this MenuItem item, string categoryName, bool everOrdered) => new()
    {
        Id = item.Id,
        Code = item.Code,
        Name = item.Name,
        CategoryId = item.CategoryId,
        CategoryName = categoryName,
        ImageUrl = item.ImageUrl,
        Description = item.Description,
        Unit = item.Unit,
        PricingType = item.PricingType,
        Price = item.Price,
        Station = item.Station,
        PrepMinutes = item.PrepMinutes,
        IsSoldOut = item.IsSoldOut,
        IsHidden = item.IsHidden,
        Status = item.Status,
        SortOrder = item.SortOrder,
        EverOrdered = everOrdered,
        UpdatedAt = item.UpdatedAt ?? item.CreatedAt
    };

    public static QuickNoteDto ToDto(this QuickNote note) => new()
    {
        Id = note.Id,
        Content = note.Content,
        SortOrder = note.SortOrder
    };
}

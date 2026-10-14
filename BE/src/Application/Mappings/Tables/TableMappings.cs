using Application.DTOs.Tables;
using Domain.Entities.Pos.Tables;

namespace Application.Mappings.Tables;

public static class TableMappings
{
    public static AreaDto ToDto(this Area area, int tableCount) => new()
    {
        Id = area.Id,
        Code = area.Code,
        Name = area.Name,
        SortOrder = area.SortOrder,
        IsHidden = area.IsHidden,
        TableCount = tableCount
    };

    public static DiningTableDto ToDto(this DiningTable table, Area area, bool everUsed) => new()
    {
        Id = table.Id,
        Code = table.Code,
        AreaId = table.AreaId,
        AreaCode = area.Code,
        AreaName = area.Name,
        Capacity = table.Capacity,
        Shape = table.Shape,
        X = table.PosX,
        Y = table.PosY,
        IsHidden = table.IsHidden,
        EverUsed = everUsed
    };
}

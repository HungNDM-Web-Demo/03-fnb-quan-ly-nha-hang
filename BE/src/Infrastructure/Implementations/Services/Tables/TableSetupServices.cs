using Application.Common.Exceptions;
using Application.DTOs.Menu;
using Application.DTOs.Tables;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.Tables;
using Application.Mappings.Tables;
using Application.Validators.Tables;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Tables;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Tables;

/// <summary>Khu vực (UC-01 2a, FR-02, 07 §2.5). Mã khu vực không đổi sau khi tạo.</summary>
public sealed class AreaService(
    IGenericRepository<Area> areas,
    IGenericRepository<DiningTable> tables,
    IUnitOfWork unitOfWork,
    IPosEventPublisher events) : IAreaService
{
    public const string NotFoundMessage = "Không tìm thấy khu vực.";

    public async Task<IReadOnlyList<AreaDto>> GetListAsync(bool includeHidden, CancellationToken ct = default)
    {
        var query = areas.QueryNoTracking();
        if (!includeHidden)
            query = query.Where(a => !a.IsHidden);
        var list = await query.OrderBy(a => a.SortOrder).ThenBy(a => a.Code).ToListAsync(ct);
        var counts = await CountsAsync(ct);
        return list.Select(a => a.ToDto(counts.GetValueOrDefault(a.Id))).ToList();
    }

    public async Task<AreaDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var area = await areas.QueryNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        return area.ToDto(await tables.QueryNoTracking().CountAsync(t => t.AreaId == id, ct));
    }

    public async Task<AreaDto> CreateAsync(SaveAreaRequest request, CancellationToken ct = default)
    {
        var code = Area.NormalizeCode(request.Code);
        if (await areas.AnyAsync(a => a.Code == code, ct))
            throw new ConflictException("Mã khu vực đã tồn tại", "code");

        var sortOrder = (await areas.QueryNoTracking().MaxAsync(a => (int?)a.SortOrder, ct) ?? 0) + PosRules.SortOrderStep;
        var area = Area.Create(code, request.Name, sortOrder, request.IsHidden);
        await areas.AddAsync(area, ct);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([], ct);
        return area.ToDto(0);
    }

    public async Task<AreaDto> UpdateAsync(Guid id, SaveAreaRequest request, CancellationToken ct = default)
    {
        var area = await areas.Query().FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        if (!string.Equals(Area.NormalizeCode(request.Code), area.Code, StringComparison.Ordinal))
            throw FieldErrors.Single("code", "Không đổi được mã khu vực");

        if (request.IsHidden && !area.IsHidden && await tables.AnyAsync(t => t.AreaId == id && t.Status != Domain.Enums.Pos.Tables.TableStatus.Trong, ct))
            throw new DomainException("Khu vực đang có bàn có khách");

        area.Update(request.Name, request.IsHidden);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task ReorderAsync(ReorderRequest request, CancellationToken ct = default)
    {
        var all = await areas.Query().ToListAsync(ct);
        if (all.Count != request.Ids.Count || all.Any(a => !request.Ids.Contains(a.Id)))
            throw FieldErrors.Single("ids", "Danh sách sắp xếp phải gồm đủ mọi khu vực");

        var byId = all.ToDictionary(a => a.Id);
        for (var i = 0; i < request.Ids.Count; i++)
            byId[request.Ids[i]].SetSortOrder((i + 1) * PosRules.SortOrderStep);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([], ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var area = await areas.Query().FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        var count = await tables.QueryNoTracking().CountAsync(t => t.AreaId == id, ct);
        if (count > 0)
            throw new DomainException($"Khu vực đang có {count} bàn", new Dictionary<string, object?> { ["tableCount"] = count });

        areas.Delete(area);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([], ct);
    }

    private async Task<Dictionary<Guid, int>> CountsAsync(CancellationToken ct) =>
        await tables.QueryNoTracking().GroupBy(t => t.AreaId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
}

/// <summary>
/// Thiết lập bàn (UC-01, FR-03, 07 §2.6). Bàn đang có khách (trạng thái khác Trống) không ẩn, xóa, đổi khu vực được
/// (BR-28, TC-03). Hai bàn chồng ô không kiểm ở BE.
/// </summary>
public sealed class DiningTableService(
    IGenericRepository<DiningTable> tables,
    IGenericRepository<Area> areas,
    IGenericRepository<Order> orders,
    IUnitOfWork unitOfWork,
    IPosEventPublisher events) : IDiningTableService
{
    public const string NotFoundMessage = "Không tìm thấy bàn.";

    public async Task<IReadOnlyList<DiningTableDto>> GetListAsync(TableQuery query, CancellationToken ct = default)
    {
        var source = tables.QueryNoTracking().Include(t => t.Area).AsQueryable();
        if (query.AreaId is { } areaId)
            source = source.Where(t => t.AreaId == areaId);
        if (!query.IncludeHidden)
            source = source.Where(t => !t.IsHidden && !t.Area!.IsHidden);

        var list = await source.ToListAsync(ct);
        var used = await UsedTableIdsAsync(list.Select(t => t.Id).ToList(), ct);
        return list
            .OrderBy(t => t.Area!.SortOrder).ThenBy(t => t.Code, StringComparer.Ordinal)
            .Select(t => t.ToDto(t.Area!, used.Contains(t.Id)))
            .ToList();
    }

    public async Task<DiningTableDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var table = await tables.QueryNoTracking().Include(t => t.Area).FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new NotFoundException(NotFoundMessage);
        return table.ToDto(table.Area!, await orders.AnyAsync(o => o.TableId == id, ct));
    }

    public async Task<DiningTableDto> CreateAsync(SaveTableRequest request, CancellationToken ct = default)
    {
        var code = await ValidateAsync(request, null, ct);
        var table = DiningTable.Create(code, request.AreaId, request.Capacity, request.Shape, request.X, request.Y);
        await tables.AddAsync(table, ct);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([table.Id], ct);
        return await GetByIdAsync(table.Id, ct);
    }

    public async Task<DiningTableDto> UpdateAsync(Guid id, SaveTableRequest request, CancellationToken ct = default)
    {
        var table = await LoadAsync(id, ct);
        var code = await ValidateAsync(request, id, ct);
        if (table.AreaId != request.AreaId && table.IsOccupied)
            throw PosErrors.TableOccupied();

        table.Update(code, request.AreaId, request.Capacity, request.Shape, request.X, request.Y);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([id], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task SaveLayoutAsync(SaveLayoutRequest request, CancellationToken ct = default)
    {
        var ids = request.Items.Select(i => i.Id).ToList();
        var list = await tables.Query().Where(t => ids.Contains(t.Id)).ToListAsync(ct);
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            var table = list.FirstOrDefault(t => t.Id == item.Id)
                ?? throw FieldErrors.Single($"items[{i}].id", NotFoundMessage);
            if (!TableGrid.FitsX(table.Shape, item.X))
                throw FieldErrors.Single($"items[{i}].x", TableGrid.OutOfGridMessage);
            if (!TableGrid.FitsY(item.Y))
                throw FieldErrors.Single($"items[{i}].y", TableGrid.OutOfGridMessage);
            table.MoveTo(item.X, item.Y);
        }

        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync(ids, ct);
    }

    public async Task SetHiddenAsync(Guid id, SetTableHiddenRequest request, CancellationToken ct = default)
    {
        var table = await LoadAsync(id, ct);
        if (request.IsHidden && table.IsOccupied)
            throw PosErrors.TableOccupied();

        table.SetHidden(request.IsHidden);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([id], ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var table = await LoadAsync(id, ct);
        if (table.IsOccupied)
            throw PosErrors.TableOccupied();

        tables.Delete(table);
        await unitOfWork.SaveChangesAsync(ct);
        await events.TablesChangedAsync([id], ct);
    }

    private async Task<DiningTable> LoadAsync(Guid id, CancellationToken ct) =>
        await tables.Query().FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);

    /// <summary>Khu vực tồn tại; mã dạng {mã khu vực}-NN (400); trùng mã → 409 (TC-02). Trả mã đã chuẩn hóa.</summary>
    private async Task<string> ValidateAsync(SaveTableRequest request, Guid? currentId, CancellationToken ct)
    {
        var area = await areas.QueryNoTracking().FirstOrDefaultAsync(a => a.Id == request.AreaId, ct)
            ?? throw FieldErrors.Single("areaId", "Khu vực không tồn tại");

        var code = DiningTable.NormalizeCode(request.Code);
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, $"^{area.Code}-\\d{{2}}$"))
            throw FieldErrors.Single("code", $"Mã bàn dạng {area.Code}-01");

        if (await tables.AnyAsync(t => t.Code == code && t.Id != currentId, ct))
            throw new ConflictException("Mã bàn đã tồn tại", "code");

        return code;
    }

    private async Task<HashSet<Guid>> UsedTableIdsAsync(IReadOnlyList<Guid> ids, CancellationToken ct) =>
        (await orders.QueryNoTracking().Where(o => ids.Contains(o.TableId)).Select(o => o.TableId).Distinct().ToListAsync(ct)).ToHashSet();
}

using Application.Common.Exceptions;
using Application.Common.Models;
using Application.Constants;
using Application.DTOs.Menu;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.Menu;
using Application.Interfaces.Services.Realtime;
using Application.Interfaces.Services.Uploads;
using Application.Mappings.Menu;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Enums.Pos.MenuItems;
using FluentValidation;
using FluentValidation.Results;
using Infrastructure.Extensions;
using Infrastructure.Implementations.Services.Pos;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Implementations.Services.Menu;

/// <summary>Thực đơn gộp cho màn gọi món (07 §2.1): danh mục, món chưa ẩn (kể cả tạm hết), ghi chú nhanh.</summary>
public sealed class MenuService(
    IGenericRepository<Category> categories,
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<QuickNote> quickNotes,
    IGenericRepository<OrderItem> orderItems) : IMenuService
{
    public async Task<MenuBundle> GetBundleAsync(CancellationToken ct = default)
    {
        var visibleCategories = await categories.QueryNoTracking().Where(c => !c.IsHidden).OrderBy(c => c.SortOrder).ToListAsync(ct);
        var categoryOrder = visibleCategories.Select((c, i) => (c.Id, i)).ToDictionary(x => x.Id, x => x.i);
        var counts = await menuItems.QueryNoTracking().GroupBy(m => m.CategoryId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var items = await menuItems.QueryNoTracking().Where(m => !m.IsHidden).ToListAsync(ct);
        var everOrdered = await MenuItemService.OrderedIdsAsync(orderItems, items.Select(i => i.Id).ToList(), ct);
        var names = visibleCategories.ToDictionary(c => c.Id, c => c.Name);

        return new MenuBundle
        {
            Categories = visibleCategories.Select(c => c.ToDto(counts.GetValueOrDefault(c.Id))).ToList(),
            Items = items.Where(i => categoryOrder.ContainsKey(i.CategoryId))
                .OrderBy(i => categoryOrder[i.CategoryId]).ThenBy(i => i.SortOrder).ThenBy(i => i.Code, StringComparer.Ordinal)
                .Select(i => i.ToDto(names[i.CategoryId], everOrdered.Contains(i.Id)))
                .ToList(),
            QuickNotes = (await quickNotes.QueryNoTracking().OrderBy(n => n.SortOrder).ToListAsync(ct)).Select(n => n.ToDto()).ToList()
        };
    }
}

/// <summary>Danh mục món (UC-03 1a, FR-06, 07 §2.2).</summary>
public sealed class CategoryService(
    IGenericRepository<Category> categories,
    IGenericRepository<MenuItem> menuItems,
    IUnitOfWork unitOfWork,
    IPosEventPublisher events) : ICategoryService
{
    public const string NotFoundMessage = "Không tìm thấy danh mục.";

    public async Task<IReadOnlyList<CategoryDto>> GetListAsync(CancellationToken ct = default)
    {
        var list = await categories.QueryNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Code).ToListAsync(ct);
        var counts = await CountsAsync(ct);
        return list.Select(c => c.ToDto(counts.GetValueOrDefault(c.Id))).ToList();
    }

    public async Task<CategoryDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var category = await categories.QueryNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException(NotFoundMessage);
        var count = await menuItems.QueryNoTracking().CountAsync(m => m.CategoryId == id, ct);
        return category.ToDto(count);
    }

    public async Task<CategoryDto> CreateAsync(SaveCategoryRequest request, CancellationToken ct = default)
    {
        await EnsureCodeUniqueAsync(request.Code, null, ct);
        var sortOrder = (await categories.QueryNoTracking().MaxAsync(c => (int?)c.SortOrder, ct) ?? 0) + PosRules.SortOrderStep;
        var category = Category.Create(request.Code, request.Name, request.Color, sortOrder, request.IsHidden);
        await categories.AddAsync(category, ct);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
        return category.ToDto(0);
    }

    public async Task<CategoryDto> UpdateAsync(Guid id, SaveCategoryRequest request, CancellationToken ct = default)
    {
        var category = await categories.Query().FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        await EnsureCodeUniqueAsync(request.Code, id, ct);
        category.Update(request.Code, request.Name, request.Color, request.IsHidden);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task ReorderAsync(ReorderRequest request, CancellationToken ct = default)
    {
        var all = await categories.Query().ToListAsync(ct);
        if (all.Count != request.Ids.Count || all.Any(c => !request.Ids.Contains(c.Id)))
            throw FieldErrors.Single("ids", "Danh sách sắp xếp phải gồm đủ mọi danh mục");

        var byId = all.ToDictionary(c => c.Id);
        for (var i = 0; i < request.Ids.Count; i++)
            byId[request.Ids[i]].SetSortOrder((i + 1) * PosRules.SortOrderStep);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var category = await categories.Query().FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        var count = await menuItems.QueryNoTracking().CountAsync(m => m.CategoryId == id, ct);
        if (count > 0)
        {
            throw new DomainException(
                $"Danh mục đang có {count} món, chuyển món sang danh mục khác trước",
                new Dictionary<string, object?> { ["itemCount"] = count });
        }

        categories.Delete(category);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
    }

    private async Task<Dictionary<Guid, int>> CountsAsync(CancellationToken ct) =>
        await menuItems.QueryNoTracking().GroupBy(m => m.CategoryId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

    private async Task EnsureCodeUniqueAsync(string code, Guid? currentId, CancellationToken ct)
    {
        var normalized = Category.NormalizeCode(code);
        if (await categories.AnyAsync(c => c.Code == normalized && c.Id != currentId, ct))
            throw new ConflictException("Mã danh mục đã tồn tại", "code");
    }
}

/// <summary>Món (UC-03, UC-04, 07 §2.3). Thứ tự lỗi: định dạng (validator) → danh mục 400 → trùng mã 409.</summary>
public sealed class MenuItemService(
    IGenericRepository<MenuItem> menuItems,
    IGenericRepository<Category> categories,
    IGenericRepository<OrderItem> orderItems,
    IUnitOfWork unitOfWork,
    IImageInspector imageInspector,
    IFileStorage fileStorage,
    IPosEventPublisher events) : IMenuItemService
{
    /// <summary>Thư mục ảnh món trong <c>wwwroot/uploads</c>.</summary>
    public const string UploadFolder = "menu";

    public const string NotFoundMessage = "Không tìm thấy món.";
    public const string EverOrderedMessage = "Món đã có trong hóa đơn, chỉ có thể ẩn";

    private const string UploadsPrefix = "/uploads/";

    public async Task<PaginatedResult<MenuItemDto>> GetPagedAsync(MenuItemQuery query, CancellationToken ct = default)
    {
        var source = menuItems.QueryNoTracking().Include(m => m.Category).AsQueryable();

        var term = query.GetSearchTerm();
        if (term is not null)
        {
            var pattern = LikePattern.Contains(term);
            source = source.Where(m => AppDbFunctions.Matches(m.Code, pattern) || AppDbFunctions.Matches(m.Name, pattern));
        }

        if (query.CategoryId is { } categoryId)
            source = source.Where(m => m.CategoryId == categoryId);
        if (query.Station is { } station)
            source = source.Where(m => m.Station == station);

        source = query.Status switch
        {
            MenuItemStatus.An => source.Where(m => m.IsHidden),
            MenuItemStatus.TamHet => source.Where(m => !m.IsHidden && m.IsSoldOut),
            MenuItemStatus.DangBan => source.Where(m => !m.IsHidden && !m.IsSoldOut),
            _ => source
        };

        if (string.IsNullOrWhiteSpace(query.SortBy))
        {
            query.SortBy = nameof(MenuItem.SortOrder);
            query.SortDir ??= "asc";
        }

        var page = await source.ApplySorting(query).ToPaginatedResultAsync(query, ct);
        var ordered = await OrderedIdsAsync(orderItems, page.Items.Select(m => m.Id).ToList(), ct);
        return page.Map(items => items.Select(m => m.ToDto(m.Category?.Name ?? string.Empty, ordered.Contains(m.Id))).ToList());
    }

    public async Task<MenuItemDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var item = await menuItems.QueryNoTracking().Include(m => m.Category).FirstOrDefaultAsync(m => m.Id == id, ct)
            ?? throw new NotFoundException(NotFoundMessage);
        return item.ToDto(item.Category?.Name ?? string.Empty, await orderItems.AnyAsync(i => i.MenuItemId == id, ct));
    }

    public async Task<MenuItemDto> CreateAsync(SaveMenuItemRequest request, CancellationToken ct = default)
    {
        await EnsureCategoryAsync(request.CategoryId, ct);
        await EnsureCodeUniqueAsync(request.Code, null, ct);

        var sortOrder = request.SortOrder
            ?? (await menuItems.QueryNoTracking().Where(m => m.CategoryId == request.CategoryId).MaxAsync(m => (int?)m.SortOrder, ct) ?? 0)
            + PosRules.SortOrderStep;
        var item = MenuItem.Create(
            request.Code, request.Name, request.CategoryId, request.Description, request.Unit, request.PricingType, request.Price,
            request.Station, request.PrepMinutes, sortOrder);
        await menuItems.AddAsync(item, ct);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([item.Id], ct);
        return await GetByIdAsync(item.Id, ct);
    }

    public async Task<MenuItemDto> UpdateAsync(Guid id, SaveMenuItemRequest request, CancellationToken ct = default)
    {
        var item = await LoadAsync(id, ct);
        await EnsureCategoryAsync(request.CategoryId, ct);
        await EnsureCodeUniqueAsync(request.Code, id, ct);

        // UC-03 5a: món đã gọi giữ giá lúc gọi (đã chụp ở Pos_OrderItems), món gọi sau dùng giá mới.
        item.Update(
            request.Code, request.Name, request.CategoryId, request.Description, request.Unit, request.PricingType, request.Price,
            request.Station, request.PrepMinutes, request.SortOrder ?? item.SortOrder);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([id], ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task SetAvailabilityAsync(Guid id, SetAvailabilityRequest request, CancellationToken ct = default)
    {
        var item = await LoadAsync(id, ct);
        item.SetSoldOut(request.IsSoldOut);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([id], ct);
    }

    public async Task SetHiddenAsync(Guid id, SetHiddenRequest request, CancellationToken ct = default)
    {
        var item = await LoadAsync(id, ct);
        item.SetHidden(request.IsHidden);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([id], ct);
    }

    public async Task<MenuItemImageResult> UploadImageAsync(Guid id, Stream content, long sizeBytes, CancellationToken ct = default)
    {
        var item = await LoadAsync(id, ct);

        if (sizeBytes <= 0)
            throw InvalidFile("Chưa chọn file ảnh.");
        if (sizeBytes > UploadLimits.MaxImageBytes)
            throw InvalidFile("Ảnh tối đa 2 MB.");

        using var buffer = new MemoryStream((int)sizeBytes);
        await content.CopyToAsync(buffer, ct);
        if (buffer.Length > UploadLimits.MaxImageBytes)
            throw InvalidFile("Ảnh tối đa 2 MB.");

        var image = imageInspector.Inspect(buffer.GetBuffer().AsSpan(0, (int)buffer.Length));
        if (image is null || image.Format == ImageFormat.Svg)
            throw InvalidFile("Chỉ nhận ảnh JPG, PNG hoặc WebP.");

        buffer.Position = 0;
        var url = await fileStorage.SaveAsync(buffer, UploadFolder, image.Extension, ct);

        var previous = item.ImageUrl;
        item.SetImage(url);
        await unitOfWork.SaveChangesAsync(ct);

        // Ảnh tải lên trước đó không còn dùng; ảnh mẫu /seed/... nằm ở FE nên không đụng tới.
        if (previous is not null && previous.StartsWith(UploadsPrefix, StringComparison.OrdinalIgnoreCase))
            await fileStorage.DeleteAsync(previous, ct);

        await events.MenuChangedAsync([id], ct);
        return new MenuItemImageResult { ImageUrl = url };
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var item = await LoadAsync(id, ct);
        if (await orderItems.AnyAsync(i => i.MenuItemId == id, ct))
            throw new DomainException(EverOrderedMessage);

        menuItems.Delete(item);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([id], ct);
    }

    /// <summary>Món đã có trong Pos_OrderItems (BR-28).</summary>
    internal static async Task<HashSet<Guid>> OrderedIdsAsync(IGenericRepository<OrderItem> orderItems, IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0)
            return [];
        var found = await orderItems.QueryNoTracking().Where(i => ids.Contains(i.MenuItemId)).Select(i => i.MenuItemId).Distinct().ToListAsync(ct);
        return found.ToHashSet();
    }

    private async Task<MenuItem> LoadAsync(Guid id, CancellationToken ct) =>
        await menuItems.Query().FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);

    private async Task EnsureCategoryAsync(Guid categoryId, CancellationToken ct)
    {
        if (!await categories.AnyAsync(c => c.Id == categoryId, ct))
            throw FieldErrors.Single("categoryId", "Danh mục không tồn tại");
    }

    private async Task EnsureCodeUniqueAsync(string code, Guid? currentId, CancellationToken ct)
    {
        var normalized = MenuItem.NormalizeCode(code);
        if (await menuItems.AnyAsync(m => m.Code == normalized && m.Id != currentId, ct))
            throw new ConflictException("Mã món đã tồn tại", "code");
    }

    private static ValidationException InvalidFile(string message) => new([new ValidationFailure("file", message)]);
}

/// <summary>Ghi chú nhanh (FR-08, 07 §2.4). Xóa cứng vì món gọi đã chụp nội dung.</summary>
public sealed class QuickNoteService(
    IGenericRepository<QuickNote> quickNotes,
    IUnitOfWork unitOfWork,
    IPosEventPublisher events) : IQuickNoteService
{
    public const string NotFoundMessage = "Không tìm thấy ghi chú nhanh.";

    public async Task<IReadOnlyList<QuickNoteDto>> GetListAsync(CancellationToken ct = default) =>
        (await quickNotes.QueryNoTracking().OrderBy(n => n.SortOrder).ToListAsync(ct)).Select(n => n.ToDto()).ToList();

    public async Task<QuickNoteDto> CreateAsync(SaveQuickNoteRequest request, CancellationToken ct = default)
    {
        await EnsureUniqueAsync(request.Content, null, ct);
        var sortOrder = (await quickNotes.QueryNoTracking().MaxAsync(n => (int?)n.SortOrder, ct) ?? 0) + PosRules.SortOrderStep;
        var note = QuickNote.Create(request.Content, sortOrder);
        await quickNotes.AddAsync(note, ct);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
        return note.ToDto();
    }

    public async Task<QuickNoteDto> UpdateAsync(Guid id, SaveQuickNoteRequest request, CancellationToken ct = default)
    {
        var note = await quickNotes.Query().FirstOrDefaultAsync(n => n.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        await EnsureUniqueAsync(request.Content, id, ct);
        note.Update(request.Content);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
        return note.ToDto();
    }

    public async Task ReorderAsync(ReorderRequest request, CancellationToken ct = default)
    {
        var all = await quickNotes.Query().ToListAsync(ct);
        if (all.Count != request.Ids.Count || all.Any(n => !request.Ids.Contains(n.Id)))
            throw FieldErrors.Single("ids", "Danh sách sắp xếp phải gồm đủ mọi ghi chú nhanh");

        var byId = all.ToDictionary(n => n.Id);
        for (var i = 0; i < request.Ids.Count; i++)
            byId[request.Ids[i]].SetSortOrder((i + 1) * PosRules.SortOrderStep);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var note = await quickNotes.Query().FirstOrDefaultAsync(n => n.Id == id, ct) ?? throw new NotFoundException(NotFoundMessage);
        quickNotes.Delete(note);
        await unitOfWork.SaveChangesAsync(ct);
        await events.MenuChangedAsync([], ct);
    }

    private async Task EnsureUniqueAsync(string content, Guid? currentId, CancellationToken ct)
    {
        var normalized = content.Trim();
        if (await quickNotes.AnyAsync(n => n.Content == normalized && n.Id != currentId, ct))
            throw new ConflictException("Ghi chú đã có", "content");
    }
}

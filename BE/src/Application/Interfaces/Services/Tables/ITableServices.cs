using Application.DTOs.Orders;
using Application.DTOs.Tables;

namespace Application.Interfaces.Services.Tables;

/// <summary>Khu vực (UC-01 2a, FR-02, 07 §2.5).</summary>
public interface IAreaService
{
    Task<IReadOnlyList<AreaDto>> GetListAsync(bool includeHidden, CancellationToken ct = default);

    Task<AreaDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<AreaDto> CreateAsync(SaveAreaRequest request, CancellationToken ct = default);

    /// <summary>Ẩn khi có bàn đang có khách → 400 "Khu vực đang có bàn có khách".</summary>
    Task<AreaDto> UpdateAsync(Guid id, SaveAreaRequest request, CancellationToken ct = default);

    Task ReorderAsync(DTOs.Menu.ReorderRequest request, CancellationToken ct = default);

    /// <summary>Còn bàn → 400 "Khu vực đang có {n} bàn" kèm <c>tableCount</c>.</summary>
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Thiết lập bàn (UC-01, FR-03, 07 §2.6).</summary>
public interface IDiningTableService
{
    Task<IReadOnlyList<DiningTableDto>> GetListAsync(TableQuery query, CancellationToken ct = default);

    Task<DiningTableDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<DiningTableDto> CreateAsync(SaveTableRequest request, CancellationToken ct = default);

    /// <summary>Đổi khu vực bàn đang có khách → 400 BanDangCoKhach (BR-28).</summary>
    Task<DiningTableDto> UpdateAsync(Guid id, SaveTableRequest request, CancellationToken ct = default);

    /// <summary>"Lưu sơ đồ".</summary>
    Task SaveLayoutAsync(SaveLayoutRequest request, CancellationToken ct = default);

    /// <summary>Ẩn bàn đang có khách → 400 BanDangCoKhach (TC-03).</summary>
    Task SetHiddenAsync(Guid id, SetTableHiddenRequest request, CancellationToken ct = default);

    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Sơ đồ bàn và phục vụ tại bàn (UC-02, FR-04, FR-05, FR-31, 07 §2.7).</summary>
public interface IFloorPlanService
{
    /// <summary>Khu vực và thẻ bàn chưa ẩn kèm trạng thái sống, thanh đếm.</summary>
    Task<FloorPlanDto> GetFloorPlanAsync(CancellationToken ct = default);

    /// <summary>Màn Gọi món, Thanh toán của bàn; bàn đã gộp trả dữ liệu bàn chính (UC-09 E2).</summary>
    Task<TableServiceDto> GetTableServiceAsync(Guid tableId, CancellationToken ct = default);

    /// <summary>Mở bàn (UC-02); cùng <c>clientRequestId</c> → hóa đơn cũ (<c>Created = false</c>).</summary>
    Task<CreatedResult<OrderDto>> OpenTableAsync(Guid tableId, OpenTableRequest request, CancellationToken ct = default);

    /// <summary>"Dọn xong": bàn ChoDon → Trong (FR-31).</summary>
    Task<TableCardDto> ClearTableAsync(Guid tableId, CancellationToken ct = default);
}

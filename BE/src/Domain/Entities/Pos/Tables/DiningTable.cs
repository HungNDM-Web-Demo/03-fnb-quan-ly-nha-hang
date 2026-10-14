using Domain.Base;
using Domain.Common;
using Domain.Enums.Pos.Tables;

namespace Domain.Entities.Pos.Tables;

/// <summary>
/// Bàn (bảng <c>Pos_DiningTables</c>, FR-03): vị trí trên lưới sơ đồ và trạng thái phục vụ. Trạng thái chỉ đổi qua service
/// (mở bàn, tạm tính, thu đủ, gộp, dọn xong…); <see cref="Version"/> là concurrency token chặn hai phục vụ cùng mở (UC-02 E3).
/// </summary>
public class DiningTable : BaseEntity, ICreationTracked, IModificationTracked, ISoftDelete
{
    public const int CodeMaxLength = 10;

    private DiningTable()
    {
    }

    public string Code { get; private set; } = string.Empty;
    public Guid AreaId { get; private set; }
    public int Capacity { get; private set; }
    public TableShape Shape { get; private set; }
    public int PosX { get; private set; }
    public int PosY { get; private set; }
    public bool IsHidden { get; private set; }

    /// <summary>Chỉ lưu Trong, DangPhucVu, ChoThanhToan, ChoDon, DaGop; DaDat suy ra khi đọc.</summary>
    public TableStatus Status { get; private set; }

    public Guid? MergedIntoTableId { get; private set; }
    public DateTime? StatusChangedAt { get; private set; }
    public int Version { get; private set; } = 1;

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }

    public Area? Area { get; private set; }

    /// <summary>Bàn đang có khách hoặc chưa dọn: chặn ẩn, xóa, đổi khu vực (BR-28).</summary>
    public bool IsOccupied => Status != TableStatus.Trong;

    /// <summary>Có hóa đơn đang phục vụ (đang phục vụ hoặc chờ thanh toán).</summary>
    public bool IsServing => Status is TableStatus.DangPhucVu or TableStatus.ChoThanhToan;

    public static DiningTable Create(string code, Guid areaId, int capacity, TableShape shape, int x, int y)
    {
        var table = new DiningTable { Status = TableStatus.Trong };
        table.Update(code, areaId, capacity, shape, x, y);
        return table;
    }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public void Update(string code, Guid areaId, int capacity, TableShape shape, int x, int y)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("Mã bàn không được để trống.");
        if (capacity is < PosRules.CapacityMin or > PosRules.CapacityMax)
            throw new DomainException("Sức chứa từ 1 đến 20");

        Code = NormalizeCode(code);
        AreaId = areaId;
        Capacity = capacity;
        Shape = shape;
        MoveTo(x, y);
    }

    public void MoveTo(int x, int y)
    {
        PosX = Math.Max(0, x);
        PosY = Math.Max(0, y);
    }

    public void SetHidden(bool isHidden) => IsHidden = isHidden;

    /// <summary>Đổi trạng thái phục vụ (06 §4 "Chuyển trạng thái"); tăng <see cref="Version"/>.</summary>
    public void SetStatus(TableStatus status, DateTime atUtc, Guid? mergedIntoTableId = null)
    {
        if (status == TableStatus.DaDat)
            throw new DomainException("Trạng thái Đã đặt không lưu, chỉ suy ra khi đọc.");

        if (status == TableStatus.DaGop && mergedIntoTableId is null)
            throw new DomainException("Bàn đã gộp phải có bàn chính.");

        // Bàn phụ giữ bàn chính tới khi dọn xong (06 §4): DaGop → ChoDon vẫn giữ; về Trong, DangPhucVu thì xóa.
        MergedIntoTableId = status switch
        {
            TableStatus.DaGop => mergedIntoTableId,
            TableStatus.ChoDon => MergedIntoTableId,
            _ => null
        };
        Status = status;
        StatusChangedAt = atUtc;
        Version++;
    }

    /// <summary>Bàn phụ đổi bàn chính khi bàn chính chuyển đi hoặc gộp tiếp vào bàn khác.</summary>
    public void RepointMerge(Guid mainTableId)
    {
        MergedIntoTableId = mainTableId;
        Version++;
    }
}

using Domain.Base;
using Domain.Common;

namespace Domain.Entities.Pos.Tables;

/// <summary>Khu vực (bảng <c>Pos_Areas</c>, FR-02): Tầng 1, Tầng 2, Sân vườn.</summary>
public class Area : BaseEntity, ICreationTracked, IModificationTracked, ISoftDelete
{
    public const int CodeMaxLength = 2;
    public const int NameMaxLength = 50;

    private Area()
    {
    }

    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public int SortOrder { get; private set; }
    public bool IsHidden { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }

    public static Area Create(string code, string name, int sortOrder, bool isHidden = false)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("Mã khu vực không được để trống.");

        var area = new Area { Code = NormalizeCode(code), SortOrder = sortOrder };
        area.Update(name, isHidden);
        return area;
    }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public void Update(string name, bool isHidden)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("Tên khu vực không được để trống.");

        Name = name.Trim();
        IsHidden = isHidden;
    }

    public void SetSortOrder(int sortOrder) => SortOrder = sortOrder;
}

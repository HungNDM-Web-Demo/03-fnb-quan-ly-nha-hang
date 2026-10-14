using Domain.Base;
using Domain.Common;

namespace Domain.Entities.Pos.MenuItems;

/// <summary>
/// Ghi chú nhanh (bảng <c>Pos_QuickNotes</c>, FR-08): "Ít cay", "Không hành"… Xóa cứng vì món gọi đã chụp nội dung dạng chữ.
/// </summary>
public class QuickNote : BaseEntity, ICreationTracked, IModificationTracked
{
    public const int ContentMaxLength = 50;

    private QuickNote()
    {
    }

    public string Content { get; private set; } = string.Empty;
    public int SortOrder { get; private set; }

    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }

    public static QuickNote Create(string content, int sortOrder)
    {
        var note = new QuickNote { SortOrder = sortOrder };
        note.Update(content);
        return note;
    }

    public void Update(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            throw new DomainException("Nhập nội dung ghi chú");

        Content = content.Trim();
    }

    public void SetSortOrder(int sortOrder) => SortOrder = sortOrder;
}

using Domain.Entities.Pos;

namespace Application.Common.Exceptions;

/// <summary>Lỗi 409 có mã <c>code</c> của nghiệp vụ nhà hàng (07 §2.20).</summary>
public static class PosConflicts
{
    /// <summary>NFR-04: thao tác dựa trên phiên bản cũ của hóa đơn, kèm <c>currentVersion</c>.</summary>
    public static ConflictException Stale(int currentVersion) =>
        new(PosErrors.StaleMessage, null, new Dictionary<string, object?>
        {
            ["code"] = PosErrors.DuLieuCu,
            ["currentVersion"] = currentVersion
        });

    /// <summary>UC-02 E3: bàn đã có người mở trước, kèm <c>orderId</c> để FE vào màn Gọi món của hóa đơn đó.</summary>
    public static ConflictException TableJustOpened(string tableCode, string waiterName, Guid orderId) =>
        new($"Bàn {tableCode} vừa được mở bởi {waiterName}", null, new Dictionary<string, object?>
        {
            ["code"] = PosErrors.BanVuaDuocMo,
            ["orderId"] = orderId
        });

    /// <summary>BR-24, TC-41: trùng khung giữ bàn 120 phút, gắn trường <c>tableId</c>.</summary>
    public static ConflictException ReservationOverlap(string tableCode, string from, string to) =>
        new($"Bàn {tableCode} đã được giữ từ {from} đến {to}", "tableId", new Dictionary<string, object?>
        {
            ["code"] = PosErrors.TrungDatBan
        });
}

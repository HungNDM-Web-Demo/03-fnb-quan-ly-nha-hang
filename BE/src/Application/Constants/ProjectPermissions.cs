namespace Application.Constants;

/// <summary>
/// Mã quyền nghiệp vụ của Quản lý Nhà hàng (02-SRS §7, 07-DANH-SACH-API §1). Tách khỏi <see cref="Permissions"/> (quyền nền)
/// để không sửa file nền. Mỗi mã phải có trong FE/src/mock/seed/project.json và FE src/config/permissions.ts;
/// test <c>ProjectPermissionConstantsTests</c> kiểm tra việc này.
/// </summary>
public static class ProjectPermissions
{
    public static class Tables
    {
        public const string View = "tables.view";
        public const string Create = "tables.create";
        public const string Update = "tables.update";
        public const string Delete = "tables.delete";

        /// <summary>Mở bàn, đóng bàn mở nhầm, báo dọn xong.</summary>
        public const string Open = "tables.open";

        /// <summary>Chuyển bàn, gộp bàn, chuyển món.</summary>
        public const string Transfer = "tables.transfer";
    }

    public static class MenuItems
    {
        public const string View = "menu-items.view";
        public const string Create = "menu-items.create";
        public const string Update = "menu-items.update";
        public const string Delete = "menu-items.delete";

        /// <summary>Báo tạm hết, bán lại (FR-09).</summary>
        public const string Availability = "menu-items.availability";
    }

    public static class Orders
    {
        /// <summary>Xem hóa đơn; không có <see cref="Checkout"/> thì chỉ thấy hóa đơn đang mở.</summary>
        public const string View = "orders.view";

        /// <summary>Gọi món, gửi bếp, ra món; cũng dùng để đọc thực đơn gộp.</summary>
        public const string Create = "orders.create";

        public const string Prebill = "orders.prebill";
        public const string Split = "orders.split";
        public const string Discount = "orders.discount";
        public const string DiscountOverride = "orders.discount-override";

        /// <summary>Thu tiền, chốt hóa đơn, tra cứu mọi hóa đơn.</summary>
        public const string Checkout = "orders.checkout";

        /// <summary>In lại hóa đơn (FE kiểm tra, không có endpoint riêng).</summary>
        public const string Reprint = "orders.reprint";

        public const string Cancel = "orders.cancel";
    }

    public static class OrderItems
    {
        /// <summary>Hủy món chưa chế biến.</summary>
        public const string Cancel = "order-items.cancel";

        /// <summary>Duyệt hủy món đã chế biến (BR-13).</summary>
        public const string VoidApprove = "order-items.void-approve";
    }

    public static class KitchenTickets
    {
        public const string View = "kitchen-tickets.view";
        public const string Update = "kitchen-tickets.update";
    }

    public static class Reservations
    {
        public const string View = "reservations.view";
        public const string Create = "reservations.create";
        public const string Update = "reservations.update";
        public const string Delete = "reservations.delete";
        public const string CheckIn = "reservations.check-in";
    }

    public static class Reports
    {
        public const string View = "reports.view";
    }
}

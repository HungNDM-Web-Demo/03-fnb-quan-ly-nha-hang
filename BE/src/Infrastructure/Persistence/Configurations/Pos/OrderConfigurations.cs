using Domain.Entities.Pos.Kitchen;
using Domain.Entities.Pos.MenuItems;
using Domain.Entities.Pos.Orders;
using Domain.Entities.Pos.Reservations;
using Domain.Entities.Pos.Tables;
using Domain.Entities.System.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.Configurations.Pos;

// Hóa đơn và phục vụ: Pos_Orders, Pos_OrderItems, Pos_KitchenTickets, Pos_Payments, Pos_Reservations (06 §4).
// Không có navigation tới bảng xóa mềm (bàn, món) để truy vấn không mất hóa đơn cũ của bàn/món đã xóa; tra mã qua bảng riêng.

public sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Pos_Orders");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(Order.CodeMaxLength).IsRequired();
        builder.Property(x => x.ClientRequestId).HasMaxLength(Order.ClientRequestIdMaxLength);
        builder.Property(x => x.Note).HasMaxLength(Order.NoteMaxLength);
        builder.Property(x => x.WaiterName).HasMaxLength(Order.NameMaxLength).IsRequired();
        builder.Property(x => x.Subtotal).HasPrecision(18, 2);
        builder.Property(x => x.DiscountValue).HasPrecision(18, 2);
        builder.Property(x => x.DiscountAmount).HasPrecision(18, 2);
        builder.Property(x => x.DiscountReason).HasMaxLength(Order.ReasonMaxLength);
        builder.Property(x => x.DiscountApprovedByUsername).HasMaxLength(Order.UsernameMaxLength);
        builder.Property(x => x.ServiceCharge).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.Rounding).HasPrecision(18, 2);
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.Property(x => x.Deposit).HasPrecision(18, 2);
        builder.Property(x => x.DepositRefund).HasPrecision(18, 2);
        builder.Property(x => x.PaidAmount).HasPrecision(18, 2);
        builder.Property(x => x.CashierName).HasMaxLength(Order.NameMaxLength);
        builder.Property(x => x.CancelledByUsername).HasMaxLength(Order.UsernameMaxLength);
        builder.Property(x => x.CancelReason).HasMaxLength(Order.ReasonMaxLength);

        // NFR-04: khóa lạc quan, service tăng 1 ở mỗi thay đổi (07 §3.6).
        builder.Property(x => x.Version).IsConcurrencyToken();

        builder.HasIndex(x => x.Code).IsUnique();
        builder.HasIndex(x => x.ClientRequestId).IsUnique().HasFilter("\"ClientRequestId\" IS NOT NULL");
        builder.HasIndex(x => new { x.TableId, x.Status });
        builder.HasIndex(x => new { x.Status, x.PaidAt });
        builder.HasIndex(x => x.OpenedAt);
        builder.HasIndex(x => x.WaiterId);
        builder.HasIndex(x => x.SplitFromOrderId);
        builder.HasIndex(x => x.MergedIntoOrderId);

        builder.HasMany(x => x.Items)
            .WithOne(x => x.Order)
            .HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.Payments)
            .WithOne()
            .HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Payments).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<DiningTable>().WithMany().HasForeignKey(x => x.TableId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.WaiterId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Reservation>().WithMany().HasForeignKey(x => x.ReservationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.SplitFromOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.MergedIntoOrderId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class OrderItemConfiguration : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.ToTable("Pos_OrderItems");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.ItemCode).HasMaxLength(MenuItem.CodeMaxLength).IsRequired();
        builder.Property(x => x.ItemName).HasMaxLength(MenuItem.NameMaxLength).IsRequired();
        builder.Property(x => x.Unit).HasMaxLength(MenuItem.UnitMaxLength).IsRequired();
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.LineTotal).HasPrecision(18, 2);
        builder.Property(x => x.Note).HasMaxLength(OrderItem.NoteMaxLength);
        builder.Property(x => x.QuickNotes).HasMaxLength(OrderItem.QuickNotesMaxLength);
        builder.Property(x => x.SendRequestId).HasMaxLength(OrderItem.SendRequestIdMaxLength);
        builder.Property(x => x.CancelNote).HasMaxLength(OrderItem.CancelNoteMaxLength);
        builder.Property(x => x.CancelledByName).HasMaxLength(OrderItem.NameMaxLength);
        builder.Property(x => x.CancelledByUsername).HasMaxLength(OrderItem.UsernameMaxLength);
        builder.Property(x => x.CancelApprovedByUsername).HasMaxLength(OrderItem.UsernameMaxLength);

        builder.HasIndex(x => x.OrderId);
        builder.HasIndex(x => new { x.Status, x.Station, x.SentAt });
        builder.HasIndex(x => x.KitchenTicketId);
        builder.HasIndex(x => x.SendRequestId);
        builder.HasIndex(x => x.MenuItemId);

        builder.HasOne<MenuItem>().WithMany().HasForeignKey(x => x.MenuItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.KitchenTicket).WithMany().HasForeignKey(x => x.KitchenTicketId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class KitchenTicketConfiguration : IEntityTypeConfiguration<KitchenTicket>
{
    public void Configure(EntityTypeBuilder<KitchenTicket> builder)
    {
        builder.ToTable("Pos_KitchenTickets");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(KitchenTicket.CodeMaxLength).IsRequired();
        builder.Property(x => x.TableCode).HasMaxLength(KitchenTicket.TableCodeMaxLength).IsRequired();
        builder.Property(x => x.OriginalTableCode).HasMaxLength(KitchenTicket.TableCodeMaxLength).IsRequired();
        builder.Property(x => x.WaiterName).HasMaxLength(KitchenTicket.WaiterNameMaxLength).IsRequired();

        builder.HasIndex(x => new { x.BusinessDate, x.TicketNo }).IsUnique();
        builder.HasIndex(x => x.OrderId);
        builder.HasIndex(x => new { x.Status, x.Station, x.SentAt });

        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<DiningTable>().WithMany().HasForeignKey(x => x.TableId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("Pos_Payments");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.ClientRequestId).HasMaxLength(Payment.ClientRequestIdMaxLength);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.CashReceived).HasPrecision(18, 2);
        builder.Property(x => x.ChangeAmount).HasPrecision(18, 2);
        builder.Property(x => x.CardLast4).HasMaxLength(Payment.CardLast4Length);
        builder.Property(x => x.QrContent).HasMaxLength(Payment.QrContentMaxLength);
        builder.Property(x => x.CashierName).HasMaxLength(Payment.CashierNameMaxLength);

        builder.HasIndex(x => x.ClientRequestId).IsUnique().HasFilter("\"ClientRequestId\" IS NOT NULL");
        builder.HasIndex(x => x.OrderId);
    }
}

public sealed class ReservationConfiguration : IEntityTypeConfiguration<Reservation>
{
    public void Configure(EntityTypeBuilder<Reservation> builder)
    {
        builder.ToTable("Pos_Reservations");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(Reservation.CodeMaxLength).IsRequired();
        builder.Property(x => x.CustomerName).HasMaxLength(Reservation.CustomerNameMaxLength).IsRequired();
        builder.Property(x => x.Phone).HasMaxLength(Reservation.PhoneMaxLength).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(Reservation.NoteMaxLength);
        builder.Property(x => x.Deposit).HasPrecision(18, 2);
        builder.Property(x => x.CancelledByName).HasMaxLength(Reservation.NameMaxLength);
        builder.Property(x => x.CancelReason).HasMaxLength(Reservation.ReasonMaxLength);
        builder.Ignore(x => x.HoldUntil);

        builder.HasIndex(x => x.Code).IsUnique();
        builder.HasIndex(x => new { x.TableId, x.ArrivalAt });
        builder.HasIndex(x => new { x.Status, x.ArrivalAt });

        builder.HasOne<DiningTable>().WithMany().HasForeignKey(x => x.TableId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
    }
}

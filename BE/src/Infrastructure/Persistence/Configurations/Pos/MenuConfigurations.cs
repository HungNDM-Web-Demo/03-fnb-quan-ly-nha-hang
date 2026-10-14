using Domain.Entities.Pos.MenuItems;
using Infrastructure.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.Configurations.Pos;

// Thực đơn: Pos_Categories, Pos_MenuItems, Pos_QuickNotes (06 §4).

public sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Pos_Categories");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(Category.CodeMaxLength).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(Category.NameMaxLength).IsRequired();
        builder.Property(x => x.Color).HasMaxLength(Category.ColorMaxLength).IsRequired();
        builder.HasIndex(x => x.Code).IsUnique().WhereNotDeleted();
    }
}

public sealed class MenuItemConfiguration : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> builder)
    {
        builder.ToTable("Pos_MenuItems");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(MenuItem.CodeMaxLength).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(MenuItem.NameMaxLength).IsRequired();
        builder.Property(x => x.ImageUrl).HasMaxLength(MenuItem.ImageUrlMaxLength);
        builder.Property(x => x.Description).HasMaxLength(MenuItem.DescriptionMaxLength);
        builder.Property(x => x.Unit).HasMaxLength(MenuItem.UnitMaxLength).IsRequired();
        builder.Property(x => x.Price).HasPrecision(18, 2);
        builder.Ignore(x => x.Status);

        builder.HasIndex(x => x.Code).IsUnique().WhereNotDeleted();
        builder.HasIndex(x => new { x.CategoryId, x.SortOrder });

        builder.HasOne(x => x.Category)
            .WithMany()
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class QuickNoteConfiguration : IEntityTypeConfiguration<QuickNote>
{
    public void Configure(EntityTypeBuilder<QuickNote> builder)
    {
        builder.ToTable("Pos_QuickNotes");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Content).HasMaxLength(QuickNote.ContentMaxLength).IsRequired();
        builder.HasIndex(x => x.Content).IsUnique();
    }
}

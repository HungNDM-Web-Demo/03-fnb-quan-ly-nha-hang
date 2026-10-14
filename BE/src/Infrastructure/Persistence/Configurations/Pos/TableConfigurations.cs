using Domain.Entities.Pos.Tables;
using Infrastructure.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.Configurations.Pos;

// Khu vực và bàn: Pos_Areas, Pos_DiningTables (06 §4).

public sealed class AreaConfiguration : IEntityTypeConfiguration<Area>
{
    public void Configure(EntityTypeBuilder<Area> builder)
    {
        builder.ToTable("Pos_Areas");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(Area.CodeMaxLength).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(Area.NameMaxLength).IsRequired();
        builder.HasIndex(x => x.Code).IsUnique().WhereNotDeleted();
    }
}

public sealed class DiningTableConfiguration : IEntityTypeConfiguration<DiningTable>
{
    public void Configure(EntityTypeBuilder<DiningTable> builder)
    {
        builder.ToTable("Pos_DiningTables");
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Code).HasMaxLength(DiningTable.CodeMaxLength).IsRequired();

        // NFR-04, UC-02 E3: chặn hai phục vụ cùng mở một bàn.
        builder.Property(x => x.Version).IsConcurrencyToken();

        builder.HasIndex(x => x.Code).IsUnique().WhereNotDeleted();
        builder.HasIndex(x => x.AreaId);

        builder.HasOne(x => x.Area)
            .WithMany()
            .HasForeignKey(x => x.AreaId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<DiningTable>()
            .WithMany()
            .HasForeignKey(x => x.MergedIntoTableId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

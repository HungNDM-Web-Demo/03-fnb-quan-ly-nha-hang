using System.Globalization;
using Application.Interfaces.Repositories;
using Application.Interfaces.Services.StoreProfile;
using Domain.Entities.Pos;
using Domain.Entities.System.Settings;
using Microsoft.EntityFrameworkCore;
using StoreProfileDto = Application.DTOs.StoreProfile.StoreProfile;

namespace Infrastructure.Implementations.Services.StoreProfile;

/// <summary>Đọc khóa <c>Store.*</c>, <c>Billing.*</c> (06 §3, 07 §2.17). Khóa thiếu hoặc sai thì dùng giá trị mẫu.</summary>
public sealed class StoreProfileService(IGenericRepository<Setting> settings) : IStoreProfileService
{
    public async Task<StoreProfileDto> GetAsync(CancellationToken ct = default)
    {
        var values = await settings.QueryNoTracking()
            .Where(s => s.Key.StartsWith("Store.") || s.Key.StartsWith("Billing."))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        string Text(string key, string fallback = "") =>
            values.TryGetValue(key, out var value) && value is not null ? value : fallback;

        int Number(string key, int fallback) =>
            int.TryParse(Text(key), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) ? number : fallback;

        return new StoreProfileDto
        {
            Name = Text("Store.Name"),
            Address = Text("Store.Address"),
            Phone = Text("Store.Phone"),
            TaxCode = Text("Store.TaxCode"),
            ReceiptFooter = Text("Store.ReceiptFooter"),
            BankBin = Text("Store.BankBin"),
            BankAccount = Text("Store.BankAccount"),
            BankAccountName = Text("Store.BankAccountName"),
            OpenTime = Text(StoreProfileDto.OpenTimeKey, "10:00"),
            CloseTime = Text(StoreProfileDto.CloseTimeKey, "22:00"),
            ServiceChargeRate = Number(StoreProfileDto.ServiceChargeRateKey, PosRules.SeedServiceChargeRate),
            VatRate = Number(StoreProfileDto.VatRateKey, PosRules.SeedVatRate),
            CashierDiscountLimit = Number(StoreProfileDto.CashierDiscountLimitKey, 10)
        };
    }
}

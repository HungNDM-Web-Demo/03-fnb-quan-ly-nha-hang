using System.Reflection;
using Application.Common.Exceptions;
using Application.Constants;
using Application.DTOs.Menu;
using Application.DTOs.Settings;
using Application.Interfaces.Services.Menu;
using Application.Interfaces.Services.Roles;
using Application.Interfaces.Services.Settings;
using Application.Validators.Menu;
using Domain.Common;
using Domain.Enums.Pos.MenuItems;
using FluentValidation;
using Infrastructure.Persistence.Seeders;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Thực đơn (UC-03): TC-04, TC-05; phân quyền theo vai trò (07 §1, TC-45); kiểm cài đặt tính tiền (07 §2.17).</summary>
public sealed class MenuAndPermissionTests : IAsyncLifetime
{
    private RestaurantTestHost _host = null!;
    private RestaurantScenario _pos = null!;

    public async Task InitializeAsync()
    {
        _host = await RestaurantTestHost.StartAsync();
        _pos = new RestaurantScenario(_host);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task Tc04_AddWeightItem_ShowsInSeafood_OrderableByKg()
    {
        await _host.SignInAsync("quanly");
        var categories = await _host.CallAsync<ICategoryService, IReadOnlyList<CategoryDto>>(s => s.GetListAsync());
        var seafood = categories.Single(c => c.Name == "Hải sản");

        var created = await _host.CallAsync<IMenuItemService, MenuItemDto>(s => s.CreateAsync(new SaveMenuItemRequest
        {
            Code = "M061", Name = "Tôm sú nướng muối ớt", CategoryId = seafood.Id, Unit = "đĩa", PricingType = PricingType.TheoTrongLuong,
            Price = 690_000, Station = KitchenStation.BepNong, PrepMinutes = 20
        }));
        Assert.Equal("kg", created.Unit);
        Assert.Equal(seafood.Name, created.CategoryName);
        Assert.False(created.EverOrdered);

        var menu = await _host.CallAsync<IMenuService, MenuBundle>(s => s.GetBundleAsync());
        Assert.Equal(PricingType.TheoTrongLuong, menu.Items.Single(i => i.Code == "M061").PricingType);

        var order = await _pos.OrderOfAsync("T1-06");
        await _host.SignInAsync("phucvu");
        var withItem = await _pos.AddAsync(order.Id, "M061", 0.8m);
        Assert.Equal(552_000m, withItem.Items.Single(i => i.ItemCode == "M061").LineTotal);

        await _host.SignInAsync("quanly");
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => _host.CallAsync<IMenuItemService, MenuItemDto>(s => s.CreateAsync(new SaveMenuItemRequest
        {
            Code = "M061", Name = "Trùng", CategoryId = seafood.Id, Unit = "đĩa", Price = 10_000, Station = KitchenStation.KhongQuaBep
        })));
        Assert.Equal(("Mã món đã tồn tại", "code"), (duplicate.Message, duplicate.Field));
    }

    [Fact]
    public async Task Tc05_DeleteOrderedItem_Refused_PriceMustBeThousands()
    {
        await _host.SignInAsync("quanly");
        var bo = await _pos.MenuIdAsync("M021");
        var error = await Assert.ThrowsAsync<DomainException>(() => _host.CallAsync<IMenuItemService>(s => s.DeleteAsync(bo)));
        Assert.Equal("Món đã có trong hóa đơn, chỉ có thể ẩn", error.Message);

        var item = await _host.CallAsync<IMenuItemService, MenuItemDto>(s => s.GetByIdAsync(bo));
        Assert.True(item.EverOrdered);
        var validation = new SaveMenuItemRequestValidator().Validate(new SaveMenuItemRequest
        {
            Code = "M021", Name = item.Name, CategoryId = item.CategoryId, Unit = "đĩa", Price = 185_500, Station = KitchenStation.BepNong, PrepMinutes = 15
        });
        Assert.Equal("Đơn giá phải là bội số 1.000 ₫", Assert.Single(validation.Errors).ErrorMessage);

        // Danh mục còn món không xóa được, kèm itemCount.
        var category = await _host.CallAsync<ICategoryService, CategoryDto>(s => s.GetByIdAsync(item.CategoryId));
        var categoryError = await Assert.ThrowsAsync<DomainException>(() => _host.CallAsync<ICategoryService>(s => s.DeleteAsync(category.Id)));
        Assert.Equal(category.ItemCount, categoryError.Extensions["itemCount"]);
    }

    [Theory]
    [InlineData("phucvu", ProjectPermissions.Tables.View, true)]
    [InlineData("phucvu", ProjectPermissions.Orders.Create, true)]
    [InlineData("phucvu", ProjectPermissions.OrderItems.VoidApprove, false)]
    [InlineData("phucvu", ProjectPermissions.Orders.Checkout, false)]
    [InlineData("phucvu", ProjectPermissions.Reports.View, false)]   // TC-45: phục vụ gõ /reports → /forbidden
    [InlineData("phucvu", Permissions.Dashboard.View, false)]
    [InlineData("bep", ProjectPermissions.Tables.View, false)]       // TC-45: bếp gõ /tables → /forbidden
    [InlineData("bep", ProjectPermissions.KitchenTickets.Update, true)]
    [InlineData("bep", ProjectPermissions.MenuItems.Availability, true)]
    [InlineData("bep", ProjectPermissions.MenuItems.Update, false)]
    [InlineData("thungan", ProjectPermissions.Orders.Checkout, true)]
    [InlineData("thungan", ProjectPermissions.Orders.DiscountOverride, false)]
    [InlineData("thungan", ProjectPermissions.Orders.Cancel, false)]
    [InlineData("thungan", ProjectPermissions.Reservations.Create, true)]
    [InlineData("quanly", ProjectPermissions.OrderItems.VoidApprove, true)]
    [InlineData("quanly", ProjectPermissions.Reports.View, true)]
    [InlineData("quanly", Permissions.Dashboard.View, true)]
    [InlineData("admin", ProjectPermissions.Orders.Cancel, true)]
    public async Task RolePermissions_MatchSection1(string username, string permission, bool expected)
    {
        var userId = await _host.SignInAsync(username);
        Assert.Equal(expected, await _host.CallAsync<IPermissionService, bool>(s => s.HasPermissionAsync(userId!.Value, permission)));
    }

    [Fact]
    public void EveryProjectPermission_IsDeclaredInSeedFiles()
    {
        var seeded = SystemSeedData.Embedded.Permissions.Select(p => p.Code).ToHashSet();
        var codes = typeof(ProjectPermissions)
            .GetNestedTypes(BindingFlags.Public | BindingFlags.Static)
            .SelectMany(t => t.GetFields(BindingFlags.Public | BindingFlags.Static))
            .Where(f => f is { IsLiteral: true } && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        Assert.Equal(30, codes.Count);
        Assert.All(codes, code => Assert.Contains(code, seeded));
    }

    [Theory]
    [InlineData("Billing.ServiceChargeRate", "16", "Phí phục vụ từ 0 đến 15%")]
    [InlineData("Billing.ServiceChargeRate", "4.5", "Phí phục vụ từ 0 đến 15%")]
    [InlineData("Billing.VatRate", "7", "Thuế suất là 0, 5, 8 hoặc 10%")]
    [InlineData("Billing.CashierDiscountLimit", "101", "Hạn mức giảm giá từ 0 đến 100%")]
    [InlineData("Store.OpenTime", "23:00", "Giờ mở cửa phải trước giờ đóng cửa")]
    [InlineData("Store.CloseTime", "25:00", "Giờ dạng HH:mm")]
    public async Task BillingSettings_AreValidated(string key, string value, string message)
    {
        await _host.SignInAsync("admin");
        var error = await Assert.ThrowsAsync<ValidationException>(() => _host.RunAsync(async sp =>
        {
            var behavior = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
                .GetRequiredService<Application.Behaviors.ValidationBehavior>(sp);
            await behavior.ValidateAsync(new UpdateSettingsRequest { Items = [new UpdateSettingItem { Key = key, Value = value }] });
        }));
        var failure = Assert.Single(error.Errors);
        Assert.Equal(message, failure.ErrorMessage);
        Assert.Equal("items[0].value", failure.PropertyName);
    }

    [Fact]
    public async Task BillingSettings_ValidValues_Saved()
    {
        await _host.RunAsync(async sp =>
        {
            var behavior = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
                .GetRequiredService<Application.Behaviors.ValidationBehavior>(sp);
            var request = new UpdateSettingsRequest
            {
                Items = [new UpdateSettingItem { Key = "Billing.VatRate", Value = "10" }, new UpdateSettingItem { Key = "Store.CloseTime", Value = "23:00" }]
            };
            await behavior.ValidateAsync(request);
            await Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<ISettingService>(sp).UpdateAsync(request);
        });

        var profile = await _host.CallAsync<Application.Interfaces.Services.StoreProfile.IStoreProfileService, Application.DTOs.StoreProfile.StoreProfile>(s => s.GetAsync());
        Assert.Equal(10, profile.VatRate);
        Assert.Equal("23:00", profile.CloseTime);
        Assert.Equal("Nhà hàng Sen Quê", profile.Name);
    }
}

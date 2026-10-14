using Application.Common.Exceptions;
using Application.DTOs.Reservations;
using Application.DTOs.Tables;
using Application.Interfaces.Services.Reservations;
using Domain.Common;
using Domain.Entities.Pos;
using Domain.Enums.Pos.Orders;
using Domain.Enums.Pos.Reservations;
using Domain.Enums.Pos.Tables;
using FluentValidation;
using UnitTests.TestSupport;

namespace UnitTests.Restaurant;

/// <summary>Đặt bàn (UC-13, BR-24, BR-25): TC-41, TC-42, "Đã đặt", "Không đến" đổi lười, giờ mở cửa, đặt trước 30 phút.</summary>
public sealed class ReservationFlowTests : IAsyncLifetime
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
    public async Task Tc41_OverlappingReservation_IsRejected_After120MinutesAccepted()
    {
        await _host.SignInAsync("thungan");
        var t201 = await _pos.TableIdAsync("T2-01");

        var first = await Create(t201, Tomorrow(19, 0));
        Assert.Matches(@"^DB261014\d{3}$", first.Code);
        Assert.Equal(ReservationStatus.ChoDen, first.Status);
        Assert.Equal(first.ArrivalAt.AddMinutes(120), first.HoldUntil);

        var overlap = await Assert.ThrowsAsync<ConflictException>(() => Create(t201, Tomorrow(20, 0)));
        Assert.Equal("Bàn T2-01 đã được giữ từ 19:00 đến 21:00", overlap.Message);
        Assert.Equal("tableId", overlap.Field);
        Assert.Equal(PosErrors.TrungDatBan, overlap.Extensions["code"]);

        var third = await Create(t201, Tomorrow(21, 0));
        Assert.NotEqual(first.Code, third.Code);

        // Gợi ý bàn trống: T2-01 không còn trong khung 19:30.
        var available = await _host.CallAsync<IReservationService, IReadOnlyList<DiningTableDto>>(s =>
            s.GetAvailableTablesAsync(new AvailableTablesQuery { ArrivalAt = Tomorrow(19, 30), GuestCount = 8 }));
        Assert.DoesNotContain(available, t => t.Code == "T2-01");
        Assert.True(available.Zip(available.Skip(1)).All(p => p.First.Capacity <= p.Second.Capacity));
    }

    [Fact]
    public async Task OpeningHours_And30MinuteLead()
    {
        await _host.SignInAsync("thungan");
        var t110 = await _pos.TableIdAsync("T1-10");

        var early = await Assert.ThrowsAsync<ValidationException>(() => Create(t110, Tomorrow(9, 30)));
        Assert.Equal("Giờ đến trong giờ mở cửa 10:00–22:00", Assert.Single(early.Errors).ErrorMessage);
        Assert.NotNull(await Create(t110, Tomorrow(22, 0))); // giờ đóng cửa được nhận

        var soon = await Assert.ThrowsAsync<ValidationException>(() => Create(t110, RestaurantTestHost.Start.UtcDateTime.AddMinutes(20)));
        Assert.Equal("Giờ đến phải sau hiện tại ít nhất 30 phút", Assert.Single(soon.Errors).ErrorMessage);
    }

    [Fact]
    public async Task Tc42_CheckIn_CreatesOrderWithDepositPayment()
    {
        await _host.SignInAsync("phucvu2");
        var rv01 = (await _host.CallAsync<IReservationService, Application.Common.Models.PaginatedResult<ReservationDto>>(s =>
            s.GetPagedAsync(new ReservationQuery { Search = "Trần Minh Quân" }))).Items.Single();

        var result = await _host.CallAsync<IReservationService, Application.DTOs.Orders.CreatedResult<Application.DTOs.Orders.OrderDto>>(s =>
            s.CheckInAsync(rv01.Id, new CheckInRequest { ClientRequestId = "checkin-rv01" }));
        var order = result.Value;
        Assert.True(result.Created);
        Assert.Equal(8, order.GuestCount);
        Assert.Equal("Tiệc sinh nhật, chuẩn bị giúp đĩa trái cây", order.Note);
        Assert.Equal(rv01.Code, order.ReservationCode);
        Assert.Equal(500_000m, order.Deposit);
        var deposit = Assert.Single(order.Payments);
        Assert.Equal((PaymentMethod.TienCoc, 500_000m), (deposit.Method, deposit.Amount));
        Assert.False(order.IsLocked);
        Assert.Equal(TableStatus.DangPhucVu, (await _pos.CardAsync("T2-01")).Status);

        // Gửi lại cùng mã → hóa đơn cũ.
        var again = await _host.CallAsync<IReservationService, Application.DTOs.Orders.CreatedResult<Application.DTOs.Orders.OrderDto>>(s =>
            s.CheckInAsync(rv01.Id, new CheckInRequest { ClientRequestId = "checkin-rv01" }));
        Assert.False(again.Created);
        Assert.Equal(order.Id, again.Value.Id);

        // TC-42: 2 Lẩu thái hải sản → tổng 828.000, lượt Tiền cọc 500.000, còn phải thu 328.000.
        await _pos.AddAsync(order.Id, "M028", 2);
        var sent = await _pos.SendAsync(order.Id);
        Assert.Equal(828_000m, sent.Order.Total);
        Assert.Equal(328_000m, sent.Order.Remaining);

        var reservation = await _host.CallAsync<IReservationService, ReservationDto>(s => s.GetByIdAsync(rv01.Id));
        Assert.Equal(ReservationStatus.DaNhanBan, reservation.Status);
        Assert.Equal(order.Id, reservation.OrderId);

        var notWaiting = await Assert.ThrowsAsync<DomainException>(() =>
            _host.CallAsync<IReservationService, ReservationDto>(s => s.CancelAsync(rv01.Id, new CancelReservationRequest { Reason = "x" })));
        Assert.Equal("Đặt bàn không còn ở trạng thái chờ đến", notWaiting.Message);
    }

    [Fact]
    public async Task ReservedWindow_LateLabel_AndLazyNoShow()
    {
        // RV03 T2-08 đến sau 40 phút → "Đã đặt" ngay; sau giờ đến 16 phút → nhãn Trễ; quá 30 phút → Không đến, bàn Trống.
        Assert.Equal(TableStatus.DaDat, (await _pos.CardAsync("T2-08")).Status);

        _host.Time.Advance(TimeSpan.FromMinutes(56));
        var late = await _pos.CardAsync("T2-08");
        Assert.Equal(TableStatus.DaDat, late.Status);
        Assert.True(late.Reservation!.IsLate);

        _host.Time.Advance(TimeSpan.FromMinutes(15));
        Assert.Equal(TableStatus.Trong, (await _pos.CardAsync("T2-08")).Status);
        await _host.SignInAsync("thungan");
        var list = await _host.CallAsync<IReservationService, Application.Common.Models.PaginatedResult<ReservationDto>>(s =>
            s.GetPagedAsync(new ReservationQuery { From = "2026-10-14", To = "2026-10-14", PageSize = 100 }));
        Assert.Equal(ReservationStatus.KhongDen, list.Items.Single(r => r.TableCode == "T2-08").Status);
        Assert.True(list.Items.Zip(list.Items.Skip(1)).All(p => p.First.ArrivalAt <= p.Second.ArrivalAt));
    }

    [Fact]
    public void SaveReservationValidator_Messages()
    {
        var validator = new Application.Validators.Reservations.SaveReservationRequestValidator();
        var result = validator.Validate(new SaveReservationRequest
        {
            CustomerName = "",
            Phone = "123",
            ArrivalAt = DateTime.UtcNow,
            GuestCount = 0,
            TableId = Guid.NewGuid(),
            Deposit = 5_500_000
        });
        var messages = result.Errors.Select(e => e.ErrorMessage).ToList();
        Assert.Contains("Nhập tên khách", messages);
        Assert.Contains("Số điện thoại không hợp lệ", messages);
        Assert.Contains("Số khách từ 1 đến 50", messages);
        Assert.Contains("Tiền cọc từ 0 đến 5.000.000 ₫, bội số 1.000 ₫", messages);
    }

    private Task<ReservationDto> Create(Guid tableId, DateTime arrivalUtc) =>
        _host.CallAsync<IReservationService, ReservationDto>(s => s.CreateAsync(new SaveReservationRequest
        {
            CustomerName = "Nguyễn Văn Test",
            Phone = "0903 111 222",
            ArrivalAt = arrivalUtc,
            GuestCount = 8,
            TableId = tableId,
            Deposit = 0
        }));

    /// <summary>Ngày mai giờ Việt Nam, đổi ra UTC.</summary>
    private static DateTime Tomorrow(int hour, int minute) =>
        Application.Common.Time.VietnamDates.StartOfDayUtc(new DateOnly(2026, 10, 15)).AddHours(hour).AddMinutes(minute);
}

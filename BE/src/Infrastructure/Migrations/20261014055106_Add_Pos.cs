using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Add_Pos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Pos_Areas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    Name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_Areas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Pos_Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Pos_QuickNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_QuickNotes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Pos_DiningTables",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    AreaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Capacity = table.Column<int>(type: "integer", nullable: false),
                    Shape = table.Column<int>(type: "integer", nullable: false),
                    PosX = table.Column<int>(type: "integer", nullable: false),
                    PosY = table.Column<int>(type: "integer", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    MergedIntoTableId = table.Column<Guid>(type: "uuid", nullable: true),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_DiningTables", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_DiningTables_Pos_Areas_AreaId",
                        column: x => x.AreaId,
                        principalTable: "Pos_Areas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_DiningTables_Pos_DiningTables_MergedIntoTableId",
                        column: x => x.MergedIntoTableId,
                        principalTable: "Pos_DiningTables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pos_MenuItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImageUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PricingType = table.Column<int>(type: "integer", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Station = table.Column<int>(type: "integer", nullable: false),
                    PrepMinutes = table.Column<int>(type: "integer", nullable: true),
                    IsSoldOut = table.Column<bool>(type: "boolean", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_MenuItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_MenuItems_Pos_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Pos_Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pos_KitchenTickets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TicketNo = table.Column<int>(type: "integer", nullable: false),
                    Code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Station = table.Column<int>(type: "integer", nullable: false),
                    BatchNo = table.Column<int>(type: "integer", nullable: false),
                    TableId = table.Column<Guid>(type: "uuid", nullable: false),
                    TableCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    OriginalTableCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    WaiterId = table.Column<Guid>(type: "uuid", nullable: false),
                    WaiterName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_KitchenTickets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_KitchenTickets_Pos_DiningTables_TableId",
                        column: x => x.TableId,
                        principalTable: "Pos_DiningTables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pos_OrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    MenuItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    ItemName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PricingType = table.Column<int>(type: "integer", nullable: false),
                    Station = table.Column<int>(type: "integer", nullable: false),
                    PrepMinutes = table.Column<int>(type: "integer", nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    LineTotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    QuickNotes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsRush = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    BatchNo = table.Column<int>(type: "integer", nullable: true),
                    KitchenTicketId = table.Column<Guid>(type: "uuid", nullable: true),
                    SendRequestId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DoneAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ServedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelReason = table.Column<int>(type: "integer", nullable: true),
                    CancelNote = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledById = table.Column<Guid>(type: "uuid", nullable: true),
                    CancelledByName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CancelledByUsername = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CancelApprovedById = table.Column<Guid>(type: "uuid", nullable: true),
                    CancelApprovedByUsername = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    StatusAtCancel = table.Column<int>(type: "integer", nullable: true),
                    CancelAcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_OrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_OrderItems_Pos_KitchenTickets_KitchenTicketId",
                        column: x => x.KitchenTicketId,
                        principalTable: "Pos_KitchenTickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_OrderItems_Pos_MenuItems_MenuItemId",
                        column: x => x.MenuItemId,
                        principalTable: "Pos_MenuItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pos_Orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ClientRequestId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TableId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    GuestCount = table.Column<int>(type: "integer", nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    WaiterId = table.Column<Guid>(type: "uuid", nullable: false),
                    WaiterName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    OpenedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BatchCount = table.Column<int>(type: "integer", nullable: false),
                    PrebillPrintedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Subtotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountType = table.Column<int>(type: "integer", nullable: true),
                    DiscountValue = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    DiscountAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountReason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DiscountApprovedById = table.Column<Guid>(type: "uuid", nullable: true),
                    DiscountApprovedByUsername = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ServiceChargeRate = table.Column<int>(type: "integer", nullable: false),
                    ServiceCharge = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    VatRate = table.Column<int>(type: "integer", nullable: false),
                    VatAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Rounding = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Deposit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DepositRefund = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PaidAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SplitCount = table.Column<int>(type: "integer", nullable: true),
                    ReservationId = table.Column<Guid>(type: "uuid", nullable: true),
                    SplitFromOrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    MergedIntoOrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    MergedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CashierId = table.Column<Guid>(type: "uuid", nullable: true),
                    CashierName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledById = table.Column<Guid>(type: "uuid", nullable: true),
                    CancelledByUsername = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CancelReason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_Orders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_Orders_Pos_DiningTables_TableId",
                        column: x => x.TableId,
                        principalTable: "Pos_DiningTables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_Orders_Pos_Orders_MergedIntoOrderId",
                        column: x => x.MergedIntoOrderId,
                        principalTable: "Pos_Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_Orders_Pos_Orders_SplitFromOrderId",
                        column: x => x.SplitFromOrderId,
                        principalTable: "Pos_Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_Orders_System_Users_WaiterId",
                        column: x => x.WaiterId,
                        principalTable: "System_Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pos_Payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientRequestId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Method = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CashReceived = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    ChangeAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    CardLast4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    ShareNo = table.Column<int>(type: "integer", nullable: true),
                    QrContent = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CashierId = table.Column<Guid>(type: "uuid", nullable: true),
                    CashierName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_Payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_Payments_Pos_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Pos_Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Pos_Reservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CustomerName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ArrivalAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GuestCount = table.Column<int>(type: "integer", nullable: false),
                    TableId = table.Column<Guid>(type: "uuid", nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Deposit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    CheckedInAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledById = table.Column<Guid>(type: "uuid", nullable: true),
                    CancelledByName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CancelReason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pos_Reservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pos_Reservations_Pos_DiningTables_TableId",
                        column: x => x.TableId,
                        principalTable: "Pos_DiningTables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Pos_Reservations_Pos_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Pos_Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Areas_Code",
                table: "Pos_Areas",
                column: "Code",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Categories_Code",
                table: "Pos_Categories",
                column: "Code",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_DiningTables_AreaId",
                table: "Pos_DiningTables",
                column: "AreaId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_DiningTables_Code",
                table: "Pos_DiningTables",
                column: "Code",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_DiningTables_MergedIntoTableId",
                table: "Pos_DiningTables",
                column: "MergedIntoTableId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_KitchenTickets_BusinessDate_TicketNo",
                table: "Pos_KitchenTickets",
                columns: new[] { "BusinessDate", "TicketNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Pos_KitchenTickets_OrderId",
                table: "Pos_KitchenTickets",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_KitchenTickets_Status_Station_SentAt",
                table: "Pos_KitchenTickets",
                columns: new[] { "Status", "Station", "SentAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_KitchenTickets_TableId",
                table: "Pos_KitchenTickets",
                column: "TableId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_MenuItems_CategoryId_SortOrder",
                table: "Pos_MenuItems",
                columns: new[] { "CategoryId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_MenuItems_Code",
                table: "Pos_MenuItems",
                column: "Code",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_OrderItems_KitchenTicketId",
                table: "Pos_OrderItems",
                column: "KitchenTicketId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_OrderItems_MenuItemId",
                table: "Pos_OrderItems",
                column: "MenuItemId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_OrderItems_OrderId",
                table: "Pos_OrderItems",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_OrderItems_SendRequestId",
                table: "Pos_OrderItems",
                column: "SendRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_OrderItems_Status_Station_SentAt",
                table: "Pos_OrderItems",
                columns: new[] { "Status", "Station", "SentAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_ClientRequestId",
                table: "Pos_Orders",
                column: "ClientRequestId",
                unique: true,
                filter: "\"ClientRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_Code",
                table: "Pos_Orders",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_MergedIntoOrderId",
                table: "Pos_Orders",
                column: "MergedIntoOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_OpenedAt",
                table: "Pos_Orders",
                column: "OpenedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_ReservationId",
                table: "Pos_Orders",
                column: "ReservationId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_SplitFromOrderId",
                table: "Pos_Orders",
                column: "SplitFromOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_Status_PaidAt",
                table: "Pos_Orders",
                columns: new[] { "Status", "PaidAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_TableId_Status",
                table: "Pos_Orders",
                columns: new[] { "TableId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Orders_WaiterId",
                table: "Pos_Orders",
                column: "WaiterId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Payments_ClientRequestId",
                table: "Pos_Payments",
                column: "ClientRequestId",
                unique: true,
                filter: "\"ClientRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Payments_OrderId",
                table: "Pos_Payments",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_QuickNotes_Content",
                table: "Pos_QuickNotes",
                column: "Content",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Reservations_Code",
                table: "Pos_Reservations",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Reservations_OrderId",
                table: "Pos_Reservations",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Reservations_Status_ArrivalAt",
                table: "Pos_Reservations",
                columns: new[] { "Status", "ArrivalAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Pos_Reservations_TableId_ArrivalAt",
                table: "Pos_Reservations",
                columns: new[] { "TableId", "ArrivalAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_Pos_KitchenTickets_Pos_Orders_OrderId",
                table: "Pos_KitchenTickets",
                column: "OrderId",
                principalTable: "Pos_Orders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Pos_OrderItems_Pos_Orders_OrderId",
                table: "Pos_OrderItems",
                column: "OrderId",
                principalTable: "Pos_Orders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Pos_Orders_Pos_Reservations_ReservationId",
                table: "Pos_Orders",
                column: "ReservationId",
                principalTable: "Pos_Reservations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Pos_DiningTables_Pos_Areas_AreaId",
                table: "Pos_DiningTables");

            migrationBuilder.DropForeignKey(
                name: "FK_Pos_Orders_Pos_DiningTables_TableId",
                table: "Pos_Orders");

            migrationBuilder.DropForeignKey(
                name: "FK_Pos_Reservations_Pos_DiningTables_TableId",
                table: "Pos_Reservations");

            migrationBuilder.DropForeignKey(
                name: "FK_Pos_Reservations_Pos_Orders_OrderId",
                table: "Pos_Reservations");

            migrationBuilder.DropTable(
                name: "Pos_OrderItems");

            migrationBuilder.DropTable(
                name: "Pos_Payments");

            migrationBuilder.DropTable(
                name: "Pos_QuickNotes");

            migrationBuilder.DropTable(
                name: "Pos_KitchenTickets");

            migrationBuilder.DropTable(
                name: "Pos_MenuItems");

            migrationBuilder.DropTable(
                name: "Pos_Categories");

            migrationBuilder.DropTable(
                name: "Pos_Areas");

            migrationBuilder.DropTable(
                name: "Pos_DiningTables");

            migrationBuilder.DropTable(
                name: "Pos_Orders");

            migrationBuilder.DropTable(
                name: "Pos_Reservations");
        }
    }
}

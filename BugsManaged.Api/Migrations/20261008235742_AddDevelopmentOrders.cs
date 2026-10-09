using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDevelopmentOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AnnouncedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AnnouncementVideoUrl",
                table: "Tickets",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DevelopmentStage",
                table: "Tickets",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DigestSentAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDevelopmentOrder",
                table: "Tickets",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "ProductionAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionId",
                table: "Tickets",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionLogUrl",
                table: "Tickets",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ServiceApiKeys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    KeyHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    KeyPrefix = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Scopes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUsedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevokedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceApiKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TicketDevelopmentLinks",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TicketId = table.Column<long>(type: "bigint", nullable: false),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Repo = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    Url = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketDevelopmentLinks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_IsDevelopmentOrder_ProductionAt_DigestSentAt",
                table: "Tickets",
                columns: new[] { "IsDevelopmentOrder", "ProductionAt", "DigestSentAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_OrganizationId_IsDevelopmentOrder_DevelopmentStage",
                table: "Tickets",
                columns: new[] { "OrganizationId", "IsDevelopmentOrder", "DevelopmentStage" });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceApiKeys_KeyHash",
                table: "ServiceApiKeys",
                column: "KeyHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceApiKeys_OrganizationId",
                table: "ServiceApiKeys",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketDevelopmentLinks_OrganizationId",
                table: "TicketDevelopmentLinks",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketDevelopmentLinks_TicketId",
                table: "TicketDevelopmentLinks",
                column: "TicketId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ServiceApiKeys");

            migrationBuilder.DropTable(
                name: "TicketDevelopmentLinks");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_IsDevelopmentOrder_ProductionAt_DigestSentAt",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_OrganizationId_IsDevelopmentOrder_DevelopmentStage",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AnnouncedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AnnouncementVideoUrl",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DevelopmentStage",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DigestSentAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "IsDevelopmentOrder",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "ProductionAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SessionLogUrl",
                table: "Tickets");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomStatusesAndGoogleChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GoogleChatWebhookUrl",
                table: "Projects",
                type: "nvarchar(700)",
                maxLength: 700,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TicketStatusDefs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    Key = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsClosedLike = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketStatusDefs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketStatusDefs_OrganizationId",
                table: "TicketStatusDefs",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketStatusDefs_OrganizationId_Key",
                table: "TicketStatusDefs",
                columns: new[] { "OrganizationId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TicketStatusDefs");

            migrationBuilder.DropColumn(
                name: "GoogleChatWebhookUrl",
                table: "Projects");
        }
    }
}

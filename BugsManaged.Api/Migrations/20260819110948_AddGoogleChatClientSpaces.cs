using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGoogleChatClientSpaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GoogleChatMessageName",
                table: "TicketNotes",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GoogleChatSpaces",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    SpaceName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MemberEmail = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    InviteSent = table.Column<bool>(type: "bit", nullable: false),
                    MemberFirstSeenAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedForTicketId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastMessageAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoogleChatSpaces", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GoogleServiceAccounts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: true),
                    ProjectId = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    PrivateKeyId = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    PrivateKey = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ClientEmail = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ClientId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ClientX509CertUrl = table.Column<string>(type: "nvarchar(700)", maxLength: 700, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoogleServiceAccounts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketNotes_GoogleChatMessageName",
                table: "TicketNotes",
                column: "GoogleChatMessageName",
                unique: true,
                filter: "[GoogleChatMessageName] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleChatSpaces_OrganizationId_MemberEmail",
                table: "GoogleChatSpaces",
                columns: new[] { "OrganizationId", "MemberEmail" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GoogleChatSpaces_SpaceName",
                table: "GoogleChatSpaces",
                column: "SpaceName");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleServiceAccounts_OrganizationId_IsActive",
                table: "GoogleServiceAccounts",
                columns: new[] { "OrganizationId", "IsActive" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GoogleChatSpaces");

            migrationBuilder.DropTable(
                name: "GoogleServiceAccounts");

            migrationBuilder.DropIndex(
                name: "IX_TicketNotes_GoogleChatMessageName",
                table: "TicketNotes");

            migrationBuilder.DropColumn(
                name: "GoogleChatMessageName",
                table: "TicketNotes");
        }
    }
}

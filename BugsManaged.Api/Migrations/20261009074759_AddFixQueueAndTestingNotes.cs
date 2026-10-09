using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFixQueueAndTestingNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FixClaimedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FixClaimedBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FixCompletedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FixFeedback",
                table: "Tickets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FixRequestedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FixStatus",
                table: "Tickets",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FixSummary",
                table: "Tickets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TestingNotes",
                table: "Tickets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AutoDraftFixes",
                table: "Projects",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_OrganizationId_FixStatus",
                table: "Tickets",
                columns: new[] { "OrganizationId", "FixStatus" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tickets_OrganizationId_FixStatus",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixClaimedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixClaimedBy",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixCompletedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixFeedback",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixRequestedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixStatus",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "FixSummary",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "TestingNotes",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AutoDraftFixes",
                table: "Projects");
        }
    }
}

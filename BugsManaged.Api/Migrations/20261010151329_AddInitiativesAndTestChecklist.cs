using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInitiativesAndTestChecklist : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "DependsOnOrderId",
                table: "Tickets",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DependsOnStage",
                table: "Tickets",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ParentOrderId",
                table: "Tickets",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhaseNumber",
                table: "Tickets",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TicketTestItems",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    TicketId = table.Column<long>(type: "bigint", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Expected = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Environment = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Result = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    ResultNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    TestedIn = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    TestedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    TestedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketTestItems", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_DependsOnOrderId",
                table: "Tickets",
                column: "DependsOnOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_ParentOrderId",
                table: "Tickets",
                column: "ParentOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketTestItems_OrganizationId",
                table: "TicketTestItems",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketTestItems_TicketId",
                table: "TicketTestItems",
                column: "TicketId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TicketTestItems");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_DependsOnOrderId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_ParentOrderId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DependsOnOrderId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DependsOnStage",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "ParentOrderId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "PhaseNumber",
                table: "Tickets");
        }
    }
}

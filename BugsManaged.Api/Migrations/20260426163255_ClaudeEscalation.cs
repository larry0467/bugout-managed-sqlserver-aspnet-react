using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class ClaudeEscalation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AssignedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssignedBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssigneeType",
                table: "Tickets",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EscalatedToOwnerAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EscalatedToOwnerBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            // EscalationStage: new tickets default to SUPER_ADMIN_REVIEW (set
            // explicitly by the controller). For pre-existing rows backfilled
            // by this migration we use NONE so we don't auto-route stale
            // tickets through the chain.
            migrationBuilder.AddColumn<string>(
                name: "EscalationStage",
                table: "Tickets",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "NONE");

            migrationBuilder.AddColumn<string>(
                name: "DevBranch",
                table: "Projects",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GithubOwner",
                table: "Projects",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GithubRepo",
                table: "Projects",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepoPath",
                table: "Projects",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepoSubpath",
                table: "Projects",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClaudeRuns",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TicketId = table.Column<long>(type: "bigint", nullable: false),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Model = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    TokensIn = table.Column<int>(type: "int", nullable: true),
                    TokensOut = table.Column<int>(type: "int", nullable: true),
                    CostUsd = table.Column<decimal>(type: "decimal(10,4)", nullable: true),
                    DurationMs = table.Column<int>(type: "int", nullable: true),
                    AnalysisMarkdown = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PrUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    BranchName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RequestedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClaudeRuns", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClaudeRuns_OrganizationId",
                table: "ClaudeRuns",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ClaudeRuns_Status",
                table: "ClaudeRuns",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_ClaudeRuns_TicketId",
                table: "ClaudeRuns",
                column: "TicketId");

            // Data-migrate the role rename. Old codebase used PLATFORM_ADMIN
            // and PROJECT_ADMIN. New codebase uses PLATFORM_OWNER and
            // SUPER_ADMIN. Idempotent — safe to run on a fresh DB (just no-ops).
            migrationBuilder.Sql("UPDATE Users SET Role = 'PLATFORM_OWNER' WHERE Role = 'PLATFORM_ADMIN';");
            migrationBuilder.Sql("UPDATE Users SET Role = 'SUPER_ADMIN'    WHERE Role = 'PROJECT_ADMIN';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reverse the role rename so a rollback restores the old strings.
            migrationBuilder.Sql("UPDATE Users SET Role = 'PLATFORM_ADMIN' WHERE Role = 'PLATFORM_OWNER';");
            migrationBuilder.Sql("UPDATE Users SET Role = 'PROJECT_ADMIN'  WHERE Role = 'SUPER_ADMIN';");

            migrationBuilder.DropTable(
                name: "ClaudeRuns");

            migrationBuilder.DropColumn(
                name: "AssignedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AssignedBy",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AssigneeType",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "EscalatedToOwnerAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "EscalatedToOwnerBy",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "EscalationStage",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DevBranch",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "GithubOwner",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "GithubRepo",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RepoPath",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RepoSubpath",
                table: "Projects");
        }
    }
}

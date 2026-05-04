using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class OwnerApprovalLoop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovedBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RevisionCount",
                table: "Tickets",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubmittedForApprovalAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubmittedForApprovalBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TicketStageHistory",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TicketId = table.Column<long>(type: "bigint", nullable: false),
                    OrganizationId = table.Column<long>(type: "bigint", nullable: false),
                    FromStage = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ToStage = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketStageHistory", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketStageHistory_OrganizationId",
                table: "TicketStageHistory",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketStageHistory_TicketId",
                table: "TicketStageHistory",
                column: "TicketId");

            // Backfill TicketStageHistory for any pre-existing tickets so the
            // performance dashboard's interval math has a starting row to
            // anchor off. One row per ticket reflecting its current stage,
            // with ChangedAt = AssignedAt ?? EscalatedToOwnerAt ?? CreatedAt.
            // FromStage is left NULL (initial-transition convention used in
            // the entity comment). ChangedBy uses the most relevant audit
            // column for the current stage. Idempotent: only runs against
            // tickets that don't already have a history row.
            migrationBuilder.Sql(@"
INSERT INTO TicketStageHistory (TicketId, OrganizationId, FromStage, ToStage, ChangedBy, ChangedAt, Note)
SELECT
    t.Id,
    t.OrganizationId,
    NULL,
    t.EscalationStage,
    COALESCE(t.AssignedBy, t.EscalatedToOwnerBy, t.SubmittedBy),
    COALESCE(t.AssignedAt, t.EscalatedToOwnerAt, t.CreatedAt),
    NULL
FROM Tickets t
WHERE NOT EXISTS (
    SELECT 1 FROM TicketStageHistory h WHERE h.TicketId = t.Id
);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TicketStageHistory");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "ApprovedBy",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "RevisionCount",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SubmittedForApprovalAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SubmittedForApprovalBy",
                table: "Tickets");
        }
    }
}

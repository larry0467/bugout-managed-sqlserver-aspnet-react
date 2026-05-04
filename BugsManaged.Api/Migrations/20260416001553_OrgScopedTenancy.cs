using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class OrgScopedTenancy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "OrganizationId",
                table: "Tickets",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "OrganizationId",
                table: "TicketNotes",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AlterColumn<long>(
                name: "OrganizationId",
                table: "Projects",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            // Backfill the denormalized OrganizationId on existing tickets
            // and notes so they aren't stuck at the default 0 (which would
            // be invisible to the new global query filters). Safe on empty
            // tables too — it's just a no-op.
            migrationBuilder.Sql(@"
                UPDATE Tickets
                SET OrganizationId = p.OrganizationId
                FROM Tickets t
                INNER JOIN Projects p ON p.Id = t.ProjectId
                WHERE t.OrganizationId = 0;
            ");

            migrationBuilder.Sql(@"
                UPDATE TicketNotes
                SET OrganizationId = t.OrganizationId
                FROM TicketNotes n
                INNER JOIN Tickets t ON t.Id = n.TicketId
                WHERE n.OrganizationId = 0;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_OrganizationId",
                table: "Tickets",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketNotes_OrganizationId",
                table: "TicketNotes",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_OrganizationId",
                table: "Projects",
                column: "OrganizationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tickets_OrganizationId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_TicketNotes_OrganizationId",
                table: "TicketNotes");

            migrationBuilder.DropIndex(
                name: "IX_Projects_OrganizationId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "TicketNotes");

            migrationBuilder.AlterColumn<long>(
                name: "OrganizationId",
                table: "Projects",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint");
        }
    }
}

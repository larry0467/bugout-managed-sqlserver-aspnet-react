using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProjectAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserProjectAssignments",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    ProjectId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProjectAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserProjectAssignments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserProjectAssignments_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserProjectAssignments_ProjectId",
                table: "UserProjectAssignments",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProjectAssignments_UserId_ProjectId",
                table: "UserProjectAssignments",
                columns: new[] { "UserId", "ProjectId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserProjectAssignments");
        }
    }
}

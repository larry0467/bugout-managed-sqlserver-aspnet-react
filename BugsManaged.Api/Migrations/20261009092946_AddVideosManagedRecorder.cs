using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddVideosManagedRecorder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VideosManagedRecordingId",
                table: "Tickets",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VideosManagedApiKey",
                table: "Projects",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VideosManagedRecordingId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "VideosManagedApiKey",
                table: "Projects");
        }
    }
}

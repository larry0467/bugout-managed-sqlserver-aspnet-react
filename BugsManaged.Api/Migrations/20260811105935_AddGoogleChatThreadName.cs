using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGoogleChatThreadName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GoogleChatThreadName",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GoogleChatThreadName",
                table: "Tickets");
        }
    }
}

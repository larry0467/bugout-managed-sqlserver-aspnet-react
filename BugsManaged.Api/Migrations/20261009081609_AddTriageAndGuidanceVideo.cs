using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BugsManaged.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTriageAndGuidanceVideo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GuidanceTranscript",
                table: "Tickets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GuidanceVideoUrl",
                table: "Tickets",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriageDecision",
                table: "Tickets",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TriagedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriagedBy",
                table: "Tickets",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GuidanceTranscript",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "GuidanceVideoUrl",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "TriageDecision",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "TriagedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "TriagedBy",
                table: "Tickets");
        }
    }
}

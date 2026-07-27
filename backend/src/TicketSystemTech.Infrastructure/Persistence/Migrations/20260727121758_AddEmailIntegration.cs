using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EmailConnections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    ConnectedEmail = table.Column<string>(type: "text", nullable: false),
                    AccessToken = table.Column<string>(type: "text", nullable: false),
                    RefreshToken = table.Column<string>(type: "text", nullable: false),
                    AccessTokenExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailConnections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmailTicketMarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<string>(type: "text", nullable: false),
                    IsMarked = table.Column<bool>(type: "boolean", nullable: false),
                    ConvertedTicketId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailTicketMarks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailConnections_UserId",
                table: "EmailConnections",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailTicketMarks_UserId_MessageId",
                table: "EmailTicketMarks",
                columns: new[] { "UserId", "MessageId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailConnections");

            migrationBuilder.DropTable(
                name: "EmailTicketMarks");
        }
    }
}

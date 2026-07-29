using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketPriorityAssigneesOverdue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "OverdueNotifiedAtUtc",
                table: "Tickets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Priority",
                table: "Tickets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WorkEndedAtUtc",
                table: "Tickets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WorkStartedAtUtc",
                table: "Tickets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OverdueNotificationSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NotifyOnSlaBreach = table.Column<bool>(type: "boolean", nullable: false),
                    ManualOverdueDays = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OverdueNotificationSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TicketAssignees",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketAssignees", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TicketAssignees_Tickets_TicketId",
                        column: x => x.TicketId,
                        principalTable: "Tickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketAssignees_TicketId_UserId",
                table: "TicketAssignees",
                columns: new[] { "TicketId", "UserId" },
                unique: true);

            // Backfill: every ticket that already has a primary assignee gets a matching TicketAssignees row,
            // so existing tickets show up correctly in the new multi-assignee list instead of appearing unassigned.
            migrationBuilder.Sql("""
                INSERT INTO "TicketAssignees" ("Id", "TicketId", "UserId", "AssignedAtUtc", "CreatedAt")
                SELECT gen_random_uuid(), "Id", "AssignedToUserId", COALESCE("OpenedAtUtc", "CreatedAt"), NOW()
                FROM "Tickets"
                WHERE "AssignedToUserId" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OverdueNotificationSettings");

            migrationBuilder.DropTable(
                name: "TicketAssignees");

            migrationBuilder.DropColumn(
                name: "OverdueNotifiedAtUtc",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "WorkEndedAtUtc",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "WorkStartedAtUtc",
                table: "Tickets");
        }
    }
}

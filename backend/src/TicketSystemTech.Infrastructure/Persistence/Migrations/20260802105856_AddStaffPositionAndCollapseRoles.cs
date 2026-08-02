using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffPositionAndCollapseRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StaffPositionId",
                table: "AspNetUsers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StaffPositions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffPositions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_StaffPositionId",
                table: "AspNetUsers",
                column: "StaffPositionId");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_StaffPositions_StaffPositionId",
                table: "AspNetUsers",
                column: "StaffPositionId",
                principalTable: "StaffPositions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_StaffPositions_StaffPositionId",
                table: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "StaffPositions");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_StaffPositionId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "StaffPositionId",
                table: "AspNetUsers");
        }
    }
}

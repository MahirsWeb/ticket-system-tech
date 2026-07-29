using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubBranches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SubBranchId",
                table: "Tickets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubBranchId",
                table: "AspNetUsers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SubBranches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubBranches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubBranches_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_SubBranchId",
                table: "Tickets",
                column: "SubBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_SubBranchId",
                table: "AspNetUsers",
                column: "SubBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SubBranches_DepartmentId_Name",
                table: "SubBranches",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_SubBranches_SubBranchId",
                table: "AspNetUsers",
                column: "SubBranchId",
                principalTable: "SubBranches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_SubBranches_SubBranchId",
                table: "Tickets",
                column: "SubBranchId",
                principalTable: "SubBranches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_SubBranches_SubBranchId",
                table: "AspNetUsers");

            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_SubBranches_SubBranchId",
                table: "Tickets");

            migrationBuilder.DropTable(
                name: "SubBranches");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_SubBranchId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_SubBranchId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SubBranchId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SubBranchId",
                table: "AspNetUsers");
        }
    }
}

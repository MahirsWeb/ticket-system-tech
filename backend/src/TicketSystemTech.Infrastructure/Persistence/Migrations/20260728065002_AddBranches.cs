using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBranches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EmailTicketMarks_UserId_MessageId",
                table: "EmailTicketMarks");

            migrationBuilder.RenameColumn(
                name: "UserId",
                table: "EmailTicketMarks",
                newName: "MarkedByUserId");

            migrationBuilder.RenameColumn(
                name: "UserId",
                table: "EmailConnections",
                newName: "DepartmentId");

            migrationBuilder.RenameIndex(
                name: "IX_EmailConnections_UserId",
                table: "EmailConnections",
                newName: "IX_EmailConnections_DepartmentId");

            migrationBuilder.AddColumn<Guid>(
                name: "DepartmentId",
                table: "EmailTicketMarks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "ConnectedByUserId",
                table: "EmailConnections",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "Departments",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "DepartmentId",
                table: "AspNetUsers",
                type: "uuid",
                nullable: true);

            // Existing seeded branches all got the same "" default above; give each a unique placeholder
            // email (derived from its name + id) before the unique index below is created, so the migration
            // doesn't fail against a database that already has departments. Admin can edit these afterwards.
            migrationBuilder.Sql("""
                UPDATE "Departments"
                SET "Email" = LOWER(REGEXP_REPLACE("Name", '[^a-zA-Z0-9]+', '', 'g')) || '-' || SUBSTRING("Id"::text, 1, 8) || '@ticketsystemtech.local'
                WHERE "Email" = '';
                """);

            // Every existing mark just collapsed onto the same placeholder DepartmentId (00000000-...), since
            // marks used to be scoped per-user. If two different people had marked/converted the same MessageId
            // (e.g. during earlier testing), that now collides on (DepartmentId, MessageId). Keep the most useful
            // row per MessageId (prefer one that was actually converted to a ticket, else the newest) and drop the
            // rest before the unique index below is created.
            migrationBuilder.Sql("""
                DELETE FROM "EmailTicketMarks" t
                USING (
                    SELECT "Id",
                           ROW_NUMBER() OVER (
                               PARTITION BY "MessageId"
                               ORDER BY ("ConvertedTicketId" IS NOT NULL) DESC, "CreatedAt" DESC
                           ) AS rn
                    FROM "EmailTicketMarks"
                ) ranked
                WHERE t."Id" = ranked."Id" AND ranked.rn > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_EmailTicketMarks_DepartmentId_MessageId",
                table: "EmailTicketMarks",
                columns: new[] { "DepartmentId", "MessageId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_Email",
                table: "Departments",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_DepartmentId",
                table: "AspNetUsers",
                column: "DepartmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_Departments_DepartmentId",
                table: "AspNetUsers",
                column: "DepartmentId",
                principalTable: "Departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_Departments_DepartmentId",
                table: "AspNetUsers");

            migrationBuilder.DropIndex(
                name: "IX_EmailTicketMarks_DepartmentId_MessageId",
                table: "EmailTicketMarks");

            migrationBuilder.DropIndex(
                name: "IX_Departments_Email",
                table: "Departments");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_DepartmentId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "EmailTicketMarks");

            migrationBuilder.DropColumn(
                name: "ConnectedByUserId",
                table: "EmailConnections");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "MarkedByUserId",
                table: "EmailTicketMarks",
                newName: "UserId");

            migrationBuilder.RenameColumn(
                name: "DepartmentId",
                table: "EmailConnections",
                newName: "UserId");

            migrationBuilder.RenameIndex(
                name: "IX_EmailConnections_DepartmentId",
                table: "EmailConnections",
                newName: "IX_EmailConnections_UserId");

            migrationBuilder.CreateIndex(
                name: "IX_EmailTicketMarks_UserId_MessageId",
                table: "EmailTicketMarks",
                columns: new[] { "UserId", "MessageId" },
                unique: true);
        }
    }
}

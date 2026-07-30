using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TicketSystemTech.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveSlaResponseTimeAddTicketCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ResponseTimeHours",
                table: "SlaPlans");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Tickets",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Tickets");

            migrationBuilder.AddColumn<int>(
                name: "ResponseTimeHours",
                table: "SlaPlans",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}

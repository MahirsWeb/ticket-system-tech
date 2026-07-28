using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Identity;

namespace TicketSystemTech.Infrastructure.Persistence;

/// <summary>Seeds reference data (SLA plans, departments, help topics) and the first Admin account.</summary>
public static class DbSeeder
{
    public const string SeedAdminEmail = "hodzicmahir002@gmail.com";
    public const string SeedAdminPassword = "Admin12345!";

    public static async Task SeedAsync(AppDbContext db, UserManager<ApplicationUser> userManager, ILogger logger)
    {
        if (!await db.SlaPlans.AnyAsync())
        {
            db.SlaPlans.AddRange(
                new SlaPlan { Name = "Standard", ResponseTimeHours = 8, ResolutionTimeHours = 72 },
                new SlaPlan { Name = "Priority", ResponseTimeHours = 4, ResolutionTimeHours = 24 },
                new SlaPlan { Name = "Critical", ResponseTimeHours = 1, ResolutionTimeHours = 8 }
            );
        }

        if (!await db.Departments.AnyAsync())
        {
            db.Departments.AddRange(
                new Department { Name = "Technical Support", Email = "support@ticketsystemtech.local" },
                new Department { Name = "Consulting", Email = "consulting@ticketsystemtech.local" },
                new Department { Name = "Billing", Email = "billing@ticketsystemtech.local" },
                new Department { Name = "General", Email = "general@ticketsystemtech.local" }
            );
        }

        if (!await db.HelpTopics.AnyAsync())
        {
            db.HelpTopics.AddRange(
                new HelpTopic { Name = "Bug Report" },
                new HelpTopic { Name = "Technical Problem" },
                new HelpTopic { Name = "Feature Request" },
                new HelpTopic { Name = "Account Issue" },
                new HelpTopic { Name = "General Question" },
                new HelpTopic { Name = "Other" }
            );
        }

        await db.SaveChangesAsync();

        var existingAdmin = await userManager.FindByEmailAsync(SeedAdminEmail);
        if (existingAdmin is null)
        {
            var admin = new ApplicationUser
            {
                UserName = SeedAdminEmail,
                Email = SeedAdminEmail,
                EmailConfirmed = true,
                FirstName = "Admin",
                LastName = "User",
                Role = UserRole.Admin,
                IsActive = true,
                PhoneNumberPrompted = true
            };

            var result = await userManager.CreateAsync(admin, SeedAdminPassword);
            if (!result.Succeeded)
            {
                logger.LogError("Failed to seed admin user: {Errors}",
                    string.Join(", ", result.Errors.Select(e => e.Description)));
            }
            else
            {
                logger.LogInformation("Seeded initial Admin account: {Email}", SeedAdminEmail);
            }
        }
    }
}

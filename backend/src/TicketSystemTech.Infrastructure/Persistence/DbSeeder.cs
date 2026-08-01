using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Identity;

namespace TicketSystemTech.Infrastructure.Persistence;

/// <summary>Ensures an Admin account always exists.</summary>
public static class DbSeeder
{
    public const string SeedAdminEmail = "hodzicmahir002@gmail.com";
    public const string SeedAdminPassword = "Admin12345!";

    /// <summary>
    /// Only ensures an Admin account exists — a safety net so the app is never fully locked out.
    /// Does NOT seed any reference/lookup data (branches, help topics, SLA plans, categories) or
    /// the overdue-notification settings row; those are created on demand through the Settings UI
    /// (OverdueNotificationSettings is lazily created on first read/write in SettingsController).
    /// </summary>
    public static async Task SeedAsync(AppDbContext db, UserManager<ApplicationUser> userManager, ILogger logger)
    {
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

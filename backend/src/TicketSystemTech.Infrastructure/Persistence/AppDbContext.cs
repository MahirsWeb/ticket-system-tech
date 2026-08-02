using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Infrastructure.Identity;

namespace TicketSystemTech.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<HelpTopic> HelpTopics => Set<HelpTopic>();
    public DbSet<TicketCategory> TicketCategories => Set<TicketCategory>();
    public DbSet<StaffPosition> StaffPositions => Set<StaffPosition>();
    public DbSet<SlaPlan> SlaPlans => Set<SlaPlan>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketMessage> TicketMessages => Set<TicketMessage>();
    public DbSet<TicketAttachment> TicketAttachments => Set<TicketAttachment>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<KnowledgeBaseDocument> KnowledgeBaseDocuments => Set<KnowledgeBaseDocument>();
    public DbSet<KnowledgeBaseChunk> KnowledgeBaseChunks => Set<KnowledgeBaseChunk>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<EmailConnection> EmailConnections => Set<EmailConnection>();
    public DbSet<EmailTicketMark> EmailTicketMarks => Set<EmailTicketMark>();
    public DbSet<TicketAssignee> TicketAssignees => Set<TicketAssignee>();
    public DbSet<OverdueNotificationSettings> OverdueNotificationSettings => Set<OverdueNotificationSettings>();
    public DbSet<SubBranch> SubBranches => Set<SubBranch>();
    public DbSet<WorkTask> WorkTasks => Set<WorkTask>();
    public DbSet<WorkTaskAssignmentLog> WorkTaskAssignmentLogs => Set<WorkTaskAssignmentLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.HasSequence<long>("TicketNumberSequence").StartsAt(100001).IncrementsBy(1);

        builder.Entity<ApplicationUser>(e =>
        {
            e.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
            e.Property(u => u.LastName).HasMaxLength(100).IsRequired();
            e.HasIndex(u => u.CompanyId);
            e.HasIndex(u => u.Role);
            e.HasIndex(u => u.DepartmentId);
            e.HasIndex(u => u.SubBranchId);
            e.HasOne<Department>().WithMany().HasForeignKey(u => u.DepartmentId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<SubBranch>().WithMany().HasForeignKey(u => u.SubBranchId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(u => u.StaffPositionId);
            e.HasOne(u => u.StaffPosition).WithMany().HasForeignKey(u => u.StaffPositionId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<Company>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(200).IsRequired();
        });

        builder.Entity<Department>(e =>
        {
            e.Property(d => d.Name).HasMaxLength(150).IsRequired();
            e.Property(d => d.Email).HasMaxLength(256).IsRequired();
            e.HasIndex(d => d.Email).IsUnique();
        });

        builder.Entity<HelpTopic>(e =>
        {
            e.Property(h => h.Name).HasMaxLength(150).IsRequired();
        });

        builder.Entity<TicketCategory>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(150).IsRequired();
        });

        builder.Entity<StaffPosition>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(150).IsRequired();
        });

        builder.Entity<SlaPlan>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(150).IsRequired();
        });

        builder.Entity<Ticket>(e =>
        {
            e.Property(t => t.TicketNumber).HasMaxLength(20).IsRequired();
            e.HasIndex(t => t.TicketNumber).IsUnique();
            e.Property(t => t.Title).HasMaxLength(300).IsRequired();
            e.HasIndex(t => t.Status);
            e.HasIndex(t => t.CompanyId);
            e.HasIndex(t => t.AssignedToUserId);
            e.HasIndex(t => t.ClientId);
            e.HasIndex(t => t.CreatedAt);
            e.HasIndex(t => t.DepartmentId);
            e.HasIndex(t => t.SubBranchId);
            // Matches the default list sort (most urgent first, then soonest due date) so large ticket
            // volumes can be paged via an index scan instead of sorting the whole filtered set every request.
            e.HasIndex(t => new { t.Priority, t.DueDateUtc });

            e.HasOne(t => t.Company).WithMany().HasForeignKey(t => t.CompanyId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.HelpTopic).WithMany().HasForeignKey(t => t.HelpTopicId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Category).WithMany().HasForeignKey(t => t.CategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Department).WithMany().HasForeignKey(t => t.DepartmentId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.SubBranch).WithMany().HasForeignKey(t => t.SubBranchId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.SlaPlan).WithMany().HasForeignKey(t => t.SlaPlanId).OnDelete(DeleteBehavior.SetNull);

            e.HasMany(t => t.Messages).WithOne(m => m.Ticket).HasForeignKey(m => m.TicketId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(t => t.Attachments).WithOne(a => a.Ticket).HasForeignKey(a => a.TicketId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TicketMessage>(e =>
        {
            e.HasIndex(m => m.TicketId);
        });

        builder.Entity<TicketAttachment>(e =>
        {
            e.HasOne(a => a.Message).WithMany(m => m.Attachments).HasForeignKey(a => a.MessageId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Notification>(e =>
        {
            e.HasIndex(n => new { n.UserId, n.IsRead });
        });

        builder.Entity<KnowledgeBaseChunk>(e =>
        {
            e.HasOne(c => c.Document).WithMany(d => d.Chunks).HasForeignKey(c => c.DocumentId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Ticket).WithMany().HasForeignKey(c => c.TicketId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EmailConnection>(e =>
        {
            e.HasIndex(c => c.DepartmentId).IsUnique();
        });

        builder.Entity<EmailTicketMark>(e =>
        {
            e.HasIndex(m => new { m.DepartmentId, m.MessageId }).IsUnique();
        });

        builder.Entity<TicketAssignee>(e =>
        {
            e.HasIndex(a => new { a.TicketId, a.UserId }).IsUnique();
            e.HasOne(a => a.Ticket).WithMany(t => t.Assignees).HasForeignKey(a => a.TicketId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SubBranch>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(150).IsRequired();
            e.HasIndex(s => new { s.DepartmentId, s.Name }).IsUnique();
            e.HasOne(s => s.Department).WithMany().HasForeignKey(s => s.DepartmentId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<WorkTask>(e =>
        {
            e.Property(t => t.Title).HasMaxLength(300).IsRequired();
            e.HasIndex(t => t.DepartmentId);
            e.HasIndex(t => t.AssignedToUserId);
            e.HasOne(t => t.Department).WithMany().HasForeignKey(t => t.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(t => t.AssignmentHistory).WithOne(h => h.WorkTask).HasForeignKey(h => h.WorkTaskId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<WorkTaskAssignmentLog>(e =>
        {
            e.HasIndex(h => h.WorkTaskId);
        });
    }
}

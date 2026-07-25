using TicketSystemTech.Domain.Common;
using TicketSystemTech.Domain.Enums;

namespace TicketSystemTech.Domain.Entities;

public class Ticket : BaseEntity
{
    /// <summary>Public-facing ticket number, e.g. "100042". Assigned on creation.</summary>
    public string TicketNumber { get; set; } = string.Empty;

    /// <summary>Original title from the client. Immutable once set.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Original HTML description from the client. Immutable once set.</summary>
    public string Description { get; set; } = string.Empty;

    public Guid ClientId { get; set; }
    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public TicketStatus Status { get; set; } = TicketStatus.New;

    // Filled in when a consultant opens the ticket.
    public TicketSource? Source { get; set; }
    public Guid? HelpTopicId { get; set; }
    public HelpTopic? HelpTopic { get; set; }
    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public Guid? SlaPlanId { get; set; }
    public SlaPlan? SlaPlan { get; set; }
    public DateTime? DueDateUtc { get; set; }
    public Guid? AssignedToUserId { get; set; }

    public Guid? OpenedByUserId { get; set; }
    public DateTime? OpenedAtUtc { get; set; }

    public Guid? ClosedByUserId { get; set; }
    public DateTime? ClosedAtUtc { get; set; }

    /// <summary>Mandatory detailed resolution description, required to close the ticket.</summary>
    public string? ResolutionSummary { get; set; }

    /// <summary>Optional technical/code-change log recorded by support when closing.</summary>
    public string? TechnicalNotes { get; set; }

    public ICollection<TicketMessage> Messages { get; set; } = new List<TicketMessage>();
    public ICollection<TicketAttachment> Attachments { get; set; } = new List<TicketAttachment>();
}

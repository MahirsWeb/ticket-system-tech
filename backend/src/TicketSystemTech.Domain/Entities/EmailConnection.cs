using TicketSystemTech.Domain.Common;

namespace TicketSystemTech.Domain.Entities;

/// <summary>An OAuth connection to a staff member's own mailbox (e.g. Outlook), used to triage inbound emails into tickets.</summary>
public class EmailConnection : BaseEntity
{
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "Outlook";
    public string ConnectedEmail { get; set; } = string.Empty;
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime AccessTokenExpiresAtUtc { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

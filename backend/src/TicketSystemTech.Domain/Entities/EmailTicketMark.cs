using TicketSystemTech.Domain.Common;

namespace TicketSystemTech.Domain.Entities;

/// <summary>Tracks which inbox messages a staff member has flagged as ticket candidates, and whether converted.</summary>
public class EmailTicketMark : BaseEntity
{
    public Guid UserId { get; set; }
    public string MessageId { get; set; } = string.Empty;
    public bool IsMarked { get; set; }
    public Guid? ConvertedTicketId { get; set; }
}

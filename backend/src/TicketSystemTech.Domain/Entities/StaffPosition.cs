using TicketSystemTech.Domain.Common;

namespace TicketSystemTech.Domain.Entities;

/// <summary>
/// Purely informational label an Admin can attach to an Employee account (e.g. "Consultant", "Support
/// Agent", "Seller") for reporting/organization only — every Employee has identical rights regardless
/// of position. Admin-managed exactly like TicketCategory/HelpTopic.
/// </summary>
public class StaffPosition : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

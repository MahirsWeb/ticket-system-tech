using TicketSystemTech.Domain.Common;

namespace TicketSystemTech.Domain.Entities;

public class Department : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

using System.ComponentModel.DataAnnotations;

namespace TicketSystemTech.Api.Contracts;

public record LookupItem(Guid Id, string Name);

public record CreateCompanyRequest(
    [Required] string Name,
    string? Address,
    string? ContactInfo
);

public record SlaPlanItem(Guid Id, string Name, int ResponseTimeHours, int ResolutionTimeHours);

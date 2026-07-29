using System.ComponentModel.DataAnnotations;

namespace TicketSystemTech.Api.Contracts;

public record LookupItem(Guid Id, string Name);

public record CreateCompanyRequest(
    [Required] string Name,
    string? Address,
    string? ContactInfo
);

public record SlaPlanItem(Guid Id, string Name, int ResponseTimeHours, int ResolutionTimeHours);

public record NameOnlyRequest(
    [Required] string Name
);

public record UpdateNameRequest(
    [Required] string Name,
    bool IsActive
);

public record CreateDepartmentRequest(
    [Required] string Name,
    [Required, EmailAddress] string Email
);

public record UpdateDepartmentRequest(
    [Required] string Name,
    [Required, EmailAddress] string Email,
    bool IsActive
);

public record DepartmentItemFull(Guid Id, string Name, string Email, bool IsActive);

public record SubBranchItemFull(Guid Id, string Name, bool IsActive, Guid DepartmentId);

public record CreateSubBranchRequest(
    [Required] string Name
);

public record UpdateSubBranchRequest(
    [Required] string Name,
    bool IsActive
);

public record CreateSlaPlanRequest(
    [Required] string Name,
    [Range(1, 24 * 30)] int ResponseTimeHours,
    [Range(1, 24 * 30)] int ResolutionTimeHours
);

public record UpdateSlaPlanRequest(
    [Required] string Name,
    [Range(1, 24 * 30)] int ResponseTimeHours,
    [Range(1, 24 * 30)] int ResolutionTimeHours,
    bool IsActive
);

public record LookupItemFull(Guid Id, string Name, bool IsActive);
public record SlaPlanItemFull(Guid Id, string Name, int ResponseTimeHours, int ResolutionTimeHours, bool IsActive);

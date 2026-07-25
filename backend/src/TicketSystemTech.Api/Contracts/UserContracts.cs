using System.ComponentModel.DataAnnotations;
using TicketSystemTech.Domain.Enums;

namespace TicketSystemTech.Api.Contracts;

public record CreateEmployeeRequest(
    [Required] string FirstName,
    [Required] string LastName,
    [Required, EmailAddress] string Email,
    [Required] UserRole Role // Admin, Consultant, SupportAgent
);

public record CreateClientRequest(
    [Required] string FirstName,
    [Required] string LastName,
    [Required, EmailAddress] string Email,
    [Required] Guid CompanyId
);

public record CreatedUserResponse(
    Guid UserId,
    string Email,
    string TemporaryPassword,
    DateTime TemporaryPasswordExpiresAtUtc
);

public record ClientLookupResult(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    string? PhoneNumber,
    Guid? CompanyId,
    string? CompanyName
);

public record UserListItem(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    string Role,
    Guid? CompanyId,
    string? CompanyName,
    string? PhoneNumber,
    bool IsActive,
    bool EmailConfirmed,
    DateTime CreatedAtUtc
);

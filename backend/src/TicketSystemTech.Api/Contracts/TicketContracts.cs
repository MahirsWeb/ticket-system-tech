using System.ComponentModel.DataAnnotations;
using TicketSystemTech.Domain.Enums;

namespace TicketSystemTech.Api.Contracts;

public record CreateTicketRequest(
    [Required, MaxLength(300)] string Title,
    [Required] string Description
);

public record OpenTicketRequest(
    [Required] TicketSource Source,
    [Required] Guid HelpTopicId,
    [Required] Guid DepartmentId,
    [Required] Guid SlaPlanId,
    [Required] DateTime DueDateUtc,
    [Required] Guid AssignedToUserId
);

public record CloseTicketRequest(
    [Required] string ResolutionSummary,
    string? TechnicalNotes
);

public record AddTicketMessageRequest(
    [Required] MessageType Type,
    [Required] string BodyHtml
);

public record TicketListItem(
    Guid Id,
    string TicketNumber,
    string Title,
    string Status,
    string CompanyName,
    string ClientName,
    string? AssignedToName,
    DateTime CreatedAt,
    DateTime? DueDateUtc,
    DateTime? ClosedAtUtc
);

public record PagedResult<T>(List<T> Items, int Page, int PageSize, int TotalCount);

public record TicketAttachmentDto(Guid Id, string FileName, string FileUrl, long FileSizeBytes, string ContentType, DateTime CreatedAt);

public record TicketMessageDto(
    Guid Id,
    string Type,
    string BodyHtml,
    Guid AuthorId,
    string AuthorName,
    DateTime CreatedAt,
    List<TicketAttachmentDto> Attachments
);

public record TicketDetailDto(
    Guid Id,
    string TicketNumber,
    string Title,
    string Description,
    string Status,
    Guid ClientId,
    string ClientName,
    Guid CompanyId,
    string CompanyName,
    string? Source,
    Guid? HelpTopicId,
    string? HelpTopicName,
    Guid? DepartmentId,
    string? DepartmentName,
    Guid? SlaPlanId,
    string? SlaPlanName,
    DateTime? DueDateUtc,
    Guid? AssignedToUserId,
    string? AssignedToName,
    DateTime? OpenedAtUtc,
    DateTime? ClosedAtUtc,
    string? ResolutionSummary,
    string? TechnicalNotes,
    DateTime CreatedAt,
    List<TicketAttachmentDto> Attachments,
    List<TicketMessageDto> Messages
);

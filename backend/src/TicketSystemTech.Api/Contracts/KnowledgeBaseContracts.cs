namespace TicketSystemTech.Api.Contracts;

public record KnowledgeBaseSearchResultDto(
    Guid TicketId,
    string TicketNumber,
    string Title,
    string Status,
    DateTime? ClosedAtUtc,
    string? ResolutionSummary,
    int MatchScore
);

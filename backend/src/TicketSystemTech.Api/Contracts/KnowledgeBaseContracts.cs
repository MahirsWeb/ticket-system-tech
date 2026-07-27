using System.ComponentModel.DataAnnotations;

namespace TicketSystemTech.Api.Contracts;

public record KnowledgeBaseAskRequest(
    [Required] string Question
);

public record KnowledgeBaseAskResponseDto(
    string Answer,
    List<KnowledgeBaseSearchResultDto> Sources
);

public record KnowledgeBaseSearchResultDto(
    Guid TicketId,
    string TicketNumber,
    string Title,
    string Status,
    DateTime? ClosedAtUtc,
    string? ResolutionSummary,
    int MatchScore
);

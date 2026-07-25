namespace TicketSystemTech.Api.Contracts;

public record ReportSummaryDto(
    int TotalNew,
    int TotalOpen,
    int TotalClosed,
    double AvgResolutionHours,
    double SlaComplianceRate
);

public record TimeSeriesPointDto(DateOnly Date, int Opened, int Closed);

public record LeaderboardEntryDto(Guid UserId, string Name, int ClosedCount);

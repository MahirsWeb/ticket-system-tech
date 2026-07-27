using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public ReportsController(AppDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    private IQueryable<Ticket> Scoped(DateTime from, DateTime to, Guid? companyId, Guid? agentId)
    {
        var query = _db.Tickets.AsNoTracking().Where(t => t.CreatedAt >= from && t.CreatedAt <= to);

        if (agentId.HasValue)
            query = query.Where(t => t.AssignedToUserId == agentId.Value);

        if (companyId.HasValue) query = query.Where(t => t.CompanyId == companyId.Value);
        return query;
    }

    [HttpGet("summary")]
    public async Task<ActionResult<ReportSummaryDto>> Summary(DateTime? from, DateTime? to, Guid? companyId, Guid? agentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await Scoped(f, t, companyId, agentId).ToListAsync();

        var totalNew = tickets.Count(x => x.Status == TicketStatus.New);
        var totalOpen = tickets.Count(x => x.Status is TicketStatus.Open or TicketStatus.InProgress);
        var closed = tickets.Where(x => x.Status == TicketStatus.Closed).ToList();

        var resolutionHours = closed
            .Where(x => x.OpenedAtUtc.HasValue && x.ClosedAtUtc.HasValue)
            .Select(x => (x.ClosedAtUtc!.Value - x.OpenedAtUtc!.Value).TotalHours)
            .ToList();
        var avgResolution = resolutionHours.Count > 0 ? resolutionHours.Average() : 0;

        var closedWithDueDate = closed.Where(x => x.DueDateUtc.HasValue).ToList();
        var compliant = closedWithDueDate.Count(x => x.ClosedAtUtc <= x.DueDateUtc);
        var slaRate = closedWithDueDate.Count > 0 ? (double)compliant / closedWithDueDate.Count * 100 : 100;

        return Ok(new ReportSummaryDto(totalNew, totalOpen, closed.Count, Math.Round(avgResolution, 1), Math.Round(slaRate, 1)));
    }

    [HttpGet("timeseries")]
    public async Task<ActionResult<List<TimeSeriesPointDto>>> TimeSeries(DateTime? from, DateTime? to, Guid? companyId, Guid? agentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await Scoped(f, t, companyId, agentId).ToListAsync();

        var opened = tickets.GroupBy(x => DateOnly.FromDateTime(x.CreatedAt)).ToDictionary(g => g.Key, g => g.Count());
        var closed = tickets.Where(x => x.ClosedAtUtc.HasValue)
            .GroupBy(x => DateOnly.FromDateTime(x.ClosedAtUtc!.Value)).ToDictionary(g => g.Key, g => g.Count());

        var points = new List<TimeSeriesPointDto>();
        for (var d = DateOnly.FromDateTime(f); d <= DateOnly.FromDateTime(t); d = d.AddDays(1))
            points.Add(new TimeSeriesPointDto(d, opened.GetValueOrDefault(d), closed.GetValueOrDefault(d)));

        return Ok(points);
    }

    [HttpGet("leaderboard")]
    public async Task<ActionResult<List<LeaderboardEntryDto>>> Leaderboard(DateTime? from, DateTime? to, Guid? companyId)
    {
        var (f, t) = NormalizeRange(from, to);
        var closed = await Scoped(f, t, companyId, null)
            .Where(x => x.Status == TicketStatus.Closed && x.ClosedByUserId.HasValue)
            .GroupBy(x => x.ClosedByUserId!.Value)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        var userIds = closed.Select(x => x.UserId).ToList();
        var names = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");

        return Ok(closed.Select(x => new LeaderboardEntryDto(x.UserId, names.GetValueOrDefault(x.UserId, "Unknown"), x.Count)).ToList());
    }

    private static (DateTime From, DateTime To) NormalizeRange(DateTime? from, DateTime? to)
    {
        var t = to ?? DateTime.UtcNow;
        var f = from ?? t.AddDays(-30);
        return (f, t);
    }
}

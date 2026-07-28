using System.Text;
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

    private IQueryable<Ticket> Scoped(DateTime from, DateTime to, Guid? companyId, Guid? agentId, Guid? departmentId)
    {
        var query = _db.Tickets.AsNoTracking().Where(t => t.CreatedAt >= from && t.CreatedAt <= to);

        if (agentId.HasValue)
            query = query.Where(t => t.AssignedToUserId == agentId.Value);

        if (companyId.HasValue) query = query.Where(t => t.CompanyId == companyId.Value);

        // Branches are isolated: non-admin staff only ever see their own branch's data, regardless of what's requested.
        if (_currentUser.Role != UserRole.Admin)
            query = query.Where(t => t.DepartmentId == _currentUser.DepartmentId);
        else if (departmentId.HasValue)
            query = query.Where(t => t.DepartmentId == departmentId.Value);

        return query;
    }

    [HttpGet("summary")]
    public async Task<ActionResult<ReportSummaryDto>> Summary(DateTime? from, DateTime? to, Guid? companyId, Guid? agentId, Guid? departmentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await Scoped(f, t, companyId, agentId, departmentId).ToListAsync();

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
    public async Task<ActionResult<List<TimeSeriesPointDto>>> TimeSeries(DateTime? from, DateTime? to, Guid? companyId, Guid? agentId, Guid? departmentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await Scoped(f, t, companyId, agentId, departmentId).ToListAsync();

        var opened = tickets.GroupBy(x => DateOnly.FromDateTime(x.CreatedAt)).ToDictionary(g => g.Key, g => g.Count());
        var closed = tickets.Where(x => x.ClosedAtUtc.HasValue)
            .GroupBy(x => DateOnly.FromDateTime(x.ClosedAtUtc!.Value)).ToDictionary(g => g.Key, g => g.Count());

        var points = new List<TimeSeriesPointDto>();
        for (var d = DateOnly.FromDateTime(f); d <= DateOnly.FromDateTime(t); d = d.AddDays(1))
            points.Add(new TimeSeriesPointDto(d, opened.GetValueOrDefault(d), closed.GetValueOrDefault(d)));

        return Ok(points);
    }

    [HttpGet("leaderboard")]
    public async Task<ActionResult<List<LeaderboardEntryDto>>> Leaderboard(DateTime? from, DateTime? to, Guid? companyId, Guid? departmentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var closed = await Scoped(f, t, companyId, null, departmentId)
            .Where(x => x.Status == TicketStatus.Closed && x.ClosedByUserId.HasValue)
            .GroupBy(x => x.ClosedByUserId!.Value)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        var userIds = closed.Select(x => x.UserId).ToList();
        var names = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");

        return Ok(closed.Select(x => new LeaderboardEntryDto(x.UserId, names.GetValueOrDefault(x.UserId, "Unknown"), x.Count)).ToList());
    }

    /// <summary>Admin-only: ticket counts broken down by branch, for the global cross-branch dashboard view.</summary>
    [HttpGet("by-branch")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<List<BranchBreakdownEntryDto>>> ByBranch(DateTime? from, DateTime? to)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(x => x.CreatedAt >= f && x.CreatedAt <= t && x.DepartmentId.HasValue)
            .ToListAsync();

        var departments = await _db.Departments.ToDictionaryAsync(d => d.Id, d => d.Name);

        var result = tickets.GroupBy(x => x.DepartmentId!.Value)
            .Select(g => new BranchBreakdownEntryDto(
                g.Key,
                departments.GetValueOrDefault(g.Key, "Unknown"),
                g.Count(x => x.Status == TicketStatus.New),
                g.Count(x => x.Status is TicketStatus.Open or TicketStatus.InProgress),
                g.Count(x => x.Status == TicketStatus.Closed)))
            .OrderBy(x => x.DepartmentName)
            .ToList();

        return Ok(result);
    }

    /// <summary>Downloads the filtered ticket list as CSV — respects the same branch/company/agent/date scoping as the other report endpoints.</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(DateTime? from, DateTime? to, Guid? companyId, Guid? agentId, Guid? departmentId)
    {
        var (f, t) = NormalizeRange(from, to);
        var tickets = await Scoped(f, t, companyId, agentId, departmentId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync();

        var userIds = tickets.SelectMany(x => new[] { x.ClientId, x.AssignedToUserId, x.ClosedByUserId })
            .Where(id => id.HasValue).Select(id => id!.Value)
            .Concat(tickets.Select(x => x.ClientId)).Distinct().ToList();
        var names = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");
        var companies = await _db.Companies.ToDictionaryAsync(c => c.Id, c => c.Name);
        var departments = await _db.Departments.ToDictionaryAsync(d => d.Id, d => d.Name);

        var csv = new StringBuilder();
        csv.AppendLine("Ticket Number,Title,Status,Branch,Company,Client,Assigned To,Created At (UTC),Opened At (UTC),Closed At (UTC),Resolution Hours,Resolved By");
        foreach (var x in tickets)
        {
            double? resolutionHours = x.OpenedAtUtc.HasValue && x.ClosedAtUtc.HasValue
                ? Math.Round((x.ClosedAtUtc.Value - x.OpenedAtUtc.Value).TotalHours, 1)
                : null;

            csv.AppendLine(string.Join(",", new[]
            {
                CsvField(x.TicketNumber),
                CsvField(x.Title),
                CsvField(x.Status.ToString()),
                CsvField(x.DepartmentId.HasValue ? departments.GetValueOrDefault(x.DepartmentId.Value, "") : ""),
                CsvField(companies.GetValueOrDefault(x.CompanyId, "")),
                CsvField(names.GetValueOrDefault(x.ClientId, "")),
                CsvField(x.AssignedToUserId.HasValue ? names.GetValueOrDefault(x.AssignedToUserId.Value, "") : ""),
                CsvField(x.CreatedAt.ToString("u")),
                CsvField(x.OpenedAtUtc?.ToString("u") ?? ""),
                CsvField(x.ClosedAtUtc?.ToString("u") ?? ""),
                CsvField(resolutionHours?.ToString() ?? ""),
                CsvField(x.ClosedByUserId.HasValue ? names.GetValueOrDefault(x.ClosedByUserId.Value, "") : "")
            }));
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
        return File(bytes, "text/csv", $"tickets-export-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    private static string CsvField(string value) =>
        value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;

    private static (DateTime From, DateTime To) NormalizeRange(DateTime? from, DateTime? to)
    {
        var t = to ?? DateTime.UtcNow;
        var f = from ?? t.AddDays(-30);
        return (f, t);
    }
}

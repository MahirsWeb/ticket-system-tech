using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api/knowledge-base")]
[Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
public class KnowledgeBaseController : ControllerBase
{
    private readonly AppDbContext _db;

    public KnowledgeBaseController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Keyword search over the auto-built knowledge base (ticket descriptions + internal notes + resolutions).
    /// Falls back to plain-text ranking today; will prefer vector similarity automatically once ticket
    /// chunks have embeddings (Google AI key configured).
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<KnowledgeBaseSearchResultDto>>> Search([FromQuery] string query, [FromQuery] int take = 10)
    {
        if (string.IsNullOrWhiteSpace(query)) return Ok(new List<KnowledgeBaseSearchResultDto>());

        var keywords = query.ToLowerInvariant()
            .Split(new[] { ' ', ',', '.', '?', '!' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2)
            .Distinct()
            .ToList();
        if (keywords.Count == 0) return Ok(new List<KnowledgeBaseSearchResultDto>());

        // Bounded candidate set: recent chunks with their ticket metadata, scored in memory.
        var candidates = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.TicketId != null)
            .OrderByDescending(c => c.CreatedAt)
            .Take(1000)
            .Select(c => new
            {
                c.Content,
                c.TicketId,
            })
            .ToListAsync();

        if (candidates.Count == 0) return Ok(new List<KnowledgeBaseSearchResultDto>());

        var scored = candidates
            .Select(c => new
            {
                c.TicketId,
                Score = keywords.Count(k => c.Content.Contains(k, StringComparison.OrdinalIgnoreCase))
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Take(Math.Clamp(take, 1, 50))
            .ToList();

        if (scored.Count == 0) return Ok(new List<KnowledgeBaseSearchResultDto>());

        var ticketIds = scored.Select(s => s.TicketId!.Value).ToList();
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(t => ticketIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t);

        var results = scored
            .Where(s => tickets.ContainsKey(s.TicketId!.Value))
            .Select(s =>
            {
                var t = tickets[s.TicketId!.Value];
                return new KnowledgeBaseSearchResultDto(t.Id, t.TicketNumber, t.Title, t.Status.ToString(), t.ClosedAtUtc, t.ResolutionSummary, s.Score);
            })
            .ToList();

        return Ok(results);
    }
}

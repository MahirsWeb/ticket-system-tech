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
[Route("api/knowledge-base")]
[Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
public class KnowledgeBaseController : ControllerBase
{
    private const string SystemInstruction =
        "You are a technical support assistant for Ticket System Tech's internal helpdesk. " +
        "You may ONLY use the ticket information given to you in the context — never your own general " +
        "knowledge, and never information about any other product or system. If the context does not " +
        "contain a relevant answer, say plainly that nothing relevant was found in the knowledge base. " +
        "Keep answers short and practical, aimed at a support agent trying to resolve a client's issue. " +
        "Reply in the same language the question was asked in.";

    private readonly AppDbContext _db;
    private readonly IChatCompletionService _chatCompletionService;
    private readonly IKnowledgeBaseIndexer _indexer;

    public KnowledgeBaseController(AppDbContext db, IChatCompletionService chatCompletionService, IKnowledgeBaseIndexer indexer)
    {
        _db = db;
        _chatCompletionService = chatCompletionService;
        _indexer = indexer;
    }

    /// <summary>Backfills the knowledge base for tickets that predate KB indexing (e.g. closed before this feature shipped).</summary>
    [HttpPost("reindex-all")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> ReindexAll()
    {
        var ticketIds = await _db.Tickets.AsNoTracking().Select(t => t.Id).ToListAsync();
        foreach (var id in ticketIds)
            await _indexer.IndexTicketAsync(id);

        return Ok(new { indexed = ticketIds.Count });
    }

    /// <summary>
    /// Keyword search over the auto-built knowledge base (ticket descriptions + internal notes + resolutions).
    /// Falls back to plain-text ranking today; will prefer vector similarity automatically once ticket
    /// chunks have embeddings (Google AI key configured).
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<KnowledgeBaseSearchResultDto>>> Search([FromQuery] string query, [FromQuery] int take = 10)
    {
        var matches = await FindMatchesAsync(query, take);
        return Ok(matches.Select(ToDto).ToList());
    }

    /// <summary>
    /// AI chat endpoint, strictly grounded in the knowledge base: retrieves the most relevant tickets
    /// for the question and asks Gemini to answer using only that context.
    /// </summary>
    [HttpPost("ask")]
    public async Task<ActionResult<KnowledgeBaseAskResponseDto>> Ask(KnowledgeBaseAskRequest request)
    {
        var matches = await FindMatchesAsync(request.Question, 8);
        var sources = matches.Select(ToDto).ToList();

        if (matches.Count == 0)
        {
            return Ok(new KnowledgeBaseAskResponseDto(
                "Nothing relevant was found in the knowledge base yet for this question.", sources));
        }

        var context = string.Join("\n---\n", matches.Select(m =>
            $"Ticket #{m.Ticket.TicketNumber} — {m.Ticket.Title}\n{m.Content}" +
            (string.IsNullOrWhiteSpace(m.Ticket.ResolutionSummary) ? "" : $"\nResolution: {m.Ticket.ResolutionSummary}")));

        var answer = await _chatCompletionService.AskAsync(SystemInstruction, context, request.Question);

        return Ok(new KnowledgeBaseAskResponseDto(
            answer ?? "AI answering isn't configured yet — showing the closest matching tickets instead.",
            sources));
    }

    private record ChunkMatch(Ticket Ticket, string Content, int Score);

    private async Task<List<ChunkMatch>> FindMatchesAsync(string query, int take)
    {
        if (string.IsNullOrWhiteSpace(query)) return new List<ChunkMatch>();

        var keywords = query.ToLowerInvariant()
            .Split(new[] { ' ', ',', '.', '?', '!' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2)
            .Distinct()
            .ToList();
        if (keywords.Count == 0) return new List<ChunkMatch>();

        // Bounded candidate set: recent chunks, scored in memory.
        var candidates = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.TicketId != null)
            .OrderByDescending(c => c.CreatedAt)
            .Take(1000)
            .Select(c => new { c.Content, c.TicketId })
            .ToListAsync();

        if (candidates.Count == 0) return new List<ChunkMatch>();

        var scored = candidates
            .Select(c => new { c.TicketId, c.Content, Score = keywords.Count(k => c.Content.Contains(k, StringComparison.OrdinalIgnoreCase)) })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Take(Math.Clamp(take, 1, 50))
            .ToList();

        if (scored.Count == 0) return new List<ChunkMatch>();

        var ticketIds = scored.Select(s => s.TicketId!.Value).ToList();
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(t => ticketIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t);

        return scored
            .Where(s => tickets.ContainsKey(s.TicketId!.Value))
            .Select(s => new ChunkMatch(tickets[s.TicketId!.Value], s.Content, s.Score))
            .ToList();
    }

    private static KnowledgeBaseSearchResultDto ToDto(ChunkMatch m) =>
        new(m.Ticket.Id, m.Ticket.TicketNumber, m.Ticket.Title, m.Ticket.Status.ToString(), m.Ticket.ClosedAtUtc, m.Ticket.ResolutionSummary, m.Score);
}

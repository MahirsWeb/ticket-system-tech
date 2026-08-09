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
[Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Employee)}")]
public class KnowledgeBaseController : ControllerBase
{
    private const string SystemInstruction =
        "You are a technical support assistant for Ticket System Tech's internal helpdesk. " +
        "You may ONLY use the ticket information given to you in the context — never your own general " +
        "knowledge, and never information about any other product or system. The context is ordered with " +
        "the most detailed, thoroughly-documented tickets first — weigh those most heavily, but synthesize " +
        "your answer from the patterns across ALL of the tickets given to you, not just the first one. " +
        "If you cannot give one confident, specific answer, say so plainly, then on a new line list the " +
        "ticket numbers from the context that look most likely to help (e.g. \"Tickets that might help: " +
        "#12345, #12346\"). Keep answers short and practical, aimed at a support agent trying to resolve " +
        "a client's issue. Reply in the same language the question was asked in.";

    private readonly AppDbContext _db;
    private readonly IChatCompletionService _chatCompletionService;
    private readonly IKnowledgeBaseIndexer _indexer;
    private readonly IEmbeddingService _embeddingService;

    public KnowledgeBaseController(AppDbContext db, IChatCompletionService chatCompletionService, IKnowledgeBaseIndexer indexer, IEmbeddingService embeddingService)
    {
        _db = db;
        _chatCompletionService = chatCompletionService;
        _indexer = indexer;
        _embeddingService = embeddingService;
    }

    /// <summary>
    /// Backfills the knowledge base for tickets that predate KB indexing (e.g. closed before this feature
    /// shipped, or bulk-imported directly into the database). Skips tickets that already have an embedded
    /// chunk, so re-running after a partial/rate-limited run only processes what's still missing instead
    /// of redoing everything from scratch.
    /// </summary>
    [HttpPost("reindex-all")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> ReindexAll()
    {
        var allTicketIds = await _db.Tickets.AsNoTracking().Select(t => t.Id).ToListAsync();
        var alreadyEmbedded = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.TicketId != null && c.Embedding != null)
            .Select(c => c.TicketId!.Value)
            .ToListAsync();
        var ticketIds = allTicketIds.Except(alreadyEmbedded).ToList();

        foreach (var id in ticketIds)
            await _indexer.IndexTicketAsync(id);

        return Ok(new { indexed = ticketIds.Count, skipped = allTicketIds.Count - ticketIds.Count });
    }

    /// <summary>
    /// Semantic search over the auto-built knowledge base (ticket descriptions + internal notes + resolutions),
    /// ranked by cosine similarity between the query's embedding and each chunk's stored embedding. Falls back
    /// to plain keyword matching when no embedding provider is configured (no Google AI key) or no chunk has
    /// an embedding yet.
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
        var matches = await FindMatchesAsync(request.Question, 50);
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

        // Prefer real semantic search — embed the query and rank chunks by cosine similarity.
        var queryEmbedding = await _embeddingService.EmbedAsync(query);
        if (queryEmbedding is not null)
        {
            var semanticMatches = await FindMatchesBySimilarityAsync(queryEmbedding, take);
            if (semanticMatches.Count > 0) return semanticMatches;
        }

        // Fallback: no embedding provider configured, or no chunk has an embedding yet.
        return await FindMatchesByKeywordAsync(query, take);
    }

    private async Task<List<ChunkMatch>> FindMatchesBySimilarityAsync(float[] queryEmbedding, int take)
    {
        // Scored in memory against the whole knowledge base (no pgvector index yet). A candidate cap here
        // would silently hide older tickets from search once the base grows past the cap — every embedded
        // ticket needs to be a candidate for the ranking to be correct.
        var candidates = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.TicketId != null && c.Embedding != null)
            .Select(c => new { c.Content, TicketId = c.TicketId!.Value, c.Embedding })
            .ToListAsync();

        if (candidates.Count == 0) return new List<ChunkMatch>();

        var internalNoteLengths = await GetInternalNoteLengthByTicketAsync();

        // Only tickets with an internal note actually document what the problem/fix was — a bare
        // title+description match with no note gives the consultant nothing to act on, so it never
        // qualifies as a source, no matter how textually similar it looks. Relevance (similarity) picks
        // which tickets qualify; among those, the most thoroughly-documented ones are listed first so
        // the AI weighs the richest troubleshooting detail most heavily.
        var scored = candidates
            .Where(c => internalNoteLengths.ContainsKey(c.TicketId))
            .Select(c => new { c.TicketId, c.Content, Similarity = CosineSimilarity(queryEmbedding, c.Embedding!) })
            .OrderByDescending(x => x.Similarity)
            .Take(Math.Clamp(take, 1, 50))
            .OrderByDescending(x => internalNoteLengths[x.TicketId])
            .ToList();

        var ticketIds = scored.Select(s => s.TicketId).ToList();
        // Open tickets have been triaged but no work has started yet, so they never have resolution
        // notes worth surfacing as an answer — skip them (InProgress/Resolved/Closed are fair game).
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(t => ticketIds.Contains(t.Id) && t.Status != TicketStatus.Open)
            .ToDictionaryAsync(t => t.Id, t => t);

        return scored
            .Where(s => tickets.ContainsKey(s.TicketId))
            // Similarity is -1..1; expressed as a 0-100 "match score" for the same DTO shape the keyword path used.
            .Select(s => new ChunkMatch(tickets[s.TicketId], s.Content, (int)MathF.Round(Math.Clamp(s.Similarity, 0f, 1f) * 100)))
            .ToList();
    }

    /// <summary>Total internal-note character count per ticket — a proxy for how thoroughly the
    /// troubleshooting/fix was documented, used to prioritize the richest sources.</summary>
    private async Task<Dictionary<Guid, int>> GetInternalNoteLengthByTicketAsync() =>
        await _db.TicketMessages.AsNoTracking()
            .Where(m => m.Type == MessageType.InternalNote)
            .GroupBy(m => m.TicketId)
            .Select(g => new { TicketId = g.Key, Length = g.Sum(m => m.BodyHtml.Length) })
            .ToDictionaryAsync(x => x.TicketId, x => x.Length);

    private static float CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length != b.Length || a.Length == 0) return 0f;
        float dot = 0, magA = 0, magB = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        if (magA == 0 || magB == 0) return 0f;
        return dot / (MathF.Sqrt(magA) * MathF.Sqrt(magB));
    }

    private async Task<List<ChunkMatch>> FindMatchesByKeywordAsync(string query, int take)
    {
        var keywords = query.ToLowerInvariant()
            .Split(new[] { ' ', ',', '.', '?', '!' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2)
            .Distinct()
            .ToList();
        if (keywords.Count == 0) return new List<ChunkMatch>();

        var candidates = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.TicketId != null)
            .Select(c => new { c.Content, c.TicketId })
            .ToListAsync();

        if (candidates.Count == 0) return new List<ChunkMatch>();

        var internalNoteLengths = await GetInternalNoteLengthByTicketAsync();

        var scored = candidates
            .Where(c => c.TicketId.HasValue && internalNoteLengths.ContainsKey(c.TicketId.Value))
            .Select(c => new { c.TicketId, c.Content, Score = keywords.Count(k => c.Content.Contains(k, StringComparison.OrdinalIgnoreCase)) })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Take(Math.Clamp(take, 1, 50))
            .OrderByDescending(x => internalNoteLengths[x.TicketId!.Value])
            .ToList();

        if (scored.Count == 0) return new List<ChunkMatch>();

        var ticketIds = scored.Select(s => s.TicketId!.Value).ToList();
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(t => ticketIds.Contains(t.Id) && t.Status != TicketStatus.Open)
            .ToDictionaryAsync(t => t.Id, t => t);

        return scored
            .Where(s => tickets.ContainsKey(s.TicketId!.Value))
            .Select(s => new ChunkMatch(tickets[s.TicketId!.Value], s.Content, s.Score))
            .ToList();
    }

    private static KnowledgeBaseSearchResultDto ToDto(ChunkMatch m) =>
        new(m.Ticket.Id, m.Ticket.TicketNumber, m.Ticket.Title, m.Ticket.Status.ToString(), m.Ticket.ClosedAtUtc, m.Ticket.ResolutionSummary, m.Score);
}

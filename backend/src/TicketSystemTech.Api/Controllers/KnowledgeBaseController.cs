using System.Text.RegularExpressions;
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
    private const long MaxDocumentSizeBytes = 20 * 1024 * 1024; // 20 MB

    private const string SystemInstruction =
        "You are a technical support assistant for Ticket System Tech's internal helpdesk. " +
        "You may ONLY use the information given to you in the context — never your own general " +
        "knowledge, and never information about any other product or system. The context mixes two " +
        "kinds of sources: past resolved tickets, and official product documentation uploaded by the " +
        "team — both are equally valid to draw from. It is ordered with the most detailed sources " +
        "first — weigh those most heavily, but synthesize your answer from the patterns across ALL of " +
        "the sources given to you, not just the first one. If you cannot give one confident, specific " +
        "answer, say so plainly, then on a new line list the ticket numbers from the context that look " +
        "most likely to help (e.g. \"Tickets that might help: #12345, #12346\"). Keep answers short and " +
        "practical, aimed at a support agent trying to resolve a client's issue. Reply in the same " +
        "language the question was asked in.";

    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IChatCompletionService _chatCompletionService;
    private readonly IKnowledgeBaseIndexer _indexer;
    private readonly IKnowledgeBaseDocumentIndexer _documentIndexer;
    private readonly IEmbeddingService _embeddingService;

    public KnowledgeBaseController(
        AppDbContext db,
        ICurrentUserService currentUser,
        IChatCompletionService chatCompletionService,
        IKnowledgeBaseIndexer indexer,
        IKnowledgeBaseDocumentIndexer documentIndexer,
        IEmbeddingService embeddingService)
    {
        _db = db;
        _currentUser = currentUser;
        _chatCompletionService = chatCompletionService;
        _indexer = indexer;
        _documentIndexer = documentIndexer;
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
    /// Semantic search over the auto-built knowledge base (ticket descriptions + internal notes + resolutions,
    /// plus any uploaded documentation), ranked by cosine similarity between the query's embedding and each
    /// chunk's stored embedding. Falls back to plain keyword matching when no embedding provider is configured
    /// (no Google AI key) or no chunk has an embedding yet.
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<KnowledgeBaseSearchResultDto>>> Search([FromQuery] string query, [FromQuery] int take = 10)
    {
        var matches = await FindMatchesAsync(query, take);
        return Ok(matches.Select(ToDto).ToList());
    }

    /// <summary>
    /// AI chat endpoint, strictly grounded in the knowledge base: retrieves the most relevant tickets
    /// and documentation for the question and asks Gemini to answer using only that context.
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

        var context = string.Join("\n---\n", matches.Select(BuildContextEntry));

        var answer = await _chatCompletionService.AskAsync(SystemInstruction, context, request.Question);
        var finalAnswer = answer ?? "AI answering isn't configured yet — showing the closest matching sources instead.";

        // Tickets the AI explicitly called out by number (e.g. its "might help" fallback list) are the
        // ones most worth a consultant's attention — surface them first in the sources list.
        var mentionedTicketNumbers = ExtractMentionedTicketNumbers(finalAnswer);
        if (mentionedTicketNumbers.Count > 0)
            sources = sources.OrderByDescending(s => s.TicketNumber != null && mentionedTicketNumbers.Contains(s.TicketNumber)).ToList();

        return Ok(new KnowledgeBaseAskResponseDto(finalAnswer, sources));
    }

    private static string BuildContextEntry(ChunkMatch m) =>
        m.Ticket is not null
            ? $"Ticket #{m.Ticket.TicketNumber} — {m.Ticket.Title}\n{m.Content}" +
              (string.IsNullOrWhiteSpace(m.Ticket.ResolutionSummary) ? "" : $"\nResolution: {m.Ticket.ResolutionSummary}")
            : $"Documentation — {m.Document!.Title}\n{m.Content}";

    private static HashSet<string> ExtractMentionedTicketNumbers(string answer) =>
        Regex.Matches(answer, @"#(\d+)").Select(m => m.Groups[1].Value).ToHashSet();

    // ---------------- Documentation upload/management ----------------

    /// <summary>Uploads one or more documentation files (Word .docx, Excel .xls/.xlsx, PDF), extracts
    /// their text, and indexes them into the knowledge base so the AI assistant can draw on official
    /// documentation, not just ticket history. Legacy binary .doc is not supported — re-save as .docx first.</summary>
    [HttpPost("documents")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    [RequestSizeLimit(200 * 1024 * 1024)]
    public async Task<ActionResult<List<KnowledgeBaseDocumentDto>>> UploadDocuments([FromForm] List<IFormFile> files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { message = "No files were provided." });

        var results = new List<KnowledgeBaseDocumentDto>();
        var skipped = new List<string>();
        foreach (var file in files)
        {
            if (file.Length > MaxDocumentSizeBytes)
            {
                skipped.Add($"{file.FileName} (exceeds 20 MB)");
                continue;
            }

            await using var stream = file.OpenReadStream();
            var document = await _documentIndexer.IndexDocumentAsync(file.FileName, stream, _currentUser.UserId!.Value);
            if (document is null)
            {
                skipped.Add(file.FileName);
                continue;
            }

            var chunkCount = await _db.KnowledgeBaseChunks.AsNoTracking().CountAsync(c => c.DocumentId == document.Id);
            results.Add(new KnowledgeBaseDocumentDto(document.Id, document.Title, document.SourceFileName, document.FileUrl, document.CreatedAt, chunkCount));
        }

        if (results.Count == 0)
            return BadRequest(new { message = "None of the files could be indexed (unsupported type, unreadable, or too large).", skipped });

        return Ok(results);
    }

    [HttpGet("documents")]
    public async Task<ActionResult<List<KnowledgeBaseDocumentDto>>> ListDocuments()
    {
        var docs = await _db.KnowledgeBaseDocuments.AsNoTracking()
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new KnowledgeBaseDocumentDto(d.Id, d.Title, d.SourceFileName, d.FileUrl, d.CreatedAt, d.Chunks.Count))
            .ToListAsync();
        return Ok(docs);
    }

    [HttpDelete("documents/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> DeleteDocument(Guid id)
    {
        var doc = await _db.KnowledgeBaseDocuments.FindAsync(id);
        if (doc is null) return NotFound();
        _db.KnowledgeBaseDocuments.Remove(doc); // cascades to its chunks
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------------- matching ----------------

    /// <summary>A retrieved source, either a resolved ticket or a chunk of uploaded documentation — exactly one of Ticket/Document is set.</summary>
    private record ChunkMatch(Ticket? Ticket, KnowledgeBaseDocument? Document, string Content, int Score);

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
        // would silently hide older tickets/documents from search once the base grows past the cap —
        // every embedded chunk needs to be a candidate for the ranking to be correct.
        var candidates = await _db.KnowledgeBaseChunks.AsNoTracking()
            .Where(c => c.Embedding != null && (c.TicketId != null || c.DocumentId != null))
            .Select(c => new { c.Content, c.TicketId, c.DocumentId, c.Embedding })
            .ToListAsync();

        if (candidates.Count == 0) return new List<ChunkMatch>();

        var internalNoteLengths = await GetInternalNoteLengthByTicketAsync();

        // Ticket chunks only qualify with an internal note (see below); document chunks always qualify —
        // being uploaded as reference material already means it's meant to be used as an answer.
        var scored = candidates
            .Where(c => c.DocumentId != null || (c.TicketId != null && internalNoteLengths.ContainsKey(c.TicketId.Value)))
            .Select(c => new { c.TicketId, c.DocumentId, c.Content, Similarity = CosineSimilarity(queryEmbedding, c.Embedding!) })
            .OrderByDescending(x => x.Similarity)
            .Take(Math.Clamp(take, 1, 50))
            // Within the relevant pool, the most substantial source (longest content) is listed first —
            // a proxy for "most thoroughly documented" that works the same way for both source types.
            .OrderByDescending(x => x.Content.Length)
            .ToList();

        return await ResolveSourcesAsync(scored.Select(s => (s.TicketId, s.DocumentId, s.Content,
            Score: (int)MathF.Round(Math.Clamp(s.Similarity, 0f, 1f) * 100))));
    }

    /// <summary>Total internal-note character count per ticket — a proxy for how thoroughly the
    /// troubleshooting/fix was documented, used to decide which tickets qualify as a source.</summary>
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
            .Where(c => c.TicketId != null || c.DocumentId != null)
            .Select(c => new { c.Content, c.TicketId, c.DocumentId })
            .ToListAsync();

        if (candidates.Count == 0) return new List<ChunkMatch>();

        var internalNoteLengths = await GetInternalNoteLengthByTicketAsync();

        var scored = candidates
            .Where(c => c.DocumentId != null || (c.TicketId != null && internalNoteLengths.ContainsKey(c.TicketId.Value)))
            .Select(c => new { c.TicketId, c.DocumentId, c.Content, Score = keywords.Count(k => c.Content.Contains(k, StringComparison.OrdinalIgnoreCase)) })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Take(Math.Clamp(take, 1, 50))
            .OrderByDescending(x => x.Content.Length)
            .ToList();

        return await ResolveSourcesAsync(scored.Select(s => (s.TicketId, s.DocumentId, s.Content, s.Score)));
    }

    /// <summary>Loads the actual Ticket/KnowledgeBaseDocument rows for a scored candidate list, dropping
    /// any ticket that turns out to be Open (untriaged tickets never have resolution content worth
    /// surfacing) and preserving the candidates' incoming order.</summary>
    private async Task<List<ChunkMatch>> ResolveSourcesAsync(IEnumerable<(Guid? TicketId, Guid? DocumentId, string Content, int Score)> scored)
    {
        var list = scored.ToList();
        var ticketIds = list.Where(s => s.TicketId != null).Select(s => s.TicketId!.Value).Distinct().ToList();
        var documentIds = list.Where(s => s.DocumentId != null).Select(s => s.DocumentId!.Value).Distinct().ToList();

        var tickets = await _db.Tickets.AsNoTracking()
            .Where(t => ticketIds.Contains(t.Id) && t.Status != TicketStatus.Open)
            .ToDictionaryAsync(t => t.Id, t => t);
        var documents = await _db.KnowledgeBaseDocuments.AsNoTracking()
            .Where(d => documentIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d);

        var results = new List<ChunkMatch>();
        foreach (var s in list)
        {
            if (s.TicketId is { } ticketId && tickets.TryGetValue(ticketId, out var ticket))
                results.Add(new ChunkMatch(ticket, null, s.Content, s.Score));
            else if (s.DocumentId is { } documentId && documents.TryGetValue(documentId, out var document))
                results.Add(new ChunkMatch(null, document, s.Content, s.Score));
        }
        return results;
    }

    private static KnowledgeBaseSearchResultDto ToDto(ChunkMatch m) =>
        m.Ticket is not null
            ? new KnowledgeBaseSearchResultDto("Ticket", m.Ticket.Id, m.Ticket.TicketNumber, m.Ticket.Status.ToString(),
                m.Ticket.ClosedAtUtc, m.Ticket.ResolutionSummary, null, null, m.Ticket.Title, m.Score)
            : new KnowledgeBaseSearchResultDto("Document", null, null, null,
                null, null, m.Document!.Id, m.Document!.FileUrl, m.Document!.Title, m.Score);
}

using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Application.Common.Options;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Infrastructure.Services;

public class GraphEmailIntegrationService : IEmailIntegrationService
{
    private const string TokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    private const string GraphBase = "https://graph.microsoft.com/v1.0";
    private const string Scopes = "offline_access Mail.Read User.Read";

    private readonly AppDbContext _db;
    private readonly HttpClient _http;
    private readonly IFileStorage _fileStorage;
    private readonly MicrosoftGraphOptions _options;
    private readonly ILogger<GraphEmailIntegrationService> _logger;

    public GraphEmailIntegrationService(
        AppDbContext db, HttpClient http, IFileStorage fileStorage,
        IOptions<MicrosoftGraphOptions> options, ILogger<GraphEmailIntegrationService> logger)
    {
        _db = db;
        _http = http;
        _fileStorage = fileStorage;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<EmailConnectionStatus> GetStatusAsync(Guid userId, CancellationToken ct = default)
    {
        var conn = await _db.EmailConnections.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId, ct);
        return new EmailConnectionStatus(conn is not null, conn?.ConnectedEmail);
    }

    public async Task<EmailConnectionStatus> ConnectAsync(Guid userId, string code, string redirectUri, CancellationToken ct = default)
    {
        var form = new Dictionary<string, string>
        {
            ["client_id"] = _options.ClientId,
            ["client_secret"] = _options.ClientSecret,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["grant_type"] = "authorization_code",
            ["scope"] = Scopes,
        };

        var tokenResponse = await PostFormAsync(TokenEndpoint, form, ct);

        var accessToken = tokenResponse.GetProperty("access_token").GetString()!;
        var refreshToken = tokenResponse.GetProperty("refresh_token").GetString()!;
        var expiresIn = tokenResponse.GetProperty("expires_in").GetInt32();

        var request = new HttpRequestMessage(HttpMethod.Get, $"{GraphBase}/me?$select=mail,userPrincipalName");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var meResponse = await _http.SendAsync(request, ct);
        meResponse.EnsureSuccessStatusCode();
        using var meDoc = JsonDocument.Parse(await meResponse.Content.ReadAsStreamAsync(ct));
        var mail = meDoc.RootElement.TryGetProperty("mail", out var m) && m.ValueKind == JsonValueKind.String
            ? m.GetString()
            : meDoc.RootElement.GetProperty("userPrincipalName").GetString();

        var conn = await _db.EmailConnections.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (conn is null)
        {
            conn = new EmailConnection { UserId = userId };
            _db.EmailConnections.Add(conn);
        }
        conn.Provider = "Outlook";
        conn.ConnectedEmail = mail ?? "";
        conn.AccessToken = accessToken;
        conn.RefreshToken = refreshToken;
        conn.AccessTokenExpiresAtUtc = DateTime.UtcNow.AddSeconds(expiresIn);
        conn.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return new EmailConnectionStatus(true, conn.ConnectedEmail);
    }

    public async Task DisconnectAsync(Guid userId, CancellationToken ct = default)
    {
        var conn = await _db.EmailConnections.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (conn is not null)
        {
            _db.EmailConnections.Remove(conn);
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task<List<InboxMessageSummary>> ListInboxAsync(Guid userId, int take, CancellationToken ct = default)
    {
        var conn = await GetValidConnectionAsync(userId, ct);
        var url = $"{GraphBase}/me/mailFolders/inbox/messages?$top={Math.Clamp(take, 1, 100)}" +
                  "&$select=id,subject,from,bodyPreview,receivedDateTime,hasAttachments&$orderby=receivedDateTime desc";
        var doc = await GetGraphAsync(conn, url, ct);

        var marks = await _db.EmailTicketMarks.AsNoTracking().Where(m => m.UserId == userId).ToDictionaryAsync(m => m.MessageId, ct);

        var results = new List<InboxMessageSummary>();
        foreach (var item in doc.RootElement.GetProperty("value").EnumerateArray())
        {
            var id = item.GetProperty("id").GetString()!;
            var from = item.TryGetProperty("from", out var f) && f.ValueKind == JsonValueKind.Object
                ? f.GetProperty("emailAddress") : (JsonElement?)null;
            marks.TryGetValue(id, out var mark);

            results.Add(new InboxMessageSummary(
                id,
                item.GetProperty("subject").GetString() ?? "(no subject)",
                from?.GetProperty("address").GetString() ?? "",
                from?.TryGetProperty("name", out var n) == true ? n.GetString() ?? "" : "",
                item.GetProperty("bodyPreview").GetString() ?? "",
                item.GetProperty("receivedDateTime").GetDateTime(),
                item.GetProperty("hasAttachments").GetBoolean(),
                mark?.IsMarked ?? false,
                mark?.ConvertedTicketId
            ));
        }
        return results;
    }

    public async Task<InboxMessageDetail> GetMessageAsync(Guid userId, string messageId, CancellationToken ct = default)
    {
        var conn = await GetValidConnectionAsync(userId, ct);
        var url = $"{GraphBase}/me/messages/{Uri.EscapeDataString(messageId)}?$select=subject,from,body,receivedDateTime,hasAttachments";
        var doc = await GetGraphAsync(conn, url, ct);
        var root = doc.RootElement;

        var from = root.TryGetProperty("from", out var f) && f.ValueKind == JsonValueKind.Object
            ? f.GetProperty("emailAddress") : (JsonElement?)null;
        var bodyHtml = root.GetProperty("body").GetProperty("content").GetString() ?? "";

        var attachments = new List<InboxAttachmentSummary>();
        if (root.GetProperty("hasAttachments").GetBoolean())
        {
            var attUrl = $"{GraphBase}/me/messages/{Uri.EscapeDataString(messageId)}/attachments?$select=id,name,contentType,size";
            var attDoc = await GetGraphAsync(conn, attUrl, ct);
            foreach (var a in attDoc.RootElement.GetProperty("value").EnumerateArray())
            {
                attachments.Add(new InboxAttachmentSummary(
                    a.GetProperty("id").GetString()!,
                    a.GetProperty("name").GetString() ?? "attachment",
                    a.TryGetProperty("contentType", out var ct2) ? ct2.GetString() ?? "application/octet-stream" : "application/octet-stream",
                    a.TryGetProperty("size", out var sz) ? sz.GetInt64() : 0
                ));
            }
        }

        return new InboxMessageDetail(
            messageId,
            root.GetProperty("subject").GetString() ?? "(no subject)",
            from?.GetProperty("address").GetString() ?? "",
            from?.TryGetProperty("name", out var n2) == true ? n2.GetString() ?? "" : "",
            bodyHtml,
            root.GetProperty("receivedDateTime").GetDateTime(),
            attachments
        );
    }

    public async Task<bool> SetMarkedAsync(Guid userId, string messageId, bool marked, CancellationToken ct = default)
    {
        var mark = await _db.EmailTicketMarks.FirstOrDefaultAsync(m => m.UserId == userId && m.MessageId == messageId, ct);
        if (mark is null)
        {
            mark = new EmailTicketMark { UserId = userId, MessageId = messageId };
            _db.EmailTicketMarks.Add(mark);
        }
        mark.IsMarked = marked;
        await _db.SaveChangesAsync(ct);
        return marked;
    }

    public async Task MarkConvertedAsync(Guid userId, string messageId, Guid ticketId, CancellationToken ct = default)
    {
        var mark = await _db.EmailTicketMarks.FirstOrDefaultAsync(m => m.UserId == userId && m.MessageId == messageId, ct);
        if (mark is null)
        {
            mark = new EmailTicketMark { UserId = userId, MessageId = messageId };
            _db.EmailTicketMarks.Add(mark);
        }
        mark.IsMarked = true;
        mark.ConvertedTicketId = ticketId;
        await _db.SaveChangesAsync(ct);
    }

    public async Task ImportAttachmentsToTicketAsync(Guid userId, string messageId, Guid ticketId, CancellationToken ct = default)
    {
        var conn = await GetValidConnectionAsync(userId, ct);
        var url = $"{GraphBase}/me/messages/{Uri.EscapeDataString(messageId)}/attachments";
        var doc = await GetGraphAsync(conn, url, ct);

        foreach (var a in doc.RootElement.GetProperty("value").EnumerateArray())
        {
            if (!a.TryGetProperty("contentBytes", out var contentBytesProp)) continue; // skip non-file (e.g. item) attachments

            var name = a.GetProperty("name").GetString() ?? "attachment";
            var contentType = a.TryGetProperty("contentType", out var ct2) ? ct2.GetString() ?? "application/octet-stream" : "application/octet-stream";
            var bytes = Convert.FromBase64String(contentBytesProp.GetString()!);

            using var stream = new MemoryStream(bytes);
            var fileUrl = await _fileStorage.SaveAsync(name, contentType, stream, ct);

            _db.TicketAttachments.Add(new TicketAttachment
            {
                TicketId = ticketId,
                FileName = name,
                FileUrl = fileUrl,
                FileSizeBytes = bytes.Length,
                ContentType = contentType,
                UploadedByUserId = userId
            });
        }
        await _db.SaveChangesAsync(ct);
    }

    // ---------------- helpers ----------------

    private async Task<EmailConnection> GetValidConnectionAsync(Guid userId, CancellationToken ct)
    {
        var conn = await _db.EmailConnections.FirstOrDefaultAsync(c => c.UserId == userId, ct)
            ?? throw new InvalidOperationException("No mailbox connected for this user.");

        if (conn.AccessTokenExpiresAtUtc <= DateTime.UtcNow.AddMinutes(1))
        {
            var form = new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["refresh_token"] = conn.RefreshToken,
                ["grant_type"] = "refresh_token",
                ["scope"] = Scopes,
            };
            var tokenResponse = await PostFormAsync(TokenEndpoint, form, ct);
            conn.AccessToken = tokenResponse.GetProperty("access_token").GetString()!;
            if (tokenResponse.TryGetProperty("refresh_token", out var rt))
                conn.RefreshToken = rt.GetString()!;
            conn.AccessTokenExpiresAtUtc = DateTime.UtcNow.AddSeconds(tokenResponse.GetProperty("expires_in").GetInt32());
            conn.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }

        return conn;
    }

    private async Task<JsonDocument> GetGraphAsync(EmailConnection conn, string url, CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", conn.AccessToken);
        var response = await _http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("Microsoft Graph request failed ({Status}): {Body}", response.StatusCode, body);
            response.EnsureSuccessStatusCode();
        }
        return JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
    }

    private async Task<JsonElement> PostFormAsync(string url, Dictionary<string, string> form, CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = new FormUrlEncodedContent(form) };
        var response = await _http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Microsoft token endpoint request failed ({Status}): {Body}", response.StatusCode, body);
            response.EnsureSuccessStatusCode();
        }
        return JsonDocument.Parse(body).RootElement.Clone();
    }
}

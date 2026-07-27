namespace TicketSystemTech.Application.Common.Interfaces;

public record EmailConnectionStatus(bool Connected, string? ConnectedEmail);

public record InboxMessageSummary(
    string MessageId, string Subject, string FromEmail, string FromName,
    string BodyPreview, DateTime ReceivedAtUtc, bool HasAttachments,
    bool IsMarked, Guid? ConvertedTicketId);

public record InboxAttachmentSummary(string AttachmentId, string FileName, string ContentType, long SizeBytes);

public record InboxMessageDetail(
    string MessageId, string Subject, string FromEmail, string FromName,
    string BodyHtml, DateTime ReceivedAtUtc, List<InboxAttachmentSummary> Attachments);

public interface IEmailIntegrationService
{
    Task<EmailConnectionStatus> GetStatusAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Exchanges an OAuth authorization code for tokens and stores the connection for this user.</summary>
    Task<EmailConnectionStatus> ConnectAsync(Guid userId, string code, string redirectUri, CancellationToken ct = default);

    Task DisconnectAsync(Guid userId, CancellationToken ct = default);

    Task<List<InboxMessageSummary>> ListInboxAsync(Guid userId, int take, CancellationToken ct = default);

    Task<InboxMessageDetail> GetMessageAsync(Guid userId, string messageId, CancellationToken ct = default);

    Task<bool> SetMarkedAsync(Guid userId, string messageId, bool marked, CancellationToken ct = default);

    /// <summary>Downloads the message's attachments from the mailbox and saves them as attachments on the given ticket.</summary>
    Task ImportAttachmentsToTicketAsync(Guid userId, string messageId, Guid ticketId, CancellationToken ct = default);

    Task MarkConvertedAsync(Guid userId, string messageId, Guid ticketId, CancellationToken ct = default);
}
